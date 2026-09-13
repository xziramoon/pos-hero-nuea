const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, Notification, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

app.setAppUserModelId('com.xziramoon.poshero');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const WIN_WIDTH = 400;
const WIN_HEIGHT = 700;
const WIN_MIN_WIDTH = 340;
const WIN_MIN_HEIGHT = 480;
const MINI_WIDTH = 210;
const MINI_HEIGHT = 86;
const EDGE_MARGIN = 12;
// Must match the moment renderer/theme-hero.css's #modeShutter finishes closing
// (shutter-close keyframe) — the native setBounds() for entering mini mode is
// deliberately deferred until this shutter is fully opaque, so the resize jump
// is masked instead of visible. If you retime the CSS, retime this too.
const COLLAPSE_MS = 230;

let mainWindow = null;
let tray = null;
let isPinned = true;
let isQuitting = false;
let isMiniMode = false;
let lastFullBounds = null;
let isTransitioning = false;
let transitionToken = 0;
// The "🔄 ตรวจสอบอัปเดต" tray item and the silent background checks (on
// launch, every 4h) both go through the same autoUpdater — this flag is
// how the shared event handlers below know whether to actually show a
// notification. Without it, the manual click looked completely broken
// whenever the app was already on the latest version: checkForUpdates()
// resolving to "no update" produced zero visible feedback of any kind.
let manualUpdateCheck = false;

function getDockedPosition(width, height) {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = wa.x + wa.width - width - EDGE_MARGIN;
  const y = wa.y + wa.height - height - EDGE_MARGIN;
  return { x, y };
}

// The mini HUD used to always re-dock to the bottom-right corner on every
// entry into mini mode; the user wanted to be able to drag it anywhere and
// have it stay put. Since the whole widget is a native -webkit-app-region:
// drag area (renderer/theme-hero.css), dragging is just the OS moving the
// window — no renderer/IPC involvement needed, we just listen for the
// window's own 'moved' event below and remember where it ended up.
const MINI_POSITION_FILE = path.join(app.getPath('userData'), 'window-state.json');
let lastMiniPosition = null;
let miniPositionSaveTimer = null;

function loadMiniPosition() {
  try {
    const data = JSON.parse(fs.readFileSync(MINI_POSITION_FILE, 'utf8'));
    if (Number.isFinite(data.miniX) && Number.isFinite(data.miniY)) {
      return { x: data.miniX, y: data.miniY };
    }
  } catch (e) {}
  return null;
}

// Debounced so a real drag (which fires 'moved' continuously) doesn't hit
// disk on every pixel — only once movement has settled.
function saveMiniPosition(pos) {
  if (miniPositionSaveTimer) clearTimeout(miniPositionSaveTimer);
  miniPositionSaveTimer = setTimeout(() => {
    try { fs.writeFileSync(MINI_POSITION_FILE, JSON.stringify({ miniX: pos.x, miniY: pos.y })); } catch (e) {}
  }, 400);
}

// Guards against a remembered position from a monitor that's no longer
// connected (laptop undocked, external display unplugged) — falls back to
// the corner instead of placing the HUD somewhere off-screen and unreachable.
function isPositionOnScreen(x, y, width, height) {
  const display = screen.getDisplayMatching({ x, y, width, height });
  const b = display.bounds;
  const overlapX = Math.min(x + width, b.x + b.width) - Math.max(x, b.x);
  const overlapY = Math.min(y + height, b.y + b.height) - Math.max(y, b.y);
  return overlapX > width * 0.3 && overlapY > height * 0.3;
}

