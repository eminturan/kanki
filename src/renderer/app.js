'use strict';
/* global kanki */

// =====================================================================
//  Yardımcılar
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[kanki]', ...a);

const ICON = {
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Zm-7 9a1 1 0 1 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12Z"/></svg>',
  micOff: '<svg viewBox="0 0 24 24"><path d="M3.3 2.3 2 3.6l6 6V12a4 4 0 0 0 6.1 3.4l1.5 1.5A5 5 0 0 1 7 12a1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.07a6.9 6.9 0 0 0 4.1-1.8l3.3 3.3 1.3-1.3L3.3 2.3ZM16 12V7a4 4 0 0 0-7.6-1.7L16 12.9V12Zm3 0a1 1 0 1 0-2 0c0 .5-.07 1-.2 1.46l1.6 1.6A6.9 6.9 0 0 0 19 12Z"/></svg>',
  head: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9Z"/></svg>',
  headOff: '<svg viewBox="0 0 24 24"><path d="M3.3 2.3 2 3.6l2.3 2.3A8.9 8.9 0 0 0 3 12v6a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1c0-1.2.3-2.3.8-3.3L17 19.9V19a2 2 0 0 0 .1.6l3.3 3.3 1.3-1.3L3.3 2.3ZM12 3c-1.8 0-3.4.5-4.8 1.4l1.5 1.5A7 7 0 0 1 19 12v1h-2a2 2 0 0 0-1.6.8L21 19.4V12a9 9 0 0 0-9-9Z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.8ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.96.96 0 0 1 0-1.36C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.72c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.3 11.3 0 0 0-2.67-1.85.99.99 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"/></svg>',
  channel: '<svg viewBox="0 0 24 24"><path d="M11.38 3.08A1 1 0 0 1 12 4v16a1 1 0 0 1-1.7.7L5.58 16H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2.58l4.72-4.7a1 1 0 0 1 1.08-.22ZM15.1 8.3a1 1 0 0 1 1.4.1 5.5 5.5 0 0 1 0 7.2 1 1 0 1 1-1.5-1.3 3.5 3.5 0 0 0 0-4.6 1 1 0 0 1 .1-1.4Zm2.85-2.6a1 1 0 0 1 1.41.05 9.5 9.5 0 0 1 0 12.5 1 1 0 0 1-1.46-1.36 7.5 7.5 0 0 0 0-9.78 1 1 0 0 1 .05-1.41Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
  speakerOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm11.6.2 1.4-1.4 2 2 2-2 1.4 1.4-2 2 2 2-1.4 1.4-2-2-2 2-1.4-1.4 2-2-2-2Z"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 6h11a2 2 0 0 1 2 2v1.5l3.4-2.3A1 1 0 0 1 22 8v8a1 1 0 0 1-1.6.8L17 14.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/></svg>',
  cameraOff: '<svg viewBox="0 0 24 24"><path d="M3.3 2.3 2 3.6 4.4 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11c.4 0 .8-.1 1.1-.3l4.3 4.3 1.3-1.3L3.3 2.3ZM22 8a1 1 0 0 0-1.6-.8L17 9.5V8a2 2 0 0 0-2-2H9.2L22 18.8V8Z"/></svg>',
  screen: '<svg viewBox="0 0 24 24"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6v2h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2H5a2 2 0 0 1-2-2V5Zm2 0v10h14V5H5Zm7 1.5 3.5 3.5H13v3h-2v-3H8.5L12 6.5Z"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16h-9V7h9v14Z"/></svg>',
  react: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm-3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5c2.3 0 4.3-1.4 5-3.5H7c.7 2.1 2.7 3.5 5 3.5ZM19 1v3h3v2h-3v3h-2V6h-3V4h3V1h2Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2Z" transform="translate(-1 0)"/></svg>',
};

const COLORS = ['#3d8bfd', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#22c55e', '#eab308', '#ef4444', '#06b6d4', '#a855f7'];
const colorFor = (name) => {
  let x = 0;
  for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return (document.documentElement.dataset.scheme === 'light' && self.KANKI_COLORS_LIGHT || COLORS)[x % COLORS.length]; // açık temada koyu palet (appearance.js)
};
// Profil fotoğrafı: kişinin adına göre bulunur (sohbet geçmişindeki eski mesajlarda da görünsün diye)
const avatarImg = (name) => {
  if (!name) return null;
  if (name === S.myName && settings.avatar) return settings.avatar;
  for (const u of S.users.values()) if (u.name === name) return S.avatars.get(u.id) || null;
  return null;
};
const avatar = (name, extra = '') => {
  const el = h('div', { class: `avatar ${extra}` }, (name || '?').trim().charAt(0).toUpperCase());
  el.style.background = colorFor(name || '?');
  const img = avatarImg(name);
  if (img) {
    el.textContent = '';
    el.classList.add('has-img');
    el.style.backgroundImage = `url("${img}")`;
  }
  return el;
};

function toast(title, body = '', kind = '', ms = 4500) {
  const el = h('div', { class: `toast ${kind}` }, h('b', {}, title), body);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

// =====================================================================
//  Ayarlar (yerel)
// =====================================================================
const DEFAULT_SETTINGS = {
  nick: '',
  inputId: 'default',
  outputId: 'default',
  mode: 'vad',
  vad: -52,
  pttKey: null,
  pttLabel: '',
  ns: true,
  ec: true,
  agc: true,
  sounds: true,
  codec: 'auto',
  autoWatch: true,
  notify: true,
  autoIdle: true,
  presence: 'online', // online | idle | dnd (kullanıcının seçtiği)
  statusText: '', // özel durum yazısı (ör. "🎮 Valorant")
  nameStyle: null, // isim stili: { font, effect, c1, c2, inMessages }
  avatar: null, // profil fotoğrafı (küçük data URL)
  cameraId: 'default',
  chatHidden: false,
  userVolumes: {},
  localMutes: {},
  sfxVolume: 50, // ses efektlerinin sende ne kadar yüksek çalacağı (0 = kapalı)
  showGame: true, // oynadığım oyunu adımın altında göster
  showMusic: true, // Spotify'da dinlediğimi göster
  rnnoise: false, // yapay zekâ gürültü engelleme
  overlay: false, // konuşanlar katmanı
  overlayOnly: false,
  overlayPos: 'tl',
  keybinds: [], // kendi kısayolların: { id, action, sid?, who?, accel }
  share: { res: '1080', fps: '60', hint: 'motion', bitrate: '0', audio: true },
  recent: [],
  host: { name: '', port: 4455 },
};
const settings = (() => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('kanki-settings') || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
})();
const saveSettings = () => localStorage.setItem('kanki-settings', JSON.stringify(settings));
// Ses efektleri: çalan sesler (kişi başı bir tane), kimin ne çaldığı (ismin yanında kısa süre görünür)
const sfx = { ctx: null, playing: new Map(), active: new Map(), coolUntil: 0, coolTimer: null };
const SFX_BY_ID = new Map(KankiSfx.BUILTIN.map((x) => [x.sid, x]));
const SFX_COOLDOWN = 1300;
const SFX_SHOW_MS = 2400;
// Bu bilgisayara özel kalıcı anahtar: sunucu kendi mesajlarını düzenleyip silebilmen için bununla tanır
const CLIENT_KEY = (() => {
  try {
    let k = localStorage.getItem('kanki-client-key');
    if (!k) localStorage.setItem('kanki-client-key', (k = crypto.randomUUID()));
    return k;
  } catch {
    return crypto.randomUUID();
  }
})();

// =====================================================================
//  Durum
// =====================================================================
const S = {
  ws: null,
  url: '',
  password: '',
  intentionalClose: false,
  reconnectTimer: null,
  myId: null,
  myName: '',
  serverName: '',
  iceServers: [],
  channels: [],
  users: new Map(),
  channelId: null,
  lastChannelId: null,
  muted: false,
  deafened: false,
  transmitting: false,
  pttDown: false,
  peers: new Map(),
  chat: new Map(), // channelId -> messages
  // ekran paylaşımı
  myShares: new Map(), // shareId -> { id, label, stream, opts, watchers:Set }
  watching: new Set(), // izlediğim yayınlar: "userId|shareId"
  knownShares: new Set(), // kanalda gördüğüm yayınlar (yeni yayını fark etmek için)
  remoteScreens: new Map(), // "userId|shareId" -> { userId, shareId, video, audioEl, volume, trackId }
  layout: new Map(), // "userId|shareId" -> { x, y, w, h } (sahnenin yüzdesi)
  layoutCustom: false, // kullanıcı bir pencereyi taşıdıysa otomatik ızgarayı bozma
  activeTile: null,
  hosting: null,
  variant: 'admin',
  isAdmin: false,
  adminKey: '',
  typing: new Map(), // userId -> son 'yazıyor' zamanı
  autoIdle: false, // sistem hareketsiz olduğu için otomatik Boşta
  mutedBeforeDeafen: false,
  platform: 'darwin',
  avatars: new Map(), // userId -> profil fotoğrafı
  replyTo: null, // yanıtlanan mesaj
  editing: null, // düzenlenen mesajın id'si
  editDraft: '',
  pendingImage: null, // gönderilmeyi bekleyen resim { data, w, h, name }
  unread: 0, // sohbet gizliyken gelen mesaj sayısı
  rcHost: null, // benim ekranımı kontrol eden: { peerId, shareId, name }
  rcPending: null, // bekleyen kontrol isteği: { peerId, shareId, timer }
  rcView: null, // benim kontrol ettiğim yayın: { key, peerId, shareId, state: 'pending' | 'active', timer }
  rcFocus: false, // klavye karşı tarafa gidiyor mu (görüntüye tıklanınca)
  botState: null, // müzik botunun durumu (çalan şarkı, kuyruk)
  chatView: null, // sağ panelde açık yazı kanalı (null = bulunduğum ses kanalının sohbeti)
  textUnread: new Map(), // yazı kanalı -> { n, mention }
  textLoaded: new Set(), // geçmişi alınmış yazı kanalları
};
// Yazı kanalları
const isTextCh = (cid) => S.channels.find((c) => c.id === cid)?.type === 'text';
const chatChannel = () => S.chatView || S.channelId;

// =====================================================================
//  Ses motoru
// =====================================================================
const audio = {
  ctx: null,
  micStream: null, // gönderilen akış
  micTrack: null,
  analysisTrack: null,
  micAnalyser: null,
  level: -100,
  remote: new Map(), // userId -> { el, analyser, speaking }
  lastLoud: 0,
};

function getCtx() {
  if (!audio.ctx) audio.ctx = new AudioContext({ latencyHint: 'interactive' });
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}

function rmsDb(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

async function startMic() {
  stopMic();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.inputId && settings.inputId !== 'default' ? { exact: settings.inputId } : undefined,
        echoCancellation: settings.ec,
        noiseSuppression: settings.ns && !settings.rnnoise, // RNNoise açıksa ikisi üst üste binmesin
        autoGainControl: settings.agc,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });
    audio.rawMicStream = stream;
    let useStream = stream;
    if (settings.rnnoise) {
      try {
        useStream = await rnnoiseStream(stream); // yapay zekâ gürültü engelleme
      } catch (e) {
        log('rnnoise', e);
        toast('Yapay zekâ gürültü engelleme açılamadı', String(e.message || e), 'err');
      }
    }
    audio.micStream = useStream;
    audio.micTrack = useStream.getAudioTracks()[0];
    audio.micTrack.contentHint = 'speech';
    audio.analysisTrack = audio.micTrack.clone();
    audio.analysisTrack.enabled = true;
    const ctx = getCtx();
    const src = ctx.createMediaStreamSource(new MediaStream([audio.analysisTrack]));
    audio.micAnalyser = ctx.createAnalyser();
    audio.micAnalyser.fftSize = 1024;
    src.connect(audio.micAnalyser);
    audio.micTrack.enabled = false;
    // Mevcut eşlere yeni izi ver
    for (const p of S.peers.values()) if (!p.isBot) p.setMicTrack(audio.micTrack, audio.micStream);
    audio.micTrack.addEventListener('ended', () => toast('Mikrofon bağlantısı kesildi', 'Ayarlardan başka bir mikrofon seç.', 'err'));
    return true;
  } catch (e) {
    log('mic error', e);
    toast('Mikrofon açılamadı', e.message || String(e), 'err');
    return false;
  }
}

function stopMic() {
  audio.micTrack?.stop();
  audio.rawMicStream?.getTracks().forEach((t) => t.stop());
  stopRnnoise();
  audio.analysisTrack?.stop();
  audio.micStream = audio.micTrack = audio.analysisTrack = audio.micAnalyser = null;
}

// Konuşma kapısı: VAD / bas-konuş / sürekli
const levelBuf = new Float32Array(1024);
function audioTick() {
  const now = performance.now();
  // Kendi seviyem
  if (audio.micAnalyser) audio.level = rmsDb(audio.micAnalyser, levelBuf);
  else audio.level = -100;

  let open = false;
  if (!S.muted && !S.deafened && audio.micTrack) {
    if (settings.mode === 'open') open = true;
    else if (settings.mode === 'ptt') open = S.pttDown;
    else {
      if (audio.level > settings.vad) audio.lastLoud = now;
      open = now - audio.lastLoud < 350;
    }
  }
  if (audio.micTrack && audio.micTrack.enabled !== open) audio.micTrack.enabled = open;
  const speaking = open && (settings.mode !== 'vad' ? audio.level > settings.vad - 6 : true);
  if (speaking !== S.transmitting) {
    S.transmitting = speaking;
    setSpeaking(S.myId, speaking);
  }
  // Uzak kullanıcılar
  for (const [id, r] of audio.remote) {
    if (!r.analyser) continue;
    const lvl = rmsDb(r.analyser, levelBuf);
    const sp = lvl > -58 && !S.deafened;
    if (sp) r.lastLoud = now;
    const on = now - (r.lastLoud || 0) < 250;
    if (on !== r.speaking) {
      r.speaking = on;
      setSpeaking(id, on);
    }
  }
  // Ayarlar ekranındaki seviye çubuğu
  if (!$('#settings').classList.contains('hidden')) {
    const pct = Math.max(0, Math.min(100, ((audio.level + 80) / 70) * 100));
    $('#meter-fill').style.width = pct + '%';
  }
}
setInterval(audioTick, 40);

function setSpeaking(id, on) {
  if (!id) return;
  for (const el of $$(`[data-av="${id}"]`)) el.classList.toggle('speaking', on);
}

function attachRemoteAudio(userId, stream) {
  let r = audio.remote.get(userId);
  if (!r) {
    const el = new Audio();
    el.autoplay = true;
    r = { el, analyser: null, speaking: false };
    audio.remote.set(userId, r);
  }
  r.el.srcObject = stream;
  applyRemoteVolume(userId);
  if (settings.outputId && r.el.setSinkId) r.el.setSinkId(settings.outputId).catch(() => {});
  r.el.play().catch(() => {});
  try {
    const ctx = getCtx();
    const src = ctx.createMediaStreamSource(stream);
    r.analyser = ctx.createAnalyser();
    r.analyser.fftSize = 1024;
    src.connect(r.analyser);
  } catch (e) {
    log('analyser', e);
  }
}

function detachRemoteAudio(userId) {
  const r = audio.remote.get(userId);
  if (!r) return;
  r.el.srcObject = null;
  audio.remote.delete(userId);
  setSpeaking(userId, false);
}

function applyRemoteVolume(userId) {
  const r = audio.remote.get(userId);
  if (r) {
    r.el.volume = Math.min(1, (settings.userVolumes[volKey(userId)] ?? 100) / 100);
    r.el.muted = S.deafened || !!settings.localMutes[userName(userId)] || silencedByServer(userId);
  }
  applyScreenVolumes();
}
function applyScreenVolumes() {
  for (const sc of S.remoteScreens.values()) if (sc.audioEl) sc.audioEl.muted = S.deafened || !!sc.muted;
}
const userName = (id) => S.users.get(id)?.name || '';
const volKey = (id) => userName(id);

// Basit bildirim sesleri
function beep(kind) {
  if (!settings.sounds) return;
  try {
    const ctx = getCtx();
    const tones = { join: [520, 780], leave: [780, 520], mute: [440], unmute: [660], poke: [880, 660, 880], msg: [990], mention: [784, 1175, 1568] }[kind] || [600];
    let t = ctx.currentTime;
    for (const f of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.13);
      t += 0.09;
    }
  } catch {}
}

// Dürtme sesi: kısa bir "ding" ardından titreşim vızıltısı (WebAudio ile üretilir)
function playBuzz() {
  if (S.deafened) return;
  try {
    const ctx = getCtx();
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);

    // Dikkat çeken iki notalık giriş
    [[1046, 0], [1568, 0.07]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.16);
      o.connect(g).connect(out);
      o.start(t0 + d);
      o.stop(t0 + d + 0.18);
    });

    // Titreşim: alçak frekanslı testere dalgası, hızlı aç-kapa ile "brrr"
    const start = t0 + 0.16;
    const dur = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, start);
    body.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
    body.gain.setValueAtTime(0.22, start + dur - 0.12);
    body.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(trem.gain);
    for (const [f, type] of [[74, 'sawtooth'], [148, 'square'], [111, 'sawtooth']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, start);
      o.frequency.linearRampToValueAtTime(f * 0.92, start + dur);
      const g = ctx.createGain();
      g.gain.value = type === 'square' ? 0.25 : 0.5;
      o.connect(g).connect(trem);
      o.start(start);
      o.stop(start + dur + 0.02);
    }
    trem.connect(lp).connect(body).connect(out);
    lfo.start(start);
    lfo.stop(start + dur + 0.02);
  } catch (e) {
    log('buzz', e);
  }
}

// Dürtülünce: ses + pencereyi titret (pencere taşınamıyorsa içeriği titret)
let lastNudge = 0;
async function nudge(strong = true) {
  const now = Date.now();
  if (now - lastNudge < 2500) return; // art arda dürtmeler pencereyi deli gibi sallamasın
  lastNudge = now;
  if (strong) playBuzz();
  const shakeContent = () => {
    const el = $$('.screen').find((s) => !s.classList.contains('hidden'));
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    setTimeout(() => el.classList.remove('nudge'), 650);
  };
  if (!strong) return shakeContent();
  const how = await kanki.shake().catch(() => 'css');
  if (how !== 'window') shakeContent();
}

// =====================================================================
//  WebRTC eşleri (perfect negotiation)
// =====================================================================
function preferCodecs(transceiver, kind) {
  try {
    if (kind !== 'video' || !RTCRtpSender.getCapabilities) return;
    const caps = RTCRtpSender.getCapabilities('video').codecs;
    const want = settings.codec === 'auto' ? 'H264' : settings.codec;
    const score = (c) => {
      const mt = c.mimeType.toUpperCase();
      if (mt === `VIDEO/${want}`) return /profile-level-id=64/.test(c.sdpFmtpLine || '') ? 0 : 1;
      if (mt === 'VIDEO/VP9') return 2;
      if (mt === 'VIDEO/H264') return 3;
      if (mt === 'VIDEO/VP8') return 4;
      if (/RTX|RED|ULPFEC|FLEXFEC/.test(mt)) return 9;
      return 5;
    };
    const sorted = [...caps].sort((a, b) => score(a) - score(b));
    transceiver.setCodecPreferences(sorted);
  } catch (e) {
    log('codec pref', e);
  }
}

function mungeOpus(sdp) {
  // Opus: stereo + yüksek bit hızı + FEC
  return sdp.replace(/a=fmtp:(\d+) (.*useinbandfec=1.*)/g, (line, pt, params) => {
    if (/stereo=1/.test(params)) return line;
    return `a=fmtp:${pt} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=128000`;
  });
}

class Peer {
  constructor(id) {
    this.id = id;
    this.polite = S.myId > id;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.queue = Promise.resolve();
    this.micSender = null;
    this.screenTx = new Map(); // gönderdiğim yayınlar: shareId -> [transceiver]
    this.remoteMeta = new Map(); // karşının yayın akışları: streamId -> shareId
    this.remoteSurface = new Map(); // karşının yayınları: shareId -> 'screen' | 'window' | 'camera'
    this.rcCh = null; // uzaktan kontrol veri kanalı
    this.pc = new RTCPeerConnection({ iceServers: S.iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    const pc = this.pc;

    pc.onnegotiationneeded = () => {
      // İlk bağlantıda iki taraf aynı anda teklif yaparsa (aynı anda katılma) Chromium'da geri alınan
      // taraf bazen hiç bağlantı adayı toplamıyor ve ses hiç bağlanmıyor. Bunu önlemek için ilk teklifi
      // sadece "kaba" taraf yapar; "kibar" taraf karşının teklifini bekler, gelmezse 2,5 sn sonra kendisi yapar.
      if (this.polite && !pc.remoteDescription) {
        clearTimeout(this.offerTimer);
        this.offerTimer = setTimeout(() => {
          if (!pc.remoteDescription && pc.signalingState === 'stable' && pc.connectionState !== 'closed') this.makeOffer();
        }, 2500);
        return;
      }
      this.makeOffer();
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal({ candidate: candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      log('peer', userName(id), pc.connectionState);
      if (pc.connectionState === 'failed') pc.restartIce();
      if (pc.connectionState === 'connected') this.tuneSenders();
      renderTree();
    };
    pc.ontrack = (e) => this.onTrack(e);

    this.isBot = !!S.users.get(id)?.bot;
    if (audio.micTrack && !this.isBot) this.setMicTrack(audio.micTrack, audio.micStream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });

    // Bekçi: bağlantı 12 sn içinde kurulamazsa ICE'ı yeniden başlat (aynı anda katılmalarda
    // çakışan teklifler yüzünden aday kaybolabiliyor). Çakışmasın diye sadece bir taraf yapar.
    this.lastTry = Date.now();
    this.watchdog = setInterval(() => {
      const st = pc.connectionState;
      if (st === 'connected' || st === 'closed') return;
      // Önce kaba taraf (12 sn), o da işe yaramazsa kibar taraf (20 sn) yeniden dener
      if (pc.signalingState === 'stable' && Date.now() - this.lastTry > (this.polite ? 20000 : 12000)) {
        this.lastTry = Date.now();
        log('peer', userName(id), 'bağlanamadı, ICE yeniden başlatılıyor');
        pc.restartIce();
      }
    }, 3000);
  }

  async makeOffer() {
    const pc = this.pc;
    try {
      this.makingOffer = true;
      await pc.setLocalDescription();
      this.signal({ desc: pc.localDescription.toJSON() });
    } catch (e) {
      log('negotiation', e);
    } finally {
      this.makingOffer = false;
    }
  }

  signal(data) {
    send({ t: 'signal', to: this.id, data });
  }

  setMicTrack(track, stream) {
    if (this.micSender) {
      this.micSender.replaceTrack(track);
    } else {
      this.micSender = this.pc.addTrack(track, stream);
    }
  }

  async tuneSenders() {
    if (this.micSender) {
      try {
        const p = this.micSender.getParameters();
        if (p.encodings?.length) {
          p.encodings[0].maxBitrate = 96000;
          p.encodings[0].priority = 'high';
          p.encodings[0].networkPriority = 'high';
          await this.micSender.setParameters(p);
        }
      } catch {}
    }
  }

  handle(data) {
    this.queue = this.queue.then(() => this._handle(data)).catch((e) => log('signal err', e));
  }

  async _handle(data) {
    const pc = this.pc;
    if (data.desc) {
      const desc = { type: data.desc.type, sdp: mungeOpus(data.desc.sdp) };
      const collision = desc.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        this.signal({ desc: pc.localDescription.toJSON() });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (e) {
        if (!this.ignoreOffer) log('ice', e);
      }
    } else if (data.kind === 'watch') {
      // Eski sürümler shareId göndermez: o durumda ilk yayınımı gönder
      const ids = data.shareId ? [data.shareId] : [...S.myShares.keys()].slice(0, 1);
      for (const sid of ids) {
        const sh = S.myShares.get(sid);
        if (!sh) continue;
        if (data.on) {
          sh.watchers.add(this.id);
          this.sendShare(sid);
        } else {
          sh.watchers.delete(this.id);
          this.stopShare(sid);
        }
      }
      renderSelfShare();
    } else if (data.kind === 'screen-meta') {
      this.remoteMeta.set(data.streamId, data.shareId || 'main');
      if (data.surface) {
        this.remoteSurface.set(data.shareId || 'main', data.surface);
        renderTiles();
      }
    } else if (data.kind === 'rc-request') {
      onRcRequest(this.id, data.shareId);
    } else if (data.kind === 'rc-answer') {
      onRcAnswer(this.id, data);
    } else if (data.kind === 'rc-stop') {
      onRcStop(this.id, data);
    } else if (data.kind === 'rc-in') {
      rcIncoming(this.id, data.m); // veri kanalı açılana kadar sunucu üzerinden
    } else if (data.kind === 'screen-ended') {
      if (data.shareId) dropRemoteScreen(shareKey(this.id, data.shareId));
      else dropUserScreens(this.id);
    }
  }

  onTrack(e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    let shareId = this.remoteMeta.get(stream.id);
    if (!shareId && e.track.kind === 'video') shareId = 'main';
    if (shareId) addRemoteScreenTrack(this.id, shareId, e.track);
    else attachRemoteAudio(this.id, stream);
  }

  sendShare(shareId) {
    const sh = S.myShares.get(shareId);
    if (!sh || this.screenTx.has(shareId)) return;
    const o = sh.opts;
    this.signal({ kind: 'screen-meta', shareId, streamId: sh.stream.id, surface: sh.kind === 'camera' ? 'camera' : sh.opts.surface || 'screen' });
    const txs = [];
    for (const track of sh.stream.getTracks()) {
      const isVideo = track.kind === 'video';
      const tx = this.pc.addTransceiver(track, {
        direction: 'sendonly',
        streams: [sh.stream],
        sendEncodings: isVideo
          ? [{ maxBitrate: o.bitrate * 1000, maxFramerate: o.fps, priority: 'high', networkPriority: 'high' }]
          : [{ maxBitrate: 160000 }],
      });
      if (isVideo) preferCodecs(tx, 'video');
      txs.push(tx);
    }
    this.screenTx.set(shareId, txs);
  }

  // Yayın düzenlenince: aynı gönderim kanalında izi değiştir (yeniden bağlanma yok)
  async replaceShareTrack(shareId, kind, track) {
    const tx = (this.screenTx.get(shareId) || []).find((t) => t.receiver.track.kind === kind);
    if (tx) await tx.sender.replaceTrack(track).catch((e) => log('replaceTrack', e.message));
  }
  addShareTrack(shareId, track, stream) {
    const txs = this.screenTx.get(shareId);
    if (!txs) return;
    txs.push(this.pc.addTransceiver(track, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 160000 }] }));
  }
  async updateShareEncoding(shareId, bitrate, fps) {
    for (const tx of this.screenTx.get(shareId) || []) {
      if (tx.receiver.track.kind !== 'video') continue;
      try {
        const p = tx.sender.getParameters();
        if (!p.encodings?.length) continue;
        p.encodings[0].maxBitrate = bitrate * 1000;
        p.encodings[0].maxFramerate = fps;
        await tx.sender.setParameters(p);
      } catch (e) {
        log('setParameters', e.message);
      }
    }
  }

  stopShare(shareId, notify = true) {
    const txs = this.screenTx.get(shareId);
    if (!txs) return;
    for (const tx of txs) {
      try {
        tx.sender.replaceTrack(null);
        tx.stop();
      } catch {}
    }
    this.screenTx.delete(shareId);
    if (notify) this.signal({ kind: 'screen-ended', shareId });
  }

  // Uzaktan kontrol için doğrudan (P2P) veri kanalı; iki taraf da aynı kimlikle açar
  ensureRcChannel() {
    if (this.rcCh && this.rcCh.readyState !== 'closed') return this.rcCh;
    const ch = this.pc.createDataChannel('kanki-rc', { negotiated: true, id: 42, ordered: true });
    ch.onmessage = (ev) => {
      try {
        rcIncoming(this.id, JSON.parse(ev.data));
      } catch {}
    };
    this.rcCh = ch;
    return ch;
  }
  sendRc(m) {
    if (this.rcCh?.readyState === 'open') this.rcCh.send(JSON.stringify(m));
    else this.signal({ kind: 'rc-in', m });
  }

  // Belirli bir görüntü izinin (trackId) gelen istatistikleri
  async inboundVideo(trackId) {
    const report = await this.pc.getStats();
    let stat = null;
    let any = null;
    report.forEach((x) => {
      if (x.type === 'inbound-rtp' && x.kind === 'video') {
        any = any || x;
        if (!trackId || x.trackIdentifier === trackId) stat = x;
      }
    });
    return { stat: stat || (trackId ? null : any), report };
  }

  async stats() {
    return (await this.inboundVideo()).stat;
  }

  close() {
    clearInterval(this.watchdog);
    clearTimeout(this.offerTimer);
    if (S.rcHost?.peerId === this.id) stopRcHost(false, `${userName(this.id) || 'İzleyen'} ayrıldı`);
    if (S.rcView?.peerId === this.id) releaseControl(false);
    try {
      this.pc.close();
    } catch {}
    detachRemoteAudio(this.id);
    dropUserScreens(this.id);
    for (const sh of S.myShares.values()) sh.watchers.delete(this.id);
  }
}

function syncPeers() {
  const want = new Set();
  if (S.channelId) {
    for (const u of S.users.values()) if (u.id !== S.myId && u.channelId === S.channelId) want.add(u.id);
  }
  for (const [id, p] of S.peers) {
    if (!want.has(id)) {
      p.close();
      S.peers.delete(id);
    }
  }
  for (const id of want) if (!S.peers.has(id)) S.peers.set(id, new Peer(id));
}

function closeAllPeers() {
  for (const p of S.peers.values()) p.close();
  S.peers.clear();
  S.watching.clear();
  for (const sh of S.myShares.values()) sh.watchers.clear();
}

