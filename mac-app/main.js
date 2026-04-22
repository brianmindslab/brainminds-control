const { app, ipcMain, nativeImage, Tray, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ── config ────────────────────────────────────────────────────────────────────

const SERVER     = 'root@116.203.251.28';
const SSH_KEY    = `${process.env.HOME}/.ssh/id_ed25519_personalai`;
const LOCAL_PORT = 13001;   // local tunnel → server:3001
const ORCH_BASE  = `http://localhost:${LOCAL_PORT}`;

// ── state ─────────────────────────────────────────────────────────────────────

let tray      = null;
let win       = null;
let tunnel    = null;
let connected = false;

// ── SSH tunnel ────────────────────────────────────────────────────────────────

function startTunnel() {
  if (tunnel) return;
  tunnel = spawn('ssh', [
    '-i', SSH_KEY,
    '-L', `${LOCAL_PORT}:localhost:3001`,
    '-N', '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    SERVER,
  ]);

  tunnel.on('close', (code) => {
    connected = false;
    tunnel = null;
    updateIcon();
    // Reconnect after 5 s unless app is quitting
    if (!app.isQuitting) setTimeout(startTunnel, 5000);
  });
}

// ── HTTP helpers (promise-based, no axios) ────────────────────────────────────

function orchGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${ORCH_BASE}${path}`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        connected = true;
        updateIcon();
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on('error', (err) => {
      connected = false;
      updateIcon();
      reject(err);
    });
    req.setTimeout(4000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function orchPost(path, body = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost',
      port: LOCAL_PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(opts, (res) => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => { connected = true; updateIcon(); try { resolve(JSON.parse(out)); } catch { resolve({}); } });
    });
    req.on('error', (err) => { connected = false; updateIcon(); reject(err); });
    req.setTimeout(4000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// ── tray icon ─────────────────────────────────────────────────────────────────

let lastState = '';

function iconPath(name) {
  return path.join(__dirname, 'assets', `${name}.png`);
}

function updateIcon(paused) {
  if (!tray) return;
  const state = !connected ? 'disconnected' : paused ? 'paused' : 'running';
  if (state === lastState) return;
  lastState = state;

  const icons = { running: 'icon-running', paused: 'icon-paused', disconnected: 'icon-disconnected' };
  const img = nativeImage.createFromPath(iconPath(icons[state]));
  img.setTemplateImage(true);
  tray.setImage(img);
  tray.setToolTip(state === 'disconnected' ? 'Brainminds — connecting…' : `Brainminds — ${state}`);
}

// ── window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 340,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');

  win.on('blur', () => {
    if (win && !win.webContents.isDevToolsOpened()) win.hide();
  });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    const bounds = tray.getBounds();
    const winBounds = win.getBounds();
    const x = Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2);
    const y = bounds.y + bounds.height + 4;
    win.setPosition(x, y);
    win.show();
    win.focus();
    win.webContents.send('refresh');
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-status', async () => {
  try { return await orchGet('/status'); }
  catch { return { paused: false, agents: [], error: true }; }
});

ipcMain.handle('pause',  async () => { try { return await orchPost('/pause');       } catch { return {}; } });
ipcMain.handle('resume', async () => { try { return await orchPost('/resume');      } catch { return {}; } });
ipcMain.handle('kill',   async (_, n) => { try { return await orchPost(`/kill/${n}`); } catch { return {}; } });

ipcMain.handle('open-browser', async () => {
  shell.openExternal('http://116.203.251.28:3000');
});

ipcMain.on('resize', (_, height) => {
  if (win) win.setSize(340, Math.min(Math.max(height, 200), 600), false);
});

// ── app lifecycle ─────────────────────────────────────────────────────────────

app.dock?.hide();   // hide from dock — menubar app only

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(iconPath('icon-disconnected'));
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Brainminds — connecting…');
  tray.on('click', toggleWindow);

  createWindow();
  startTunnel();

  // Poll for status every 6 s and push to renderer
  setInterval(async () => {
    if (!win?.isVisible()) return;
    try {
      const status = await orchGet('/status');
      updateIcon(status.paused);
      win.webContents.send('status-update', status);
    } catch {
      updateIcon();
    }
  }, 6000);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (tunnel) tunnel.kill();
});

app.on('window-all-closed', () => {});  // keep alive as menubar app
