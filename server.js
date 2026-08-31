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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

function getDbPath() {
  if (process.env.USERS_DB || process.env.DATABASE_PATH) {
    return process.env.USERS_DB || process.env.DATABASE_PATH;
  }
  
  if (process.env.RENDER) {
    return '/data/users.sqlite';
  }
  
  return path.join(__dirname, 'users.sqlite');
}

const DB_PATH = getDbPath();

function initDatabase() {
  const dir = path.dirname(DB_PATH);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
  
  const db = Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);
  
  console.log(`Database initialized at ${DB_PATH}`);
  return db;
}

const db = initDatabase();

function getUser(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email.toLowerCase().trim());
}

function getAllUsers() {
  const stmt = db.prepare('SELECT userId, email, createdAt FROM users ORDER BY createdAt DESC');
  return stmt.all();
}

function createUser(email, passwordHash) {
  const userId = crypto.randomBytes(16).toString('hex');
  const emailLower = email.toLowerCase().trim();
  const createdAt = Date.now();
  
  const stmt = db.prepare('INSERT INTO users (userId, email, passwordHash, createdAt) VALUES (?, ?, ?, ?)');
  stmt.run(userId, emailLower, passwordHash, createdAt);
  
  return { userId, email: emailLower, createdAt };
}

function deleteUser(userId) {
  const stmt = db.prepare('DELETE FROM users WHERE userId = ?');
  const result = stmt.run(userId);
  return result.changes > 0;
}

function getUserCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
  return stmt.get().count;
}
const sessions = new Map();

function generateCode() {
  // Generate 6 bytes to ensure at least 6 chars after stripping +/=
  const bytes = crypto.randomBytes(6);
  return bytes.toString('base64')
    .replace(/[+/=]/g, '')
    .substring(0, 6)
    .toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});

app.use(express.json());
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(express.static('public'));