// =====================================================================
//  Ekran paylaşımı — gönderen (aynı anda birden fazla yayın)
// =====================================================================
const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
const MAX_SHARES = 3;
function autoBitrate(res, fps) {
  const base = { 720: 2500, 1080: 4500, 1440: 8000, 2160: 14000, 0: 9000 }[res] || 4500;
  return Math.round(base * (fps >= 60 ? 1.6 : fps >= 30 ? 1 : 0.6));
}

let pickerSources = [];
let pickerType = 'screen';
let pickerSelected = null;
let pickerEdit = null; // düzenlenen yayının kimliği (yoksa yeni yayın)

const myScreenShares = () => [...S.myShares.values()].filter((x) => x.kind !== 'camera');
const myCamera = () => [...S.myShares.values()].find((x) => x.kind === 'camera') || null;

async function openPicker(arg) {
  if (!S.channelId) return;
  const editId = typeof arg === 'string' && S.myShares.has(arg) ? arg : null;
  pickerEdit = editId;
  if (!editId && !can('stream')) return toast('Ekran paylaşamazsın', 'Bu sunucuda ekran paylaşma yetkin yok.', 'err');
  if (!editId && myScreenShares().length >= MAX_SHARES) {
    toast(`En fazla ${MAX_SHARES} yayın açabilirsin`, 'Yeni bir tane eklemek için önce birini durdur.');
    return;
  }
  const perm = await kanki.ensurePermissions();
  if (S.platform === 'darwin' && perm.screen !== 'granted' && perm.screen !== 'not-determined') {
    toast('Ekran kaydı izni gerekli', 'Sistem Ayarları › Gizlilik ve Güvenlik › Ekran Kaydı bölümünden Kanki’ye izin verip uygulamayı yeniden başlat.', 'err', 9000);
    kanki.openScreenSettings();
  }
  const cur = editId ? S.myShares.get(editId) : null;
  const sh = cur
    ? { res: String(cur.opts.res), fps: String(cur.opts.fps), hint: cur.opts.hint, bitrate: String(cur.opts.bitrateSel ?? 0), audio: !!cur.stream.getAudioTracks().length }
    : settings.share;
  $('#opt-res').value = sh.res;
  $('#opt-fps').value = sh.fps;
  $('#opt-hint').value = sh.hint;
  $('#opt-bitrate').value = sh.bitrate;
  $('#opt-audio').checked = sh.audio;
  $('#picker-title').textContent = cur ? `Yayını düzenle: ${cur.label}` : 'Ekran Paylaş';
  $('#btn-go-live').textContent = cur ? 'Değişiklikleri uygula' : 'Yayına Başla';
  $('#picker-note').textContent =
    (S.platform === 'darwin' ? 'macOS 14.2+ gerekir. ' : '') +
    'Sistem sesi, pencere seçsen de bilgisayarın tüm sesini gönderir; Kanki’den duyduğun arkadaş sesleri hariç.';
  pickerSelected = cur ? cur.opts.sourceId || null : null;
  if (cur) {
    pickerType = cur.opts.surface === 'window' ? 'window' : 'screen';
    $$('#picker-tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.type === pickerType));
  }
  $('#btn-go-live').disabled = !cur;
  $('#sources').innerHTML = '<div class="muted">Kaynaklar yükleniyor…</div>';
  showModal('picker');
  pickerSources = await kanki.getSources();
  renderSources();
}

function renderSources() {
  const box = $('#sources');
  box.innerHTML = '';
  const list = pickerSources.filter((s) => s.type === pickerType);
  if (!list.length) box.append(h('div', { class: 'muted' }, 'Kaynak bulunamadı. macOS’ta ekran kaydı izni vermen gerekebilir.'));
  for (const s of list) {
    const thumb = h('div', { class: 'thumb' });
    if (s.thumbnail) thumb.style.backgroundImage = `url(${s.thumbnail})`;
    const isCurrent = pickerEdit && S.myShares.get(pickerEdit)?.opts.sourceId === s.id;
    if (isCurrent) thumb.append(h('span', { class: 'src-current' }, 'Şu an paylaşılan'));
    const card = h(
      'div',
      {
        class: `source ${pickerSelected === s.id ? 'selected' : ''} ${isCurrent ? 'current' : ''}`,
        onclick: () => {
          pickerSelected = s.id;
          $('#btn-go-live').disabled = false;
          renderSources();
        },
        ondblclick: () => {
          pickerSelected = s.id;
          goLive();
        },
      },
      thumb,
      h('div', { class: 'src-name' }, s.icon ? h('img', { src: s.icon }) : null, h('span', {}, s.name))
    );
    box.append(card);
  }
}

async function goLive() {
  if (!pickerSelected) return;
  const sourceId = pickerSelected;
  const src = pickerSources.find((x) => x.id === sourceId);
  const label = src ? (src.type === 'screen' ? src.name.replace(/^Entire screen$/i, 'Ekran') : src.name) : 'Ekran';
  const sh = (settings.share = {
    res: $('#opt-res').value,
    fps: $('#opt-fps').value,
    hint: $('#opt-hint').value,
    bitrate: $('#opt-bitrate').value,
    audio: $('#opt-audio').checked,
  });
  saveSettings();
  hideModal('picker');
  const editId = pickerEdit;
  pickerEdit = null;
  const fps = Number(sh.fps);
  const res = Number(sh.res);
  const bitrate = Number(sh.bitrate) || autoBitrate(res, fps);
  const surface = src?.type === 'window' ? 'window' : 'screen';
  if (editId) return applyShareEdit(editId, { sourceId, label, surface, fps, res, bitrate, bitrateSel: sh.bitrate, hint: sh.hint, audio: sh.audio });
  const video = videoConstraints(res, fps);
  // Aynı anda birden fazla yayında sistem sesi sadece bir kez gönderilsin (yoksa yankı olur)
  const audioTaken = [...S.myShares.values()].some((x) => x.stream.getAudioTracks().length);
  const wantAudio = sh.audio && !audioTaken;
  const { stream, audioMode } = await captureDisplay(sourceId, video, wantAudio);
  if (stream && wantAudio) {
    if (audioMode === 'plain') toast('Sistem sesi yankı korumasız', 'Bu bilgisayar Kanki’nin kendi sesini ayıramadı; izleyenler kendi seslerini geri duyabilir. Kulaklık kullanman yankıyı azaltır.', '', 8000);
    else if (!audioMode) toast('Sistem sesi paylaşılamadı', 'Yayın sadece görüntü ile başlatıldı.');
  }
  if (!stream) {
    toast('Ekran yakalanamadı', S.platform === 'darwin' ? 'Ekran Kaydı iznini kontrol et, ardından uygulamayı yeniden başlat.' : 'Tekrar dene.', 'err', 8000);
    if (S.platform === 'darwin') kanki.openScreenSettings();
    return;
  }
  if (sh.audio && audioTaken) toast('Sistem sesi diğer yayında', 'Ses yankı yapmasın diye sadece ilk yayına ekleniyor.');
  addShare(stream, { fps, res, bitrate, bitrateSel: sh.bitrate, hint: sh.hint, audioMode, sourceId, surface }, label);
}

function videoConstraints(res, fps) {
  const video = { frameRate: { ideal: fps, max: fps } };
  if (RES[res]) {
    video.width = { max: RES[res][0] };
    video.height = { max: RES[res][1] };
  }
  return video;
}
// Ekran/pencere yakala. audioMode: 'clean' = Kanki'nin kendi sesi hariç sistem sesi (yankı yok),
// 'plain' = tüm sistem sesi, false = sessiz. Önce yankısız, olmazsa düz, o da olmazsa sessiz dener.
async function captureDisplay(sourceId, video, wantAudio) {
  const tryCapture = async (mode) => {
    await kanki.selectSource(sourceId, mode);
    const audio = mode
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000, suppressLocalAudioPlayback: false }
      : false;
    return navigator.mediaDevices.getDisplayMedia({ video, audio, selfBrowserSurface: 'exclude', systemAudio: 'include' });
  };
  const modes = S.web ? [wantAudio ? 'plain' : false] : wantAudio ? ['clean', 'plain', false] : [false];
  for (const mode of modes) {
    try {
      const stream = await tryCapture(mode);
      return { stream, audioMode: mode && stream.getAudioTracks().length ? mode : false };
    } catch (e) {
      log('capture failed', mode, e?.name, e?.message);
    }
  }
  return { stream: null, audioMode: false };
}

// Sistem sesi ölçeri (yayın panelindeki "ses gidiyor mu" çubuğu)
function shareAnalyser(at) {
  if (!at) return null;
  at.contentHint = 'music'; // kodlayıcı konuşmaya göre değil müziğe göre ayarlansın
  at.applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }).catch(() => {});
  try {
    const ctx = getCtx();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(new MediaStream([at])).connect(an); // hoparlöre bağlanmaz, sadece ölçer
    return an;
  } catch {
    return null;
  }
}

// Yayını durdurmadan düzenle: kaynağı değiştir (izleyenler kesintisiz devam eder), kaliteyi ve sistem sesini ayarla
async function applyShareEdit(id, o) {
  const sh = S.myShares.get(id);
  if (!sh) return;
  const sourceChanged = !!o.sourceId && o.sourceId !== sh.opts.sourceId;
  const hadAudio = sh.stream.getAudioTracks().length > 0;
  const audioTakenElsewhere = [...S.myShares.values()].some((x) => x.id !== id && x.stream.getAudioTracks().length);
  const wantAudio = !!o.audio && !audioTakenElsewhere;
  const watchers = () => [...sh.watchers].map((pid) => S.peers.get(pid)).filter(Boolean);
  const changes = [];
  // 1) Yeni kaynak ya da sistem sesi açılacaksa yeniden yakala (eski yayın bu sırada sürer)
  if (sourceChanged || (wantAudio && !hadAudio)) {
    const cap = await captureDisplay(sourceChanged ? o.sourceId : sh.opts.sourceId, videoConstraints(o.res, o.fps), wantAudio && !hadAudio);
    if (!cap.stream) return toast('Yayın değiştirilemedi', 'Yeni kaynak yakalanamadı; yayın eskisi gibi devam ediyor.', 'err', 7000);
    const nv = cap.stream.getVideoTracks()[0];
    if (sourceChanged && nv) {
      const ov = sh.stream.getVideoTracks()[0];
      nv.addEventListener('ended', () => removeShare(id));
      for (const p of watchers()) await p.replaceShareTrack(id, 'video', nv);
      if (ov) {
        sh.stream.removeTrack(ov);
        ov.stop();
      }
      sh.stream.addTrack(nv); // aynı akış kimliği: izleyenler yayını aynı pencerede görmeye devam eder
      changes.push('kaynak');
    } else if (nv) nv.stop();
    const na = cap.stream.getAudioTracks()[0];
    if (na && wantAudio && !hadAudio) {
      sh.stream.addTrack(na);
      for (const p of watchers()) p.addShareTrack(id, na, sh.stream);
      sh.analyser = shareAnalyser(na);
      sh.opts.audioMode = cap.audioMode;
      changes.push('sistem sesi açıldı');
    } else if (na) na.stop();
    if (wantAudio && !hadAudio && !na) toast('Sistem sesi eklenemedi', 'Yayın görüntü ile devam ediyor.');
  }
  // 2) Sistem sesi kapatılacaksa
  if (!wantAudio && hadAudio) {
    const oa = sh.stream.getAudioTracks()[0];
    for (const p of watchers()) await p.replaceShareTrack(id, 'audio', null);
    sh.stream.removeTrack(oa);
    oa.stop();
    sh.analyser = null;
    sh.opts.audioMode = false;
    changes.push('sistem sesi kapatıldı');
  }
  // 3) Kalite: yeniden yakalamadan anında uygulanır
  const vt = sh.stream.getVideoTracks()[0];
  const qualityChanged = o.fps !== sh.opts.fps || o.res !== sh.opts.res || o.bitrate !== sh.opts.bitrate || o.hint !== sh.opts.hint;
  if (vt) {
    vt.contentHint = o.hint === 'detail' ? 'detail' : 'motion';
    await vt.applyConstraints(videoConstraints(o.res, o.fps)).catch((e) => log('constraints', e.message));
  }
  for (const p of S.peers.values()) await p.updateShareEncoding(id, o.bitrate, o.fps);
  if (qualityChanged) changes.push('kalite');
  Object.assign(sh.opts, { fps: o.fps, res: o.res, bitrate: o.bitrate, bitrateSel: o.bitrateSel, hint: o.hint });
  if (sourceChanged) {
    Object.assign(sh.opts, { sourceId: o.sourceId, surface: o.surface });
    sh.label = uniqueShareLabel(o.label, id);
    // İzleyenlere yeni kaynağın türünü bildir (pencerede uzaktan kontrol olmaz)
    for (const p of watchers()) p.signal({ kind: 'screen-meta', shareId: id, streamId: sh.stream.id, surface: o.surface });
    if (S.rcHost?.shareId === id) stopRcHost(true, 'Yayın kaynağı değiştiği için uzaktan kontrol durduruldu.');
    sendShareStatus();
  }
  renderSelfShare();
  toast('Yayın güncellendi', changes.length ? `Değişen: ${changes.join(', ')}. İzleyenler kesintisiz izlemeye devam ediyor.` : 'Değişiklik yok.');
}
function uniqueShareLabel(label, exceptId) {
  let name = String(label || 'Ekran').slice(0, 60);
  const taken = new Set([...S.myShares.values()].filter((x) => x.id !== exceptId).map((x) => x.label));
  for (let n = 2; taken.has(name); n++) name = `${String(label || 'Ekran').slice(0, 55)} ${n}`;
  return name;
}

let shareSeq = 0;
function sendShareStatus() {
  send({
    t: 'status',
    sharing: S.myShares.size > 0,
    shares: [...S.myShares.values()].map((x) => (x.kind === 'camera' ? { id: x.id, label: x.label, kind: 'camera' } : { id: x.id, label: x.label })),
  });
}

function addShare(stream, opts, label) {
  const id = 's' + Date.now().toString(36) + shareSeq++;
  const vt = stream.getVideoTracks()[0];
  if (vt) {
    vt.contentHint = opts.hint === 'detail' ? 'detail' : 'motion';
    vt.addEventListener('ended', () => removeShare(id));
  }
  // Aynı adı taşıyan yayınları ayırt et (ör. "Ekran", "Ekran 2")
  let name = String(label || 'Ekran').slice(0, 60);
  const taken = new Set([...S.myShares.values()].map((x) => x.label));
  for (let n = 2; taken.has(name); n++) name = `${String(label || 'Ekran').slice(0, 55)} ${n}`;
  const analyser = shareAnalyser(stream.getAudioTracks()[0]);
  S.myShares.set(id, { id, label: name, stream, opts, kind: opts.kind || 'screen', watchers: new Set(), analyser, lastSound: 0 });
  sendShareStatus();
  renderSelfShare();
  if (opts.kind === 'camera') renderStage();
  beep('unmute');
  return id;
}

function removeShare(id, notify = true) {
  const sh = S.myShares.get(id);
  if (!sh) return;
  if (S.rcHost?.shareId === id) stopRcHost(true, 'Yayın durdu');
  for (const p of S.peers.values()) p.stopShare(id, notify);
  sh.stream.getTracks().forEach((t) => t.stop());
  S.myShares.delete(id);
  if (notify) {
    sendShareStatus();
    beep('mute');
  }
  renderSelfShare();
  if (sh.kind === 'camera') renderStage();
}

const shareLevelBuf = new Float32Array(1024);
function updateShareMeters() {
  const now = performance.now();
  for (const sh of S.myShares.values()) {
    const el = document.querySelector(`.self-share-item[data-id="${sh.id}"]`);
    if (!el) continue;
    const label = el.querySelector('.ss-audio-label');
    const fill = el.querySelector('.ss-meter-fill');
    if (!sh.analyser) {
      el.querySelector('.ss-audio').classList.add('off');
      label.textContent = 'Sistem sesi yok — sadece görüntü gidiyor';
      fill.style.width = '0%';
      continue;
    }
    const db = rmsDb(sh.analyser, shareLevelBuf);
    if (db > -60) sh.lastSound = now;
    const pct = Math.max(0, Math.min(100, ((db + 70) / 60) * 100));
    fill.style.width = pct + '%';
    const silent = now - sh.lastSound > 3000;
    el.querySelector('.ss-audio').classList.toggle('silent', silent);
    label.textContent = silent ? 'Sistem sesi: sessiz (ses çalınca dolar)' : 'Sistem sesi gidiyor';
  }
}
setInterval(updateShareMeters, 100);

function stopAllShares(notify = true) {
  for (const id of [...S.myShares.keys()]) removeShare(id, notify);
}

function renderSelfShare() {
  const box = $('#self-share');
  const screens = myScreenShares();
  const on = screens.length > 0;
  box.classList.toggle('hidden', !on);
  const btn = $('#btn-share');
  btn.querySelector('span').textContent = 'Ekran'; // paylaşırken yeşil olur; üzerine gelince ne yapacağı yazar
  btn.classList.toggle('on', on);
  btn.disabled = !S.channelId || screens.length >= MAX_SHARES;
  btn.title = screens.length >= MAX_SHARES ? `En fazla ${MAX_SHARES} yayın` : on ? 'Bir ekran ya da pencere daha paylaş' : 'Ekranını ya da bir pencereyi paylaş';
  const cam = $('#btn-camera');
  if (cam) {
    cam.classList.toggle('on', !!myCamera());
    cam.disabled = !S.channelId;
    cam.title = myCamera() ? 'Kamerayı kapat' : 'Kamerayı aç';
  }
  renderCallBar();
  const existing = new Map([...box.children].map((el) => [el.dataset.id, el]));
  for (const [id, el] of existing) {
    if (!screens.some((x) => x.id === id)) {
      el.querySelector('video').srcObject = null;
      el.remove();
    }
  }
  for (const sh of screens) {
    let el = existing.get(sh.id);
    if (!el) {
      const v = h('video', { autoplay: true, playsinline: true });
      v.muted = true;
      v.srcObject = sh.stream;
      el = h(
        'div',
        { class: 'self-share-item', 'data-id': sh.id },
        v,
        h(
          'div',
          { class: 'self-share-info' },
          h('div', {}, h('span', { class: 'live' }, 'CANLI'), ' ', h('b', { class: 'ss-label' })),
          h('div', { class: 'muted ss-meta' }),
          h('div', { class: 'ss-audio' }, h('span', { class: 'ss-audio-label' }), h('span', { class: 'ss-meter' }, h('span', { class: 'ss-meter-fill' }))),
          h('div', { class: 'muted ss-viewers' })
        ),
        h('div', { class: 'ss-btns' }, h('button', { class: 'btn sm', title: 'Kaynağı (ekran/pencere), kaliteyi ve sistem sesini yayını durdurmadan değiştir', onclick: () => openPicker(sh.id) }, 'Düzenle'), h('button', { class: 'btn danger sm', onclick: () => removeShare(sh.id) }, 'Durdur'))
      );
      box.append(el);
    }
    const st = sh.stream.getVideoTracks()[0]?.getSettings() || {};
    el.querySelector('.ss-label').textContent = sh.label;
    const audioTxt = !sh.stream.getAudioTracks().length ? '' : sh.opts.audioMode === 'plain' ? ' · sistem sesi açık (yankı korumasız)' : ' · sistem sesi açık (Kanki sesleri hariç)';
    el.querySelector('.ss-meta').textContent = `${st.width || '?'}×${st.height || '?'} · ${sh.opts.fps} FPS · en fazla ${(sh.opts.bitrate / 1000).toFixed(1)} Mbps${audioTxt}`;
    const names = [...sh.watchers].map(userName).filter(Boolean);
    el.querySelector('.ss-viewers').textContent = names.length ? `İzleyenler (${names.length}): ${names.join(', ')}` : 'Henüz izleyen yok';
  }
}

// =====================================================================
//  Ekran paylaşımı — izleyen (birden fazla yayın, serbest yerleşim)
// =====================================================================
const shareKey = (uid, sid) => uid + '|' + sid;
const splitKey = (key) => {
  const i = key.indexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
};
function sharesOf(u) {
  if (!u) return [];
  if (Array.isArray(u.shares) && u.shares.length) return u.shares;
  return u.sharing ? [{ id: 'main', label: 'Ekran' }] : []; // eski sürüm / eski sunucu
}
// Kamera da bir "yayın" olarak gider ama sahnede kişinin kutusunda görünür
const isCam = (sh) => sh?.kind === 'camera';
const screenSharesOf = (u) => sharesOf(u).filter((x) => !isCam(x));
const camShareOf = (u) => sharesOf(u).find(isCam) || null;
function isCamKey(key) {
  const [uid, sid] = splitKey(key);
  return isCam(sharesOf(S.users.get(uid)).find((x) => x.id === sid));
}
function shareLabel(key) {
  const [uid, sid] = splitKey(key);
  const u = S.users.get(uid);
  const list = screenSharesOf(u);
  const sh = sharesOf(u).find((x) => x.id === sid);
  const extra = sh && (isCam(sh) || list.length > 1 || sh.label !== 'Ekran') ? ' · ' + sh.label : '';
  return (u?.name || '?') + extra;
}
const isWatchingUser = (uid) => [...S.watching].some((k) => k.startsWith(uid + '|') && !isCamKey(k));

function watchShare(userId, shareId, on = true) {
  const p = S.peers.get(userId);
  if (!p) return;
  const key = shareKey(userId, shareId);
  const sid = shareId === 'main' ? undefined : shareId;
  if (on) {
    if (S.watching.has(key)) return;
    S.watching.add(key);
    placeTile(key);
    p.signal({ kind: 'watch', shareId: sid, on: true });
  } else {
    S.watching.delete(key);
    p.signal({ kind: 'watch', shareId: sid, on: false });
    dropRemoteScreen(key);
  }
  renderStage();
}

function watchUser(userId, on = true) {
  for (const sh of screenSharesOf(S.users.get(userId))) watchShare(userId, sh.id, on);
}

function addRemoteScreenTrack(userId, shareId, track) {
  const key = shareKey(userId, shareId);
  let sc = S.remoteScreens.get(key);
  if (!sc) {
    sc = { key, userId, shareId, video: new MediaStream(), audioEl: null, volume: 1, muted: false, trackId: null };
    S.remoteScreens.set(key, sc);
  }
  if (!S.watching.has(key)) {
    S.watching.add(key);
    placeTile(key);
  }
  if (track.kind === 'video') {
    sc.video.getVideoTracks().forEach((t) => sc.video.removeTrack(t));
    sc.video.addTrack(track);
    sc.trackId = track.id;
    track.addEventListener('ended', () => renderStage());
    const pop = popouts.get(key);
    if (pop) pop.video.srcObject = sc.video;
  } else {
    if (!sc.audioEl) {
      sc.audioEl = new Audio();
      sc.audioEl.autoplay = true;
    }
    sc.audioEl.srcObject = new MediaStream([track]);
    sc.audioEl.volume = sc.volume;
    sc.audioEl.muted = S.deafened || !!sc.muted;
    if (settings.outputId && sc.audioEl.setSinkId) sc.audioEl.setSinkId(settings.outputId).catch(() => {});
    sc.audioEl.play().catch(() => {});
  }
  renderStage();
}

function dropRemoteScreen(key) {
  if (S.rcView?.key === key) releaseControl(true);
  const sc = S.remoteScreens.get(key);
  if (sc) {
    if (sc.audioEl) sc.audioEl.srcObject = null;
    S.remoteScreens.delete(key);
  }
  S.watching.delete(key);
  const pop = popouts.get(key);
  if (pop) {
    popouts.delete(key);
    try {
      pop.win.close();
    } catch {}
  }
  renderStage();
}

function dropUserScreens(userId) {
  const keys = new Set([...S.watching, ...S.remoteScreens.keys()].filter((k) => k.startsWith(userId + '|')));
  for (const k of keys) dropRemoteScreen(k);
}

// ---------- Sahne düzeni: taşınabilir, boyutlandırılabilir yayın pencereleri ----------
const tileEls = new Map(); // key -> element
const popouts = new Map(); // key -> { win, video }
let zTop = 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Birlikte izle başlatan kişi kendi videosunu da sahnede büyük kutuda görür (kendi yayınının anahtarı: benimId|yayınId)
const isOwnKey = (k) => !!S.myId && k.startsWith(S.myId + '|');
const ownWatchKeys = () =>
  typeof S.watch === 'undefined' || !S.myId ? [] : [...S.watch.keys()].filter((id) => S.myShares.has(id) && !S.watchHidden.has(id)).map((id) => shareKey(S.myId, id));
const visibleTileKeys = () => [...[...S.watching].filter((k) => !popouts.has(k) && !isCamKey(k)), ...ownWatchKeys()];

function placeTile(key) {
  if (!S.layoutCustom || S.layout.has(key)) return; // otomatik ızgarada yer render sırasında hesaplanır
  const n = visibleTileKeys().length;
  S.layout.set(key, { x: 4 + (n % 5) * 5, y: 4 + (n % 5) * 5, w: 48, h: 48 });
}

// Otomatik ızgara: yayınları 16:9 oranında, sahneye en büyük sığacak sütun sayısıyla dizer
function gridLayout() {
  const keys = visibleTileKeys();
  const n = keys.length;
  if (!n) return;
  const box = $('#tiles').getBoundingClientRect();
  const W = box.width || 1200;
  const H = box.height || 700;
  const GAP = 10; // px
  const AR = 16 / 9;
  const options = [];
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (W - GAP * (cols - 1)) / cols;
    const cellH = (H - GAP * (rows - 1)) / rows;
    const tw = Math.min(cellW, cellH * AR);
    options.push({ cols, rows, tw, th: tw / AR, area: tw * (tw / AR) });
  }
  // En büyük boyuta yakın (%85) seçenekler arasından kareye en yakın ızgarayı seç
  const maxArea = Math.max(...options.map((o) => o.area));
  const best = options
    .filter((o) => o.area >= maxArea * 0.85)
    .sort((a, b) => Math.abs(a.cols - a.rows) - Math.abs(b.cols - b.rows) || b.area - a.area)[0];
  const { cols, rows, tw, th } = best;
  const totalH = rows * th + GAP * (rows - 1);
  const top = (H - totalH) / 2;
  keys.forEach((k, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rowW = inRow * tw + GAP * (inRow - 1);
    const left = (W - rowW) / 2; // her satırı ortala
    const x = left + c * (tw + GAP);
    const y = top + r * (th + GAP);
    S.layout.set(k, { x: (x / W) * 100, y: (y / H) * 100, w: (tw / W) * 100, h: (th / H) * 100 });
  });
}

function svgEl(html) {
  const s = document.createElement('span');
  s.innerHTML = html;
  return s.firstElementChild;
}
const ICON_POP = '<svg viewBox="0 0 24 24"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>';
const ICON_FULL = '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/></svg>';
const ICON_MAX = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Z"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';

function bringFront(el, key) {
  el.style.zIndex = ++zTop;
  S.activeTile = key;
}

function buildTile(key) {
  const sc = S.remoteScreens.get(key);
  const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round((sc?.volume ?? 1) * 100), title: 'Yayın sesi' });
  vol.addEventListener('input', () => {
    const cur = S.remoteScreens.get(key);
    if (!cur) return;
    cur.volume = Number(vol.value) / 100;
    if (cur.audioEl) cur.audioEl.volume = cur.volume;
    if (cur.muted && cur.volume > 0) toggleScreenMute(key); // sesi açmak için sürgüyü oynatmak da yeter
  });
  const muteBtn = h('button', { class: 'tile-mute', title: 'Yayın sesini kapat' });
  muteBtn.innerHTML = ICON.speaker;
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleScreenMute(key);
  });
  const btn = (title, icon, fn) => {
    const b = h('button', { class: 'tile-btn', title });
    b.append(svgEl(icon));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  };
  const bar = h(
    'div',
    { class: 'tile-bar' },
    h('span', { class: 'live' }, 'CANLI'),
    h('span', { class: 'tile-name' }),
    h('span', { class: 'tile-stats' }),
    h('span', { class: 'spacer' }),
    h('div', { class: 'tile-vol' }, muteBtn, vol),
    h('span', { class: 'tile-noaudio', title: 'Bu yayında ses yok (yayıncı sistem sesini paylaşmıyor)' }, 'ses yok'),
    btn('Uzaktan kontrol iste', ICON_RC, () => requestControl(key)),
    btn('Ayrı pencerede aç (istediğin yere, başka monitöre taşıyabilirsin)', ICON_POP, () => popOut(key)),
    btn('Tam ekran (F)', ICON_FULL, () => tileFullscreen(key)),
    btn('Sahneyi kapla / eski boyutuna dön (çift tıkla)', ICON_MAX, () => toggleMax(key)),
    btn(isOwnKey(key) ? 'Sahneden gizle (video çalmaya devam eder)' : 'İzlemeyi bırak', ICON_X, () => {
      const [u, sid] = splitKey(key);
      if (isOwnKey(key)) {
        S.watchHidden.add(sid);
        renderStage();
        renderWatchHost();
        return;
      }
      watchShare(u, sid, false);
    })
  );
  const video = h('video', { autoplay: true, playsinline: true });
  video.muted = true; // ses ayrı <audio> ile çalınıyor
  const rcBadge = h(
    'div',
    { class: 'tile-rc-badge hidden' },
    h('span', { class: 'rc-dot' }),
    h('span', { class: 'rc-text' }),
    h('button', { class: 'rc-release', onclick: (e) => (e.stopPropagation(), releaseControl(true)) }, 'Bırak')
  );
  const el = h('div', { class: 'tile', 'data-key': key }, video, h('div', { class: 'tile-waiting' }, 'Bağlanıyor…'), rcBadge, bar, h('div', { class: 'tile-resize', title: 'Boyutlandır' }));
  attachRcInput(video, el, key);
  bar.addEventListener('pointerdown', (e) => startDrag(e, key, el, 'move'));
  el.querySelector('.tile-resize').addEventListener('pointerdown', (e) => startDrag(e, key, el, 'resize'));
  el.addEventListener('pointerdown', () => bringFront(el, key), true);
  bar.addEventListener('dblclick', (e) => !e.target.closest('button, input') && toggleMax(key));
  video.addEventListener('dblclick', () => !isControlling(key) && tileFullscreen(key));
  for (const ev of ['loadeddata', 'playing']) video.addEventListener(ev, () => el.classList.remove('waiting'));
  bringFront(el, key);
  decorateTile(el, key, video); // yayına işaret, birlikte izle kontrolleri
  return el;
}

