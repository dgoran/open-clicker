#!/usr/bin/env node

const { io } = require('socket.io-client');

// Accepts a bare code or a pasted cue link (http://host/show.html?code=XXXXXX).
function parseTarget(input, fallbackServerUrl) {
  const value = (input || '').trim();
  const match = value.match(/^https?:\/\/\S+/i);
  if (match) {
    try {
      const url = new URL(match[0]);
      const code = url.searchParams.get('code');
      if (code) {
        return { serverUrl: url.origin, sessionCode: code.trim().toUpperCase() };
      }
    } catch (err) {
      // fall through and treat the argument as a plain code
    }
  }
  return { serverUrl: fallbackServerUrl, sessionCode: value.toUpperCase() };
}

function main() {
  let robot;
  try {
    robot = require('robotjs');
  } catch (err) {
    console.error('Warning: robotjs not installed. Key injection will not work.');
    console.error('Install robotjs with required system dependencies to enable key injection.');
    console.error('For now, use the browser-based show client at http://localhost:3000/show.html');
    process.exit(1);
  }

  const argument = process.argv[2];

  if (!argument) {
    console.error('Usage: node show-machine-client.js <SESSION_CODE | CUE_LINK>');
    console.error('   or: npm run show-client <SESSION_CODE | CUE_LINK>');
    process.exit(1);
  }

  const { serverUrl: SERVER_URL, sessionCode: SESSION_CODE } = parseTarget(
    argument,
    process.env.SERVER_URL || 'http://localhost:3000'
  );

  console.log('Open Clicker - Show Machine Client');
  console.log('===================================');
  console.log(`Connecting to: ${SERVER_URL}`);
  console.log(`Session code: ${SESSION_CODE}`);
  console.log('');

  // Sessions outlive server restarts and network blips, so keep retrying and
  // rejoin automatically instead of exiting on the first disconnect.
  const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });

  let hasJoined = false;

  socket.on('connect', () => {
    console.log('✓ Connected to server');
    socket.emit('join-session', { code: SESSION_CODE, role: 'show-client' });
  });

  socket.on('session-joined', () => {
    if (!hasJoined) {
      hasJoined = true;
      console.log('✓ Joined session successfully');
      console.log('');
      console.log('Ready! Focus your presentation window.');
      console.log('The client will inject arrow keys when next/prev is clicked.');
      console.log('Press Ctrl+C to exit.');
      console.log('');
    } else {
      console.log('✓ Rejoined session');
    }
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
    // A missing session or rejected token is fatal; anything transient is
    // handled by the reconnect logic.
    if (/not found|Unauthorized/i.test(message)) {
      process.exit(1);
    }
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    if (attempt === 1) {
      console.log('Connection lost. Reconnecting…');
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') {
      process.exit(0);
    }
  });

  process.on('SIGINT', () => {
    console.log('');
    console.log('Exiting...');
    socket.disconnect();
    process.exit(0);
  });
}

// Only run the CLI when executed directly, so tests can import parseTarget
// without triggering the robotjs check or opening a socket.
if (require.main === module) {
  main();
}

module.exports = { parseTarget };
