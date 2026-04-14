const { app, BrowserWindow, shell, Notification, ipcMain, dialog } = require('electron');
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
