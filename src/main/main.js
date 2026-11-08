'use strict';
const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  systemPreferences,
  shell,
  Notification,
  nativeImage,
} = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const pkg = require('../../package.json');

// Sürüm: "admin" (sunucu kurabilir, yönetim paneli var) ya da "client" (sadece bağlanır)
const VARIANT = process.env.KANKI_VARIANT || pkg.kankiVariant || 'admin';
const IS_ADMIN_BUILD = VARIANT === 'admin';
const APP_TITLE = IS_ADMIN_BUILD ? 'Kanki Admin' : 'Kanki';

const isMac = process.platform === 'darwin';

// --- Medya için Chromium ayarları ---
// macOS 14.2+ üzerinde ekran paylaşırken sistem sesini yakalamayı dene (ScreenCaptureKit)
app.commandLine.appendSwitch(
  'enable-features',
  [
    'MacLoopbackAudioForScreenShare',
    'MacSckSystemAudioLoopbackOverride',
    'WebRtcAllowInputVolumeAdjustment',
  ].join(',')
);
// Pencere arka plandayken ses/görüntü işleme yavaşlamasın
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Otomatik test için sahte medya
if (process.env.KANKI_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
if (process.env.KANKI_USER_DATA) app.setPath('userData', process.env.KANKI_USER_DATA);

let win = null;
let hostedServer = null;
let pendingSource = null; // { id, audio }

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#14161b',
    title: APP_TITLE,
    icon: path.join(__dirname, '..', '..', 'build', IS_ADMIN_BUILD ? 'icon-admin.png' : 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => (win = null));
  if (process.env.KANKI_AUTOTEST) {
    win.webContents.on('console-message', (e) => {
      const msg = e.message;
      if (/AUTOTEST|\[kanki\]|Error/i.test(msg)) process.stdout.write(`[${JSON.parse(process.env.KANKI_AUTOTEST).name}] ${msg}\n`);
    });
  }

  if (process.env.KANKI_SCREENSHOT) {
    if (process.env.KANKI_EXEC) win.webContents.once('did-finish-load', () => setTimeout(() => win.webContents.executeJavaScript(process.env.KANKI_EXEC).catch(() => {}), 800));
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(process.env.KANKI_SCREENSHOT, img.toPNG());
    }, Number(process.env.KANKI_SCREENSHOT_DELAY || 4000));
  }
}

app.whenReady().then(() => {
  // İzinler: mikrofon / ekran / bildirim
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // ngrok ücretsiz planı tarayıcılara uyarı sayfası gösterebilir; WebSocket isteklerinde bunu atla
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    if (/^wss?:/i.test(details.url)) {
      details.requestHeaders['ngrok-skip-browser-warning'] = '1';
      details.requestHeaders['User-Agent'] = `Kanki/${app.getVersion()}`;
    }
    cb({ requestHeaders: details.requestHeaders });
  });

  // getDisplayMedia çağrısını kendi seçicimizin seçtiği kaynağa yönlendir
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        const sel = pendingSource;
        pendingSource = null;
        if (!sel) return callback({});
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
        const source = sources.find((s) => s.id === sel.id);
        if (!source) return callback({});
        const streams = { video: source };
        if (sel.audio && request.audioRequested) streams.audio = 'loopback';
        callback(streams);
      } catch (e) {
        console.error(e);
        callback({});
      }
    },
    { useSystemPicker: false }
  );

  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  setupAutoUpdate();
});

// ---------------- Otomatik güncelleme ----------------
// Sadece kurulumlu Windows sürümünde (Kanki-Setup.exe) çalışır. Kurulumsuz sürüm,
// Mac ve Kanki Admin bu bloğu atlar.
let updater = null;
let updateState = { state: 'idle' };

function canAutoUpdate() {
  return (
    app.isPackaged &&
    process.platform === 'win32' &&
    VARIANT === 'client' &&
    !process.env.PORTABLE_EXECUTABLE_DIR && // kurulumsuz (portable) sürüm
    fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
  );
}

function sendUpdate(state) {
  updateState = state;
  win?.webContents.send('update', state);
}

function setupAutoUpdate() {
  if (!canAutoUpdate()) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) {
    console.error('electron-updater yüklenemedi', e);
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true; // kullanıcı "yeniden başlat"a basmasa da kapatınca kurulur
  updater.on('update-available', (info) => sendUpdate({ state: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', (p) =>
    sendUpdate({ state: 'downloading', version: updateState.version, percent: Math.round(p.percent || 0) })
  );
  updater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  updater.on('error', (e) => {
    console.error('Güncelleme hatası:', e?.message || e);
    if (updateState.state === 'downloading') sendUpdate({ state: 'idle' });
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000); // açık kaldığı sürece 4 saatte bir bak
}

ipcMain.handle('update:state', () => updateState);
ipcMain.handle('update:install', () => {
  if (updater && updateState.state === 'ready') updater.quitAndInstall(true, true); // sessiz kur, sonra yeniden aç
});

app.on('window-all-closed', async () => {
  stopPtt();
  await stopTunnel();
  if (hostedServer) await hostedServer.close().catch(() => {});
  app.quit();
});

// ---------------- IPC ----------------
ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  osRelease: os.release(),
  pttAvailable: !!loadUiohook(),
  variant: VARIANT,
  title: APP_TITLE,
  defaultServer: pkg.kankiDefaultServer || '',
}));

