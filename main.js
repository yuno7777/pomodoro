// Self-heal: if launched as plain Node (ELECTRON_RUN_AS_NODE=1 in env),
// relaunch this same executable as Electron with the var cleared. Prevents
// the packaged exe from breaking when users have that var set system-wide.
const _electronMod = require('electron');
if (typeof _electronMod === 'string') {
  if (process.env.__POM_RELAUNCHED) {
    console.error('Failed to launch as Electron even after relaunch.');
    process.exit(1);
  }
  const { spawn } = require('child_process');
  const env = { ...process.env, __POM_RELAUNCHED: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true, stdio: 'ignore', env,
  });
  child.unref();
  process.exit(0);
}
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = _electronMod;
const path = require('path');
const zlib = require('zlib');

let win;
let tray;
let splash;
let splashShownAt = 0;
const MIN_SPLASH_MS = 1400;   // ensure splash is visible at least this long
const FADE_MS = 320;          // splash fade-out duration

// Build a valid PNG from scratch so we don't need an external icon file
function makeSolidPNG(width, height, r, g, b) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBytes, data]);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, typeBytes, data, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // RGB

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      // Draw a circle
      const dx = x - width / 2 + 0.5, dy = y - height / 2 + 0.5;
      const inCircle = dx * dx + dy * dy < (width / 2 - 1) ** 2;
      row[1 + x * 3]     = inCircle ? r : 26;
      row[1 + x * 3 + 1] = inCircle ? g : 26;
      row[1 + x * 3 + 2] = inCircle ? b : 26;
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createSplash() {
  splash = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
  });
  splash.loadFile('splash.html');
  splash.once('ready-to-show', () => {
    splash.show();
    splashShownAt = Date.now();
  });
}

function dismissSplashAndShowMain() {
  const reveal = () => {
    if (splash && !splash.isDestroyed()) {
      // Trigger CSS fade-out, then destroy.
      splash.webContents.executeJavaScript(
        'document.body.classList.add("fadeout")'
      ).catch(() => {});
      setTimeout(() => {
        if (splash && !splash.isDestroyed()) splash.destroy();
        splash = null;
        if (win && !win.isDestroyed()) win.show();
      }, FADE_MS);
    } else if (win && !win.isDestroyed()) {
      win.show();
    }
  };
  const elapsed = splashShownAt ? Date.now() - splashShownAt : MIN_SPLASH_MS;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
  setTimeout(reveal, wait);
}

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 640,
    minHeight: 520,
    frame: false,
    resizable: true,
    show: false,
    backgroundColor: '#080808',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  win.once('ready-to-show', dismissSplashAndShowMain);

  win.on('maximize', () => win.webContents.send('window-maximized-change', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized-change', false));
  win.on('enter-full-screen', () => win.webContents.send('window-maximized-change', true));
  win.on('leave-full-screen', () => win.webContents.send('window-maximized-change', false));

  // Hide to tray instead of quitting
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  const iconBuf = makeSolidPNG(16, 16, 220, 55, 55);
  const icon = nativeImage.createFromBuffer(iconBuf);

  tray = new Tray(icon);
  tray.setToolTip('Pomodoro');

  const menu = Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);

  tray.on('click', () => win.isVisible() ? win.hide() : win.show());
}

// IPC from renderer buttons
ipcMain.on('window-close', () => win.hide());
ipcMain.on('window-minimize', () => win.minimize());
ipcMain.on('window-toggle-maximize', () => {
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep alive in tray

app.on('before-quit', () => { app.isQuitting = true; });
