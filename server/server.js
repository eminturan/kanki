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
  const lobbyId = () => channels.find((c) => c.type !== 'text')?.id;

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
    bot: !!u.bot,
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
    if (old) systemChat(old, `${u.name} kanaldan ayrıldı`);
    systemChat(channelId, `${u.name} kanala katıldı`);
    send(u.ws, { t: 'history', channelId, messages: (chatHistory.get(channelId) || []).map(pubMsg) });
    broadcastState();
  }

  const httpServer = http.createServer((req, res) => {
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
          ip,
          connectedAt: Date.now(),
          ws,
          alive: true,
        };
        users.set(me.id, me);
        log(`Bağlandı: ${name} (${ip})${isAdmin ? ' [yönetici]' : ''}`);
        if (m.adminKey && !isAdmin) send(ws, { t: 'error', code: 'bad_admin_key', message: 'Yönetici anahtarı hatalı; normal kullanıcı olarak bağlandın.' });
        send(ws, { t: 'welcome', id: me.id, name, serverName, iceServers, admin: isAdmin, features: ['sfx'] });
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
          if ((!text && !image) || !cid) break;
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
          pushHistory(cid, msg);
          broadcast(pubMsg(msg), audience(cid));
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
          systemChat(old, `${me.name} kanaldan ayrıldı`);
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
      if (me.bot) {
        botState = null;
        broadcast({ t: 'botState', state: null });
      }
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
