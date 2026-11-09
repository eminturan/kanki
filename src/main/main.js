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
  dialog,
} = require('electron');
const remoteInput = require('./remote-input');
const music = require('./music');
const activity = require('./activity');
const http = require('http');
const https = require('https');
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

// --- Davet bağlantısı: kanki://join?d=... tıklanınca Kanki açılır ve sunucuya bağlanır ---
const inviteFrom = (s) => (/^kanki:\/\/join\/?\?d=([A-Za-z0-9_-]+)/i.exec(String(s || '')) || /^kanki:\/\/join\/([A-Za-z0-9_-]+)/i.exec(String(s || '')) || [])[1] || null;
let pendingInvite = process.argv.map(inviteFrom).find(Boolean) || null;
function deliverInvite(p) {
  if (!p) return;
  if (win && !win.webContents.isLoading()) {
    win.webContents.send('invite', p);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } else pendingInvite = p;
}
if (!process.env.KANKI_AUTOTEST) {
  try {
    if (process.defaultApp) app.setAsDefaultProtocolClient('kanki', process.execPath, [path.resolve(process.argv[1] || '.')]);
    else app.setAsDefaultProtocolClient('kanki');
  } catch {}
  // Tek kopya: ikinci açılış (ör. davet bağlantısı) açık olan pencereye gider
  if (!app.requestSingleInstanceLock()) app.exit(0); // pencere açmadan hemen çık
  else
    app.on('second-instance', (_e, argv) => {
      const p = argv.map(inviteFrom).find(Boolean);
      if (p) deliverInvite(p);
      else if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    });
}
app.on('open-url', (e, url) => {
  e.preventDefault();
  deliverInvite(inviteFrom(url));
});

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
    show: false, // tema ilk boyamada uygulansın, açık temada koyu flaş olmasın
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
  const showWin = () => win && !win.isDestroyed() && !win.isVisible() && win.show();
  win.once('ready-to-show', showWin);
  setTimeout(showWin, 4000); // sayfa takılırsa yine de görünsün
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.once('did-finish-load', () => {
    if (pendingInvite) setTimeout(() => deliverInvite(pendingInvite) || (pendingInvite = null), 1500);
  });
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
    } else if (/^https:\/\/[^/]*\.googlevideo\.com\//i.test(details.url)) {
      // Birlikte izle: YouTube akışı yt-dlp'nin verdiği başlıklarla istenir
      for (const [k, v] of Object.entries(watchHeaders)) if (/^(user-agent|referer|accept-language)$/i.test(k)) details.requestHeaders[k] = v;
      delete details.requestHeaders.Origin;
    }
    cb({ requestHeaders: details.requestHeaders });
  });
  // Birlikte izle: YouTube görüntüsü yayına aktarılabilsin (aksi halde tarayıcı "başka kaynak" diye engeller)
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://*.googlevideo.com/*'] }, (details, cb) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) if (/^access-control-allow-origin$/i.test(k)) delete headers[k];
    headers['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: headers });
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
// Hazır radyolar: radio-browser.info (ücretsiz, topluluk veritabanı). Bot sadece istasyon kimliği ya da adıyla çalar.
const RADIO_HOSTS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
const radioPlayable = (s) => s && /^https?:\/\//i.test(s.url_resolved || s.url || '') && !/\.(m3u8|pls|m3u)(\?|$)/i.test(s.url_resolved || s.url || '') && s.lastcheckok !== 0;
function radioGet(pathname) {
  const tryHost = (i) =>
    new Promise((resolve, reject) => {
      const req = https.get({ host: RADIO_HOSTS[i], path: pathname, headers: { 'User-Agent': 'Kanki/1.0' }, timeout: 8000 }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Zaman aşımı')));
      req.on('error', reject);
    }).catch((err) => (i + 1 < RADIO_HOSTS.length ? tryHost(i + 1) : Promise.reject(err)));
  return tryHost(0);
}
ipcMain.handle('bot:radio', async (e, arg) => {
  if (!fromBot(e)) return { ok: false, error: 'izin yok' };
  const q = String(arg || '').trim().slice(0, 100);
  if (!q) return { ok: false, error: 'Radyo adı yaz: !radyo virgin' };
  try {
    let st = null;
    if (/^[0-9a-f-]{36}$/i.test(q)) {
      const [s] = await radioGet(`/json/stations/byuuid/${q}`);
      if (radioPlayable(s)) st = s;
      radioGet(`/json/url/${q}`).catch(() => {}); // radio-browser'ın istediği tıklama sayacı
    } else {
      const list = await radioGet(`/json/stations/search?name=${encodeURIComponent(q)}&order=votes&reverse=true&limit=15&hidebroken=true`);
      st = list.find(radioPlayable) || null;
    }
    if (!st) return { ok: false, error: 'Bu adla çalınabilir bir radyo bulunamadı.' };
    return { ok: true, station: { name: String(st.name || 'Radyo').trim().slice(0, 80), url: st.url_resolved || st.url, favicon: /^https:\/\//.test(st.favicon || '') ? st.favicon : '' } };
  } catch (err) {
    return { ok: false, error: 'Radyo listesine ulaşılamadı: ' + err.message };
  }
});
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

// Flash (CS gibi): her monitöre en üstte, tıklanamaz, bembeyaz bir pencere; birkaç saniyede kaybolur.
// Kanki küçültülmüş olsa da masaüstünün, tarayıcının, pencereli/kenarlıksız tam ekran oyunun üstünde görünür.
// ("Exclusive fullscreen" oyunlarda Windows izin vermez; orada sadece ses duyulur.)
const FLASH_MS = 3200;
const FLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent}
#f{position:fixed;inset:0;background:#fff;opacity:1;animation:fade ${FLASH_MS - 200}ms cubic-bezier(.55,0,.85,.4) forwards}
@keyframes fade{0%,18%{opacity:1}100%{opacity:0}}
</style></head><body><div id="f"></div></body></html>`;
let flashWins = [];
function flashbang() {
  for (const w of flashWins) if (!w.isDestroyed()) w.destroy();
  flashWins = screen.getAllDisplays().map((d) => {
    const w = new BrowserWindow({
      ...d.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    w.setIgnoreMouseEvents(true);
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(FLASH_HTML));
    w.webContents.once('did-finish-load', () => {
      if (w.isDestroyed()) return;
      w.setBounds(d.bounds);
      w.showInactive();
      if (process.env.KANKI_FLASH_SHOT && d.id === screen.getPrimaryDisplay().id) {
        setTimeout(async () => !w.isDestroyed() && fs.writeFileSync(process.env.KANKI_FLASH_SHOT, (await w.webContents.capturePage()).toPNG()), 150);
      }
    });
    setTimeout(() => !w.isDestroyed() && w.destroy(), FLASH_MS);
    return w;
  });
  return flashWins.length;
}
ipcMain.handle('fx:flashbang', () => flashbang());

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

// =====================================================================
//  Ek özellikler: dosya gönder/indir, oyun/Spotify durumu, kısayollar, konuşanlar katmanı,
//  yayına işaret, birlikte izle (YouTube), RNNoise dosyası
// =====================================================================
function httpReq(url, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return lib.request(u, { method, headers: { 'ngrok-skip-browser-warning': '1', 'User-Agent': `Kanki/${app.getVersion()}`, ...headers } });
}
ipcMain.handle('file:upload', (_e, { url, token, name, type, data }) =>
  new Promise((resolve) => {
    const buf = Buffer.from(data);
    const req = httpReq(url, { method: 'POST', headers: { 'x-kanki-token': token, 'x-file-name': encodeURIComponent(name), 'content-type': type || 'application/octet-stream', 'content-length': buf.length } });
    req.on('response', (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          resolve({ error: `Sunucu yanıtı anlaşılamadı (${res.statusCode})` });
        }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(10 * 60 * 1000, () => req.destroy(new Error('Zaman aşımı')));
    req.end(buf);
  })
);
ipcMain.handle('file:download', async (_e, { url, name }) => {
  const safe = String(name || 'dosya').replace(/[\\/:*?"<>|]/g, '_');
  // Test: KANKI_DL_DIR verilirse kayıt penceresi açılmaz, dosya oraya iner
  const r = process.env.KANKI_AUTOTEST && process.env.KANKI_DL_DIR ? { filePath: path.join(process.env.KANKI_DL_DIR, safe) } : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), safe) });
  if (r.canceled || !r.filePath) return { canceled: true };
  return new Promise((resolve) => {
    const req = httpReq(url);
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let msg = `Sunucu ${res.statusCode} döndü`;
          try {
            msg = JSON.parse(d).error || msg;
          } catch {}
          resolve({ error: msg });
        });
        return;
      }
      const out = fs.createWriteStream(r.filePath);
      res.pipe(out);
      out.on('finish', () => resolve({ ok: true, path: r.filePath }));
      out.on('error', (e) => resolve({ error: e.message }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
});
ipcMain.handle('activity:scan', (_e, o) => activity.scan(o || {}).catch(() => ({ game: '', music: '' })));

// Kendi kısayolların (global: oyundayken de çalışır)
let userKeybinds = [];
ipcMain.handle('keys:set', (_e, list) => {
  for (const b of userKeybinds)
    try {
      globalShortcut.unregister(b.accel);
    } catch {}
  userKeybinds = [];
  const failed = [];
  for (const b of Array.isArray(list) ? list.slice(0, 40) : []) {
    try {
      if (b.accel === RC_STOP_KEY) throw new Error('reserved');
      if (globalShortcut.register(b.accel, () => win?.webContents.send('keybind', b.id))) userKeybinds.push(b);
      else failed.push(b.id);
    } catch {
      failed.push(b.id);
    }
  }
  return { failed };
});
app.on('will-quit', () => globalShortcut.unregisterAll());

// Konuşanlar katmanı: ekranın köşesinde, her şeyin üstünde, tıklanamaz küçük pencere
let overlayWin = null;
let overlayReady = false;
let overlayLast = null;
const OVERLAY_W = 240;
const OVERLAY_H = 320;
const OVERLAY_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 13px -apple-system,"Segoe UI",sans-serif;color:#fff}
#l{display:flex;flex-direction:column;gap:4px;padding:6px;height:100%;box-sizing:border-box;opacity:var(--o,.75)}
body.b #l{justify-content:flex-end}
body.r #l{align-items:flex-end}
.u{display:flex;align-items:center;gap:7px;padding:3px 10px 3px 3px;border-radius:14px;background:rgba(8,10,11,.5);max-width:226px;opacity:.6;transition:opacity .1s}
.u.s{opacity:1;background:rgba(8,10,11,.72)}
.a{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;color:#081009;flex:none;box-shadow:0 0 0 2px transparent}
.u.s .a{box-shadow:0 0 0 2px #22d47e}
.n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px #000}
.i{font-size:11px;opacity:.85}
.c{font:600 10px ui-monospace,Menlo,Consolas,monospace;color:#9fb3aa;padding:0 6px;text-shadow:0 1px 2px #000}
</style><body><div id="l"></div><script>
function upd(p){document.body.className=(p.pos[0]==='b'?'b ':'')+(p.pos[1]==='r'?'r':'');document.body.style.setProperty('--o',(p.alpha||75)/100);
var l=document.getElementById('l');l.innerHTML='';
if(p.channel&&p.items.length){var c=document.createElement('div');c.className='c';c.textContent=p.channel;l.appendChild(c);}
p.items.forEach(function(x){var d=document.createElement('div');d.className='u'+(x.speaking?' s':'');
var a=document.createElement('div');a.className='a';a.style.background=x.color;a.textContent=(x.name[0]||'?').toUpperCase();
var n=document.createElement('span');n.className='n';n.textContent=x.name;d.appendChild(a);d.appendChild(n);
if(x.muted||x.deaf){var i=document.createElement('span');i.className='i';i.textContent=x.deaf?'🔇':'🎙️✕';d.appendChild(i);}l.appendChild(d);});}
</script>`;
function placeOverlay(pos) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const b = screen.getPrimaryDisplay().workArea;
  const x = pos[1] === 'r' ? b.x + b.width - OVERLAY_W - 8 : b.x + 8;
  const y = pos[0] === 'b' ? b.y + b.height - OVERLAY_H - 8 : b.y + 8;
  overlayWin.setBounds({ x, y, width: OVERLAY_W, height: OVERLAY_H });
}
ipcMain.on('overlay:update', (_e, p) => {
  overlayLast = p;
  if (!p?.on) {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
    overlayWin = null;
    return;
  }
  if (!overlayWin || overlayWin.isDestroyed()) {
    overlayReady = false;
    overlayWin = new BrowserWindow({
      width: OVERLAY_W,
      height: OVERLAY_H,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    overlayWin.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    overlayWin.setIgnoreMouseEvents(true);
    overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlayWin.webContents.on('will-navigate', (e) => e.preventDefault());
    overlayWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML));
    overlayWin.webContents.once('did-finish-load', () => {
      overlayReady = true;
      if (overlayLast?.on) overlayWin.webContents.executeJavaScript(`upd(${JSON.stringify(overlayLast)})`).catch(() => {});
      overlayWin.showInactive();
      if (process.env.KANKI_OVERLAY_SHOT) setTimeout(async () => overlayWin && fs.writeFileSync(process.env.KANKI_OVERLAY_SHOT, (await overlayWin.webContents.capturePage()).toPNG()), 800);
    });
  }
  placeOverlay(p.pos || 'tl');
  if (overlayReady) overlayWin.webContents.executeJavaScript(`upd(${JSON.stringify(p)})`).catch(() => {});
});

// Yayına işaret: yayıncının ekranının üstünde şeffaf, tıklanamaz bir katman
const markWins = new Map(); // display id -> { win, timer, ready, queue }
const MARK_HTML = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
svg{position:absolute;inset:0;width:100%;height:100%}
.f{transition:opacity .7s;opacity:0}
text{font:700 15px -apple-system,"Segoe UI",sans-serif;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:3px}
@keyframes r{from{r:10;opacity:1}to{r:46;opacity:0}}
.ring{fill:none;stroke-width:4;animation:r 1s ease-out 3}
</style><body><svg id="s"></svg><script>
var NS='http://www.w3.org/2000/svg';
function draw(m){var s=document.getElementById('s'),W=innerWidth,H=innerHeight,g=document.createElementNS(NS,'g');
if(m.kind==='ping'){var x=m.pts[0][0]*W,y=m.pts[0][1]*H;
var r=document.createElementNS(NS,'circle');r.setAttribute('cx',x);r.setAttribute('cy',y);r.setAttribute('r',10);r.setAttribute('class','ring');r.setAttribute('stroke',m.color);g.appendChild(r);
var d=document.createElementNS(NS,'circle');d.setAttribute('cx',x);d.setAttribute('cy',y);d.setAttribute('r',9);d.setAttribute('fill',m.color);d.setAttribute('stroke','#000');d.setAttribute('stroke-width','2');g.appendChild(d);
var t=document.createElementNS(NS,'text');t.setAttribute('x',x+16);t.setAttribute('y',y-14);t.textContent=m.name;g.appendChild(t);}
else{var p=document.createElementNS(NS,'polyline');p.setAttribute('points',m.pts.map(function(q){return q[0]*W+','+q[1]*H}).join(' '));
p.setAttribute('fill','none');p.setAttribute('stroke',m.color);p.setAttribute('stroke-width','5');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');g.appendChild(p);}
s.appendChild(g);setTimeout(function(){g.setAttribute('class','f')},2600);setTimeout(function(){g.remove()},3400);}
</script>`;
ipcMain.handle('mark:show', async (_e, m) => {
  const display = await displayForSource(m?.sourceId);
  if (!display) return false;
  let mw = markWins.get(display.id);
  if (!mw || mw.win.isDestroyed()) {
    const b = display.bounds;
    const w = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    w.setIgnoreMouseEvents(true);
    w.setContentProtection(true); // izleyenler işareti zaten kendi görüntülerinde görüyor; yayına iki kez girmesin
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    mw = { win: w, ready: false, queue: [], timer: null };
    markWins.set(display.id, mw);
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(MARK_HTML));
    w.webContents.once('did-finish-load', () => {
      mw.ready = true;
      w.showInactive();
      for (const q of mw.queue.splice(0)) w.webContents.executeJavaScript(`draw(${JSON.stringify(q)})`).catch(() => {});
    });
  }
  const msg = { kind: m.kind === 'line' ? 'line' : 'ping', pts: (m.pts || []).slice(0, 80), name: String(m.name || '').slice(0, 40), color: /^#[0-9a-f]{3,8}$|^hsl\([\d.,% ]+\)$/i.test(m.color) ? m.color : '#22d47e' };
  if (mw.ready) mw.win.webContents.executeJavaScript(`draw(${JSON.stringify(msg)})`).catch(() => {});
  else mw.queue.push(msg);
  clearTimeout(mw.timer);
  mw.timer = setTimeout(() => {
    if (!mw.win.isDestroyed()) mw.win.destroy();
    markWins.delete(display.id);
  }, 6000);
  return true;
});

// Birlikte izle: YouTube videosunun görüntü ve ses adresleri (yt-dlp)
let watchHeaders = {};
ipcMain.handle('watch:resolve', async (_e, url, maxHeight) => {
  try {
    const r = await music.video(String(url || ''), undefined, maxHeight);
    watchHeaders = r.headers || {};
    return r;
  } catch (e) {
    return { error: String(e.message || e).slice(0, 300) };
  }
});
// RNNoise (yapay zekâ gürültü engelleme) WebAssembly dosyası
// Ayarlar › Hakkında: Kanki'nin süreçlerinin bellek kullanımı (Görev Yöneticisi'ndeki gibi)
ipcMain.handle('app:mem', () => {
  const NAMES = { Browser: 'Ana süreç', Tab: 'Arayüz', GPU: 'Ekran kartı', Utility: 'Yardımcı' };
  const parts = {};
  let total = 0;
  for (const p of app.getAppMetrics()) {
    const mb = (p.memory?.workingSetSize || 0) / 1024;
    const k = NAMES[p.type] || p.type;
    parts[k] = (parts[k] || 0) + mb;
    total += mb;
  }
  return { total: Math.round(total), parts: Object.entries(parts).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]) };
});

ipcMain.handle('asset:read', (_e, name) => {
  if (name !== 'rnnoise') return null;
  const dir = path.join(__dirname, '..', 'renderer', 'vendor', 'rnnoise');
  let file = path.join(dir, 'rnnoise_simd.wasm');
  try {
    const b = fs.readFileSync(file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  } catch {
    file = path.join(dir, 'rnnoise.wasm');
    const b = fs.readFileSync(file);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
});

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
