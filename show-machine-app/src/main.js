const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');
const { exec } = require('child_process');
const crypto = require('crypto');

let mainWindow;
let socket;
let robot;
let currentTargetApp = 'focused';

// Connection details kept so a reconnect can rejoin without user input.
let connection = { serverUrl: null, sessionCode: null };
let showToken = null;
let sessionFeatures = {};

// Screen casting state
let captureTimer = null;
let capturePrefs = { enabled: false, screenId: null, height: 400 };
let lastCaptureBytes = 0;
let lastFrameHash = null;
let captureInFlight = false;

const CAPTURE_INTERVAL_MS = 1000;
const JPEG_QUALITY = 60;

try {
  robot = require('robotjs');
  console.log('robotjs loaded successfully');
} catch (err) {
  console.error('robotjs not available:', err.message);
  robot = null;
}

const preferencesPath = path.join(app.getPath('userData'), 'preferences.json');

function loadPreferences() {
  try {
    if (fs.existsSync(preferencesPath)) {
      return JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading preferences:', err);
  }
  return {};
}

function savePreferences(patch) {
  try {
    const merged = { ...loadPreferences(), ...patch };
    fs.writeFileSync(preferencesPath, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    console.error('Error saving preferences:', err);
    return loadPreferences();
  }
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Accepts a bare code ("A1B2C3") or a pasted cue/presenter link
// ("https://host/show.html?code=A1B2C3"), returning both parts.
function parseSessionInput(input, fallbackServerUrl) {
  const value = (input || '').trim();
  if (!value) return { serverUrl: fallbackServerUrl, sessionCode: '' };

  const match = value.match(/^https?:\/\/[^\s]+/i);
  if (match) {
    try {
      const url = new URL(match[0]);
      const code = url.searchParams.get('code') || '';
      return { serverUrl: url.origin, sessionCode: code.trim().toUpperCase() };
    } catch (err) {
      // fall through to treating the value as a plain code
    }
  }
  return { serverUrl: fallbackServerUrl, sessionCode: value.toUpperCase() };
}

function activateApp(targetApp) {
  return new Promise((resolve, reject) => {
    if (targetApp === 'focused') {
      resolve();
      return;
    }

    const platform = process.platform;

    if (platform === 'darwin') {
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
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error(`Error activating ${appName}:`, error);
          reject(new Error(`Failed to activate ${appName}. Is it running?`));
        } else {
          setTimeout(resolve, 100);
        }
      });
    } else if (platform === 'win32') {
      if (targetApp !== 'powerpoint') {
        resolve();
        return;
      }
      const windowTitle = 'PowerPoint';

      const psScript = `
        $window = Get-Process | Where-Object {$_.MainWindowTitle -like "*${windowTitle}*"} | Select-Object -First 1
        if ($window) {
          if (-not ([System.Management.Automation.PSTypeName]'Win32.User32').Type) {
            Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);' -Name User32 -Namespace Win32
          }
          [Win32.User32]::SetForegroundWindow($window.MainWindowHandle)
        }
      `.trim();

      const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');

      exec(`powershell -EncodedCommand ${encodedCommand}`, (error) => {
        if (error) {
          console.error(`Error activating ${windowTitle}:`, error);
          reject(new Error(`Failed to activate ${windowTitle}. Is it running?`));
        } else {
          setTimeout(resolve, 100);
        }
      });
    } else {
      resolve();
    }
  });
}

function injectKey(direction) {
  send('key-pressed', { direction });

  activateApp(currentTargetApp)
    .then(() => {
      try {
        if (robot) {
          robot.keyTap(direction === 'next' ? 'right' : 'left');
        }
      } catch (error) {
        console.error('Error injecting key:', error);
        send('error', { message: `Key injection error: ${error.message}` });
      }
    })
    .catch((error) => {
      console.error('Error activating app:', error);
      send('error', { message: `Failed to activate app: ${error.message}` });
    });
}

// --- Screen casting -------------------------------------------------------

// macOS gates screen capture behind a system permission; report it clearly
// instead of silently sending black frames.
function screenCaptureBlocked() {
  if (process.platform !== 'darwin') return false;
  try {
    return systemPreferences.getMediaAccessStatus('screen') !== 'granted';
  } catch (err) {
    return false;
  }
}

async function listScreens() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 240, height: 135 }
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
}

async function captureAndSend() {
  if (!socket || !socket.connected || !showToken) return;
  // A capture slower than the interval must not stack up behind itself.
  if (captureInFlight) return;
  captureInFlight = true;

  try {
    const height = capturePrefs.height;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round((height * 16) / 9), height }
    });
    if (sources.length === 0) return;

    const source = sources.find((s) => s.id === capturePrefs.screenId) || sources[0];
    const jpeg = source.thumbnail.toJPEG(JPEG_QUALITY);

    const hash = crypto.createHash('sha1').update(jpeg).digest('hex');
    if (hash === lastFrameHash) {
      return;
    }
    lastFrameHash = hash;
    lastCaptureBytes = jpeg.length;

    socket.emit('screenshot-upload', {
      code: connection.sessionCode,
      token: showToken,
      screenshot: `data:image/jpeg;base64,${jpeg.toString('base64')}`
    });

    send('capture-stats', {
      height,
      kbPerSecond: Math.round(lastCaptureBytes / 1024 / (CAPTURE_INTERVAL_MS / 1000))
    });
  } catch (error) {
    console.error('Screen capture error:', error);
    send('error', { message: `Screen capture error: ${error.message}` });
    stopCapture();
  } finally {
    captureInFlight = false;
  }
}

