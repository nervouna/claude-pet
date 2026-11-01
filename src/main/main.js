const { app, BrowserWindow, Menu, Tray, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { SessionTracker } = require('./sessions');
const { startServer } = require('./server');
const { trayIcon } = require('./icon');

const PORT = Number(process.env.CLAUDE_PET_PORT) || 46821;
const BASE = { width: 260, height: 220 };
const SIZES = { Small: 0.75, Medium: 1, Large: 1.4 };
const STATUS_TEXT = { idle: 'Idle', sleep: 'Sleeping', thinking: 'Thinking', working: 'Working', waiting: 'Needs you' };

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { size: 'Medium' };

let win = null;
let tray = null;
let drag = null;
let demoTimer = null;
const tracker = new SessionTracker();

function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    // First run.
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

function windowSize() {
  const k = SIZES[settings.size] ?? 1;
  return { width: Math.round(BASE.width * k), height: Math.round(BASE.height * k) };
}

// Keep the pet on a visible display; default to the bottom-right corner above the Dock.
function placement(size) {
  const { x, y } = settings;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const area = screen.getDisplayMatching({ x, y, ...size }).workArea;
    const inside = x + size.width / 2 >= area.x && x + size.width / 2 <= area.x + area.width && y + size.height / 2 >= area.y && y + size.height / 2 <= area.y + area.height;
    if (inside) return { x, y };
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - size.width - 40, y: area.y + area.height - size.height + Math.round(size.height * 0.1) };
}

function createWindow() {
  const size = windowSize();
  win = new BrowserWindow({
    ...size,
    ...placement(size),
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    // The app is never active, so every click is a first click.
    acceptFirstMouse: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error') console.error(`renderer: ${message}`);
  });
  win.on('closed', () => {
    win = null;
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Cursor feed for eye tracking and hit testing, plus window dragging.
// Polls at 60 Hz while dragging and 20 Hz otherwise, and only sends when something moved.
function startCursorLoop() {
  let last = '';
  const tick = () => {
    setTimeout(tick, drag ? 16 : 50);
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    if (drag) {
      win.setPosition(Math.round(drag.winX + p.x - drag.x), Math.round(drag.winY + p.y - drag.y));
    }
    const b = win.getBounds();
    const c = { x: p.x - b.x, y: p.y - b.y, sx: p.x, sy: p.y };
    const key = `${c.x},${c.y},${c.sx},${c.sy}`;
    if (key !== last) {
      last = key;
      send('pet:cursor', c);
    }
  };
  tick();
}

function resize(name) {
  settings.size = name;
  if (win) {
    const old = win.getBounds();
    const size = windowSize();
    // Keep the pet's feet where they were.
    win.setBounds({ x: Math.round(old.x + (old.width - size.width) / 2), y: old.y + old.height - size.height, ...size });
    Object.assign(settings, { x: win.getBounds().x, y: win.getBounds().y });
  }
  saveSettings();
  rebuildMenu();
}

function resetPosition() {
  delete settings.x;
  delete settings.y;
  saveSettings();
  if (win) win.setBounds({ ...windowSize(), ...placement(windowSize()) });
}

// Fake hook events through the real pipeline, to preview every animation.
const DEMO = [
  ['UserPromptSubmit', {}, 4],
  ['PreToolUse', { tool_name: 'Grep' }, 6],
  ['PostToolUse', {}, 0.5],
  ['PreToolUse', { tool_name: 'Read' }, 6],
  ['PostToolUse', {}, 4],
  ['PreToolUse', { tool_name: 'Edit' }, 7],
  ['PermissionRequest', {}, 5],
  ['PreToolUse', { tool_name: 'Bash' }, 6],
  ['PostToolUse', {}, 1],
  ['Stop', {}, 0],
];

function toggleDemo() {
  if (demoTimer) {
    clearTimeout(demoTimer);
    demoTimer = null;
    tracker.handle({ hook_event_name: 'SessionEnd', session_id: 'demo' });
    rebuildMenu();
    return;
  }
  let i = 0;
  const next = () => {
    if (i >= DEMO.length) {
      demoTimer = null;
      tracker.handle({ hook_event_name: 'SessionEnd', session_id: 'demo' });
      rebuildMenu();
      return;
    }
    const [name, extra, wait] = DEMO[i++];
    tracker.handle({ hook_event_name: name, session_id: 'demo', cwd: '/demo', ...extra });
    demoTimer = setTimeout(next, wait * 1000);
  };
  next();
  rebuildMenu();
}

function buildMenu() {
  const snap = tracker.snapshot();
  const sessionItems = snap.sessions.slice(0, 8).map((s) => ({
    label: `${s.project} — ${STATUS_TEXT[s.status]}${s.tool && s.status !== 'idle' ? ` · ${s.tool}` : ''}`,
    enabled: false,
  }));
  return Menu.buildFromTemplate([
    { label: `Claude Pet — ${STATUS_TEXT[snap.mode]}`, enabled: false },
    ...(sessionItems.length ? [{ type: 'separator' }, ...sessionItems] : []),
    { type: 'separator' },
    {
      label: 'Size',
      submenu: Object.keys(SIZES).map((name) => ({ label: name, type: 'radio', checked: settings.size === name, click: () => resize(name) })),
    },
    { label: demoTimer ? 'Stop Demo' : 'Play Demo', click: toggleDemo },
    { label: 'Reset Position', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit Claude Pet', role: 'quit' },
  ]);
}

function rebuildMenu() {
  if (!tray) return;
  const snap = tracker.snapshot();
  tray.setToolTip(`Claude Pet — ${STATUS_TEXT[snap.mode]}`);
  tray.setContextMenu(buildMenu());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide();
    loadSettings();
    createWindow();
    startCursorLoop();

    const icon = trayIcon();
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    rebuildMenu();

    tracker.on('state', (snap) => {
      send('pet:state', snap);
      rebuildMenu();
    });
    tracker.on('pulse', (kind) => send('pet:pulse', { kind }));

    startServer({
      port: PORT,
      onEvent: (evt) => tracker.handle(evt),
      getState: () => tracker.snapshot(),
      onError: (err) => console.error(`claude-pet: cannot listen on 127.0.0.1:${PORT}: ${err.message}`),
    });

    ipcMain.on('pet:ready', () => send('pet:state', tracker.snapshot()));
    ipcMain.on('pet:hit', (_e, hit) => win?.setIgnoreMouseEvents(!hit, { forward: true }));
    ipcMain.on('pet:menu', () => buildMenu().popup({ window: win }));
    ipcMain.on('pet:drag', (_e, phase) => {
      if (!win) return;
      if (phase === 'start') {
        const p = screen.getCursorScreenPoint();
        const b = win.getBounds();
        drag = { x: p.x, y: p.y, winX: b.x, winY: b.y };
      } else {
        drag = null;
        const b = win.getBounds();
        Object.assign(settings, { x: b.x, y: b.y });
        saveSettings();
      }
    });
  });

  app.on('window-all-closed', () => app.quit());
}