function createWindow() {
  const { x, y } = getDockedPosition(WIN_WIDTH, WIN_HEIGHT);

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    minWidth: WIN_MIN_WIDTH,
    minHeight: WIN_MIN_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    // Nothing in this UI is designed for fullscreen (it's a small
    // corner-docked widget) — without this, Chromium's default F11 handler
    // still fires and blows the window up to fill the screen.
    fullscreenable: false,
    // Matches the amber theme's --hero-bg-1 (the default theme, renderer/theme-hero.css)
    // rather than an arbitrary purple — this is what briefly shows through on the
    // newly-exposed region during a window resize, so it needs to track whatever
    // theme is actually active (renderer pushes the real value via ui:bg-color once
    // it knows the saved theme; see enterMiniMode/exitMiniMode below).
    backgroundColor: '#120d09',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // This widget must keep its Pushbullet WebSocket alive and its
      // reconnect/health-check timers on schedule even while hidden in
      // the tray — Chromium's default background throttling would slow
      // both down and widen the window where an incoming transfer could
      // be missed.
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Fires both for a real user drag (window:mini-drag-move above calling
  // setPosition() as the user moves the mini HUD) and our own programmatic
  // setBounds()/setPosition() calls — the size check is what tells those
  // apart, since only the mini HUD's own bounds are exactly MINI_WIDTH x
  // MINI_HEIGHT. This also means dockToCorner() naturally re-remembers the
  // corner as the new mini position with no extra code.
  // 'moved' alone isn't reliable across platforms (historically macOS-only
  // in Electron) — 'move' is the one that actually fires on Windows, both
  // continuously during a real drag and once for a programmatic move.
  const onWindowMoved = () => {
    if (isTransitioning) return;
    const [w, h] = mainWindow.getSize();
    if (w !== MINI_WIDTH || h !== MINI_HEIGHT) return;
    const [x, y] = mainWindow.getPosition();
    lastMiniPosition = { x, y };
    saveMiniPosition(lastMiniPosition);
  };
  mainWindow.on('move', onWindowMoved);
  mainWindow.on('moved', onWindowMoved);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'build', 'tray.png');
  let trayIcon = nativeImage.createFromPath(trayIconPath);
  if (!trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('POS Hero เหนือ — แตะเพื่อเปิด/ปิด');
  refreshTrayMenu();

  tray.on('click', () => {
    toggleWindow();
  });
}

function refreshTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { label: mainWindow && mainWindow.isVisible() ? '🫥 ซ่อนหน้าต่าง' : '👁️ แสดงหน้าต่าง', click: () => toggleWindow() },
    { label: '📌 ลอยอยู่บนสุดเสมอ', type: 'checkbox', checked: isPinned, click: (menuItem) => {
      isPinned = menuItem.checked;
      if (mainWindow) mainWindow.setAlwaysOnTop(isPinned, 'floating');
      mainWindow?.webContents.send('pin-state-changed', isPinned);
    } },
    { label: '↩️ กลับไปมุมจอ', click: () => dockToCorner() },
    { type: 'separator' },
    { label: '🔄 ตรวจสอบอัปเดต', click: () => {
      manualUpdateCheck = true;
      // The 'error' event (below) already shows a notification and covers
      // a rejected promise too — swallow here instead of duplicating that.
      autoUpdater.checkForUpdates().catch(() => {});
    } },
    { type: 'separator' },
    { label: '❌ ออกจากโปรแกรม', click: () => {
      isQuitting = true;
      app.quit();
    } }
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
  refreshTrayMenu();
}

function dockToCorner() {
  if (!mainWindow) return;
  const [w, h] = mainWindow.getSize();
  const { x, y } = getDockedPosition(w, h);
  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus();
}

