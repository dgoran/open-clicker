const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const sessions = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-session', () => {
    const code = generateCode();
    sessions.set(code, {
      code,
      locked: false,
      notes: '',
      timer: 0,
      timerStartedAt: null,
      producer: socket.id,
      clickers: new Set(),
      showClients: new Set()
    });
    socket.join(code);
    socket.emit('session-created', { code });
    console.log('Session created:', code);
  });

  socket.on('join-session', ({ code, role }) => {
    const session = sessions.get(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    socket.join(code);
    
    if (role === 'clicker') {
      session.clickers.add(socket.id);
      socket.emit('session-joined', {
        code,
        locked: session.locked,
        notes: session.notes,
        timer: session.timer,
        timerStartedAt: session.timerStartedAt
      });
    } else if (role === 'show-client') {
      session.showClients.add(socket.id);
      socket.emit('session-joined', { code });
    }
    
    console.log(`Client ${socket.id} joined session ${code} as ${role}`);
  });

  socket.on('set-lock', ({ code, locked }) => {
    const session = sessions.get(code);
    if (session && session.producer === socket.id) {
      session.locked = locked;
      io.to(code).emit('lock-changed', { locked });
      console.log(`Session ${code} lock changed:`, locked);
    }
  });

  socket.on('set-notes', ({ code, notes }) => {
    const session = sessions.get(code);
    if (session && session.producer === socket.id) {
      session.notes = notes;
      io.to(code).emit('notes-changed', { notes });
    }
  });

  socket.on('set-timer', ({ code, minutes }) => {
    const session = sessions.get(code);
    if (session && session.producer === socket.id) {
      session.timer = minutes * 60;
      session.timerStartedAt = Date.now();
      io.to(code).emit('timer-changed', { 
        timer: session.timer,
        timerStartedAt: session.timerStartedAt
      });
      console.log(`Session ${code} timer set to ${minutes} minutes`);
    }
  });

  socket.on('reset-timer', ({ code }) => {
    const session = sessions.get(code);
    if (session && session.producer === socket.id) {
      session.timerStartedAt = Date.now();
      io.to(code).emit('timer-changed', { 
        timer: session.timer,
        timerStartedAt: session.timerStartedAt
      });
    }
  });

  socket.on('next', ({ code }) => {
    const session = sessions.get(code);
    if (session && !session.locked) {
      io.to(code).emit('advance', { direction: 'next' });
      console.log(`Session ${code}: next`);
    }
  });

  socket.on('prev', ({ code }) => {
    const session = sessions.get(code);
    if (session && !session.locked) {
      io.to(code).emit('advance', { direction: 'prev' });
      console.log(`Session ${code}: prev`);
    }
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