function shouldCapture() {
  return capturePrefs.enabled && !!sessionFeatures.screenshotEnabled && !!showToken;
}

function startCapture() {
  if (captureTimer) return;
  if (screenCaptureBlocked()) {
    send('error', {
      message: 'Screen Recording permission is required. Grant it in System Settings > Privacy & Security > Screen Recording, then restart the app.'
    });
    return;
  }
  captureAndSend();
  captureTimer = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);
  send('capture-state', { active: true });
}

function stopCapture() {
  lastFrameHash = null;
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
  send('capture-state', { active: false });
}

function syncCapture() {
  if (shouldCapture()) {
    startCapture();
  } else {
    stopCapture();
  }
}

// --- Speaker notes --------------------------------------------------------

// Reads the current slide's speaker notes out of the presentation app so the
// remote presenter can read them on their phone while presenting.
function runScript(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 4000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

function readSpeakerNotes(targetApp) {
  if (process.platform === 'darwin') {
    if (targetApp === 'keynote') {
      const script = [
        'tell application "Keynote"',
        'if not (exists front document) then return ""',
        'tell front document to return presenter notes of current slide',
        'end tell'
      ].join('\n');
      return runScript(`osascript -e ${JSON.stringify(script)}`);
    }

    const script = [
      'tell application "Microsoft PowerPoint"',
      'if not (exists active presentation) then return ""',
      'set slideIndex to 0',
      'try',
      'set slideIndex to slide index of slide of slide show view of slide show window 1',
      'on error',
      'try',
      'set slideIndex to slide index of slide of view of document window 1',
      'end try',
      'end try',
      'if slideIndex is 0 then return ""',
      'return content of text range of text frame of notes page of slide slideIndex of active presentation',
      'end tell'
    ].join('\n');
    return runScript(`osascript -e ${JSON.stringify(script)}`);
  }

  if (process.platform === 'win32') {
    const psScript = `
      $ErrorActionPreference = 'SilentlyContinue'
      $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
      if (-not $ppt) { '' ; exit }
      $slide = $null
      if ($ppt.SlideShowWindows.Count -gt 0) {
        $slide = $ppt.SlideShowWindows(1).View.Slide
      } elseif ($ppt.Windows.Count -gt 0) {
        $slide = $ppt.ActiveWindow.View.Slide
      }
      if (-not $slide) { '' ; exit }
      foreach ($shape in $slide.NotesPage.Shapes) {
        if ($shape.PlaceholderFormat.Type -eq 2 -and $shape.HasTextFrame) {
          $shape.TextFrame.TextRange.Text
          exit
        }
      }
      ''
    `.trim();
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    return runScript(`powershell -NoProfile -EncodedCommand ${encoded}`);
  }

  // Linux has no PowerPoint/Keynote automation surface.
  return Promise.resolve(null);
}

let notesTimer = null;
let notesPrefs = { enabled: false };
let lastSentNotes = null;

const NOTES_INTERVAL_MS = 1500;

function shouldSendNotes() {
  return notesPrefs.enabled && !!sessionFeatures.speakerNotesEnabled && !!showToken;
}

async function pollSpeakerNotes() {
  if (!socket || !socket.connected || !showToken) return;

  const notes = await readSpeakerNotes(currentTargetApp);
  if (notes === null || notes === lastSentNotes) return;

  lastSentNotes = notes;
  socket.emit('set-show-notes', {
    code: connection.sessionCode,
    token: showToken,
    notes
  });
  send('notes-sent', { notes });
}

function startNotes() {
  if (notesTimer) return;
  if (process.platform === 'linux') {
    send('error', { message: 'Speaker notes require PowerPoint or Keynote and are not available on Linux.' });
    return;
  }
  lastSentNotes = null;
  pollSpeakerNotes();
  notesTimer = setInterval(pollSpeakerNotes, NOTES_INTERVAL_MS);
  send('notes-state', { active: true });
}

function stopNotes() {
  if (notesTimer) {
    clearInterval(notesTimer);
    notesTimer = null;
  }
  send('notes-state', { active: false });
}

function syncNotes() {
  if (shouldSendNotes()) {
    startNotes();
  } else {
    stopNotes();
  }
}

// --- Window ---------------------------------------------------------------

function createWindow() {
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, '../build/icon.png')
    : path.join(__dirname, '../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 620,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: iconPath,
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
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
  stopCapture();
  stopNotes();
  if (socket) {
    socket.disconnect();
  }
  app.quit();
});

// --- IPC ------------------------------------------------------------------

ipcMain.handle('get-platform', async () => process.platform);

