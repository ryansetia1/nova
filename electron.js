const { app, BrowserWindow, BrowserView, shell, Notification, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// In production, use userData path for writable files
if (app.isPackaged) {
  const userDataPath = app.getPath('userData');

  // Set environment variable so server.js can use the correct paths
  process.env.NOVA_DATA_PATH = userDataPath;

  // Copy default files to userData if they don't exist yet
  const filesToInit = ['walkable_path.json', 'anchor_config.json'];
  filesToInit.forEach(file => {
    const dest = path.join(userDataPath, file);
    const src = path.join(__dirname, file);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  });

  // Copy workspace templates if they don't exist yet
  const workspacesDir = path.join(userDataPath, 'workspaces');
  
  // Try extraResources first (packaged app), then fall back to __dirname (dev)
  const srcWorkspacesFromResources = path.join(process.resourcesPath, 'workspaces');
  const srcWorkspacesFromDev = path.join(__dirname, 'workspaces');
  
  let srcWorkspaces = null;
  if (fs.existsSync(srcWorkspacesFromResources)) {
    srcWorkspaces = srcWorkspacesFromResources;
  } else if (fs.existsSync(srcWorkspacesFromDev)) {
    srcWorkspaces = srcWorkspacesFromDev;
  }
  
  if (!fs.existsSync(workspacesDir) && srcWorkspaces) {
    console.log(`[NOVA] Copying workspaces from ${srcWorkspaces} to ${workspacesDir}`);
    fs.cpSync(srcWorkspaces, workspacesDir, { recursive: true });
  }

  // Ensure projects dir exists in userData
  const projectsDir = path.join(userDataPath, 'projects');
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
}

// Clean stale port file before server starts
if (app.isPackaged) {
  const stalePort = path.join(app.getPath('userData'), '.nova-port');
  try { if (fs.existsSync(stalePort)) fs.unlinkSync(stalePort); } catch (e) {}
}

// Safety net: prevent Electron crash dialog for EADDRINUSE / server init errors
process.on('uncaughtException', (err) => {
  console.error('[NOVA uncaught]', err);
  if (err.code === 'EADDRINUSE') return; // server.js retry handles it
});

// Import and start the existing Express+WebSocket server
if (app.isPackaged) {
  require('./server.js');
}

let mainWindow;

function novaPortFilePath() {
  return path.join(app.getPath('userData'), '.nova-port');
}

/** Packaged app: read port written by server.js; dev: assume 3000 (see npm run electron:dev). */
function readNovaServerPort() {
  if (!app.isPackaged) return 3000;
  try {
    const p = parseInt(fs.readFileSync(novaPortFilePath(), 'utf8').trim(), 10);
    if (Number.isFinite(p) && p > 0 && p < 65536) return p;
  } catch (e) { /* no file yet */ }
  return 3000;
}

function waitForServerPortThenCreateWindow() {
  if (!app.isPackaged) {
    setTimeout(createWindow, 500);
    return;
  }
  const portFile = novaPortFilePath();
  const deadline = Date.now() + 15000;
  const tick = () => {
    if (fs.existsSync(portFile)) {
      setTimeout(createWindow, 150);
      return;
    }
    if (Date.now() > deadline) {
      console.error('NOVA: timed out waiting for embedded server (.nova-port). Is server.js failing?');
      createWindow();
      return;
    }
    setTimeout(tick, 50);
  };
  tick();
}

function createWindow() {
  const port = readNovaServerPort();
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden', // macOS native traffic lights
    trafficLightPosition: { x: 20, y: 20 }, // precision alignment
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'public/preload.js')
    },
    icon: path.join(__dirname, 'public/assets/icon/nova-icon.png'),
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Open external links in default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Handle Fullscreen transitions to adjust padding in renderer
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.executeJavaScript("document.body.classList.add('is-fullscreen'); window.dispatchEvent(new Event('resize'));");
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.executeJavaScript("document.body.classList.remove('is-fullscreen'); window.dispatchEvent(new Event('resize'));");
  });
}

