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
  power: '<svg viewBox="0 0 24 24"><path d="M11 2h2v10h-2zM6.3 5.3l1.4 1.4A7 7 0 1 0 16.3 6.7l1.4-1.4A9 9 0 1 1 6.3 5.3Z"/></svg>',
  channel: '<svg viewBox="0 0 24 24"><path d="M4 9V7h16v2H4Zm0 4v-2h16v2H4Zm0 4v-2h10v2H4Z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z"/></svg>',
};

const COLORS = ['#3d8bfd', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#22c55e', '#eab308', '#ef4444', '#06b6d4', '#a855f7'];
const colorFor = (name) => {
  let x = 0;
  for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[x % COLORS.length];
};
const avatar = (name, extra = '') => {
  const el = h('div', { class: `avatar ${extra}` }, (name || '?').trim().charAt(0).toUpperCase());
  el.style.background = colorFor(name || '?');
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
  userVolumes: {},
  localMutes: {},
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
  screenStream: null,
  screenOpts: null,
  watchers: new Set(), // beni izleyenler
  watching: new Set(), // izlediklerim
  focusedShare: null, // sahnede gösterilen yayıncı
  remoteScreens: new Map(), // userId -> { stream, video:MediaStream, audioEl }
  hosting: null,
  variant: 'admin',
  isAdmin: false,
  adminKey: '',
  platform: 'darwin',
};

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
        noiseSuppression: settings.ns,
        autoGainControl: settings.agc,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });
    audio.micStream = stream;
    audio.micTrack = stream.getAudioTracks()[0];
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
    for (const p of S.peers.values()) p.setMicTrack(audio.micTrack, audio.micStream);
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
    r.el.muted = S.deafened || !!settings.localMutes[userName(userId)];
  }
  const sc = S.remoteScreens.get(userId);
  if (sc?.audioEl) sc.audioEl.muted = S.deafened;
}
const userName = (id) => S.users.get(id)?.name || '';
const volKey = (id) => userName(id);

// Basit bildirim sesleri
function beep(kind) {
  if (!settings.sounds) return;
  try {
    const ctx = getCtx();
    const tones = { join: [520, 780], leave: [780, 520], mute: [440], unmute: [660], poke: [880, 660, 880], msg: [990] }[kind] || [600];
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
    this.screenTx = [];
    this.screenStreamId = null; // karşı tarafın yayın akışı
    this.pc = new RTCPeerConnection({ iceServers: S.iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    const pc = this.pc;

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.signal({ desc: pc.localDescription.toJSON() });
      } catch (e) {
        log('negotiation', e);
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal({ candidate: candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      log('peer', userName(id), pc.connectionState);
      if (pc.connectionState === 'failed') pc.restartIce();
      if (pc.connectionState === 'connected') this.tuneSenders();
      renderTree();
    };
    pc.ontrack = (e) => this.onTrack(e);

    if (audio.micTrack) this.setMicTrack(audio.micTrack, audio.micStream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
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
      if (data.on) {
        S.watchers.add(this.id);
        this.sendScreen();
      } else {
        S.watchers.delete(this.id);
        this.stopScreen();
      }
      renderSelfShare();
    } else if (data.kind === 'screen-meta') {
      this.screenStreamId = data.streamId;
    } else if (data.kind === 'screen-ended') {
      dropRemoteScreen(this.id);
    }
  }

  onTrack(e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    const isScreen = e.track.kind === 'video' || (this.screenStreamId && stream.id === this.screenStreamId);
    if (isScreen) {
      addRemoteScreenTrack(this.id, e.track, stream);
    } else {
      attachRemoteAudio(this.id, stream);
    }
  }

  sendScreen() {
    if (!S.screenStream || this.screenTx.length) return;
    const o = S.screenOpts;
    this.signal({ kind: 'screen-meta', streamId: S.screenStream.id });
    for (const track of S.screenStream.getTracks()) {
      const isVideo = track.kind === 'video';
      const tx = this.pc.addTransceiver(track, {
        direction: 'sendonly',
        streams: [S.screenStream],
        sendEncodings: isVideo
          ? [{ maxBitrate: o.bitrate * 1000, maxFramerate: o.fps, priority: 'high', networkPriority: 'high' }]
          : [{ maxBitrate: 160000 }],
      });
      if (isVideo) preferCodecs(tx, 'video');
      this.screenTx.push(tx);
    }
  }

  stopScreen() {
    if (!this.screenTx.length) return;
    for (const tx of this.screenTx) {
      try {
        tx.sender.replaceTrack(null);
        tx.stop();
      } catch {}
    }
    this.screenTx = [];
    this.signal({ kind: 'screen-ended' });
  }

  async stats() {
    const r = await this.pc.getStats();
    let out = null;
    r.forEach((s) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video') out = s;
    });
    return out;
  }

  close() {
    try {
      this.pc.close();
    } catch {}
    detachRemoteAudio(this.id);
    dropRemoteScreen(this.id);
    S.watchers.delete(this.id);
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
      S.watching.delete(id);
    }
  }
  for (const id of want) if (!S.peers.has(id)) S.peers.set(id, new Peer(id));
}

function closeAllPeers() {
  for (const p of S.peers.values()) p.close();
  S.peers.clear();
  S.watching.clear();
  S.watchers.clear();
}

// =====================================================================
//  Ekran paylaşımı — gönderen
// =====================================================================
const RES = { 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] };
function autoBitrate(res, fps) {
  const base = { 720: 2500, 1080: 4500, 1440: 8000, 2160: 14000, 0: 9000 }[res] || 4500;
  return Math.round(base * (fps >= 60 ? 1.6 : fps >= 30 ? 1 : 0.6));
}

