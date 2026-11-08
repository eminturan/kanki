'use strict';
/**
 * Kanki sinyal sunucusu.
 * - Kullanıcı / kanal durumunu tutar
 * - WebRTC sinyallerini (offer/answer/ice) eşler arasında iletir
 * - Kanal içi yazılı sohbeti dağıtır
 * Ses ve görüntü bu sunucudan GEÇMEZ; istemciler arasında doğrudan (P2P) akar.
 *
 * Tek başına çalıştırma:  node server/server.js
 * Ortam değişkenleri:
 *   PORT=4455              dinlenecek port
 *   SERVER_NAME="Sunucu"   görünen ad
 *   SERVER_PASSWORD=...    (opsiyonel) giriş şifresi
 *   TURN_URL=turn:host:3478  TURN_USER=...  TURN_PASS=...   (opsiyonel TURN)
 *   DATA_DIR=./data        kanalların saklanacağı klasör
 *   ADMIN_KEY=...          yönetici anahtarı (verilmezse rastgele üretilip konsola yazılır)
 *
 * Yönetici yetkileri (kanal oluştur/sil/adlandır, kullanıcı taşı/at, sunucu ayarları)
 * sadece doğru yönetici anahtarıyla bağlanan kullanıcılara verilir.
 */
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_CHANNELS = [
  { name: 'genel', parent: null, type: 'text' },
  { name: 'Lobi', parent: null },
  { name: 'Sohbet', parent: null },
  { name: 'Oyun', parent: null },
  { name: 'Oyun Odası 1', parent: 'Oyun' },
  { name: 'Oyun Odası 2', parent: 'Oyun' },
  { name: 'AFK', parent: null },
];