ipcMain.handle('load-preferences', async () => {
  const prefs = loadPreferences();
  return {
    serverUrl: prefs.serverUrl || 'http://localhost:3000',
    targetApp: prefs.targetApp || 'focused',
    captureEnabled: prefs.captureEnabled || false,
    captureHeight: prefs.captureHeight || 400,
    captureScreenId: prefs.captureScreenId || null,
    notesEnabled: prefs.notesEnabled || false
  };
});

ipcMain.handle('save-preferences', async (event, patch) => savePreferences(patch));

ipcMain.handle('list-screens', async () => {
  try {
    return { success: true, screens: await listScreens(), blocked: screenCaptureBlocked() };
  } catch (error) {
    return { success: false, error: error.message, screens: [] };
  }
});

ipcMain.handle('set-capture', async (event, prefs) => {
  capturePrefs = { ...capturePrefs, ...prefs };
  savePreferences({
    captureEnabled: capturePrefs.enabled,
    captureHeight: capturePrefs.height,
    captureScreenId: capturePrefs.screenId
  });
  // Restart so a resolution or screen change takes effect immediately.
  stopCapture();
  syncCapture();
  return { success: true, active: !!captureTimer, screenshotEnabled: !!sessionFeatures.screenshotEnabled };
});

ipcMain.handle('set-notes-forwarding', async (event, prefs) => {
  notesPrefs = { ...notesPrefs, ...prefs };
  savePreferences({ notesEnabled: notesPrefs.enabled });
  stopNotes();
  syncNotes();
  return {
    success: true,
    active: !!notesTimer,
    speakerNotesEnabled: !!sessionFeatures.speakerNotesEnabled,
    supported: process.platform !== 'linux'
  };
});

ipcMain.handle('send-command', async (event, direction) => {
  if (!socket || !socket.connected || !showToken) {
    return { success: false, error: 'Not connected to a session' };
  }
  socket.emit(direction === 'prev' ? 'prev' : 'next', {
    code: connection.sessionCode,
    token: showToken
  });
  return { success: true };
});

ipcMain.handle('connect', async (event, { serverUrl, sessionCode, targetApp }) => {
  try {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    stopCapture();
    stopNotes();
    showToken = null;
    sessionFeatures = {};

    // Key injection is optional: without robotjs the app still works as a cue
    // display, manual clicker, screen caster, and speaker-notes bridge.
    if (!robot) {
      send('error', {
        message: 'Keyboard injection unavailable (robotjs did not load). Manual arrows, screen casting, and speaker notes still work.'
      });
    }

    const parsed = parseSessionInput(sessionCode, serverUrl);
    if (!parsed.sessionCode) {
      return { success: false, error: 'Enter a session code or paste a cue link' };
    }

    connection = { serverUrl: parsed.serverUrl, sessionCode: parsed.sessionCode };
    currentTargetApp = targetApp || 'focused';
    savePreferences({ serverUrl: connection.serverUrl, targetApp: currentTargetApp });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      // Sessions survive server restarts, so keep retrying indefinitely
      // rather than giving up after a few seconds.
      socket = io(connection.serverUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000
      });

      socket.on('connect', () => {
        console.log('Connected to server');
        send('connection-status', { status: 'connected' });
        socket.emit('join-session', { code: connection.sessionCode, role: 'show-client' });
      });

      socket.on('session-joined', ({ token, features }) => {
        console.log('Joined session successfully');
        showToken = token;
        sessionFeatures = features || {};
        send('connection-status', {
          status: 'joined',
          code: connection.sessionCode,
          serverUrl: connection.serverUrl,
          features: sessionFeatures
        });
        syncCapture();
        syncNotes();
        finish({ success: true, code: connection.sessionCode, serverUrl: connection.serverUrl });
      });

      socket.on('features-changed', ({ features }) => {
        sessionFeatures = features || {};
        send('features-changed', { features: sessionFeatures });
        syncCapture();
        syncNotes();
      });

      socket.on('advance', ({ direction }) => {
        console.log(`Advancing: ${direction}`);
        injectKey(direction);
      });

      socket.on('session-ended', () => {
        console.log('Session ended');
        stopCapture();
        stopNotes();
        showToken = null;
        send('connection-status', {
          status: 'ended',
          message: 'Session ended by producer.'
        });
        socket.disconnect();
      });

      socket.on('error', ({ message }) => {
        console.error('Socket error:', message);
        send('connection-status', { status: 'error', message });
        finish({ success: false, error: message });
      });

      socket.io.on('reconnect_attempt', (attempt) => {
        send('connection-status', { status: 'reconnecting', attempt });
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        send('connection-status', { status: 'reconnecting', message: error.message });
        // Don't settle: socket.io keeps retrying and the session is still
        // alive server-side. Only the join timeout below gives up.
      });

      socket.on('disconnect', () => {
        console.log('Disconnected');
        stopCapture();
        stopNotes();
        showToken = null;
        send('connection-status', { status: 'reconnecting', message: 'Connection lost. Reconnecting…' });
      });

      setTimeout(() => finish({ success: false, error: 'Timed out waiting to join the session' }), 15000);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect', async () => {
  stopCapture();
  stopNotes();
  showToken = null;
  sessionFeatures = {};
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  return { success: true };
});
