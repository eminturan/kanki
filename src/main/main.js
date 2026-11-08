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
  powerMonitor,
  screen,
  globalShortcut,
} = require('electron');
const remoteInput = require('./remote-input');
const music = require('./music');
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
// Yerel IP'leri rastgele .local (mDNS) adlarının arkasına gizleme: bu adlar bazen çözülemiyor ve
// aynı ağdaki iki kişi hiç bağlanamıyor ("Ses bağlanıyor…" takılı kalıyor). Arkadaş uygulamasında gizlemeye gerek yok.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
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
let pendingSource = null; // { id, audio: 'clean' | 'plain' | false }

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
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Yayını ayrı pencerede açma: boş sayfa, içeriğini ana pencere doldurur
    if (frameName.startsWith('kanki-pop-') && (url === 'about:blank' || url === '')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 650,
          minWidth: 320,
          minHeight: 200,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          title: 'Kanki — Yayın',
          icon: path.join(__dirname, '..', '..', 'build', IS_ADMIN_BUILD ? 'icon-admin.png' : 'icon.png'),
          webPreferences: { backgroundThrottling: false },
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    child.setMenuBarVisibility(false);
    // Ana pencere kapanınca yayın pencereleri de kapansın
    win?.once('closed', () => !child.isDestroyed() && child.close());
  });
  win.on('closed', () => (win = null));
  if (process.env.KANKI_AUTOTEST) {
    win.webContents.on('console-message', (e) => {
      const msg = e.message;
      if (/AUTOTEST|\[kanki\]|Error/i.test(msg)) process.stdout.write(`[${JSON.parse(process.env.KANKI_AUTOTEST).name}] ${msg}\n`);
      // Test: arayüz "[kanki] SHOT ad" yazınca o anın görüntüsü KANKI_SHOT_DIR'e kaydedilir
      const shot = /^\[kanki\] SHOT (\S+)/.exec(msg);
      if (shot && process.env.KANKI_SHOT_DIR)
        win.webContents.capturePage().then((img) => fs.writeFileSync(path.join(process.env.KANKI_SHOT_DIR, shot[1] + '.png'), img.toPNG()));
    });
  }

  // Test: KANKI_SHOTS="ms:dosya.png,ms:dosya2.png" ile birden fazla ekran görüntüsü
  if (process.env.KANKI_SHOTS) {
    for (const part of process.env.KANKI_SHOTS.split(',')) {
      const i = part.indexOf(':');
      const ms = Number(part.slice(0, i));
      const file = part.slice(i + 1);
      setTimeout(async () => {
        if (!win || win.isDestroyed()) return;
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(file, img.toPNG());
      }, ms);
    }
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
        // Sistem sesi: "clean" = Kanki'nin kendi çaldığı sesler hariç (arkadaş sesleri ve izlenen yayınlar
        // yayına geri girmez, izleyenler kendi sesini yankı olarak duymaz). Chromium bunu Windows'ta işlem
        // bazlı yakalamayla (Kanki'nin ses işlemi hariç), macOS'ta ScreenCaptureKit ile yapar.
        // Desteklenmeyen sistemde açılamazsa uygulama "plain" (tüm sistem sesi) ile tekrar dener.
        if (sel.audio && request.audioRequested) streams.audio = sel.audio === 'clean' ? 'loopbackWithoutChrome' : 'loopback';
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
  setTimeout(check, 1500); // açılışta hemen bak: varsa bağlanmadan önce kurulabilsin
  setInterval(check, 30 * 60 * 1000); // açık kaldığı sürece 30 dakikada bir bak
}

ipcMain.handle('update:state', () => updateState);
// Ayarlar › Hakkında › "Güncellemeleri kontrol et"
ipcMain.handle('update:check', async () => {
  if (!updater) {
    const why = !app.isPackaged
      ? 'Geliştirme sürümünde güncelleme kontrolü yok.'
      : process.platform !== 'win32'
        ? 'Otomatik güncelleme sadece Windows kurulumlu sürümde çalışır; yeni sürümü indirme sayfasından al.'
        : VARIANT !== 'client'
          ? 'Kanki Admin kendini güncellemez.'
          : 'Kurulumsuz sürüm kendini güncelleyemez; kurulumlu sürümü kullan.';
    return { ok: false, message: why };
  }
  try {
    const r = await updater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    if (latest && latest !== app.getVersion()) return { ok: true, message: `Kanki ${latest} bulundu, indiriliyor…` };
    return { ok: true, message: 'Kanki güncel.' };
  } catch (e) {
    return { ok: false, message: 'Kontrol edilemedi: ' + (e?.message || e) };
  }
});
// Sistem genelinde kaç saniyedir klavye/fare kullanılmadı (otomatik "Boşta" için)
ipcMain.handle('app:idle-time', () => powerMonitor.getSystemIdleTime());
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

