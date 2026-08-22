const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const sessions = new Map();

function generateCode() {
  const bytes = crypto.randomBytes(4);
  return bytes.toString('base64')
    .replace(/[+/=]/g, '')
    .substring(0, 6)
    .toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-session', () => {
    const code = generateCode();
    const producerToken = generateToken();
    sessions.set(code, {
      code,
      locked: false,
      notes: '',
      timer: 0,
      timerStartedAt: null,
      producer: socket.id,
      producerToken,
      clickers: new Map(),
      showClients: new Map()
    });
    socket.join(code);
    socket.emit('session-created', { code, token: producerToken });
    console.log('Session created:', code);
  });

  socket.on('join-session', ({ code, role }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    const token = generateToken();
    socket.join(code);
    
    if (role === 'clicker') {
      session.clickers.set(socket.id, token);
      socket.emit('session-joined', {
        code,
        token,
        locked: session.locked,
        notes: session.notes,
        timer: session.timer,
        timerStartedAt: session.timerStartedAt
      });
    } else if (role === 'show-client') {
      session.showClients.set(socket.id, token);
      socket.emit('session-joined', { code, token });
    }
    
    console.log(`Client ${socket.id} joined session ${code} as ${role}`);
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
    io.to(code).emit('advance', { direction: 'prev' });
    console.log(`Session ${code}: prev`);
  });

  socket.on('disconnect', () => {
    for (const [code, session] of sessions.entries()) {
      if (session.producer === socket.id) {
        sessions.delete(code);
        io.to(code).emit('session-ended');
        console.log('Session ended:', code);
      } else {
        session.clickers.delete(socket.id);
        session.showClients.delete(socket.id);
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Open Clicker server running on http://localhost:${PORT}`);
});
