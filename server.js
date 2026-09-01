const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const Database = require('better-sqlite3');
const { version: APP_VERSION } = require('./package.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_PERSIST_INTERVAL_MS = 60 * 1000;

function getDbPath() {
  if (process.env.USERS_DB || process.env.DATABASE_PATH) {
    return process.env.USERS_DB || process.env.DATABASE_PATH;
  }
  if (process.env.RENDER) {
    return '/data/users.sqlite';
  }
  return path.join(__dirname, 'users.sqlite');
}

let db = null;

// Lazily (re)opens, resolving the path each time, so a test file that calls
// closeDatabase() and repoints USERS_DB can't break later files sharing this
// cached module.
function getDb() {
  if (!db || !db.open) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
    db = Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        code TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        producerToken TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0,
        requireName INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        timer INTEGER NOT NULL DEFAULT 0,
        timerStartedAt INTEGER,
        features TEXT NOT NULL DEFAULT '{}',
        createdAt INTEGER NOT NULL,
        lastActivityAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      );
    `);
    console.log(`Database initialized at ${dbPath}`);
  }
  return db;
}

function closeDatabase() {
  if (db && db.open) {
    db.close();
  }
}

function getUser(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function getAllUsers() {
  return getDb().prepare('SELECT userId, email, createdAt FROM users ORDER BY createdAt DESC').all();
}

function createUser(email, passwordHash) {
  const userId = crypto.randomBytes(16).toString('hex');
  const emailLower = email.toLowerCase().trim();
  const createdAt = Date.now();
  getDb().prepare('INSERT INTO users (userId, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
    .run(userId, emailLower, passwordHash, createdAt);
  return { userId, email: emailLower, createdAt };
}

function deleteUser(userId) {
  return getDb().prepare('DELETE FROM users WHERE userId = ?').run(userId).changes > 0;
}

function getUserCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM users').get().count;
}

const sessions = new Map();

const DEFAULT_FEATURES = {
  screenshotEnabled: false,
  messagesEnabled: false,
  speakerNotesEnabled: false,
  laserPointerEnabled: false,
  voiceControlEnabled: false,
  cueBeepsEnabled: false
};

function persistSession(s) {
  getDb().prepare(`
    INSERT INTO sessions (code, userId, producerToken, locked, requireName, notes, timer, timerStartedAt, features, createdAt, lastActivityAt)
    VALUES (@code, @userId, @producerToken, @locked, @requireName, @notes, @timer, @timerStartedAt, @features, @createdAt, @lastActivityAt)
    ON CONFLICT(code) DO UPDATE SET
      locked = @locked, requireName = @requireName, notes = @notes,
      timer = @timer, timerStartedAt = @timerStartedAt, features = @features,
      lastActivityAt = @lastActivityAt
  `).run({
    code: s.code,
    userId: s.userId,
    producerToken: s.producerToken,
    locked: s.locked ? 1 : 0,
    requireName: s.requireName ? 1 : 0,
    notes: s.notes,
    timer: s.timer,
    timerStartedAt: s.timerStartedAt,
    features: JSON.stringify(s.features),
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt
  });
  s.lastPersistedAt = Date.now();
}

// Records activity in memory; writes through to the DB at most once a minute
// so rapid clicking doesn't hammer SQLite.
function touchSession(s) {
  s.lastActivityAt = Date.now();
  if (s.lastActivityAt - (s.lastPersistedAt || 0) > ACTIVITY_PERSIST_INTERVAL_MS) {
    persistSession(s);
  }
}

// Single source of truth for new sessions, shared by the socket handler and
// the HTTP API so both produce identical, persistable records.
function createSessionRecord(userId, producerSocketId = null) {
  const now = Date.now();
  const session = {
    code: generateCode(),
    locked: false,
    requireName: true,
    notes: '',
    timer: 0,
    timerStartedAt: null,
    producer: producerSocketId,
    producerToken: generateToken(),
    userId,
    clickers: new Map(),
    showClients: new Map(),
    presenters: new Map(),
    features: { ...DEFAULT_FEATURES },
    screenshot: null,
    lastScreenshotTime: null,
    createdAt: now,
    lastActivityAt: now
  };
  sessions.set(session.code, session);
  persistSession(session);
  return session;
}

function sessionSummary(s) {
  return {
    code: s.code,
    locked: s.locked,
    requireName: s.requireName,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    presenterCount: s.presenters.size,
    producerConnected: !!s.producer
  };
}

// --- Session operations -----------------------------------------------
// Shared by the socket handlers and the HTTP API so both surfaces behave
// identically and emit the same events to connected clients.

function opSetLock(session, locked) {
  session.locked = !!locked;
  persistSession(session);
  io.to(session.code).emit('lock-changed', { locked: session.locked });
  console.log(`Session ${session.code} lock changed:`, session.locked);
}

function opSetNotes(session, notes) {
  session.notes = String(notes ?? '');
  persistSession(session);
  io.to(session.code).emit('notes-changed', { notes: session.notes });
}

function opSetTimer(session, minutes) {
  session.timer = Math.max(0, Number(minutes) || 0) * 60;
  session.timerStartedAt = Date.now();
  persistSession(session);
  io.to(session.code).emit('timer-changed', {
    timer: session.timer,
    timerStartedAt: session.timerStartedAt
  });
  console.log(`Session ${session.code} timer set to ${minutes} minutes`);
}

function opResetTimer(session) {
  session.timerStartedAt = Date.now();
  persistSession(session);
  io.to(session.code).emit('timer-changed', {
    timer: session.timer,
    timerStartedAt: session.timerStartedAt
  });
}

function opSetRequireName(session, requireName) {
  session.requireName = !!requireName;
  persistSession(session);
}

function opSetFeatures(session, features) {
  session.features = { ...session.features, ...features };
  persistSession(session);
  io.to(session.code).emit('features-changed', { features: session.features });
  console.log(`Session ${session.code}: features updated`, features);
}

// Returns false when the presenter is not connected.
function opSetPresenterAccess(session, presenterId, enabled) {
  const presenter = session.presenters.get(presenterId);
  if (!presenter) return false;

  presenter.clickAccessEnabled = !!enabled;
  io.to(presenterId).emit('click-access-changed', { clickAccessEnabled: presenter.clickAccessEnabled });
  notifyPresentersUpdated(session);
  console.log(`Session ${session.code}: ${presenter.displayName} click access ${enabled ? 'enabled' : 'disabled'}`);
  return true;
}

function opPromptName(session) {
  let prompted = 0;
  for (const [presenterId, presenter] of session.presenters.entries()) {
    if (presenter.isAnonymous) {
      io.to(presenterId).emit('name-prompt');
      prompted += 1;
    }
  }
  console.log(`Session ${session.code}: name prompt sent to ${prompted} anonymous presenter(s)`);
  return prompted;
}

// Returns the number of presenters the message reached.
function opSendMessage(session, targetId, message) {
  const messageData = { message, timestamp: Date.now(), from: 'Producer' };
  let delivered = 0;

  if (targetId === 'all' || !targetId) {
    for (const clickerId of session.clickers.keys()) {
      io.to(clickerId).emit('message-received', messageData);
      delivered += 1;
    }
  } else if (session.clickers.has(targetId)) {
    io.to(targetId).emit('message-received', messageData);
    delivered = 1;
  }

  console.log(`Session ${session.code}: message delivered to ${delivered} presenter(s)`);
  return delivered;
}

function opAdvance(session, direction) {
  touchSession(session);
  io.to(session.code).emit('advance', { direction });
  console.log(`Session ${session.code}: ${direction}`);
}

function endSession(code, reason) {
  sessions.delete(code);
  getDb().prepare('DELETE FROM sessions WHERE code = ?').run(code);
  io.to(code).emit('session-ended');
  console.log(`Session ${code} ended${reason ? ` (${reason})` : ''}`);
}

// Restores persisted sessions into memory (producer offline, no participants).
// Called at startup so sessions survive server restarts.
function loadPersistedSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  getDb().prepare('DELETE FROM sessions WHERE lastActivityAt < ?').run(cutoff);

  for (const row of getDb().prepare('SELECT * FROM sessions').all()) {
    if (sessions.has(row.code)) continue;
    sessions.set(row.code, {
      code: row.code,
      locked: !!row.locked,
      requireName: !!row.requireName,
      notes: row.notes,
      timer: row.timer,
      timerStartedAt: row.timerStartedAt,
      producer: null,
      producerToken: row.producerToken,
      userId: row.userId,
      clickers: new Map(),
      showClients: new Map(),
      presenters: new Map(),
      features: { ...DEFAULT_FEATURES, ...JSON.parse(row.features) },
      screenshot: null,
      lastScreenshotTime: null,
      createdAt: row.createdAt,
      lastActivityAt: row.lastActivityAt,
      lastPersistedAt: Date.now()
    });
  }
  if (sessions.size > 0) {
    console.log(`Restored ${sessions.size} session(s) from database`);
  }
}

const ttlSweep = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [code, s] of sessions.entries()) {
    if (s.lastActivityAt < cutoff) {
      endSession(code, 'expired after 24h of inactivity');
    }
  }
  getDb().prepare('DELETE FROM sessions WHERE lastActivityAt < ?').run(cutoff);
  getDb().prepare('DELETE FROM login_sessions WHERE expiresAt < ?').run(Date.now());
}, 60 * 60 * 1000);
ttlSweep.unref();

function generateCode() {
  // Generate 6 bytes to ensure at least 6 chars after stripping +/=
  return crypto.randomBytes(6).toString('base64')
    .replace(/[+/=]/g, '')
    .substring(0, 6)
    .toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// SQLite-backed store so logins survive server restarts (the default
// MemoryStore is wiped with the process). Requires SESSION_SECRET to be set
// for cookies to stay valid across restarts.
class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = getDb().prepare('SELECT data FROM login_sessions WHERE sid = ? AND expiresAt > ?').get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expiresAt = sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
      getDb().prepare(`
        INSERT INTO login_sessions (sid, data, expiresAt) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expiresAt = excluded.expiresAt
      `).run(sid, JSON.stringify(sess), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      getDb().prepare('DELETE FROM login_sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback) {
    this.set(sid, sess, callback);
  }
}

const sessionMiddleware = session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});

app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

io.engine.use(sessionMiddleware);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/superadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

async function handleSignup(req, res, { setLoginSession }) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailLower = email.toLowerCase().trim();
    if (getUser(emailLower)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = createUser(emailLower, passwordHash);

    if (setLoginSession) {
      req.session.userId = user.userId;
      req.session.email = user.email;
      res.json({ success: true, email: user.email });
    } else {
      res.json({ success: true, userId: user.userId, email: user.email });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

app.post('/api/signup', (req, res) => handleSignup(req, res, { setLoginSession: true }));

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = getUser(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.userId;
    req.session.email = user.email;
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId && req.session.email) {
    res.json({ authenticated: true, email: req.session.email, userId: req.session.userId });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/superadmin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const superadminUser = process.env.SUPERADMIN_USER || 'admin';
  const superadminPassword = process.env.SUPERADMIN_PASSWORD;

  if (!superadminPassword) {
    console.error('SUPERADMIN_PASSWORD not set in environment');
    return res.status(500).json({ error: 'Superadmin not configured' });
  }
  if (username !== superadminUser || password !== superadminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.superadmin = true;
  res.json({ success: true });
});

function requireSuperadmin(req, res, next) {
  if (!req.session.superadmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/superadmin/users', requireSuperadmin, (req, res) => {
  try {
    res.json({ users: getAllUsers() });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/superadmin/users', requireSuperadmin, (req, res) => handleSignup(req, res, { setLoginSession: false }));

app.delete('/api/superadmin/users/:userId', requireSuperadmin, (req, res) => {
  try {
    if (!deleteUser(req.params.userId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/superadmin/logout', (req, res) => {
  req.session.superadmin = false;
  res.json({ success: true });
});

// Lets the web pages stamp which build they are running.
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

app.get('/api/session/:code', (req, res) => {
  const session = sessions.get(req.params.code.toUpperCase());
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ code: session.code, requireName: session.requireName, locked: session.locked });
});

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Resolves :code to a session the caller owns, or sends the error response.
function ownedSession(req, res) {
  const session = sessions.get(req.params.code.toUpperCase());
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (session.userId !== req.session.userId) {
    res.status(403).json({ error: 'Unauthorized: You did not create this session' });
    return null;
  }
  return session;
}

app.get('/api/my-sessions', requireAuth, (req, res) => {
  const mine = [];
  for (const s of sessions.values()) {
    if (s.userId === req.session.userId) {
      mine.push(sessionSummary(s));
    }
  }
  mine.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  res.json({ sessions: mine });
});

app.post('/api/sessions', requireAuth, (req, res) => {
  const session = createSessionRecord(req.session.userId);
  const base = `${req.protocol}://${req.get('host')}`;
  console.log('Session created via API:', session.code, 'by user:', req.session.userId);
  res.status(201).json({
    ...sessionSummary(session),
    producerToken: session.producerToken,
    presenterUrl: `${base}/clicker.html?code=${session.code}`,
    cueUrl: `${base}/show.html?code=${session.code}`,
    producerUrl: `${base}/producer.html?code=${session.code}`
  });
});

