'use strict';
/* global kankiBot */
/**
 * Kanki Müzik Botu — Kanki Admin içinde görünmez bir pencerede çalışan ayrı bir kullanıcı.
 * Kanala katılır ve çaldığı müziği herkese normal bir konuşmacı gibi (WebRTC ile) gönderir.
 * Komutlar sohbetten ("!çal ...") ya da arayüzdeki müzik panelinden sunucu üzerinden gelir.
 */
const qs = new URLSearchParams(location.search);
const WS_URL = qs.get('ws');
const BOT_KEY = qs.get('key');
const log = (...a) => console.log('[bot]', ...a);

const B = {
  ws: null,
  myId: null,
  ice: [],
  users: new Map(),
  channels: [],
  channelId: null,
  peers: new Map(),
  queue: [], // { title, url, duration, thumbnail, by, direct }
  current: null,
  paused: false,
  volume: 70,
  loop: false,
  aloneSince: 0,
  playToken: 0,
};

// ---------- Ses yolu: <audio> → kazanç → WebRTC (bu bilgisayarın hoparlörüne gitmez) ----------
const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
const el = new Audio();
el.preload = 'auto';
const srcNode = ctx.createMediaElementSource(el);
const gain = ctx.createGain();
gain.gain.value = B.volume / 100;
const dest = ctx.createMediaStreamDestination();
dest.channelCount = 2;
srcNode.connect(gain).connect(dest);
const musicTrack = dest.stream.getAudioTracks()[0];
musicTrack.contentHint = 'music';

// ---------- Sunucu bağlantısı ----------
function send(m) {
  if (B.ws && B.ws.readyState === 1) B.ws.send(JSON.stringify(m));
}
function connect() {
  const ws = new WebSocket(WS_URL);
  B.ws = ws;
  ws.onopen = () => send({ t: 'hello', name: 'Müzik Botu', botKey: BOT_KEY, muted: false, deafened: false });
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    onMessage(m);
  };
  ws.onclose = () => {
    for (const p of B.peers.values()) p.close();
    B.peers.clear();
    B.channelId = null;
    setTimeout(connect, 3000);
  };
}
function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      B.myId = m.id;
      B.ice = m.iceServers || [];
      log('bağlandı', m.id);
      break;
    case 'state': {
      B.users = new Map(m.users.map((u) => [u.id, u]));
      B.channels = m.channels || [];
      const prev = B.channelId;
      B.channelId = B.users.get(B.myId)?.channelId || null;
      if (prev !== B.channelId) {
        for (const p of B.peers.values()) p.close();
        B.peers.clear();
        pushState();
      }
      syncPeers();
      break;
    }
    case 'signal': {
      let p = B.peers.get(m.from);
      const u = B.users.get(m.from);
      if (!p && u && u.channelId === B.channelId && B.channelId) {
        p = new BotPeer(m.from);
        B.peers.set(m.from, p);
      }
      p?.handle(m.data);
      break;
    }
    case 'botCmd':
      handleCmd(m).catch((e) => log('komut', e.message));
      break;
  }
}
const humansIn = (cid) => [...B.users.values()].filter((u) => u.channelId === cid && !u.bot);
function syncPeers() {
  const want = new Set(B.channelId ? humansIn(B.channelId).map((u) => u.id) : []);
  for (const [id, p] of B.peers) if (!want.has(id)) (p.close(), B.peers.delete(id));
  for (const id of want) if (!B.peers.has(id)) B.peers.set(id, new BotPeer(id));
}

