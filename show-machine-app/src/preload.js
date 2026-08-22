const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  connect: (serverUrl, sessionCode, targetApp) => ipcRenderer.invoke('connect', { serverUrl, sessionCode, targetApp }),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  saveTargetApp: (targetApp) => ipcRenderer.invoke('save-target-app', targetApp),
  loadTargetApp: () => ipcRenderer.invoke('load-target-app'),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, data) => callback(data)),
  onKeyPressed: (callback) => ipcRenderer.on('key-pressed', (event, data) => callback(data)),
  onError: (callback) => ipcRenderer.on('error', (event, data) => callback(data))
});