app.get('/api/sessions/:code', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  res.json(sessionSummary(session));
});

// Full session detail for the owner, including live participant state.
app.get('/api/sessions/:code/detail', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  res.json({
    ...sessionSummary(session),
    notes: session.notes,
    timer: session.timer,
    timerStartedAt: session.timerStartedAt,
    features: session.features,
    presenters: presenterList(session),
    showClientCount: session.showClients.size
  });
});

// Update any combination of session settings.
app.patch('/api/sessions/:code', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const { locked, notes, requireName, features, timerMinutes, resetTimer } = req.body || {};

  if (locked !== undefined) opSetLock(session, locked);
  if (notes !== undefined) opSetNotes(session, notes);
  if (requireName !== undefined) opSetRequireName(session, requireName);
  if (features !== undefined) {
    if (typeof features !== 'object' || features === null) {
      return res.status(400).json({ error: 'features must be an object' });
    }
    opSetFeatures(session, features);
  }
  if (timerMinutes !== undefined) {
    if (Number.isNaN(Number(timerMinutes))) {
      return res.status(400).json({ error: 'timerMinutes must be a number' });
    }
    opSetTimer(session, timerMinutes);
  }
  if (resetTimer) opResetTimer(session);

  res.json({
    ...sessionSummary(session),
    notes: session.notes,
    timer: session.timer,
    timerStartedAt: session.timerStartedAt,
    features: session.features
  });
});

