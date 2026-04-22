const { app, ipcMain, nativeImage, Tray, BrowserWindow, shell } = require('electron');
const path  = require('path');
const { spawn, execSync } = require('child_process');
const http  = require('http');
const https = require('https');
const fs    = require('fs');

// ── logging ────────────────────────────────────────────────────────────────────
const LOG_FILE = '/tmp/brainminds-app.log';
fs.writeFileSync(LOG_FILE, `=== Brainminds started ${new Date().toISOString()} ===\n`);
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}
process.on('uncaughtException',  (err)    => log('UNCAUGHT EXCEPTION:', err.stack || err.message));
process.on('unhandledRejection', (reason) => log('UNHANDLED REJECTION:', reason?.stack || reason));

// ── config ─────────────────────────────────────────────────────────────────────
const SERVER     = 'root@116.203.251.28';
const SSH_KEY    = `${process.env.HOME}/.ssh/id_ed25519_personalai`;
const LOCAL_PORT = 13001;
const ORCH_BASE  = `http://localhost:${LOCAL_PORT}`;
const REPO       = 'brianmindslab/braintime';
const GH_TOKEN   = process.env.GH_TOKEN; // set in shell env or via gh auth login
const GH_BIN     = '/opt/homebrew/bin/gh';
const PROD_IP    = '46.225.217.226';

// ── state ──────────────────────────────────────────────────────────────────────
let tray        = null;
let popupWin    = null;
let mainWin     = null;
let tunnel      = null;
let connected   = false;
let lastState   = '';

// ── SSH tunnel ─────────────────────────────────────────────────────────────────
function startTunnel() {
  if (tunnel) return;
  tunnel = spawn('ssh', [
    '-i', SSH_KEY,
    '-L', `${LOCAL_PORT}:localhost:3001`,
    '-N',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes',
    SERVER,
  ]);

  tunnel.stderr.on('data', () => {});

  tunnel.on('close', () => {
    connected = false;
    tunnel = null;
    updateIcon();
    if (!app.isQuitting) setTimeout(startTunnel, 5000);
  });
}

// ── SSH command helper (for PM2 control) ───────────────────────────────────────
function sshExec(cmd) {
  return execSync(
    `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=8 ${SERVER} "${cmd}"`,
    { encoding: 'utf8', timeout: 20000 }
  ).trim();
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────
function orchGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${ORCH_BASE}${urlPath}`, (res) => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        connected = true;
        updateIcon();
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on('error', err => { connected = false; updateIcon(); reject(err); });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function orchPost(urlPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: LOCAL_PORT, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 0 },
    };
    const req = http.request(opts, (res) => {
      let out = '';
      res.on('data', d => (out += d));
      res.on('end', () => { connected = true; updateIcon(); try { resolve(JSON.parse(out)); } catch { resolve({}); } });
    });
    req.on('error', err => { connected = false; updateIcon(); reject(err); });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function pingProd() {
  return new Promise((resolve) => {
    const req = http.get(`http://${PROD_IP}/api/diagnostics`, { timeout: 4000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── gh CLI helpers ─────────────────────────────────────────────────────────────
function ghExec(cmd) {
  try {
    return execSync(`${GH_BIN} ${cmd}`, {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN },
      timeout: 10000,
    });
  } catch {
    return '[]';
  }
}

function getPRs() {
  const out = ghExec(`pr list --repo ${REPO} --state open --json number,title,url --limit 20`);
  try { return JSON.parse(out); } catch { return []; }
}

function mergePR(prNumber) {
  ghExec(`pr merge ${prNumber} --repo ${REPO} --squash --delete-branch`);
}

// ── tray icon ──────────────────────────────────────────────────────────────────
function loadIcon(name) {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', `${name}.png`));
  img.setTemplateImage(true);
  return img;
}

function updateIcon(paused) {
  if (!tray) return;
  const state = !connected ? 'disconnected' : paused ? 'paused' : 'running';
  if (state === lastState) return;
  lastState = state;
  const names = { running: 'icon-running', paused: 'icon-paused', disconnected: 'icon-disconnected' };
  tray.setImage(loadIcon(names[state]));
  tray.setToolTip(state === 'disconnected' ? 'Brainminds — connecting…' : `Brainminds — ${state}`);
}

