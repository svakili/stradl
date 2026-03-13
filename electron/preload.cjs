const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stradlDesktop', {
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  applyUpdate: () => ipcRenderer.invoke('updates:apply'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('desktop:update-status', handler);
    return () => ipcRenderer.removeListener('desktop:update-status', handler);
  },
});
