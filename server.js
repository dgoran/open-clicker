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
      showClients: new Map(),
      presenters: new Map()
    });
    socket.join(code);
    socket.emit('session-created', { code, token: producerToken });
    console.log('Session created:', code);
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
      if (!displayName || displayName.trim() === '') {
        socket.emit('error', { message: 'Display name is required' });
        return;
      }
      
      session.clickers.set(socket.id, token);
      session.presenters.set(socket.id, {
        token,
        displayName: displayName.trim(),
        clickAccessEnabled: true
      });
      
      socket.emit('session-joined', {
        code,
        token,
        locked: session.locked,
        notes: session.notes,
        timer: session.timer,
        timerStartedAt: session.timerStartedAt,
        clickAccessEnabled: true
      });
      
      io.to(session.producer).emit('presenters-updated', {
        presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
          id,
          displayName: data.displayName,
          clickAccessEnabled: data.clickAccessEnabled
        }))
      });
    } else if (role === 'show-client') {
      session.showClients.set(socket.id, token);
      socket.emit('session-joined', { code, token });
    }
    
    console.log(`Client ${socket.id} joined session ${code} as ${role}${displayName ? ` (${displayName})` : ''}`);
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
        clickAccessEnabled: data.clickAccessEnabled
      }))
    });
    
    console.log(`Session ${code}: ${presenter.displayName} click access ${enabled ? 'enabled' : 'disabled'}`);
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
              clickAccessEnabled: data.clickAccessEnabled
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