// ---------- WebRTC (Kanki istemcileriyle aynı "kibar/kaba" el sıkışma) ----------
function mungeOpus(sdp) {
  return sdp.replace(/a=fmtp:(\d+) (.*useinbandfec=1.*)/g, (line, pt, params) => {
    if (/stereo=1/.test(params)) return line;
    return `a=fmtp:${pt} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=128000`;
  });
}
class BotPeer {
  constructor(id) {
    this.id = id;
    this.polite = B.myId > id;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.queue = Promise.resolve();
    const pc = (this.pc = new RTCPeerConnection({ iceServers: B.ice, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' }));
    this.sender = pc.addTrack(musicTrack, dest.stream);
    pc.onnegotiationneeded = () => {
      if (this.polite && !pc.remoteDescription) {
        clearTimeout(this.offerTimer);
        this.offerTimer = setTimeout(() => !pc.remoteDescription && pc.signalingState === 'stable' && this.makeOffer(), 2500);
        return;
      }
      this.makeOffer();
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal({ candidate: candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.tune();
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    this.lastTry = Date.now();
    this.watchdog = setInterval(() => {
      const st = pc.connectionState;
      if (st === 'connected' || st === 'closed') return;
      if (pc.signalingState === 'stable' && Date.now() - this.lastTry > (this.polite ? 20000 : 12000)) {
        this.lastTry = Date.now();
        pc.restartIce();
      }
    }, 3000);
  }
  async makeOffer() {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.signal({ desc: this.pc.localDescription.toJSON() });
    } catch (e) {
      log('teklif', e.message);
    } finally {
      this.makingOffer = false;
    }
  }
  signal(data) {
    send({ t: 'signal', to: this.id, data });
  }
  async tune() {
    try {
      const p = this.sender.getParameters();
      if (p.encodings?.length) {
        p.encodings[0].maxBitrate = 160000;
        p.encodings[0].priority = 'high';
        await this.sender.setParameters(p);
      }
    } catch {}
  }
  handle(data) {
    this.queue = this.queue.then(() => this._handle(data)).catch((e) => log('sinyal', e.message));
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
      } catch {}
    }
    // Diğer sinyaller (yayın izleme vb.) bota ait değil
  }
  close() {
    clearInterval(this.watchdog);
    clearTimeout(this.offerTimer);
    try {
      this.pc.close();
    } catch {}
  }
}

// ---------- Komutlar ----------
const CMDS = {
  çal: 'play', cal: 'play', play: 'play', p: 'play', oynat: 'play',
  geç: 'skip', gec: 'skip', skip: 'skip', s: 'skip', sonraki: 'skip', next: 'skip',
  duraklat: 'pause', pause: 'pause', bekle: 'pause',
  devam: 'resume', resume: 'resume',
  dur: 'stop', stop: 'stop', durdur: 'stop',
  kuyruk: 'queue', queue: 'queue', q: 'queue', liste: 'queue', sıra: 'queue',
  temizle: 'clear', clear: 'clear',
  çıkar: 'remove', cikar: 'remove', remove: 'remove', sil: 'remove',
  ses: 'volume', volume: 'volume', vol: 'volume',
  şimdi: 'np', simdi: 'np', np: 'np', çalan: 'np', calan: 'np',
  gel: 'join', katıl: 'join', katil: 'join', join: 'join',
  ayrıl: 'leave', ayril: 'leave', leave: 'leave', git: 'leave', çık: 'leave',
  karıştır: 'shuffle', karistir: 'shuffle', shuffle: 'shuffle',
  tekrar: 'loop', loop: 'loop', döngü: 'loop',
  yardım: 'help', yardim: 'help', help: 'help', komutlar: 'help',
};
const fmt = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const chName = (cid) => B.channels.find((c) => c.id === cid)?.name || 'başka bir kanal';
let replyTo = null; // kanalda değilken yanıt isteyen kişiye özel gider
function say(text) {
  if (B.channelId) send({ t: 'chat', text });
  else if (replyTo) send({ t: 'botReplyTo', to: replyTo, text });
}
// Kanala geç ve sunucu onaylayana kadar bekle (yanıtlar o kanala yazılsın)
async function joinChannel(cid) {
  if (!cid || cid === B.channelId) return;
  send({ t: 'join', channelId: cid });
  for (let i = 0; i < 20 && B.channelId !== cid; i++) await new Promise((r) => setTimeout(r, 100));
}
// Komutu verenin kanalına geç (bot boşta ya da kimsenin olmadığı kanaldaysa)
function canMoveTo(cid) {
  return !B.channelId || B.channelId === cid || humansIn(B.channelId).length === 0 || (!B.current && !B.queue.length);
}

async function handleCmd(m) {
  const c = CMDS[m.cmd];
  if (!c) return;
  replyTo = m.from;
  const here = m.channelId && m.channelId === B.channelId;
  if (!m.channelId && c !== 'help') return say('Önce bir ses kanalına gir.');
  const needHere = ['skip', 'pause', 'resume', 'stop', 'clear', 'remove', 'volume', 'shuffle', 'loop', 'leave'];
  if (needHere.includes(c) && !here) return say(B.channelId ? `Bot şu an ${chName(B.channelId)} kanalında. Çağırmak için: !gel` : 'Bot şu an bir kanalda değil. Çağırmak için: !gel ya da !çal <şarkı>');

  switch (c) {
    case 'help':
      return say(
        '🎵 **Müzik botu komutları:** `!çal <YouTube linki ya da şarkı adı>` · `!geç` · `!duraklat` · `!devam` · `!dur` · `!kuyruk` · `!çıkar <sıra>` · `!temizle` · `!karıştır` · `!tekrar` · `!ses <0-100>` · `!şimdi` · `!gel` · `!ayrıl`'
      );
    case 'join':
      if (here) return say('Zaten buradayım 🎧');
      if (!canMoveTo(m.channelId)) return say(`Bot şu an ${chName(B.channelId)} kanalında çalıyor.`);
      await joinChannel(m.channelId);
      return say('👋 Geldim! Şarkı açmak için: `!çal <YouTube linki ya da şarkı adı>`');
    case 'leave':
      stopAll();
      send({ t: 'botLeave' });
      return;
    case 'play': {
      if (!m.arg) {
        if (B.paused) return resume(m.name);
        return say('Kullanım: `!çal <YouTube linki ya da şarkı adı>`');
      }
      if (!here) {
        if (!canMoveTo(m.channelId)) return say(`Bot şu an ${chName(B.channelId)} kanalında çalıyor. Orada bitince çağırabilirsin.`);
        await joinChannel(m.channelId);
      }
      const slow = setTimeout(() => say(`🔎 Aranıyor: ${m.arg.slice(0, 80)}`), 1500);
      const r = await kankiBot.resolve(m.arg);
      clearTimeout(slow);
      if (!r.ok) return say(`⚠️ Bulunamadı: ${r.error}`);
      if (!r.items.length) return say('⚠️ Sonuç bulunamadı.');
      const items = r.items.map((x) => ({ ...x, by: m.name }));
      const wasIdle = !B.current;
      B.queue.push(...items);
      if (wasIdle) {
        if (items.length > 1) say(`📃 ${items.length} şarkı kuyruğa eklendi.`);
        await playNext();
      } else {
        say(items.length > 1 ? `📃 ${items.length} şarkı kuyruğa eklendi.` : `➕ Kuyruğa eklendi (#${B.queue.length}): **${items[0].title}**${items[0].duration ? ` (${fmt(items[0].duration)})` : ''}`);
        pushState();
        if (!B.loading) prefetchNext();
      }
      return;
    }
    case 'skip':
      if (!B.current) return say('Şu an çalan bir şey yok.');
      say(`⏭ Geçildi: ${B.current.title}`);
      return playNext(true);
    case 'pause':
      if (!B.current || B.paused) return;
      el.pause();
      B.paused = true;
      pushState();
      return say(`⏸ Duraklatıldı (${m.name}).`);
    case 'resume':
      return resume(m.name);
    case 'stop':
      stopAll();
      return say(`⏹ Durduruldu ve kuyruk temizlendi (${m.name}).`);
    case 'queue': {
      if (!B.current && !B.queue.length) return say('Kuyruk boş. Eklemek için: `!çal <şarkı>`');
      const lines = [];
      if (B.current) lines.push(`▶ **${B.current.title}** — ${fmt(el.currentTime)}/${fmt(B.current.duration)} · ${B.current.by}`);
      B.queue.slice(0, 10).forEach((x, i) => lines.push(`${i + 1}. ${x.title}${x.duration ? ` (${fmt(x.duration)})` : ''} · ${x.by}`));
      if (B.queue.length > 10) lines.push(`… ve ${B.queue.length - 10} şarkı daha`);
      return say(lines.join('\n'));
    }
    case 'clear':
      B.queue = [];
      pushState();
      return say('🧹 Kuyruk temizlendi.');
    case 'remove': {
      const n = parseInt(m.arg, 10);
      if (!n || n < 1 || n > B.queue.length) return say(`Kullanım: \`!çıkar <1-${B.queue.length || 1}>\``);
      const [x] = B.queue.splice(n - 1, 1);
      pushState();
      return say(`🗑 Kuyruktan çıkarıldı: ${x.title}`);
    }
    case 'volume': {
      const v = parseInt(m.arg, 10);
      if (Number.isNaN(v)) return say(`🔊 Ses: %${B.volume}`);
      B.volume = Math.max(0, Math.min(100, v));
      gain.gain.setTargetAtTime(B.volume / 100, ctx.currentTime, 0.05);
      pushState();
      return say(`🔊 Ses %${B.volume} yapıldı.`);
    }
    case 'np':
      if (!B.current) return say('Şu an çalan bir şey yok.');
      return say(`🎵 **${B.current.title}** — ${fmt(el.currentTime)}/${fmt(B.current.duration)} · isteyen: ${B.current.by}${B.current.url && !B.current.direct ? `\n${B.current.url}` : ''}`);
    case 'shuffle':
      for (let i = B.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [B.queue[i], B.queue[j]] = [B.queue[j], B.queue[i]];
      }
      pushState();
      return say('🔀 Kuyruk karıştırıldı.');
    case 'loop':
      B.loop = !B.loop;
      pushState();
      return say(B.loop ? '🔁 Şu anki şarkı tekrar edecek.' : '➡️ Tekrar kapalı.');
  }
}
function resume(by) {
  if (!B.current || !B.paused) return;
  ctx.resume();
  el.play().catch(() => {});
  B.paused = false;
  pushState();
  say(`▶ Devam ediyor (${by}).`);
}
function stopAll() {
  B.queue = [];
  B.current = null;
  B.paused = false;
  B.loading = false;
  B.playToken++;
  el.pause();
  el.removeAttribute('src');
  el.load();
  pushState();
}

// ---------- Çalma ----------
async function playNext(skipped = false) {
  const token = ++B.playToken;
  let item;
  if (B.loop && B.current && !skipped) item = B.current;
  else item = B.queue.shift();
  if (!item) {
    B.current = null;
    B.paused = false;
    el.pause();
    el.removeAttribute('src');
    el.load();
    pushState();
    return;
  }
  B.current = { ...item };
  B.paused = false;
  B.loading = true;
  // Önceki şarkının konumu yeni şarkıya karışmasın
  el.pause();
  el.removeAttribute('src');
  el.load();
  pushState();
  try {
    const st = await kankiBot.stream(item.url);
    if (token !== B.playToken) return;
    if (!st.ok) throw new Error(st.error);
    if (st.title && !item.direct) Object.assign(B.current, { title: st.title, duration: st.duration || item.duration, thumbnail: st.thumbnail || item.thumbnail });
    // YouTube akışı bazen birkaç saniye sonra açılır (reklam süresi); erken istenirse 403 döner
    const wait = (st.availableAt || 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait + 400));
    if (token !== B.playToken) return;
    el.src = st.url;
    await ctx.resume();
    await el.play();
    if (token !== B.playToken) return;
    B.loading = false;
    prefetchNext();
    if (!(B.loop && !skipped && item === B.current)) say(`🎵 Çalıyor: **${B.current.title}**${B.current.duration ? ` (${fmt(B.current.duration)})` : ''} · isteyen: ${item.by}`);
  } catch (e) {
    if (token !== B.playToken) return;
    say(`⚠️ Çalınamadı: ${item.title} — ${String(e.message || e).slice(0, 140)}`);
    B.current = null;
    B.loading = false;
    setTimeout(() => token === B.playToken && playNext(), 400);
  }
  pushState();
}
el.addEventListener('ended', () => playNext());
// Sıradaki şarkının ses adresini önceden hazırla (geçişte yt-dlp ve YouTube'un bekletmesi beklenmesin)
let prefetched = '';
function prefetchNext() {
  const nx = B.queue[0];
  if (!nx || nx.direct || prefetched === nx.url) return;
  prefetched = nx.url;
  kankiBot.stream(nx.url).catch(() => {});
}
el.addEventListener('error', () => {
  if (!B.current || !el.getAttribute('src')) return;
  log('ses öğesi hatası', el.error?.code, el.error?.message);
  say(`⚠️ Akış kesildi: ${B.current.title}. Sıradakine geçiliyor.`);
  playNext(true);
});
el.addEventListener('playing', () => pushState()); // gerçek başlama anı (ilerleme çubuğu doğru başlasın)
el.addEventListener('loadedmetadata', () => {
  if (B.current && !B.current.duration && Number.isFinite(el.duration)) B.current.duration = Math.round(el.duration);
  pushState();
});

// ---------- Durumu herkese bildir (arayüzdeki müzik paneli için) ----------
let lastPush = 0;
function pushState() {
  lastPush = Date.now();
  send({
    t: 'botState',
    state: {
      id: B.myId,
      channelId: B.channelId,
      current: B.current ? { title: B.current.title, url: B.current.direct ? '' : B.current.url, thumbnail: B.current.thumbnail || '', duration: B.current.duration || 0, by: B.current.by } : null,
      position: el.currentTime || 0,
      at: Date.now(),
      paused: B.paused || (!!B.current && el.paused && !el.ended),
      loading: !!B.loading,
      volume: B.volume,
      loop: B.loop,
      queue: B.queue.slice(0, 25).map((x) => ({ title: x.title, duration: x.duration || 0, by: x.by })),
      queueLength: B.queue.length,
    },
  });
}
setInterval(() => {
  if (B.current && Date.now() - lastPush > 5000) pushState();
  // Kanalda 60 sn kimse yoksa dur ve ayrıl
  if (!B.channelId) return (B.aloneSince = 0);
  if (humansIn(B.channelId).length) return (B.aloneSince = 0);
  if (!B.aloneSince) B.aloneSince = Date.now();
  else if (Date.now() - B.aloneSince > 60000) {
    B.aloneSince = 0;
    stopAll();
    send({ t: 'botLeave' });
  }
}, 2000);

kankiBot.onStatus((text) => say(`⏳ ${text}`));
connect();