ipcMain.handle('media:ensure-permissions', async () => {
  if (!isMac) return { microphone: 'granted', screen: 'granted' };
  let microphone = systemPreferences.getMediaAccessStatus('microphone');
  if (microphone !== 'granted') {
    const ok = await systemPreferences.askForMediaAccess('microphone');
    microphone = ok ? 'granted' : 'denied';
  }
  return { microphone, screen: systemPreferences.getMediaAccessStatus('screen') };
});

ipcMain.handle('media:open-screen-settings', () => {
  if (isMac) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true,
  });
  return sources
    .filter((s) => s.name !== APP_TITLE || s.id.startsWith('screen'))
    .map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }));
});

ipcMain.handle('screen:select-source', (_e, id, audio) => {
  pendingSource = { id, audio: !!audio };
  return true;
});

// Yönetici anahtarı bu bilgisayarda saklanır; sunucuyu kuran kişi her açılışta yönetici olur
function loadAdminKey() {
  const file = path.join(app.getPath('userData'), 'server-data', 'admin.key');
  try {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (k) return k;
  } catch {}
  const k = crypto.randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, k, { mode: 0o600 });
  return k;
}

ipcMain.handle('server:host', async (_e, opts) => {
  if (!IS_ADMIN_BUILD) return { ok: false, error: 'Bu sürüm sunucu kuramaz.' };
  if (hostedServer) return { ok: true, port: hostedServer.port, adminKey: hostedServer.adminKey, addresses: localAddresses(), already: true };
  try {
    const { startServer } = require('../../server/server');
    hostedServer = await startServer({
      port: opts.port,
      name: opts.name,
      password: opts.password || '',
      adminKey: loadAdminKey(),
      dataDir: path.join(app.getPath('userData'), 'server-data'),
    });
    return { ok: true, port: hostedServer.port, adminKey: hostedServer.adminKey, addresses: localAddresses() };
  } catch (e) {
    hostedServer = null;
    return { ok: false, error: e.code === 'EADDRINUSE' ? 'Bu port zaten kullanımda.' : e.message };
  }
});

ipcMain.handle('server:stop', async () => {
  await stopTunnel();
  if (hostedServer) await hostedServer.close();
  hostedServer = null;
  return true;
});

// ---------------- ngrok tüneli ----------------
let tunnel = null; // { listener, url }

async function stopTunnel() {
  if (!tunnel) return;
  try {
    await tunnel.listener.close();
  } catch {}
  try {
    await require('@ngrok/ngrok').disconnect();
  } catch {}
  tunnel = null;
}