// "Mini mode" is the TBH-style tiny widget: instead of vanishing to the
// tray, minimizing shrinks the window down to a small always-on-top HUD
// docked in the corner (coin mascot + today's net total). All the app
// logic (records, Pushbullet socket) keeps running underneath — this is
// purely a window-bounds + renderer-CSS state, nothing is unloaded.
// Entering mini mode is staged in two IPC round-trips instead of one:
// 1) 'mode-transition' tells the renderer to start its shrink animation
//    (titlebar/paper/controls animate out, then a full-viewport shutter
//    closes over the content).
// 2) Only once that shutter is fully opaque — signalled by
//    'window:collapse-ready', or a COLLAPSE_MS watchdog if the renderer
//    never acks (reduced-motion, a wedged renderer, etc.) — do we actually
//    call setBounds(). Windows has no animated-resize API (BrowserWindow's
//    setBounds animate flag is macOS-only), so the real jump is hidden
//    behind the shutter rather than shown raw.
function commitEnterMini(token) {
  // isTransitioning is cleared by whichever of {renderer ack, watchdog} wins the
  // race, so the loser (same token, but isTransitioning already false) is a no-op
  // instead of double-committing setBounds()/mode-changed.
  if (token !== transitionToken || !mainWindow || !isTransitioning) return;
  mainWindow.setMinimumSize(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setResizable(false);
  // Reuse wherever the user last dragged the HUD to, unless that spot is on
  // a display that's no longer connected — then fall back to the corner.
  const { x, y } = (lastMiniPosition && isPositionOnScreen(lastMiniPosition.x, lastMiniPosition.y, MINI_WIDTH, MINI_HEIGHT))
    ? lastMiniPosition
    : getDockedPosition(MINI_WIDTH, MINI_HEIGHT);
  mainWindow.setBounds({ x, y, width: MINI_WIDTH, height: MINI_HEIGHT });
  isMiniMode = true;
  isTransitioning = false;
  mainWindow.webContents.send('mode-changed', 'mini');
}

function enterMiniMode() {
  if (!mainWindow || isMiniMode || isTransitioning) return;
  lastFullBounds = mainWindow.getBounds();
  isTransitioning = true;
  const token = ++transitionToken;
  mainWindow.webContents.send('mode-transition', { to: 'mini' });
  setTimeout(() => commitEnterMini(token), COLLAPSE_MS + 40);
}

// Exiting mini mode has no shutter-timing dependency: the window is tiny
// today and the target (full) size is known up front, so the resize can
// happen immediately — the renderer then animates the full UI assembling
// back in on top of the newly-grown window.
function exitMiniMode() {
  if (!mainWindow || !isMiniMode || isTransitioning) return;
  isTransitioning = true;
  transitionToken++;
  mainWindow.setMinimumSize(WIN_MIN_WIDTH, WIN_MIN_HEIGHT);
  mainWindow.setResizable(true);
  // Expanding always lands back at the corner — the user found it jarring
  // for the full window to reappear wherever it happened to be sitting
  // before it was last minimized, now that the mini HUD itself can be
  // dragged far from there. Width/height are still restored from
  // lastFullBounds so a manual resize survives the round-trip; only the
  // position is pinned.
  const width = lastFullBounds ? lastFullBounds.width : WIN_WIDTH;
  const height = lastFullBounds ? lastFullBounds.height : WIN_HEIGHT;
  const { x, y } = getDockedPosition(width, height);
  mainWindow.setBounds({ x, y, width, height });
  isMiniMode = false;
  mainWindow.webContents.send('mode-changed', 'full');
  mainWindow.show();
  mainWindow.focus();
  isTransitioning = false;
}

app.whenReady().then(() => {
  // frame:false hides the default menu bar visually, but Electron still
  // attaches it (and its default accelerators — F11 fullscreen, Ctrl+R
  // reload, Ctrl+Shift+I devtools, etc.) unless explicitly removed. F11
  // was blowing this small corner-docked widget up to fill the screen
  // because of exactly this — fullscreenable:false alone isn't enough to
  // stop the accelerator from calling setFullScreen().
  Menu.setApplicationMenu(null);

  lastMiniPosition = loadMiniPosition();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Sleep/lock-screen is the most common way the Pushbullet socket dies
  // silently. Don't wait for the 10s health-check to notice — force a
  // reconnect the moment the machine is usable again.
  const forceReconnect = () => mainWindow?.webContents.send('force-reconnect-pushbullet');
  powerMonitor.on('resume', forceReconnect);
  powerMonitor.on('unlock-screen', forceReconnect);

  // Auto-update: only meaningful for an installed/packaged build — in dev
  // (npm start) electron-updater no-ops since there's no packaged app to
  // replace. Check once on launch, then every 4 hours while it keeps running
  // in the tray.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
});

autoUpdater.on('update-available', (info) => {
  if (!manualUpdateCheck) return; // background checks stay silent until there's actually a downloaded file to act on
  manualUpdateCheck = false;
  if (!Notification.isSupported()) return;
  new Notification({
    title: '⬇️ พบอัปเดตใหม่ (v' + info.version + ')',
    body: 'กำลังดาวน์โหลด... จะแจ้งเตือนอีกครั้งเมื่อพร้อมติดตั้ง',
    icon: path.join(__dirname, 'build', 'icon.ico')
  }).show();
});

autoUpdater.on('update-not-available', () => {
  if (!manualUpdateCheck) return; // only the manual tray click cares to hear "nothing to do"
  manualUpdateCheck = false;
  if (!Notification.isSupported()) return;
  new Notification({
    title: '✅ เป็นเวอร์ชันล่าสุดแล้ว',
    body: 'ไม่มีอัปเดตใหม่ในขณะนี้ (v' + app.getVersion() + ')',
    icon: path.join(__dirname, 'build', 'icon.ico')
  }).show();
});

autoUpdater.on('update-downloaded', (info) => {
  manualUpdateCheck = false;
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: '🔄 มีอัปเดตใหม่ (v' + info.version + ')',
    body: 'ดาวน์โหลดเสร็จแล้ว คลิกเพื่อรีสตาร์ทแล้วอัปเดตทันที (หรือปล่อยไว้ จะอัปเดตให้เองตอนปิดโปรแกรมครั้งถัดไป)',
    icon: path.join(__dirname, 'build', 'icon.ico')
  });
  notif.on('click', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });
  notif.show();
});