// Yayının sesini tamamen kapat / geri aç (ses seviyesi korunur)
function toggleScreenMute(key) {
  const sc = S.remoteScreens.get(key);
  if (!sc) return;
  sc.muted = !sc.muted;
  if (sc.audioEl) sc.audioEl.muted = S.deafened || sc.muted;
  syncTileMute(key);
}
function syncTileMute(key) {
  const el = tileEls.get(key);
  const sc = S.remoteScreens.get(key);
  if (!el || !sc) return;
  const box = el.querySelector('.tile-vol');
  const btn = box.querySelector('.tile-mute');
  const muted = !!sc.muted;
  box.classList.toggle('muted', muted);
  const icon = muted ? ICON.speakerOff : ICON.speaker;
  if (btn.dataset.icon !== icon) {
    btn.innerHTML = icon;
    btn.dataset.icon = icon;
  }
  btn.title = muted ? 'Yayın sesini aç' : 'Yayın sesini kapat';
}

function startDrag(e, key, el, mode) {
  if (e.button !== 0 || e.target.closest('button, input')) return;
  e.preventDefault();
  const box = $('#tiles').getBoundingClientRect();
  if (el.classList.contains('maxed')) el.classList.remove('maxed');
  const L = { ...(S.layout.get(key) || { x: 0, y: 0, w: 50, h: 50 }) };
  const sx = e.clientX;
  const sy = e.clientY;
  el.classList.add('dragging');
  const move = (ev) => {
    const dx = ((ev.clientX - sx) / box.width) * 100;
    const dy = ((ev.clientY - sy) / box.height) * 100;
    const n =
      mode === 'move'
        ? { ...L, x: clamp(L.x + dx, 0, 100 - L.w), y: clamp(L.y + dy, 0, 100 - L.h) }
        : { ...L, w: clamp(L.w + dx, 18, 100 - L.x), h: clamp(L.h + dy, 16, 100 - L.y) };
    S.layout.set(key, n);
    if (!S.layoutCustom) {
      // İlk elle düzenlemede diğer pencerelerin mevcut yerleri sabitlensin
      S.layoutCustom = true;
    }
    Object.assign(el.style, { left: n.x + '%', top: n.y + '%', width: n.w + '%', height: n.h + '%' });
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    el.classList.remove('dragging');
    $('#btn-grid').classList.toggle('hidden', visibleTileKeys().length < 1 || !S.layoutCustom);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function toggleMax(key) {
  const el = tileEls.get(key);
  if (!el) return;
  el.classList.toggle('maxed');
  bringFront(el, key);
}

function tileFullscreen(key) {
  const el = tileEls.get(key);
  if (!el) return;
  if (document.fullscreenElement === el) document.exitFullscreen();
  else el.requestFullscreen().catch(() => {});
}

function renderTiles() {
  const box = $('#tiles');
  const keys = visibleTileKeys();
  if (!S.layoutCustom) gridLayout();
  for (const [k, el] of tileEls) {
    if (!keys.includes(k)) {
      el.querySelector('video').srcObject = null;
      el.remove();
      tileEls.delete(k);
    }
  }
  for (const k of keys) {
    let el = tileEls.get(k);
    if (!el) {
      if (!S.layout.has(k)) placeTile(k);
      el = buildTile(k);
      tileEls.set(k, el);
      box.append(el);
    }
    const L = S.layout.get(k) || { x: 5, y: 5, w: 50, h: 50 };
    Object.assign(el.style, { left: L.x + '%', top: L.y + '%', width: L.w + '%', height: L.h + '%' });
    el.querySelector('.tile-name').textContent = shareLabel(k);
    const sc = S.remoteScreens.get(k);
    const hasAudio = !!sc?.audioEl;
    el.querySelector('.tile-vol').classList.toggle('hidden', !hasAudio);
    syncTileMute(k);
    syncTileRc(k, el);
    el.querySelector('.tile-noaudio').classList.toggle('hidden', hasAudio || !sc);
    const v = el.querySelector('video');
    const own = isOwnKey(k);
    const want = own ? S.myShares.get(splitKey(k)[1])?.stream || null : sc?.video || null;
    if (v.srcObject !== want) v.srcObject = want;
    // İlk kare gelene kadar "Bağlanıyor…" göster
    el.classList.toggle('waiting', own ? v.readyState < 2 : !sc || !sc.video.getVideoTracks().length || v.readyState < 2);
    el.classList.toggle('own', own);
  }
  $('#btn-grid').classList.toggle('hidden', keys.length < 1 || !S.layoutCustom);
}

// ---------- Ayrı pencere (pop-out) ----------
function popOut(key) {
  const existing = popouts.get(key);
  if (existing) return existing.win.focus();
  const sc = S.remoteScreens.get(key);
  const win = window.open('', 'kanki-pop-' + key.replace(/[^a-z0-9]/gi, ''), 'width=1100,height=650');
  if (!win) return toast('Pencere açılamadı', 'Tekrar dene.', 'err');
  const d = win.document;
  d.title = shareLabel(key) + ' — Kanki';
  const style = d.createElement('style');
  style.textContent = `
    html,body{margin:0;height:100%;background:#000;overflow:hidden;color:#fff;font:13px -apple-system,"Segoe UI",sans-serif}
    video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
    .bar{position:fixed;top:0;left:0;right:0;display:flex;gap:10px;align-items:center;padding:10px 12px 18px;
      background:linear-gradient(rgba(0,0,0,.7),transparent);opacity:0;transition:opacity .15s}
    body:hover .bar{opacity:1}
    .live{background:#f0524f;font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:4px;letter-spacing:.5px}
    .nm{font-weight:600}.sp{flex:1}
    button{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:8px;height:30px;padding:0 12px;cursor:pointer;font:inherit}
    button:hover{background:rgba(255,255,255,.26)}`;
  d.head.append(style);
  d.body.innerHTML = '';
  const video = d.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = sc?.video || null;
  const bar = d.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = '<span class="live">CANLI</span><span class="nm"></span><span class="sp"></span>';
  bar.querySelector('.nm').textContent = shareLabel(key);
  const fs = d.createElement('button');
  fs.textContent = 'Tam ekran';
  fs.onclick = () => (d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen());
  const back = d.createElement('button');
  back.textContent = 'Uygulamaya geri al';
  back.onclick = () => win.close();
  bar.append(fs, back);
  d.body.append(video, bar);
  video.addEventListener('dblclick', () => fs.onclick());
  video.play().catch(() => {});
  popouts.set(key, { win, video });
  const onGone = () => {
    if (popouts.get(key)?.win === win) {
      popouts.delete(key);
      renderStage();
    }
  };
  win.addEventListener('pagehide', onGone);
  const poll = setInterval(() => {
    if (win.closed) {
      clearInterval(poll);
      onGone();
    }
  }, 800);
  renderStage();
}

function closeAllPopouts() {
  for (const { win } of popouts.values()) {
    try {
      win.close();
    } catch {}
  }
  popouts.clear();
}
window.addEventListener('beforeunload', closeAllPopouts);

// ---------- Yayın istatistikleri (her pencerede) ----------
const tileStats = new Map();
async function updateTileStats() {
  for (const [key, el] of tileEls) {
    const sc = S.remoteScreens.get(key);
    const p = sc && S.peers.get(sc.userId);
    if (!p || !sc.trackId) continue;
    const { stat, report } = await p.inboundVideo(sc.trackId);
    if (!stat) continue;
    const last = tileStats.get(key);
    let kbps = 0;
    if (last && last.id === stat.id) kbps = ((stat.bytesReceived - last.bytes) * 8) / (stat.timestamp - last.ts);
    tileStats.set(key, { id: stat.id, bytes: stat.bytesReceived, ts: stat.timestamp });
    const codec = stat.codecId ? report.get(stat.codecId)?.mimeType?.split('/')[1] : '';
    el.querySelector('.tile-stats').textContent = stat.frameWidth
      ? `${stat.frameWidth}×${stat.frameHeight} · ${Math.round(stat.framesPerSecond || 0)} FPS · ${(kbps / 1000).toFixed(1)} Mbps${codec ? ' · ' + codec : ''}`
      : '';
  }
}
setInterval(updateTileStats, 1000);

// =====================================================================
//  Sunucu bağlantısı
// =====================================================================
function send(msg) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(msg));
}

function normalizeAddress(addr) {
  addr = addr.trim().replace(/\/+$/, '');
  if (!addr) return null;
  if (/^wss?:\/\//i.test(addr)) return addr;
  if (/^https?:\/\//i.test(addr)) return addr.replace(/^http/i, 'ws');
  const m = addr.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  if (!m) return null;
  const hostname = m[1];
  const host = hostname.includes(':') ? `[${hostname}]` : hostname;
  if (m[2]) return `ws://${host}:${m[2]}`;
  // Port yazılmamış bir alan adı (ör. isim.ngrok-free.app) → güvenli bağlantı, 443
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
  const isLocal = hostname === 'localhost' || !hostname.includes('.') || /\.(local|lan|home)$/i.test(hostname);
  if (!isIp && !isLocal) return `wss://${host}`;
  return `ws://${host}:4455`;
}

function connect(url, password) {
  clearTimeout(S.reconnectTimer);
  S.url = url;
  S.password = password || '';
  S.intentionalClose = false;
  setConnText('Bağlanıyor…', '');
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return done({ ok: false, error: 'Geçersiz adres.' });
    }
    S.ws = ws;
    const timeout = setTimeout(() => {
      if (ws.readyState !== 1) {
        ws.close();
        done({ ok: false, error: 'Sunucuya ulaşılamadı (zaman aşımı).' });
      }
    }, 8000);
    ws.onopen = () => {
      clearTimeout(timeout);
      ws.send(
        JSON.stringify({
          t: 'hello',
          name: settings.nick,
          password: S.password,
          adminKey: S.adminKey || undefined,
          channelId: S.lastChannelId,
          muted: S.muted,
          deafened: S.deafened,
          presence: effectivePresence(),
          statusText: settings.statusText || '',
          nameStyle: settings.nameStyle || undefined,
          avatar: settings.avatar || undefined,
          clientKey: CLIENT_KEY,
        })
      );
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.t === 'welcome') done({ ok: true });
      if (m.t === 'error' && m.code === 'bad_password') {
        S.intentionalClose = true;
        done({ ok: false, error: m.message });
      }
      onMessage(m);
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      done({ ok: false, error: 'Sunucuya bağlanılamadı. Adresi ve portu kontrol et.' });
      if (S.ws !== ws) return;
      onDisconnected();
    };
  });
}

function onDisconnected() {
  stopRcHost(false);
  releaseControl(false);
  closeAllPeers();
  stopAllShares(false);
  closeAllPopouts();
  S.knownShares = new Set();
  S.lastChannelId = S.channelId || S.lastChannelId;
  S.channelId = null;
  S.myId = null;
  if (S.intentionalClose) return;
  setConnText('Bağlantı koptu', 'bad');
  $('#reconnect-banner').classList.remove('hidden');
  S.reconnectTimer = setTimeout(async () => {
    const r = await connect(S.url, S.password);
    if (r.ok) $('#reconnect-banner').classList.add('hidden');
  }, 2000);
}

function disconnect() {
  S.intentionalClose = true;
  clearTimeout(S.reconnectTimer);
  stopRcHost(true);
  releaseControl(true);
  stopAllShares();
  closeAllPeers();
  closeAllPopouts();
  S.knownShares = new Set();
  S.layout.clear();
  S.layoutCustom = false;
  S.ws?.close();
  S.ws = null;
  S.channelId = S.lastChannelId = null;
  S.isAdmin = false;
  applyAdminUi();
  hideModal('admin-panel');
  S.users.clear();
  S.chat.clear();
  $('#reconnect-banner').classList.add('hidden');
  $('#app').classList.add('hidden');
  $('#connect-screen').classList.remove('hidden');
  renderRecent();
}

function setConnText(text, cls) {
  $('#conn-text').textContent = text;
  $('#server-sub').className = `server-sub ${cls}`;
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      S.textLoaded.clear();
      S.myId = m.id;
      S.myName = m.name;
      S.serverName = m.serverName;
      S.iceServers = m.iceServers || [];
      setConnText('Bağlı', 'ok');
      $('#reconnect-banner').classList.add('hidden');
      $('#me-name').textContent = m.name;
      renderMeName();
      const av = avatar(m.name);
      av.dataset.av = m.id;
      $('#me-avatar').replaceWith(Object.assign(av, { id: 'me-avatar' }));
      S.isAdmin = !!m.admin;
      S.features = new Set(m.features || []);
      S.token = m.token || '';
      S.isMod = !!m.mod;
      onPermsWelcome(m); // roller, yetkiler, susturma / zaman aşımı, duyuru (admin.js)
      applyAdminUi();
      setTimeout(() => KankiSfx.BUILTIN.forEach((x) => KankiSfx.builtin(x.sid)), 1500); // ilk basışta gecikme olmasın
      break;
    case 'state': {
      queueMicrotask(renderMusic);
      queueMicrotask(() => {
        if (S.chatView && !isTextCh(S.chatView)) openChat(null);
        else if (S.chatView && !S.textLoaded.has(S.chatView)) send({ t: 'openText', channelId: S.chatView });
      });
      const prevUsers = S.users;
      S.afk = m.afk || null;
      S.serverName = m.serverName;
      S.channels = m.channels;
      S.users = new Map(m.users.map((u) => [u.id, u]));
      const me = S.users.get(S.myId);
      const prevChannel = S.channelId;
      S.channelId = me?.channelId || null;
      if (S.channelId) S.lastChannelId = S.channelId;
      if (prevChannel !== S.channelId) {
        closeAllPeers();
        stopAllShares(false); // sunucu kanal değişince yayınları zaten kapatır
        closeAllPopouts();
        S.layout.clear();
        S.layoutCustom = false;
        if (!S.chatView) {
          S.replyTo = null; // başka kanalın mesajına yanıt olmaz
          S.editing = null;
          S.unread = 0;
          renderChat();
        }
      } else if (prevChannel) {
        // Kanal içi giriş/çıkış sesleri
        for (const u of S.users.values())
          if (u.channelId === S.channelId && u.id !== S.myId && prevUsers.get(u.id)?.channelId !== S.channelId) beep('join');
        for (const u of prevUsers.values())
          if (u.channelId === S.channelId && u.id !== S.myId && S.users.get(u.id)?.channelId !== S.channelId) beep('leave');
      }
      syncPeers();
      // Biten yayınları kapat, yeni yayınları otomatik izle
      const liveKeys = new Set();
      for (const u of S.users.values())
        if (u.id !== S.myId && u.channelId === S.channelId) for (const sh of sharesOf(u)) liveKeys.add(shareKey(u.id, sh.id));
      for (const key of [...S.watching]) if (!liveKeys.has(key)) dropRemoteScreen(key);
      for (const key of liveKeys) {
        if (S.knownShares.has(key)) continue;
        const [uid, sid] = splitKey(key);
        if (isCamKey(key)) {
          // Kameralar Discord'daki gibi kendiliğinden görünür (kişinin kutusunda)
          setTimeout(() => sharesOf(S.users.get(uid)).some((x) => x.id === sid) && !S.watching.has(key) && watchShare(uid, sid, true), 300);
          continue;
        }
        if (settings.autoWatch) {
          setTimeout(() => {
            const still = sharesOf(S.users.get(uid)).some((x) => x.id === sid);
            if (still && !S.watching.has(key)) watchShare(uid, sid, true);
          }, 300);
        } else {
          toast(`${userName(uid)} ekran paylaşıyor`, 'İzlemek için adına ya da üstteki yayın düğmesine tıkla.');
        }
      }
      S.knownShares = liveKeys;
      onPermsState(m); // roller, duyuru (admin.js)
      for (const id of audio.remote.keys()) applyRemoteVolume(id);
      renderAll();
      onStateExtras(prevUsers, prevChannel);
      break;
    }
    case 'signal': {
      let p = S.peers.get(m.from);
      if (!p) {
        const u = S.users.get(m.from);
        if (u && u.channelId === S.channelId) {
          p = new Peer(m.from);
          S.peers.set(m.from, p);
        }
      }
      p?.handle(m.data);
      break;
    }
    case 'left':
      break;
    case 'history':
      S.chat.set(m.channelId, m.messages || []);
      if (isTextCh(m.channelId)) S.textLoaded.add(m.channelId);
      if (m.channelId === chatChannel()) renderChat();
      break;
    case 'chat': {
      if (!S.chat.has(m.channelId)) S.chat.set(m.channelId, []);
      S.chat.get(m.channelId).push(m);
      const viewing = m.channelId === chatChannel();
      const inText = isTextCh(m.channelId);
      if (viewing) appendChat(m);
      if (!m.system && m.from !== S.myId) {
        if (viewing) {
          S.typing.delete(m.from);
          renderTyping();
        }
        const mention = mentionsMe(m.text) || (m.replyTo && m.replyTo.name === S.myName);
        // Açık olmayan yazı kanalında okunmamış sayısı (bahsedilince kırmızı)
        if (inText && !viewing) {
          const un = S.textUnread.get(m.channelId) || { n: 0, mention: false };
          un.n++;
          un.mention = un.mention || mention;
          S.textUnread.set(m.channelId, un);
          renderTextChannels();
        }
        if (settings.chatHidden && viewing) {
          S.unread++;
          renderChatToggle();
        }
        // Başka bir yazı kanalındaki sıradan mesaj ses çıkarmaz, sadece sayı artar
        if (effectivePresence() !== 'dnd' && (viewing || !inText || mention)) {
          beep(mention ? 'mention' : 'msg');
          if (settings.notify && !document.hasFocus()) kanki.notify(mention ? `${m.name} senden bahsetti` : m.name, m.text || '📷 Resim gönderdi');
          if (mention) kanki.flash();
        }
      }
      break;
    }
    case 'chatUpdate': {
      // Tepki, düzenleme
      const list = S.chat.get(m.channelId) || [];
      const i = list.findIndex((x) => x.id === m.msg.id);
      if (i >= 0) list[i] = { ...m.msg, t: 'chat' };
      if (m.channelId === chatChannel()) refreshChat();
      break;
    }
    case 'chatDelete': {
      const list = S.chat.get(m.channelId) || [];
      const i = list.findIndex((x) => x.id === m.id);
      if (i >= 0) list.splice(i, 1);
      if (S.replyTo?.id === m.id) {
        S.replyTo = null;
        renderComposerExtras();
      }
      if (m.channelId === chatChannel()) refreshChat();
      break;
    }
    case 'botState':
      S.botState = m.state || null;
      renderMusic();
      break;
    case 'botReply':
      toast('🎵 Müzik Botu', m.text, '', 6000);
      break;
    case 'avatars':
      S.avatars = new Map(Object.entries(m.avatars || {}));
      refreshAvatars();
      break;
    case 'avatar':
      if (m.data) S.avatars.set(m.id, m.data);
      else S.avatars.delete(m.id);
      refreshAvatars();
      break;
    case 'typing':
      if (m.channelId === chatChannel() && m.from !== S.myId) {
        S.typing.set(m.from, Date.now());
        renderTyping();
      }
      break;
    case 'sfx':
      onSfx(m);
      break;
    case 'poke':
      if (effectivePresence() === 'dnd') {
        // Rahatsız Etmeyin: titreşim ve ses yok, sadece sessiz bir not
        toast(`${m.name} seni dürttü`, (m.text ? m.text + ' · ' : '') + 'Rahatsız Etmeyin açık olduğu için sessiz.', 'poke', 6000);
        logEvent('👉', `${m.name} seni dürttü${m.text ? ': ' + m.text : ''}`);
        break;
      }
      nudge(true);
      logEvent('👉', `${m.name} seni dürttü${m.text ? ': ' + m.text : ''}`, { hot: true });
      toast(`${m.name} seni dürttü!`, m.text || '', 'poke', 8000);
      kanki.flash();
      kanki.notify(`${m.name} seni dürttü`, m.text || '');
      break;
    case 'kicked': {
      const msg = `${m.by} seni sunucudan ${m.banned ? 'yasakladı' : 'attı'}${m.reason ? ': ' + m.reason : '.'}`;
      disconnect();
      setConnectError(msg);
      break;
    }
    case 'moved':
      if (m.channelId === null) toast('Sesten çıkarıldın', `${m.by} seni ses kanalından çıkardı. Bir kanala tıklayarak geri dönebilirsin.`, 'err');
      else toast('Kanalın değiştirildi', `${m.by} seni ${chName(m.channelId) ? chName(m.channelId) + ' kanalına' : 'başka bir kanala'} taşıdı.`);
      break;
    case 'forceMute':
      if (m.server) {
        // Sunucu susturması / zaman aşımı / AFK kanalı: kilit admin.js'de, bildirimi modState gösterir
        if (m.afk) toast('💤 AFK kanalındasın', 'Burada mikrofon açılamaz. Başka bir kanala geçince açabilirsin.', '', 4500);
        if (!S.muted) toggleMute(true);
        renderControls();
        break;
      }
      if (m.until) S.voteMutedUntil = m.until;
      if (!S.muted) toggleMute(true);
      toast('Mikrofonun kapatıldı', `${m.by} mikrofonunu kapattı. İstediğinde tekrar açabilirsin.`);
      break;
    case 'adminInfo':
      renderAdminInfo(m);
      break;
    case 'adminNotice':
      toast(m.message);
      break;
    case 'error':
      if (m.code === 'banned') {
        disconnect();
        setConnectError(m.message);
        break;
      }
      if (onPermError(m)) break; // yetki, zaman aşımı, salt okunur, yavaş mod (admin.js)
      toast(m.code === 'info' || m.code === 'channel_full' ? m.message : 'Hata', m.code === 'info' || m.code === 'channel_full' ? '' : m.message, 'err');
      break;
    case 'pong':
      updatePing(Math.round(performance.now() - m.ts));
      break;
    default:
      onExtraMessage(m);
  }
}

setInterval(() => send({ t: 'ping', ts: performance.now() }), 3000);

// Gecikme: ses panelindeki sinyal simgesinin rengi ve üzerine gelince çıkan bilgi
function updatePing(ms) {
  const el = $('#voice-ping');
  if (!el) return;
  const q = ms < 80 ? 'good' : ms < 200 ? 'fair' : 'bad';
  el.className = `voice-ping ${q}`;
  const label = { good: 'İyi', fair: 'Orta', bad: 'Zayıf' }[q];
  el.dataset.tip = `Gecikme: ${ms} ms (${label})\nSunucu: ${S.serverName || '—'}`;
  if (tipTarget === el) tipEl.textContent = el.dataset.tip;
}

// =====================================================================
//  Arayüz
// =====================================================================
function renderAll() {
  $('#server-name').textContent = S.serverName;
  $('#server-badge').textContent = (S.serverName || '?').charAt(0).toUpperCase();
  renderTree();
  renderStage();
  renderControls();
  renderSelfShare();
}

function childrenOf(parent) {
  return S.channels.filter((c) => c.type !== 'text' && (c.parent || null) === parent).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderTree() {
  renderTextChannels();
  const tree = $('#tree');
  const scroll = tree.scrollTop;
  tree.innerHTML = '';
  const walk = (parent, depth) => {
    for (const ch of childrenOf(parent)) {
      // Başlık kanalı: kimse giremez; altındaki kanalları gruplar, tıklayınca açılır/kapanır
      if (ch.header) {
        const closed = !!settings.closedHeaders?.[ch.id];
        const hrow = h(
          'div',
          {
            class: `ch ch-header ${closed ? 'closed' : ''}`,
            title: closed ? 'Başlık — açmak için tıkla' : 'Başlık — içine girilmez; kapatmak için tıkla',
            onclick: () => {
              settings.closedHeaders = { ...(settings.closedHeaders || {}), [ch.id]: !closed };
              if (closed) delete settings.closedHeaders[ch.id];
              saveSettings();
              renderTree();
            },
            oncontextmenu: (e) => channelMenu(e, ch),
          },
          h('span', { class: 'ch-caret' }, '▾'),
          h('span', { class: 'ch-name' }, ch.name)
        );
        hrow.style.paddingLeft = 8 + depth * 16 + 'px';
        tree.append(hrow);
        // Kapalı başlıkta sadece benim olduğum kanal görünür (Discord gibi)
        if (!closed) walk(ch.id, depth + 1);
        else {
          const mine = (function find(p) {
            for (const c of childrenOf(p)) if (c.id === S.channelId || find(c.id)) return true;
            return false;
          })(ch.id);
          if (mine) walk(ch.id, depth + 1);
        }
        continue;
      }
      const members = [...S.users.values()].filter((u) => u.channelId === ch.id).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const isAfk = S.afk?.channelId === ch.id;
      const row = h(
        'div',
        {
          class: `ch ${ch.id === S.channelId ? 'current' : ''}`,
          title: ch.id === S.channelId ? 'Bu kanaldasın — sohbetini açmak için tıkla' : 'Katılmak için tıkla',
          onclick: () => (ch.id === S.channelId ? openChat(null) : joinChannel(ch.id)),
          oncontextmenu: (e) => channelMenu(e, ch),
          ondragover: (e) => {
            e.preventDefault();
            row.classList.add('drop');
          },
          ondragleave: () => row.classList.remove('drop'),
          ondrop: (e) => {
            row.classList.remove('drop');
            const dragged = e.dataTransfer.getData('text/kanki-user');
            if (dragged === S.myId) joinChannel(ch.id);
            else if (dragged && can('moveMembers')) send({ t: 'move', to: dragged, channelId: ch.id });
          },
        },
        h('span', { class: 'ch-ico' }),
        h('span', { class: 'ch-name' }, ch.name),
        isAfk ? h('span', { class: 'ch-afk', title: 'AFK kanalı: burada mikrofon açılamaz' }, '💤') : null,
        ch.locked ? h('span', { class: 'ch-lock', title: 'Şifreli kanal' }, '🔒') : null,
        members.length || ch.limit ? h('span', { class: 'ch-count', title: ch.limit ? `En fazla ${ch.limit} kişi` : '' }, ch.limit ? `${members.length}/${ch.limit}` : String(members.length)) : null
      );
      row.querySelector('.ch-ico').outerHTML = ICON.channel;
      row.style.paddingLeft = 8 + depth * 16 + 'px';
      tree.append(row);
      if (members.length) {
        const ul = h('div', { class: 'users' });
        for (const u of members) ul.append(userRow(u, depth));
        tree.append(ul);
      }
      walk(ch.id, depth + 1);
    }
  };
  walk(null, 0);
  tree.scrollTop = scroll;
}

function userRow(u, depth) {
  const av = u.bot ? botAvatar() : withDot(avatar(u.name), u);
  av.dataset.av = u.id;
  if (u.id === S.myId ? S.transmitting : audio.remote.get(u.id)?.speaking) av.classList.add('speaking');
  const badges = h('span', { class: 'badges' });
  const nShares = screenSharesOf(u).length;
  if (camShareOf(u)) badges.insertAdjacentHTML('beforeend', `<span class="cam-badge" title="Kamerası açık">${ICON.camera}</span>`);
  if (nShares)
    badges.append(
      h(
        'span',
        {
          class: 'live-badge',
          title: nShares > 1 ? `${nShares} ekran paylaşıyor — izlemek için tıkla` : 'Ekran paylaşıyor — izlemek için tıkla',
          onclick: () => u.id !== S.myId && u.channelId === S.channelId && watchUser(u.id, !isWatchingUser(u.id)),
        },
        nShares > 1 ? `CANLI ${nShares}` : 'CANLI'
      )
    );
  const sfb = sfxNow(u.id);
  if (sfb) badges.prepend(h('span', { class: 'sfx-badge', title: `${sfb.it.name} çaldı`, style: `animation-delay:-${sfb.age}ms` }, sfb.it.emoji));
  if (u.bot) badges.append(h('span', { class: 'bot-tag', title: 'Müzik botu — !yardım' }, 'BOT'));
  const sb = staffBadge(u); // sahip tacı ya da en üst rolün renginde kalkan (admin.js)
  if (sb) badges.append(sb);
  activityBadge(u, badges);
  modBadges(u, badges); // sunucu susturması, sağırlaştırma, zaman aşımı (admin.js)
  if (u.muted && !u.serverMuted) badges.insertAdjacentHTML('beforeend', ICON.micOff);
  if (u.deafened && !u.serverDeafened) badges.insertAdjacentHTML('beforeend', ICON.headOff);
  if (settings.localMutes[u.name] && u.id !== S.myId) badges.insertAdjacentHTML('beforeend', ICON.speaker);
  const p = S.peers.get(u.id);
  const pcState = p?.pc.connectionState;
  const PC_TR = { new: 'bağlanıyor', connecting: 'bağlanıyor', disconnected: 'bağlantı koptu', failed: 'bağlanamadı', closed: 'kapandı' };
  const title = u.id === S.myId ? 'Sen' : pcState && pcState !== 'connected' ? `${u.name} · ses ${PC_TR[pcState] || pcState}` : u.name;
  const row = h(
    'div',
    {
      class: `user ${u.id === S.myId ? 'me' : ''}`,
      title,
      draggable: u.id === S.myId || can('moveMembers') ? 'true' : null,
      ondragstart: (e) => e.dataTransfer.setData('text/kanki-user', u.id),
      oncontextmenu: (e) => userMenu(e, u),
      onclick: (e) => !e.target.closest('.live-badge') && openProfile(u.id, row),
      ondblclick: () => screenSharesOf(u).length && u.id !== S.myId && u.channelId === S.channelId && watchUser(u.id, true),
    },
    av,
    roleTint(applyNameStyle(h('span', { class: 'uname' }, u.name), styleOfUser(u), u.name), u),
    badges
  );
  row.style.paddingLeft = 30 + depth * 16 + 'px';
  row.style.setProperty('--tree-x', 18 + depth * 16 + 'px'); // ağaç çizgisi kanal simgesinin altından başlar
  if (pcState && !['connected', 'new'].includes(pcState)) row.style.opacity = '.55';
  return row;
}

function renderStage() {
  const ch = S.channels.find((c) => c.id === S.channelId);
  $('#stage-title').textContent = ch ? ch.name : '';
  $('#voice-where').textContent = ch ? `${ch.name} / ${S.serverName}` : S.serverName;
  const members = [...S.users.values()].filter((u) => u.channelId === S.channelId);
  $('#stage-sub').textContent = `${members.length} kişi`;
  renderChatHead();
  $('#member-count').textContent = String(S.users.size || '');
  renderMembers();
  updateVoiceState();

  // Yayın şeridi: kanaldaki her yayın için bir düğme
  const strip = $('#share-strip');
  strip.innerHTML = '';
  let pills = 0;
  for (const u of members) {
    if (u.id === S.myId) continue;
    for (const sh of screenSharesOf(u)) {
      const key = shareKey(u.id, sh.id);
      const on = S.watching.has(key);
      const popped = popouts.has(key);
      const pill = h(
        'div',
        {
          class: `share-pill ${on ? 'active' : ''}`,
          title: on ? (popped ? 'Ayrı pencerede — öne getirmek için tıkla' : 'Öne getir') : 'İzlemeye başla',
          onclick: () => {
            if (!on) return watchShare(u.id, sh.id, true);
            if (popped) return popouts.get(key).win.focus();
            const el = tileEls.get(key);
            if (el) {
              bringFront(el, key);
              el.classList.remove('pulse');
              void el.offsetWidth;
              el.classList.add('pulse');
            }
          },
        },
        avatar(u.name),
        h('span', { class: 'dotlive' }),
        shareLabel(key) + (on ? (popped ? ' · ayrı pencerede' : '') : ' — İzle')
      );
      if (on) {
        const x = h('span', { class: 'pill-x', title: 'İzlemeyi bırak' }, '×');
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          watchShare(u.id, sh.id, false);
        });
        pill.append(x);
      }
      strip.append(pill);
      pills++;
    }
  }
  strip.classList.toggle('hidden', pills === 0);

  // İzlenen yayınlar sahnede serbest yerleşimli pencereler olarak durur; katılımcılar altta şerit olur
  const showTiles = visibleTileKeys().length > 0;
  $('#tiles').classList.toggle('hidden', !showTiles);
  $('#stage-body').classList.toggle('with-strip', showTiles);
  $('#participants').classList.toggle('strip', showTiles);
  renderParticipants(members, showTiles);
  renderTiles();
  renderSelfShare();
  renderChatToggle();
}

