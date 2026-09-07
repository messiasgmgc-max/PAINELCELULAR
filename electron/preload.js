const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates-manually'),
  onUpdaterStatus: (callback) => {
    ipcRenderer.on('updater-status', (_event, status, data) => callback(status, data));
  },
  onUpdaterProgress: (callback) => {
    ipcRenderer.on('updater-progress', (_event, progress) => callback(progress));
  },
  isElectron: true,
});