let pickerSources = [];
let pickerType = 'screen';
let pickerSelected = null;

async function openPicker() {
  if (S.screenStream) return stopShare();
  if (!S.channelId) return;
  const perm = await kanki.ensurePermissions();
  if (S.platform === 'darwin' && perm.screen !== 'granted' && perm.screen !== 'not-determined') {
    toast('Ekran kaydı izni gerekli', 'Sistem Ayarları › Gizlilik ve Güvenlik › Ekran Kaydı bölümünden Kanki’ye izin verip uygulamayı yeniden başlat.', 'err', 9000);
    kanki.openScreenSettings();
  }
  const sh = settings.share;
  $('#opt-res').value = sh.res;
  $('#opt-fps').value = sh.fps;
  $('#opt-hint').value = sh.hint;
  $('#opt-bitrate').value = sh.bitrate;
  $('#opt-audio').checked = sh.audio;
  $('#picker-note').textContent = S.platform === 'darwin' ? 'macOS: sistem sesi macOS 14.2+ ile desteklenir.' : '';
  pickerSelected = null;
  $('#btn-go-live').disabled = true;
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
    const card = h(
      'div',
      {
        class: `source ${pickerSelected === s.id ? 'selected' : ''}`,
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
  const sh = (settings.share = {
    res: $('#opt-res').value,
    fps: $('#opt-fps').value,
    hint: $('#opt-hint').value,
    bitrate: $('#opt-bitrate').value,
    audio: $('#opt-audio').checked,
  });
  saveSettings();
  hideModal('picker');
  const fps = Number(sh.fps);
  const res = Number(sh.res);
  const bitrate = Number(sh.bitrate) || autoBitrate(res, fps);
  const video = { frameRate: { ideal: fps, max: fps } };
  if (RES[res]) {
    video.width = { max: RES[res][0] };
    video.height = { max: RES[res][1] };
  }
  let stream = null;
  const tryCapture = async (withAudio) => {
    await kanki.selectSource(pickerSelected, withAudio);
    return navigator.mediaDevices.getDisplayMedia({ video, audio: withAudio, selfBrowserSurface: 'exclude', systemAudio: 'include' });
  };
  try {
    stream = await tryCapture(sh.audio);
  } catch (e) {
    log('capture with audio failed', e);
    if (sh.audio) {
      try {
        stream = await tryCapture(false);
        toast('Sistem sesi paylaşılamadı', 'Yayın sadece görüntü ile başlatıldı.');
      } catch (e2) {
        log('capture failed', e2);
      }
    }
  }
  if (!stream) {
    toast('Ekran yakalanamadı', S.platform === 'darwin' ? 'Ekran Kaydı iznini kontrol et, ardından uygulamayı yeniden başlat.' : 'Tekrar dene.', 'err', 8000);
    if (S.platform === 'darwin') kanki.openScreenSettings();
    return;
  }
  startShareWithStream(stream, { fps, res, bitrate, hint: sh.hint });
}

function startShareWithStream(stream, opts) {
  const vt = stream.getVideoTracks()[0];
  if (vt) {
    vt.contentHint = opts.hint === 'detail' ? 'detail' : 'motion';
    vt.addEventListener('ended', () => stopShare());
  }
  S.screenStream = stream;
  S.screenOpts = opts;
  send({ t: 'status', sharing: true });
  $('#self-preview').srcObject = stream;
  const st = vt?.getSettings() || {};
  $('#self-share-meta').textContent = `${st.width || '?'}×${st.height || '?'} · ${opts.fps} FPS · en fazla ${(opts.bitrate / 1000).toFixed(1)} Mbps${stream.getAudioTracks().length ? ' · sistem sesi açık' : ''}`;
  renderSelfShare();
  // Zaten izlemek isteyen varsa (otomatik izleme) watch mesajı bekleriz.
  beep('unmute');
}

function stopShare() {
  if (!S.screenStream) return;
  for (const p of S.peers.values()) p.stopScreen();
  S.screenStream.getTracks().forEach((t) => t.stop());
  S.screenStream = null;
  S.watchers.clear();
  $('#self-preview').srcObject = null;
  send({ t: 'status', sharing: false });
  renderSelfShare();
  beep('mute');
}

function renderSelfShare() {
  const on = !!S.screenStream;
  $('#self-share').classList.toggle('hidden', !on);
  const btn = $('#btn-share');
  btn.classList.toggle('live', on);
  btn.querySelector('span').textContent = on ? 'Paylaşımı Durdur' : 'Ekran Paylaş';
  if (on) {
    const names = [...S.watchers].map(userName).filter(Boolean);
    $('#self-share-viewers').textContent = names.length ? `İzleyenler (${names.length}): ${names.join(', ')}` : 'Henüz izleyen yok';
  }
}

// =====================================================================
//  Ekran paylaşımı — izleyen
// =====================================================================
function watch(userId, on = true) {
  const p = S.peers.get(userId);
  if (!p) return;
  if (on) {
    S.watching.add(userId);
    S.focusedShare = userId;
    p.signal({ kind: 'watch', on: true });
  } else {
    S.watching.delete(userId);
    p.signal({ kind: 'watch', on: false });
    dropRemoteScreen(userId);
    if (S.focusedShare === userId) S.focusedShare = [...S.watching][0] || null;
  }
  renderStage();
}

function addRemoteScreenTrack(userId, track, stream) {
  let sc = S.remoteScreens.get(userId);
  if (!sc) {
    sc = { video: new MediaStream(), audioEl: null };
    S.remoteScreens.set(userId, sc);
  }
  if (track.kind === 'video') {
    sc.video.getVideoTracks().forEach((t) => sc.video.removeTrack(t));
    sc.video.addTrack(track);
    track.addEventListener('ended', () => renderStage());
  } else {
    if (!sc.audioEl) {
      sc.audioEl = new Audio();
      sc.audioEl.autoplay = true;
    }
    sc.audioEl.srcObject = new MediaStream([track]);
    sc.audioEl.volume = Number($('#viewer-volume').value) / 100;
    sc.audioEl.muted = S.deafened;
    if (settings.outputId && sc.audioEl.setSinkId) sc.audioEl.setSinkId(settings.outputId).catch(() => {});
    sc.audioEl.play().catch(() => {});
  }
  if (!S.focusedShare) S.focusedShare = userId;
  renderStage();
}

function dropRemoteScreen(userId) {
  const sc = S.remoteScreens.get(userId);
  if (sc) {
    if (sc.audioEl) sc.audioEl.srcObject = null;
    S.remoteScreens.delete(userId);
  }
  if (S.focusedShare === userId && !S.watching.has(userId)) S.focusedShare = [...S.watching][0] || null;
  renderStage();
}

let lastStats = null;
async function updateViewerStats() {
  const id = S.focusedShare;
  const p = id && S.peers.get(id);
  if (!p || $('#viewer').classList.contains('hidden')) return;
  const s = await p.stats();
  if (!s) return;
  let kbps = 0;
  if (lastStats && lastStats.id === s.id) kbps = ((s.bytesReceived - lastStats.bytes) * 8) / (s.timestamp - lastStats.ts);
  lastStats = { id: s.id, bytes: s.bytesReceived, ts: s.timestamp };
  const codec = s.codecId ? (await p.pc.getStats()).get(s.codecId)?.mimeType?.split('/')[1] : '';
  $('#viewer-stats').textContent = s.frameWidth
    ? `${s.frameWidth}×${s.frameHeight} · ${Math.round(s.framesPerSecond || 0)} FPS · ${(kbps / 1000).toFixed(1)} Mbps${codec ? ' · ' + codec : ''}`
    : '';
}
setInterval(updateViewerStats, 1000);

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
  closeAllPeers();
  if (S.screenStream) {
    S.screenStream.getTracks().forEach((t) => t.stop());
    S.screenStream = null;
    renderSelfShare();
  }
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
  stopShare();
  closeAllPeers();
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
      S.myId = m.id;
      S.myName = m.name;
      S.serverName = m.serverName;
      S.iceServers = m.iceServers || [];
      setConnText('Bağlı', 'ok');
      $('#reconnect-banner').classList.add('hidden');
      $('#me-name').textContent = m.name;
      const av = avatar(m.name);
      av.dataset.av = m.id;
      $('#me-avatar').replaceWith(Object.assign(av, { id: 'me-avatar' }));
      S.isAdmin = !!m.admin;
      applyAdminUi();
      break;
    case 'state': {
      const prevUsers = S.users;
      S.serverName = m.serverName;
      S.channels = m.channels;
      S.users = new Map(m.users.map((u) => [u.id, u]));
      const me = S.users.get(S.myId);
      const prevChannel = S.channelId;
      S.channelId = me?.channelId || null;
      if (S.channelId) S.lastChannelId = S.channelId;
      if (prevChannel !== S.channelId) {
        closeAllPeers();
        if (S.screenStream) stopShare();
        S.focusedShare = null;
        renderChat();
      } else if (prevChannel) {
        // Kanal içi giriş/çıkış sesleri
        for (const u of S.users.values())
          if (u.channelId === S.channelId && u.id !== S.myId && prevUsers.get(u.id)?.channelId !== S.channelId) beep('join');
        for (const u of prevUsers.values())
          if (u.channelId === S.channelId && u.id !== S.myId && S.users.get(u.id)?.channelId !== S.channelId) beep('leave');
      }
      syncPeers();
      // Yayını kapatanları temizle, otomatik izleme
      for (const id of [...S.watching]) {
        const u = S.users.get(id);
        if (!u || !u.sharing || u.channelId !== S.channelId) {
          S.watching.delete(id);
          dropRemoteScreen(id);
        }
      }
      for (const u of S.users.values()) {
        const was = prevUsers.get(u.id);
        if (u.id !== S.myId && u.channelId === S.channelId && u.sharing && !(was && was.sharing && was.channelId === S.channelId)) {
          if (settings.autoWatch) setTimeout(() => S.users.get(u.id)?.sharing && !S.watching.has(u.id) && watch(u.id, true), 300);
          else toast(`${u.name} ekran paylaşıyor`, 'İzlemek için adına tıkla.');
        }
      }
      for (const id of audio.remote.keys()) applyRemoteVolume(id);
      renderAll();
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
      renderChat();
      break;
    case 'chat': {
      if (!S.chat.has(m.channelId)) S.chat.set(m.channelId, []);
      S.chat.get(m.channelId).push(m);
      if (m.channelId === S.channelId) appendChat(m);
      if (!m.system && m.from !== S.myId) {
        beep('msg');
        if (!document.hasFocus()) kanki.notify(m.name, m.text);
      }
      break;
    }
    case 'poke':
      beep('poke');
      toast(`${m.name} seni dürttü!`, m.text || '', 'poke', 8000);
      kanki.flash();
      kanki.notify(`${m.name} seni dürttü`, m.text || '');
      break;
    case 'kicked': {
      const msg = `${m.by} seni sunucudan attı${m.reason ? ': ' + m.reason : '.'}`;
      disconnect();
      setConnectError(msg);
      break;
    }
    case 'moved':
      toast('Kanalın değiştirildi', `${m.by} seni başka bir kanala taşıdı.`);
      break;
    case 'forceMute':
      if (!S.muted) toggleMute();
      toast('Mikrofonun kapatıldı', `${m.by} mikrofonunu kapattı. İstediğinde tekrar açabilirsin.`);
      break;
    case 'adminInfo':
      renderAdminInfo(m);
      break;
    case 'adminNotice':
      toast(m.message);
      break;
    case 'error':
      toast('Hata', m.message, 'err');
      break;
    case 'pong':
      $('#ping-chip').textContent = `${Math.round(performance.now() - m.ts)} ms`;
      break;
  }
}

setInterval(() => send({ t: 'ping', ts: performance.now() }), 3000);

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
  return S.channels.filter((c) => (c.parent || null) === parent).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function renderTree() {
  const tree = $('#tree');
  const scroll = tree.scrollTop;
  tree.innerHTML = '';
  const walk = (parent, depth) => {
    for (const ch of childrenOf(parent)) {
      const members = [...S.users.values()].filter((u) => u.channelId === ch.id).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const row = h(
        'div',
        {
          class: `ch ${ch.id === S.channelId ? 'current' : ''}`,
          title: 'Katılmak için çift tıkla',
          ondblclick: () => joinChannel(ch.id),
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
            else if (dragged && S.isAdmin) send({ t: 'move', to: dragged, channelId: ch.id });
          },
        },
        h('span', { class: 'ch-ico' }),
        h('span', { class: 'ch-name' }, ch.name),
        members.length ? h('span', { class: 'ch-count' }, String(members.length)) : null
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
  const av = avatar(u.name);
  av.dataset.av = u.id;
  if (u.id === S.myId ? S.transmitting : audio.remote.get(u.id)?.speaking) av.classList.add('speaking');
  const badges = h('span', { class: 'badges' });
  if (u.sharing)
    badges.append(
      h(
        'span',
        {
          class: 'live-badge',
          title: 'Ekran paylaşıyor — izlemek için tıkla',
          onclick: () => u.id !== S.myId && u.channelId === S.channelId && watch(u.id, !S.watching.has(u.id) || S.focusedShare !== u.id),
        },
        'CANLI'
      )
    );
  if (u.admin) badges.append(h('span', { class: 'crown', title: 'Yönetici' }, ICON_CROWN()));
  if (u.muted) badges.insertAdjacentHTML('beforeend', ICON.micOff);
  if (u.deafened) badges.insertAdjacentHTML('beforeend', ICON.headOff);
  if (settings.localMutes[u.name] && u.id !== S.myId) badges.insertAdjacentHTML('beforeend', ICON.speaker);
  const p = S.peers.get(u.id);
  const pcState = p?.pc.connectionState;
  const title = u.id === S.myId ? 'Sen' : pcState && pcState !== 'connected' ? `Bağlantı: ${pcState}` : u.name;
  const row = h(
    'div',
    {
      class: `user ${u.id === S.myId ? 'me' : ''}`,
      title,
      draggable: u.id === S.myId || S.isAdmin ? 'true' : null,
      ondragstart: (e) => e.dataTransfer.setData('text/kanki-user', u.id),
      oncontextmenu: (e) => userMenu(e, u),
      ondblclick: () => u.sharing && u.id !== S.myId && u.channelId === S.channelId && watch(u.id, true),
    },
    av,
    h('span', { class: 'uname' }, u.name),
    badges
  );
  row.style.paddingLeft = 30 + depth * 16 + 'px';
  if (pcState && !['connected', 'new'].includes(pcState)) row.style.opacity = '.55';
  return row;
}

function renderStage() {
  const ch = S.channels.find((c) => c.id === S.channelId);
  $('#stage-title').textContent = ch ? ch.name : '';
  const members = [...S.users.values()].filter((u) => u.channelId === S.channelId);
  $('#stage-sub').textContent = `${members.length} kişi`;
  $('#chat-head').textContent = ch ? `# ${ch.name}` : 'Sohbet';

  // Yayın şeridi
  const sharers = members.filter((u) => u.sharing && u.id !== S.myId);
  const strip = $('#share-strip');
  strip.innerHTML = '';
  strip.classList.toggle('hidden', sharers.length === 0);
  for (const u of sharers) {
    const active = S.focusedShare === u.id && S.watching.has(u.id);
    strip.append(
      h(
        'div',
        {
          class: `share-pill ${active ? 'active' : ''}`,
          onclick: () => {
            if (!S.watching.has(u.id)) watch(u.id, true);
            else {
              S.focusedShare = u.id;
              renderStage();
            }
          },
        },
        avatar(u.name),
        h('span', { class: 'dotlive' }),
        `${u.name}${S.watching.has(u.id) ? '' : ' — İzle'}`
      )
    );
  }

  // İzleyici
  const viewer = $('#viewer');
  const vid = $('#viewer-video');
  const focus = S.focusedShare && S.watching.has(S.focusedShare) ? S.focusedShare : null;
  if (focus) {
    viewer.classList.remove('hidden');
    $('#participants').classList.add('hidden');
    $('#viewer-name').textContent = userName(focus);
    const sc = S.remoteScreens.get(focus);
    const want = sc?.video || null;
    if (vid.srcObject !== want) vid.srcObject = want;
    viewer.classList.toggle('waiting', !sc || !sc.video.getVideoTracks().length);
    if (!sc) $('#viewer-stats').textContent = 'Bağlanıyor…';
    if (sc?.audioEl) $('#viewer-volume').value = Math.round(sc.audioEl.volume * 100);
  } else {
    viewer.classList.add('hidden');
    vid.srcObject = null;
    $('#participants').classList.remove('hidden');
    renderParticipants(members);
  }
  $('#btn-share').disabled = !S.channelId;
}

function renderParticipants(members) {
  const box = $('#participants');
  box.innerHTML = '';
  if (members.length <= 1) {
    box.append(h('div', { class: 'empty-stage' }, h('div', {}, 'Bu kanalda şimdilik yalnızsın.'), h('div', { class: 'muted' }, 'Arkadaşların katıldığında burada görünecek.')));
  }
  for (const u of members.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
    if (members.length <= 1) break;
    const av = avatar(u.name);
    av.dataset.av = u.id;
    const flags = h('div', { class: 'p-flags' });
    if (u.muted) flags.insertAdjacentHTML('beforeend', ICON.micOff);
    if (u.deafened) flags.insertAdjacentHTML('beforeend', ICON.headOff);
    const isOther = u.id !== S.myId;
    box.append(
      h(
        'div',
        {
          class: `p-card ${u.sharing && isOther ? 'sharing' : ''}`,
          onclick: () => u.sharing && isOther && watch(u.id, true),
          oncontextmenu: (e) => userMenu(e, u),
        },
        u.sharing ? h('span', { class: 'live' }, 'CANLI') : null,
        flags,
        av,
        h('div', { class: 'p-name' }, u.name + (u.id === S.myId ? ' (sen)' : '')),
        u.sharing && isOther ? h('button', { class: 'btn share watch-btn' }, 'Yayını İzle') : null
      )
    );
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
  $('#me-status').textContent = S.deafened ? 'Ses kapalı' : S.muted ? 'Mikrofon kapalı' : modeTxt;
}

// ---------- Sohbet ----------
let lastMsgFrom = null;
function renderChat() {
  const box = $('#chat-log');
  box.innerHTML = '';
  lastMsgFrom = null;
  for (const m of S.chat.get(S.channelId) || []) appendChat(m, false);
  box.scrollTop = box.scrollHeight;
}

function appendChat(m, scroll = true) {
  const box = $('#chat-log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const time = new Date(m.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  let el;
  if (m.system) {
    el = h('div', { class: 'msg sys' }, `${m.text} · ${time}`);
    lastMsgFrom = null;
  } else if (lastMsgFrom === m.name) {
    el = h('div', { class: 'msg cont' }, h('div', { class: 'msg-text' }));
    el.querySelector('.msg-text').innerHTML = linkify(m.text);
  } else {
    el = h(
      'div',
      { class: 'msg' },
      avatar(m.name),
      h('div', { class: 'msg-body' }, h('div', { class: 'msg-head' }, h('span', { class: 'msg-name' }, m.name), h('span', { class: 'msg-time' }, time)), h('div', { class: 'msg-text' }))
    );
    el.querySelector('.msg-name').style.color = colorFor(m.name);
    el.querySelector('.msg-text').innerHTML = linkify(m.text);
    lastMsgFrom = m.name;
  }
  box.append(el);
  if (scroll && atBottom) box.scrollTop = box.scrollHeight;
}

// ---------- Kanallar ----------
function joinChannel(id) {
  if (id === S.channelId) return;
  send({ t: 'join', channelId: id });
}

function channelMenu(e, ch) {
  e.preventDefault();
  if (!S.isAdmin) {
    if (ch.id !== S.channelId) showCtx(e, [{ label: 'Kanala katıl', run: () => joinChannel(ch.id) }]);
    return;
  }
  showCtx(e, [
    ch.id !== S.channelId && { label: 'Kanala katıl', run: () => joinChannel(ch.id) },
    { label: 'Alt kanal oluştur', run: () => promptChannel(ch.id) },
    { label: 'Yeniden adlandır', run: () => renameChannel(ch) },
    '-',
    { label: 'Kanalı sil', danger: true, run: () => send({ t: 'deleteChannel', channelId: ch.id }) },
  ]);
}

function promptChannel(parent = null) {
  inlinePrompt(parent ? 'Alt kanal adı' : 'Kanal adı', '', (name) => send({ t: 'createChannel', name, parent }));
}
function renameChannel(ch) {
  inlinePrompt('Yeni kanal adı', ch.name, (name) => send({ t: 'renameChannel', channelId: ch.id, name }));
}

function userMenu(e, u) {
  e.preventDefault();
  if (u.id === S.myId) {
    return showCtx(e, [
      { label: S.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat', run: toggleMute },
      { label: S.deafened ? 'Sesi aç' : 'Sesi kapat', run: toggleDeafen },
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
    u.sharing && sameChannel && { label: S.watching.has(u.id) ? 'Yayını izlemeyi bırak' : 'Yayını izle', run: () => watch(u.id, !S.watching.has(u.id)) },
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
    { label: 'Dürt', run: () => inlinePrompt(`${u.name} kişisini dürt — mesaj (opsiyonel)`, '', (text) => send({ t: 'poke', to: u.id, text }), true) },
    !sameChannel && { label: 'Kanalına git', run: () => joinChannel(u.channelId) },
    ...(S.isAdmin
      ? [
          '-',
          { html: '<div class="ctx-label">Yönetici</div>' },
          ...S.channels
            .filter((c) => c.id !== u.channelId)
            .map((c) => ({ label: `Taşı → ${c.name}`, run: () => send({ t: 'move', to: u.id, channelId: c.id }) })),
          !u.muted && { label: 'Mikrofonunu kapat', run: () => send({ t: 'serverMute', to: u.id }) },
          {
            label: 'Sunucudan at',
            danger: true,
            run: () => inlinePrompt(`${u.name} atılacak — sebep (opsiyonel)`, '', (reason) => send({ t: 'kick', to: u.id, reason }), true),
          },
        ]
      : []),
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

function inlinePrompt(label, value, cb, allowEmpty = false) {
  const ctx = $('#ctx');
  ctx.innerHTML = '';
  const input = h('input', { value, class: 'prompt-input' });
  Object.assign(input.style, { width: '260px', height: '34px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--line)', background: 'var(--bg-0)', outline: 'none' });
  ctx.append(h('div', { class: 'ctx-label' }, label), h('div', { style: 'padding:6px 8px 8px' }, input));
  ctx.classList.remove('hidden');
  const r = $('#tree').getBoundingClientRect();
  ctx.style.left = r.left + 20 + 'px';
  ctx.style.top = r.top + 40 + 'px';
  input.focus();
  input.select();
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v || allowEmpty) cb(v);
      hideCtx();
    } else if (e.key === 'Escape') hideCtx();
  });
}

// ---------- Modallar ----------
function showModal(id) {
  $('#' + id).classList.remove('hidden');
}
function hideModal(id) {
  $('#' + id).classList.add('hidden');
}
$$('.modal').forEach((m) => {
  m.addEventListener('mousedown', (e) => e.target === m && m.classList.add('hidden'));
  $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => m.classList.add('hidden')));
});

// ---------- Mikrofon / hoparlör ----------
function toggleMute() {
  if (S.deafened) {
    S.deafened = false;
    S.muted = false;
  } else S.muted = !S.muted;
  beep(S.muted ? 'mute' : 'unmute');
  send({ t: 'status', muted: S.muted, deafened: S.deafened });
  for (const id of audio.remote.keys()) applyRemoteVolume(id);
  renderControls();
}
function toggleDeafen() {
  S.deafened = !S.deafened;
  if (S.deafened) S.muted = true;
  else S.muted = false;
  beep(S.deafened ? 'mute' : 'unmute');
  send({ t: 'status', muted: S.muted, deafened: S.deafened });
  for (const id of audio.remote.keys()) applyRemoteVolume(id);
  for (const id of S.remoteScreens.keys()) applyRemoteVolume(id);
  renderControls();
}

// ---------- Ayarlar ----------
async function openSettings() {
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
  $('#set-mode').value = settings.mode;
  $('#set-vad').value = settings.vad;
  $('#set-ns').checked = settings.ns;
  $('#set-ec').checked = settings.ec;
  $('#set-agc').checked = settings.agc;
  $('#set-sounds').checked = settings.sounds;
  $('#set-codec').value = settings.codec;
  $('#set-autowatch').checked = settings.autoWatch;
  updateSettingsUi();
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
  if (e.key === 'f' && document.activeElement?.tagName !== 'INPUT' && !$('#viewer').classList.contains('hidden')) toggleFullscreen();
  if (e.key === 'Escape') {
    hideCtx();
    $$('.modal').forEach((m) => m.classList.add('hidden'));
  }
});
window.addEventListener('keyup', (e) => {
  if (!S.pttGlobal && settings.mode === 'ptt' && e.code === settings.pttKey) S.pttDown = false;
});
window.addEventListener('blur', () => {
  if (!S.pttGlobal) S.pttDown = false;
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#viewer').requestFullscreen().catch(() => {});
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
$('#btn-stop-share').addEventListener('click', stopShare);
$('#btn-go-live').addEventListener('click', goLive);
$('#btn-add-channel').addEventListener('click', () => promptChannel(null));
$('#btn-viewer-full').addEventListener('click', toggleFullscreen);
$('#viewer-video').addEventListener('dblclick', toggleFullscreen);
$('#btn-viewer-stop').addEventListener('click', () => S.focusedShare && watch(S.focusedShare, false));
$('#viewer-volume').addEventListener('input', (e) => {
  const sc = S.remoteScreens.get(S.focusedShare);
  if (sc?.audioEl) sc.audioEl.volume = Number(e.target.value) / 100;
});
$$('#picker-tabs .tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('#picker-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
    pickerType = t.dataset.type;
    renderSources();
  })
);
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#chat-input').value.trim();
  if (!v) return;
  send({ t: 'chat', text: v });
  $('#chat-input').value = '';
});
navigator.mediaDevices.addEventListener('devicechange', async () => {
  if (audio.micTrack?.readyState === 'ended') await startMic();
});

// =====================================================================
//  Yönetim paneli
// =====================================================================
const ICON_CROWN = () => {
  const span = document.createElement('span');
  span.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Zm2 13h14v2H5v-2Z"/></svg>';
  return span.firstChild;
};

function applyAdminUi() {
  $('#btn-admin').classList.toggle('hidden', !S.isAdmin);
  $('#btn-add-channel').classList.toggle('hidden', !S.isAdmin);
}

const fmtDuration = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk`;
  const hrs = Math.floor(m / 60);
  return hrs < 24 ? `${hrs} sa ${m % 60} dk` : `${Math.floor(hrs / 24)} gün ${hrs % 24} sa`;
};

let adminTimer = null;
function openAdminPanel() {
  if (!S.isAdmin) return;
  $('#adm-name').value = S.serverName;
  $('#adm-password').value = '';
  $('#adm-nopass').checked = false;
  $('#adm-stop').textContent = 'Sunucuyu Kapat';
  delete $('#adm-stop').dataset.confirm;
  showModal('admin-panel');
  refreshAdmin();
  clearInterval(adminTimer);
  adminTimer = setInterval(() => {
    if ($('#admin-panel').classList.contains('hidden')) return clearInterval(adminTimer);
    refreshAdmin();
  }, 3000);
}

async function refreshAdmin() {
  send({ t: 'adminInfo' });
  const st = await kanki.serverStatus();
  const hostingHere = !!(st.hosting && S.hosting);
  $('#adm-host-section').classList.toggle('hidden', !hostingHere);
  const box = $('#adm-addresses');
  box.innerHTML = '';
  const addAddr = (text, note, cls = '') =>
    box.append(
      h(
        'div',
        {
          class: `addr ${cls}`,
          title: 'Kopyalamak için tıkla',
          onclick: () => {
            navigator.clipboard.writeText(text);
            toast('Adres kopyalandı', text);
          },
        },
        h('span', {}, text),
        h('small', {}, note)
      )
    );
  if (hostingHere) {
    if (st.tunnelUrl) addAddr(st.tunnelUrl.replace(/^https:\/\//, ''), 'internet (ngrok)', 'public');
    for (const a of st.addresses) addAddr(`${a.address}:${st.port}`, 'yerel ağ');
    if (!st.tunnelUrl) box.append(h('div', { class: 'muted', style: 'font-size:12px;width:100%' }, 'İnternetten bağlanılabilmesi için sunucuyu "İnternete aç (ngrok)" seçeneğiyle başlat.'));
  } else {
    addAddr(S.url.replace(/^wss?:\/\//, ''), 'bağlı olduğun sunucu');
  }
}

function renderAdminInfo(m) {
  $('#adm-count').textContent = m.users.length;
  $('#adm-channels').textContent = S.channels.length;
  $('#adm-uptime').textContent = fmtDuration(m.now - m.startedAt);
  $('#adm-haspass').textContent = m.hasPassword ? 'Var' : 'Yok';
  const tbody = $('#adm-users');
  if (tbody.contains(document.activeElement)) return; // açık bir seçim kutusunu bozma
  tbody.innerHTML = '';
  const chName = (id) => S.channels.find((c) => c.id === id)?.name || '—';
  for (const u of m.users.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
    const isMe = u.id === S.myId;
    const select = h('select', { title: 'Kanala taşı' });
    for (const c of S.channels) {
      const opt = h('option', { value: c.id }, c.name);
      if (c.id === u.channelId) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      send({ t: 'move', to: u.id, channelId: select.value });
      select.blur();
    });
    const nameCell = h('div', { class: 'uname-cell' }, avatar(u.name), h('span', {}, u.name + (isMe ? ' (sen)' : '')));
    if (u.admin) nameCell.append(h('span', { class: 'crown', title: 'Yönetici' }, ICON_CROWN()));
    tbody.append(
      h(
        'tr',
        {},
        h('td', {}, nameCell),
        h('td', {}, select),
        h('td', { class: 'muted' }, u.ip || '—'),
        h('td', { class: 'muted' }, fmtDuration(m.now - u.connectedAt)),
        h(
          'td',
          { class: 'actions' },
          isMe
            ? null
            : h(
                'button',
                {
                  class: 'btn danger sm',
                  onclick: () => {
                    send({ t: 'kick', to: u.id, reason: '' });
                    setTimeout(refreshAdmin, 400);
                  },
                },
                'At'
              )
        )
      )
    );
  }
  void chName;
}

$('#btn-admin').addEventListener('click', openAdminPanel);
$('#adm-save').addEventListener('click', () => {
  const msg = { t: 'setServer', name: $('#adm-name').value.trim() };
  if ($('#adm-nopass').checked) msg.password = '';
  else if ($('#adm-password').value) msg.password = $('#adm-password').value;
  send(msg);
  $('#adm-password').value = '';
  $('#adm-nopass').checked = false;
  setTimeout(refreshAdmin, 300);
});
$('#adm-show-key').addEventListener('click', (e) => {
  e.preventDefault();
  if (!S.adminKey) return;
  navigator.clipboard.writeText(S.adminKey);
  toast('Yönetici anahtarı kopyalandı', 'Bu anahtarı kimseyle paylaşma; sahibi sunucuyu yönetebilir.');
});
$('#adm-stop').addEventListener('click', async () => {
  const btn = $('#adm-stop');
  if (!btn.dataset.confirm) {
    btn.dataset.confirm = '1';
    btn.textContent = 'Emin misin? Herkesin bağlantısı kesilir';
    return;
  }
  await kanki.stopServer();
  S.hosting = null;
  $('#host-chip').classList.add('hidden');
  disconnect();
  setConnectError('Sunucu kapatıldı.');
});

// =====================================================================
//  Başlangıç
// =====================================================================
(async function init() {
  const info = await kanki.info();
  S.platform = info.platform;
  S.pttGlobal = info.pttAvailable;
  document.body.classList.add(info.platform === 'darwin' ? 'mac' : 'win');
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
      setInterval(() => {
        g.fillStyle = `hsl(${n % 360},60%,30%)`;
        g.fillRect(0, 0, 1920, 1080);
        g.fillStyle = '#fff';
        g.font = 'bold 120px sans-serif';
        g.fillText(`Kanki test ${n++}`, 200, 560);
      }, 1000 / 30);
      startShareWithStream(c.captureStream(30), { fps: 30, res: 1080, bitrate: 6000, hint: 'detail' });
    }
    setInterval(async () => {
      const report = { me: S.myName, peers: [] };
      for (const p of S.peers.values()) {
        const s = await p.stats();
        report.peers.push({
          with: userName(p.id),
          state: p.pc.connectionState,
          video: s ? `${s.frameWidth}x${s.frameHeight} fps=${Math.round(s.framesPerSecond || 0)} bytes=${s.bytesReceived}` : null,
          speakingAudio: audio.remote.has(p.id),
        });
      }
      report.watching = [...S.watching].map(userName);
      report.watchers = [...S.watchers].map(userName);
      console.log('AUTOTEST ' + JSON.stringify(report));
    }, 3000);
  }
})();