// Kamera görüntüleri: kutular her çizimde yeniden kurulsa da video öğesi korunur (titreme olmasın)
const camVideos = new Map(); // userId -> <video>
function camStreamFor(uid) {
  if (uid === S.myId) return myCamera()?.stream || null;
  const cs = camShareOf(S.users.get(uid));
  if (!cs) return null;
  const sc = S.remoteScreens.get(shareKey(uid, cs.id));
  return sc && sc.video.getVideoTracks().length ? sc.video : null;
}
function camVideoEl(uid, stream) {
  let v = camVideos.get(uid);
  if (!v) {
    v = h('video', { autoplay: true, playsinline: true, class: 'cam-video' });
    v.muted = true;
    camVideos.set(uid, v);
  }
  if (v.srcObject !== stream) v.srcObject = stream;
  v.classList.toggle('mirror', uid === S.myId); // kendi görüntün ayna gibi
  return v;
}

function renderParticipants(members, strip = false) {
  const box = $('#participants');
  box.innerHTML = '';
  const usedCams = new Set();
  if (members.length <= 1 && !strip && !myCamera()) {
    box.append(
      h(
        'div',
        { class: 'empty-stage' },
        h('div', { class: 'empty-icon' }, svgEl(ICON.channel)),
        h('div', {}, 'Bu kanalda şimdilik yalnızsın.'),
        h('div', { class: 'muted' }, 'Arkadaşların katıldığında burada görünecek. Davet adresini sunucu adına tıklayarak kopyalayabilirsin.')
      )
    );
    return cleanupCams(usedCams);
  }
  if (strip) {
    box.style.setProperty('--tile-w', '168px');
  } else {
    // 16:9 kutuları sahneye sığacak en büyük boyutta diz
    const r = box.getBoundingClientRect();
    const W = r.width || 800;
    const H = r.height || 500;
    const n = members.length;
    const opts = [];
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const tw = Math.min((W - 12 * (cols - 1)) / cols, ((H - 12 * (rows - 1)) / rows) * (16 / 9));
      opts.push({ cols, rows, tw });
    }
    const maxW = Math.max(...opts.map((o) => o.tw));
    const pick = opts.filter((o) => o.tw >= maxW * 0.9).sort((a, b) => Math.abs(a.cols - a.rows) - Math.abs(b.cols - b.rows) || b.tw - a.tw)[0];
    box.style.setProperty('--tile-w', Math.floor(Math.max(180, Math.min(pick.tw - 2, 640))) + 'px');
  }
  for (const u of members.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
    const av = u.bot ? botAvatar() : avatar(u.name); // büyük kutularda durum noktası yok (Discord'daki gibi)
    av.dataset.av = u.id;
    const isOther = u.id !== S.myId;
    const nS = screenSharesOf(u).length;
    const label = h('div', { class: 'p-label' });
    if (u.muted) label.insertAdjacentHTML('beforeend', ICON.micOff);
    if (u.deafened) label.insertAdjacentHTML('beforeend', ICON.headOff);
    label.append(h('span', {}, u.name + (isOther ? '' : ' (sen)')));
    const camStream = camStreamFor(u.id);
    const card = h(
      'div',
      {
        class: `p-card ${nS && isOther ? 'sharing' : ''} ${camStream ? 'has-cam' : ''}`,
        'data-uid': u.id,
        onclick: (e) => {
          if (e.target.closest('.watch-btn')) return watchUser(u.id, true);
          openProfile(u.id, card);
        },
        oncontextmenu: (e) => userMenu(e, u),
      },
      camStream ? camVideoEl(u.id, camStream) : null,
      nS ? h('span', { class: 'live' }, nS > 1 ? `CANLI ${nS}` : 'CANLI') : null,
      av,
      nS && isOther && !strip ? h('button', { class: 'btn share watch-btn' }, nS > 1 ? 'Yayınları izle' : 'Yayını izle') : null,
      label
    );
    if (camStream) usedCams.add(u.id);
    card.style.setProperty('--tint', colorFor(u.name));
    const sf = sfxNow(u.id);
    if (sf) card.append(sfxFloatEl(sf));
    box.append(card);
  }
  cleanupCams(usedCams);
  renderStageBotCard();
}
function cleanupCams(used) {
  for (const [uid, v] of camVideos) {
    if (used.has(uid)) continue;
    v.srcObject = null;
    camVideos.delete(uid);
  }
}

function renderControls() {
  const mic = $('#btn-mic');
  mic.innerHTML = S.muted ? ICON.micOff : ICON.mic;
  mic.classList.toggle('off', S.muted);
  const deaf = $('#btn-deafen');
  deaf.innerHTML = S.deafened ? ICON.headOff : ICON.head;
  deaf.classList.toggle('off', S.deafened);
  $('#btn-settings').innerHTML = ICON.gear;
  $('#btn-disconnect').innerHTML = ICON.power;
  const modeTxt = { vad: 'Sesle etkinleştirme', ptt: `Bas-konuş${settings.pttLabel ? ' (' + settings.pttLabel + ')' : ''}`, open: 'Sürekli açık' }[settings.mode];
  const pres = effectivePresence();
  renderMeName();
  $('#me-status').textContent = S.deafened ? 'Ses kapalı' : S.muted ? 'Mikrofon kapalı' : settings.statusText || (pres !== 'online' ? PRESENCE[pres].label : modeTxt);
  const me = $('#me-avatar');
  if (me) {
    let dot = me.querySelector('.status-dot');
    if (!dot) me.append((dot = h('span', { class: 'status-dot' })));
    dot.className = `status-dot ${pres}`;
  }
  renderCallBar();
}

// ---------- Sohbet ----------
let lastMsgFrom = null;
let lastMsgTs = 0;
let lastMsgDay = '';
function renderChat() {
  const box = $('#chat-log');
  box.innerHTML = '';
  lastMsgFrom = null;
  lastMsgTs = 0;
  lastMsgDay = '';
  for (const m of S.chat.get(chatChannel()) || []) appendChat(m, false);
  box.scrollTop = box.scrollHeight;
  $('#new-msgs').classList.add('hidden');
  if (S.editing) focusEditBox();
  renderComposerExtras();
  renderChatExtras();
}
// Tepki/düzenleme/silme sonrası: sohbeti yeniden çiz, okunan yer kaymasın
function refreshChat() {
  const box = $('#chat-log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const top = box.scrollTop;
  const newVisible = !$('#new-msgs').classList.contains('hidden');
  renderChat();
  if (!atBottom) {
    box.scrollTop = top;
    $('#new-msgs').classList.toggle('hidden', !newVisible);
  }
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Bugün';
  if (d.toDateString() === y.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const trLower = (x) => String(x).toLocaleLowerCase('tr');
function mentionsMe(text) {
  if (!S.myName) return false;
  const t = trLower(text);
  return t.includes('@' + trLower(S.myName)) || /(^|\s)@(herkes|everyone)\b/.test(t);
}

// Basit biçimlendirme: ```kod```, `kod`, **kalın**, *italik*, ~~üstü çizili~~, bağlantılar ve @bahsetmeler
function formatText(text) {
  const blocks = [];
  let t = esc(text);
  t = t.replace(/```([\s\S]+?)```/g, (_, c) => `\u0000${blocks.push(`<pre class="code-block">${c.replace(/^\n/, '')}</pre>`) - 1}\u0000`);
  t = t.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${blocks.push(`<code>${c}</code>`) - 1}\u0000`);
  t = t.replace(/(https?:\/\/[^\s<]+)/g, (u) => `\u0000${blocks.push(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`) - 1}\u0000`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  t = t.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  const names = [...S.users.values()].map((u) => u.name).sort((a, b) => b.length - a.length);
  t = t.replace(/@(herkes|everyone)\b/gi, '<span class="mention-tag">@$1</span>');
  for (const n of names) {
    const en = esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp('@' + en + '(?![\\wçğıöşüÇĞİÖŞÜ])', 'gi'), (m) => `<span class="mention-tag">${m}</span>`);
  }
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

function appendChat(m, scroll = true) {
  const box = $('#chat-log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const time = new Date(m.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const day = new Date(m.ts).toDateString();
  if (day !== lastMsgDay) {
    box.append(h('div', { class: 'day-sep' }, h('span', {}, dayLabel(m.ts))));
    lastMsgDay = day;
    lastMsgFrom = null;
  }
  let el;
  if (m.system) {
    el = h('div', { class: 'msg sys' }, h('span', { class: 'sys-arrow' }, '→'), `${m.text}`, h('span', { class: 'msg-time' }, time));
    lastMsgFrom = null;
  } else if (!m.replyTo && lastMsgFrom === m.name && m.ts - lastMsgTs < 7 * 60 * 1000) {
    el = h('div', { class: 'msg cont', title: time }, h('span', { class: 'cont-time' }, time), msgContent(m));
  } else {
    const av = S.users.get(m.from)?.bot || m.name === 'Müzik Botu' ? botAvatar() : avatar(m.name);
    av.classList.add('clickable');
    av.addEventListener('click', () => openProfileByName(m, av));
    el = h(
      'div',
      { class: 'msg' },
      av,
      h('div', { class: 'msg-body' }, h('div', { class: 'msg-head' }, h('span', { class: 'msg-name' }, m.name), h('span', { class: 'msg-time' }, time)), msgContent(m))
    );
    const nm = el.querySelector('.msg-name');
    const nst = nameStyleFor(m.name, m.ns);
    if (nst) applyNameStyle(nm, nst, m.name);
    else nm.style.color = roleColorByName(m.name) || colorFor(m.name); // rol rengi
    nm.addEventListener('click', () => openProfileByName(m, nm));
    if (m.replyTo) {
      el.classList.add('has-reply');
      el.prepend(replyQuote(m.replyTo));
    }
  }
  if (!m.system) {
    lastMsgFrom = m.name;
    lastMsgTs = m.ts;
    el.dataset.id = m.id;
    el.append(msgTools(m));
    el.addEventListener('contextmenu', (e) => !e.target.closest('textarea, a') && msgMenu(e, m));
    const toMe = m.replyTo && m.replyTo.name === S.myName && !isMineMsg(m);
    if ((m.from !== S.myId && mentionsMe(m.text)) || toMe) el.classList.add('mentioned');
    if (S.editing === m.id) el.classList.add('editing');
  }
  box.append(el);
  if (!scroll) return;
  if (atBottom || m.from === S.myId) box.scrollTop = box.scrollHeight;
  else $('#new-msgs').classList.remove('hidden');
}

// ---------- Kanallar ----------
function joinChannel(id) {
  if (id === S.channelId) return;
  send({ t: 'join', channelId: id });
}

function channelMenu(e, ch) {
  e.preventDefault();
  const items = channelMenuItems(ch); // yetkiye göre (admin.js)
  if (items.length) showCtx(e, items);
}

function promptChannel(parent = null) {
  inlinePrompt(parent ? 'Alt kanal adı' : 'Kanal adı', '', (name) => send({ t: 'createChannel', name, parent }));
}
function renameChannel(ch) {
  inlinePrompt('Yeni kanal adı', ch.name, (name) => send({ t: 'renameChannel', channelId: ch.id, name }));
}

function userMenu(e, u) {
  e.preventDefault();
  // Moderasyon: yetkiye ve rol hiyerarşisine göre (admin.js)
  const mod = modMenuItems(subjectOf(u));
  if (u.id === S.myId) {
    return showCtx(e, [
      { label: S.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat', run: toggleMute },
      { label: S.deafened ? 'Sesi aç' : 'Sesi kapat', run: toggleDeafen },
      ...(mod.length ? ['-', ...mod] : []),
    ]);
  }
  const key = volKey(u.id);
  const vol = settings.userVolumes[key] ?? 100;
  const sameChannel = u.channelId === S.channelId;
  showCtx(e, [
    { html: `<div class="ctx-label">${esc(u.name)} — ses seviyesi</div>` },
    {
      slider: { value: vol, max: 100 },
      onInput: (v) => {
        settings.userVolumes[key] = v;
        saveSettings();
        applyRemoteVolume(u.id);
      },
    },
    '-',
    sharesOf(u).length && sameChannel && { label: isWatchingUser(u.id) ? 'Yayınlarını izlemeyi bırak' : 'Yayınlarını izle', run: () => watchUser(u.id, !isWatchingUser(u.id)) },
    {
      label: settings.localMutes[u.name] ? 'Sesini aç (yerel)' : 'Sustur (sadece benim için)',
      run: () => {
        if (settings.localMutes[u.name]) delete settings.localMutes[u.name];
        else settings.localMutes[u.name] = true;
        saveSettings();
        applyRemoteVolume(u.id);
        renderTree();
      },
    },
    {
      label: 'Dürt',
      run: () =>
        pokeUser(u),
    },
    !sameChannel && { label: 'Kanalına git', run: () => joinChannel(u.channelId) },
    ...voteItems(u),
    ...(mod.length ? ['-', { html: '<div class="ctx-label">Moderasyon</div>' }, ...mod] : []),
  ]);
}

// ---------- Bağlam menüsü & küçük istemler ----------
function showCtx(e, items) {
  const ctx = $('#ctx');
  ctx.innerHTML = '';
  for (const it of items) {
    if (!it) continue;
    if (it === '-') {
      ctx.append(h('div', { class: 'ctx-sep' }));
    } else if (it.html) {
      ctx.insertAdjacentHTML('beforeend', it.html);
    } else if (it.submenu) {
      const sub = h('div', { class: 'ctx ctx-sub' });
      for (const si of it.submenu)
        sub.append(
          h(
            'div',
            {
              class: 'ctx-item',
              onclick: (ev) => {
                ev.stopPropagation();
                hideCtx();
                si.run();
              },
            },
            si.label
          )
        );
      const row = h('div', { class: 'ctx-item has-sub' }, h('span', {}, it.label), h('span', { class: 'ctx-arrow' }, '›'), sub);
      const place = () => {
        // Sağa sığmazsa sola aç; ekranın altına taşmasın
        sub.classList.remove('left');
        sub.style.top = '';
        const r = sub.getBoundingClientRect();
        if (r.right > innerWidth - 8) sub.classList.add('left');
        if (r.bottom > innerHeight - 8) sub.style.top = `${Math.min(0, innerHeight - 8 - r.bottom)}px`;
      };
      row.addEventListener('mouseenter', () => {
        row.classList.add('open');
        place();
      });
      row.addEventListener('mouseleave', () => row.classList.remove('open'));
      row.addEventListener('click', () => {
        row.classList.toggle('open');
        place();
      });
      ctx.append(row);
    } else if (it.slider) {
      const out = h('span', {}, it.slider.value + '%');
      const input = h('input', { type: 'range', min: 0, max: it.slider.max, value: it.slider.value });
      input.addEventListener('input', () => {
        out.textContent = input.value + '%';
        it.onInput(Number(input.value));
      });
      ctx.append(h('div', { class: 'ctx-slider' }, input, out));
    } else {
      ctx.append(
        h(
          'div',
          {
            class: `ctx-item ${it.danger ? 'danger' : ''}`,
            onclick: () => {
              hideCtx();
              it.run();
            },
          },
          it.label
        )
      );
    }
  }
  ctx.classList.remove('hidden');
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  ctx.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
}
const hideCtx = () => $('#ctx').classList.add('hidden');
document.addEventListener('mousedown', (e) => !e.target.closest('#ctx') && hideCtx());

let promptCb = null;
function inlinePrompt(label, value, cb, allowEmpty = false, desc = '', opts = {}) {
  hideCtx();
  $('#prompt-title').textContent = label;
  $('#prompt-desc').textContent = desc;
  $('#prompt-desc').classList.toggle('hidden', !desc);
  const input = $('#prompt-input');
  input.value = value || '';
  input.classList.toggle('hidden', !!opts.confirm);
  input.placeholder = opts.placeholder || '';
  input.maxLength = opts.maxLength || 200;
  const ok = $('#prompt-ok');
  ok.textContent = opts.okLabel || 'Tamam';
  ok.classList.toggle('danger', !!opts.danger);
  ok.classList.toggle('primary', !opts.danger);
  promptCb = { cb, allowEmpty: allowEmpty || !!opts.confirm };
  showModal('prompt-modal');
  setTimeout(() => {
    if (opts.confirm) return ok.focus();
    input.focus();
    input.select();
  }, 30);
}
// Onay penceresi (ör. mesaj silme)
const confirmBox = (title, desc, okLabel, cb) => inlinePrompt(title, '', () => cb(), true, desc, { confirm: true, okLabel, danger: true });
function submitPrompt() {
  if (!promptCb) return;
  const v = $('#prompt-input').value.trim();
  if (!v && !promptCb.allowEmpty) return $('#prompt-input').focus();
  const { cb } = promptCb;
  promptCb = null;
  hideModal('prompt-modal');
  cb(v);
}
$('#prompt-ok').addEventListener('click', submitPrompt);
$('#prompt-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitPrompt();
});

// ---------- Modallar ----------
function showModal(id) {
  $('#' + id).classList.remove('hidden');
}
function hideModal(id) {
  $('#' + id).classList.add('hidden');
}
// Sunucu ayarlarında kaydedilmemiş değişiklik varsa kapatma; kaydet çubuğunu salla
const blockClose = (m) => m.id === 'admin-panel' && !m.classList.contains('hidden') && typeof SS !== 'undefined' && SS.ovDirty && (ssNagSave(), true);
$$('.modal').forEach((m) => {
  m.addEventListener('mousedown', (e) => e.target === m && !blockClose(m) && m.classList.add('hidden'));
  $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => !blockClose(m) && m.classList.add('hidden')));
});

// ---------- Mikrofon / hoparlör ----------
function toggleMute(force) {
  // Oylamayla susturulduysan süre dolana kadar mikrofon açılamaz
  if (force !== true && S.muted && (S.voteMutedUntil || 0) > Date.now()) {
    const min = Math.ceil((S.voteMutedUntil - Date.now()) / 60000);
    return toast('Mikrofonun kilitli', `Kanal oylamasıyla susturuldun. ${min} dakika sonra açabilirsin.`, 'err');
  }
  // Sunucu susturması / zaman aşımı / sağırlaştırma: bir yetkili kaldırana kadar açılamaz (admin.js)
  if (force !== true && S.muted && micLockReason()) return toast('Mikrofonun kilitli', micLockReason(), 'err');
  if (force !== true && S.deafened && deafLockReason()) return toast('Sesin kilitli', deafLockReason(), 'err');
  if (S.deafened) {
    // Hoparlör kapalıyken mikrofona basmak: ikisini de aç (Discord gibi)
    S.deafened = false;
    S.muted = false;
  } else S.muted = !S.muted;
  beep(S.muted ? 'mute' : 'unmute');
  send({ t: 'status', muted: S.muted, deafened: S.deafened });
  for (const id of audio.remote.keys()) applyRemoteVolume(id);
  renderControls();
}
function toggleDeafen() {
  if (S.deafened && deafLockReason()) return toast('Sesin kilitli', deafLockReason(), 'err');
  S.deafened = !S.deafened;
  if (S.deafened) {
    S.mutedBeforeDeafen = S.muted; // hoparlör açılınca mikrofon eski haline dönsün
    S.muted = true;
  } else S.muted = S.mutedBeforeDeafen || !!micLockReason();
  beep(S.deafened ? 'mute' : 'unmute');
  if (S.deafened) stopAllSfx();
  send({ t: 'status', muted: S.muted, deafened: S.deafened });
  for (const id of audio.remote.keys()) applyRemoteVolume(id);
  applyScreenVolumes();
  renderControls();
}

// ---------- Ayarlar ----------
async function openSettings(pane) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const fill = (sel, kind, current) => {
    sel.innerHTML = '';
    const list = devices.filter((d) => d.kind === kind);
    if (!list.find((d) => d.deviceId === 'default')) sel.append(h('option', { value: 'default' }, 'Sistem varsayılanı'));
    for (const d of list) sel.append(h('option', { value: d.deviceId }, d.label || (kind === 'audioinput' ? 'Mikrofon' : 'Hoparlör')));
    sel.value = list.find((d) => d.deviceId === current) ? current : 'default';
  };
  fill($('#set-input'), 'audioinput', settings.inputId);
  fill($('#set-output'), 'audiooutput', settings.outputId);
  fill($('#set-camera'), 'videoinput', settings.cameraId);
  if (!devices.some((d) => d.kind === 'videoinput')) $('#set-camera').innerHTML = '<option value="default">Kamera bulunamadı</option>';
  $('#set-status-text').value = settings.statusText || '';
  renderProfilePreview();
  renderNameStyleUi();
  $('#set-mode').value = settings.mode;
  $('#set-vad').value = settings.vad;
  $('#set-ns').checked = settings.ns;
  $('#set-ec').checked = settings.ec;
  $('#set-agc').checked = settings.agc;
  $('#set-sounds').checked = settings.sounds;
  $('#set-notify').checked = settings.notify;
  $('#set-autoidle').checked = settings.autoIdle;
  $('#update-check-result').textContent = '';
  $('#set-codec').value = settings.codec;
  $('#set-autowatch').checked = settings.autoWatch;
  updateSettingsUi();
  $('#keys-ptt').innerHTML = settings.pttLabel ? `<kbd>${esc(settings.pttLabel)}</kbd>` : 'Ses ve görüntü bölümünden atanır';
  if (typeof pane === 'string') $(`.snav[data-pane="${pane}"]`)?.click();
  showModal('settings');
}

function updateSettingsUi() {
  $('#vad-row').classList.toggle('hidden', settings.mode !== 'vad');
  $('#ptt-row').classList.toggle('hidden', settings.mode !== 'ptt');
  $('#vad-value').textContent = `${settings.vad} dB`;
  $('#meter-mark').style.left = ((settings.vad + 80) / 70) * 100 + '%';
  $('#btn-ptt-key').textContent = settings.pttLabel ? `Tuş: ${settings.pttLabel}` : 'Tuş ata';
}

$('#set-input').addEventListener('change', async (e) => {
  settings.inputId = e.target.value;
  saveSettings();
  await startMic();
});
$('#set-output').addEventListener('change', (e) => {
  settings.outputId = e.target.value;
  saveSettings();
  for (const r of audio.remote.values()) r.el.setSinkId?.(settings.outputId).catch(() => {});
  for (const sc of S.remoteScreens.values()) sc.audioEl?.setSinkId?.(settings.outputId).catch(() => {});
  applySfxOutput();
});
$('#set-mode').addEventListener('change', (e) => {
  settings.mode = e.target.value;
  saveSettings();
  updateSettingsUi();
  renderControls();
  applyPtt();
});
$('#set-vad').addEventListener('input', (e) => {
  settings.vad = Number(e.target.value);
  saveSettings();
  updateSettingsUi();
});
for (const [id, key] of [
  ['#set-ns', 'ns'],
  ['#set-ec', 'ec'],
  ['#set-agc', 'agc'],
]) {
  $(id).addEventListener('change', async (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    await startMic();
  });
}
$('#set-notify').addEventListener('change', (e) => {
  settings.notify = e.target.checked;
  saveSettings();
});
$('#set-autoidle').addEventListener('change', (e) => {
  settings.autoIdle = e.target.checked;
  saveSettings();
  checkIdle();
});
$$('.snav').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.snav').forEach((x) => x.classList.toggle('active', x === b));
    $$('.settings-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.pane));
    $('#settings .settings-main').scrollTop = 0; // yeni sayfa en üstten açılsın (önceki sayfanın kaydırması kalmasın)
  })
);
$('#btn-check-update').addEventListener('click', async () => {
  const out = $('#update-check-result');
  out.textContent = 'Kontrol ediliyor…';
  const r = await kanki.checkUpdate();
  out.textContent = r.message;
});
$('#set-sounds').addEventListener('change', (e) => {
  settings.sounds = e.target.checked;
  saveSettings();
});
$('#set-codec').addEventListener('change', (e) => {
  settings.codec = e.target.value;
  saveSettings();
});
$('#set-autowatch').addEventListener('change', (e) => {
  settings.autoWatch = e.target.checked;
  saveSettings();
});

// Bas-konuş tuşu
let capturingLocalKey = false;
$('#btn-ptt-key').addEventListener('click', async () => {
  $('#btn-ptt-key').textContent = 'Bir tuşa bas…';
  if (S.pttGlobal) {
    const r = await kanki.capturePttKey();
    if (r?.error === 'accessibility') {
      $('#ptt-note').textContent = 'macOS: Sistem Ayarları › Gizlilik › Erişilebilirlik bölümünden Kanki’ye izin ver, sonra tekrar dene.';
      updateSettingsUi();
      return;
    }
    if (r) {
      settings.pttKey = r.keycode;
      settings.pttLabel = r.label;
      saveSettings();
    }
    updateSettingsUi();
    renderControls();
    applyPtt();
  } else {
    capturingLocalKey = true;
  }
});

async function applyPtt() {
  if (!S.pttGlobal) {
    $('#ptt-note').textContent = 'Bas-konuş sadece uygulama penceresi odaktayken çalışır.';
    return;
  }
  if (settings.mode === 'ptt' && settings.pttKey != null) {
    const r = await kanki.setPtt(settings.pttKey);
    $('#ptt-note').textContent = r.ok
      ? 'Tuş tüm uygulamalarda (oyun içinde de) çalışır.'
      : r.reason === 'accessibility'
        ? 'macOS: Erişilebilirlik izni gerekli. İzin verdikten sonra uygulamayı yeniden başlat.'
        : 'Global tuş dinleme kullanılamıyor.';
  } else {
    await kanki.setPtt(null);
    $('#ptt-note').textContent = settings.mode === 'ptt' ? 'Bir tuş ata.' : '';
  }
}
kanki.onPtt((down) => {
  S.pttDown = down;
});

// Pencere içi kısayollar
window.addEventListener('keydown', (e) => {
  if (capturingLocalKey) {
    e.preventDefault();
    capturingLocalKey = false;
    settings.pttKey = e.code;
    settings.pttLabel = e.code.replace(/^Key/, '');
    saveSettings();
    updateSettingsUi();
    renderControls();
    return;
  }
  if (!S.pttGlobal && settings.mode === 'ptt' && e.code === settings.pttKey && !e.repeat) S.pttDown = true;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyM') {
    e.preventDefault();
    toggleMute();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    toggleDeafen();
  }
  if (e.key === 'f' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && tileEls.size) toggleFullscreen();
  if (e.key === 'Escape') {
    hideCtx();
    // Üstte başka pencere açıksa önce o kapansın; sunucu ayarları kaydedilmemişse açık kalsın
    const open = $$('.modal:not(.hidden)');
    const others = open.filter((m) => m.id !== 'admin-panel');
    if (others.length && open.some((m) => m.id === 'admin-panel') && typeof SS !== 'undefined' && SS.ovDirty) others.forEach((m) => m.classList.add('hidden'));
    else open.forEach((m) => !blockClose(m) && m.classList.add('hidden'));
  }
});
window.addEventListener('keyup', (e) => {
  if (!S.pttGlobal && settings.mode === 'ptt' && e.code === settings.pttKey) S.pttDown = false;
});
window.addEventListener('blur', () => {
  if (!S.pttGlobal) S.pttDown = false;
});

function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen();
  const key = S.activeTile && tileEls.has(S.activeTile) ? S.activeTile : [...tileEls.keys()][0];
  if (key) tileFullscreen(key);
}

