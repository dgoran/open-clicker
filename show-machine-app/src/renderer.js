const sessionInput = document.getElementById('session-code');
const serverInput = document.getElementById('server-url');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusPill = document.getElementById('status-pill');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const logEl = document.getElementById('log');
const targetAppSelect = document.getElementById('target-app');
const keynoteOption = document.getElementById('keynote-option');
const castToggle = document.getElementById('cast-toggle');
const castHint = document.getElementById('cast-hint');
const notesToggle = document.getElementById('notes-toggle');
const notesHint = document.getElementById('notes-hint');
const qualitySlider = document.getElementById('quality-slider');
const qualityRes = document.getElementById('quality-res');
const qualityBw = document.getElementById('quality-bw');
const screenList = document.getElementById('screen-list');

const HEIGHTS = [240, 400, 600, 800, 1080];

let isConnected = false;
let selectedScreenId = null;
let features = {};

function log(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;

  const time = document.createElement('span');
  time.className = 't';
  time.textContent = new Date().toLocaleTimeString();

  const text = document.createElement('span');
  text.textContent = message;

  line.appendChild(time);
  line.appendChild(text);
  logEl.insertBefore(line, logEl.firstChild);

  while (logEl.children.length > 200) {
    logEl.removeChild(logEl.lastChild);
  }
}

function setStatus(text, kind = '') {
  statusPill.textContent = text;
  statusPill.className = `status-pill ${kind}`;
}

function setConnected(connected) {
  isConnected = connected;
  connectBtn.textContent = connected ? 'Reconnect' : '(Re)Connect';
  disconnectBtn.disabled = !connected;
  prevBtn.disabled = !connected;
  nextBtn.disabled = !connected;
}

// Both extras need the producer to switch the feature on for the session.
function refreshFeatureHints() {
  const castOn = !!features.screenshotEnabled;
  castToggle.disabled = !castOn;
  castHint.textContent = castOn
    ? 'Screenshots are enabled for this session.'
    : 'The producer must enable the screenshot feature for this session.';

  const notesOn = !!features.speakerNotesEnabled;
  notesToggle.disabled = !notesOn;
  notesHint.textContent = notesOn
    ? 'Speaker notes are enabled for this session.'
    : 'The producer must enable speaker notes for this session.';
}

window.addEventListener('DOMContentLoaded', async () => {
  const platform = await window.electronAPI.getPlatform();
  if (platform !== 'darwin' && keynoteOption) {
    keynoteOption.disabled = true;
    keynoteOption.textContent = 'Keynote (macOS only)';
  }

  window.electronAPI.getVersion().then((v) => {
    document.getElementById('versionStamp').textContent = 'v' + v;
  });

  const prefs = await window.electronAPI.loadPreferences();
  serverInput.value = prefs.serverUrl;
  targetAppSelect.value = prefs.targetApp === 'keynote' && platform !== 'darwin' ? 'focused' : prefs.targetApp;
  castToggle.checked = prefs.captureEnabled;
  notesToggle.checked = prefs.notesEnabled;
  selectedScreenId = prefs.captureScreenId;

  const sliderIndex = HEIGHTS.indexOf(prefs.captureHeight);
  qualitySlider.value = sliderIndex === -1 ? 1 : sliderIndex;
  qualityRes.textContent = `${HEIGHTS[qualitySlider.value]}p`;

  if (platform === 'linux') {
    notesToggle.disabled = true;
    notesHint.textContent = 'Speaker notes require PowerPoint or Keynote (not available on Linux).';
  }

  // Restoring the checkboxes is not enough: the main process starts with both
  // features off, so push the restored preferences through as well.
  pushCapturePrefs();
  window.electronAPI.setNotesForwarding({ enabled: notesToggle.checked });

  refreshFeatureHints();
  loadScreens();
  log(`Open Clicker Show Machine ready (${platform})`, 'success');
});

async function loadScreens() {
  const result = await window.electronAPI.listScreens();
  if (!result.success) {
    screenList.innerHTML = `<div class="empty">Could not list screens: ${result.error}</div>`;
    return;
  }
  if (result.screens.length === 0) {
    screenList.innerHTML = '<div class="empty">No screens found</div>';
    return;
  }

  screenList.innerHTML = '';
  result.screens.forEach((screen, index) => {
    if (!selectedScreenId && index === 0) selectedScreenId = screen.id;

    const item = document.createElement('div');
    item.className = `screen-item${screen.id === selectedScreenId ? ' selected' : ''}`;

    const img = document.createElement('img');
    img.src = screen.thumbnail;
    const name = document.createElement('span');
    name.textContent = screen.name;

    item.appendChild(img);
    item.appendChild(name);
    item.addEventListener('click', () => {
      selectedScreenId = screen.id;
      Array.from(screenList.children).forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      pushCapturePrefs();
      log(`Casting screen: ${screen.name}`);
    });

    screenList.appendChild(item);
  });
}