autoUpdater.on('error', (err) => {
  console.error('[autoUpdater]', err == null ? 'unknown error' : (err.stack || err.message || err));
  if (!manualUpdateCheck) return; // background checks fail silently (retried every 4h anyway); don't nag the user for something they didn't ask about
  manualUpdateCheck = false;
  if (!Notification.isSupported()) return;
  new Notification({
    title: '❌ ตรวจสอบอัปเดตไม่สำเร็จ',
    body: (err && err.message) || 'ไม่สามารถเชื่อมต่อเพื่อตรวจสอบอัปเดตได้ ลองใหม่อีกครั้ง',
    icon: path.join(__dirname, 'build', 'icon.ico')
  }).show();
});

app.on('window-all-closed', () => {
  // Widget lives in the tray; do not quit when the window closes.
});

// Receipt printing: the native OS print dialog (window.print()'s default
// path) ignores the page's CSS @page size entirely and just uses whatever
// paper size is sitting in the driver/dialog — which is how a thermal
// receipt printer ends up printing a full A4-length sheet. Printing
// silently, with no dialog in the way, is what actually respects the
// CSS-declared 80mm page size (and is nicer for a cashier anyway — no
// dialog to click through on every receipt).
// Receipt printing bypasses webContents.print() entirely — see
// hero-chrome.js's heroPrint() for the full "why" (that path can't win:
// the EPSON TM-T82III driver only accepts two page heights, and whichever
// one you request, either the driver or Chromium pads the rest of it with
// blank paper). Instead: screenshot the receipt element exactly as
// rendered (webContents.capturePage — no page/media concept involved),
// threshold it to 1-bit, and send it as a raw ESC/POS image straight to
// the printer via Win32 WritePrinter (build/raw-print.ps1), which prints
// exactly as many dot-rows as the image actually has and nothing more.
const RECEIPT_DOT_WIDTH = 576; // 72mm printable width (80mm roll - 4mm margins/side) at 203dpi; /8 = 72 exactly, so byte-aligned with no partial-byte row padding

