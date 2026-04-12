const { app, BrowserWindow, shell, Notification } = require('electron');
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

// Import and start the existing Express+WebSocket server
// server.js exports nothing — only start it internally in production
if (app.isPackaged) {
  require('./server.js');
}

let mainWindow;

function createWindow() {
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
    },
    icon: path.join(__dirname, 'public/assets/icon/nova-icon.png'),
  });

  // Wait for server to be ready then load the app
  // Server starts on port 3000, load it via localhost
  mainWindow.loadURL('http://localhost:3000');

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
  // Small delay to ensure Express server is ready
  setTimeout(createWindow, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
