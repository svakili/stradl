import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { createDesktopUpdater } from './updater.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let serverHandle = null;
let updater = null;

function getCanonicalDataDir() {
  return path.join(app.getPath('appData'), 'Stradl');
}

function getBundledDistPath() {
  return path.join(app.getAppPath(), 'dist');
}

function getInstalledAppBundlePath() {
  const executablePath = app.getPath('exe');
  if (executablePath.includes('.app/Contents/MacOS/')) {
    return path.resolve(executablePath, '..', '..', '..');
  }
  return app.getAppPath();
}

function canSelfUpdate() {
  if (process.platform !== 'darwin') return false;
  if (!app.isPackaged) {
    return process.env.STRADL_ENABLE_DESKTOP_UPDATE === 'true';
  }

  const installedPath = getInstalledAppBundlePath();
  return installedPath.startsWith(path.join(os.homedir(), 'Applications'));
}

async function startEmbeddedServer() {
  process.env.STRADL_DATA_DIR = getCanonicalDataDir();
  const { startServer } = await import(new URL('../server/dist/app.js', import.meta.url));
  return startServer({
    host: '127.0.0.1',
    port: 0,
    distPath: getBundledDistPath(),
  });
}

async function snapshotData(reason) {
  if (!serverHandle) {
    throw new Error('Server is not running.');
  }

  const response = await fetch(`http://127.0.0.1:${serverHandle.port}/api/data/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to snapshot data before update.');
  }

  return response.json();
}

function createMainWindow() {
  if (!serverHandle) {
    throw new Error('Server must be started before creating the window.');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'Stradl',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  void mainWindow.loadURL(`http://127.0.0.1:${serverHandle.port}`);
}

function registerIpcHandlers() {
  ipcMain.handle('runtime:get-info', async () => ({
    mode: 'desktop-local',
    appVersion: app.getVersion(),
    canSelfUpdate: canSelfUpdate(),
  }));

  ipcMain.handle('updates:check', async () => {
    if (!updater) {
      throw new Error('Updater is unavailable.');
    }
    return updater.checkForUpdates();
  });

  ipcMain.handle('updates:apply', async () => {
    if (!updater) {
      throw new Error('Updater is unavailable.');
    }
    return updater.applyUpdate();
  });

  ipcMain.handle('updates:status', async () => {
    if (!updater) {
      return { state: 'idle', step: 'idle' };
    }
    return updater.getStatus();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  serverHandle?.server.close();
});

await app.whenReady();

serverHandle = await startEmbeddedServer();
updater = createDesktopUpdater({
  app,
  appBundlePath: getInstalledAppBundlePath(),
  dataDir: getCanonicalDataDir(),
  canSelfUpdate,
  snapshotData,
});

updater.onStatus((status) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('desktop:update-status', status);
  }
});

registerIpcHandlers();
createMainWindow();
