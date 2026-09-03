const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { io } = require('socket.io-client');
const { exec, execFile } = require('child_process');
const { parseSessionTarget } = require('./parse-session-target');
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
let capturePrefs = null;
let notesPrefs = null;
let lastFrameHash = null;
let captureInFlight = false;
let lastSendAt = 0;

// Capture and notes reads are cheap (~75ms and ~120ms), so the old fixed
// intervals were nearly all of the delay. Poll tightly for a few seconds
// after anything changes, then idle back down to keep CPU low on a static
// slide.
const CAPTURE_FAST_GAP_MS = 80;
// Idle polling only exists to catch slides advanced inside PowerPoint itself;
// clicks wake the fast loop directly, so this can stay slow and unobtrusive.
const CAPTURE_IDLE_GAP_MS = 3000;
const ACTIVITY_WINDOW_MS = 4000;
const JPEG_QUALITY = 60;

let lastActivityAt = 0;

function markActivity() {
  lastActivityAt = Date.now();
}

function recentlyActive() {
  return Date.now() - lastActivityAt < ACTIVITY_WINDOW_MS;
}

// A self-pacing poll loop: each pass is scheduled only after the previous one
// finishes, tightly while recently active and slowly otherwise. `running` is
// the state; the timer handle is just the pending pass.
function makePoller({ tick, shouldRun, fastGapMs, idleGapMs, stateChannel, onStart, onStop }) {
  let running = false;
  let timer = null;

  function schedule(delay) {
    timer = setTimeout(async () => {
      await tick();
      if (running && shouldRun()) {
        schedule(recentlyActive() ? fastGapMs : idleGapMs);
      } else {
        stop();
      }
    }, delay);
  }

  function start() {
    if (running) return;
    if (onStart && onStart() === false) return;
    running = true;
    markActivity();
    schedule(0);
    send(stateChannel, { active: true });
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
    if (onStop) onStop();
    send(stateChannel, { active: false });
  }

  return {
    start,
    stop,
    sync() { (shouldRun() ? start : stop)(); },
    get active() { return running; }
  };
}

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

// Speaker notes come from PowerPoint/Keynote automation, which Linux lacks.
const NOTES_SUPPORTED = process.platform !== 'linux';

// Restore the casting and notes preferences at startup, so a switch that was
// on last time is on again without the renderer having to push it back.
{
  const saved = loadPreferences();
  capturePrefs = {
    enabled: !!saved.captureEnabled,
    screenId: saved.captureScreenId || null,
    height: saved.captureHeight || 400
  };
  notesPrefs = { enabled: !!saved.notesEnabled };
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
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

    socket.emit('screenshot-upload', {
      code: connection.sessionCode,
      token: showToken,
      screenshot: `data:image/jpeg;base64,${jpeg.toString('base64')}`
    });

    const now = Date.now();
    const elapsedS = lastSendAt ? Math.max(0.05, (now - lastSendAt) / 1000) : 1;
    lastSendAt = now;
    send('capture-stats', {
      height,
      kbPerSecond: Math.round(jpeg.length / 1024 / elapsedS)
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

const capturePoller = makePoller({
  tick: captureAndSend,
  shouldRun: shouldCapture,
  fastGapMs: CAPTURE_FAST_GAP_MS,
  idleGapMs: CAPTURE_IDLE_GAP_MS,
  stateChannel: 'capture-state',
  onStart() {
    if (screenCaptureBlocked()) {
      send('error', {
        message: 'Screen Recording permission is required. Grant it in System Settings > Privacy & Security > Screen Recording, then restart the app.'
      });
      return false;
    }
  },
  onStop() {
    lastFrameHash = null;
    lastSendAt = 0;
  }
});

function stopCapture() { capturePoller.stop(); }
function syncCapture() { capturePoller.sync(); }

// --- Speaker notes --------------------------------------------------------

// Reads the current slide's speaker notes out of the presentation app so the
// remote presenter can read them on their phone while presenting.
// execFile, not exec: a multi-line script passed through a shell has its
// newlines mangled into literal backslash-n, which osascript rejects.
// Returns {ok, text} or {ok: false, error} so failures can be reported
// instead of silently looking like "no notes".
function runScript(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || error.message || '').split('\n')[0].trim();
        resolve({ ok: false, error: detail || 'script failed' });
        return;
      }
      resolve({ ok: true, text: stdout.trim() });
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
      return runScript('osascript', ['-e', script]);
    }

    // The notes page has no text frame of its own: the text sits in one of its
    // shapes (the slide image and the slide number are shapes too). Scan them
    // and take the longest non-numeric string, which skips the slide number.
    const script = [
      'tell application "Microsoft PowerPoint"',
      'if not (exists active presentation) then return ""',
      'set n to 0',
      'try',
      'set n to slide index of slide of slide show view of slide show window 1',
      'on error',
      'try',
      'set n to slide index of slide of view of document window 1',
      'end try',
      'end try',
      'if n is 0 then return ""',
      'set theNotes to ""',
      'set shapeCount to count of shapes of notes page of slide n of active presentation',
      'repeat with i from 1 to shapeCount',
      'try',
      'set t to content of text range of text frame of shape i of notes page of slide n of active presentation',
      'if t is not missing value and t is not "" then',
      'try',
      'set numCheck to t as number',
      'on error',
      'if (length of t) > (length of theNotes) then set theNotes to t',
      'end try',
      'end if',
      'end try',
      'end repeat',
      'return theNotes',
      'end tell'
    ].join('\n');
    return runScript('osascript', ['-e', script]);
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
    return runScript('powershell', ['-NoProfile', '-EncodedCommand', encoded]);
  }

  // Linux has no PowerPoint/Keynote automation surface.
  return Promise.resolve({ ok: false, error: 'not supported on this platform' });
}