// =====================================================================
//  Bağlantı ekranı
// =====================================================================
function renderRecent() {
  const box = $('#recent-list');
  box.innerHTML = '';
  if (!settings.recent.length) return;
  box.append(h('div', { class: 'recent-title' }, 'Son bağlanılanlar'));
  for (const r of settings.recent) {
    box.append(
      h(
        'div',
        {
          class: 'recent-item',
          onclick: (e) => {
            if (e.target.closest('.x')) return;
            $('#in-address').value = r.address;
            $('#in-password').value = r.password || '';
            $('#in-admin-key').value = r.adminKey || '';
            doConnect();
          },
        },
        avatar(r.name || r.address),
        h('div', {}, h('div', {}, r.name || r.address), h('div', { class: 'muted', style: 'font-size:11.5px' }, r.address)),
        h(
          'span',
          {
            class: 'x icon-btn small',
            title: 'Listeden kaldır',
            onclick: () => {
              settings.recent = settings.recent.filter((x) => x.address !== r.address);
              saveSettings();
              renderRecent();
            },
          },
          '✕'
        )
      )
    );
  }
}

function setConnectError(msg) {
  $('#connect-error').textContent = msg || '';
}

async function enterApp(url, password, address) {
  const nick = $('#in-nick').value.trim();
  if (!nick) {
    setConnectError('Bir takma ad gir.');
    $('#in-nick').focus();
    return false;
  }
  settings.nick = nick;
  saveSettings();
  setConnectError('');
  $('#btn-connect').disabled = $('#btn-host').disabled = true;
  try {
    await kanki.ensurePermissions();
    if (!audio.micTrack) await startMic();
    const r = await connect(url, password);
    if (!r.ok) {
      setConnectError(r.error);
      S.intentionalClose = true;
      S.ws?.close();
      return false;
    }
    if (address) {
      const entry = { address, password, name: S.serverName };
      if (S.variant === 'admin' && S.adminKey) entry.adminKey = S.adminKey;
      settings.recent = [entry, ...settings.recent.filter((x) => x.address !== address)].slice(0, 6);
      saveSettings();
    }
    $('#connect-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    everConnected = true;
    $('#launch-update').classList.add('hidden');
    renderAll();
    applyPtt();
    return true;
  } finally {
    $('#btn-connect').disabled = $('#btn-host').disabled = false;
  }
}

async function doConnect() {
  const address = $('#in-address').value.trim();
  const url = normalizeAddress(address);
  if (!url) return setConnectError('Geçerli bir sunucu adresi gir.');
  S.hosting = null;
  S.adminKey = S.variant === 'admin' ? $('#in-admin-key').value.trim() : '';
  $('#host-chip').classList.add('hidden');
  return enterApp(url, $('#in-password').value, address);
}

async function doHost() {
  const port = Number($('#in-host-port').value) || 4455;
  const name = $('#in-host-name').value.trim() || `${$('#in-nick').value.trim() || 'Benim'} Sunucusu`;
  const useNgrok = $('#in-ngrok').checked;
  const ngrokToken = $('#in-ngrok-token').value.trim();
  const ngrokDomain = $('#in-ngrok-domain').value.trim();
  if (!$('#in-nick').value.trim()) {
    setConnectError('Bir takma ad gir.');
    return $('#in-nick').focus();
  }
  if (useNgrok && !ngrokToken) {
    setConnectError('ngrok için authtoken gerekli (dashboard.ngrok.com › Your Authtoken).');
    return $('#in-ngrok-token').focus();
  }
  settings.host = { name, port, ngrok: useNgrok, ngrokToken, ngrokDomain };
  saveSettings();
  setConnectError('');
  $('#btn-host').disabled = true;
  $('#btn-host').textContent = 'Sunucu başlatılıyor…';
  try {
    const r = await kanki.hostServer({ port, name, password: $('#in-host-password').value });
    if (!r.ok) return setConnectError(r.error);
    S.hosting = r;
    S.adminKey = r.adminKey || '';
    const addrs = (r.addresses || (await kanki.serverStatus()).addresses).map((a) => a.address);
    let shown = addrs[0] ? `${addrs[0]}:${r.port}` : `localhost:${r.port}`;
    let label = 'Sunucu sende';
    if (useNgrok) {
      $('#btn-host').textContent = 'ngrok tüneli açılıyor…';
      const t = await kanki.startTunnel({ port: r.port, authtoken: ngrokToken, domain: ngrokDomain });
      if (!t.ok) {
        await kanki.stopServer();
        S.hosting = null;
        return setConnectError(t.error);
      }
      shown = t.url.replace(/^https:\/\//, '');
      label = 'İnternette açık';
    }
    const chip = $('#host-chip');
    chip.textContent = `${label} · ${shown}`;
    chip.title = useNgrok
      ? 'Arkadaşlarına bu adresi ver (tıkla, kopyala)'
      : `Arkadaşlarına bu adresi ver (tıkla, kopyala). Tüm adresler: ${addrs.map((a) => a + ':' + r.port).join(', ')}`;
    chip.onclick = () => {
      navigator.clipboard.writeText(shown);
      toast('Adres kopyalandı', shown);
    };
    chip.classList.remove('hidden');
    $('#btn-host').disabled = false;
    await enterApp(`ws://127.0.0.1:${r.port}`, $('#in-host-password').value, null);
    if (useNgrok) toast('Sunucu internette açık', `Arkadaşların bu adrese bağlanabilir: ${shown}`, '', 9000);
  } finally {
    $('#btn-host').disabled = false;
    $('#btn-host').textContent = 'Sunucuyu Başlat ve Bağlan';
  }
}

$('#in-ngrok').addEventListener('change', (e) => $('#ngrok-box').classList.toggle('hidden', !e.target.checked));

$$('#connect-tabs .tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('#connect-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t.dataset.tab));
    setConnectError('');
  })
);
$('#btn-connect').addEventListener('click', doConnect);
$('#btn-host').addEventListener('click', doHost);
for (const id of ['#in-address', '#in-password', '#in-nick']) $(id).addEventListener('keydown', (e) => e.key === 'Enter' && doConnect());

// =====================================================================
//  Ana ekran olayları
// =====================================================================
$('#btn-mic').addEventListener('click', toggleMute);
$('#btn-deafen').addEventListener('click', toggleDeafen);
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-disconnect').addEventListener('click', disconnect);
$('#btn-share').addEventListener('click', openPicker);
$('#btn-go-live').addEventListener('click', goLive);
$('#btn-add-channel').addEventListener('click', () => promptChannel(null));
$('#btn-grid').addEventListener('click', () => {
  S.layoutCustom = false;
  for (const el of tileEls.values()) el.classList.remove('maxed');
  renderStage();
});
window.addEventListener('resize', () => tileEls.size && renderTiles());
$$('#picker-tabs .tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('#picker-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    pickerType = t.dataset.type;
    renderSources();
  })
);
let lastTypingSent = 0;
$('#chat-input').addEventListener('input', () => {
  const v = $('#chat-input').value;
  if (v && Date.now() - lastTypingSent > 2500) {
    lastTypingSent = Date.now();
    send({ t: 'typing', channelId: chatChannel() });
  }
  updateMentionPop();
});
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat();
});
navigator.mediaDevices.addEventListener('devicechange', async () => {
  if (audio.micTrack?.readyState === 'ended') await startMic();
});

// =====================================================================
//  Ayar açıklamaları (üzerine gelince çıkan bilgi kutusu)
// =====================================================================
const TIPS = {
  // Ses
  'set-input': 'Sesinin alınacağı cihaz. Kulaklığının mikrofonu varsa onu seç. Değiştirdiğin anda uygulanır.',
  'set-output': 'Arkadaşlarının sesini ve izlediğin yayının sesini hangi cihazdan duyacağın.',
  'set-mode':
    'Sesle etkinleştirme: konuştuğunda mikrofon kendiliğinden açılır.\nBas-konuş: sadece atadığın tuşa basılıyken sesin gider.\nSürekli açık: mikrofon hep açıktır.',
  'set-vad':
    'Mikrofonun açılması için sesinin ne kadar yüksek olması gerektiği. Konuşurken renkli çubuk beyaz çizgiyi geçmeli, sessizken geçmemeli. Klavye ya da fan sesin gidiyorsa çizgiyi sağa kaydır.',
  'btn-ptt-key':
    'Konuşmak için basılı tutacağın klavye ya da fare yan tuşu. Oyun içindeyken de çalışır (macOS’ta Erişilebilirlik izni ister).',
  'set-rnnoise': 'Yapay zekâ (RNNoise) ile klavye, fan, köpek havlaması, kalabalık gibi sesleri çok daha iyi temizler. Açıkken standart gürültü bastırma kendiliğinden devre dışı kalır. Biraz daha fazla işlemci kullanır.',
  'set-overlay': 'Oyun oynarken ekranın köşesinde kanaldakileri gösterir; konuşan yeşil halkayla belirir. Oyunu "kenarlıksız pencere" modunda oynarsan üstünde görünür.',
  'set-show-game': 'Bilinen 100\'den fazla oyundan birini açınca adının altında "🎮 Oyun adı oynuyor" yazar, kapatınca kalkar. Sadece oyunun adı sunucuya gider.',
  'set-show-music': 'Spotify\'da çalan şarkı adının altında görünür. Mac\'te ilk seferde macOS izin ister.',
  'set-ns': 'Fan, klavye, trafik gibi sürekli arka plan seslerini temizler. Mikrofona müzik ya da enstrüman çalıyorsan kapatmak sesi daha doğal yapar.',
  'set-ec': 'Hoparlörden çıkan arkadaş sesinin mikrofonuna girip onlara yankı olarak dönmesini engeller. Kulaklık kullanıyorsan kapatabilirsin.',
  'set-agc': 'Mikrofon seviyeni kendiliğinden ayarlar; fısıldasan da bağırsan da benzer seviyede duyulursun.',
  'set-sounds': 'Biri kanala girip çıktığında ve mesaj geldiğinde kısa bir uyarı sesi çalar. Dürtülme sesi bu ayardan bağımsızdır; sadece hoparlörü kapatınca susar.',
  // Ekran paylaşımı ayarları
  'set-codec':
    'Yayınının sıkıştırılma biçimi.\nH.264: ekran kartını kullanır, bilgisayarı en az yorar (önerilen).\nVP9: yazılar daha net, işlemciyi daha çok kullanır.\nAV1: aynı kalitede en az internet, en ağır seçenek.',
  'set-camera': 'Kamera düğmesine bastığında kullanılacak kamera. "Kamerayı dene" ile görüntünü kontrol edebilirsin; önizleme sadece sende görünür.',
  'btn-cam-test': 'Kamerayı kimseye göndermeden burada açar; ışığı ve açıyı ayarlamak için.',
  'set-status-text': 'Adının altında görünen kısa yazı, ör. "🎮 Oyun oynuyor" ya da "Yemekteyim". Boş bırakırsan kaldırılır.',
  'btn-avatar-pick': 'Bilgisayarından bir fotoğraf seç. Ortasından kare olarak kesilir ve küçültülür.',
  'set-autowatch':
    'Kanalda biri ekran paylaşınca tıklamana gerek kalmadan izlemeye başlarsın. Kapalıysa izlemek için adına tıklarsın; internetin kısıtlıysa kapatman iyi olur.',
  // Ekran seçici
  'opt-res': 'Yayının netliği. Yüksek çözünürlük daha net ama daha çok internet ister. Arkadaşların normal bir ekranda izliyorsa 1080p yeterli.',
  'opt-fps': 'Saniyede gönderilen kare sayısı. Oyun ve video için 60, yazı/kod/sunum için 30 yeterli. Yükleme hızın düşükse 30’a indir.',
  'opt-hint':
    'İnternet yetmediğinde neyin korunacağı.\nAkıcılık: görüntü biraz yumuşar ama takılmaz (oyun, video).\nNetlik: yazılar keskin kalır, kare hızı düşebilir (kod, belge).',
  'opt-bitrate':
    'Yayına ayrılan internet hızı. "Otomatik", çözünürlük ve kare hızına göre seçer. Her izleyiciye ayrı gönderilir: 6 Mbps × 3 izleyici = 18 Mbps yükleme hızı gerekir.',
  'opt-audio':
    'Bilgisayarın sesi de yayına eklenir (oyun, video, müzik). Pencere seçsen bile sadece o pencerenin değil, tüm bilgisayar sesi gider. Kanki’den duyduğun arkadaş sesleri ve izlediğin yayınlar yayına girmez, böylece izleyenler kendi seslerini geri duymaz (Windows 10 2004 ve üstü). Windows’ta çalışır; macOS’ta 14.2 ve üstü gerekir.',
  // Bağlantı ekranı
  'in-nick': 'Sunucuda arkadaşlarının göreceği adın. Aynı ad kullanılıyorsa sonuna otomatik numara eklenir.',
  'in-address': 'Sunucuyu kuran kişinin verdiği adres, ör. bizim-kanki.ngrok-free.app ya da 192.168.1.20:4455. Başına https:// eklemene gerek yok.',
  'in-password': 'Sunucuya şifre konduysa buraya yaz; şifre yoksa boş bırak.',
  'in-admin-key': 'Başka bir bilgisayarda kurulu sunucuyu yönetmek için o sunucunun yönetici anahtarı. Kendi kurduğun sunucuda gerekmez.',
  'in-host-name': 'Sunucunun adı; herkesin ekranının sol üstünde görünür.',
  'in-host-port': 'Sunucunun dinleyeceği kapı numarası. Başka bir program kullanmıyorsa 4455 olarak bırak.',
  'in-host-password': 'Sunucuya girmek için istenecek şifre. Boş bırakırsan adresi bilen herkes girebilir.',
  'in-ngrok': 'Sunucuyu ngrok üzerinden internete açar; arkadaşların farklı evlerden, port açmana gerek kalmadan bağlanır.',
  'in-ngrok-token': 'ngrok hesabının giriş anahtarı. dashboard.ngrok.com › Your Authtoken sayfasından kopyala. Sadece bu bilgisayarda saklanır.',
  'in-ngrok-domain': 'ngrok’tan aldığın ücretsiz sabit adres. Doldurursan sunucunun adresi her açılışta aynı kalır.',
  // Sunucu ayarları (admin.js)
  'adm-name': 'Sunucunun herkese görünen adı. "Değişiklikleri kaydet"e basınca bağlı herkeste hemen değişir.',
  'adm-welcome': 'Sunucuya bağlanan herkese girişte bir kez gösterilen mesaj. Kurallar ya da selam için.',
  'adm-ann': 'Herkesin ekranının en üstünde görünen şerit. Kişi kapatabilir ama yeni duyuru yine çıkar.',
  'adm-previews': 'Kapalıyken sohbette paylaşılan bağlantıların altında önizleme kartı çıkmaz.',
  'adm-password': 'Yeni giriş şifresi. Boş bırakırsan mevcut şifre değişmez. Zaten bağlı olanlar atılmaz.',
  'adm-nopass': 'Şifreyi tamamen kaldırır; adresi bilen herkes şifresiz girebilir.',
};

const tipEl = h('div', { class: 'tip-pop', role: 'tooltip' });
document.body.append(tipEl);
let tipTimer = null;
let tipTarget = null;

function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  tipEl.classList.remove('show');
}

function placeTip(target) {
  tipEl.textContent = target.dataset.tip;
  tipEl.classList.add('show');
  const r = target.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  let top = r.bottom + 8;
  let below = true;
  if ((target.dataset.tipPos === 'above' || top + t.height > innerHeight - 8) && target.dataset.tipPos !== 'below') {
    top = r.top - t.height - 8;
    below = false;
  }
  const left = Math.max(8, Math.min(r.left, innerWidth - t.width - 8));
  tipEl.style.left = left + 'px';
  tipEl.style.top = Math.max(8, top) + 'px';
  tipEl.classList.toggle('above', !below);
}

function showTipSoon(target) {
  if (target === tipTarget) return;
  clearTimeout(tipTimer);
  tipTarget = target;
  tipTimer = setTimeout(() => tipTarget === target && placeTip(target), 350);
}

// Her açıklamayı ayarın tüm satırına bağla (etiket + kontrol)
for (const [id, text] of Object.entries(TIPS)) {
  const el = document.getElementById(id);
  if (!el) continue;
  const row = el.closest('.field, .check') || el;
  row.dataset.tip = text;
}
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTipSoon(t);
  else if (tipTarget) hideTip();
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTipSoon(t);
});
document.addEventListener('focusout', hideTip);
document.addEventListener('mousedown', (e) => {
  if (e.target.closest?.('select')) hideTip(); // açılır listeyi kapatmasın
});
document.addEventListener('scroll', hideTip, true);
window.addEventListener('blur', hideTip);

// =====================================================================
//  Yönetim paneli
// =====================================================================
const ICON_CROWN = () => {
  const span = document.createElement('span');
  span.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Zm2 13h14v2H5v-2Z"/></svg>';
  return span.firstChild;
};

function applyAdminUi() {
  // Sunucu ayarları ve kanal oluşturma: yetkisi olana (admin.js: isStaff, can)
  $('#btn-admin').classList.toggle('hidden', !isStaff());
  $('#btn-admin').title = 'Sunucu ayarları';
  $('#btn-add-channel').classList.toggle('hidden', !can('manageChannels'));
  $('#btn-add-text').classList.toggle('hidden', !can('manageChannels'));
}

const fmtDuration = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk`;
  const hrs = Math.floor(m / 60);
  return hrs < 24 ? `${hrs} sa ${m % 60} dk` : `${Math.floor(hrs / 24)} gün ${hrs % 24} sa`;
};

// Sunucu ayarları ekranı (openAdminPanel, refreshAdmin, renderAdminInfo, Bağlantı sekmesi) admin.js'de.

// =====================================================================
//  Otomatik güncelleme bildirimi (sadece kurulumlu Windows sürümünde gelir)
// =====================================================================
let updateToastShown = false;
const appStartedAt = Date.now();
let everConnected = false; // bu açılışta bir sunucuya bağlanıldı mı
let launchInstall = false; // açılışta bulunan güncelleme kendiliğinden kurulacak mı

function renderUpdate(u) {
  const btn = $('#update-btn');
  const active = u && (u.state === 'downloading' || u.state === 'ready');
  btn.classList.toggle('hidden', !active);
  document.body.classList.toggle('has-update', !!active); // sağ üstte ona yer açılır
  requestAnimationFrame(placeUpdateBtn);
  if (!active) {
    $('#launch-update').classList.add('hidden');
    return;
  }
  const ready = u.state === 'ready';
  const pct = ready ? 100 : Math.max(0, Math.min(100, u.percent || 0));
  btn.classList.toggle('ready', ready);
  btn.disabled = !ready;
  // İlerleme halkası (çevre = 2πr ≈ 100.5)
  $('#update-ring-fg').style.strokeDashoffset = String(100.5 * (1 - pct / 100));
  btn.dataset.tip = ready
    ? `Kanki ${u.version} hazır\nGüncellemek ve yeniden başlatmak için tıkla`
    : `Kanki ${u.version || ''} indiriliyor… %${pct}`;
  if (tipTarget === btn) tipEl.textContent = btn.dataset.tip;

  // Açılışta bulunan güncelleme: henüz kimse bir sunucuya bağlanmadıysa kendiliğinden kur
  if (!everConnected && Date.now() - appStartedAt < 3 * 60 * 1000) launchInstall = true;
  const showLaunch = launchInstall && !everConnected;
  $('#launch-update').classList.toggle('hidden', !showLaunch);
  if (showLaunch) {
    $('#launch-update-text').textContent = ready
      ? `Kanki ${u.version} kuruluyor, uygulama yeniden açılacak…`
      : `Yeni sürüm (Kanki ${u.version || ''}) indiriliyor… %${pct}`;
    $('#launch-update-fill').style.width = pct + '%';
  }
  if (ready && showLaunch) {
    setTimeout(() => !everConnected && kanki.installUpdate(), 1500);
    return;
  }
  if (ready && !updateToastShown) {
    updateToastShown = true;
    beep('msg');
    toast(`Kanki ${u.version} hazır`, 'Sağ üstteki yeşil düğmeye basınca güncellenip yeniden başlar.');
  }
}
kanki.onUpdate(renderUpdate);
kanki.updateState().then(renderUpdate);
// Güncelleme düğmesi görünen başlık satırının (sohbet ya da sahne) sağ ucuna, dikeyde ortalı yerleşir
// (yüzen paneller, bitişik paneller, Mac başlık çubuğu ve duyuru bandı fark etmeksizin)
function placeUpdateBtn() {
  const btn = $('#update-btn');
  if (btn.classList.contains('hidden')) return;
  const heads = [...document.querySelectorAll('#app .chat-head, #app .stage-head')].filter((x) => x.offsetParent);
  const head = heads.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  if (!head || $('#app').classList.contains('hidden')) {
    btn.style.top = btn.style.right = '';
    return;
  }
  const r = head.getBoundingClientRect();
  btn.style.top = `${Math.round(r.top + (r.height - 32) / 2)}px`;
  btn.style.right = `${Math.round(innerWidth - r.right + 12)}px`;
}
addEventListener('resize', placeUpdateBtn);
setInterval(placeUpdateBtn, 500);
$('#update-btn').addEventListener('click', () => {
  const btn = $('#update-btn');
  if (!btn.classList.contains('ready')) return;
  btn.disabled = true;
  btn.classList.add('installing');
  btn.dataset.tip = 'Güncelleniyor, Kanki yeniden açılıyor…';
  kanki.installUpdate();
});

// =====================================================================
//  Durum (çevrimiçi / boşta / rahatsız etmeyin)
// =====================================================================
const PRESENCE = {
  online: { label: 'Çevrimiçi', desc: '' },
  idle: { label: 'Boşta', desc: 'Bir süredir hareketsiz' },
  dnd: { label: 'Rahatsız Etmeyin', desc: 'Mesaj sesleri, bildirimler ve dürtme sessiz' },
};
function effectivePresence() {
  if (settings.presence === 'dnd') return 'dnd';
  if (settings.presence === 'idle' || S.autoIdle) return 'idle';
  return 'online';
}
function presenceOf(u) {
  if (!u) return 'online';
  if (u.id === S.myId) return effectivePresence();
  return u.presence || (u.away ? 'idle' : 'online');
}
function withDot(av, u) {
  av.append(h('span', { class: `status-dot ${presenceOf(u)}` }));
  return av;
}
function sendPresence() {
  const p = effectivePresence();
  send({ t: 'status', presence: p, away: p === 'idle' });
  renderControls();
  renderTree();
}
function setPresence(p) {
  settings.presence = p;
  saveSettings();
  S.autoIdle = false;
  sendPresence();
}
// Sistem genelinde 10 dk klavye/fare yoksa otomatik "Boşta" (konuşurken değil)
async function checkIdle() {
  if (!S.myId) return;
  let idleSec = 0;
  try {
    idleSec = await kanki.idleTime();
  } catch {}
  const shouldIdle = settings.autoIdle && settings.presence === 'online' && idleSec >= 600 && !S.transmitting;
  if (shouldIdle !== S.autoIdle) {
    S.autoIdle = shouldIdle;
    sendPresence();
  }
}
setInterval(checkIdle, 20000);

function presenceMenu(e) {
  const item = (p) => ({
    label: `${p === effectivePresence() ? '● ' : ''}${PRESENCE[p].label}`,
    run: () => setPresence(p),
  });
  showCtx(e, [
    { html: '<div class="ctx-label">Durum</div>' },
    item('online'),
    item('idle'),
    item('dnd'),
    '-',
    { label: settings.statusText ? 'Durum yazısını değiştir…' : 'Durum yazısı ekle…', run: promptStatusText },
    settings.statusText && { label: 'Durum yazısını kaldır', run: () => setStatusText('') },
    { label: 'Profili düzenle', run: () => openSettings('profile') },
  ]);
}
$('.me-info').addEventListener('click', (e) => presenceMenu(e));

// =====================================================================
//  Sunucu menüsü ve davet adresi
// =====================================================================
function inviteAddress() {
  const chip = $('#host-chip');
  if (S.hosting && !chip.classList.contains('hidden')) return chip.textContent.split(' · ').pop();
  return S.url.replace(/^wss?:\/\//, '').replace(/\/$/, '');
}
$('#server-menu-btn').addEventListener('click', (e) => {
  const r = $('#server-menu-btn').getBoundingClientRect();
  showCtx({ clientX: r.left, clientY: r.bottom + 6 }, [
    {
      label: 'Davet adresini kopyala',
      run: () => {
        const a = inviteAddress();
        navigator.clipboard.writeText(a);
        toast('Davet adresi kopyalandı', `Arkadaşların Kanki'de bu adresi yazarak bağlanır: ${a}`);
      },
    },
    { label: 'Davet bağlantısını kopyala', run: () => copyInviteLink(false) },
    S.password && { label: 'Şifre dahil davet bağlantısı', run: () => copyInviteLink(true) },
    isStaff() && { label: 'Sunucu ayarları', run: () => openAdminPanel() },
    can('manageChannels') && { label: 'Kanal oluştur', run: () => createChannelForm() },
    '-',
    { label: 'Ayarlar', run: openSettings },
    { label: 'Bağlantıyı kes', danger: true, run: disconnect },
  ]);
  e.stopPropagation();
});

// =====================================================================
//  Profil kartı
// =====================================================================
function pokeUser(u) {
  inlinePrompt(
    `Dürt: ${u.name}`,
    '',
    (text) => {
      send({ t: 'poke', to: u.id, text });
      logEvent('👉', `${u.name} kişisini dürttün${text ? ': ' + text : ''}`, { dim: true });
      toast(`${u.name} dürtüldü`, 'Onun ekranı şu an titriyor.');
      nudge(false);
    },
    true,
    'İstersen kısa bir mesaj ekle (opsiyonel).'
  );
}

let profileFor = null;
function openProfile(uid, anchor) {
  const u = S.users.get(uid);
  if (!u) return;
  hideCtx();
  const pop = $('#profile-pop');
  if (profileFor === uid && !pop.classList.contains('hidden')) return closeProfile();
  profileFor = uid;
  pop.innerHTML = '';
  const isMe = uid === S.myId;
  const pres = presenceOf(u);
  const ch = S.channels.find((c) => c.id === u.channelId);
  const big = withDot(avatar(u.name), u);
  big.classList.add('big');
  const banner = h('div', { class: 'pf-banner' });
  banner.style.background = colorFor(u.name);
  const tags = h('div', { class: 'pf-tags' });
  if (u.admin) tags.append(h('span', { class: 'pf-tag admin' }, 'Sunucu sahibi'));
  const nScr = screenSharesOf(u).length;
  if (nScr) tags.append(h('span', { class: 'pf-tag live' }, nScr > 1 ? `${nScr} yayın` : 'Ekran paylaşıyor'));
  if (camShareOf(u)) tags.append(h('span', { class: 'pf-tag cam' }, 'Kamerası açık'));
  if (u.muted) tags.append(h('span', { class: 'pf-tag' }, 'Mikrofon kapalı'));
  if (u.deafened) tags.append(h('span', { class: 'pf-tag' }, 'Ses kapalı'));
  const statusText = isMe ? settings.statusText : u.statusText;
  const body = h(
    'div',
    { class: 'pf-body' },
    h('div', { class: 'pf-name' }, nameEl(u.name, styleOfUser(u)), isMe ? ' (sen)' : ''),
    statusText ? h('div', { class: 'pf-custom' }, statusText) : null,
    ...activityLines(u).map((t) => h('div', { class: 'pf-activity' }, t)),
    h('div', { class: 'pf-status' }, h('span', { class: `status-dot inline ${pres}` }), PRESENCE[pres].label, ch ? h('span', { class: 'muted' }, ` · ${ch.name}`) : null),
    tags,
    profileRoles(u) // roller ve moderasyon durumu (admin.js)
  );
  if (isMe) {
    const row = h('div', { class: 'pf-section' }, h('div', { class: 'pf-label' }, 'Durumun'));
    const btns = h('div', { class: 'pf-presence' });
    for (const p of ['online', 'idle', 'dnd']) {
      btns.append(
        h(
          'button',
          {
            class: `pf-pres-btn ${effectivePresence() === p ? 'active' : ''}`,
            onclick: () => {
              setPresence(p);
              openProfile(uid, anchor);
              openProfile(uid, anchor);
            },
          },
          h('span', { class: `status-dot inline ${p}` }),
          PRESENCE[p].label
        )
      );
    }
    row.append(btns);
    body.append(row);
    const acts = h('div', { class: 'pf-actions' });
    acts.append(
      h('button', { class: 'btn sm', onclick: () => (closeProfile(), promptStatusText()) }, statusText ? 'Durum yazısını değiştir' : 'Durum yazısı ekle'),
      h('button', { class: 'btn sm', onclick: () => (closeProfile(), openSettings('profile')) }, 'Profili düzenle')
    );
    body.append(acts);
  } else {
    const key = volKey(uid);
    const vol = settings.userVolumes[key] ?? 100;
    const out = h('span', { class: 'pf-vol-val' }, vol + '%');
    const slider = h('input', { type: 'range', min: 0, max: 100, value: vol });
    slider.addEventListener('input', () => {
      settings.userVolumes[key] = Number(slider.value);
      out.textContent = slider.value + '%';
      saveSettings();
      applyRemoteVolume(uid);
    });
    body.append(h('div', { class: 'pf-section' }, h('div', { class: 'pf-label' }, 'Ses seviyesi (sadece senin için)'), h('div', { class: 'pf-vol' }, slider, out)));
    const acts = h('div', { class: 'pf-actions' });
    const act = (label, fn, cls = '') => acts.append(h('button', { class: `btn sm ${cls}`, onclick: () => (closeProfile(), fn()) }, label));
    if (nScr && u.channelId === S.channelId) act(isWatchingUser(uid) ? 'İzlemeyi bırak' : 'Yayını izle', () => watchUser(uid, !isWatchingUser(uid)), 'primary');
    if (!u.bot) act('Dürt', () => pokeUser(u));
    act(settings.localMutes[u.name] ? 'Sesini aç' : 'Sustur', () => {
      if (settings.localMutes[u.name]) delete settings.localMutes[u.name];
      else settings.localMutes[u.name] = true;
      saveSettings();
      applyRemoteVolume(uid);
      renderTree();
    });
    if (u.channelId !== S.channelId) act('Kanalına git', () => joinChannel(u.channelId));
    body.append(acts);
  }
  pop.append(banner, big, body);
  pop.classList.remove('hidden');
  // Konum: tıklanan öğenin yanına, ekrana sığacak şekilde
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3 };
  const pr = pop.getBoundingClientRect();
  let left = r.right + 10;
  if (left + pr.width > innerWidth - 8) left = r.left - pr.width - 10;
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = Math.max(8, Math.min(r.top, innerHeight - pr.height - 8)) + 'px';
}
function closeProfile() {
  profileFor = null;
  $('#profile-pop').classList.add('hidden');
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#profile-pop') && !e.target.closest('.user, .p-card, .member, .msg .avatar, .msg-name')) closeProfile();
});
window.addEventListener('keydown', (e) => e.key === 'Escape' && closeProfile());

