const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');
const { exec } = require('child_process');

let mainWindow;
let socket;
let robot;
let currentTargetApp = 'focused'; // Default to focused window

// Try to load robotjs, but gracefully handle if not available
try {
  robot = require('robotjs');
  console.log('robotjs loaded successfully');
} catch (err) {
  console.error('robotjs not available:', err.message);
  robot = null;
}

// Get the user data path for storing preferences
const userDataPath = app.getPath('userData');
const preferencesPath = path.join(userDataPath, 'preferences.json');

// Load preferences from file
function loadPreferences() {
  try {
    if (fs.existsSync(preferencesPath)) {
      const data = fs.readFileSync(preferencesPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading preferences:', err);
  }
  return {};
}

// Save preferences to file
function savePreferences(preferences) {
  try {
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2));
  } catch (err) {
    console.error('Error saving preferences:', err);
  }
}

// Activate a specific app before sending keys
function activateApp(targetApp) {
  return new Promise((resolve, reject) => {
    if (targetApp === 'focused') {
      // No need to activate, just send keys to focused window
      resolve();
      return;
    }

    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Use AppleScript to activate the app
      let appName;
      if (targetApp === 'powerpoint') {
        appName = 'Microsoft PowerPoint';
      } else if (targetApp === 'keynote') {
        appName = 'Keynote';
      } else {
        resolve();
        return;
      }

      const script = `tell application "${appName}" to activate`;
      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error activating ${appName}:`, error);
          reject(new Error(`Failed to activate ${appName}. Is it running?`));
        } else {
          // Add a small delay to ensure the app is activated
          setTimeout(resolve, 100);
        }
      });
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to activate the window
      let windowTitle;
      if (targetApp === 'powerpoint') {
        // PowerPoint window title typically contains "PowerPoint"
        windowTitle = 'PowerPoint';
      } else {
        resolve();
        return;
      }

      const psScript = `
        $window = Get-Process | Where-Object {$_.MainWindowTitle -like "*${windowTitle}*"} | Select-Object -First 1
        if ($window) {
          $sig = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
          $type = Add-Type -MemberDefinition $sig -Name WindowAPI -PassThru
          $type::SetForegroundWindow($window.MainWindowHandle)
        }
      `;
      
      exec(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error activating ${windowTitle}:`, error);
          reject(new Error(`Failed to activate ${windowTitle}. Is it running?`));
        } else {
          // Add a small delay to ensure the window is activated
          setTimeout(resolve, 100);
        }
      });
    } else {
      // Linux: No specific activation needed, just use focused window
      resolve();
    }
  });
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

// IPC Handlers

// Get platform information
ipcMain.handle('get-platform', async () => {
  return process.platform;
});

// Save target app preference
ipcMain.handle('save-target-app', async (event, targetApp) => {
  const preferences = loadPreferences();
  preferences.targetApp = targetApp;
  savePreferences(preferences);
  currentTargetApp = targetApp;
  return { success: true };
});

// Load target app preference
ipcMain.handle('load-target-app', async () => {
  const preferences = loadPreferences();
  return preferences.targetApp || 'focused';
});

// Handle connection request from renderer
ipcMain.handle('connect', async (event, { serverUrl, sessionCode, targetApp }) => {
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

    // Store the target app
    currentTargetApp = targetApp || 'focused';
    console.log('Target app:', currentTargetApp);

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
        
        // Activate the target app before sending keys
        activateApp(currentTargetApp)
          .then(() => {
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
          })
          .catch((error) => {
            console.error('Error activating app:', error);
            mainWindow.webContents.send('error', { 
              message: `Failed to activate app: ${error.message}` 
            });
          });
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
