const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const io = require('socket.io-client');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

describe('Feature Toggles', () => {
  let httpServer, ioServer, serverSocket, clientSocket1, clientSocket2, producerSocket, showSocket;
  let sessionCode, producerToken, clickerToken;
  const PORT = 0;

  beforeEach(async () => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    
    await new Promise(resolve => httpServer.listen(PORT, resolve));
    const port = httpServer.address().port;

    return new Promise((resolve) => {
      ioServer.on('connection', (socket) => {
        serverSocket = socket;
        resolve();
      });
      
      producerSocket = io(`http://localhost:${port}`);
    });
  });

  afterEach(() => {
    if (producerSocket?.connected) producerSocket.disconnect();
    if (clientSocket1?.connected) clientSocket1.disconnect();
    if (clientSocket2?.connected) clientSocket2.disconnect();
    if (showSocket?.connected) showSocket.disconnect();
    ioServer.close();
    httpServer.close();
  });

  it('should create session with all features disabled by default', (done) => {
    serverSocket.on('create-session', () => {
      const features = {
        screenshotEnabled: false,
        messagesEnabled: false,
        laserPointerEnabled: false,
        voiceControlEnabled: false,
        cueBeepsEnabled: false
      };
      
      serverSocket.emit('session-created', {
        code: 'TEST01',
        token: 'producer-token-123',
        requireName: true,
        features
      });
    });

    producerSocket.on('session-created', (data) => {
      assert.strictEqual(data.features.screenshotEnabled, false);
      assert.strictEqual(data.features.messagesEnabled, false);
      assert.strictEqual(data.features.laserPointerEnabled, false);
      assert.strictEqual(data.features.voiceControlEnabled, false);
      assert.strictEqual(data.features.cueBeepsEnabled, false);
      done();
    });

    producerSocket.emit('create-session');
  });

  it('should toggle screenshot feature on and off', (done) => {
    let toggleCount = 0;

    serverSocket.on('set-features', ({ features }) => {
      toggleCount++;
      
      if (toggleCount === 1) {
        assert.strictEqual(features.screenshotEnabled, true);
        serverSocket.emit('features-changed', { features });
      } else if (toggleCount === 2) {
        assert.strictEqual(features.screenshotEnabled, false);
        done();
      }
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: { screenshotEnabled: true }
    });

    setTimeout(() => {
      producerSocket.emit('set-features', {
        code: 'TEST01',
        token: 'producer-token',
        features: { screenshotEnabled: false }
      });
    }, 50);
  });

  it('should toggle messages feature on and off', (done) => {
    let toggleCount = 0;

    serverSocket.on('set-features', ({ features }) => {
      toggleCount++;
      
      if (toggleCount === 1) {
        assert.strictEqual(features.messagesEnabled, true);
        serverSocket.emit('features-changed', { features });
      } else if (toggleCount === 2) {
        assert.strictEqual(features.messagesEnabled, false);
        done();
      }
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: { messagesEnabled: true }
    });

    setTimeout(() => {
      producerSocket.emit('set-features', {
        code: 'TEST01',
        token: 'producer-token',
        features: { messagesEnabled: false }
      });
    }, 50);
  });

  it('should toggle laser pointer feature on and off', (done) => {
    let toggleCount = 0;

    serverSocket.on('set-features', ({ features }) => {
      toggleCount++;
      
      if (toggleCount === 1) {
        assert.strictEqual(features.laserPointerEnabled, true);
        serverSocket.emit('features-changed', { features });
      } else if (toggleCount === 2) {
        assert.strictEqual(features.laserPointerEnabled, false);
        done();
      }
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: { laserPointerEnabled: true }
    });

    setTimeout(() => {
      producerSocket.emit('set-features', {
        code: 'TEST01',
        token: 'producer-token',
        features: { laserPointerEnabled: false }
      });
    }, 50);
  });

  it('should toggle voice control feature on and off', (done) => {
    let toggleCount = 0;

    serverSocket.on('set-features', ({ features }) => {
      toggleCount++;
      
      if (toggleCount === 1) {
        assert.strictEqual(features.voiceControlEnabled, true);
        serverSocket.emit('features-changed', { features });
      } else if (toggleCount === 2) {
        assert.strictEqual(features.voiceControlEnabled, false);
        done();
      }
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: { voiceControlEnabled: true }
    });

    setTimeout(() => {
      producerSocket.emit('set-features', {
        code: 'TEST01',
        token: 'producer-token',
        features: { voiceControlEnabled: false }
      });
    }, 50);
  });

  it('should toggle cue beeps feature on and off', (done) => {
    let toggleCount = 0;

    serverSocket.on('set-features', ({ features }) => {
      toggleCount++;
      
      if (toggleCount === 1) {
        assert.strictEqual(features.cueBeepsEnabled, true);
        serverSocket.emit('features-changed', { features });
      } else if (toggleCount === 2) {
        assert.strictEqual(features.cueBeepsEnabled, false);
        done();
      }
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: { cueBeepsEnabled: true }
    });

    setTimeout(() => {
      producerSocket.emit('set-features', {
        code: 'TEST01',
        token: 'producer-token',
        features: { cueBeepsEnabled: false }
      });
    }, 50);
  });

  it('should toggle multiple features simultaneously', (done) => {
    serverSocket.on('set-features', ({ features }) => {
      assert.strictEqual(features.screenshotEnabled, true);
      assert.strictEqual(features.messagesEnabled, true);
      assert.strictEqual(features.laserPointerEnabled, true);
      done();
    });

    producerSocket.emit('set-features', {
      code: 'TEST01',
      token: 'producer-token',
      features: {
        screenshotEnabled: true,
        messagesEnabled: true,
        laserPointerEnabled: true
      }
    });
  });
});