// ── popup window (tray click) ──────────────────────────────────────────────────
function createPopupWindow() {
  popupWin = new BrowserWindow({
    width: 340,
    height: 400,
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

  popupWin.loadFile(path.join(__dirname, 'index.html'));
  popupWin.on('blur', () => {
    if (popupWin && !popupWin.webContents.isDevToolsOpened()) popupWin.hide();
  });
}

function togglePopup() {
  if (!popupWin) return;
  if (popupWin.isVisible()) {
    popupWin.hide();
    return;
  }
  const { x, y, width, height } = tray.getBounds();
  const [ww] = popupWin.getSize();
  popupWin.setPosition(Math.round(x + width / 2 - ww / 2), y + height + 4);
  popupWin.show();
  popupWin.focus();
  popupWin.webContents.send('refresh');
}

// ── main dashboard window ──────────────────────────────────────────────────────
function createMainWindow() {
  if (mainWin) {
    mainWin.show();
    mainWin.focus();
    return;
  }

  mainWin = new BrowserWindow({
    width: 760,
    height: 600,
    minWidth: 600,
    minHeight: 440,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWin.loadFile(path.join(__dirname, 'dashboard.html'));

  mainWin.on('closed', () => { mainWin = null; });
}

// ── shared status fetch ────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const [orch, prs, prodOk] = await Promise.all([
      orchGet('/status'),
      Promise.resolve(getPRs()),
      pingProd(),
    ]);
    return { ...orch, prs, prodOk, orchOnline: true };
  } catch {
    return { paused: false, agents: [], prs: [], prodOk: false, error: true, orchOnline: false };
  }
}

// ── IPC ────────────────────────────────────────────────────────────────────────
ipcMain.handle('get-status', fetchStatus);

ipcMain.handle('pause',    async () => orchPost('/pause').catch(() => ({})));
ipcMain.handle('resume',   async () => orchPost('/resume').catch(() => ({})));
ipcMain.handle('kill',     async (_, n) => orchPost(`/kill/${n}`).catch(() => ({})));
ipcMain.handle('merge-pr', async (_, n) => { mergePR(n); return { ok: true }; });
ipcMain.handle('open-browser', () => shell.openExternal('http://116.203.251.28:3000'));

ipcMain.handle('orch-start', async () => {
  try { sshExec('pm2 start orchestrator'); return { ok: true }; }
  catch (err) { log('orch-start failed:', err.message); return { ok: false, error: err.message }; }
});

ipcMain.handle('orch-stop', async () => {
  try { sshExec('pm2 stop orchestrator'); return { ok: true }; }
  catch (err) { log('orch-stop failed:', err.message); return { ok: false, error: err.message }; }
});

ipcMain.handle('orch-restart', async () => {
  try { sshExec('pm2 restart orchestrator'); return { ok: true }; }
  catch (err) { log('orch-restart failed:', err.message); return { ok: false, error: err.message }; }
});

ipcMain.on('resize', (_, h) => {
  if (popupWin) popupWin.setSize(340, Math.min(Math.max(h, 180), 580), false);
});

// ── app lifecycle ──────────────────────────────────────────────────────────────
log('app module loaded');

app.whenReady().then(() => {
  log('app ready');

  tray = new Tray(loadIcon('icon-disconnected'));
  tray.setToolTip('Brainminds — connecting…');
  tray.on('click', togglePopup);

  createPopupWindow();
  createMainWindow();  // open dashboard on launch
  startTunnel();

  // Push status to all visible windows every 6s
  async function pollAndPush() {
    try {
      const status = await fetchStatus();
      updateIcon(status.paused);
      if (popupWin?.isVisible()) popupWin.webContents.send('status-update', status);
      if (mainWin?.isVisible())  mainWin.webContents.send('status-update', status);
    } catch {
      updateIcon();
    }
  }

  setInterval(pollAndPush, 6000);

  log('ready — tray + dashboard open');
});

// Re-open dashboard when clicking dock icon
app.on('activate', () => createMainWindow());

app.on('before-quit', () => {
  app.isQuitting = true;
  if (tunnel) { tunnel.kill(); tunnel = null; }
});

app.on('window-all-closed', () => {}); // stay alive as menubar app
