const form = document.getElementById('connection-form');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const statusMessage = document.getElementById('status-message');
const connectForm = document.getElementById('connect-form');
const connectedView = document.getElementById('connected-view');
const activityList = document.getElementById('activity-list');
const serverUrlInput = document.getElementById('server-url');
const sessionCodeInput = document.getElementById('session-code');
const targetAppSelect = document.getElementById('target-app');
const keynoteOption = document.getElementById('keynote-option');
const connectedServer = document.getElementById('connected-server');
const connectedCode = document.getElementById('connected-code');

let isConnected = false;

// Initialize platform-specific UI on load
window.addEventListener('DOMContentLoaded', async () => {
  // Get platform and hide/disable Keynote option on non-macOS
  const platform = await window.electronAPI.getPlatform();
  if (platform !== 'darwin') {
    // Remove or disable Keynote option on Windows/Linux
    if (keynoteOption) {
      keynoteOption.disabled = true;
      keynoteOption.textContent = 'Keynote (macOS only - unavailable)';
      keynoteOption.style.color = '#999';
    }
  }

  // Load saved target app preference
  const savedTargetApp = await window.electronAPI.loadTargetApp();
  if (savedTargetApp) {
    targetAppSelect.value = savedTargetApp;
    // If Keynote is selected but platform is not macOS, reset to focused
    if (savedTargetApp === 'keynote' && platform !== 'darwin') {
      targetAppSelect.value = 'focused';
    }
  }
});

// Auto-uppercase session code input
sessionCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// Handle form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const serverUrl = serverUrlInput.value.trim();
  const sessionCode = sessionCodeInput.value.trim().toUpperCase();
  const targetApp = targetAppSelect.value;

  if (!serverUrl || !sessionCode) {
    showStatus('Please fill in all fields', 'error');
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  showStatus('Connecting to server...', 'info');

  try {
    // Save target app preference
    await window.electronAPI.saveTargetApp(targetApp);
    
    const result = await window.electronAPI.connect(serverUrl, sessionCode, targetApp);
    
    if (result.success) {
      isConnected = true;
      connectForm.classList.add('hidden');
      connectedView.classList.add('show');
      connectedServer.textContent = serverUrl;
      connectedCode.textContent = sessionCode;
      
      // Update status message based on target app
      let targetText = '';
      if (targetApp === 'powerpoint') {
        targetText = ' Controlling PowerPoint.';
      } else if (targetApp === 'keynote') {
        targetText = ' Controlling Keynote.';
      } else {
        targetText = ' Focus your presentation window.';
      }
      
      showStatus('Connected!' + targetText + ' Clicks from the clicker will inject arrow keys.', 'success');
      addActivity('Connected to session', 'success');
      if (targetApp !== 'focused') {
        addActivity(`Target: ${targetApp === 'powerpoint' ? 'PowerPoint' : 'Keynote'}`, 'info');
      }
    } else {
      showStatus(result.error || 'Failed to connect', 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect';
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
  }
});

// Handle disconnect button
disconnectBtn.addEventListener('click', async () => {
  disconnectBtn.disabled = true;
  disconnectBtn.textContent = 'Disconnecting...';
  
  await window.electronAPI.disconnect();
  
  isConnected = false;
  connectForm.classList.remove('hidden');
  connectedView.classList.remove('show');
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect';
  disconnectBtn.disabled = false;
  disconnectBtn.textContent = 'Disconnect';
  activityList.innerHTML = '';
  showStatus('Disconnected', 'info');
});

// Listen for connection status updates
window.electronAPI.onConnectionStatus((data) => {
  console.log('Connection status:', data);
  
  switch (data.status) {
    case 'connected':
      showStatus('Connected to server...', 'info');
      break;
    case 'joined':
      showStatus(data.message || 'Connected successfully!', 'success');
      addActivity('Session joined successfully', 'success');
      break;
    case 'disconnected':
      showStatus(data.message || 'Disconnected', 'warning');
      if (isConnected) {
        addActivity(data.message || 'Disconnected from server', 'warning');
        // Auto-reset to connection form
        setTimeout(() => {
          isConnected = false;
          connectForm.classList.remove('hidden');
          connectedView.classList.remove('show');
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          activityList.innerHTML = '';
        }, 2000);
      }
      break;
    case 'error':
      showStatus(data.message || 'Connection error', 'error');
      addActivity(data.message || 'Error occurred', 'error');
      break;
  }
});

// Listen for key press events
window.electronAPI.onKeyPressed((data) => {
  console.log('Key pressed:', data);
  const direction = data.direction;
  const arrow = direction === 'next' ? '→' : '←';
  const key = direction === 'next' ? 'Right' : 'Left';
  addActivity(`${arrow} ${key} Arrow`, direction);
});

// Listen for errors
window.electronAPI.onError((data) => {
  console.error('Error:', data);
  showStatus(data.message, 'error');
  addActivity(data.message, 'error');
});

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type} show`;
  
  // Auto-hide after 5 seconds for non-error messages
  if (type !== 'error') {
    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 5000);
  }
}

function addActivity(message, type = 'info') {
  const item = document.createElement('div');
  item.className = `activity-item ${type}`;
  
  const icon = document.createElement('span');
  icon.className = 'icon';
  
  switch (type) {
    case 'next':
      icon.textContent = '→';
      break;
    case 'prev':
      icon.textContent = '←';
      break;
    case 'success':
      icon.textContent = '✓';
      break;
    case 'error':
      icon.textContent = '✗';
      break;
    case 'warning':
      icon.textContent = '⚠';
      break;
    default:
      icon.textContent = 'ℹ';
  }
  
  const text = document.createElement('span');
  text.textContent = message;
  
  const time = document.createElement('span');
  time.style.marginLeft = 'auto';
  time.style.fontSize = '11px';
  time.style.opacity = '0.6';
  time.textContent = new Date().toLocaleTimeString();
  
  item.appendChild(icon);
  item.appendChild(text);
  item.appendChild(time);
  
  activityList.insertBefore(item, activityList.firstChild);
  
  // Keep only last 50 items
  while (activityList.children.length > 50) {
    activityList.removeChild(activityList.lastChild);
  }
}