describe('Screenshot Feature', () => {
  let httpServer, ioServer, serverSocket, showSocket, clickerSocket;
  const PORT = 0;

  beforeEach(async () => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    
    await new Promise(resolve => httpServer.listen(PORT, resolve));
    const port = httpServer.address().port;

    return new Promise((resolve) => {
      ioServer.on('connection', (socket) => {
        serverSocket = socket;
        resolve();
      });
      
      showSocket = io(`http://localhost:${port}`);
    });
  });

  afterEach(() => {
    if (showSocket?.connected) showSocket.disconnect();
    if (clickerSocket?.connected) clickerSocket.disconnect();
    ioServer.close();
    httpServer.close();
  });

  it('should accept screenshot from show client', (done) => {
    serverSocket.on('screenshot-upload', ({ code, token, screenshot }) => {
      assert.strictEqual(code, 'TEST01');
      assert.strictEqual(token, 'show-token');
      assert.ok(screenshot.startsWith('data:image/'));
      done();
    });

    showSocket.emit('screenshot-upload', {
      code: 'TEST01',
      token: 'show-token',
      screenshot: 'data:image/jpeg;base64,/9j/4AAQ'
    });
  });
});

describe('Message Feature', () => {
  let httpServer, ioServer, serverSocket, producerSocket, clickerSocket;
  const PORT = 0;

  beforeEach(async () => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    
    await new Promise(resolve => httpServer.listen(PORT, resolve));
    const port = httpServer.address().port;

    return new Promise((resolve) => {
      ioServer.on('connection', (socket) => {
        serverSocket = socket;
        resolve();
      });
      
      producerSocket = io(`http://localhost:${port}`);
    });
  });

  afterEach(() => {
    if (producerSocket?.connected) producerSocket.disconnect();
    if (clickerSocket?.connected) clickerSocket.disconnect();
    ioServer.close();
    httpServer.close();
  });

  it('should send message from producer', (done) => {
    serverSocket.on('send-message', ({ code, token, targetId, message }) => {
      assert.strictEqual(code, 'TEST01');
      assert.strictEqual(token, 'producer-token');
      assert.strictEqual(targetId, 'all');
      assert.strictEqual(message, 'Hello presenters!');
      done();
    });

    producerSocket.emit('send-message', {
      code: 'TEST01',
      token: 'producer-token',
      targetId: 'all',
      message: 'Hello presenters!'
    });
  });
});

describe('Laser Pointer Feature', () => {
  let httpServer, ioServer, serverSocket, clickerSocket;
  const PORT = 0;

  beforeEach(async () => {
    const app = express();
    httpServer = http.createServer(app);
    ioServer = new Server(httpServer);
    
    await new Promise(resolve => httpServer.listen(PORT, resolve));
    const port = httpServer.address().port;

    return new Promise((resolve) => {
      ioServer.on('connection', (socket) => {
        serverSocket = socket;
        resolve();
      });
      
      clickerSocket = io(`http://localhost:${port}`);
    });
  });

  afterEach(() => {
    if (clickerSocket?.connected) clickerSocket.disconnect();
    ioServer.close();
    httpServer.close();
  });

  it('should send laser pointer position from clicker', (done) => {
    serverSocket.on('laser-pointer', ({ code, token, x, y, active }) => {
      assert.strictEqual(code, 'TEST01');
      assert.strictEqual(token, 'clicker-token');
      assert.strictEqual(x, 0.5);
      assert.strictEqual(y, 0.5);
      assert.strictEqual(active, true);
      done();
    });

    clickerSocket.emit('laser-pointer', {
      code: 'TEST01',
      token: 'clicker-token',
      x: 0.5,
      y: 0.5,
      active: true
    });
  });

  it('should send laser pointer deactivation', (done) => {
    serverSocket.on('laser-pointer', ({ code, token, x, y, active }) => {
      assert.strictEqual(active, false);
      done();
    });

    clickerSocket.emit('laser-pointer', {
      code: 'TEST01',
      token: 'clicker-token',
      x: 0,
      y: 0,
      active: false
    });
  });
});