// Advance the deck. The owner drives the session, so this is not blocked by
// the clicker lock, which exists to hold back presenters.
app.post('/api/sessions/:code/advance', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const direction = (req.body && req.body.direction) || 'next';
  if (direction !== 'next' && direction !== 'prev') {
    return res.status(400).json({ error: "direction must be 'next' or 'prev'" });
  }

  opAdvance(session, direction);
  res.json({ success: true, direction });
});

app.get('/api/sessions/:code/presenters', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  res.json({ presenters: presenterList(session) });
});

app.patch('/api/sessions/:code/presenters/:presenterId', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const { clickAccessEnabled } = req.body || {};
  if (clickAccessEnabled === undefined) {
    return res.status(400).json({ error: 'clickAccessEnabled is required' });
  }
  if (!opSetPresenterAccess(session, req.params.presenterId, clickAccessEnabled)) {
    return res.status(404).json({ error: 'Presenter not found' });
  }

  res.json({ presenters: presenterList(session) });
});

// Ask any presenter who joined anonymously to enter a name.
app.post('/api/sessions/:code/prompt-name', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  res.json({ success: true, prompted: opPromptName(session) });
});

// Speaker Chat: send a message to one presenter or all of them.
app.post('/api/sessions/:code/message', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;

  const { message, targetId } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!session.features.messagesEnabled) {
    return res.status(409).json({ error: 'Speaker Chat is disabled for this session' });
  }

  res.json({ success: true, delivered: opSendMessage(session, targetId, message) });
});