// =====================================================================
//  Üye listesi (sağ panel)
// =====================================================================
let rightTab = 'chat';
$$('.chat-tab').forEach((b) =>
  b.addEventListener('click', () => {
    rightTab = b.dataset.tab;
    $$('.chat-tab').forEach((x) => x.classList.toggle('active', x === b));
    $('#chat-pane').classList.toggle('hidden', rightTab !== 'chat');
    $('#members').classList.toggle('hidden', rightTab !== 'members');
    $('#log-pane').classList.toggle('hidden', rightTab !== 'log');
    if (rightTab === 'members') renderMembers();
    if (rightTab === 'log') renderLog();
  })
);
function renderMembers() {
  if (rightTab !== 'members') return;
  const box = $('#members');
  box.innerHTML = '';
  // Önce "ayrı göster" (hoist) rolleri, sonra kanallar — Discord gibi (admin.js)
  for (const [label, list] of memberGroups()) {
    box.append(h('div', { class: 'member-group' }, `${label} — ${list.length}`));
    for (const u of list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
      const pres = presenceOf(u);
      const av = u.bot ? botAvatar() : withDot(avatar(u.name), u);
      av.dataset.av = u.id;
      const custom = u.id === S.myId ? settings.statusText : u.statusText;
      const sub = custom || activityText(u) || (screenSharesOf(u).length ? 'Ekran paylaşıyor' : camShareOf(u) ? 'Kamerası açık' : pres !== 'online' ? PRESENCE[pres].label : u.muted ? 'Mikrofon kapalı' : '');
      const row = h(
        'div',
        { class: `member ${pres}`, onclick: () => openProfile(u.id, row), oncontextmenu: (e) => userMenu(e, u) },
        av,
        h('div', { class: 'member-text' }, h('div', { class: 'member-name' }, nameEl(u.name, styleOfUser(u)), staffBadge(u)), sub ? h('div', { class: 'member-sub' }, sub) : null)
      );
      if (!styleOfUser(u)) row.querySelector('.member-name').style.color = roleInk(u.color) || colorFor(u.name); // rol rengi (açık temada koyu)
      box.append(row);
    }
  }
}

// =====================================================================
//  Sohbet: yazıyor göstergesi, yeni mesajlar, emoji, @bahsetme önerisi
// =====================================================================
function renderTyping() {
  const now = Date.now();
  for (const [id, t] of S.typing) if (now - t > 6000 || !S.users.has(id)) S.typing.delete(id);
  const names = [...S.typing.keys()].map(userName).filter(Boolean);
  const el = $('#typing');
  if (!names.length) return (el.innerHTML = '');
  const who = names.length === 1 ? `<b>${esc(names[0])}</b> yazıyor` : names.length === 2 ? `<b>${esc(names[0])}</b> ve <b>${esc(names[1])}</b> yazıyor` : 'Birkaç kişi yazıyor';
  el.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span>${who}…`;
}
setInterval(renderTyping, 1000);

$('#chat-log').addEventListener('scroll', () => {
  const box = $('#chat-log');
  if (box.scrollHeight - box.scrollTop - box.clientHeight < 60) $('#new-msgs').classList.add('hidden');
});
$('#new-msgs').addEventListener('click', () => {
  const box = $('#chat-log');
  box.scrollTop = box.scrollHeight;
  $('#new-msgs').classList.add('hidden');
});

const EMOJIS = '😀 😂 🤣 😅 😊 😍 😎 🤔 😏 😴 😭 😡 🤯 🥳 😇 🙃 👍 👎 👏 🙏 💪 🤝 👀 🔥 💯 ❤️ 💔 ⭐ 🎉 🎮 🏆 ⚽ 🍕 🍺 ☕ 🎧 🎵 💻 📺 🚀 ✅ ❌ ⚠️ ⏰ 💤'.split(' ');
(function buildEmoji() {
  const pop = $('#emoji-pop');
  for (const em of EMOJIS)
    pop.append(
      h(
        'button',
        {
          type: 'button',
          class: 'emoji',
          onclick: () => {
            const inp = $('#chat-input');
            const pos = inp.selectionStart ?? inp.value.length;
            inp.value = inp.value.slice(0, pos) + em + inp.value.slice(pos);
            inp.focus();
            inp.selectionStart = inp.selectionEnd = pos + em.length;
          },
        },
        em
      )
    );
})();
$('#btn-emoji').addEventListener('click', (e) => {
  e.stopPropagation();
  $('#emoji-pop').classList.toggle('hidden');
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#emoji-pop, #btn-emoji')) $('#emoji-pop').classList.add('hidden');
  if (!e.target.closest('#mention-pop, #chat-input')) $('#mention-pop').classList.add('hidden');
});

let mentionSel = 0;
function mentionQuery() {
  const inp = $('#chat-input');
  const before = inp.value.slice(0, inp.selectionStart ?? inp.value.length);
  const m = before.match(/(^|\s)@([^\s@]*)$/);
  return m ? m[2] : null;
}
function mentionCandidates() {
  const q = mentionQuery();
  if (q === null) return [];
  const all = [...S.users.values()].filter((u) => u.id !== S.myId).map((u) => u.name);
  if (can('mentionEveryone')) all.push('herkes');
  return all.filter((n) => trLower(n).startsWith(trLower(q))).slice(0, 6);
}
function updateMentionPop() {
  const pop = $('#mention-pop');
  const list = mentionCandidates();
  if (!list.length) return pop.classList.add('hidden');
  mentionSel = Math.min(mentionSel, list.length - 1);
  pop.innerHTML = '';
  pop.append(h('div', { class: 'mention-head' }, 'Bahset'));
  list.forEach((n, i) => {
    const item = h('div', { class: `mention-item ${i === mentionSel ? 'sel' : ''}`, onmousedown: (e) => (e.preventDefault(), insertMention(n)) }, n === 'herkes' ? h('span', { class: 'mention-all' }, '@') : avatar(n), n === 'herkes' ? 'herkes (kanaldaki herkes)' : n);
    pop.append(item);
  });
  pop.classList.remove('hidden');
}
function insertMention(name) {
  const inp = $('#chat-input');
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + name + ' ');
  inp.value = before + inp.value.slice(pos);
  inp.selectionStart = inp.selectionEnd = before.length;
  inp.focus();
  $('#mention-pop').classList.add('hidden');
}
$('#chat-input').addEventListener('keydown', (e) => {
  const pop = $('#mention-pop');
  if (pop.classList.contains('hidden')) return;
  const list = mentionCandidates();
  if (!list.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    mentionSel = (mentionSel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    updateMentionPop();
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    insertMention(list[mentionSel]);
  } else if (e.key === 'Escape') pop.classList.add('hidden');
});

// =====================================================================
//  Ses bağlantı durumu ("Ses bağlı" / "Ses bağlanıyor…")
// =====================================================================
function updateVoiceState() {
  const el = $('.voice-state');
  if (!el) return;
  const peers = [...S.peers.values()];
  const pending = peers.filter((p) => p.pc.connectionState !== 'connected');
  const label = el.lastChild;
  if (pending.length && peers.length) {
    el.classList.add('connecting');
    label.textContent = pending.some((p) => p.pc.connectionState === 'failed') ? 'Ses bağlantısı sorunlu' : 'Ses bağlanıyor…';
    el.title = pending.map((p) => userName(p.id)).join(', ') + ' ile bağlantı kuruluyor';
  } else {
    el.classList.remove('connecting');
    label.textContent = 'Ses bağlı';
    el.title = '';
  }
}
setInterval(updateVoiceState, 1500);
window.addEventListener('resize', () => !$('#participants').classList.contains('hidden') && renderStage());

// =====================================================================
//  Sohbet: tepkiler, yanıtlar, düzenleme, silme, resimler
// =====================================================================
const QUICK_REACTS = ['👍', '😂', '❤️'];
const isMineMsg = (m) => !m.system && (m.from === S.myId || (!!m.name && m.name === S.myName));
function openProfileByName(m, anchor) {
  const u = S.users.get(m.from) || [...S.users.values()].find((x) => x.name === m.name);
  if (u) openProfile(u.id, anchor);
}

function msgContent(m) {
  const c = h('div', { class: 'msg-content' });
  if (S.editing === m.id) {
    const ta = h('textarea', { class: 'edit-box', rows: 1, maxlength: 2000 });
    ta.value = S.editDraft;
    ta.addEventListener('input', () => {
      S.editDraft = ta.value;
      autoGrow(ta);
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        saveEdit(m);
      }
    });
    c.append(ta, h('div', { class: 'edit-hint' }, 'Esc ile ', h('a', { onclick: cancelEdit }, 'iptal'), ' · Enter ile ', h('a', { onclick: () => saveEdit(m) }, 'kaydet')));
  } else if (m.text) {
    const t = h('div', { class: 'msg-text' });
    t.innerHTML = formatText(m.text) + (m.edited ? `<span class="edited" title="${esc(new Date(m.edited).toLocaleString('tr-TR'))}">(düzenlendi)</span>` : '');
    applyMessageStyle(t, nameStyleFor(m.name, m.ns));
    c.append(t);
  }
  if (m.image) {
    const img = h('img', { class: 'msg-img', src: m.image, alt: 'Resim', draggable: 'false' });
    if (m.imageW && m.imageH) {
      // Yer önceden ayrılsın (resim yüklenince sohbet zıplamasın)
      img.style.aspectRatio = `${m.imageW} / ${m.imageH}`;
      img.style.width = `min(100%, ${m.imageW}px, ${Math.round((280 * m.imageW) / m.imageH)}px)`;
    }
    img.addEventListener('click', () => openLightbox(m.image, m.name));
    c.append(img);
  } else if (m.imageExpired) {
    c.append(h('div', { class: 'msg-img-gone' }, 'Resim artık sunucuda tutulmuyor (çok eski).'));
  }
  extraContent(m, c);
  const reacts = Object.entries(m.reactions || {});
  if (reacts.length) {
    const row = h('div', { class: 'msg-reacts' });
    for (const [em, names] of reacts) {
      const mine = names.includes(S.myName);
      row.append(
        h(
          'button',
          { type: 'button', class: `react ${mine ? 'mine' : ''}`, title: `${names.join(', ')} ${em} ile tepki verdi${mine ? ' · geri almak için tıkla' : ''}`, onclick: () => react(m.id, em) },
          h('span', { class: 'react-emoji' }, em),
          h('span', { class: 'react-n' }, String(names.length))
        )
      );
    }
    const add = h('button', { type: 'button', class: 'react add', title: 'Tepki ekle' });
    add.innerHTML = ICON.react;
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      openReactPicker(m.id, add);
    });
    row.append(add);
    c.append(row);
  }
  return c;
}

// Mesajın üzerine gelince sağ üstte çıkan araç çubuğu
function msgTools(m) {
  const tools = h('div', { class: 'msg-tools' });
  const btn = (title, html, fn, cls = '') => {
    const b = h('button', { type: 'button', class: `mt-btn ${cls}`, title });
    b.innerHTML = html;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn(e, b);
    });
    tools.append(b);
  };
  for (const em of QUICK_REACTS.slice(0, 2)) btn(`${em} ile tepki ver`, `<span class="mt-emoji">${em}</span>`, () => react(m.id, em)); // dar panelde ismi kapatmasın
  btn('Tepki ekle', ICON.react, (e, b) => openReactPicker(m.id, b));
  tools.append(h('span', { class: 'mt-sep' }));
  btn('Yanıtla', ICON.reply, () => startReply(m));
  if (isMineMsg(m)) btn('Düzenle', ICON.edit, () => startEdit(m));
  else if (can('manageMessages')) btn('Sil (yetkili)', ICON.trash, (e) => deleteMsg(m, e.shiftKey), 'danger');
  btn('Diğer (sağ tık)', ICON_MORE, (e, b) => {
    const r = b.getBoundingClientRect();
    msgMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {} }, m);
  });
  return tools;
}
const ICON_MORE = '<svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/></svg>';
// Mesaja sağ tıklayınca (Discord'daki gibi)
function msgMenu(e, m) {
  e.preventDefault();
  const mine = isMineMsg(m);
  showCtx(e, [
    { html: `<div class="ctx-react">${QUICK_REACTS.concat(['🔥', '🎉']).map((x) => `<button type="button" data-em="${x}">${x}</button>`).join('')}</div>` },
    { label: 'Yanıtla', run: () => startReply(m) },
    mine && m.text !== undefined && !m.poll && !m.wheel && !m.teams && { label: 'Düzenle', run: () => startEdit(m) },
    (mine || can('manageMessages')) && { label: m.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', run: () => send({ t: 'pin', id: m.id, on: !m.pinned, channelId: chatChannel() }) },
    m.text && {
      label: 'Metni kopyala',
      run: () => {
        navigator.clipboard.writeText(m.text);
        toast('Mesaj kopyalandı');
      },
    },
    m.image && { label: 'Resmi aç', run: () => openLightbox(m.image, m.name) },
    (mine || can('manageMessages')) && '-',
    (mine || can('manageMessages')) && { label: mine ? 'Mesajı sil' : 'Mesajı sil (yetkili)', danger: true, run: () => deleteMsg(m) },
  ]);
  for (const b of document.querySelectorAll('#ctx .ctx-react button'))
    b.addEventListener('click', () => {
      hideCtx();
      react(m.id, b.dataset.em);
    });
}
const react = (id, emoji) => send({ t: 'react', id, emoji, channelId: chatChannel() });

const reactPop = h('div', { class: 'react-pop hidden' });
document.body.append(reactPop);
let reactFor = null;
function openReactPicker(id, anchor) {
  reactFor = id;
  if (!reactPop.childElementCount) {
    reactPop.append(h('div', { class: 'react-pop-head' }, 'Tepki ver'));
    const grid = h('div', { class: 'react-grid' });
    for (const em of EMOJIS)
      grid.append(
        h(
          'button',
          {
            type: 'button',
            class: 'emoji',
            onclick: () => {
              react(reactFor, em);
              reactPop.classList.add('hidden');
            },
          },
          em
        )
      );
    reactPop.append(grid);
  }
  reactPop.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const pr = reactPop.getBoundingClientRect();
  reactPop.style.left = Math.max(8, Math.min(r.right - pr.width, innerWidth - pr.width - 8)) + 'px';
  let top = r.top - pr.height - 6;
  if (top < 8) top = Math.min(r.bottom + 6, innerHeight - pr.height - 8);
  reactPop.style.top = top + 'px';
}
document.addEventListener('mousedown', (e) => !e.target.closest('.react-pop') && reactPop.classList.add('hidden'));

// ---------- Yanıt ----------
function startReply(m) {
  S.replyTo = { id: m.id, name: m.name, text: m.text || '', image: !!m.image };
  if (S.editing) cancelEdit(false);
  renderComposerExtras();
  $('#chat-input').focus();
}
function replyQuote(r) {
  const q = h(
    'div',
    { class: 'msg-reply', title: 'Asıl mesaja git', onclick: () => jumpToMsg(r.id) },
    avatar(r.name, 'tiny'),
    h('span', { class: 'mr-name' }, r.name),
    h('span', { class: 'mr-text' }, r.text ? r.text.replace(/\s+/g, ' ') : r.image ? '📷 Resim' : '…')
  );
  q.querySelector('.mr-name').style.color = colorFor(r.name);
  return q;
}
function jumpToMsg(id) {
  const el = $(`#chat-log [data-id="${CSS.escape(id)}"]`);
  if (!el) return toast('Mesaj bulunamadı', 'Silinmiş ya da çok eski olabilir.');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ---------- Düzenleme ve silme ----------
function startEdit(m) {
  S.editing = m.id;
  S.editDraft = m.text || '';
  refreshChat();
}
function focusEditBox() {
  const ta = $('#chat-log .edit-box');
  if (!ta) return;
  autoGrow(ta);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  ta.closest('.msg')?.scrollIntoView({ block: 'nearest' });
}
function cancelEdit(focusInput = true) {
  S.editing = null;
  S.editDraft = '';
  refreshChat();
  if (focusInput) $('#chat-input').focus();
}
function saveEdit(m) {
  const v = S.editDraft.trim();
  if (!v && !m.image) {
    // Discord'daki gibi: metni tamamen silip kaydedersen mesajı silmek ister misin diye sorar
    cancelEdit(false);
    return deleteMsg(m);
  }
  if (v !== (m.text || '')) send({ t: 'chatEdit', id: m.id, text: v, channelId: chatChannel() });
  cancelEdit();
}
function deleteMsg(m, now = false) {
  const go = () => send({ t: 'chatDelete', id: m.id, channelId: chatChannel() });
  if (now) return go();
  confirmBox('Mesajı sil', 'Bu mesaj kanaldaki herkes için silinecek. İpucu: Sil düğmesine Shift tuşuna basılıyken tıklarsan sormadan siler.', 'Sil', go);
}

// ---------- Resimler ----------
function openLightbox(src, who) {
  $('#lightbox-img').src = src;
  const ext = ((src.match(/^data:image\/(\w+)/) || [])[1] || 'png').replace('jpeg', 'jpg');
  const a = $('#lightbox-save');
  a.href = src;
  a.download = `kanki-${String(who || 'resim').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_')}-${Date.now()}.${ext}`;
  showModal('lightbox');
}
const IMG_LIMIT = 2.2 * 1024 * 1024; // sunucu sınırının altında kalsın
const blobToDataUrl = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
// Resmi gönderilecek boyuta getirir: en uzun kenar 1920 px, WebP; hareketli GIF'ler küçükse olduğu gibi gider
async function prepareImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type) || /svg/.test(file.type)) return uploadFile(file); // resim değilse dosya olarak gönder
  if (!S.channelId) return;
  if (file.size > 40 * 1024 * 1024) return uploadFile(file);
  try {
    const bmp = await createImageBitmap(file);
    let w = bmp.width;
    let hh = bmp.height;
    let data = null;
    if (file.type === 'image/gif' && file.size <= IMG_LIMIT) {
      data = await blobToDataUrl(file);
    } else {
      let scale = Math.min(1, 1920 / Math.max(w, hh));
      let q = 0.9;
      for (let i = 0; i < 6; i++) {
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(hh * scale));
        const c = new OffscreenCanvas(cw, ch);
        c.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
        const blob = await c.convertToBlob({ type: 'image/webp', quality: q });
        if (blob.size <= IMG_LIMIT || i === 5) {
          data = await blobToDataUrl(blob);
          w = cw;
          hh = ch;
          break;
        }
        q = Math.max(0.5, q - 0.1);
        scale *= 0.8;
      }
    }
    bmp.close?.();
    if (!data || data.length > 3 * 1024 * 1024) return toast('Resim gönderilemedi', 'Daha küçük bir resim dene.', 'err');
    S.pendingImage = { data, w, h: hh, name: file.name || 'Yapıştırılan resim', kb: Math.round((data.length * 0.75) / 1024) };
    renderComposerExtras();
    $('#chat-input').focus();
  } catch (e) {
    log('image', e);
    toast('Resim açılamadı', 'Dosya bozuk ya da desteklenmiyor olabilir.', 'err');
  }
}

// Mesaj kutusunun üstü: yanıtlanan mesaj ve eklenen resim
function renderComposerExtras() {
  const box = $('#compose-extra');
  const chatLog = $('#chat-log');
  const atBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 60;
  box.innerHTML = '';
  const xBtn = (title, fn) => {
    const b = h('button', { type: 'button', class: 'cx-x', title, onclick: fn });
    b.innerHTML = ICON_X;
    return b;
  };
  if (S.replyTo) {
    const bar = h('div', { class: 'reply-bar' }, h('span', { class: 'rb-text' }, h('b', { style: `color:${colorFor(S.replyTo.name)}` }, S.replyTo.name), ' kişisine yanıt veriyorsun'));
    bar.prepend(svgEl(ICON.reply));
    bar.append(
      xBtn('Yanıtı iptal et (Esc)', () => {
        S.replyTo = null;
        renderComposerExtras();
      })
    );
    box.append(bar);
  }
  if (S.pendingImage) {
    const p = S.pendingImage;
    const card = h(
      'div',
      { class: 'attach-card' },
      h('img', { src: p.data, alt: '' }),
      h('div', { class: 'attach-info' }, h('div', { class: 'attach-name' }, p.name), h('div', { class: 'attach-meta' }, `${p.w}×${p.h} · ${p.kb} KB · Enter ile gönder`))
    );
    card.append(
      xBtn('Resmi kaldır', () => {
        S.pendingImage = null;
        renderComposerExtras();
      })
    );
    box.append(card);
  }
  box.classList.toggle('hidden', !box.childElementCount);
  const ch = S.channels.find((c) => c.id === chatChannel());
  $('#chat-input').placeholder = S.pendingImage ? 'Not ekle (isteğe bağlı)' : S.replyTo ? 'Yanıtını yaz' : ch?.type === 'text' ? `#${ch.name} kanalına yaz` : `${ch?.name || 'Kanal'} sohbetine yaz`;
  renderComposerLock(); // zaman aşımı, salt okunur, yetki yok, yavaş mod (admin.js)
  if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
}

function sendChat() {
  const inp = $('#chat-input');
  const v = inp.value.trim();
  if (!v && !S.pendingImage) return;
  if (!S.ws || S.ws.readyState !== 1) return toast('Mesaj gönderilemedi', 'Sunucuya bağlı değilsin.', 'err');
  const blk = chatBlock(); // zaman aşımı, salt okunur, yavaş mod (admin.js)
  if (blk) return toast(blk.kind === 'slow' ? 'Yavaş mod' : 'Mesaj gönderilemiyor', blk.text, 'err', 3000);
  if (S.pendingImage && !can('attachFiles')) return toast('Resim gönderemezsin', 'Bu sunucuda dosya ve resim gönderme yetkin yok.', 'err');
  const msg = { t: 'chat', text: v, channelId: chatChannel() };
  if (S.pendingImage) Object.assign(msg, { image: S.pendingImage.data, imageW: S.pendingImage.w, imageH: S.pendingImage.h });
  if (S.replyTo) msg.replyTo = S.replyTo.id;
  send(msg);
  noteChatSent(msg.channelId);
  inp.value = '';
  autoGrow(inp);
  S.pendingImage = null;
  S.replyTo = null;
  renderComposerExtras();
}

function autoGrow(el) {
  const box = $('#chat-log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  if (!el.value) {
    el.style.height = '';
    el.style.overflowY = 'hidden';
  } else {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 200) + 'px';
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden'; // kaydırma çubuğu sadece gerekince
  }
  if (atBottom) box.scrollTop = box.scrollHeight; // kutu büyüyünce son mesajlar kaybolmasın
}
$('#chat-input').addEventListener('input', () => autoGrow($('#chat-input')));
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing) return; // @bahsetme önerisi Enter'ı kullandıysa
  const inp = e.target;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  } else if (e.key === 'Escape' && (S.replyTo || S.pendingImage)) {
    e.stopPropagation();
    S.replyTo = null;
    S.pendingImage = null;
    renderComposerExtras();
  } else if (e.key === 'ArrowUp' && !inp.value) {
    // Discord'daki gibi: boş kutuda ↑ son mesajını düzenler
    const last = [...(S.chat.get(chatChannel()) || [])].reverse().find((m) => isMineMsg(m) && m.text);
    if (last) {
      e.preventDefault();
      startEdit(last);
    }
  }
});
$('#chat-input').addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file');
  if (item) {
    e.preventDefault();
    prepareImage(item.getAsFile());
  }
});
$('#btn-attach').addEventListener('click', (e) => attachMenu(e));
$('#file-input').addEventListener('change', (e) => {
  prepareImage(e.target.files[0]);
  e.target.value = '';
});
// Sohbet paneline sürükle-bırak
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const chatAside = $('aside.chat');
let dragDepth = 0;
chatAside.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  chatAside.classList.add('drop-target');
});
chatAside.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    chatAside.classList.remove('drop-target');
  }
});
chatAside.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
chatAside.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  chatAside.classList.remove('drop-target');
  prepareImage(e.dataTransfer.files[0]);
});
// Pencerenin başka yerine bırakılan dosya uygulamayı dosyaya yönlendirmesin
window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
window.addEventListener('drop', (e) => hasFiles(e) && e.preventDefault());

// =====================================================================
//  Profil: fotoğraf ve özel durum yazısı
// =====================================================================
function refreshAvatars() {
  renderProfilePreview();
  if (!S.myId) return;
  const me = avatar(S.myName);
  me.id = 'me-avatar';
  me.dataset.av = S.myId;
  $('#me-avatar').replaceWith(me);
  renderAll();
  renderMembers();
  refreshChat();
}
function renderProfilePreview() {
  const card = $('#pe-card');
  if (!card) return;
  card.innerHTML = '';
  const name = S.myName || settings.nick || 'Sen';
  const pres = effectivePresence();
  const banner = h('div', { class: 'pf-banner' });
  banner.style.background = colorFor(name);
  const big = avatar(name);
  if (settings.avatar) {
    big.textContent = '';
    big.classList.add('has-img');
    big.style.backgroundImage = `url("${settings.avatar}")`;
  }
  big.classList.add('big');
  big.append(h('span', { class: `status-dot ${pres}` }));
  card.append(
    banner,
    big,
    h(
      'div',
      { class: 'pf-body' },
      h('div', { class: 'pf-name' }, nameEl(name, hasNameStyle(settings.nameStyle) ? settings.nameStyle : null)),
      h('div', { class: `pf-custom ${settings.statusText ? '' : 'muted'}` }, settings.statusText || 'Durum yazısı yok'),
      h('div', { class: 'pf-status' }, h('span', { class: `status-dot inline ${pres}` }), PRESENCE[pres].label)
    )
  );
  $('#btn-avatar-remove').disabled = !settings.avatar;
  $('#pe-nick').textContent = name;
}
// Seçilen fotoğrafın ortasından kare kesip 160 px'e küçültür (birkaç KB)
async function pickAvatar(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast('Bir resim seç', 'PNG, JPG, GIF ya da WebP.');
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(bmp.width, bmp.height);
    const c = new OffscreenCanvas(160, 160);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
    const data = await blobToDataUrl(await c.convertToBlob({ type: 'image/webp', quality: 0.86 }));
    if (data.length > 58 * 1024) return toast('Fotoğraf çok büyük', 'Başka bir fotoğraf dene.', 'err');
    setAvatar(data);
  } catch (e) {
    log('avatar', e);
    toast('Fotoğraf açılamadı', 'Dosya bozuk ya da desteklenmiyor olabilir.', 'err');
  }
}
function setAvatar(data) {
  settings.avatar = data || null;
  saveSettings();
  if (S.myId) {
    if (data) S.avatars.set(S.myId, data);
    else S.avatars.delete(S.myId);
  }
  send({ t: 'profile', avatar: data || null });
  refreshAvatars();
}
function setStatusText(v) {
  v = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (v === (settings.statusText || '')) return;
  settings.statusText = v;
  saveSettings();
  send({ t: 'profile', statusText: v });
  if ($('#set-status-text') !== document.activeElement) $('#set-status-text').value = v;
  renderControls();
  renderMembers();
  renderProfilePreview();
}
function promptStatusText() {
  inlinePrompt('Özel durum', settings.statusText, setStatusText, true, 'Arkadaşların bunu adının altında görür. Boş bırakırsan kaldırılır.', {
    placeholder: 'Ör. 🎮 Oyun oynuyor',
    maxLength: 80,
    okLabel: 'Kaydet',
  });
}
$('#btn-avatar-pick').addEventListener('click', () => $('#avatar-file').click());
$('#avatar-file').addEventListener('change', (e) => {
  pickAvatar(e.target.files[0]);
  e.target.value = '';
});
$('#btn-avatar-remove').addEventListener('click', () => setAvatar(null));
let statusTimer = null;
$('#set-status-text').addEventListener('input', (e) => {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => setStatusText(e.target.value), 700);
});
$('#set-status-text').addEventListener('change', (e) => setStatusText(e.target.value));

