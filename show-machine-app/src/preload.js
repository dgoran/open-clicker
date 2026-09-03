const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  connect: (serverUrl, sessionCode, targetApp) => ipcRenderer.invoke('connect', { serverUrl, sessionCode, targetApp }),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  loadPreferences: () => ipcRenderer.invoke('load-preferences'),
  savePreferences: (patch) => ipcRenderer.invoke('save-preferences', patch),
  sendCommand: (direction) => ipcRenderer.invoke('send-command', direction),
  listScreens: () => ipcRenderer.invoke('list-screens'),
  setCapture: (prefs) => ipcRenderer.invoke('set-capture', prefs),
  setNotesForwarding: (prefs) => ipcRenderer.invoke('set-notes-forwarding', prefs),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, data) => callback(data)),
  onKeyPressed: (callback) => ipcRenderer.on('key-pressed', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('error', (event, data) => callback(data)),
  onFeaturesChanged: (callback) => ipcRenderer.on('features-changed', (event, data) => callback(data)),
  onCaptureState: (callback) => ipcRenderer.on('capture-state', (event, data) => callback(data)),
  onCaptureStats: (callback) => ipcRenderer.on('capture-stats', (event, data) => callback(data)),
  onNotesSent: (callback) => ipcRenderer.on('notes-sent', (event, data) => callback(data))
});