ipcMain.handle('tunnel:start', async (_e, { port, authtoken, domain }) => {
  if (!IS_ADMIN_BUILD) return { ok: false, error: 'Bu sürüm tünel açamaz.' };
  if (tunnel) return { ok: true, url: tunnel.url };
  let ngrok;
  try {
    ngrok = require('@ngrok/ngrok');
  } catch (e) {
    return { ok: false, error: 'ngrok bileşeni yüklenemedi: ' + e.message };
  }
  try {
    const opts = { addr: `127.0.0.1:${port}`, authtoken: String(authtoken || '').trim() };
    const d = String(domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (d) opts.domain = d;
    const listener = await ngrok.forward(opts);
    tunnel = { listener, url: listener.url() };
    return { ok: true, url: tunnel.url };
  } catch (e) {
    const msg = String(e.message || e);
    let error = msg;
    if (/ERR_NGROK_10[57]|proper ngrok authtoken|authtoken.*(invalid|not valid)|authentication failed/i.test(msg)) error = 'ngrok authtoken geçersiz. dashboard.ngrok.com adresinden kopyaladığın token’ı kontrol et.';
    else if (/ERR_NGROK_108|simultaneous/i.test(msg)) error = 'Bu ngrok hesabıyla başka bir yerde zaten tünel açık. Önce onu kapat.';
    else if (/ERR_NGROK_(313|320|319)|domain/i.test(msg)) error = 'Bu domain hesabına ait değil ya da yanlış yazıldı. Domain alanını boş bırakmayı dene.';
    return { ok: false, error };
  }
});

ipcMain.handle('tunnel:stop', async () => {
  await stopTunnel();
  return true;
});

ipcMain.handle('server:status', () => ({
  hosting: !!hostedServer,
  port: hostedServer?.port,
  addresses: localAddresses(),
  tunnelUrl: tunnel?.url || null,
}));

ipcMain.handle('app:notify', (_e, title, body) => {
  if (Notification.isSupported() && win && !win.isFocused()) new Notification({ title, body, silent: true }).show();
});

ipcMain.handle('app:flash', () => {
  if (win && !win.isFocused()) {
    if (isMac) app.dock?.bounce('informational');
    else win.flashFrame(true);
  }
});

// Dürtme: pencereyi sağa sola titret. Tam ekran / büyütülmüş pencere taşınamadığı
// için o durumda 'css' döner ve arayüz kendi içeriğini titretir.
let shaking = false;
ipcMain.handle('app:shake', async () => {
  if (!win || win.isDestroyed()) return 'none';
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  if (win.isFullScreen() || win.isMaximized() || win.isSimpleFullScreen?.()) return 'css';
  if (shaking) return 'busy';
  shaking = true;
  const [x, y] = win.getPosition();
  const offsets = [
    [-14, -4], [14, 4], [-12, 6], [12, -6], [-10, -3], [10, 3],
    [-8, 5], [8, -5], [-6, -2], [6, 2], [-4, 3], [4, -3], [-2, 0], [2, 0],
  ];
  try {
    for (const [dx, dy] of offsets) {
      if (win.isDestroyed()) break;
      win.setPosition(x + dx, y + dy, false);
      await new Promise((r) => setTimeout(r, 28));
    }
  } finally {
    if (!win.isDestroyed()) win.setPosition(x, y, false);
    shaking = false;
  }
  return 'window';
});

function localAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  return out;
}

// ---------------- Global Bas-Konuş (uiohook) ----------------
let uiohookMod;
let pttKeycode = null;
let pttDown = false;
let uiohookStarted = false;

function loadUiohook() {
  if (uiohookMod !== undefined) return uiohookMod;
  try {
    uiohookMod = require('uiohook-napi');
  } catch {
    uiohookMod = null;
  }
  return uiohookMod;
}

function stopPtt() {
  if (uiohookStarted && uiohookMod) {
    try { uiohookMod.uIOhook.stop(); } catch {}
  }
  uiohookStarted = false;
}

ipcMain.handle('ptt:set', (_e, keycode) => {
  const mod = loadUiohook();
  if (!mod) return { ok: false, reason: 'unavailable' };
  pttKeycode = keycode;
  if (keycode == null) {
    stopPtt();
    return { ok: true };
  }
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true); // izin penceresini aç
    return { ok: false, reason: 'accessibility' };
  }
  if (!uiohookStarted) {
    const { uIOhook } = mod;
    uIOhook.removeAllListeners();
    const isPtt = (e) => (e.keycode != null && e.keycode === pttKeycode) || (e.button != null && -e.button === pttKeycode);
    const down = (e) => {
      if (isPtt(e) && !pttDown) {
        pttDown = true;
        win?.webContents.send('ptt', true);
      }
    };
    const up = (e) => {
      if (isPtt(e) && pttDown) {
        pttDown = false;
        win?.webContents.send('ptt', false);
      }
    };
    uIOhook.on('keydown', down);
    uIOhook.on('keyup', up);
    uIOhook.on('mousedown', down);
    uIOhook.on('mouseup', up);
    uIOhook.start();
    uiohookStarted = true;
  }
  return { ok: true };
});

// Tuş yakalama modu: bir sonraki global tuşa / fare tuşuna basışı döndür
ipcMain.handle('ptt:capture', () => {
  const mod = loadUiohook();
  if (!mod) return null;
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true);
    return { error: 'accessibility' };
  }
  const { uIOhook } = mod;
  return new Promise((resolve) => {
    const startedHere = !uiohookStarted;
    const finish = (val) => {
      uIOhook.off('keydown', onKey);
      uIOhook.off('mousedown', onMouse);
      if (startedHere) {
        try { uIOhook.stop(); } catch {}
      }
      resolve(val);
    };
    const onKey = (e) => finish({ keycode: e.keycode, label: keyLabel(e.keycode) });
    const onMouse = (e) => {
      if (e.button <= 2) return; // sol/sağ tık hariç
      finish({ keycode: -e.button, label: `Fare ${e.button}` });
    };
    uIOhook.on('keydown', onKey);
    uIOhook.on('mousedown', onMouse);
    if (startedHere) uIOhook.start();
    setTimeout(() => finish(null), 10000);
  });
});

function keyLabel(code) {
  const mod = loadUiohook();
  if (!mod) return String(code);
  for (const [k, v] of Object.entries(mod.UiohookKey)) if (v === code) return k;
  return `Tuş ${code}`;
}