// =====================================================================
//  Kamera
// =====================================================================
function cameraConstraints() {
  const dev = settings.cameraId && settings.cameraId !== 'default' ? { deviceId: { exact: settings.cameraId } } : {};
  return { video: { ...dev, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false };
}
function cameraError(e) {
  log('camera', e);
  const msg =
    e.name === 'NotAllowedError'
      ? S.platform === 'darwin'
        ? 'Sistem Ayarları › Gizlilik ve Güvenlik › Kamera bölümünden Kanki’ye izin ver.'
        : 'Windows Ayarları › Gizlilik › Kamera bölümünden masaüstü uygulamalarına izin ver.'
      : e.name === 'NotFoundError' || e.name === 'OverconstrainedError'
        ? 'Bağlı bir kamera bulunamadı. Ayarlar › Ses ve görüntü bölümünden kamerayı seç.'
        : 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.';
  toast('Kamera açılamadı', msg, 'err', 8000);
}
async function toggleCamera() {
  const cur = myCamera();
  if (cur) return removeShare(cur.id);
  if (!S.channelId) return;
  if (!can('camera')) return toast('Kamera açamazsın', 'Bu sunucuda kamera yetkin yok.', 'err');
  try {
    await kanki.ensureCamera?.();
  } catch {}
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
  } catch (e) {
    return cameraError(e);
  }
  if (!S.channelId || myCamera()) return stream.getTracks().forEach((t) => t.stop());
  addShare(stream, { fps: 30, res: 720, bitrate: 1500, hint: 'motion', kind: 'camera' }, 'Kamera');
}
// Ayarlardaki kamera önizlemesi
let camPreview = null;
async function startCamPreview() {
  stopCamPreview();
  try {
    await kanki.ensureCamera?.();
    camPreview = await navigator.mediaDevices.getUserMedia(cameraConstraints());
    $('#cam-preview').srcObject = camPreview;
    $('#cam-preview-box').classList.add('on');
    $('#btn-cam-test').textContent = 'Önizlemeyi kapat';
  } catch (e) {
    cameraError(e);
  }
}
function stopCamPreview() {
  camPreview?.getTracks().forEach((t) => t.stop());
  camPreview = null;
  $('#cam-preview').srcObject = null;
  $('#cam-preview-box').classList.remove('on');
  $('#btn-cam-test').textContent = 'Kamerayı dene';
}
$('#btn-cam-test').addEventListener('click', () => (camPreview ? stopCamPreview() : startCamPreview()));
$('#set-camera').addEventListener('change', async (e) => {
  settings.cameraId = e.target.value;
  saveSettings();
  if (camPreview) startCamPreview();
  if (myCamera()) {
    removeShare(myCamera().id);
    await toggleCamera();
  }
});
// Ayarlar kapanınca önizleme kamerası da kapansın
new MutationObserver(() => $('#settings').classList.contains('hidden') && camPreview && stopCamPreview()).observe($('#settings'), { attributes: true, attributeFilter: ['class'] });
$('#btn-camera').addEventListener('click', toggleCamera);

// =====================================================================
//  Sahne alt çubuğu (Discord'daki arama kontrolleri) ve sohbeti gizle/göster
// =====================================================================
function renderCallBar() {
  const bar = $('#call-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', !S.channelId);
  const cam = myCamera();
  const screens = myScreenShares().length;
  const set = (id, icon, title, cls) => {
    const b = $(id);
    if (b.dataset.icon !== icon) {
      b.innerHTML = icon;
      b.dataset.icon = icon;
    }
    b.title = title;
    b.className = `cb-btn ${cls || ''}`;
  };
  set('#cb-camera', cam ? ICON.camera : ICON.cameraOff, cam ? 'Kamerayı kapat' : 'Kamerayı aç', cam ? 'on' : '');
  set('#cb-share', ICON.screen, screens ? 'Bir ekran daha paylaş' : 'Ekranını paylaş', screens ? 'on' : '');
  if (!S.channelId) $('#sfx-pop').classList.add('hidden');
  set('#cb-sfx', ICON_SFX, 'Ses efektleri', $('#sfx-pop').classList.contains('hidden') ? '' : 'on');
  set('#cb-watch', ICON_WATCH, 'Birlikte izle: YouTube ya da video dosyası', myWatchShare() ? 'on' : '');
  set('#cb-mic', S.muted ? ICON.micOff : ICON.mic, S.muted ? 'Mikrofonu aç (Ctrl+Shift+M)' : 'Mikrofonu kapat (Ctrl+Shift+M)', S.muted ? 'off' : '');
  set('#cb-deafen', S.deafened ? ICON.headOff : ICON.head, S.deafened ? 'Sesi aç (Ctrl+Shift+D)' : 'Sesi kapat (Ctrl+Shift+D)', S.deafened ? 'off' : '');
  set('#cb-leave', ICON.power, 'Bağlantıyı kes', 'leave');
  $('#cb-share').disabled = screens >= MAX_SHARES;
  gateCallBar(); // yetkisi olmayan özellikler gizlenir, kilitler görünür (admin.js)
}
$('#cb-camera').addEventListener('click', toggleCamera);
$('#cb-share').addEventListener('click', openPicker);
$('#cb-mic').addEventListener('click', toggleMute);
$('#cb-deafen').addEventListener('click', toggleDeafen);
$('#cb-leave').addEventListener('click', disconnect);
$('#cb-sfx').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSfxPop();
});

function renderChatToggle() {
  const b = $('#btn-toggle-chat');
  if (!b) return;
  $('.layout').classList.toggle('chat-hidden', !!settings.chatHidden);
  b.classList.toggle('active', !settings.chatHidden);
  b.title = settings.chatHidden ? 'Sohbeti göster' : 'Sohbeti gizle (sahne genişler)';
  const badge = b.querySelector('.unread');
  badge.textContent = S.unread > 99 ? '99+' : String(S.unread);
  badge.classList.toggle('hidden', !settings.chatHidden || !S.unread);
}
$('#btn-toggle-chat').addEventListener('click', () => {
  settings.chatHidden = !settings.chatHidden;
  saveSettings();
  if (!settings.chatHidden) S.unread = 0;
  renderChatToggle();
  requestAnimationFrame(() => {
    renderStage(); // sahne genişledi/daraldı: kutular yeniden dizilsin
    if (!settings.chatHidden) $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
  });
});

// =====================================================================
//  Ses efektleri (soundboard): bastığın ses kanaldaki herkeste çalar.
//  Sunucu sadece sesin adını iletir; sesi her uygulama kendisi üretir (sfx.js).
// =====================================================================
const ICON_SFX =
  '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12Z"/><path d="m19 2 1.1 2.4 2.4 1.1-2.4 1.1L19 9l-1.1-2.4-2.4-1.1 2.4-1.1L19 2Zm.5 11 .6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z"/></svg>';
const sfxSupported = () => !!S.features?.has('sfx');

function sfxCtx() {
  if (!sfx.ctx) {
    sfx.ctx = new AudioContext({ latencyHint: 'interactive' });
    applySfxOutput();
  }
  if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
  return sfx.ctx;
}
// Efektler de seçili hoparlörden çıksın
function applySfxOutput() {
  if (!sfx.ctx?.setSinkId) return;
  const id = settings.outputId && settings.outputId !== 'default' ? settings.outputId : '';
  sfx.ctx.setSinkId(id).catch(() => {});
}
// Ne kadar yüksek çalsın: efekt sesi ayarı × o kişiye verdiğin ses. Hoparlörün kapalıysa ya da kişiyi susturduysan çalmaz.
function sfxGain(userId) {
  if (S.deafened) return 0;
  if (userId !== S.myId && settings.localMutes[userName(userId)]) return 0;
  const uv = userId === S.myId ? 100 : settings.userVolumes[volKey(userId)] ?? 100;
  return ((settings.sfxVolume ?? 50) / 100) * Math.min(1, uv / 100);
}
async function playSfxLocal(key, sid, gain) {
  if (!(gain > 0)) return;
  const buf = await KankiSfx.builtin(sid);
  if (!buf) return;
  const ctx = sfxCtx();
  // Aynı kişinin önceki sesi kısılıp kesilir: üst üste binip gürültüye dönmesin
  const prev = sfx.playing.get(key);
  if (prev) {
    try {
      prev.g.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      prev.src.stop(ctx.currentTime + 0.08);
    } catch {}
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(ctx.destination);
  src.start();
  const entry = { src, g };
  sfx.playing.set(key, entry);
  src.onended = () => sfx.playing.get(key) === entry && sfx.playing.delete(key);
}
function stopAllSfx() {
  for (const p of sfx.playing.values()) {
    try {
      p.src.stop();
    } catch {}
  }
  sfx.playing.clear();
}
// Kim hangi sesi çaldı: kartında ve kenar çubuğunda ismin yanında kısa süre görünür
function sfxNow(userId) {
  const a = sfx.active.get(userId);
  if (!a) return null;
  const age = Date.now() - a.at;
  if (age > SFX_SHOW_MS) {
    sfx.active.delete(userId);
    return null;
  }
  return { it: SFX_BY_ID.get(a.sid), age };
}
function sfxFloatEl(sf) {
  return h('div', { class: 'sfx-float', style: `animation-delay:-${sf.age}ms` }, h('span', { class: 'sfx-float-emo' }, sf.it.emoji), h('span', { class: 'sfx-float-name' }, sf.it.name));
}
function markSfx(userId, sid) {
  sfx.active.set(userId, { sid, at: Date.now() });
  const sf = sfxNow(userId);
  const card = $(`#participants .p-card[data-uid="${userId}"]`);
  if (card) {
    card.querySelector('.sfx-float')?.remove();
    card.append(sfxFloatEl(sf));
  }
  for (const av of $$(`.user [data-av="${userId}"]`)) {
    const badges = av.closest('.user')?.querySelector('.badges');
    if (!badges) continue;
    badges.querySelector('.sfx-badge')?.remove();
    badges.prepend(h('span', { class: 'sfx-badge', title: `${sf.it.name} çaldı` }, sf.it.emoji));
  }
  setTimeout(() => {
    if (sfxNow(userId)) return; // bu arada yeni bir ses çalındı
    $(`#participants .p-card[data-uid="${userId}"] .sfx-float`)?.remove();
    for (const av of $$(`.user [data-av="${userId}"]`)) av.closest('.user')?.querySelector('.sfx-badge')?.remove();
  }, SFX_SHOW_MS + 50);
}

function sendSfx(sid) {
  if (!S.channelId || !SFX_BY_ID.has(sid)) return;
  if (!can('useSoundboard')) return toast('Ses efektleri kapalı', 'Bu sunucuda ses efekti yetkin yok.', 'err');
  if (micLockReason()) return toast('Ses efekti çalamazsın', micLockReason(), 'err');
  const now = Date.now();
  if (now < sfx.coolUntil) return; // spam koruması (sunucu da kontrol eder)
  sfx.coolUntil = now + SFX_COOLDOWN;
  if (sfxSupported()) send({ t: 'sfx', sid });
  markSfx(S.myId, sid);
  logEvent(SFX_BY_ID.get(sid).emoji, `${SFX_BY_ID.get(sid).name} sesini çaldın`, { dim: true });
  playSfxLocal(S.myId, sid, sfxGain(S.myId));
  const pop = $('#sfx-pop');
  pop.classList.remove('cool');
  void pop.offsetWidth; // animasyon baştan başlasın
  pop.classList.add('cool');
  for (const t of $$('.sfx-tile', pop)) t.classList.toggle('hit', t.dataset.sid === sid);
  clearTimeout(sfx.coolTimer);
  sfx.coolTimer = setTimeout(() => {
    pop.classList.remove('cool');
    for (const t of $$('.sfx-tile.hit', pop)) t.classList.remove('hit');
  }, SFX_COOLDOWN);
}
function onSfx(m) {
  if (!SFX_BY_ID.has(m.sid) || m.from === S.myId) return;
  markSfx(m.from, m.sid);
  logEvent(SFX_BY_ID.get(m.sid).emoji, `${userName(m.from)} ses efekti çaldı: ${SFX_BY_ID.get(m.sid).name}`);
  playSfxLocal(m.from, m.sid, sfxGain(m.from));
}
// Sağ tık: sadece kendin dinle (kanala gitmez, hoparlörün kapalı olsa da çalar)
const previewSfx = (sid) => playSfxLocal('preview', sid, Math.max(0.3, (settings.sfxVolume ?? 50) / 100));

function renderSfxPop() {
  const pop = $('#sfx-pop');
  const grid = $('#sfx-builtin');
  if (!grid.childElementCount)
    for (const it of KankiSfx.BUILTIN)
      grid.append(
        h(
          'button',
          {
            class: 'sfx-tile',
            'data-sid': it.sid,
            title: `${it.name} — kanaldaki herkes duyar`,
            onclick: () => sendSfx(it.sid),
            oncontextmenu: (e) => {
              e.preventDefault();
              showCtx(e, [{ label: `${it.emoji} ${it.name}: sadece ben dinle`, run: () => previewSfx(it.sid) }]);
            },
          },
          h('span', { class: 'sfx-emo' }, it.emoji),
          h('span', { class: 'sfx-name' }, it.name)
        )
      );
  $('#sfx-old', pop).classList.toggle('hidden', !S.myId || sfxSupported());
  const v = settings.sfxVolume ?? 50;
  $('#sfx-vol').value = v;
  $('#sfx-vol-v').textContent = v ? `%${v}` : 'Kapalı';
}
function toggleSfxPop(force) {
  const pop = $('#sfx-pop');
  const open = force ?? pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  if (open) renderSfxPop();
  renderCallBar();
}
document.addEventListener('mousedown', (e) => {
  if (!$('#sfx-pop').classList.contains('hidden') && !e.target.closest('#sfx-pop, #cb-sfx, #ctx')) toggleSfxPop(false);
});
window.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#sfx-pop').classList.contains('hidden') && toggleSfxPop(false));
$('#sfx-vol').addEventListener('input', (e) => {
  settings.sfxVolume = Number(e.target.value);
  saveSettings();
  $('#sfx-vol-v').textContent = settings.sfxVolume ? `%${settings.sfxVolume}` : 'Kapalı';
  for (const p of sfx.playing.values()) p.g.gain.value = settings.sfxVolume / 100;
});

// =====================================================================
//  Yazı stili: isimler için yazı tipi, efekt ve renkler (Ayarlar › Yazı stili)
// =====================================================================
const NAME_FONTS = [
  ['default', 'Varsayılan'],
  ['audiowide', 'Teknolojik'],
  ['pixel', 'Piksel'],
  ['pacifico', 'El yazısı'],
  ['bangers', 'Çizgi roman'],
  ['righteous', 'Retro'],
  ['lobster', 'Şık'],
  ['caveat', 'Kalem'],
  ['glitch', 'Glitch'],
  ['cinzel', 'Klasik'],
  ['fredoka', 'Yumuşak'],
  ['mono', 'Terminal'],
];
const NAME_FX = [
  ['none', 'Düz'],
  ['gradient', 'Gradyan'],
  ['neon', 'Neon'],
  ['shimmer', 'Parıltı'],
  ['rainbow', 'Gökkuşağı'],
  ['pulse', 'Nabız'],
  ['fire', 'Ateş'],
];
const NS_PRESETS = [
  ['#22d47e', '#3d8bfd'],
  ['#ff4d5e', '#f0b232'],
  ['#a855f7', '#ec4899'],
  ['#06b6d4', '#22c55e'],
  ['#f97316', '#eab308'],
  ['#3d8bfd', '#a855f7'],
  ['#ffffff', '#9fb0a8'],
];
const NS_DEFAULT = { font: 'default', effect: 'none', c1: '', c2: '', inMessages: false };
const myNameStyle = () => ({ ...NS_DEFAULT, ...(settings.nameStyle || {}) });
const hasNameStyle = (st) => !!st && (st.font !== 'default' || st.effect !== 'none' || !!st.c1);
const styleOfUser = (u) => (!u ? null : u.id === S.myId ? (hasNameStyle(settings.nameStyle) ? settings.nameStyle : null) : u.nameStyle || null);
// Kişi çevrimiçiyse güncel stili, değilse mesajla saklanan stili kullan
function nameStyleFor(name, fallback = null) {
  if (name && name === S.myName) return hasNameStyle(settings.nameStyle) ? settings.nameStyle : null;
  const u = [...S.users.values()].find((x) => x.name === name);
  return u ? styleOfUser(u) : fallback;
}
function applyNameStyle(el, st, name) {
  el.className = el.className.replace(/\bns(-[fx]-\S+)?\b/g, '').trim();
  if (!hasNameStyle(st)) return el;
  const f = NAME_FONTS.some(([id]) => id === st.font) ? st.font : 'default';
  const fx = NAME_FX.some(([id]) => id === st.effect) ? st.effect : 'none';
  el.classList.add('ns', `ns-f-${f}`, `ns-x-${fx}`);
  el.style.setProperty('--n1', st.c1 || colorFor(name || '?'));
  el.style.setProperty('--n2', st.c2 || '#22d47e');
  return el;
}
const nameEl = (name, st, cls = '') => applyNameStyle(h('span', { class: cls }, name), st, name);
// Mesaj metni: kişi "mesajlarımda da kullan" dediyse yazı tipi ve 1. renk (efektsiz, okunaklı kalsın)
function applyMessageStyle(textEl, st) {
  if (!st?.inMessages) return;
  if (st.font && st.font !== 'default') textEl.classList.add(`ns-f-${st.font}`, 'ns-msg');
  if (st.c1) textEl.style.color = st.c1;
}
function renderMeName() {
  const el = $('#me-name');
  if (!el || !S.myName) return;
  el.innerHTML = '';
  el.append(nameEl(S.myName, styleOfUser(S.users.get(S.myId)) || (hasNameStyle(settings.nameStyle) ? settings.nameStyle : null)));
}

// ---------- Ayarlar sekmesi ----------
let nsSendTimer = null;
function setNameStyle(patch) {
  const next = { ...myNameStyle(), ...patch };
  settings.nameStyle = hasNameStyle(next) || next.inMessages ? next : null;
  saveSettings();
  renderNameStyleUi();
  clearTimeout(nsSendTimer);
  nsSendTimer = setTimeout(() => {
    send({ t: 'profile', nameStyle: settings.nameStyle });
    if (S.myId) {
      renderMeName();
      renderTree();
      renderMembers();
      refreshChat();
    }
    renderProfilePreview();
  }, 300);
}
function renderNameStyleUi() {
  const st = myNameStyle();
  const name = S.myName || settings.nick || 'Kanki';
  const shown = hasNameStyle(st) ? st : null;
  // Önizleme: sohbet mesajı + üye listesi satırı
  const pv = $('#ns-preview');
  pv.innerHTML = '';
  const nm = nameEl(name, shown, 'msg-name');
  if (!shown) nm.style.color = colorFor(name);
  const txt = h('div', { class: 'msg-text' }, 'Selam! Yeni yazı stilim nasıl? ✨');
  applyMessageStyle(txt, st);
  pv.append(
    h('div', { class: 'ns-pv-label' }, 'Önizleme'),
    h('div', { class: 'msg ns-pv-msg' }, avatar(name), h('div', { class: 'msg-body' }, h('div', { class: 'msg-head' }, nm, h('span', { class: 'msg-time' }, 'şimdi')), txt)),
    h('div', { class: 'member ns-pv-member' }, withDot(avatar(name), { id: S.myId }), h('div', { class: 'member-text' }, h('div', { class: 'member-name' }, nameEl(name, shown)), settings.statusText ? h('div', { class: 'member-sub' }, settings.statusText) : null))
  );
  // Yazı tipleri: her biri kendi yazı tipiyle örnek gösterir
  const fonts = $('#ns-fonts');
  fonts.innerHTML = '';
  for (const [id, label] of NAME_FONTS)
    fonts.append(
      h(
        'button',
        { class: `ns-font ${st.font === id ? 'active' : ''}`, onclick: () => setNameStyle({ font: id }) },
        applyNameStyle(h('span', { class: 'ns-font-sample' }, 'Aa ' + name.slice(0, 10)), { ...st, font: id, effect: 'none', c1: st.c1 || '#dfe8e3' }, name),
        h('span', { class: 'ns-font-label' }, label)
      )
    );
  const fxBox = $('#ns-effects');
  fxBox.innerHTML = '';
  for (const [id, label] of NAME_FX)
    fxBox.append(
      h(
        'button',
        { class: `ns-fx ${st.effect === id ? 'active' : ''}`, onclick: () => setNameStyle({ effect: id }) },
        applyNameStyle(h('span', {}, label), { ...st, effect: id, font: 'default', c1: st.c1 || colorFor(name) }, name)
      )
    );
  $('#ns-c1').value = st.c1 || colorFor(name);
  $('#ns-c2').value = st.c2 || '#22d47e';
  const pr = $('#ns-presets');
  if (!pr.childElementCount)
    for (const [a, b] of NS_PRESETS) {
      const sw = h('button', { class: 'ns-preset', title: `${a} → ${b}`, onclick: () => setNameStyle({ c1: a, c2: b }) });
      sw.style.background = `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;
      pr.append(sw);
    }
  $('#ns-inmsg').checked = !!st.inMessages;
  syncNsMsgPerm();
}
// "Mesajlarımda da kullan" bir rol yetkisine bağlı (eski sunucularda serbest)
const nsMsgAllowed = () => !feat('perms') || can('styledMessages');
// Bir kerelik: "mesajlarımda da kullan" herkeste kapalı başlar (yetkisi olan kendisi açar)
if (!settings.nsMsgDefaultOff) {
  if (settings.nameStyle?.inMessages) {
    settings.nameStyle = { ...settings.nameStyle, inMessages: false };
    if (!hasNameStyle(settings.nameStyle)) settings.nameStyle = null;
  }
  settings.nsMsgDefaultOff = true;
  saveSettings();
}
function syncNsMsgPerm() {
  const ok = nsMsgAllowed();
  // Yetkisi yoksa seçenek kapalı kalır (sonradan yetki alırsa kendisi açar)
  if (!ok && myNameStyle().inMessages) return setNameStyle({ inMessages: false });
  const box = $('#ns-inmsg');
  box.checked = ok && !!myNameStyle().inMessages;
  box.disabled = !ok;
  box.closest('label').classList.toggle('locked', !ok);
  box.closest('label').title = ok ? '' : 'Bunun için “Süslü mesaj yazısı” yetkisi olan bir rol gerekir.';
  $('#ns-inmsg-why').classList.toggle('hidden', ok);
}
$('#ns-c1').addEventListener('input', (e) => setNameStyle({ c1: e.target.value }));
$('#ns-c2').addEventListener('input', (e) => setNameStyle({ c2: e.target.value }));
$('#ns-inmsg').addEventListener('change', (e) => setNameStyle({ inMessages: e.target.checked }));
$('#ns-reset').addEventListener('click', () => {
  settings.nameStyle = null;
  saveSettings();
  setNameStyle({ ...NS_DEFAULT });
});

// =====================================================================
//  Müzik botu: çalan şarkı çubuğu, kuyruk paneli, komutlar
// =====================================================================
const ICON_MUSIC = '<svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12Zm10-12v12h2V6h-2Z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6V6Z"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24"><path d="M3 6h12v2H3V6Zm0 5h12v2H3v-2Zm0 5h8v2H3v-2Zm14-2v-4h2v4h3l-4 5-4-5h3Z"/></svg>';
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};
const botUser = () => [...S.users.values()].find((u) => u.bot) || null;
const botHere = () => !!S.botState && !!S.channelId && S.botState.channelId === S.channelId;
const botCmd = (cmd, arg = '') => send({ t: 'botCmd', cmd, arg: String(arg) });
const botPosition = () => {
  const st = S.botState;
  if (!st?.current) return 0;
  const p = (st.position || 0) + (st.paused || st.loading ? 0 : (Date.now() - (st.at || Date.now())) / 1000);
  return st.current.duration ? Math.min(p, st.current.duration) : p;
};

function renderMusic() {
  const st = S.botState;
  const here = botHere();
  const cur = here ? st.current : null;
  // Sahne başlığındaki düğme: bot bu kanalda çalıyorsa yeşil
  const btn = $('#btn-music');
  btn.classList.toggle('hidden', !S.myId);
  btn.classList.toggle('playing', !!cur && !st.paused);
  // Çalan şarkı çubuğu
  const bar = $('#music-bar');
  const wasHidden = bar.classList.contains('hidden');
  bar.classList.toggle('hidden', !cur);
  // Çubuk açılıp kapanınca sahnenin yüksekliği değişir: kutular yeniden dizilsin
  if (wasHidden !== !cur) requestAnimationFrame(() => renderStage());
  if (cur) {
    const img = bar.querySelector('.mb-thumb');
    if (img.dataset.src !== (cur.thumbnail || '')) {
      img.dataset.src = cur.thumbnail || '';
      img.style.backgroundImage = cur.thumbnail ? `url("${cur.thumbnail.replace(/"/g, '%22')}")` : '';
    }
    bar.querySelector('.mb-title').textContent = cur.title;
    bar.querySelector('.mb-title').title = cur.title;
    bar.querySelector('.mb-by').textContent = `isteyen: ${cur.by}`;
    const pp = bar.querySelector('[data-act="pp"]');
    pp.innerHTML = st.paused ? ICON_PLAY : ICON_PAUSE;
    pp.title = st.paused ? 'Devam et (!devam)' : 'Duraklat (!duraklat)';
    bar.querySelector('.mb-queue-n').textContent = st.queueLength ? String(st.queueLength) : '';
    tickMusic();
  }
  if (!$('#music-pop').classList.contains('hidden')) renderMusicPop();
  renderStageBotCard();
}
function tickMusic() {
  const st = S.botState;
  if (!botHere() || !st.current) return;
  const bar = $('#music-bar');
  const pos = botPosition();
  const dur = st.current.duration || 0;
  bar.querySelector('.mb-time').textContent = st.loading ? 'yükleniyor…' : st.current.live ? `📻 canlı · ${fmtTime(pos)}` : dur ? `${fmtTime(pos)} / ${fmtTime(dur)}` : fmtTime(pos);
  const prog = bar.querySelector('.mb-progress');
  const shown = prog.dataset.drag ? Number(prog.dataset.drag) * dur : pos;
  if (prog.dataset.drag) bar.querySelector('.mb-time').textContent = `${fmtTime(shown)} / ${fmtTime(dur)}`;
  prog.querySelector('i').style.width = dur ? `${Math.min(100, (shown / dur) * 100)}%` : '0%';
  prog.classList.toggle('seekable', !!dur && !st.loading);
}
setInterval(tickMusic, 500);
// Çubuğa tıklayıp sürükleyerek şarkıyı ileri/geri sar (bırakınca bota !sar gider)
{
  const prog = $('#music-bar .mb-progress');
  const frac = (e) => {
    const r = prog.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  prog.addEventListener('pointerdown', (e) => {
    const dur = S.botState?.current?.duration || 0;
    if (!dur || S.botState.loading || e.button !== 0) return;
    prog.setPointerCapture(e.pointerId);
    prog.dataset.drag = String(frac(e));
    tickMusic();
  });
  prog.addEventListener('pointermove', (e) => {
    if (!prog.dataset.drag) return;
    prog.dataset.drag = String(frac(e));
    tickMusic();
  });
  const end = (e, send) => {
    if (!prog.dataset.drag) return;
    const dur = S.botState?.current?.duration || 0;
    const sec = Math.round(frac(e) * dur);
    delete prog.dataset.drag;
    if (send && dur) {
      botCmd('sar', sec);
      // Sunucudan yeni durum gelene kadar çubuk geri zıplamasın
      if (S.botState) Object.assign(S.botState, { position: sec, at: Date.now() });
    }
    tickMusic();
  };
  prog.addEventListener('pointerup', (e) => end(e, true));
  prog.addEventListener('pointercancel', (e) => end(e, false));
  prog.title = 'Tıkla ya da sürükle: ileri/geri sar';
}

function renderMusicPop() {
  const pop = $('#music-pop');
  const st = S.botState;
  const bot = botUser();
  const here = botHere();
  const ch = st?.channelId && S.channels.find((c) => c.id === st.channelId);
  pop.querySelector('.mp-where').textContent = !bot ? 'çalışmıyor' : here ? 'bu kanalda' : ch ? `${ch.name} kanalında` : 'boşta';
  pop.querySelector('.mp-nobot').classList.toggle('hidden', !!bot);
  pop.querySelector('#mp-form').classList.toggle('hidden', !bot);
  // Kuyruk
  const q = pop.querySelector('.mp-queue');
  q.innerHTML = '';
  if (here && st.current) {
    q.append(
      h(
        'div',
        { class: 'mp-row now' },
        h('span', { class: 'mp-idx' }, st.paused ? '⏸' : '▶'),
        h('span', { class: 'mp-t' }, st.current.title),
        h('span', { class: 'mp-d' }, st.current.duration ? fmtTime(st.current.duration) : 'canlı')
      )
    );
  }
  (here ? st.queue || [] : []).forEach((x, i) => {
    const rm = h('button', { class: 'mp-rm', title: 'Kuyruktan çıkar', onclick: () => botCmd('çıkar', i + 1) });
    rm.innerHTML = ICON_X;
    q.append(h('div', { class: 'mp-row' }, h('span', { class: 'mp-idx' }, String(i + 1)), h('span', { class: 'mp-t', title: `${x.title} · ${x.by}` }, x.title), h('span', { class: 'mp-d' }, x.duration ? fmtTime(x.duration) : ''), rm));
  });
  if (here && st.queueLength > (st.queue || []).length) q.append(h('div', { class: 'mp-more' }, `… ve ${st.queueLength - st.queue.length} şarkı daha`));
  if (!q.childElementCount) q.append(h('div', { class: 'mp-empty' }, bot ? (here ? 'Kuyruk boş. Yukarıdan şarkı ekle.' : 'Şarkı eklediğinde bot bu kanala gelir.') : ''));
  // Düğmeler
  const acts = pop.querySelector('.mp-actions');
  acts.classList.toggle('hidden', !bot);
  acts.querySelector('[data-cmd="join"]').classList.toggle('hidden', here);
  for (const k of ['shuffle', 'loop', 'clear', 'leave']) acts.querySelector(`[data-cmd="${k}"]`).classList.toggle('hidden', !here);
  acts.querySelector('[data-cmd="loop"]').classList.toggle('on', !!(here && st.loop));
  const vol = pop.querySelector('#mp-vol');
  pop.querySelector('.mp-vol').classList.toggle('hidden', !here);
  if (here && document.activeElement !== vol) vol.value = st.volume ?? 70;
}
function toggleMusicPop(force) {
  const pop = $('#music-pop');
  const open = force ?? pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  if (open) {
    renderMusicPop();
    setTimeout(() => $('#mp-input').focus(), 30);
  }
}
$('#btn-music').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMusicPop();
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#music-pop, #btn-music, #music-bar [data-act="list"]')) $('#music-pop').classList.add('hidden');
});
$('#mp-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#mp-input').value.trim();
  if (!v) return;
  botCmd('çal', v);
  $('#mp-input').value = '';
});
$$('#music-pop .mp-actions [data-cmd]').forEach((b) => b.addEventListener('click', () => botCmd(b.dataset.cmd === 'leave' ? 'ayrıl' : b.dataset.cmd === 'join' ? 'gel' : b.dataset.cmd)));
let volTimer = null;
$('#mp-vol').addEventListener('input', (e) => {
  clearTimeout(volTimer);
  volTimer = setTimeout(() => botCmd('ses', e.target.value), 250);
});
(function buildMusicBar() {
  const bar = $('#music-bar');
  const set = (act, icon, title, fn) => {
    const b = bar.querySelector(`[data-act="${act}"]`);
    b.innerHTML = icon;
    b.title = title;
    b.addEventListener('click', fn);
  };
  set('pp', ICON_PAUSE, 'Duraklat', () => botCmd(S.botState?.paused ? 'devam' : 'duraklat'));
  set('next', ICON_NEXT, 'Sonraki şarkı (!geç)', () => botCmd('geç'));
  set('stop', ICON_STOP, 'Durdur ve kuyruğu temizle (!dur)', () => botCmd('dur'));
  const lb = bar.querySelector('[data-act="list"]');
  lb.insertAdjacentHTML('afterbegin', ICON_LIST);
  lb.title = 'Kuyruk ve şarkı ekle';
  lb.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMusicPop();
  });
  $('#btn-music').innerHTML = ICON_MUSIC;
})();