function startServer(opts = {}) {
  const port = Number(opts.port || process.env.PORT || 4455);
  let serverName = opts.name || process.env.SERVER_NAME || 'Kanki Sunucusu';
  let password = opts.password ?? process.env.SERVER_PASSWORD ?? '';
  const adminKey = opts.adminKey || process.env.ADMIN_KEY || crypto.randomBytes(18).toString('base64url');
  // Müzik botu (Kanki Admin içinde çalışır) bu gizli anahtarla bağlanır
  const botKey = opts.botKey || crypto.randomBytes(18).toString('base64url');
  let botState = null; // botun son durumu (çalan şarkı, kuyruk) — herkese gönderilir
  const startedAt = Date.now();
  const safeEqual = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const log = opts.log || ((...a) => console.log('[kanki]', ...a));

  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const turnUrl = opts.turnUrl || process.env.TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((s) => s.trim()),
      username: opts.turnUser || process.env.TURN_USER || '',
      credential: opts.turnPass || process.env.TURN_PASS || '',
    });
  }

  // ---------- Kanallar ----------
  const channelsFile = path.join(dataDir, 'channels.json');
  let channels = [];
  function saveChannels() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(channelsFile, JSON.stringify(channels.filter((c) => !c.temporary), null, 2));
    } catch (e) {
      log('Kanallar kaydedilemedi:', e.message);
    }
  }
  try {
    channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
  } catch {
    const byName = {};
    channels = DEFAULT_CHANNELS.map((c, i) => {
      const ch = { id: crypto.randomUUID(), name: c.name, parent: c.parent ? byName[c.parent] : null, order: i, topic: '' };
      if (c.type === 'text') ch.type = 'text';
      byName[c.name] = ch.id;
      return ch;
    });
    saveChannels();
  }
  // Yazı kanalları: sese katılmadan herkesin okuyup yazabildiği kanallar (Discord'daki # kanallar)
  const textMarker = path.join(dataDir, '.text-channels-added');
  if (!channels.some((c) => c.type === 'text') && !fs.existsSync(textMarker)) {
    // Eski sunucuya bir kez "genel" yazı kanalı ekle (silinirse tekrar eklenmez)
    channels.unshift({ id: crypto.randomUUID(), name: 'genel', parent: null, order: -1, topic: '', type: 'text' });
    saveChannels();
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(textMarker, '1');
  } catch {}
  const isText = (cid) => channels.find((c) => c.id === cid)?.type === 'text';
  const lobbyId = () => channels.find((c) => c.type !== 'text' && !c.pwHash)?.id || channels.find((c) => c.type !== 'text')?.id;

  // ---------- Kalıcı sunucu ayarları (sohbet değil): moderatörler, yasaklar, AFK, GIF anahtarı ----------
  const confFile = path.join(dataDir, 'server-config.json');
  let conf = { roles: {}, bans: [], afkChannelId: null, afkMinutes: 15, gifProvider: 'klipy', gifKey: '' };
  try {
    conf = { ...conf, ...JSON.parse(fs.readFileSync(confFile, 'utf8')) };
  } catch {}
  function saveConf() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(confFile, JSON.stringify(conf, null, 2));
    } catch (e) {
      log('Ayarlar kaydedilemedi:', e.message);
    }
  }
  const afkId = () => (channels.find((c) => c.id === conf.afkChannelId && c.type !== 'text') || channels.find((c) => c.type !== 'text' && /^afk$/i.test(c.name)))?.id || null;
  const isModUser = (u) => !!u && !u.bot && conf.roles[u.clientKey]?.role === 'mod';
  const isMod = (u) => !!u && (u.admin || isModUser(u));
  const hashPw = (salt, pw) => crypto.scryptSync(String(pw), String(salt), 32).toString('hex');
  // Kanal şifresinin özeti kimseye gönderilmez; sadece "kilitli" bilgisi gider
  const publicChannel = (c) => {
    const { pwHash, salt, ...rest } = c;
    if (pwHash) rest.locked = true;
    return rest;
  };
  const voiceCount = (cid) => [...users.values()].filter((u) => u.channelId === cid && !u.bot).length;

  // ---------- Kullanıcılar ----------
  /** @type {Map<string, {id,name,channelId,muted,deafened,sharing,ws,alive}>} */
  const users = new Map();
  const chatHistory = new Map(); // channelId -> [{...}]
  // Yazı kanallarının geçmişi sadece bellekte tutulur: sunucu kapanınca silinir (ses kanalları gibi).
  // Önceki sürüm (1.0.16) geçmişi diske yazıyordu; o dosya kalmasın diye açılışta silinir.
  try {
    fs.rmSync(path.join(dataDir, 'text-history.json'), { force: true });
    fs.rmSync(path.join(dataDir, 'text-history.json.tmp'), { force: true });
  } catch {}
  // Mesajın gideceği kanal: yazı kanalı seçildiyse o, yoksa kişinin bulunduğu ses kanalı
  const chatTarget = (me, cid) => (cid && isText(cid) ? cid : me.channelId);
  // Yazı kanalı mesajları herkese, ses kanalı sohbeti sadece o kanaldakilere gider
  const audience = (cid) => (isText(cid) ? (u) => !u.bot : (u) => u.channelId === cid);

  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    channelId: u.channelId,
    muted: u.muted,
    deafened: u.deafened,
    sharing: u.sharing,
    shares: u.shares || [],
    away: u.away,
    presence: u.presence || 'online',
    statusText: u.statusText || '',
    nameStyle: u.nameStyle || null,
    hasAvatar: !!u.avatar,
    admin: !!u.admin,
    mod: isModUser(u),
    bot: !!u.bot,
    activity: u.activity || null,
    voteMuted: (u.voteMutedUntil || 0) > Date.now(),
  });
  const findBot = () => [...users.values()].find((u) => u.bot);
  // Sadece botun anladığı komutlar iletilir ("!!!" gibi mesajlar bota gitmesin)
  const BOT_WORDS = new Set(
    'çal cal play p oynat geç gec skip s sonraki next duraklat pause bekle devam resume dur stop durdur kuyruk queue q liste sıra temizle clear çıkar cikar remove sil ses volume vol şimdi simdi np çalan calan gel katıl katil join ayrıl ayril leave git çık karıştır karistir shuffle tekrar loop döngü yardım yardim help komutlar'.split(' ')
  );
  // "!çal ..." gibi sohbet komutlarını ya da müzik panelinden gelen komutları bota ilet
  function forwardToBot(me, cmd, arg) {
    const bot = findBot();
    if (!bot) return send(me.ws, { t: 'botReply', text: 'Bu sunucuda müzik botu çalışmıyor. Botu sunucuyu kuran kişinin Kanki Admin uygulaması çalıştırır.' });
    send(bot.ws, { t: 'botCmd', from: me.id, name: me.name, channelId: me.channelId, cmd: String(cmd || '').slice(0, 24).toLocaleLowerCase('tr'), arg: String(arg || '').slice(0, 500) });
  }

  // Profil fotoğrafı: küçük bir resim (data URL). Durum yayınlarını şişirmesin diye ayrı mesajla gider.
  const AVATAR_MAX = 60 * 1024;
  const IMAGE_MAX = 3 * 1024 * 1024;
  const isImageData = (s, max) => typeof s === 'string' && s.length <= max && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  const cleanStatus = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  // İsim stili (yazı tipi, efekt, renkler): sadece bilinen değerler kabul edilir
  const NS_FONTS = ['default', 'audiowide', 'pixel', 'pacifico', 'bangers', 'righteous', 'lobster', 'caveat', 'glitch', 'cinzel', 'fredoka', 'mono'];
  const NS_FX = ['none', 'gradient', 'neon', 'shimmer', 'rainbow', 'pulse', 'fire'];
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '');
  const cleanNameStyle = (st) => {
    if (!st || typeof st !== 'object') return null;
    const font = NS_FONTS.includes(st.font) ? st.font : 'default';
    const effect = NS_FX.includes(st.effect) ? st.effect : 'none';
    const out = { font, effect, c1: hex(st.c1), c2: hex(st.c2), inMessages: !!st.inMessages };
    return font === 'default' && effect === 'none' && !out.c1 ? null : out;
  };

  // Sohbet mesajı herkese giderken gizli alanlar (yazarın anahtarı) çıkarılır
  const pubMsg = (m) => {
    const { _k, ...rest } = m;
    return rest;
  };
  const findMsg = (channelId, id) => (chatHistory.get(channelId) || []).find((x) => x.id === id);
  const canModify = (me, msg) => !!msg && !msg.system && ((msg._k && msg._k === me.clientKey) || me.admin);

  function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  function broadcast(msg, filter) {
    const data = JSON.stringify(msg);
    for (const u of users.values()) {
      if (filter && !filter(u)) continue;
      if (u.ws.readyState === 1) u.ws.send(data);
    }
  }
  function broadcastState() {
    broadcast({
      t: 'state',
      serverName,
      channels: channels.map(publicChannel),
      users: [...users.values()].map(publicUser),
      afk: { channelId: afkId(), minutes: conf.afkMinutes },
    });
  }
  function systemChat(channelId, text) {
    const msg = { t: 'chat', id: crypto.randomUUID(), channelId, system: true, text, ts: Date.now() };
    pushHistory(channelId, msg);
    broadcast(msg, (u) => u.channelId === channelId);
  }
  function pushHistory(channelId, msg) {
    if (!chatHistory.has(channelId)) chatHistory.set(channelId, []);
    const arr = chatHistory.get(channelId);
    arr.push(msg);
    if (arr.length > 200) arr.splice(Math.max(0, arr.findIndex((x) => !x.pinned)), 1); // sabitlenmiş mesajlar silinmez
    // Bellek şişmesin: kanal başına en yeni 30 resim saklanır, eskilerinin yerine not kalır
    const withImg = arr.filter((x) => x.image);
    for (const x of withImg.slice(0, Math.max(0, withImg.length - 30))) {
      x.image = null;
      x.imageExpired = true;
    }
  }
  function moveUser(u, channelId) {
    const target = channels.find((c) => c.id === channelId);
    if (!target || target.type === 'text') return; // yazı kanalına katılınmaz, sadece okunur
    const old = u.channelId;
    if (old === channelId) return;
    u.channelId = channelId;
    u.sharing = false;
    u.shares = [];
    // Giriş/çıkış sohbete yazılmaz; uygulamadaki "Geçmiş" sekmesine düşer
    activity({ kind: 'move', id: u.id, name: u.name, from: old || null, to: channelId });
    for (const v of votes.values()) if (v.targetId === u.id) endVote(v, false);
    send(u.ws, { t: 'history', channelId, messages: (chatHistory.get(channelId) || []).map(pubMsg) });
    broadcastState();
  }

  function activity(ev, filter) {
    broadcast({ t: 'activity', ts: Date.now(), ...ev }, filter || ((u) => !u.bot));
  }
  const newMsg = (me, cid, text = '') => {
    const msg = { t: 'chat', id: crypto.randomUUID(), channelId: cid, from: me.id, name: me.name, text, ts: Date.now(), _k: me.clientKey };
    if (me.nameStyle) msg.ns = me.nameStyle;
    return msg;
  };
  const postMsg = (cid, msg) => {
    pushHistory(cid, msg);
    broadcast(pubMsg(msg), audience(cid));
  };
  const updateMsg = (cid, msg) => broadcast({ t: 'chatUpdate', channelId: cid, msg: pubMsg(msg) }, audience(cid));
  const errorTo = (u, message, code = 'info') => send(u.ws, { t: 'error', code, message });

  // ---------- Oylamayla susturma / AFK'ya gönderme ----------
  const votes = new Map(); // hedef kullanıcı id -> oylama
  const votePublic = (v) => ({ id: v.id, targetId: v.targetId, targetName: v.targetName, action: v.action, by: v.by, yes: v.yes.size, no: v.no.size, required: v.required, until: v.until });
  const sendVote = (v) => broadcast({ t: 'vote', vote: votePublic(v) }, (u) => u.channelId === v.channelId && !u.bot);
  function endVote(v, passed) {
    if (votes.get(v.targetId) !== v) return;
    clearTimeout(v.timer);
    votes.delete(v.targetId);
    broadcast({ t: 'voteEnd', id: v.id, passed, action: v.action, targetName: v.targetName }, (u) => u.channelId === v.channelId && !u.bot);
    activity({ kind: 'vote', passed, action: v.action, name: v.targetName, by: v.by, channelId: v.channelId });
    const target = users.get(v.targetId);
    if (!passed || !target || target.channelId !== v.channelId) return;
    if (v.action === 'mute') {
      target.voteMutedUntil = Date.now() + 10 * 60 * 1000;
      target.muted = true;
      send(target.ws, { t: 'forceMute', by: 'Kanal oylaması', until: target.voteMutedUntil });
      setTimeout(() => broadcastState(), 10 * 60 * 1000 + 500);
      broadcastState();
    } else if (afkId()) {
      send(target.ws, { t: 'moved', by: 'Kanal oylaması' });
      moveUser(target, afkId());
    }
  }

  // ---------- Bağlantı önizlemesi (yerel ağ adreslerine istek atılmaz) ----------
  const privateIp = (ip) => {
    ip = String(ip || '').toLowerCase();
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (net.isIPv4(v4)) {
      const [a, b] = v4.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
  };
  const safeLookup = (host, opts, cb) => {
    dns.lookup(host, { all: true }, (err, list) => {
      if (err) return cb(err);
      list = list.filter((a) => !privateIp(a.address));
      if (!list.length) return cb(new Error('blocked'));
      if (opts && opts.all) cb(null, list);
      else cb(null, list[0].address, list[0].family);
    });
  };
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 KankiPreview/1.0';
  function fetchText(url, max = 600 * 1024, hops = 0, accept = 'text/html,application/xhtml+xml') {
    return new Promise((resolve, reject) => {
      let u;
      try {
        u = new URL(url);
      } catch {
        return reject(new Error('url'));
      }
      if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port))) return reject(new Error('url'));
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(u, { lookup: safeLookup, timeout: 6000, headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'tr,en;q=0.8' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 4) {
          res.resume();
          return fetchText(new URL(res.headers.location, u).href, max, hops + 1, accept).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('status ' + res.statusCode));
        }
        const chunks = [];
        let got = 0;
        res.on('data', (c) => {
          chunks.push(c);
          got += c.length;
          if (got > max) res.destroy();
        });
        const done = () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] || ''), url: u.href });
        res.on('end', done);
        res.on('close', done);
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  }
  const decodeEntities = (t) =>
    String(t || '')
      .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
      .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  const previewCache = new Map();
  async function linkPreview(url) {
    if (previewCache.has(url)) return previewCache.get(url);
    let out = null;
    try {
      const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
      if (/^(youtube\.com|youtu\.be|music\.youtube\.com)$/.test(host)) {
        const r = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, 64 * 1024, 0, 'application/json');
        const j = JSON.parse(r.buf.toString('utf8'));
        out = { url, site: 'YouTube', title: String(j.title || '').slice(0, 200), desc: String(j.author_name || '').slice(0, 120), image: /^https:/.test(j.thumbnail_url) ? j.thumbnail_url : '', big: true };
      } else {
        const r = await fetchText(url);
        if (/^image\//.test(r.type)) out = r.url.startsWith('https:') ? { url, image: r.url, imageOnly: true } : null;
        else if (/html/.test(r.type)) {
          let cs = (/charset=([\w-]+)/i.exec(r.type) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(r.buf.toString('latin1').slice(0, 4000)) || [])[1] || 'utf-8';
          let html;
          try {
            html = new TextDecoder(cs.toLowerCase()).decode(r.buf);
          } catch {
            html = r.buf.toString('utf8');
          }
          const meta = (name) => {
            const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
            return tag ? decodeEntities(/content=(["'])([\s\S]*?)\1/i.exec(tag)?.[2] || '') : '';
          };
          const title = meta('og:title') || meta('twitter:title') || decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '');
          const desc = meta('og:description') || meta('twitter:description') || meta('description');
          let image = meta('og:image') || meta('og:image:url') || meta('twitter:image');
          try {
            image = image ? new URL(image, r.url).href : '';
          } catch {
            image = '';
          }
          if (title || desc)
            out = {
              url,
              site: (meta('og:site_name') || new URL(r.url).hostname.replace(/^www\./, '')).slice(0, 60),
              title: title.slice(0, 200),
              desc: desc.slice(0, 300),
              image: image.startsWith('https:') ? image.slice(0, 1000) : '',
              big: meta('twitter:card') === 'summary_large_image',
            };
        }
      }
    } catch {}
    previewCache.set(url, out);
    if (previewCache.size > 300) previewCache.delete(previewCache.keys().next().value);
    return out;
  }

  // ---------- GIF arama (anahtar sunucuda durur, herkes kullanabilir) ----------
  async function gifSearch(q) {
    const key = conf.gifKey;
    if (!key) return { error: 'nokey' };
    const giphy = conf.gifProvider === 'giphy';
    const path = giphy
      ? `/v1/gifs/${q ? 'search' : 'trending'}?api_key=${encodeURIComponent(key)}&limit=24&rating=pg-13&lang=tr${q ? '&q=' + encodeURIComponent(q) : ''}`
      : `/api/v1/${encodeURIComponent(key)}/gifs/${q ? 'search' : 'trending'}?per_page=24&page=1&locale=tr&customer_id=kanki${q ? '&q=' + encodeURIComponent(q) : ''}`;
    // KLIPY'nin adresi bazı belgelerde .com, bazılarında .co geçiyor: ilki olmazsa diğeri denenir
    let j = null;
    let lastErr = null;
    for (const host of giphy ? ['api.giphy.com'] : ['api.klipy.com', 'api.klipy.co']) {
      try {
        const r = await fetchText(`https://${host}${path}`, 2 * 1024 * 1024, 0, 'application/json');
        j = JSON.parse(r.buf.toString('utf8'));
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!j) throw lastErr || new Error('gif');
    const pick = (o) => (o && o.url ? { url: o.url, w: Number(o.width) || 0, h: Number(o.height) || 0 } : null);
    const items = giphy ? j.data || [] : j.data?.data || j.data || [];
    return {
      results: items
        .map((it) => {
          if (giphy) {
            const full = pick(it.images?.fixed_height) || pick(it.images?.original);
            const prev = pick(it.images?.fixed_height_small) || full;
            return full && { url: full.url, w: full.w, h: full.h, preview: prev.url, title: String(it.title || '').slice(0, 80) };
          }
          const f = it.file || {};
          const full = pick(f.md?.gif) || pick(f.sm?.gif) || pick(f.hd?.gif) || pick(f.md?.webp);
          const prev = pick(f.sm?.gif) || pick(f.xs?.gif) || pick(f.sm?.webp) || full;
          return full && { url: full.url, w: full.w, h: full.h, preview: prev.url, title: String(it.title || '').slice(0, 80) };
        })
        .filter((x) => x && /^https:\/\//.test(x.url)),
    };
  }
  const gifHostOk = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && /(^|\.)(giphy\.com|klipy\.com|klipy\.co)$/.test(u.hostname);
    } catch {
      return false;
    }
  };

  // ---------- Dosya gönderme: dosyalar sadece bellekte durur, sunucu kapanınca silinir ----------
  const FILE_MAX = 50 * 1024 * 1024;
  const FILES_TOTAL = 400 * 1024 * 1024;
  const files = new Map(); // id -> { buf, name, type, size, by, at }
  const userByToken = (tok) => (tok ? [...users.values()].find((u) => u.token && safeEqual(u.token, tok)) : null);
  function trimFiles() {
    let total = 0;
    for (const f of files.values()) total += f.size;
    for (const [id, f] of files) {
      if (total <= FILES_TOTAL && Date.now() - f.at < 12 * 3600 * 1000) break;
      files.delete(id);
      total -= f.size;
    }
  }
  const cleanFileName = (n) => String(n || 'dosya').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'dosya';

  const httpServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'POST' && u.pathname === '/upload') {
      const user = userByToken(String(req.headers['x-kanki-token'] || ''));
      const size = Number(req.headers['content-length'] || 0);
      if (!user) {
        req.resume();
        return json(403, { error: 'Yetkisiz' });
      }
      if (!size || size > FILE_MAX) {
        req.resume();
        return json(413, { error: 'Dosya en fazla 50 MB olabilir.' });
      }
      const chunks = [];
      let got = 0;
      req.on('data', (c) => {
        got += c.length;
        if (got > FILE_MAX) return req.destroy();
        chunks.push(c);
      });
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        const id = crypto.randomBytes(18).toString('base64url');
        let name = 'dosya';
        try {
          name = cleanFileName(decodeURIComponent(String(req.headers['x-file-name'] || 'dosya')));
        } catch {}
        files.set(id, { buf, name, type: String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100), size: buf.length, by: user.id, at: Date.now() });
        trimFiles();
        json(200, { id, name, size: buf.length });
      });
      return;
    }
    const fm = /^\/f\/([A-Za-z0-9_-]{20,40})$/.exec(u.pathname);
    if (req.method === 'GET' && fm) {
      const f = files.get(fm[1]);
      if (!userByToken(u.searchParams.get('k') || '')) return json(403, { error: 'Yetkisiz' });
      if (!f) return json(404, { error: 'Dosya artık sunucuda yok (sunucu yeniden başlamış ya da süresi dolmuş olabilir).' });
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': f.size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(f.buf);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${serverName} çalışıyor. Bağlı kullanıcı: ${users.size}\n`);
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 4 * 1024 * 1024 }); // sohbette resim gönderilebilsin

  wss.on('connection', (ws, req) => {
    let me = null;
    // ngrok gibi tüneller gerçek IP'yi X-Forwarded-For başlığında iletir
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '');

    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!me) {
        if (m.t !== 'hello') return;
        const isAdmin = !!m.adminKey && safeEqual(m.adminKey, adminKey);
        const isBot = !!m.botKey && safeEqual(m.botKey, botKey);
        if (password && !isAdmin && !isBot && m.password !== password) {
          send(ws, { t: 'error', code: 'bad_password', message: 'Sunucu şifresi hatalı.' });
          return ws.close();
        }
        const ck = String(m.clientKey || '').slice(0, 64);
        const banned = !isAdmin && !isBot && conf.bans.find((b) => (ck && b.key === ck) || (b.ip && b.ip === ip));
        if (banned) {
          send(ws, { t: 'error', code: 'banned', message: `Bu sunucudan yasaklandın${banned.reason ? ': ' + banned.reason : '.'}` });
          return ws.close();
        }
        let name = isBot ? 'Müzik Botu' : String(m.name || '').trim().slice(0, 32) || 'Misafir';
        const taken = new Set([...users.values()].map((u) => u.name.toLowerCase()));
        let n = 2;
        const base = name;
        while (taken.has(name.toLowerCase())) name = `${base} (${n++})`;
        me = {
          id: crypto.randomUUID(),
          name,
          channelId: null,
          muted: !!m.muted,
          deafened: !!m.deafened,
          sharing: false,
          shares: [],
          away: false,
          presence: ['online', 'idle', 'dnd'].includes(m.presence) ? m.presence : 'online',
          statusText: cleanStatus(m.statusText),
          nameStyle: cleanNameStyle(m.nameStyle),
          avatar: isImageData(m.avatar, AVATAR_MAX) ? m.avatar : null,
          clientKey: String(m.clientKey || '').slice(0, 64) || crypto.randomUUID(), // mesaj düzenleme/silme yetkisi için
          admin: isAdmin,
          bot: isBot,
          token: crypto.randomBytes(18).toString('base64url'), // dosya yükleme/indirme için
          ip,
          connectedAt: Date.now(),
          ws,
          alive: true,
        };
        users.set(me.id, me);
        log(`Bağlandı: ${name} (${ip})${isAdmin ? ' [yönetici]' : ''}`);
        if (m.adminKey && !isAdmin) send(ws, { t: 'error', code: 'bad_admin_key', message: 'Yönetici anahtarı hatalı; normal kullanıcı olarak bağlandın.' });
        send(ws, {
          t: 'welcome',
          id: me.id,
          name,
          serverName,
          iceServers,
          admin: isAdmin,
          mod: isModUser(me),
          token: me.token,
          features: ['sfx', 'activity', 'log', 'pins', 'polls', 'votes', 'files', 'preview', 'gif', 'roles', 'chpass', 'afk', 'bans', 'marks', 'watch'],
        });
        const avatars = {};
        for (const u of users.values()) if (u.avatar) avatars[u.id] = u.avatar;
        send(ws, { t: 'avatars', avatars });
        if (me.avatar) broadcast({ t: 'avatar', id: me.id, data: me.avatar }, (u) => u.id !== me.id);
        if (isBot) {
          // Bot bir kanala çağrılana kadar hiçbir kanalda durmaz
          broadcastState();
          return;
        }
        send(ws, { t: 'botState', state: botState });
        const wch = channels.find((c) => c.id === m.channelId && c.type !== 'text');
        // Şifreli ya da dolu kanala yeniden bağlanırken Lobi'ye düşülür
        const wanted = wch && (isAdmin || (!wch.pwHash && !(wch.limit && voiceCount(wch.id) >= wch.limit))) ? wch.id : lobbyId();
        moveUser(me, wanted);
        return;
      }

      const ADMIN_ONLY = ['createChannel', 'renameChannel', 'deleteChannel', 'setServer', 'adminInfo', 'setRole', 'ban', 'unban', 'channelSettings', 'setConfig'];
      const MOD_OK = ['kick', 'move', 'serverMute']; // moderatör de yapabilir
      if ((ADMIN_ONLY.includes(m.t) && !me.admin) || (MOD_OK.includes(m.t) && !isMod(me))) {
        send(ws, { t: 'error', code: 'forbidden', message: 'Bu işlem için yönetici yetkisi gerekiyor.' });
        return;
      }

      switch (m.t) {
        case 'join': {
          const ch = channels.find((c) => c.id === m.channelId);
          if (!ch || ch.type === 'text' || ch.id === me.channelId) break;
          if (!isMod(me)) {
            if (ch.limit && voiceCount(ch.id) >= ch.limit) {
              errorTo(me, `${ch.name} dolu (en fazla ${ch.limit} kişi).`, 'channel_full');
              break;
            }
            if (ch.pwHash && !me.unlocked?.has(ch.id)) {
              const tried = typeof m.password === 'string';
              if (!tried || !safeEqual(hashPw(ch.salt, m.password.slice(0, 100)), ch.pwHash)) {
                send(ws, { t: 'needPassword', channelId: ch.id, name: ch.name, wrong: tried });
                break;
              }
              (me.unlocked ||= new Set()).add(ch.id);
            }
          }
          moveUser(me, ch.id);
          break;
        }
        case 'status':
          if ('muted' in m) me.muted = !!m.muted || (me.voteMutedUntil || 0) > Date.now();
          if ('deafened' in m) me.deafened = !!m.deafened;
          if ('sharing' in m) me.sharing = !!m.sharing;
          if (Array.isArray(m.shares)) {
            // Aynı anda en fazla 4 yayın (3 ekran + kamera); her biri { id, label, kind? }
            me.shares = m.shares
              .slice(0, 4)
              .map((x) => {
                const s = { id: String(x?.id || '').slice(0, 40), label: String(x?.label || 'Ekran').slice(0, 60) };
                if (x?.kind === 'camera') s.kind = 'camera';
                return s;
              })
              .filter((x) => x.id);
            me.sharing = me.shares.length > 0;
          } else if ('sharing' in m && !m.sharing) {
            me.shares = [];
          }
          if ('away' in m) me.away = !!m.away;
          if (['online', 'idle', 'dnd'].includes(m.presence)) {
            me.presence = m.presence;
            me.away = m.presence === 'idle';
          }
          broadcastState();
          break;
        case 'signal': {
          const target = users.get(m.to);
          if (target && target.channelId === me.channelId) send(target.ws, { t: 'signal', from: me.id, data: m.data });
          break;
        }
        case 'chat': {
          const text = String(m.text || '').slice(0, 2000).trim();
          const image = isImageData(m.image, IMAGE_MAX) ? m.image : null;
          const cid = chatTarget(me, m.channelId);
          const file = m.file && files.get(String(m.file));
          const gif = m.gif && gifHostOk(m.gif.url) ? { url: String(m.gif.url).slice(0, 1000), w: Math.min(2000, Number(m.gif.w) || 0), h: Math.min(2000, Number(m.gif.h) || 0) } : null;
          if ((!text && !image && !(file && file.by === me.id) && !gif) || !cid) break;
          const msg = { t: 'chat', id: crypto.randomUUID(), channelId: cid, from: me.id, name: me.name, text, ts: Date.now(), _k: me.clientKey };
          if (me.nameStyle) msg.ns = me.nameStyle; // isim stili mesajla saklanır (kişi çıkınca da görünsün)
          if (image) {
            msg.image = image;
            msg.imageW = Math.max(0, Math.min(10000, Number(m.imageW) || 0));
            msg.imageH = Math.max(0, Math.min(10000, Number(m.imageH) || 0));
          }
          // Yanıt: alıntılanan mesajın kısa bir özeti mesajla birlikte saklanır
          const orig = m.replyTo && findMsg(cid, m.replyTo);
          if (orig && !orig.system) msg.replyTo = { id: orig.id, name: orig.name, text: String(orig.text || '').slice(0, 140), image: !!orig.image };
          if (file && file.by === me.id) msg.file = { id: String(m.file), name: file.name, size: file.size, type: file.type };
          if (gif) msg.gif = gif;
          pushHistory(cid, msg);
          broadcast(pubMsg(msg), audience(cid));
          // İlk bağlantının önizlemesi arkadan gelir (başlık, açıklama, resim)
          const link = /(https?:\/\/[^\s<>]+)/.exec(text)?.[1]?.replace(/[)\].,!?;:'"]+$/, '');
          if (link && !gif)
            linkPreview(link).then((pv) => {
              if (!pv || !findMsg(cid, msg.id)) return;
              msg.preview = pv;
              updateMsg(cid, msg);
            });
          // Sohbet komutu: "!çal şarkı adı" → müzik botuna
          const cm = !me.bot && /^!([^\s!]+)\s*([\s\S]*)$/.exec(text);
          if (cm && BOT_WORDS.has(cm[1].toLocaleLowerCase('tr'))) forwardToBot(me, cm[1].toLocaleLowerCase('tr'), cm[2].trim());
          break;
        }
        case 'botCmd':
          // Müzik panelindeki düğmelerden gelen komutlar (sohbete yazılmaz)
          if (!me.bot) forwardToBot(me, m.cmd, m.arg);
          break;
        case 'openText':
          // Yazı kanalı açılınca geçmişini gönder
          if (isText(m.channelId)) send(ws, { t: 'history', channelId: m.channelId, messages: (chatHistory.get(m.channelId) || []).map(pubMsg) });
          break;
        case 'botState':
          if (!me.bot) break;
          botState = JSON.stringify(m.state || null).length < 20000 ? m.state || null : botState;
          broadcast({ t: 'botState', state: botState }, (u) => !u.bot);
          break;
        case 'botReplyTo': {
          // Bot kanalda değilken (ya da sadece isteyene) kısa yanıt
          if (!me.bot) break;
          const target = users.get(m.to);
          if (target) send(target.ws, { t: 'botReply', text: String(m.text || '').slice(0, 300) });
          break;
        }
        case 'botLeave': {
          if (!me.bot || !me.channelId) break;
          const old = me.channelId;
          me.channelId = null;
          activity({ kind: 'move', id: me.id, name: me.name, from: old, to: null });
          broadcastState();
          break;
        }
        case 'chatEdit': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          const text = String(m.text || '').slice(0, 2000).trim();
          if (!canModify(me, msg) || msg._k !== me.clientKey || (!text && !msg.image)) break; // düzenlemeyi sadece yazan yapar
          msg.text = text;
          msg.edited = Date.now();
          broadcast({ t: 'chatUpdate', channelId: cid, msg: pubMsg(msg) }, audience(cid));
          break;
        }
        case 'chatDelete': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!canModify(me, msg)) break; // yazan ya da yönetici silebilir
          const arr = chatHistory.get(cid);
          arr.splice(arr.indexOf(msg), 1);
          broadcast({ t: 'chatDelete', channelId: cid, id: msg.id }, audience(cid));
          break;
        }
        case 'react': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          const emoji = String(m.emoji || '').slice(0, 16);
          if (!msg || msg.system || !emoji) break;
          msg.reactions = msg.reactions || {};
          const list = msg.reactions[emoji] || [];
          if (list.includes(me.name)) msg.reactions[emoji] = list.filter((n) => n !== me.name);
          else if (Object.keys(msg.reactions).length < 20 || msg.reactions[emoji]) msg.reactions[emoji] = [...list, me.name];
          if (!msg.reactions[emoji]?.length) delete msg.reactions[emoji];
          broadcast({ t: 'chatUpdate', channelId: cid, msg: pubMsg(msg) }, audience(cid));
          break;
        }
        case 'profile': {
          // Profil fotoğrafı ve özel durum yazısı
          if ('statusText' in m) me.statusText = cleanStatus(m.statusText);
          if ('nameStyle' in m) me.nameStyle = cleanNameStyle(m.nameStyle);
          if ('avatar' in m) {
            const next = isImageData(m.avatar, AVATAR_MAX) ? m.avatar : null;
            if (next !== me.avatar) {
              me.avatar = next;
              broadcast({ t: 'avatar', id: me.id, data: next });
            }
          }
          broadcastState();
          break;
        }
        case 'typing':
          // "X yazıyor…" göstergesi: sadece aynı kanaldakilere, saklanmaz
          {
            const cid = chatTarget(me, m.channelId);
            const aud = cid && audience(cid);
            if (cid) broadcast({ t: 'typing', from: me.id, name: me.name, channelId: cid }, (u) => aud(u) && u.id !== me.id);
          }
          break;
        case 'pin': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!msg || msg.system || (!isMod(me) && msg._k !== me.clientKey)) break;
          if (m.on) {
            msg.pinned = true;
            msg.pinnedBy = me.name;
          } else {
            delete msg.pinned;
            delete msg.pinnedBy;
          }
          updateMsg(cid, msg);
          break;
        }
        case 'poll': {
          const cid = chatTarget(me, m.channelId);
          const q = String(m.question || '').trim().slice(0, 200);
          const opts = (Array.isArray(m.options) ? m.options : []).map((x) => String(x || '').trim().slice(0, 80)).filter(Boolean).slice(0, 10);
          if (!cid || !q || opts.length < 2) break;
          const msg = newMsg(me, cid);
          msg.poll = { q, options: opts.map((text) => ({ text, votes: [] })), multi: !!m.multi, closed: false };
          postMsg(cid, msg);
          break;
        }
        case 'pollVote': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          const p = msg?.poll;
          const i = Number(m.option);
          if (!p || p.closed || !p.options[i]) break;
          const had = p.options[i].votes.includes(me.name);
          if (!p.multi) for (const o of p.options) o.votes = o.votes.filter((n) => n !== me.name);
          else p.options[i].votes = p.options[i].votes.filter((n) => n !== me.name);
          if (!had) p.options[i].votes.push(me.name);
          updateMsg(cid, msg);
          break;
        }
        case 'pollClose': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!msg?.poll || (msg._k !== me.clientKey && !isMod(me))) break;
          msg.poll.closed = true;
          updateMsg(cid, msg);
          break;
        }
        case 'wheel': {
          // Çark: sonucu sunucu seçer, herkes aynı sonucu görür
          const cid = chatTarget(me, m.channelId);
          const opts = (Array.isArray(m.options) ? m.options : []).map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 24);
          if (!cid || opts.length < 2) break;
          const msg = newMsg(me, cid);
          msg.wheel = { title: String(m.title || '').trim().slice(0, 100), options: opts, result: crypto.randomInt(opts.length) };
          postMsg(cid, msg);
          break;
        }
        case 'teams': {
          // Takım kur: ses kanalındakileri rastgele N takıma böler
          if (!me.channelId) break;
          const cid = chatTarget(me, m.channelId);
          const count = Math.max(2, Math.min(4, Math.floor(Number(m.count) || 2)));
          const names = [...users.values()].filter((u) => u.channelId === me.channelId && !u.bot).map((u) => u.name);
          if (names.length < count) {
            errorTo(me, `Takım kurmak için kanalda en az ${count} kişi olmalı.`);
            break;
          }
          for (let i = names.length - 1; i > 0; i--) {
            const j = crypto.randomInt(i + 1);
            [names[i], names[j]] = [names[j], names[i]];
          }
          const teams = Array.from({ length: count }, () => []);
          names.forEach((n, i) => teams[i % count].push(n));
          const msg = newMsg(me, cid);
          msg.teams = { teams, channel: channels.find((c) => c.id === me.channelId)?.name || '' };
          postMsg(cid, msg);
          break;
        }
        case 'voteStart': {
          const target = users.get(m.to);
          const action = m.action === 'afk' ? 'afk' : 'mute';
          if (!target || target.bot || target.id === me.id || !me.channelId || target.channelId !== me.channelId) break;
          if (isMod(target)) {
            errorTo(me, 'Yönetici ve moderatörler oylamayla susturulamaz ya da taşınamaz.');
            break;
          }
          if (votes.has(target.id)) break;
          if (action === 'afk' && (!afkId() || target.channelId === afkId())) {
            errorTo(me, 'Bu sunucuda AFK kanalı yok.');
            break;
          }
          if (Date.now() - (me.voteAt || 0) < 60000) {
            errorTo(me, 'Yeni bir oylama için 1 dakika beklemelisin.');
            break;
          }
          const voters = [...users.values()].filter((u) => u.channelId === me.channelId && !u.bot && u.id !== target.id);
          if (voters.length < 2) {
            errorTo(me, 'Oylama için kanalda senden başka en az bir kişi daha olmalı.');
            break;
          }
          me.voteAt = Date.now();
          const v = { id: crypto.randomUUID(), targetId: target.id, targetName: target.name, action, by: me.name, channelId: me.channelId, yes: new Set([me.id]), no: new Set(), required: Math.max(2, Math.ceil(voters.length * 0.75)), total: voters.length, until: Date.now() + 60000 };
          v.timer = setTimeout(() => endVote(v, false), 60000);
          votes.set(target.id, v);
          sendVote(v);
          break;
        }
        case 'vote': {
          const v = [...votes.values()].find((x) => x.id === m.id);
          if (!v || me.bot || me.channelId !== v.channelId || me.id === v.targetId) break;
          (m.yes ? v.yes : v.no).add(me.id);
          (m.yes ? v.no : v.yes).delete(me.id);
          if (v.yes.size >= v.required) endVote(v, true);
          else if (v.total - v.no.size < v.required) endVote(v, false);
          else sendVote(v);
          break;
        }
        case 'activity': {
          // Oynadığı oyun / dinlediği şarkı
          const game = String(m.game || '').slice(0, 60);
          const music = String(m.music || '').slice(0, 120);
          const next = game || music ? { game, music } : null;
          if (JSON.stringify(next) !== JSON.stringify(me.activity || null)) {
            me.activity = next;
            broadcastState();
          }
          break;
        }
        case 'gifSearch':
          gifSearch(String(m.q || '').trim().slice(0, 100))
            .then((r) => send(ws, { t: 'gifResults', q: m.q, ...r }))
            .catch(() => send(ws, { t: 'gifResults', q: m.q, error: 'fail' }));
          break;
        case 'mark': {
          // Yayına işaret: izleyenin tıkladığı nokta herkesin görüntüsünde ve yayıncının ekranında kısa süre görünür
          const now = Date.now();
          const owner = users.get(m.owner);
          if (!owner || !me.channelId || owner.channelId !== me.channelId || now - (me.markAt || 0) < 60) break;
          me.markAt = now;
          const clamp = (x) => Math.max(0, Math.min(1, Number(x) || 0));
          const pts = (Array.isArray(m.pts) ? m.pts : [[m.x, m.y]]).slice(0, 80).map((p) => [clamp(p?.[0]), clamp(p?.[1])]);
          broadcast({ t: 'mark', from: me.id, name: me.name, owner: owner.id, share: String(m.share || '').slice(0, 40), kind: m.kind === 'line' ? 'line' : 'ping', pts, stroke: String(m.stroke || '').slice(0, 40) }, (u) => u.channelId === me.channelId && !u.bot);
          break;
        }
        case 'watchCtl': {
          // Birlikte izle: izleyenin durdur/oynat/sar isteği yayıncıya gider
          const owner = users.get(m.owner);
          if (!owner || !me.channelId || owner.channelId !== me.channelId) break;
          send(owner.ws, { t: 'watchCtl', from: me.id, name: me.name, share: String(m.share || '').slice(0, 40), act: String(m.act || '').slice(0, 12), time: Number(m.time) || 0 });
          break;
        }
        case 'watchState':
          if (!me.channelId) break;
          broadcast(
            { t: 'watchState', owner: me.id, share: String(m.share || '').slice(0, 40), paused: !!m.paused, time: Number(m.time) || 0, duration: Number(m.duration) || 0, title: String(m.title || '').slice(0, 200), by: String(m.by || '').slice(0, 40), at: Date.now() },
            (u) => u.channelId === me.channelId && u.id !== me.id && !u.bot
          );
          break;
        case 'poke': {
          const target = users.get(m.to);
          if (target) send(target.ws, { t: 'poke', from: me.id, name: me.name, text: String(m.text || '').slice(0, 200) });
          break;
        }
        case 'sfx': {
          // Ses efekti: sadece sesin adı iletilir, her uygulama sesi kendisi üretip çalar.
          // Kişi başı 1,2 saniyede bir (spam koruması); sadece aynı ses kanalındakilere gider.
          const sid = String(m.sid || '');
          const now = Date.now();
          if (me.bot || !me.channelId || isText(me.channelId) || !/^[a-z]{2,16}$/.test(sid)) break;
          if (now - (me.sfxAt || 0) < 1200) break;
          me.sfxAt = now;
          broadcast({ t: 'sfx', from: me.id, sid }, (u) => u.channelId === me.channelId && u.id !== me.id && !u.bot);
          break;
        }
        case 'createChannel': {
          const name = String(m.name || '').trim().slice(0, 40);
          if (!name) break;
          const text = m.type === 'text';
          const parent = !text && channels.find((c) => c.id === m.parent && c.type !== 'text') ? m.parent : null;
          const ch = { id: crypto.randomUUID(), name: text ? name.toLocaleLowerCase('tr').replace(/\s+/g, '-') : name, parent, order: channels.length, topic: String(m.topic || '').slice(0, 200) };
          if (text) ch.type = 'text';
          channels.push(ch);
          saveChannels();
          broadcastState();
          break;
        }
        case 'renameChannel': {
          const ch = channels.find((c) => c.id === m.channelId);
          const name = String(m.name || '').trim().slice(0, 40);
          if (ch && name) {
            ch.name = name;
            saveChannels();
            broadcastState();
          }
          break;
        }
        case 'deleteChannel': {
          const ch = channels.find((c) => c.id === m.channelId);
          if (!ch || ch.id === lobbyId()) break;
          const ids = new Set([ch.id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const c of channels) if (c.parent && ids.has(c.parent) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
          }
          if ([...users.values()].some((u) => ids.has(u.channelId))) {
            send(ws, { t: 'error', code: 'not_empty', message: 'İçinde kullanıcı olan kanal silinemez.' });
            break;
          }
          channels = channels.filter((c) => !ids.has(c.id));
          for (const id of ids) chatHistory.delete(id);
          saveChannels();
          broadcastState();
          break;
        }
        case 'kick': {
          const target = users.get(m.to);
          if (!target || target.id === me.id) break;
          const reason = String(m.reason || '').slice(0, 200);
          send(target.ws, { t: 'kicked', by: me.name, reason });
          log(`${me.name}, ${target.name} kullanıcısını attı${reason ? ': ' + reason : ''}`);
          activity({ kind: 'kick', name: target.name, by: me.name, reason });
          setTimeout(() => target.ws.close(4001, 'kicked'), 100);
          break;
        }
        case 'move': {
          const target = users.get(m.to);
          if (!target || !channels.find((c) => c.id === m.channelId)) break;
          if (target.id !== me.id) send(target.ws, { t: 'moved', by: me.name });
          moveUser(target, m.channelId);
          break;
        }
        case 'serverMute': {
          const target = users.get(m.to);
          if (target && target.id !== me.id) send(target.ws, { t: 'forceMute', by: me.name });
          break;
        }
        case 'setRole': {
          if (m.key) {
            delete conf.roles[String(m.key)];
          } else {
            const target = users.get(m.to);
            if (!target || target.bot || target.admin) break;
            if (m.role === 'mod') conf.roles[target.clientKey] = { role: 'mod', name: target.name };
            else delete conf.roles[target.clientKey];
            send(target.ws, { t: 'role', mod: m.role === 'mod', by: me.name });
          }
          saveConf();
          broadcastState();
          break;
        }
        case 'ban': {
          const target = users.get(m.to);
          if (!target || target.id === me.id || target.admin || target.bot) break;
          const reason = String(m.reason || '').slice(0, 200);
          conf.bans.push({ id: crypto.randomUUID(), key: target.clientKey, ip: privateIp(target.ip) ? '' : target.ip, name: target.name, reason, by: me.name, at: Date.now() });
          saveConf();
          send(target.ws, { t: 'kicked', by: me.name, reason, banned: true });
          activity({ kind: 'kick', name: target.name, by: me.name, reason, banned: true });
          log(`${me.name}, ${target.name} kullanıcısını yasakladı${reason ? ': ' + reason : ''}`);
          setTimeout(() => target.ws.close(4003, 'banned'), 100);
          break;
        }
        case 'unban':
          conf.bans = conf.bans.filter((b) => b.id !== m.id);
          saveConf();
          send(ws, { t: 'adminNotice', message: 'Yasak kaldırıldı.' });
          break;
        case 'channelSettings': {
          const ch = channels.find((c) => c.id === m.channelId && c.type !== 'text');
          if (!ch) break;
          if ('limit' in m) {
            const n = Math.max(0, Math.min(99, Math.floor(Number(m.limit) || 0)));
            if (n) ch.limit = n;
            else delete ch.limit;
          }
          if (typeof m.password === 'string') {
            if (m.password) {
              ch.salt = crypto.randomBytes(8).toString('hex');
              ch.pwHash = hashPw(ch.salt, m.password.slice(0, 100));
              for (const u of users.values()) u.unlocked?.delete(ch.id);
            } else {
              delete ch.salt;
              delete ch.pwHash;
            }
          }
          saveChannels();
          broadcastState();
          send(ws, { t: 'adminNotice', message: `${ch.name} kanalının ayarları kaydedildi.` });
          break;
        }
        case 'setConfig': {
          if ('afkMinutes' in m) conf.afkMinutes = Math.max(0, Math.min(240, Math.floor(Number(m.afkMinutes) || 0)));
          if ('afkChannelId' in m) conf.afkChannelId = channels.find((c) => c.id === m.afkChannelId && c.type !== 'text') ? m.afkChannelId : null;
          if (typeof m.gifKey === 'string') conf.gifKey = m.gifKey.trim().slice(0, 200);
          if (['klipy', 'giphy'].includes(m.gifProvider)) conf.gifProvider = m.gifProvider;
          saveConf();
          broadcastState();
          send(ws, { t: 'adminNotice', message: 'Sunucu ayarları kaydedildi.' });
          break;
        }
        case 'setServer': {
          if (typeof m.name === 'string' && m.name.trim()) serverName = m.name.trim().slice(0, 40);
          if (typeof m.password === 'string') password = m.password.slice(0, 100);
          log(`Sunucu ayarları güncellendi (${me.name})`);
          broadcastState();
          send(ws, { t: 'adminNotice', message: 'Sunucu ayarları kaydedildi.' });
          break;
        }
        case 'adminInfo':
          send(ws, {
            t: 'adminInfo',
            serverName,
            hasPassword: !!password,
            startedAt,
            now: Date.now(),
            users: [...users.values()].map((u) => ({ ...publicUser(u), ip: u.ip, connectedAt: u.connectedAt })),
            bans: conf.bans.map((b) => ({ id: b.id, name: b.name, reason: b.reason, by: b.by, at: b.at, ip: !!b.ip })),
            mods: Object.entries(conf.roles)
              .filter(([, r]) => r.role === 'mod')
              .map(([key, r]) => ({ key, name: r.name, online: [...users.values()].some((u) => u.clientKey === key) })),
            afkMinutes: conf.afkMinutes,
            afkChannelId: afkId(),
            gifProvider: conf.gifProvider,
            hasGifKey: !!conf.gifKey,
          });
          break;
        case 'ping':
          send(ws, { t: 'pong', ts: m.ts });
          break;
      }
    });

    ws.on('pong', () => me && (me.alive = true));
    ws.on('close', () => {
      if (!me) return;
      users.delete(me.id);
      log(`Ayrıldı: ${me.name}`);
      if (me.bot) {
        botState = null;
        broadcast({ t: 'botState', state: null });
      }
      activity({ kind: 'leave', id: me.id, name: me.name, from: me.channelId || null });
      for (const v of votes.values()) if (v.targetId === me.id) endVote(v, false);
      broadcast({ t: 'left', id: me.id });
      broadcastState();
    });
  });

  // Ölü bağlantıları temizle
  const heartbeat = setInterval(() => {
    for (const u of users.values()) {
      if (!u.alive) {
        u.ws.terminate();
        continue;
      }
      u.alive = false;
      try { u.ws.ping(); } catch {}
    }
  }, 15000);

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', () => {
      log(`"${serverName}" ${port} portunda dinliyor`);
      if (!opts.adminKey) log(`Yönetici anahtarı: ${adminKey}`);
      resolve({
        port,
        adminKey,
        botKey,
        close: () =>
          new Promise((r) => {
            clearInterval(heartbeat);
            for (const u of users.values()) u.ws.terminate();
            wss.close();
            httpServer.close(() => r());
          }),
      });
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  startServer().catch((e) => {
    console.error('Sunucu başlatılamadı:', e.message);
    process.exit(1);
  });
}