io.engine.use(sessionMiddleware);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/superadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const emailLower = email.toLowerCase().trim();
    
    const existingUser = getUser(emailLower);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = createUser(emailLower, passwordHash);
    
    req.session.userId = user.userId;
    req.session.email = user.email;
    
    res.json({ success: true, email: user.email });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const emailLower = email.toLowerCase().trim();
    const user = getUser(emailLower);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!passwordMatch) {
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
    res.json({ 
      authenticated: true, 
      email: req.session.email,
      userId: req.session.userId
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/superadmin/login', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Superadmin login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

function requireSuperadmin(req, res, next) {
  if (!req.session.superadmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/superadmin/users', requireSuperadmin, (req, res) => {
  try {
    const usersList = getAllUsers();
    res.json({ users: usersList });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/superadmin/users', requireSuperadmin, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const emailLower = email.toLowerCase().trim();
    
    const existingUser = getUser(emailLower);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = createUser(emailLower, passwordHash);
    
    res.json({ success: true, userId: user.userId, email: user.email });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/superadmin/users/:userId', requireSuperadmin, (req, res) => {
  try {
    const { userId } = req.params;
    
    const deleted = deleteUser(userId);
    
    if (!deleted) {
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

app.get('/api/session/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const session = sessions.get(code);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({ 
    code: session.code,
    requireName: session.requireName,
    locked: session.locked
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-session', () => {
    const session = socket.request.session;
    const userId = session?.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Authentication required to create session' });
      return;
    }
    
    const code = generateCode();
    const producerToken = generateToken();
    sessions.set(code, {
      code,
      locked: false,
      requireName: true,
      notes: '',
      timer: 0,
      timerStartedAt: null,
      producer: socket.id,
      producerToken,
      userId,
      clickers: new Map(),
      showClients: new Map(),
      presenters: new Map(),
      features: {
        screenshotEnabled: false,
        messagesEnabled: false,
        laserPointerEnabled: false,
        voiceControlEnabled: false,
        cueBeepsEnabled: false
      },
      screenshot: null,
      lastScreenshotTime: null
    });
    socket.join(code);
    socket.emit('session-created', { code, token: producerToken, requireName: true, features: sessions.get(code).features });
    console.log('Session created:', code, 'by user:', userId);
  });

  socket.on('join-session', ({ code, role, displayName }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    const token = generateToken();
    socket.join(code);
    
    if (role === 'clicker') {
      if (session.requireName && (!displayName || displayName.trim() === '')) {
        socket.emit('error', { message: 'Display name is required' });
        return;
      }
      
      const finalDisplayName = displayName ? displayName.trim() : 'Anonymous';
      
      session.clickers.set(socket.id, token);
      session.presenters.set(socket.id, {
        token,
        displayName: finalDisplayName,
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
      
      io.to(session.producer).emit('presenters-updated', {
        presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
          id,
          displayName: data.displayName,
          clickAccessEnabled: data.clickAccessEnabled,
          isAnonymous: data.isAnonymous
        }))
      });
    } else if (role === 'show-client') {
      session.showClients.set(socket.id, token);
      socket.emit('session-joined', { code, token, features: session.features });
    }
    
    console.log(`Client ${socket.id} joined session ${code} as ${role}${displayName ? ` (${displayName})` : ' (anonymous)'}`);
  });

  socket.on('set-lock', ({ code, token, locked }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    session.locked = locked;
    io.to(code).emit('lock-changed', { locked });
    console.log(`Session ${code} lock changed:`, locked);
  });

  socket.on('set-notes', ({ code, token, notes }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    session.notes = notes;
    io.to(code).emit('notes-changed', { notes });
  });

  socket.on('set-timer', ({ code, token, minutes }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    session.timer = minutes * 60;
    session.timerStartedAt = Date.now();
    io.to(code).emit('timer-changed', { 
      timer: session.timer,
      timerStartedAt: session.timerStartedAt
    });
    console.log(`Session ${code} timer set to ${minutes} minutes`);
  });

  socket.on('reset-timer', ({ code, token }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    session.timerStartedAt = Date.now();
    io.to(code).emit('timer-changed', { 
      timer: session.timer,
      timerStartedAt: session.timerStartedAt
    });
  });

  socket.on('next', ({ code, token }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    const isClicker = session.clickers.get(socket.id) === token;
    const isShowClient = session.showClients.get(socket.id) === token;
    if (!isClicker && !isShowClient) {
      socket.emit('error', { message: 'Unauthorized: Invalid clicker token' });
      return;
    }
    if (session.locked) {
      socket.emit('error', { message: 'Session is locked' });
      return;
    }
    if (isClicker) {
      const presenter = session.presenters.get(socket.id);
      if (presenter && !presenter.clickAccessEnabled) {
        socket.emit('error', { message: 'Your click access is suspended' });
        return;
      }
    }
    io.to(code).emit('advance', { direction: 'next' });
    console.log(`Session ${code}: next`);
  });

  socket.on('prev', ({ code, token }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    const isClicker = session.clickers.get(socket.id) === token;
    const isShowClient = session.showClients.get(socket.id) === token;
    if (!isClicker && !isShowClient) {
      socket.emit('error', { message: 'Unauthorized: Invalid clicker token' });
      return;
    }
    if (session.locked) {
      socket.emit('error', { message: 'Session is locked' });
      return;
    }
    if (isClicker) {
      const presenter = session.presenters.get(socket.id);
      if (presenter && !presenter.clickAccessEnabled) {
        socket.emit('error', { message: 'Your click access is suspended' });
        return;
      }
    }
    io.to(code).emit('advance', { direction: 'prev' });
    console.log(`Session ${code}: prev`);
  });

  socket.on('toggle-presenter-access', ({ code, token, presenterId, enabled }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    
    const presenter = session.presenters.get(presenterId);
    if (!presenter) {
      socket.emit('error', { message: 'Presenter not found' });
      return;
    }
    
    presenter.clickAccessEnabled = enabled;
    
    io.to(presenterId).emit('click-access-changed', { clickAccessEnabled: enabled });
    
    io.to(session.producer).emit('presenters-updated', {
      presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
        id,
        displayName: data.displayName,
        clickAccessEnabled: data.clickAccessEnabled,
        isAnonymous: data.isAnonymous
      }))
    });
    
    console.log(`Session ${code}: ${presenter.displayName} click access ${enabled ? 'enabled' : 'disabled'}`);
  });

  socket.on('set-require-name', ({ code, token, requireName }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    
    session.requireName = requireName;
    socket.emit('require-name-updated', { requireName });
    console.log(`Session ${code}: requireName set to ${requireName}`);
  });

  socket.on('prompt-name', ({ code, token }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    
    for (const [presenterId, presenter] of session.presenters.entries()) {
      if (presenter.isAnonymous) {
        io.to(presenterId).emit('name-prompt');
      }
    }
    
    console.log(`Session ${code}: name prompt sent to anonymous presenters`);
  });

  socket.on('set-display-name', ({ code, token, displayName }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    
    const isClicker = session.clickers.get(socket.id) === token;
    if (!isClicker) {
      socket.emit('error', { message: 'Unauthorized: Invalid clicker token' });
      return;
    }
    
    if (!displayName || displayName.trim() === '') {
      socket.emit('error', { message: 'Display name cannot be empty' });
      return;
    }
    
    const presenter = session.presenters.get(socket.id);
    if (!presenter) {
      socket.emit('error', { message: 'Presenter not found' });
      return;
    }
    
    presenter.displayName = displayName.trim();
    presenter.isAnonymous = false;
    
    socket.emit('display-name-updated', { displayName: presenter.displayName });
    
    io.to(session.producer).emit('presenters-updated', {
      presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
        id,
        displayName: data.displayName,
        clickAccessEnabled: data.clickAccessEnabled,
        isAnonymous: data.isAnonymous
      }))
    });
    
    console.log(`Session ${code}: ${socket.id} changed name to ${presenter.displayName}`);
  });

  socket.on('set-features', ({ code, token, features }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    
    session.features = { ...session.features, ...features };
    io.to(code).emit('features-changed', { features: session.features });
    console.log(`Session ${code}: features updated`, features);
  });

  socket.on('screenshot-upload', ({ code, token, screenshot }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    const isShowClient = session.showClients.get(socket.id) === token;
    if (!isShowClient) {
      socket.emit('error', { message: 'Unauthorized: Invalid show client token' });
      return;
    }
    
    if (session.features.screenshotEnabled) {
      session.screenshot = screenshot;
      session.lastScreenshotTime = Date.now();
      
      for (const [clickerId] of session.clickers.entries()) {
        io.to(clickerId).emit('screenshot-updated', { screenshot });
      }
    }
  });

  socket.on('send-message', ({ code, token, targetId, message }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    if (session.producer !== socket.id || session.producerToken !== token) {
      socket.emit('error', { message: 'Unauthorized: Invalid producer token' });
      return;
    }
    
    if (!session.features.messagesEnabled) {
      socket.emit('error', { message: 'Messaging feature is disabled' });
      return;
    }
    
    const messageData = {
      message,
      timestamp: Date.now(),
      from: 'Producer'
    };
    
    if (targetId === 'all') {
      for (const [clickerId] of session.clickers.entries()) {
        io.to(clickerId).emit('message-received', messageData);
      }
      console.log(`Session ${code}: message sent to all presenters`);
    } else {
      if (session.clickers.has(targetId)) {
        io.to(targetId).emit('message-received', messageData);
        console.log(`Session ${code}: message sent to ${targetId}`);
      }
    }
  });

  socket.on('laser-pointer', ({ code, token, x, y, active }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }
    const isClicker = session.clickers.get(socket.id) === token;
    if (!isClicker) {
      socket.emit('error', { message: 'Unauthorized: Invalid clicker token' });
      return;
    }
    
    if (!session.features.laserPointerEnabled) {
      return;
    }
    
    for (const [showClientId] of session.showClients.entries()) {
      io.to(showClientId).emit('laser-pointer', { x, y, active, presenterId: socket.id });
    }
  });

  socket.on('disconnect', () => {
    for (const [code, session] of sessions.entries()) {
      if (session.producer === socket.id) {
        sessions.delete(code);
        io.to(code).emit('session-ended');
        console.log('Session ended:', code);
      } else {
        const wasPresenter = session.presenters.has(socket.id);
        session.clickers.delete(socket.id);
        session.showClients.delete(socket.id);
        session.presenters.delete(socket.id);
        
        if (wasPresenter && session.producer) {
          io.to(session.producer).emit('presenters-updated', {
            presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
              id,
              displayName: data.displayName,
              clickAccessEnabled: data.clickAccessEnabled,
              isAnonymous: data.isAnonymous
            }))
          });
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

function closeDatabase() {
  if (db) {
    db.close();
  }
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Open Clicker server running on http://localhost:${PORT}`);
    console.log(`Database: ${DB_PATH}`);
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

module.exports = {
  db,
  getUser,
  getAllUsers,
  createUser,
  deleteUser,
  getUserCount,
  closeDatabase,
  DB_PATH,
  app,
  server
};
