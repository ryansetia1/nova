const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // Browser window management for interactive iframes
  openBrowserWindow: (ambientId, url, width, height) => 
    ipcRenderer.invoke('open-browser-window', { ambientId, url, width, height }),
  closeBrowserWindow: (ambientId) => 
    ipcRenderer.invoke('close-browser-window', ambientId),
  focusBrowserWindow: (ambientId) => 
    ipcRenderer.invoke('focus-browser-window', ambientId)
});