app.delete('/api/sessions/:code', requireAuth, (req, res) => {
  const session = ownedSession(req, res);
  if (!session) return;
  endSession(session.code, 'ended by producer');
  res.json({ success: true });
});

function presenterList(session) {
  return Array.from(session.presenters.entries()).map(([id, data]) => ({
    id,
    displayName: data.displayName,
    clickAccessEnabled: data.clickAccessEnabled,
    isAnonymous: data.isAnonymous
  }));
}

function notifyPresentersUpdated(session) {
  io.to(session.producer).emit('presenters-updated', { presenters: presenterList(session) });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  function fail(message) {
    socket.emit('error', { message });
    return null;
  }

  function getSession(code) {
    return sessions.get(code) || fail('Session not found');
  }

  // Returns the session only if this socket is its producer with a valid token.
  function producerSession(code, token) {
    const session = getSession(code);
    if (!session) return null;
    if (session.producer !== socket.id || session.producerToken !== token) {
      return fail('Unauthorized: Invalid producer token');
    }
    return session;
  }

  socket.on('create-session', () => {
    const userId = socket.request.session?.userId;
    if (!userId) {
      return fail('Authentication required to create session');
    }

    const session = createSessionRecord(userId, socket.id);
    socket.join(session.code);
    socket.emit('session-created', {
      code: session.code,
      token: session.producerToken,
      requireName: session.requireName,
      features: session.features
    });
    console.log('Session created:', session.code, 'by user:', userId);
  });

  socket.on('join-session', ({ code, role, displayName }) => {
    const session = getSession(code);
    if (!session) return;

    const token = generateToken();
    socket.join(code);

    if (role === 'clicker') {
      if (session.requireName && (!displayName || displayName.trim() === '')) {
        return fail('Display name is required');
      }

      session.clickers.set(socket.id, token);
      session.presenters.set(socket.id, {
        token,
        displayName: displayName ? displayName.trim() : 'Anonymous',
        clickAccessEnabled: true,
        isAnonymous: !displayName || displayName.trim() === ''
      });

      socket.emit('session-joined', {
        code,
        token,
        locked: session.locked,
        notes: session.notes,
        timer: session.timer,
        timerStartedAt: session.timerStartedAt,
        clickAccessEnabled: true,
        requireName: session.requireName,
        features: session.features,
        screenshot: session.screenshot
      });

      notifyPresentersUpdated(session);
    } else if (role === 'show-client') {
      session.showClients.set(socket.id, token);
      socket.emit('session-joined', { code, token, features: session.features });
    }

    console.log(`Client ${socket.id} joined session ${code} as ${role}${displayName ? ` (${displayName})` : ' (anonymous)'}`);
  });

  socket.on('reclaim-producer', ({ code }) => {
    const session = getSession(code);
    if (!session) return;

    const userId = socket.request.session?.userId;
    if (!userId) {
      return fail('Authentication required to reclaim session');
    }
    if (session.userId !== userId) {
      return fail('Unauthorized: You did not create this session');
    }

    session.producer = socket.id;
    socket.join(code);
    touchSession(session);

    socket.emit('producer-reclaimed', {
      code: session.code,
      token: session.producerToken,
      locked: session.locked,
      requireName: session.requireName,
      features: session.features,
      notes: session.notes,
      timer: session.timer,
      timerStartedAt: session.timerStartedAt,
      presenters: presenterList(session)
    });

    console.log(`Producer reclaimed session ${code} by user ${userId}`);
  });

  socket.on('set-lock', ({ code, token, locked }) => {
    const session = producerSession(code, token);
    if (session) opSetLock(session, locked);
  });

  socket.on('set-notes', ({ code, token, notes }) => {
    const session = producerSession(code, token);
    if (session) opSetNotes(session, notes);
  });

  socket.on('set-timer', ({ code, token, minutes }) => {
    const session = producerSession(code, token);
    if (session) opSetTimer(session, minutes);
  });

  socket.on('reset-timer', ({ code, token }) => {
    const session = producerSession(code, token);
    if (session) opResetTimer(session);
  });

  function handleAdvance(direction, { code, token }) {
    const session = getSession(code);
    if (!session) return;

    const isClicker = session.clickers.get(socket.id) === token;
    const isShowClient = session.showClients.get(socket.id) === token;
    if (!isClicker && !isShowClient) {
      return fail('Unauthorized: Invalid clicker token');
    }
    if (session.locked) {
      return fail('Session is locked');
    }
    if (isClicker) {
      const presenter = session.presenters.get(socket.id);
      if (presenter && !presenter.clickAccessEnabled) {
        return fail('Your click access is suspended');
      }
    }
    opAdvance(session, direction);
  }

  socket.on('next', (payload) => handleAdvance('next', payload));
  socket.on('prev', (payload) => handleAdvance('prev', payload));

  socket.on('toggle-presenter-access', ({ code, token, presenterId, enabled }) => {
    const session = producerSession(code, token);
    if (!session) return;

    if (!opSetPresenterAccess(session, presenterId, enabled)) {
      return fail('Presenter not found');
    }
  });

  socket.on('set-require-name', ({ code, token, requireName }) => {
    const session = producerSession(code, token);
    if (!session) return;
    opSetRequireName(session, requireName);
    socket.emit('require-name-updated', { requireName: session.requireName });
  });

  socket.on('prompt-name', ({ code, token }) => {
    const session = producerSession(code, token);
    if (!session) return;

    opPromptName(session);
  });

  socket.on('set-display-name', ({ code, token, displayName }) => {
    const session = getSession(code);
    if (!session) return;

    if (session.clickers.get(socket.id) !== token) {
      return fail('Unauthorized: Invalid clicker token');
    }
    if (!displayName || displayName.trim() === '') {
      return fail('Display name cannot be empty');
    }

    const presenter = session.presenters.get(socket.id);
    if (!presenter) {
      return fail('Presenter not found');
    }

    presenter.displayName = displayName.trim();
    presenter.isAnonymous = false;

    socket.emit('display-name-updated', { displayName: presenter.displayName });
    notifyPresentersUpdated(session);

    console.log(`Session ${code}: ${socket.id} changed name to ${presenter.displayName}`);
  });

  socket.on('set-features', ({ code, token, features }) => {
    const session = producerSession(code, token);
    if (!session) return;
    opSetFeatures(session, features);
  });

  socket.on('screenshot-upload', ({ code, token, screenshot }) => {
    const session = getSession(code);
    if (!session) return;

    if (session.showClients.get(socket.id) !== token) {
      return fail('Unauthorized: Invalid show client token');
    }

    if (session.features.screenshotEnabled) {
      session.screenshot = screenshot;
      session.lastScreenshotTime = Date.now();
      for (const clickerId of session.clickers.keys()) {
        io.to(clickerId).emit('screenshot-updated', { screenshot });
      }
    }
  });

  // Speaker notes pushed from the show machine (read out of PowerPoint or
  // Keynote) into the same notes channel the presenters already display.
  socket.on('set-show-notes', ({ code, token, notes }) => {
    const session = getSession(code);
    if (!session) return;

    if (session.showClients.get(socket.id) !== token) {
      return fail('Unauthorized: Invalid show client token');
    }
    if (!session.features.speakerNotesEnabled) {
      return;
    }
    if (session.notes === notes) {
      return;
    }

    session.notes = notes;
    persistSession(session);
    io.to(code).emit('notes-changed', { notes });
  });

  socket.on('send-message', ({ code, token, targetId, message }) => {
    const session = producerSession(code, token);
    if (!session) return;

    if (!session.features.messagesEnabled) {
      return fail('Messaging feature is disabled');
    }

    opSendMessage(session, targetId, message);
  });

  socket.on('laser-pointer', ({ code, token, x, y, active }) => {
    const session = getSession(code);
    if (!session) return;

    if (session.clickers.get(socket.id) !== token) {
      return fail('Unauthorized: Invalid clicker token');
    }
    if (!session.features.laserPointerEnabled) {
      return;
    }

    for (const showClientId of session.showClients.keys()) {
      io.to(showClientId).emit('laser-pointer', { x, y, active, presenterId: socket.id });
    }
  });

  socket.on('disconnect', () => {
    for (const [code, session] of sessions.entries()) {
      if (session.producer === socket.id) {
        // Sessions are durable: the producer going away (navigation, logout,
        // network drop) leaves the session running until it is explicitly
        // ended or expires after SESSION_TTL_MS of inactivity.
        session.producer = null;
        console.log(`Producer disconnected from session ${code}; session stays active`);
      } else {
        const wasPresenter = session.presenters.has(socket.id);
        session.clickers.delete(socket.id);
        session.showClients.delete(socket.id);
        session.presenters.delete(socket.id);
        if (wasPresenter && session.producer) {
          notifyPresentersUpdated(session);
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Open Clicker server running on http://localhost:${PORT}`);
    console.log(`Database: ${getDbPath()}`);
    console.log(`Users in database: ${getUserCount()}`);

    if (!process.env.SESSION_SECRET) {
      console.warn('WARNING: SESSION_SECRET not set in environment. Sessions will not persist across restarts.');
      console.warn('Set SESSION_SECRET in your environment variables for production.');
    }
    if (!process.env.SUPERADMIN_PASSWORD) {
      console.warn('WARNING: SUPERADMIN_PASSWORD not set. Superadmin panel will not be accessible.');
    }
  });
}

loadPersistedSessions();

module.exports = {
  getUser,
  getAllUsers,
  createUser,
  deleteUser,
  getUserCount,
  closeDatabase,
  getDbPath,
  loadPersistedSessions,
  app,
  server,
  io,
  sessions
};