ipcMain.handle('media:ensure-camera', async () => {
  if (!isMac) return 'granted';
  let st = systemPreferences.getMediaAccessStatus('camera');
  if (st !== 'granted') st = (await systemPreferences.askForMediaAccess('camera')) ? 'granted' : 'denied';
  return st;
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

// =====================================================================
//  Müzik botu: sunucuyu kuran Kanki Admin'de görünmez bir pencerede çalışan kullanıcı
// =====================================================================
let botWin = null;
let botHeaders = {}; // YouTube ses akışı için gereken istek başlıkları (yt-dlp'den)
function startMusicBot() {
  if (!hostedServer || botWin || process.env.KANKI_NO_BOT) return;
  const ses = session.fromPartition('kanki-bot');
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*.googlevideo.com/*'] }, (d, cb) => {
    for (const [k, v] of Object.entries(botHeaders)) if (/^(user-agent|referer|origin|accept-language)$/i.test(k)) d.requestHeaders[k] = v;
    cb({ requestHeaders: d.requestHeaders });
  });
  botWin = new BrowserWindow({
    show: false,
    width: 320,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'bot', 'bot-preload.js'),
      partition: 'kanki-bot',
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      webSecurity: false, // farklı kaynaktan gelen müziğin WebRTC'ye aktarılabilmesi için (sadece botun kendi sayfası yüklenir)
    },
  });
  botWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  botWin.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.KANKI_AUTOTEST) {
    ses.webRequest.onCompleted({ urls: ['*://*.googlevideo.com/*'] }, (d) => process.stdout.write(`[bot] googlevideo ${d.statusCode} ${d.method}\n`));
    ses.webRequest.onErrorOccurred({ urls: ['*://*.googlevideo.com/*'] }, (d) => process.stdout.write(`[bot] googlevideo hata ${d.error}\n`));
  }
  if (process.env.KANKI_AUTOTEST)
    botWin.webContents.on('console-message', (e) => /\[bot\]|Error/i.test(e.message) && process.stdout.write(`[bot] ${e.message}\n`));
  botWin.loadFile(path.join(__dirname, '..', 'bot', 'bot.html'), { query: { ws: `ws://127.0.0.1:${hostedServer.port}`, key: hostedServer.botKey } });
  botWin.on('closed', () => (botWin = null));
}
function stopMusicBot() {
  if (botWin && !botWin.isDestroyed()) botWin.destroy();
  botWin = null;
}
const fromBot = (e) => botWin && e.sender === botWin.webContents;
const botStatus = (text) => botWin && !botWin.isDestroyed() && botWin.webContents.send('bot:status', text);
ipcMain.handle('bot:resolve', async (e, query) => {
  if (!fromBot(e)) return { ok: false, error: 'izin yok' };
  try {
    return { ok: true, items: await music.resolve(query, botStatus) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('bot:stream', async (e, url) => {
  if (!fromBot(e)) return { ok: false, error: 'izin yok' };
  try {
    const st = await music.stream(url, botStatus);
    botHeaders = st.headers || {};
    return { ok: true, ...st };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
app.on('will-quit', () => stopMusicBot());

// =====================================================================
//  Uzaktan kontrol (yayıncı tarafı): izleyen kişinin fare/klavyesini bu bilgisayara uygular
// =====================================================================
let rcBar = null;
const RC_STOP_KEY = 'CommandOrControl+Shift+X';

async function displayForSource(sourceId) {
  if (!/^screen:/.test(String(sourceId || ''))) return null; // pencere paylaşımında kontrol yok
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const src = sources.find((x) => x.id === sourceId);
  const displays = screen.getAllDisplays();
  const byId = src && displays.find((d) => String(d.id) === String(src.display_id));
  if (byId) return byId;
  return displays.length === 1 ? displays[0] : null;
}

// Paylaşılan ekranın üstünde, her pencerenin önünde duran küçük çubuk: kimin kontrol ettiği + Durdur
function showRcBar(display, who) {
  closeRcBar();
  const W = 380;
  const H = 46;
  const b = display.workArea;
  rcBar = new BrowserWindow({
    x: Math.round(b.x + (b.width - W) / 2),
    y: b.y + 8,
    width: W,
    height: H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  rcBar.setAlwaysOnTop(true, 'screen-saver');
  rcBar.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  rcBar.setContentProtection(true); // izleyenin görüntüsüne girmesin
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const keyLabel = isMac ? '⌘⇧X' : 'Ctrl+Shift+X';
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:transparent;font:13px -apple-system,"Segoe UI",sans-serif;overflow:hidden}
    .bar{box-sizing:border-box;height:46px;margin:0;display:flex;align-items:center;gap:10px;padding:0 8px 0 14px;border-radius:23px;
      background:rgba(8,10,11,.94);border:1px solid rgba(34,212,126,.55);color:#dfe8e3;-webkit-app-region:drag;user-select:none}
    .dot{width:9px;height:9px;border-radius:50%;background:#22d47e;box-shadow:0 0 0 0 rgba(34,212,126,.6);animation:p 1.6s infinite}
    @keyframes p{70%{box-shadow:0 0 0 8px rgba(34,212,126,0)}}
    .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t b{color:#fff}
    .k{font:11px ui-monospace,Menlo,Consolas,monospace;color:#7f908a}
    a{-webkit-app-region:no-drag;text-decoration:none;background:#ff4d5e;color:#fff;font-weight:700;padding:7px 14px;border-radius:16px}
    a:hover{background:#ff6170}</style>
    <div class="bar"><span class="dot"></span><span class="t"><b>${esc(who)}</b> ekranını kontrol ediyor</span><span class="k">${keyLabel}</span><a href="https://kanki.invalid/stop">Durdur</a></div>`;
  rcBar.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (url.endsWith('/stop')) requestRcStop('bar');
  });
  rcBar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  rcBar.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  rcBar.once('ready-to-show', () => {
    rcBar?.showInactive();
    // Test: çubuğun görüntüsünü kaydet
    if (process.env.KANKI_RC_BARSHOT)
      setTimeout(async () => rcBar && fs.writeFileSync(process.env.KANKI_RC_BARSHOT, (await rcBar.webContents.capturePage()).toPNG()), 600);
  });
}
function closeRcBar() {
  if (rcBar && !rcBar.isDestroyed()) rcBar.destroy();
  rcBar = null;
}
// Yayıncı çubuktan ya da kısayoldan durdurdu: arayüze haber ver (o da izleyene bildirir)
function requestRcStop(reason) {
  stopRc();
  win?.webContents.send('rc:stopped-locally', reason);
}
function stopRc() {
  remoteInput.stop();
  closeRcBar();
  try {
    globalShortcut.unregister(RC_STOP_KEY);
  } catch {}
}

ipcMain.handle('rc:check', () => remoteInput.check());
ipcMain.handle('rc:start', async (_e, sourceId, who) => {
  const display = await displayForSource(sourceId);
  if (!display) return { ok: false, reason: 'window', message: 'Uzaktan kontrol sadece tüm ekran paylaşımında çalışır.' };
  const r = remoteInput.start(display);
  if (!r.ok) return r;
  showRcBar(display, who || 'Biri');
  try {
    globalShortcut.register(RC_STOP_KEY, () => requestRcStop('shortcut'));
  } catch {}
  return { ok: true };
});
ipcMain.on('rc:input', (_e, msg) => remoteInput.input(msg));
ipcMain.handle('rc:stop', () => stopRc());
app.on('will-quit', () => stopRc());

ipcMain.handle('screen:select-source', (_e, id, audio) => {
  // audio: 'clean' | 'plain' | false (eski sürümlerden gelen true = 'plain')
  pendingSource = { id, audio: audio === 'clean' ? 'clean' : audio ? 'plain' : false };
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
    startMusicBot();
    return { ok: true, port: hostedServer.port, adminKey: hostedServer.adminKey, addresses: localAddresses() };
  } catch (e) {
    hostedServer = null;
    return { ok: false, error: e.code === 'EADDRINUSE' ? 'Bu port zaten kullanımda.' : e.message };
  }
});

ipcMain.handle('server:stop', async () => {
  stopMusicBot();
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