function buildEscPosRaster(bitmapBGRA, widthPx, heightPx) {
  const bytesPerRow = Math.ceil(widthPx / 8);
  // Bands of 256 dot-rows mirror how the OEM driver's own raster output was
  // structured (observed while diagnosing the page-size bug) — keeps each
  // GS v 0 command comfortably within typical printer receive-buffer limits
  // instead of gambling on one command covering the whole receipt.
  const BAND_HEIGHT = 256;
  // Print CSS already forces pure black text/borders (`color:#000 !important`)
  // on a white background plus `filter: grayscale(1)`, so this only needs to
  // reliably split those two, not handle real grayscale/anti-aliased input.
  const LUMINANCE_THRESHOLD = 160;

  const chunks = [Buffer.from([0x1b, 0x40])]; // ESC @ — initialize printer

  for (let bandStart = 0; bandStart < heightPx; bandStart += BAND_HEIGHT) {
    const bandHeight = Math.min(BAND_HEIGHT, heightPx - bandStart);
    const raster = Buffer.alloc(bytesPerRow * bandHeight, 0);
    for (let y = 0; y < bandHeight; y++) {
      const srcY = bandStart + y;
      for (let x = 0; x < widthPx; x++) {
        const srcIdx = (srcY * widthPx + x) * 4;
        const b = bitmapBGRA[srcIdx], g = bitmapBGRA[srcIdx + 1], r = bitmapBGRA[srcIdx + 2], a = bitmapBGRA[srcIdx + 3];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (a > 10 && luminance < LUMINANCE_THRESHOLD) {
          raster[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
        }
      }
    }
    const xL = bytesPerRow & 0xff, xH = (bytesPerRow >> 8) & 0xff;
    const yL = bandHeight & 0xff, yH = (bandHeight >> 8) & 0xff;
    chunks.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH])); // GS v 0 — print raster bit image
    chunks.push(raster);
  }

  chunks.push(Buffer.from([0x1b, 0x64, 0x02])); // ESC d 2 — feed 2 lines, a small cut margin
  chunks.push(Buffer.from([0x1d, 0x56, 0x41, 0x00])); // GS V 65 0 — full cut, no extra feed (matches the OEM driver's own cut command)
  return Buffer.concat(chunks);
}

