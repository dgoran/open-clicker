const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { io } = require('socket.io-client');

let mainWindow;
let socket;
let robot;

// Try to load robotjs, but gracefully handle if not available
try {
  robot = require('robotjs');
  console.log('robotjs loaded successfully');
} catch (err) {
  console.error('robotjs not available:', err.message);
  robot = null;
}

function createWindow() {
  const iconPath = process.platform === 'darwin' 
    ? path.join(__dirname, '../build/icon.png')
    : path.join(__dirname, '../build/icon.ico');
  
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: iconPath,
    resizable: false,
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (socket) {
    socket.disconnect();
  }
  app.quit();
});

// Handle connection request from renderer
ipcMain.handle('connect', async (event, { serverUrl, sessionCode }) => {
  try {
    // Disconnect existing connection if any
    if (socket) {
      socket.disconnect();
    }

    // Check if robotjs is available
    if (!robot) {
      return {
        success: false,
        error: 'Keyboard injection not available. This build does not include robotjs.'
      };
    }

    return new Promise((resolve) => {
      socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      socket.on('connect', () => {
        console.log('Connected to server');
        mainWindow.webContents.send('connection-status', { status: 'connected' });
        socket.emit('join-session', { code: sessionCode, role: 'show-client' });
      });

      socket.on('session-joined', () => {
        console.log('Joined session successfully');
        mainWindow.webContents.send('connection-status', { 
          status: 'joined',
          message: 'Connected! Focus your presentation window.'
        });
        resolve({ success: true });
      });

      socket.on('advance', ({ direction }) => {
        console.log(`Advancing: ${direction}`);
        mainWindow.webContents.send('key-pressed', { direction });
        
        try {
          if (robot) {
            if (direction === 'next') {
              robot.keyTap('right');
            } else if (direction === 'prev') {
              robot.keyTap('left');
            }
          }
        } catch (error) {
          console.error('Error injecting key:', error);
          mainWindow.webContents.send('error', { 
            message: `Key injection error: ${error.message}` 
          });
        }
      });

      socket.on('session-ended', () => {
        console.log('Session ended');
        mainWindow.webContents.send('connection-status', { 
          status: 'disconnected',
          message: 'Session ended by producer.'
        });
        socket.disconnect();
      });

      socket.on('error', ({ message }) => {
        console.error('Socket error:', message);
        mainWindow.webContents.send('connection-status', { 
          status: 'error',
          message: `Error: ${message}`
        });
        resolve({ success: false, error: message });
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        mainWindow.webContents.send('connection-status', { 
          status: 'error',
          message: `Connection error: ${error.message}`
        });
        resolve({ success: false, error: error.message });
      });

      socket.on('disconnect', () => {
        console.log('Disconnected');
        mainWindow.webContents.send('connection-status', { 
          status: 'disconnected',
          message: 'Disconnected from server.'
        });
      });

      // Timeout if session join doesn't happen
      setTimeout(() => {
        if (socket && socket.connected) {
          resolve({ success: false, error: 'Timeout waiting for session join' });
        }
      }, 10000);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle disconnect request from renderer
ipcMain.handle('disconnect', async () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return { success: true };
});
