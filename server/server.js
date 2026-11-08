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
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_CHANNELS = [
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
      byName[c.name] = ch.id;
      return ch;
    });
    saveChannels();
  }
  const lobbyId = () => channels[0]?.id;

  // ---------- Kullanıcılar ----------
  /** @type {Map<string, {id,name,channelId,muted,deafened,sharing,ws,alive}>} */
  const users = new Map();
  const chatHistory = new Map(); // channelId -> [{...}]

  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    channelId: u.channelId,
    muted: u.muted,
    deafened: u.deafened,
    sharing: u.sharing,
    away: u.away,
    admin: !!u.admin,
  });

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
      channels,
      users: [...users.values()].map(publicUser),
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
    if (arr.length > 200) arr.shift();
  }
  function moveUser(u, channelId) {
    if (!channels.find((c) => c.id === channelId)) return;
    const old = u.channelId;
    if (old === channelId) return;
    u.channelId = channelId;
    u.sharing = false;
    if (old) systemChat(old, `${u.name} kanaldan ayrıldı`);
    systemChat(channelId, `${u.name} kanala katıldı`);
    send(u.ws, { t: 'history', channelId, messages: chatHistory.get(channelId) || [] });
    broadcastState();
  }

  const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${serverName} çalışıyor. Bağlı kullanıcı: ${users.size}\n`);
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });

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
        if (password && !isAdmin && m.password !== password) {
          send(ws, { t: 'error', code: 'bad_password', message: 'Sunucu şifresi hatalı.' });
          return ws.close();
        }
        let name = String(m.name || '').trim().slice(0, 32) || 'Misafir';
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
          away: false,
          admin: isAdmin,
          ip,
          connectedAt: Date.now(),
          ws,
          alive: true,
        };
        users.set(me.id, me);
        log(`Bağlandı: ${name} (${ip})${isAdmin ? ' [yönetici]' : ''}`);
        if (m.adminKey && !isAdmin) send(ws, { t: 'error', code: 'bad_admin_key', message: 'Yönetici anahtarı hatalı; normal kullanıcı olarak bağlandın.' });
        send(ws, { t: 'welcome', id: me.id, name, serverName, iceServers, admin: isAdmin });
        const wanted = channels.find((c) => c.id === m.channelId) ? m.channelId : lobbyId();
        moveUser(me, wanted);
        return;
      }

      const ADMIN_ONLY = ['createChannel', 'renameChannel', 'deleteChannel', 'kick', 'move', 'setServer', 'adminInfo', 'serverMute'];
      if (ADMIN_ONLY.includes(m.t) && !me.admin) {
        send(ws, { t: 'error', code: 'forbidden', message: 'Bu işlem için yönetici yetkisi gerekiyor.' });
        return;
      }

      switch (m.t) {
        case 'join':
          moveUser(me, m.channelId);
          break;
        case 'status':
          if ('muted' in m) me.muted = !!m.muted;
          if ('deafened' in m) me.deafened = !!m.deafened;
          if ('sharing' in m) me.sharing = !!m.sharing;
          if ('away' in m) me.away = !!m.away;
          broadcastState();
          break;
        case 'signal': {
          const target = users.get(m.to);
          if (target && target.channelId === me.channelId) send(target.ws, { t: 'signal', from: me.id, data: m.data });
          break;
        }
        case 'chat': {
          const text = String(m.text || '').slice(0, 2000).trim();
          if (!text || !me.channelId) break;
          const msg = { t: 'chat', id: crypto.randomUUID(), channelId: me.channelId, from: me.id, name: me.name, text, ts: Date.now() };
          pushHistory(me.channelId, msg);
          broadcast(msg, (u) => u.channelId === me.channelId);
          break;
        }
        case 'poke': {
          const target = users.get(m.to);
          if (target) send(target.ws, { t: 'poke', from: me.id, name: me.name, text: String(m.text || '').slice(0, 200) });
          break;
        }
        case 'createChannel': {
          const name = String(m.name || '').trim().slice(0, 40);
          if (!name) break;
          const parent = channels.find((c) => c.id === m.parent) ? m.parent : null;
          const ch = { id: crypto.randomUUID(), name, parent, order: channels.length, topic: String(m.topic || '').slice(0, 200) };
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
          if (target.channelId) systemChat(target.channelId, `${target.name} sunucudan atıldı${reason ? ' (' + reason + ')' : ''}`);
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
      if (me.channelId) systemChat(me.channelId, `${me.name} sunucudan ayrıldı`);
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
