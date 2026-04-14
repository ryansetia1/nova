const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novaBrowser', {
  navigate: (url) => ipcRenderer.send('browser-navigate', url),
  goBack: () => ipcRenderer.send('browser-go-back'),
  goForward: () => ipcRenderer.send('browser-go-forward'),
  refresh: () => ipcRenderer.send('browser-refresh'),

  onUrlChanged: (cb) => ipcRenderer.on('browser-url-changed', (_, url) => cb(url)),
  onLoadingChanged: (cb) => ipcRenderer.on('browser-loading-changed', (_, loading) => cb(loading)),
  onNavStateChanged: (cb) => ipcRenderer.on('browser-nav-state-changed', (_, state) => cb(state)),
});