app.whenReady().then(() => {
  waitForServerPortThenCreateWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Folder',
    buttonLabel: 'Select Folder'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Browser window management for interactive iframes
const browserWindows = new Map(); // key: ambientId, value: { win, view }
const TOOLBAR_HEIGHT = 42;

function ensureUrl(url) {
  if (!url) return 'https://google.com';
  if (!url.match(/^https?:\/\//)) return `https://${url}`;
  return url;
}

function createBrowserWindow(ambientId, url, width, height) {
  const validUrl = ensureUrl(url);
  const w = width || 1200;
  const h = height || 800;

  const win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 500,
    minHeight: 300,
    title: 'Nova Browser',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'public/browser-preload.js')
    },
    show: true
  });

  // Load toolbar UI
  win.loadFile(path.join(__dirname, 'public/browser-toolbar.html'));

  // Create BrowserView for web content
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });
  win.setBrowserView(view);

  // Position the view below the toolbar
  const [bw, bh] = win.getContentSize();
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: bw, height: bh - TOOLBAR_HEIGHT });
  view.setAutoResize({ width: true, height: true });

  // Load URL in the view
  view.webContents.loadURL(validUrl).catch(err => {
    console.error('[Nova Browser] Failed to load:', validUrl, err.message);
  });

  // Sync URL changes to toolbar
  const sendNavState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send('browser-nav-state-changed', {
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward()
    });
  };

  view.webContents.on('did-navigate', (e, navUrl) => {
    if (!win.isDestroyed()) {
      win.webContents.send('browser-url-changed', navUrl);
      sendNavState();
    }
  });
  view.webContents.on('did-navigate-in-page', (e, navUrl) => {
    if (!win.isDestroyed()) {
      win.webContents.send('browser-url-changed', navUrl);
      sendNavState();
    }
  });
  view.webContents.on('did-start-loading', () => {
    if (!win.isDestroyed()) win.webContents.send('browser-loading-changed', true);
  });
  view.webContents.on('did-stop-loading', () => {
    if (!win.isDestroyed()) win.webContents.send('browser-loading-changed', false);
  });
  view.webContents.on('page-title-updated', (e, title) => {
    if (!win.isDestroyed()) win.setTitle(`Nova Browser — ${title}`);
  });

  // Open target=_blank links inside the same view instead of external browser
  view.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    view.webContents.loadURL(linkUrl);
    return { action: 'deny' };
  });

  // Toolbar → View IPC
  const wcId = win.webContents.id;
  const onNavigate = (e, navUrl) => { if (e.sender.id === wcId) view.webContents.loadURL(ensureUrl(navUrl)); };
  const onBack = (e) => { if (e.sender.id === wcId) view.webContents.goBack(); };
  const onForward = (e) => { if (e.sender.id === wcId) view.webContents.goForward(); };
  const onRefresh = (e) => { if (e.sender.id === wcId) view.webContents.reload(); };

  ipcMain.on('browser-navigate', onNavigate);
  ipcMain.on('browser-go-back', onBack);
  ipcMain.on('browser-go-forward', onForward);
  ipcMain.on('browser-refresh', onRefresh);

  // Send initial URL once toolbar is ready
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('browser-url-changed', validUrl);
    sendNavState();
  });

  // Handle resize to keep view bounds correct
  win.on('resize', () => {
    if (win.isDestroyed()) return;
    const [cw, ch] = win.getContentSize();
    view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: cw, height: ch - TOOLBAR_HEIGHT });
  });

  // Cleanup
  win.on('closed', () => {
    browserWindows.delete(ambientId);
    ipcMain.removeListener('browser-navigate', onNavigate);
    ipcMain.removeListener('browser-go-back', onBack);
    ipcMain.removeListener('browser-go-forward', onForward);
    ipcMain.removeListener('browser-refresh', onRefresh);
  });

  browserWindows.set(ambientId, { win, view });
  return win;
}

ipcMain.handle('open-browser-window', async (event, { ambientId, url, width, height }) => {
  // Reuse existing window
  if (browserWindows.has(ambientId)) {
    const { win } = browserWindows.get(ambientId);
    if (!win.isDestroyed()) {
      win.focus();
      return { success: true, existed: true };
    }
    browserWindows.delete(ambientId);
  }

  try {
    createBrowserWindow(ambientId, url, width, height);
    return { success: true, existed: false };
  } catch (error) {
    console.error('[Nova Browser] Error creating window:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-browser-window', async (event, ambientId) => {
  if (browserWindows.has(ambientId)) {
    const { win } = browserWindows.get(ambientId);
    if (!win.isDestroyed()) win.close();
    browserWindows.delete(ambientId);
    return { success: true };
  }
  return { success: false, error: 'Window not found' };
});

ipcMain.handle('focus-browser-window', async (event, ambientId) => {
  if (browserWindows.has(ambientId)) {
    const { win } = browserWindows.get(ambientId);
    if (!win.isDestroyed()) {
      win.focus();
      return { success: true };
    }
    browserWindows.delete(ambientId);
  }
  return { success: false, error: 'Window not found' };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