function pushCapturePrefs() {
  return window.electronAPI.setCapture({
    enabled: castToggle.checked,
    screenId: selectedScreenId,
    height: HEIGHTS[qualitySlider.value]
  });
}

connectBtn.addEventListener('click', async () => {
  const sessionValue = sessionInput.value.trim();
  if (!sessionValue) {
    setStatus('Enter a code or cue link', 'err');
    log('Enter a session code or paste a cue link', 'error');
    return;
  }

  connectBtn.disabled = true;
  setStatus('Connecting…', 'warn');
  log('Connecting…');

  try {
    const result = await window.electronAPI.connect(
      serverInput.value.trim(),
      sessionValue,
      targetAppSelect.value
    );

    if (result.success) {
      setConnected(true);
      serverInput.value = result.serverUrl;
      sessionInput.value = result.code;
      setStatus(`Joined ${result.code}`, 'live');
      log(`Joined session ${result.code}`, 'success');
    } else {
      setStatus(result.error || 'Failed to connect', 'err');
      log(result.error || 'Failed to connect', 'error');
    }
  } catch (error) {
    setStatus(error.message, 'err');
    log(error.message, 'error');
  } finally {
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', async () => {
  await window.electronAPI.disconnect();
  setConnected(false);
  features = {};
  refreshFeatureHints();
  setStatus('Not connected');
  log('Disconnected', 'warning');
});

prevBtn.addEventListener('click', () => sendCommand('prev'));
nextBtn.addEventListener('click', () => sendCommand('next'));

async function sendCommand(direction) {
  const result = await window.electronAPI.sendCommand(direction);
  if (!result.success) {
    log(result.error, 'error');
  }
}

castToggle.addEventListener('change', async () => {
  const result = await pushCapturePrefs();
  log(result.active ? 'Screen casting started' : 'Screen casting stopped', result.active ? 'success' : 'warning');
});

notesToggle.addEventListener('change', async () => {
  const result = await window.electronAPI.setNotesForwarding({ enabled: notesToggle.checked });
  if (!result.supported) {
    log('Speaker notes are not available on this platform', 'error');
    return;
  }
  log(result.active ? 'Sending speaker notes to presenters' : 'Stopped sending speaker notes', result.active ? 'success' : 'warning');
});

qualitySlider.addEventListener('input', () => {
  qualityRes.textContent = `${HEIGHTS[qualitySlider.value]}p`;
});
qualitySlider.addEventListener('change', pushCapturePrefs);

targetAppSelect.addEventListener('change', () => {
  window.electronAPI.savePreferences({ targetApp: targetAppSelect.value });
  log(`Target app: ${targetAppSelect.options[targetAppSelect.selectedIndex].text}`);
});

window.electronAPI.onConnectionStatus((data) => {
  switch (data.status) {
    case 'connected':
      setStatus('Connected, joining…', 'warn');
      break;
    case 'joined':
      setConnected(true);
      features = data.features || {};
      refreshFeatureHints();
      setStatus(`Joined ${data.code}`, 'live');
      break;
    case 'reconnecting':
      setStatus('Reconnecting…', 'warn');
      if (isConnected) {
        log(data.message || 'Connection lost, retrying…', 'warning');
      }
      break;
    case 'ended':
      setConnected(false);
      setStatus('Session ended', 'warn');
      log(data.message || 'Session ended by producer', 'warning');
      break;
    case 'error':
      setStatus(data.message || 'Error', 'err');
      log(data.message || 'Error', 'error');
      break;
  }
});

window.electronAPI.onFeaturesChanged((data) => {
  features = data.features || {};
  refreshFeatureHints();
  log('Session features updated');
});

window.electronAPI.onKeyPressed(({ direction }) => {
  log(direction === 'next' ? '→  Right Arrow' : '←  Left Arrow', direction);
});

window.electronAPI.onCaptureStats(({ height, kbPerSecond }) => {
  qualityRes.textContent = `${height}p`;
  qualityBw.textContent = `${kbPerSecond} KB/s`;
});

window.electronAPI.onCaptureState(({ active }) => {
  if (!active) qualityBw.textContent = '–';
});

window.electronAPI.onNotesSent(({ notes }) => {
  const preview = notes.replace(/\s+/g, ' ').trim();
  log(preview ? `Notes sent: ${preview.slice(0, 60)}${preview.length > 60 ? '…' : ''}` : 'Notes cleared');
});

window.electronAPI.onError(({ message }) => {
  setStatus(message, 'err');
  log(message, 'error');
});