// Kanaldaki bot kutusu: kapak resmi ve çalan şarkı
function renderStageBotCard() {
  const st = S.botState;
  const card = st?.id && $(`#participants .p-card[data-uid="${st.id}"]`);
  if (!card) return;
  card.classList.add('bot-card');
  const cur = st.current;
  card.style.backgroundImage = cur?.thumbnail ? `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.75)), url("${cur.thumbnail.replace(/"/g, '%22')}")` : '';
  let np = card.querySelector('.bot-np');
  if (!np) card.append((np = h('div', { class: 'bot-np' })));
  np.textContent = cur ? `${st.paused ? '⏸' : '♪'} ${cur.title}` : 'Şarkı bekliyor · !çal';
}

function botAvatar() {
  const av = h('div', { class: 'avatar bot-avatar' });
  av.innerHTML = ICON_MUSIC;
  return av;
}

// =====================================================================
//  Yazı kanalları (Discord'daki # kanallar): sese katılmadan herkes okur ve yazar
// =====================================================================
const ICON_HASH = '<svg viewBox="0 0 24 24"><path d="M10.2 3 9.5 7h4l.7-4h2l-.7 4H19v2h-3.9l-.7 4H18v2h-3.9l-.7 4h-2l.7-4h-4l-.7 4h-2l.7-4H3v-2h3.9l.7-4H4V7h3.9l.7-4h1.6Zm-1 6-.7 4h4l.7-4h-4Z"/></svg>';
function renderTextChannels() {
  const box = $('#text-tree');
  if (!box) return;
  box.innerHTML = '';
  const list = S.channels.filter((c) => c.type === 'text').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  $('#text-head').classList.toggle('hidden', !list.length && !can('manageChannels'));
  for (const ch of list) {
    const un = S.textUnread.get(ch.id);
    const row = h(
      'div',
      {
        class: `ch text-ch ${S.chatView === ch.id ? 'current' : ''} ${un ? 'unread' : ''}`,
        title: 'Sohbeti aç',
        onclick: () => openChat(ch.id),
        oncontextmenu: (e) => textChannelMenu(e, ch),
      },
      h('span', { class: 'ch-ico' }),
      h('span', { class: 'ch-name' }, ch.name),
      un ? h('span', { class: `ch-badge ${un.mention ? 'mention' : ''}`, title: un.mention ? 'Senden bahsedildi' : 'Okunmamış mesaj' }, un.n > 99 ? '99+' : String(un.n)) : null
    );
    row.querySelector('.ch-ico').outerHTML = ICON_HASH;
    box.append(row);
  }
}
// Sağ paneldeki sohbeti değiştir: yazı kanalı ya da (null) bulunduğum ses kanalının sohbeti
function openChat(cid) {
  const text = cid && isTextCh(cid);
  const next = text ? cid : null;
  if (next !== S.chatView) {
    S.replyTo = null;
    S.editing = null;
    S.typing.clear();
  }
  S.chatView = next;
  if (text) {
    S.textUnread.delete(cid);
    if (!S.textLoaded.has(cid)) send({ t: 'openText', channelId: cid });
  }
  if (settings.chatHidden) {
    settings.chatHidden = false;
    saveSettings();
    S.unread = 0;
    renderChatToggle();
    requestAnimationFrame(() => renderStage());
  }
  if (rightTab !== 'chat') $('.chat-tab[data-tab="chat"]').click();
  renderTree();
  renderChatHead();
  renderChat();
  renderTyping();
  $('#chat-input').focus();
}
function renderChatHead() {
  const ch = S.channels.find((c) => c.id === chatChannel());
  const head = $('#chat-head');
  head.innerHTML = '';
  if (!ch) return (head.textContent = 'Sohbet');
  if (ch.type === 'text') head.append(svgEl(ICON_HASH), h('span', {}, ch.name));
  else head.append(svgEl(ICON.channel), h('span', {}, ch.name));
  head.title = ch.type === 'text' ? `#${ch.name} — sunucudaki herkes görür` : `${ch.name} — sadece bu ses kanalındakiler görür`;
}
function textChannelMenu(e, ch) {
  e.preventDefault();
  showCtx(e, textChannelMenuItems(ch)); // yetkiye göre (admin.js)
}
$('#btn-add-text').addEventListener('click', () =>
  inlinePrompt('Yazı kanalı adı', '', (name) => send({ t: 'createChannel', name, type: 'text' }), false, 'Sese katılmadan herkesin yazabildiği kanal, ör. "oyun-planı" ya da "linkler".')
);

// =====================================================================
//  Uzaktan kontrol (TeamViewer / AnyDesk gibi)
//  İzleyen "Kontrol iste" der → yayıncı onaylarsa izleyenin fare ve klavyesi
//  yayıncının paylaştığı ekrana uygulanır. Olaylar doğrudan (P2P) veri kanalından gider.
// =====================================================================
const ICON_RC = '<svg viewBox="0 0 24 24"><path d="M5 3l14 7.2-6.3 1.6 3.9 6.8-2.6 1.5-3.9-6.8L5 18V3Z"/></svg>';
const RC_TYPES = new Set(['m', 'd', 'u', 'w', 'k']);
const isControlling = (key) => S.rcView?.state === 'active' && S.rcView.key === key;

// ---------- Yayıncı tarafı ----------
function answerRc(peerId, shareId, ok, reason = '', message = '') {
  S.peers.get(peerId)?.signal({ kind: 'rc-answer', shareId, ok, reason, message });
}
function onRcRequest(peerId, shareId) {
  const sh = S.myShares.get(shareId);
  const who = userName(peerId) || 'Biri';
  if (!sh || sh.kind === 'camera') return answerRc(peerId, shareId, false, 'nosuch');
  if (sh.opts.surface !== 'screen') return answerRc(peerId, shareId, false, 'window');
  if (S.rcHost || S.rcPending) return answerRc(peerId, shareId, false, 'busy');
  let left = 30;
  const tick = () => {
    $('#rc-deny').textContent = `Reddet (${left})`;
    if (left-- <= 0) decideRc(false, 'timeout');
  };
  S.rcPending = { peerId, shareId, timer: setInterval(tick, 1000) };
  $('#rc-title').textContent = `${who} ekranını kontrol etmek istiyor`;
  $('#rc-desc').textContent = `İzin verirsen ${who} "${sh.label}" ekranında fareni ve klavyeni kullanabilir. Ekranının üstünde bir çubuk görünür; istediğin an Durdur’a ya da ${S.platform === 'darwin' ? '⌘⇧X' : 'Ctrl+Shift+X'} kısayoluna basarak kontrolü geri alırsın.`;
  tick();
  showModal('rc-modal');
  beep('mention');
  kanki.flash();
  if (!document.hasFocus()) kanki.notify(`${who} ekranını kontrol etmek istiyor`, 'İzin vermek ya da reddetmek için Kanki’ye geç.');
}
async function decideRc(allow, reason = 'declined') {
  const p = S.rcPending;
  if (!p) return;
  clearInterval(p.timer);
  S.rcPending = null;
  hideModal('rc-modal');
  const sh = S.myShares.get(p.shareId);
  if (!allow || !sh || !S.peers.has(p.peerId)) return answerRc(p.peerId, p.shareId, false, sh ? reason : 'nosuch');
  const who = userName(p.peerId) || 'Biri';
  const r = await kanki.rcStart(sh.opts.sourceId, who);
  if (!r?.ok) {
    toast('Uzaktan kontrol başlatılamadı', r?.message || '', 'err', 9000);
    return answerRc(p.peerId, p.shareId, false, r?.reason || 'error', r?.message || '');
  }
  S.rcHost = { peerId: p.peerId, shareId: p.shareId, name: who };
  S.peers.get(p.peerId)?.ensureRcChannel();
  answerRc(p.peerId, p.shareId, true);
  renderRcHost();
  toast(`${who} ekranını kontrol ediyor`, `Durdurmak için ekranın üstündeki çubuğu ya da ${S.platform === 'darwin' ? '⌘⇧X' : 'Ctrl+Shift+X'} kısayolunu kullan.`, '', 7000);
}
$('#rc-allow').addEventListener('click', () => decideRc(true));
$('#rc-deny').addEventListener('click', () => decideRc(false));
// Pencere başka bir yoldan kapanırsa (Esc, dışarı tıklama) istek reddedilmiş sayılır
new MutationObserver(() => $('#rc-modal').classList.contains('hidden') && S.rcPending && decideRc(false)).observe($('#rc-modal'), { attributes: true, attributeFilter: ['class'] });

// Gelen fare/klavye olayı: sadece izin verilen kişiden ve kontrol açıkken uygulanır
function rcIncoming(peerId, m) {
  if (!S.rcHost || S.rcHost.peerId !== peerId || !m || !RC_TYPES.has(m.t)) return;
  kanki.rcInput(m);
}
function stopRcHost(notify = true, why = '') {
  if (S.rcPending) {
    clearInterval(S.rcPending.timer);
    const p = S.rcPending;
    S.rcPending = null;
    hideModal('rc-modal');
    if (notify) answerRc(p.peerId, p.shareId, false, 'declined');
  }
  if (!S.rcHost) return;
  const h0 = S.rcHost;
  S.rcHost = null;
  kanki.rcStop();
  if (notify) S.peers.get(h0.peerId)?.signal({ kind: 'rc-stop', shareId: h0.shareId });
  renderRcHost();
  toast('Uzaktan kontrol bitti', why || `${h0.name} artık ekranını kontrol etmiyor.`);
}
kanki.onRcStopped(() => stopRcHost(true, 'Kontrolü geri aldın.'));
function renderRcHost() {
  const b = $('#rc-banner');
  b.classList.toggle('hidden', !S.rcHost);
  if (S.rcHost) b.querySelector('.rcb-text').innerHTML = `<b>${esc(S.rcHost.name)}</b> ekranını kontrol ediyor`;
  renderStage(); // bant sahnenin yüksekliğini değiştirir; kutular yeniden dizilsin
}
$('#rc-banner-stop').addEventListener('click', () => stopRcHost(true, 'Kontrolü geri aldın.'));

// ---------- İzleyen tarafı ----------
function requestControl(key) {
  if (S.rcView?.key === key) return releaseControl(true); // ikinci tıklama: bırak / isteği geri al
  if (S.rcView) releaseControl(true);
  const [uid, sid] = splitKey(key);
  const p = S.peers.get(uid);
  if (!p) return;
  p.signal({ kind: 'rc-request', shareId: sid });
  S.rcView = {
    key,
    peerId: uid,
    shareId: sid,
    state: 'pending',
    timer: setTimeout(() => {
      if (S.rcView?.key !== key || S.rcView.state !== 'pending') return;
      S.rcView = null;
      renderTiles();
      toast('Yanıt gelmedi', `${userName(uid)} isteği görmemiş olabilir ya da Kanki’nin eski bir sürümünü kullanıyor.`);
    }, 40000),
  };
  renderTiles();
  toast('Kontrol isteği gönderildi', `${userName(uid)} onaylarsa ekranını kontrol edebileceksin.`);
}
function onRcAnswer(peerId, d) {
  const v = S.rcView;
  if (!v || v.peerId !== peerId || v.shareId !== d.shareId || v.state !== 'pending') return;
  clearTimeout(v.timer);
  const who = userName(peerId) || 'Karşı taraf';
  if (d.ok) {
    v.state = 'active';
    S.peers.get(peerId)?.ensureRcChannel();
    renderTiles();
    toast('Kontrol sende', 'Görüntüye tıkla: fare ve klavye karşı tarafa gider. Bitirince "Bırak"a bas.', '', 7000);
    return;
  }
  S.rcView = null;
  renderTiles();
  const MSG = {
    declined: `${who} isteğini reddetti.`,
    timeout: `${who} isteğe yanıt vermedi.`,
    busy: `${who} ekranını şu an başka biri kontrol ediyor.`,
    window: `${who} bir pencere paylaşıyor; kontrol için tüm ekranı paylaşması gerekiyor.`,
    nosuch: 'Bu yayın artık yok.',
  };
  toast('Kontrol verilmedi', MSG[d.reason] || d.message || `${who} tarafında kontrol başlatılamadı.`, d.reason === 'declined' ? '' : 'err', 7000);
}
function onRcStop(peerId, d) {
  if (S.rcHost?.peerId === peerId && (!d.shareId || d.shareId === S.rcHost.shareId)) {
    stopRcHost(false, `${S.rcHost.name} kontrolü bıraktı.`);
  }
  if (S.rcView?.peerId === peerId && (!d.shareId || d.shareId === S.rcView.shareId)) {
    const wasActive = S.rcView.state === 'active';
    releaseControl(false);
    if (wasActive) toast('Uzaktan kontrol bitti', `${userName(peerId) || 'Yayıncı'} kontrolü geri aldı.`);
  }
}
const rcHeldKeys = new Set();
const rcHeldButtons = new Set();
function rcSend(m) {
  S.peers.get(S.rcView?.peerId)?.sendRc(m);
}
function releaseHeld() {
  for (const c of rcHeldKeys) rcSend({ t: 'k', c, d: false });
  for (const b of rcHeldButtons) rcSend({ t: 'u', b });
  rcHeldKeys.clear();
  rcHeldButtons.clear();
}
function setRcFocus(on) {
  if (S.rcFocus === on) return;
  if (!on) releaseHeld();
  S.rcFocus = on;
  const el = S.rcView && tileEls.get(S.rcView.key);
  if (el) syncTileRc(S.rcView.key, el);
}
function releaseControl(notify = true) {
  const v = S.rcView;
  if (!v) return;
  clearTimeout(v.timer);
  if (v.state === 'active') releaseHeld();
  if (notify) S.peers.get(v.peerId)?.signal({ kind: 'rc-stop', shareId: v.shareId });
  S.rcView = null;
  S.rcFocus = false;
  renderTiles();
}
function syncTileRc(key, el) {
  const [uid, sid] = splitKey(key);
  const surface = S.peers.get(uid)?.remoteSurface.get(sid);
  const btn = el.querySelector('.tile-btn[title*="kontrol" i], .tile-btn.rc');
  if (btn) {
    btn.classList.add('rc');
    btn.classList.toggle('hidden', surface !== 'screen'); // pencere ve kamerada kontrol yok
    const st = S.rcView?.key === key ? S.rcView.state : '';
    btn.classList.toggle('pending', st === 'pending');
    btn.classList.toggle('active', st === 'active');
    btn.title = st === 'active' ? 'Kontrolü bırak' : st === 'pending' ? 'İsteği geri al (yanıt bekleniyor)' : 'Uzaktan kontrol iste';
  }
  const on = isControlling(key);
  el.classList.toggle('rc-active', on);
  el.classList.toggle('rc-focus', on && S.rcFocus);
  const badge = el.querySelector('.tile-rc-badge');
  badge.classList.toggle('hidden', !on);
  if (on) badge.querySelector('.rc-text').textContent = S.rcFocus ? 'Kontrol sende · klavye de karşıya gidiyor' : 'Kontrol sende · görüntüye tıkla';
}

// Görüntü üzerindeki fare olaylarını karşı ekranın oranlarına çevirir (siyah kenarlar hariç)
function rcPos(e, video, clampIt) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const sc = Math.min(r.width / vw, r.height / vh);
  const cw = vw * sc;
  const ch = vh * sc;
  let x = (e.clientX - (r.left + (r.width - cw) / 2)) / cw;
  let y = (e.clientY - (r.top + (r.height - ch) / 2)) / ch;
  if (!clampIt && (x < 0 || y < 0 || x > 1 || y > 1)) return null;
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}
function attachRcInput(video, el, key) {
  let pending = null;
  let timer = null;
  const flushMove = () => {
    timer = null;
    if (pending && isControlling(key)) rcSend({ t: 'm', ...pending });
    pending = null;
  };
  video.addEventListener('pointermove', (e) => {
    if (!isControlling(key)) return;
    const p = rcPos(e, video, rcHeldButtons.size > 0);
    if (!p) return;
    pending = p;
    if (!timer) timer = setTimeout(flushMove, 16); // en fazla ~60 olay/sn
  });
  video.addEventListener('pointerdown', (e) => {
    if (!isControlling(key)) return;
    e.preventDefault();
    e.stopPropagation();
    setRcFocus(true);
    const p = rcPos(e, video, false);
    if (!p) return;
    try {
      video.setPointerCapture(e.pointerId);
    } catch {}
    if (timer) flushMove();
    rcHeldButtons.add(e.button);
    rcSend({ t: 'd', b: e.button, n: e.detail || 1, ...p });
  });
  const up = (e) => {
    if (!isControlling(key) || !rcHeldButtons.has(e.button)) return;
    e.preventDefault();
    if (timer) flushMove();
    rcHeldButtons.delete(e.button);
    rcSend({ t: 'u', b: e.button, n: e.detail || 1, ...(rcPos(e, video, true) || {}) });
  };
  video.addEventListener('pointerup', up);
  video.addEventListener('pointercancel', up);
  video.addEventListener(
    'wheel',
    (e) => {
      if (!isControlling(key)) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      rcSend({ t: 'w', dx: Math.round(e.deltaX * k), dy: Math.round(e.deltaY * k) });
    },
    { passive: false }
  );
  video.addEventListener('contextmenu', (e) => isControlling(key) && e.preventDefault());
  video.addEventListener('auxclick', (e) => isControlling(key) && e.preventDefault());
}
// Klavye: kontrol açıkken ve görüntüye tıklanmışken tüm tuşlar karşıya gider (Kanki kısayolları dahil)
window.addEventListener(
  'keydown',
  (e) => {
    if (!S.rcView || S.rcView.state !== 'active' || !S.rcFocus) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.code) return;
    rcHeldKeys.add(e.code);
    rcSend({ t: 'k', c: e.code, d: true });
  },
  true
);
window.addEventListener(
  'keyup',
  (e) => {
    if (!S.rcView || S.rcView.state !== 'active' || !S.rcFocus) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.code) return;
    rcHeldKeys.delete(e.code);
    rcSend({ t: 'k', c: e.code, d: false });
  },
  true
);
window.addEventListener('blur', () => setRcFocus(false));
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!S.rcFocus) return;
    const el = S.rcView && tileEls.get(S.rcView.key);
    if (!el || !el.querySelector('video').contains(e.target)) setRcFocus(false);
  },
  true
);

// =====================================================================
//  Yenilikler: güncellemeden sonra, eski sürümden yenisine kadar olan değişiklikler
// =====================================================================
const LAST_VERSION_KEY = 'kanki-last-version';
const CL_TYPES = [
  ['added', 'Yeni'],
  ['changed', 'Değişti'],
  ['fixed', 'Düzeltildi'],
  ['removed', 'Kaldırıldı'],
];
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
function showWhatsNew(from, to, all = false) {
  const list = (typeof CHANGELOG !== 'undefined' ? CHANGELOG : [])
    .filter((e) => cmpVer(e.version, to) <= 0 && (all || cmpVer(e.version, from) > 0))
    .sort((a, b) => cmpVer(b.version, a.version));
  if (!list.length) return false;
  $('#wn-title').textContent = all ? 'Sürüm notları' : 'Kanki güncellendi';
  $('#wn-sub').innerHTML = all
    ? `Şu an kullandığın sürüm: <b>${esc(to)}</b>`
    : `<span class="wn-ver old">${esc(from)}</span><span class="wn-arrow">→</span><span class="wn-ver">${esc(to)}</span>`;
  const totals = { added: 0, changed: 0, fixed: 0, removed: 0 };
  const body = $('#wn-body');
  body.innerHTML = '';
  for (const e of list) {
    const sec = h(
      'section',
      { class: 'wn-release' },
      h('div', { class: 'wn-rel-head' }, h('span', { class: 'wn-rel-ver' }, e.version), h('span', { class: 'wn-rel-title' }, e.title || ''), h('span', { class: 'wn-rel-date' }, e.date ? new Date(e.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''))
    );
    for (const [type, label] of CL_TYPES) {
      const items = e[type] || [];
      if (!items.length) continue;
      totals[type] += items.length;
      const ul = h('ul', { class: 'wn-list' });
      for (const it of items) {
        const li = h('li', {}, h('span', { class: `wn-tag ${type}` }, label), h('span', { class: 'wn-text' }));
        li.querySelector('.wn-text').innerHTML = formatText(it);
        ul.append(li);
      }
      sec.append(ul);
    }
    body.append(sec);
  }
  const sum = $('#wn-summary');
  sum.innerHTML = '';
  for (const [type, label] of CL_TYPES)
    if (totals[type]) sum.append(h('span', { class: `wn-count ${type}` }, h('b', {}, String(totals[type])), ` ${label.toLowerCase()}`));
  $('#wn-note').textContent = all ? '' : list.length > 1 ? `${list.length} sürümün değişiklikleri` : '';
  body.scrollTop = 0;
  showModal('whatsnew');
  return true;
}
function checkWhatsNew(current) {
  let last = null;
  try {
    last = localStorage.getItem(LAST_VERSION_KEY);
    if (!last && localStorage.getItem('kanki-settings')) {
      // Bu özellik gelmeden önce kullananlar: önceki sürümü bilmiyoruz, en azından bu sürümün notlarını göster
      const older = (typeof CHANGELOG !== 'undefined' ? CHANGELOG : []).map((e) => e.version).filter((v) => cmpVer(v, current) < 0).sort(cmpVer).pop();
      last = older || null;
    }
    localStorage.setItem(LAST_VERSION_KEY, current);
  } catch {}
  if (last && cmpVer(current, last) > 0) setTimeout(() => showWhatsNew(last, current), 600);
}
$('#btn-release-notes').addEventListener('click', () => showWhatsNew('0.0.0', S.appVersion || '999.0.0', true));

// =====================================================================
//  Başlangıç
// =====================================================================
(async function init() {
  // Önce bütün betikler (extras.js dahil) yüklensin; arayüz onların işlevlerini de kullanıyor
  if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  const info = await kanki.info();
  S.appVersion = info.version;
  checkWhatsNew(info.version);
  $('#about-name').textContent = info.title;
  $('#about-version').textContent = `Sürüm ${info.version} · ${info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : info.platform}`;
  S.platform = info.platform;
  S.pttGlobal = info.pttAvailable;
  document.body.classList.add(info.platform === 'darwin' ? 'mac' : 'win');
  for (const k of document.querySelectorAll('kbd.mod')) k.textContent = info.platform === 'darwin' ? '⌘' : 'Ctrl';
  renderChatToggle();
  renderProfilePreview();
  S.variant = info.variant;
  document.title = info.title;
  if (info.variant === 'admin') {
    $('#brand-title').innerHTML = 'Kanki <span class="brand-tag">ADMIN</span>';
  } else {
    // Arkadaş sürümü: sadece bağlan
    $('#connect-tabs').classList.add('hidden');
    $('[data-panel=host]').classList.add('hidden');
    $('[data-panel=join]').classList.remove('hidden');
    $$('.admin-only').forEach((el) => el.classList.add('hidden'));
  }
  $('#in-nick').value = settings.nick;
  $('#in-host-name').value = settings.host?.name || '';
  $('#in-host-port').value = settings.host?.port || 4455;
  $('#in-ngrok').checked = !!settings.host?.ngrok;
  $('#in-ngrok-token').value = settings.host?.ngrokToken || '';
  $('#in-ngrok-domain').value = settings.host?.ngrokDomain || '';
  $('#ngrok-box').classList.toggle('hidden', !settings.host?.ngrok);
  if (settings.recent[0]) {
    $('#in-address').value = settings.recent[0].address;
    $('#in-password').value = settings.recent[0].password || '';
    $('#in-admin-key').value = settings.recent[0].adminKey || '';
  } else if (info.defaultServer) {
    $('#in-address').value = info.defaultServer;
  }
  if (info.web) {
    // Tarayıcıdan: sayfayı veren sunucuya bağlanılır; adres ve son bağlananlar gizli
    S.web = true;
    $('#in-address').value = location.origin;
    $('#in-address').closest('.field').classList.add('hidden');
    settings.recent = [];
  }
  applyAdminUi();
  renderRecent();
  renderControls();

  // ---- Otomatik test modu ----
  const t = kanki.autotest;
  if (t) {
    $('#in-nick').value = t.name;
    if (t.host) {
      $('#in-host-port').value = t.host;
      await doHost();
    } else {
      $('#in-address').value = t.address;
      await doConnect();
    }
    if (t.chat) setTimeout(() => send({ t: 'chat', text: t.chat }), 2000);
    if (t.share === 'canvas') {
      await sleep(2500);
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1080;
      const g = c.getContext('2d');
      let n = 0;
      // Test yayını: hareketli bir manzara (gün batımı, dağlar, HUD)
      const ridge = (base, amp, freq, shift, color) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, 1080);
        for (let x = 0; x <= 1920; x += 16) g.lineTo(x, base + Math.sin((x + shift) * freq) * amp + Math.sin((x + shift) * freq * 2.7) * amp * 0.35);
        g.lineTo(1920, 1080);
        g.fill();
      };
      setInterval(() => {
        n++;
        const sky = g.createLinearGradient(0, 0, 0, 1080);
        sky.addColorStop(0, '#1b1f4a');
        sky.addColorStop(0.55, '#c2477a');
        sky.addColorStop(1, '#f6a65b');
        g.fillStyle = sky;
        g.fillRect(0, 0, 1920, 1080);
        g.fillStyle = 'rgba(255,214,150,.95)';
        g.beginPath();
        g.arc(1340, 560, 150, 0, Math.PI * 2);
        g.fill();
        ridge(640, 70, 0.004, n * 0.6, '#6b2f63');
        ridge(760, 60, 0.006, n * 1.6, '#3f1f4d');
        ridge(880, 45, 0.009, n * 4, '#1d1330');
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(60, 60, 420, 120);
        g.fillStyle = '#fff';
        g.font = 'bold 44px -apple-system, sans-serif';
        g.fillText('SKOR  ' + String(1200 + n * 5).padStart(6, '0'), 90, 115);
        g.font = '30px -apple-system, sans-serif';
        g.fillText('Bölüm 3 · Gün batımı vadisi', 90, 158);
      }, 1000 / 30);
      addShare(c.captureStream(30), { fps: 30, res: 1080, bitrate: 6000, hint: 'motion' }, 'Oyun');
      if (t.shares >= 2) {
        // İkinci test yayını: kod editörü görünümü
        const c2 = document.createElement('canvas');
        c2.width = 1600;
        c2.height = 900;
        const g2 = c2.getContext('2d');
        let k = 0;
        const lines = ['function kanki() {', '  const arkadaslar = ["Ali", "Deniz", "Emin"];', '  for (const a of arkadaslar) {', '    selamla(a);', '  }', '  return "ekran paylaşımı açık";', '}'];
        setInterval(() => {
          k++;
          g2.fillStyle = '#1e1f29';
          g2.fillRect(0, 0, 1600, 900);
          g2.fillStyle = '#282a36';
          g2.fillRect(0, 0, 1600, 54);
          g2.fillStyle = '#8be9fd';
          g2.font = '24px Menlo, monospace';
          g2.fillText('kanki.js — Kod editörü', 24, 36);
          g2.font = '30px Menlo, monospace';
          lines.forEach((ln, i) => {
            g2.fillStyle = '#6272a4';
            g2.fillText(String(i + 1).padStart(2, ' '), 30, 130 + i * 52);
            g2.fillStyle = i === (k >> 4) % lines.length ? '#f1fa8c' : '#f8f8f2';
            g2.fillText(ln, 100, 130 + i * 52);
          });
        }, 1000 / 30);
        addShare(c2.captureStream(30), { fps: 30, res: 1080, bitrate: 4000, hint: 'detail' }, 'Kod editörü');
      }
    }
    setInterval(async () => {
      const report = { me: S.myName, peers: [] };
      for (const p of S.peers.values()) {
        const s = await p.stats();
        let lc = 0, rc = 0, pairs = 0;
        (await p.pc.getStats()).forEach((x) => { if (x.type === 'local-candidate') lc++; if (x.type === 'remote-candidate') rc++; if (x.type === 'candidate-pair') pairs++; });
        report.peers.push({
          with: userName(p.id),
          state: p.pc.connectionState,
          dbg: `sig=${p.pc.signalingState} ice=${p.pc.iceConnectionState} gather=${p.pc.iceGatheringState} polite=${p.polite} lc=${lc} rc=${rc} pairs=${pairs}`,
          video: s ? `${s.frameWidth}x${s.frameHeight} fps=${Math.round(s.framesPerSecond || 0)} bytes=${s.bytesReceived}` : null,
          speakingAudio: audio.remote.has(p.id),
        });
      }
      report.watching = [...S.watching].map(shareLabel);
      report.myShares = [...S.myShares.values()].map((x) => `${x.label}: ${[...x.watchers].map(userName).join(',')}`);
      console.log('AUTOTEST ' + JSON.stringify(report));
    }, 3000);
  }
})();
