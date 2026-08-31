const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

const users = new Map();
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
    
    if (users.has(emailLower)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = crypto.randomBytes(16).toString('hex');
    
    users.set(emailLower, {
      userId,
      email: emailLower,
      passwordHash,
      createdAt: Date.now()
    });
    
    req.session.userId = userId;
    req.session.email = emailLower;
    
    res.json({ success: true, email: emailLower });
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
    const user = users.get(emailLower);
    
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
      presenters: new Map()
    });
    socket.join(code);
    socket.emit('session-created', { code, token: producerToken, requireName: true });
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
        requireName: session.requireName
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
      socket.emit('session-joined', { code, token });
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

server.listen(PORT, () => {
  console.log(`Open Clicker server running on http://localhost:${PORT}`);
});