let lastSentNotes = null;
let lastNotesError = null;

const NOTES_FAST_GAP_MS = 100;
const NOTES_IDLE_GAP_MS = 3000;

function shouldSendNotes() {
  return notesPrefs.enabled && !!sessionFeatures.speakerNotesEnabled && !!showToken;
}

async function pollSpeakerNotes() {
  if (!socket || !socket.connected || !showToken) return;

  const result = await readSpeakerNotes(currentTargetApp);

  if (!result.ok) {
    // Report the first failure (and any new one) rather than looking like a
    // deck with no notes.
    if (result.error !== lastNotesError) {
      lastNotesError = result.error;
      send('error', { message: `Could not read speaker notes: ${result.error}` });
    }
    return;
  }
  lastNotesError = null;

  const notes = result.text;
  if (notes === lastSentNotes) return;

  lastSentNotes = notes;
  // Notes changed, so the deck moved; keep both loops in fast mode.
  markActivity();
  socket.emit('set-show-notes', {
    code: connection.sessionCode,
    token: showToken,
    notes
  });
  send('notes-sent', { notes });
}

const notesPoller = makePoller({
  tick: pollSpeakerNotes,
  shouldRun: shouldSendNotes,
  fastGapMs: NOTES_FAST_GAP_MS,
  idleGapMs: NOTES_IDLE_GAP_MS,
  stateChannel: 'notes-state',
  onStart() {
    if (!NOTES_SUPPORTED) {
      send('error', { message: 'Speaker notes require PowerPoint or Keynote and are not available on Linux.' });
      return false;
    }
    lastSentNotes = null;
    lastNotesError = null;
  }
});

function stopNotes() { notesPoller.stop(); }
function syncNotes() { notesPoller.sync(); }

// Everything tied to the current session; called whenever we leave it for
// any reason so the next join starts clean.
function leaveSession() {
  stopCapture();
  stopNotes();
  showToken = null;
  sessionFeatures = {};
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

ipcMain.handle('get-version', async () => app.getVersion());

ipcMain.handle('load-preferences', async () => {
  const prefs = loadPreferences();
  return {
    serverUrl: prefs.serverUrl || 'http://localhost:3000',
    targetApp: prefs.targetApp || 'focused',
    captureEnabled: capturePrefs.enabled,
    captureHeight: capturePrefs.height,
    captureScreenId: capturePrefs.screenId,
    notesEnabled: notesPrefs.enabled,
    notesSupported: NOTES_SUPPORTED
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
  return { success: true, active: capturePoller.active };
});

ipcMain.handle('set-notes-forwarding', async (event, prefs) => {
  notesPrefs = { ...notesPrefs, ...prefs };
  savePreferences({ notesEnabled: notesPrefs.enabled });
  stopNotes();
  syncNotes();
  return { success: true, active: notesPoller.active, supported: NOTES_SUPPORTED };
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
    leaveSession();

    // Key injection is optional: without robotjs the app still works as a cue
    // display, manual clicker, screen caster, and speaker-notes bridge.
    if (!robot) {
      send('error', {
        message: 'Keyboard injection unavailable (robotjs did not load). Manual arrows, screen casting, and speaker notes still work.'
      });
    }

    const parsed = parseSessionTarget(sessionCode, serverUrl);
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
        markActivity();
        injectKey(direction);
      });

      socket.on('session-ended', () => {
        console.log('Session ended');
        leaveSession();
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
        leaveSession();
        send('connection-status', { status: 'reconnecting', message: 'Connection lost. Reconnecting…' });
      });

      setTimeout(() => finish({ success: false, error: 'Timed out waiting to join the session' }), 15000);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect', async () => {
  leaveSession();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  return { success: true };
});
