#!/usr/bin/env node

const { io } = require('socket.io-client');

let robot;
try {
  robot = require('robotjs');
} catch (err) {
  console.error('Warning: robotjs not installed. Key injection will not work.');
  console.error('Install robotjs with required system dependencies to enable key injection.');
  console.error('For now, use the browser-based show client at http://localhost:3000/show.html');
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const SESSION_CODE = process.argv[2];

if (!SESSION_CODE) {
  console.error('Usage: node show-machine-client.js <SESSION_CODE>');
  console.error('   or: npm run show-client <SESSION_CODE>');
  process.exit(1);
}

console.log('Open Clicker - Show Machine Client');
console.log('===================================');
console.log(`Connecting to: ${SERVER_URL}`);
console.log(`Session code: ${SESSION_CODE}`);
console.log('');

const socket = io(SERVER_URL);
let showToken = null; // eslint-disable-line no-unused-vars

socket.on('connect', () => {
  console.log('✓ Connected to server');
  socket.emit('join-session', { code: SESSION_CODE, role: 'show-client' });
});

socket.on('session-joined', ({ token }) => {
  showToken = token;
  console.log('✓ Joined session successfully');
  console.log('');
  console.log('Ready! Focus your presentation window.');
  console.log('The client will inject arrow keys when next/prev is clicked.');
  console.log('Press Ctrl+C to exit.');
  console.log('');
});

socket.on('advance', ({ direction }) => {
  console.log(`→ ${direction.toUpperCase()}`);
  
  try {
    if (direction === 'next') {
      robot.keyTap('right');
    } else if (direction === 'prev') {
      robot.keyTap('left');
    }
  } catch (error) {
    console.error('Error injecting key:', error.message);
  }
});

socket.on('session-ended', () => {
  console.log('');
  console.log('Session ended by producer.');
  process.exit(0);
});

socket.on('error', ({ message }) => {
  console.error('Error:', message);
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('');
  console.log('Disconnected from server.');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('Exiting...');
  socket.disconnect();
  process.exit(0);
});