ipcMain.handle('print:raw', async (_event, rect) => {
  if (!mainWindow) return { success: false, reason: 'no window' };
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { success: false, reason: 'invalid capture rect' };

  let tmpFile;
  try {
    const captured = await mainWindow.webContents.capturePage({
      x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height
    });
    const resized = captured.resize({ width: RECEIPT_DOT_WIDTH, quality: 'best' });
    const size = resized.getSize();
    const escpos = buildEscPosRaster(resized.toBitmap(), size.width, size.height);

    tmpFile = path.join(os.tmpdir(), `pos-hero-receipt-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, escpos);

    const printers = await mainWindow.webContents.getPrintersAsync();
    const target = printers.find((p) => p.isDefault) || printers[0];
    if (!target) return { success: false, reason: 'ไม่พบเครื่องพิมพ์ในระบบ' };

    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'raw-print.ps1')
      : path.join(__dirname, 'build', 'raw-print.ps1');

    return await new Promise((resolve) => {
      execFile('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-PrinterName', target.name, '-FilePath', tmpFile
      ], { windowsHide: true }, (error, _stdout, stderr) => {
        resolve(error ? { success: false, reason: (stderr || error.message).trim() } : { success: true, reason: '' });
      });
    });
  } catch (err) {
    return { success: false, reason: err && err.message ? err.message : String(err) };
  } finally {
    if (tmpFile) fs.unlink(tmpFile, () => {});
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.on('window:minimize', () => {
  mainWindow?.hide();
  refreshTrayMenu();
});

ipcMain.on('window:close', () => {
  mainWindow?.hide();
  refreshTrayMenu();
});

ipcMain.on('window:toggle-pin', () => {
  isPinned = !isPinned;
  mainWindow?.setAlwaysOnTop(isPinned, 'floating');
  mainWindow?.webContents.send('pin-state-changed', isPinned);
});

ipcMain.handle('window:get-pin-state', () => isPinned);

ipcMain.on('window:dock-to-corner', () => {
  dockToCorner();
});

ipcMain.on('window:enter-mini', () => {
  enterMiniMode();
});

ipcMain.on('window:exit-mini', () => {
  exitMiniMode();
});

// Custom mini-HUD dragging. -webkit-app-region:drag on the whole clickable
// widget (the first attempt at this) turned out to swallow real mouse
// clicks in practice on real hardware — a synthetic test click has zero
// pixel jitter and worked fine under Playwright, but an actual human click
// always moves the cursor a pixel or two, and Windows' own drag-region
// hit-testing treated that as "drag started" and ate the click. Doing the
// drag ourselves with an explicit distance threshold (renderer/hero-chrome.js)
// is forgiving of that jitter; here we just move the window by however far
// the OS cursor has moved since the drag started, read directly rather than
// trusting renderer mouse-event coordinates (which stop arriving if the
// cursor ever outruns this tiny, constantly-repositioning window).
let miniDragOrigin = null; // { cursorX, cursorY, winX, winY }

ipcMain.on('window:mini-drag-start', () => {
  if (!mainWindow || !isMiniMode) return;
  const cursor = screen.getCursorScreenPoint();
  const [winX, winY] = mainWindow.getPosition();
  miniDragOrigin = { cursorX: cursor.x, cursorY: cursor.y, winX, winY };
});

ipcMain.on('window:mini-drag-move', () => {
  if (!mainWindow || !miniDragOrigin) return;
  const cursor = screen.getCursorScreenPoint();
  mainWindow.setPosition(
    miniDragOrigin.winX + (cursor.x - miniDragOrigin.cursorX),
    miniDragOrigin.winY + (cursor.y - miniDragOrigin.cursorY)
  );
});

ipcMain.on('window:mini-drag-end', () => {
  miniDragOrigin = null;
});

// Ack from the renderer that its shutter has finished closing — commit the
// real resize now instead of waiting out the full COLLAPSE_MS watchdog.
ipcMain.on('window:collapse-ready', () => {
  commitEnterMini(transitionToken);
});

// The window's backgroundColor briefly shows through the newly-exposed
// region on a grow (see the BrowserWindow constructor comment) — keep it
// synced to whichever theme's --hero-bg-1 the renderer actually has active.
ipcMain.on('ui:bg-color', (_event, hex) => {
  if (mainWindow && typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
    mainWindow.setBackgroundColor(hex);
  }
});

ipcMain.on('money:in', (_event, payload) => {
  const amount = Number(payload && payload.amount) || 0;
  const name = ((payload && payload.name) || 'ลูกค้าโอน').toString().slice(0, 60);
  const typeLabels = { transfer: 'โอน', welfare: 'บัตรรัฐ', thaiplus: 'ไทยพลัส', expense: 'ค่าใช้จ่าย' };
  const typeLabel = typeLabels[payload && payload.type] || 'โอน';

  if (!Notification.isSupported() || amount <= 0) return;

  const notif = new Notification({
    title: '💰 เงินเข้า +' + amount.toLocaleString('en-US') + ' ฿',
    body: name + ' • ' + typeLabel,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    silent: false
  });

  notif.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    refreshTrayMenu();
  });

  notif.show();
});

// Realtime-only ingestion (the Pushbullet WebSocket) has a hard failure
// mode: if a push is missed for any reason — phone-side Doze/battery
// manager delaying the mirror sync after long idle, a reconnect window,
// a brief network blip — it's gone forever with no way to recover it.
// This REST poll is the backfill safety net: ask Pushbullet's API for
// anything modified since we last checked, so a delayed-but-eventually-
// synced push still gets picked up. Runs in main (not renderer) so it
// isn't subject to renderer CORS/webSecurity at all.
ipcMain.handle('pb:poll-missed', async (_event, { token, sinceTs }) => {
  try {
    const res = await fetch(
      `https://api.pushbullet.com/v2/pushes?modified_after=${encodeURIComponent(sinceTs)}&active=true`,
      { headers: { 'Access-Token': token } }
    );
    if (!res.ok) return { success: false, reason: 'http ' + res.status };
    const data = await res.json();
    return { success: true, pushes: data.pushes || [] };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});

ipcMain.on('pb:disconnected-warning', (_event, downMinutes) => {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: '⚠️ Pushbullet ขาดการเชื่อมต่อ',
    body: `ไม่ได้รับสัญญาณมา ${downMinutes} นาทีแล้ว อาจพลาดยอดเงินเข้า — ลองเปิดมือถือ/เช็คเน็ตแล้วเปิดแอปนี้ขึ้นมาดู`,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    urgency: 'critical'
  });
  notif.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    refreshTrayMenu();
  });
  notif.show();
});
