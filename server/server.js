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
 * Yetkiler Discord'daki gibi rollerle verilir (PERMS listesi). Doğru yönetici anahtarıyla bağlanan
 * kişi sunucunun sahibidir: her yetkiye sahiptir, en üsttedir, kimse ona işlem yapamaz.
 * Diğerleri @herkes rolünün ve kendi rollerinin yetkilerini alır; at/yasakla/sustur/taşı/rol ver
 * gibi işlemleri sadece en üst rolü kendilerinden kesin olarak düşük olanlara yapabilirler.
 * Her işlem sunucuda kontrol edilir; yönetim işlemleri bellekteki denetim kaydına yazılır.
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

// ---------- Yetkiler (Discord benzeri roller) ----------
// [anahtar, etiket, açıklama, grup]
const PERMS = [
  ['administrator', 'Yönetici', 'Her yetkiye sahip olur. Dikkatli ver.', 'genel'],
  ['manageServer', 'Sunucuyu yönet', 'Ad, şifre, açıklama, hoş geldin mesajı, duyuru, AFK ve GIF ayarları.', 'genel'],
  ['manageRoles', 'Rolleri yönet', 'Kendi en üst rolünün altındaki rolleri düzenler ve kişilere verir.', 'genel'],
  ['manageChannels', 'Kanalları yönet', 'Kanal oluşturur, siler, adlandırır; şifre, kişi sınırı, yavaş mod ve salt okunur ayarı.', 'genel'],
  ['viewAudit', 'Denetim kaydını gör', 'Kim, ne zaman, ne yaptı kaydını görür.', 'genel'],
  ['kick', 'At', 'Kişiyi sunucudan atar (tekrar girebilir).', 'uye'],
  ['ban', 'Yasakla', 'Kişiyi yasaklar ya da yasağını kaldırır.', 'uye'],
  ['timeout', 'Zaman aşımı', 'Belli bir süre konuşmasını, yazmasını ve tepki vermesini engeller.', 'uye'],
  ['muteMembers', 'Sunucuda sustur', 'Mikrofonu kapatır; kişi kendisi açamaz.', 'uye'],
  ['deafenMembers', 'Sunucuda sağırlaştır', 'Kulaklığı kapatır; kişi kendisi açamaz.', 'uye'],
  ['moveMembers', 'Taşı', 'Kişileri taşır, sesten çıkarır, hepsini taşır; dolu ve şifreli kanallara girer.', 'uye'],
  ['prioritySpeaker', 'Öncelikli konuşmacı', 'Konuşurken diğerlerinin sesi biraz kısılır.', 'uye'],
  ['manageMessages', 'Mesajları yönet', 'Başkasının mesajını siler, sabitler, kanalı temizler; salt okunur kanala ve yavaş modda yazar.', 'sohbet'],
  ['mentionEveryone', '@herkes', '@herkes ile herkese bildirim gönderir.', 'sohbet'],
  ['sendMessages', 'Mesaj gönder', 'Yazı ve ses kanallarına mesaj yazar.', 'sohbet'],
  ['attachFiles', 'Dosya ve resim gönder', 'Sohbete dosya ve resim ekler.', 'sohbet'],
  ['useGifs', 'GIF gönder', 'GIF arar ve gönderir.', 'sohbet'],
  ['createPolls', 'Anket, çark, takım', 'Anket açar, çark çevirir, takım kurar.', 'sohbet'],
  ['startVotes', 'Oylama başlat', 'Oylamayla susturma ya da AFK’ya gönderme başlatır.', 'sohbet'],
  ['styledMessages', 'Süslü mesaj yazısı', 'Yazı stilindeki yazı tipini ve rengi mesajlarında da kullanır.', 'sohbet'],
  ['stormName', 'Yıldırım isim efekti', 'Yazı stilinde “Yıldırım ekle”yi kullanır: seçtiği efektin üstüne, adının etrafında seçtiği renkte yıldırımlar çakar.', 'sohbet'],
  ['useSoundboard', 'Ses efektleri', 'Ses efekti panelini kullanır.', 'ses'],
  ['stream', 'Ekran paylaş', 'Ekranını ya da bir pencereyi yayınlar.', 'ses'],
  ['camera', 'Kamera', 'Kamerasını açar.', 'ses'],
  ['startWatch', 'Birlikte izle', 'Birlikte izlemeyi başlatır ve oynatmayı yönetir.', 'ses'],
  ['ping', 'Ping at', 'Ping tuşuna basıp ekranda bir yere tıklar: aynı ses kanalındaki herkesin ekranında (yayının üstüne tıkladıysa izlenen yayında) o nokta adı ve rengiyle dalga dalga parlar.', 'ses'],
  ['flash', 'Flash at', 'Kişiye sağ tıklayıp flash atar: karşı tarafın bütün monitörleri birkaç saniye bembeyaz olur (CS gibi).', 'ses'],
];
const PERM_KEYS = PERMS.map((p) => p[0]);
const PERM_LABEL = Object.fromEntries(PERMS.map((p) => [p[0], p[1]]));
const PERM_GROUPS = { genel: 'Genel', uye: 'Üyeler', sohbet: 'Sohbet', ses: 'Ses ve görüntü' };
// @herkes rolünün varsayılan yetkileri
const DEFAULT_EVERYONE = ['sendMessages', 'attachFiles', 'useGifs', 'useSoundboard', 'createPolls', 'startWatch', 'stream', 'camera', 'startVotes', 'mentionEveryone'];
// Hazır "Moderatör" rolü (eski moderatörler buna taşınır)
const MOD_PRESET = ['kick', 'timeout', 'muteMembers', 'deafenMembers', 'moveMembers', 'manageMessages', 'viewAudit'];
const BOT_PERMS = DEFAULT_EVERYONE;
// Eski istemciler için "mod" bayrağı: bunlardan biri varsa moderatör sayılır
const MOD_FLAG_PERMS = ['kick', 'moveMembers', 'muteMembers', 'manageMessages'];
// Yönetim paneli (adminInfo) bunlardan biri olana açılır
const STAFF_PERMS = ['administrator', 'manageServer', 'manageRoles', 'manageChannels', 'viewAudit', 'kick', 'ban', 'timeout', 'muteMembers', 'deafenMembers', 'moveMembers', 'manageMessages'];
const OWNER_RANK = 1000000; // yönetici anahtarı sahibi: her rolün üstünde
const MAX_ROLES = 50;

// ---------- Güvenlik yardımcıları ----------
// İstemciden gelen JSON'da bu anahtarlar atılır: {"toString":1} gibi nesneler String()/Number() içinde
// hata fırlatıp sunucuyu düşürmesin, "__proto__" gibi anahtarlar nesnelerin prototipini değiştirmesin.
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'toLocaleString', 'toJSON', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable']);
function parseClientMsg(raw) {
  const m = JSON.parse(String(raw), (k, v) => (POISON_KEYS.has(k) ? undefined : v));
  return m && typeof m === 'object' && !Array.isArray(m) ? m : null;
}
// Görünmeyen / yön değiştiren karakterler: "Emin" + görünmez boşluk gibi adlarla taklit ve denetim kaydında sahte yazı olmasın.
// (Emoji için gereken U+200C/U+200D ve varyasyon seçicileri bırakılır.)
const INVISIBLE_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb]/g;
const cleanName = (s, max = 32) => String(s ?? '').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanReason = (s, max = 200) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);
// @herkes / @everyone bildirimini etkisizleştir (Kelvin işareti "K" gibi küçük harfe çevrilince "k" olan harfler dahil)
const neutralizeEveryone = (text) => text.replace(/@([\p{L}\p{M}\p{N}_]+)/gu, (all, w) => (/^(herkes|everyone)/.test(w.normalize('NFKC').toLocaleLowerCase('tr')) ? '@\u200b' + w : all));
const isLoopIp = (ip) => !ip || ip === '::1' || ip.startsWith('127.');

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
// Başlık kanalı (header): sadece altındaki kanalları gruplar, içine kimse giremez
  const joinable = (c) => !!c && c.type !== 'text' && !c.header;
  const lobbyId = () => channels.find((c) => joinable(c) && !c.pwHash)?.id || channels.find(joinable)?.id;

  // ---------- Kalıcı sunucu ayarları (sohbet değil): roller, üyeler, yasaklar, AFK, GIF anahtarı, duyuru ----------
  // Sohbet mesajları burada ASLA tutulmaz.
  const confFile = path.join(dataDir, 'server-config.json');
  let conf = { bans: [], afkChannelId: null, afkMinutes: 15, gifProvider: 'klipy', gifKey: '', description: '', welcomeMessage: '', announcement: null, linkPreviews: true };
  try {
    conf = { ...conf, ...JSON.parse(fs.readFileSync(confFile, 'utf8')) };
  } catch {}
  if (!Array.isArray(conf.bans)) conf.bans = [];
  function saveConf() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(confFile, JSON.stringify(conf, null, 2));
    } catch (e) {
      log('Ayarlar kaydedilemedi:', e.message);
    }
  }
  // TURN (aktarma sunucusu): mobil veride doğrudan bağlanamayanların sesi bunun üzerinden gider. Sunucu Ayarları › Bağlantı
  const iceNow = () => {
    const list = [...iceServers];
    const urls = String(conf.turnUrl || '').split(',').map((s) => s.trim()).filter((s) => /^turns?:[^\s]+$/i.test(s)).slice(0, 4);
    if (urls.length) list.push({ urls, username: conf.turnUser || '', credential: conf.turnPass || '' });
    return list;
  };
  const afkId = () => (channels.find((c) => c.id === conf.afkChannelId && joinable(c)) || channels.find((c) => joinable(c) && /^afk$/i.test(c.name)))?.id || null;
  // AFK kanalında mikrofon açılamaz
  const inAfk = (u) => !!u && !u.bot && !!u.channelId && u.channelId === afkId();
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
    nameStyle: nsOf(u),
    hasAvatar: !!u.avatar,
    admin: !!u.admin,
    mod: isModUser(u),
    bot: !!u.bot,
    activity: u.activity || null,
    voteMuted: voteMutedUntil(u) > Date.now(),
    // Roller ve moderasyon durumu
    roles: userRoleIds(u),
    color: userColor(u),
    serverMuted: serverMuted(u),
    serverDeafened: serverDeafened(u),
    timeoutUntil: timeoutUntil(u),
    prio: isPrio(u),
    pingColor: pingColorOf(u),
    xfer: !!u.xfer,
  });
  // Ping ve yayına çizim rengi: yetkilinin kişiye seçtiği renk, seçilmediyse beyaz
  const pingColorOf = (u) => (u && !u.bot && memberOf(u.clientKey)?.pingColor) || '#ffffff';
  const findBot = () => [...users.values()].find((u) => u.bot);
  // Sadece botun anladığı komutlar iletilir ("!!!" gibi mesajlar bota gitmesin)
  const BOT_WORDS = new Set(
    'çal cal play p oynat geç gec skip s sonraki next duraklat pause bekle devam resume dur stop durdur kuyruk queue q liste sıra temizle clear çıkar cikar remove sil ses volume vol şimdi simdi np çalan calan gel katıl katil join ayrıl ayril leave git çık karıştır karistir shuffle tekrar loop döngü yardım yardim help komutlar sar seek atla radyo radio'.split(' ')
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
  const cleanStatus = (s) => cleanName(s, 80);
  // İsim stili (yazı tipi, efekt, renkler): sadece bilinen değerler kabul edilir
  const NS_FONTS = ['default', 'audiowide', 'pixel', 'pacifico', 'bangers', 'righteous', 'lobster', 'caveat', 'glitch', 'cinzel', 'fredoka', 'mono'];
  const NS_FX = ['none', 'gradient', 'neon', 'shimmer', 'rainbow', 'pulse', 'fire', 'storm'];
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : '');
  // "Mesajlarımda da kullan" sadece Süslü mesaj yazısı yetkisi olanlarda, Yıldırım efekti sadece
  // Yıldırım isim efekti yetkisi olanlarda geçerli (yetki alınınca kendiliğinden geri gelir)
  const nsOf = (u) => {
    let st = u?.nameStyle;
    if (!st) return null;
    if (st.inMessages && !u.bot && !can(u, 'styledMessages')) st = { ...st, inMessages: false };
    if (st.bolts && !can(u, 'stormName')) st = { ...st, bolts: false };
    return st.font === 'default' && st.effect === 'none' && !st.c1 && !st.bolts && !st.inMessages ? null : st;
  };
  const cleanNameStyle = (st) => {
    if (!st || typeof st !== 'object') return null;
    const font = NS_FONTS.includes(st.font) ? st.font : 'default';
    // 1.0.40–1.0.41'deki "storm" efekti artık her efektin üstüne eklenen yıldırım: Düz + yıldırım olur
    const storm = st.effect === 'storm';
    const effect = !storm && NS_FX.includes(st.effect) ? st.effect : 'none';
    const out = { font, effect, c1: hex(st.c1), c2: hex(st.c2), c3: hex(st.c3), bolts: storm || !!st.bolts, inMessages: !!st.inMessages };
    return font === 'default' && effect === 'none' && !out.c1 && !out.bolts ? null : out;
  };

  // ---------- Roller ve yetkiler ----------
  // conf.roleDefs: [{ id, name, color, perms, hoist, position }] — üstteki rol önce; @herkes (id 'everyone') hep en altta, position 0
  // conf.members[clientKey]: { name, roles: [rolId], mute?, deaf? } — sadece rolü ya da sunucu susturması olanlar tutulur
  const roleById = (id) => conf.roleDefs.find((r) => r.id === id);
  const everyoneRole = () => roleById('everyone');
  const cleanPerms = (list) => [...new Set((Array.isArray(list) ? list.slice(0, 100) : []).filter((p) => PERM_KEYS.includes(p)))];
  const cleanRoleName = (n) => cleanName(n, 32);
  // Sıraları 1..n yap (büyük sayı = üstte), listeyi üstten alta diz
  function sortRoles() {
    const ev = everyoneRole();
    const rest = conf.roleDefs.filter((r) => r.id !== 'everyone').sort((a, b) => a.position - b.position);
    rest.forEach((r, i) => (r.position = i + 1));
    ev.position = 0;
    conf.roleDefs = [...rest.reverse(), ev];
  }
  const makeModRole = () => ({ id: 'mod', name: 'Moderatör', color: '#4aa8ff', perms: [...MOD_PRESET], hoist: true, position: 1 });
  (function migrateRoles() {
    let changed = false;
    if (!Array.isArray(conf.roleDefs)) {
      conf.roleDefs = [{ id: 'everyone', name: '@herkes', color: '', perms: [...DEFAULT_EVERYONE], hoist: false, position: 0 }, makeModRole()];
      changed = true;
    }
    conf.roleDefs = conf.roleDefs
      .filter((r) => r && typeof r.id === 'string' && r.id)
      .map((r) => ({ id: r.id.slice(0, 40), name: cleanRoleName(r.name) || 'rol', color: hex(r.color), perms: cleanPerms(r.perms), hoist: !!r.hoist, position: Number(r.position) || 0 }));
    if (!everyoneRole()) {
      conf.roleDefs.push({ id: 'everyone', name: '@herkes', color: '', perms: [...DEFAULT_EVERYONE], hoist: false, position: 0 });
      changed = true;
    }
    Object.assign(everyoneRole(), { name: '@herkes', color: '', hoist: false });
    // clientKey ile anahtarlanan nesne: "__proto__" gibi anahtarlar zarar vermesin
    const mem = conf.members && typeof conf.members === 'object' && !Array.isArray(conf.members) ? conf.members : {};
    conf.members = Object.assign(Object.create(null), mem);
    // Eski sürümün moderatörleri (conf.roles[clientKey] = { role: 'mod' }) "Moderatör" rolüne taşınır
    const old = Object.entries(conf.roles && typeof conf.roles === 'object' ? conf.roles : {}).filter(([k, r]) => k && r && r.role === 'mod');
    if (old.length) {
      let mod = roleById('mod');
      if (!mod) {
        mod = makeModRole();
        mod.position = Math.max(0, ...conf.roleDefs.map((r) => r.position)) + 1;
        conf.roleDefs.push(mod);
      }
      for (const [key, r] of old) {
        const m = conf.members[key] || (conf.members[key] = { name: String(r.name || '').slice(0, 32), roles: [] });
        if (!Array.isArray(m.roles)) m.roles = [];
        if (!m.roles.includes(mod.id)) m.roles.push(mod.id);
      }
      log(`${old.length} eski moderatör "Moderatör" rolüne taşındı`);
    }
    if ('roles' in conf) {
      delete conf.roles;
      changed = true;
    }
    for (const [k, m] of Object.entries(conf.members)) {
      if (!m || typeof m !== 'object') {
        delete conf.members[k];
        continue;
      }
      m.name = String(m.name || '').slice(0, 32);
      m.roles = [...new Set((Array.isArray(m.roles) ? m.roles : []).filter((id) => id !== 'everyone' && roleById(id)))];
      if ('pingColor' in m && !(m.pingColor = hex(m.pingColor))) delete m.pingColor;
    }
    sortRoles();
    if (changed) saveConf();
  })();
  const memberOf = (ck) => (ck && conf.members[ck]) || null;
  // Üye kimliği: cihaz anahtarının özeti (anahtarın kendisi kimseye gönderilmez)
  const midOf = (ck) => crypto.createHash('sha256').update('kanki-member:' + String(ck)).digest('hex').slice(0, 16);
  const usersByKey = (ck) => [...users.values()].filter((u) => !u.bot && u.clientKey === ck);
  const keyByMid = (mid) => Object.keys(conf.members).find((k) => midOf(k) === mid) || [...users.values()].find((u) => !u.bot && midOf(u.clientKey) === mid)?.clientKey || null;
  // Kişinin rolleri (üstten alta), @herkes hariç
  const rolesOfKey = (ck) => {
    const ids = memberOf(ck)?.roles || [];
    return conf.roleDefs.filter((r) => r.id !== 'everyone' && ids.includes(r.id));
  };
  const rankOfKey = (ck) => rolesOfKey(ck)[0]?.position || 0;
  const rankOf = (u) => (!u ? -1 : u.admin ? OWNER_RANK : u.bot ? 0 : rankOfKey(u.clientKey));
  function permsOf(u) {
    if (!u) return new Set();
    if (u.admin) return new Set(PERM_KEYS);
    if (u.bot) return new Set(BOT_PERMS);
    const s = new Set(everyoneRole().perms);
    for (const r of rolesOfKey(u.clientKey)) for (const p of r.perms) s.add(p);
    return s.has('administrator') ? new Set(PERM_KEYS) : s;
  }
  const can = (u, p) => permsOf(u).has(p);
  const isModUser = (u) => !!u && !u.admin && !u.bot && MOD_FLAG_PERMS.some((p) => can(u, p));
  const isMod = (u) => !!u && (u.admin || isModUser(u));
  const isStaff = (u) => !!u && STAFF_PERMS.some((p) => can(u, p));
  const userRoleIds = (u) => (u.bot ? [] : rolesOfKey(u.clientKey).map((r) => r.id));
  const userColor = (u) => (u.bot ? '' : rolesOfKey(u.clientKey).find((r) => r.color)?.color || '');
  // Öncelikli konuşmacı sadece rolle açıkça verilince (yönetici/sahip olmak kendiliğinden açmaz)
  const isPrio = (u) => !u.bot && [everyoneRole(), ...rolesOfKey(u.clientKey)].some((r) => r.perms.includes('prioritySpeaker'));
  // Hiyerarşi: sahibe kimse dokunamaz; diğerlerinde en üst rolü kesin olarak daha yüksek olan işlem yapabilir
  const ownerOnline = (ck) => [...users.values()].some((u) => u.admin && u.clientKey === ck);
  // Yönetici anahtarıyla bağlanmış cihazlar (özetleri kalıcı): sahip çevrimdışıyken de "mid" ile ona işlem yapılamasın
  const ownerMids = new Set((Array.isArray(conf.ownerMids) ? conf.ownerMids : []).filter((x) => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x)).slice(-20));
  const isOwnerKey = (ck) => !!ck && (ownerOnline(ck) || ownerMids.has(midOf(ck)));
  function rememberOwner(ck) {
    const mid = midOf(ck);
    if (ownerMids.has(mid)) return;
    ownerMids.add(mid);
    conf.ownerMids = [...ownerMids].slice(-20);
    saveConf();
  }
  // Sahibin cihazına (yönetici anahtarı olmadan açılmış ikinci bağlantısı dahil) sadece sahip dokunabilir; çevrimiçi sahibe kimse
  const outranks = (me, target) => !!target && !target.admin && (me.admin ? !ownerOnline(target.clientKey) || target.bot : !(!target.bot && isOwnerKey(target.clientKey)) && rankOf(me) > rankOf(target));
  const outranksT = (me, t) => !ownerOnline(t.key) && (t.user ? outranks(me, t.user) : me.admin || (!isOwnerKey(t.key) && rankOf(me) > rankOfKey(t.key)));
  const canEditRole = (me, role) => me.admin || role.position < rankOf(me);
  // Kendinde olmayan yetkiyi kimseye veremezsin / alamazsın
  const canGrant = (me, perms) => me.admin || can(me, 'administrator') || perms.every((p) => can(me, p));
  const publicRole = (r) => ({ id: r.id, name: r.name, color: r.color, perms: [...r.perms], hoist: r.hoist, position: r.position });

  // Zaman aşımı: sadece bellekte (sunucu açık kaldıkça aynı cihaz yeniden bağlansa da sürer)
  const timeouts = new Map(); // clientKey -> { until, by, reason }
  const timeoutUntil = (u) => {
    const t = u && !u.bot && !u.admin && timeouts.get(u.clientKey);
    return t && t.until > Date.now() ? t.until : 0;
  };
  const timedOut = (u) => timeoutUntil(u) > 0;
  // Zaman aşımını başlat; süresi dolunca kişiye bildirilir
  function startTimeout(key, entry) {
    timeouts.set(key, entry);
    const timer = setTimeout(() => {
      if (timeouts.get(key) !== entry) return;
      timeouts.delete(key);
      for (const u of usersByKey(key)) send(u.ws, modStateMsg(u, 'Sunucu', 'untimeout'));
      broadcastState();
    }, Math.max(0, entry.until - Date.now()) + 250);
    timer.unref?.();
  }
  const serverMuted = (u) => !!u && !u.admin && !u.bot && !!memberOf(u.clientKey)?.mute;
  const serverDeafened = (u) => !!u && !u.admin && !u.bot && !!memberOf(u.clientKey)?.deaf;
  // Oylamayla susturma cihaz anahtarına bağlı (yeniden bağlanınca kalkmasın)
  const voteMutes = new Map(); // clientKey -> bitiş zamanı
  const voteMutedUntil = (u) => (u && !u.bot && !u.admin ? voteMutes.get(u.clientKey) || 0 : 0);
  // Ceza kaçışı: cezalı cihazın IP'sinden (yerel makine hariç) bu çalışmada hiç görülmemiş yeni bir cihaz anahtarıyla
  // bağlanılırsa zaman aşımı / sunucu susturması yeni cihaza da uygulanır (yetkililer listede görüp kaldırabilir)
  const seenKeys = new Set();
  const penaltyIp = new Map(); // ip -> { key, name }
  const notePenaltyIp = (u) => {
    if (!u || u.bot || u.admin || isLoopIp(u.ip) || !(timedOut(u) || serverMuted(u) || serverDeafened(u))) return;
    if (penaltyIp.size > 5000) penaltyIp.clear();
    penaltyIp.set(u.ip, { key: u.clientKey, name: u.name });
  };
  // Boş kalan üye kaydını sil (rolü ve susturması yoksa saklamaya gerek yok)
  const cleanupMember = (ck) => {
    const m = memberOf(ck);
    if (m && !m.roles.length && !m.mute && !m.deaf && !m.pingColor) delete conf.members[ck];
  };
  const fmtLeft = (ms) => {
    const s = Math.max(1, Math.ceil(ms / 1000));
    if (s < 60) return `${s} sn`;
    const mi = Math.ceil(s / 60);
    if (mi < 60) return `${mi} dk`;
    const hr = Math.round(mi / 60);
    return hr < 24 ? `${hr} sa` : `${Math.round(hr / 24)} gün`;
  };

  // ---------- Denetim kaydı (sadece bellekte, son 500) ----------
  const auditLog = [];
  // Kayıt dolunca önce bunlar silinir: sabitle/taşı gibi işlerle art arda kayıt üretip
  // eski at/yasakla/rol kayıtlarını silmek (izi örtmek) zorlaşsın
  const MINOR_AUDIT = new Set(['pin', 'unpin', 'move', 'disconnect', 'messageDelete', 'forceMute', 'channelUpdate']);
  function audit(me, action, target = '', detail = '') {
    const e = { id: crypto.randomUUID(), ts: Date.now(), by: me ? me.name : 'Sunucu', byId: me ? me.id : null, action, target: cleanReason(target, 120), detail: cleanReason(detail, 1000) };
    auditLog.push(e);
    if (auditLog.length > 500) {
      const i = auditLog.findIndex((x) => MINOR_AUDIT.has(x.action));
      auditLog.splice(i >= 0 && i < auditLog.length - 1 ? i : 0, 1);
    }
    broadcast({ t: 'auditEntry', entry: e }, (u) => !u.bot && can(u, 'viewAudit'));
  }

  // Sohbet mesajı herkese giderken gizli alanlar (yazarın anahtarı, anket oyu sahipleri: "_" ile başlayanlar) çıkarılır
  const pubMsg = (m) => {
    const out = {};
    for (const k of Object.keys(m)) if (k[0] !== '_') out[k] = m[k];
    return out;
  };
  const findMsg = (channelId, id) => (chatHistory.get(channelId) || []).find((x) => x.id === id);
  const canModify = (me, msg) => !!msg && !msg.system && ((msg._k && msg._k === me.clientKey) || can(me, 'manageMessages'));

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
      roles: conf.roleDefs.map(publicRole),
      description: conf.description || '',
      announcement: conf.announcement || null,
      iconV: iconV(),
      flashCooldown: flashCooldown(),
      pingCooldown: pingCooldown(),
    });
  }
  // Ping bekleme süresi (saniye, 0 = sınırsız). Ayarlanmadıysa 3 sn.
  const pingAt = new Map();
  function pingCooldown() {
    const v = Number(conf.pingCooldown);
    return Number.isFinite(v) && v >= 0 ? Math.min(600, Math.floor(v)) : 3;
  }
  // Flash bekleme süresi (saniye, 0 = sınırsız). Ayarlanmadıysa 30 sn.
  const flashAt = new Map();
  function flashCooldown() {
    const v = Number(conf.flashCooldown);
    return Number.isFinite(v) && v >= 0 ? Math.min(3600, Math.floor(v)) : 30;
  }
  // Sunucu resmi: sadece sürüm numarası mesajlarla gider, resmin kendisi /icon adresinden bir kez indirilir (ngrok kotası)
  function iconV() {
    return conf.icon && conf.iconV ? conf.iconV : 0;
  }
  // Rol/yetki değişince etkilenen herkese yeni yetkilerini gönder
  const permsMsg = (u) => ({ t: 'perms', perms: [...permsOf(u)], roles: userRoleIds(u), rank: rankOf(u), admin: !!u.admin, mod: isModUser(u), color: userColor(u) });
  const permSnap = (u) => JSON.stringify([[...permsOf(u)].sort(), rankOf(u), userRoleIds(u), userColor(u)]);
  function syncPerms(by) {
    for (const u of users.values()) {
      if (u.bot) continue;
      const snap = permSnap(u);
      if (snap === u.permSnap) continue;
      const wasMod = !!u.wasMod;
      u.permSnap = snap;
      u.wasMod = isModUser(u);
      send(u.ws, permsMsg(u));
      // Eski istemciler "Moderatör oldun" bildirimini bu mesajla gösterir
      if (wasMod !== u.wasMod) send(u.ws, { t: 'role', mod: u.wasMod, by: by || 'Sunucu' });
    }
  }
  // Susturma/sağırlaştırma/zaman aşımı değişince kişinin kendisine
  const modStateMsg = (u, by, change, reason = '') => ({ t: 'modState', serverMuted: serverMuted(u), serverDeafened: serverDeafened(u), timeoutUntil: timeoutUntil(u), by: by || 'Sunucu', change, reason });
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
    if (channelId === null) {
      // Sesten çıkar: hiçbir ses kanalında durmaz (bir kanala tıklayınca tekrar girer)
      if (!u.channelId) return;
      const old = u.channelId;
      u.channelId = null;
      u.sharing = false;
      u.shares = [];
      activity({ kind: 'move', id: u.id, name: u.name, from: old, to: null });
      for (const v of votes.values()) if (v.targetId === u.id) endVote(v, false);
      broadcastState();
      return;
    }
    const target = channels.find((c) => c.id === channelId);
    if (!joinable(target)) return; // yazı kanalına ve başlık kanalına girilmez
    const old = u.channelId;
    if (old === channelId) return;
    u.channelId = channelId;
    u.sharing = false;
    u.shares = [];
    if (inAfk(u) && !u.muted) {
      u.muted = true;
      send(u.ws, { t: 'forceMute', by: 'Sunucu', server: true, afk: true });
    }
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
    if (me.nameStyle) msg.ns = nsOf(me);
    return msg;
  };
  const postMsg = (cid, msg) => {
    pushHistory(cid, msg);
    broadcast(pubMsg(msg), audience(cid));
  };
  const updateMsg = (cid, msg) => broadcast({ t: 'chatUpdate', channelId: cid, msg: pubMsg(msg) }, audience(cid));
  const errorTo = (u, message, code = 'info', extra) => send(u.ws, { t: 'error', code, message, ...extra });
  // Yetki yoksa kişiye hangi yetkinin gerektiğini söyle
  const deny = (u, perm) => errorTo(u, `Bunun için “${PERM_LABEL[perm] || perm}” yetkisi gerekiyor.`, 'forbidden', { perm });
  // Arka arkaya gelen istekler (ör. birlikte izle durumu) için uyarı en fazla 15 sn'de bir
  const denyQuiet = (u, perm) => {
    const now = Date.now();
    if (now - ((u.deniedAt ||= {})[perm] || 0) < 15000) return;
    u.deniedAt[perm] = now;
    deny(u, perm);
  };
  const hierErr = (u, what = 'Bu kişi') => errorTo(u, `${what} senden üstte ya da seninle aynı seviyede; bunu yapamazsın.`, 'hierarchy');
  const timeoutErr = (u) => errorTo(u, `Zaman aşımındasın; ${fmtLeft(timeoutUntil(u) - Date.now())} sonra tekrar deneyebilirsin.`, 'timed_out', { until: timeoutUntil(u) });
  // Yavaş mod: cihaz + kanal başına son mesaj zamanı (yeniden bağlanınca sıfırlanmasın)
  const slowAt = new Map();
  // Mesaj (ya da anket/çark/takım) gönderebilir mi? Engel varsa kişiye söyler ve false döner
  function canPost(me, cid, { attach = false, gif = false } = {}) {
    if (me.bot) return true;
    if (timedOut(me)) return timeoutErr(me), false;
    if (!can(me, 'sendMessages')) return deny(me, 'sendMessages'), false;
    if (attach && !can(me, 'attachFiles')) return deny(me, 'attachFiles'), false;
    if (gif && !can(me, 'useGifs')) return deny(me, 'useGifs'), false;
    const ch = channels.find((c) => c.id === cid);
    if (!ch || can(me, 'manageMessages')) return true;
    if (ch.readOnly) return errorTo(me, `${ch.type === 'text' ? '#' : ''}${ch.name} salt okunur; sadece yetkililer yazabilir.`, 'read_only', { channelId: cid }), false;
    if (ch.slowmode && !can(me, 'manageChannels')) {
      const k = me.clientKey + '|' + cid;
      const wait = (slowAt.get(k) || 0) + ch.slowmode * 1000 - Date.now();
      if (wait > 0) return errorTo(me, `Yavaş mod açık: ${Math.ceil(wait / 1000)} sn sonra tekrar yazabilirsin.`, 'slowmode', { channelId: cid, wait: Math.ceil(wait / 1000) }), false;
      if (slowAt.size > 5000) slowAt.delete(slowAt.keys().next().value); // en eskisi silinir (hepsi değil)
      slowAt.set(k, Date.now());
    }
    return true;
  }
  // Yönetim mesajlarındaki hedef: çevrimiçi kişi (to) ya da çevrimdışı üye (mid)
  function resolveTarget(m) {
    if (m.to) {
      const u = users.get(m.to);
      return u && !u.bot ? { user: u, key: u.clientKey, name: u.name } : null;
    }
    if (m.mid) {
      const key = keyByMid(String(m.mid));
      if (!key) return null;
      const u = usersByKey(key)[0] || null;
      return { user: u, key, name: u?.name || memberOf(key)?.name || 'Bilinmeyen' };
    }
    return null;
  }
  const chLabel = (c) => (c ? (c.type === 'text' ? '#' : '') + c.name : '—');
  const clampSlow = (v) => Math.max(0, Math.min(21600, Math.floor(Number(v) || 0))); // yavaş mod: en fazla 6 saat
  // Kişinin rollerini değiştir (hiyerarşi kontrolüyle). Başarılıysa true
  function setMemberRoles(me, t, nextIds) {
    const cur = memberOf(t.key)?.roles || [];
    const next = [...new Set(nextIds.map(String))].filter((id) => id !== 'everyone' && roleById(id));
    const added = next.filter((id) => !cur.includes(id));
    const removed = cur.filter((id) => !next.includes(id));
    if (!added.length && !removed.length) return true;
    // Kendine (kendi rolünün altındaki) rol verebilirsin; başkasına ancak senden alttaysa
    if (t.key !== me.clientKey && !outranksT(me, t)) return hierErr(me), false;
    const high = [...added, ...removed].map(roleById).find((r) => !canEditRole(me, r));
    if (high) return hierErr(me, `“${high.name}” rolü`), false;
    const mem = memberOf(t.key) || (conf.members[t.key] = { name: t.name, roles: [] });
    mem.roles = next;
    if (t.user) mem.name = t.user.name;
    cleanupMember(t.key);
    saveConf();
    audit(me, 'memberRoles', t.name, [...added.map((id) => '+' + roleById(id).name), ...removed.map((id) => '−' + roleById(id).name)].join(', '));
    broadcastState();
    syncPerms(me.name);
    return true;
  }
  // Duyuru şeridi (kalıcı ayar; sohbet değil). Değiştiyse true
  function setAnnouncement(me, text) {
    text = String(text || '').trim().slice(0, 300);
    if (text === (conf.announcement?.text || '')) return false;
    conf.announcement = text ? { text, by: me.name, at: Date.now() } : null;
    saveConf();
    broadcast({ t: 'announce', announcement: conf.announcement }, (u) => !u.bot);
    audit(me, 'announce', '', text || 'duyuru kaldırıldı');
    return true;
  }

  // ---------- Oylamayla susturma / AFK'ya gönderme ----------
  const votes = new Map(); // hedef kullanıcı id -> oylama
  const voteStartAt = new Map(); // clientKey -> son oylama başlatma zamanı (yeniden bağlanınca sıfırlanmasın)
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
      const until = Date.now() + 60 * 1000;
      if (voteMutes.size > 5000) for (const [k, t] of voteMutes) if (t <= Date.now()) voteMutes.delete(k);
      voteMutes.set(target.clientKey, until);
      // Aynı cihazın bütün bağlantıları susar (yeniden bağlanınca da sürer)
      for (const u of usersByKey(target.clientKey)) {
        u.muted = true;
        send(u.ws, { t: 'forceMute', by: 'Kanal oylaması', until });
      }
      setTimeout(() => broadcastState(), 60 * 1000 + 500).unref?.();
      broadcastState();
    } else if (afkId()) {
      send(target.ws, { t: 'moved', by: 'Kanal oylaması' });
      moveUser(target, afkId());
    }
  }

  // ---------- Bağlantı önizlemesi (yerel ağ adreslerine istek atılmaz) ----------
  const privateV4 = (v4) => {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
  };
  // IPv6 adresini 8 sayıya aç (::ffff:7f00:1 gibi yazımlar da yerel sayılsın diye)
  const expand6 = (ip) => {
    let s = ip.split('%')[0];
    let tail = [];
    const m4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m4) {
      if (!net.isIPv4(m4[1])) return null;
      const p = m4[1].split('.').map(Number);
      tail = [(p[0] << 8) | p[1], (p[2] << 8) | p[3]];
      s = s.slice(0, -m4[1].length);
      if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
    }
    const parts = s.split('::');
    if (parts.length > 2) return null;
    const hx = (x) => (x ? x.split(':').map((h) => parseInt(h, 16)) : []);
    const head = hx(parts[0]);
    const rest = parts.length === 2 ? hx(parts[1]) : [];
    const fill = 8 - head.length - rest.length - tail.length;
    if (parts.length === 2 ? fill < 0 : fill !== 0) return null;
    const g = [...head, ...Array(fill).fill(0), ...rest, ...tail];
    return g.length === 8 && g.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? g : null;
  };
  const privateIp = (ip) => {
    ip = String(ip || '').toLowerCase();
    if (net.isIPv4(ip)) return privateV4(ip);
    if (!net.isIPv6(ip)) return true;
    const g = expand6(ip);
    if (!g) return true;
    const v4of = (x, y) => `${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`;
    const zero = (n) => g.slice(0, n).every((x) => x === 0);
    if (zero(8) || (zero(7) && g[7] === 1)) return true; // :: ve ::1
    if (zero(5) && g[5] === 0xffff) return privateV4(v4of(g[6], g[7])); // ::ffff:a.b.c.d
    if (zero(6)) return privateV4(v4of(g[6], g[7])); // ::a.b.c.d (eski yazım)
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateV4(v4of(g[6], g[7])); // NAT64
    if (g[0] === 0x2002) return privateV4(v4of(g[1], g[2])); // 6to4
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
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
      // Adres doğrudan IP ise Node DNS'e (safeLookup) hiç sormaz: yerel IP'ler burada engellenir
      const hn = u.hostname.replace(/^\[|\]$/g, '');
      if (net.isIP(hn) && privateIp(hn)) return reject(new Error('blocked'));
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

  // Aynı anda süren yüklemeler: bellek şişirilmesin diye kişi başı 2, toplam 200 MB
  let uploadingBytes = 0;
  const UPLOAD_INFLIGHT_MAX = 200 * 1024 * 1024;

  // ---------- Tarayıcıdan katılma: Kanki'nin arayüzü aynı adresten web sayfası olarak sunulur ----------
  // Sadece src/renderer içindeki bilinen türde dosyalar; klasör dışına çıkılamaz. index.html'e web katmanı eklenir.
  const WEB_ROOT = path.join(__dirname, '..', 'src', 'renderer');
  const WEB_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  let webVersion = '';
  try {
    webVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '';
  } catch {}
  let webIndex = null;
  function webIndexHtml() {
    if (webIndex) return webIndex;
    let html = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
    const head =
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />\n' +
      '  <meta name="theme-color" content="#0b0f0d" />\n' +
      '  <meta name="apple-mobile-web-app-capable" content="yes" />\n' +
      `  <meta name="kanki-version" content="${webVersion}" />\n` +
      '  <link rel="manifest" href="manifest.webmanifest" />\n' +
      '  <link rel="apple-touch-icon" href="web-icon.png" />\n' +
      '  <link rel="stylesheet" href="web.css" />\n' +
      '  <script src="web-shim.js"></script>\n  ';
    html = html.replace('<script src="theme-boot.js"></script>', head + '<script src="theme-boot.js"></script>');
    return (webIndex = html);
  }
  function serveWeb(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    try {
      rel = decodeURIComponent(rel);
    } catch {
      return false;
    }
    if (!/^[A-Za-z0-9_\-./]+$/.test(rel) || rel.includes('..') || rel.startsWith('/')) return false;
    const ext = path.extname(rel).toLowerCase();
    const type = WEB_TYPES[ext];
    if (!type) return false;
    const file = path.join(WEB_ROOT, rel);
    if (!file.startsWith(WEB_ROOT + path.sep)) return false;
    let body;
    try {
      body = rel === 'index.html' ? Buffer.from(webIndexHtml()) : fs.readFileSync(file);
    } catch {
      return false;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': rel === 'index.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(rel === 'index.html' ? { 'X-Frame-Options': 'DENY' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  function handleHttp(req, res) {
    let u;
    try {
      u = new URL(req.url, 'http://x');
    } catch {
      res.writeHead(400);
      return res.end();
    }
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
      if (!can(user, 'attachFiles') || timedOut(user)) {
        req.resume();
        return json(403, { error: timedOut(user) ? 'Zaman aşımındayken dosya gönderemezsin.' : 'Bu sunucuda dosya gönderme yetkin yok.', code: timedOut(user) ? 'timed_out' : 'forbidden' });
      }
      if (!size || size > FILE_MAX) {
        req.resume();
        return json(413, { error: 'Dosya en fazla 50 MB olabilir.' });
      }
      if ((user.uploads || 0) >= 2 || uploadingBytes + size > UPLOAD_INFLIGHT_MAX) {
        req.resume();
        return json(429, { error: 'Şu an çok fazla dosya yükleniyor; biraz sonra tekrar dene.', code: 'busy' });
      }
      user.uploads = (user.uploads || 0) + 1;
      uploadingBytes += size;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        user.uploads--;
        uploadingBytes -= size;
      };
      req.on('close', release);
      req.on('error', release);
      const chunks = [];
      let got = 0;
      req.on('data', (c) => {
        got += c.length;
        if (got > FILE_MAX || got > size) return release(), req.destroy();
        chunks.push(c);
      });
      req.on('end', () => {
        release();
        if (got > size) return;
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
    // Sunucu resmi (sol çubuk, ana sayfa kartı, kanal listesinin üstü). ?v= sürümüyle istenir, uzun süre önbellekte kalır.
    if (u.pathname === '/icon') {
      const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'ngrok-skip-browser-warning' };
      if (req.method === 'OPTIONS') {
        res.writeHead(204, hdr);
        return res.end();
      }
      const im = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(conf.icon || '');
      if (req.method !== 'GET' || !im) return json(404, { error: 'Sunucu resmi yok' });
      const buf = Buffer.from(im[2], 'base64');
      res.writeHead(200, { ...hdr, 'Content-Type': im[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    }
    // Sunucu kartı (Kanki ana sayfası ve sol çubuk): ad, kaç kişi çevrimiçi, canlı yayın var mı.
    // Şifreli sunucuda kimlerin içeride olduğu gösterilmez, sadece sayı.
    if (u.pathname === '/info') {
      const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'ngrok-skip-browser-warning', 'Cache-Control': 'no-store' };
      if (req.method === 'OPTIONS') {
        res.writeHead(204, hdr);
        return res.end();
      }
      if (req.method === 'GET') {
        const people = [...users.values()].filter((x) => !x.bot);
        const body = JSON.stringify({
          kanki: true,
          name: serverName,
          online: people.length,
          inVoice: people.filter((x) => x.channelId).length,
          live: people.reduce((n, x) => n + (x.shares || []).filter((s) => s.kind !== 'camera').length, 0),
          names: password ? [] : people.slice(0, 6).map((x) => x.name),
          locked: !!password,
          version: webVersion,
          iconV: iconV(),
        });
        res.writeHead(200, { ...hdr, 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(body);
      }
    }
    // Tarayıcıdan açılırsa Kanki'nin web hali (Sunucu Ayarları › Bağlantı'dan açılır; kapalıyken ngrok kotası harcanmaz)
    if (u.pathname !== '/' || /text\/html/.test(req.headers.accept || '')) {
      if (conf.webClient === true && serveWeb(req, res, u.pathname)) return;
      if (u.pathname !== '/') return json(404, { error: 'Bulunamadı' });
      if (conf.webClient !== true) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`${serverName}: tarayıcıdan katılma kapalı. Kanki uygulamasıyla bağlan.\n`);
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${serverName} çalışıyor. Bağlı kullanıcı: ${users.size}\n`);
  }
  const httpServer = http.createServer((req, res) => {
    try {
      handleHttp(req, res);
    } catch (e) {
      log('HTTP isteği işlenemedi:', e && e.message);
      try {
        if (!res.headersSent) res.writeHead(400);
        res.end();
      } catch {}
    }
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 4 * 1024 * 1024 }); // sohbette resim gönderilebilsin
  wss.on('error', (e) => log('WebSocket sunucu hatası:', e && e.message));
  // Şifre deneme sınırı (IP başına; bu makineden gelenler hariç): 10 dakikada 10 hatalı deneme → 5 dakika bekle
  const pwFails = new Map(); // ip -> { n, first, until }
  function notePwFail(ip) {
    if (isLoopIp(ip)) return;
    const now = Date.now();
    let r = pwFails.get(ip);
    if (!r || now - r.first > 10 * 60 * 1000) r = { n: 0, first: now, until: 0 };
    if (++r.n >= 10) r = { n: 0, first: now, until: now + 5 * 60 * 1000 };
    if (pwFails.size > 5000) pwFails.clear();
    pwFails.set(ip, r);
  }
  // Cezalı cihazın IP'sinden yeni cihaz anahtarıyla gelene cezayı taşı
  function carryPenalty(src, u) {
    const did = [];
    const to = timeouts.get(src.key);
    if (to && to.until > Date.now()) {
      startTimeout(u.clientKey, { until: to.until, by: to.by, reason: to.reason });
      did.push('timeout');
    }
    const sm = memberOf(src.key);
    if (sm && (sm.mute || sm.deaf)) {
      const nm = memberOf(u.clientKey) || (conf.members[u.clientKey] = { name: u.name, roles: [] });
      if (sm.mute) nm.mute = true;
      if (sm.deaf) nm.deaf = true;
      saveConf();
      if (sm.mute) did.push('serverMute');
      if (sm.deaf) did.push('serverDeafen');
    }
    for (const a of did) audit(null, a, u.name, `Cezalı ${src.name || 'bir kişinin'} IP adresinden yeni bir cihazla bağlandı; ceza devam ediyor.`);
    if (did.length) log(`${u.name}: cezalı cihazın IP'sinden yeni cihaz, ceza taşındı (${did.join(', ')})`);
  }

  wss.on('connection', (ws, req) => {
    let me = null;
    // ngrok gibi tüneller gerçek IP'yi X-Forwarded-For başlığında iletir. Başlığa sadece bu makinedeki tünelden
    // (127.0.0.1) gelen bağlantıda güvenilir ve tünelin eklediği son adres alınır; yoksa herkes IP'sini uydurabilirdi.
    const peer = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const fwdList = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim().replace(/^::ffff:/, '')).filter(Boolean);
    const fwd = isLoopIp(peer) && fwdList.length && net.isIP(fwdList[fwdList.length - 1]) ? fwdList[fwdList.length - 1] : '';
    const ip = (fwd || peer).slice(0, 64);
    // Bozuk / çok büyük çerçeve gelirse ws "error" yayar; dinleyici yoksa bütün sunucu çöker
    ws.on('error', () => {});

    const handleMessage = (raw) => {
      const m = parseClientMsg(raw);
      if (!m) return;
      if (!me) {
        if (m.t !== 'hello') return;
        const isAdmin = !!m.adminKey && safeEqual(m.adminKey, adminKey);
        const isBot = !!m.botKey && safeEqual(m.botKey, botKey);
        if (password && !isAdmin && !isBot) {
          if ((pwFails.get(ip)?.until || 0) > Date.now()) {
            send(ws, { t: 'error', code: 'bad_password', message: 'Çok fazla hatalı şifre denendi. Birkaç dakika sonra tekrar dene.' });
            return ws.close();
          }
          if (m.password !== password) {
            notePwFail(ip);
            send(ws, { t: 'error', code: 'bad_password', message: 'Sunucu şifresi hatalı.' });
            return ws.close();
          }
        }
        // Aynı IP'den en fazla 8 bağlantı (bu makineden gelenler hariç): bağlantı yağmuruyla sunucu yorulmasın
        if (!isAdmin && !isBot && !isLoopIp(ip) && [...users.values()].filter((u) => u.ip === ip).length >= 8) {
          send(ws, { t: 'error', code: 'too_many', message: 'Bu adresten çok fazla bağlantı var.' });
          return ws.close();
        }
        const ck = String(m.clientKey || '').slice(0, 64);
        const banned = !isAdmin && !isBot && conf.bans.find((b) => (ck && b.key === ck) || (b.ip && b.ip === ip));
        if (banned) {
          send(ws, { t: 'error', code: 'banned', message: `Bu sunucudan yasaklandın${banned.reason ? ': ' + banned.reason : '.'}` });
          return ws.close();
        }
        let name = isBot ? 'Müzik Botu' : cleanName(m.name) || 'Misafir';
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
          xfer: !isBot && Array.isArray(m.caps) && m.caps.includes('xfer'), // doğrudan (P2P) dosya alabilir
          token: crypto.randomBytes(18).toString('base64url'), // dosya yükleme/indirme için
          ip,
          connectedAt: Date.now(),
          ws,
          alive: true,
        };
        users.set(me.id, me);
        log(`Bağlandı: ${name} (${ip})${isAdmin ? ' [yönetici]' : ''}`);
        if (isAdmin) rememberOwner(me.clientKey);
        if (m.adminKey && !isAdmin) send(ws, { t: 'error', code: 'bad_admin_key', message: 'Yönetici anahtarı hatalı; normal kullanıcı olarak bağlandın.' });
        // Kayıtlı üyenin adı güncel kalsın (çevrimdışı listede görünür)
        const mem = !isBot && memberOf(me.clientKey);
        if (mem && mem.name !== name) {
          mem.name = name;
          saveConf();
        }
        if (!isBot) {
          // Bu çalışmada ilk kez görülen cihaz, cezalı bir cihazın IP'sinden geliyorsa ceza ona da geçer
          const fresh = !seenKeys.has(me.clientKey) && !memberOf(me.clientKey) && !timeouts.has(me.clientKey);
          if (seenKeys.size > 20000) seenKeys.clear();
          seenKeys.add(me.clientKey);
          const src = !isAdmin && fresh && !isLoopIp(ip) && penaltyIp.get(ip);
          if (src && src.key !== me.clientKey) carryPenalty(src, me);
          notePenaltyIp(me);
        }
        // Sunucu susturması / sağırlaştırma / zaman aşımı / oylamayla susturma yeniden bağlanınca da sürer
        const forcedMute = serverMuted(me) || timedOut(me);
        const voteMuteEnd = voteMutedUntil(me);
        if (forcedMute || voteMuteEnd > Date.now()) me.muted = true;
        if (serverDeafened(me)) me.deafened = true;
        me.permSnap = permSnap(me);
        me.wasMod = isModUser(me);
        send(ws, {
          t: 'welcome',
          id: me.id,
          name,
          serverName,
          iceServers: iceNow(),
          admin: isAdmin,
          mod: isModUser(me),
          token: me.token,
          features: ['sfx', 'activity', 'log', 'pins', 'polls', 'votes', 'files', 'preview', 'gif', 'roles', 'chpass', 'afk', 'bans', 'marks', 'watch', 'perms', 'audit', 'timeout', 'serverDeafen', 'moveAll', 'purge', 'slowmode', 'readOnly', 'announce', 'welcomeMessage', 'headers', 'afkMic', 'webClient', 'info', 'leaveVoice', 'icon', 'flash', 'flashCooldown', 'liftVoteMute', 'storm', 'bolts', 'ping', 'pingCooldown', 'pingColor', 'p2pFiles'],
          // Roller ve yetkiler
          perms: [...permsOf(me)],
          roles: userRoleIds(me),
          rank: rankOf(me),
          mid: isBot ? null : midOf(me.clientKey),
          permDefs: PERMS.map(([key, label, desc, group]) => ({ key, label, desc, group, groupLabel: PERM_GROUPS[group] })),
          serverMuted: serverMuted(me),
          serverDeafened: serverDeafened(me),
          timeoutUntil: timeoutUntil(me),
          description: conf.description || '',
          welcomeMessage: conf.welcomeMessage || '',
          announcement: conf.announcement || null,
          iconV: iconV(),
        });
        if (forcedMute) send(ws, { t: 'forceMute', by: timeouts.get(me.clientKey)?.by || 'Sunucu', server: true, until: timeoutUntil(me) || undefined });
        else if (voteMuteEnd > Date.now()) send(ws, { t: 'forceMute', by: 'Kanal oylaması', until: voteMuteEnd });
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
        const wch = channels.find((c) => c.id === m.channelId && joinable(c));
        // Şifreli ya da dolu kanala yeniden bağlanırken Lobi'ye düşülür
        const bypass = can(me, 'moveMembers') || can(me, 'manageChannels');
        // Yeni istemci: sunucuya girince sese otomatik girilmez, kişi kanala tıklayınca girer (Discord gibi).
        // Bağlantı koptuktan sonra yeniden bağlanırken önceki kanala dönülür.
        if (m.noAutoJoin && !wch) {
          broadcastState();
          return;
        }
        const wanted = wch && (bypass || (!wch.pwHash && !(wch.limit && voiceCount(wch.id) >= wch.limit))) ? wch.id : lobbyId();
        moveUser(me, wanted);
        return;
      }

      // Her yönetim mesajı için gereken yetki (hiyerarşi ayrıca kontrol edilir)
      const NEED = {
        createChannel: 'manageChannels',
        renameChannel: 'manageChannels',
        deleteChannel: 'manageChannels',
        channelSettings: 'manageChannels',
        setServer: 'manageServer',
        setConfig: 'manageServer',
        announce: 'manageServer',
        kick: 'kick',
        ban: 'ban',
        unban: 'ban',
        timeout: 'timeout',
        serverMute: 'muteMembers',
        serverDeafen: 'deafenMembers',
        move: 'moveMembers',
        moveAll: 'moveMembers',
        purge: 'manageMessages',
        setRole: 'manageRoles',
        roleCreate: 'manageRoles',
        roleUpdate: 'manageRoles',
        roleDelete: 'manageRoles',
        roleOrder: 'manageRoles',
        roleMove: 'manageRoles',
        memberRoles: 'manageRoles',
        memberRole: 'manageRoles',
        memberPingColor: 'manageRoles',
        audit: 'viewAudit',
        flash: 'flash',
        spot: 'ping',
        liftVoteMute: 'muteMembers',
      };
      const need = typeof m.t === 'string' && Object.hasOwn(NEED, m.t) ? NEED[m.t] : null;
      if (need && !can(me, need)) return deny(me, need);
      if (m.t === 'adminInfo' && !isStaff(me)) return errorTo(me, 'Yönetim paneli için bir yönetim yetkin olmalı.', 'forbidden');

      switch (m.t) {
        case 'leaveVoice':
          // Sesten çık, sunucuda kal (Discord'daki telefon düğmesi gibi)
          moveUser(me, null);
          break;
        case 'join': {
          const ch = channels.find((c) => c.id === m.channelId);
          if (!ch || ch.type === 'text' || ch.id === me.channelId) break;
          if (ch.header) {
            errorTo(me, `${ch.name} bir başlık; içine girilemez, altındaki kanallardan birini seç.`, 'header_channel');
            break;
          }
          if (!can(me, 'moveMembers') && !can(me, 'manageChannels')) {
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
        case 'status': {
          // Sunucu susturması / zaman aşımı / sağırlaştırma kişinin kendisi tarafından kaldırılamaz
          const forcedMute = serverMuted(me) || timedOut(me);
          if ('muted' in m) {
            me.muted = !!m.muted || voteMutedUntil(me) > Date.now() || forcedMute || inAfk(me);
            if (!m.muted && !forcedMute && inAfk(me)) send(ws, { t: 'forceMute', by: 'Sunucu', server: true, afk: true });
            if (!m.muted && forcedMute && !me.bot) send(ws, { t: 'forceMute', by: timedOut(me) ? timeouts.get(me.clientKey)?.by || 'Sunucu' : 'Sunucu', server: true, until: timeoutUntil(me) || undefined });
          }
          if ('deafened' in m) me.deafened = !!m.deafened || serverDeafened(me);
          if ('sharing' in m) me.sharing = !!m.sharing && !timedOut(me) && can(me, 'stream');
          if (Array.isArray(m.shares)) {
            // Aynı anda en fazla 4 yayın (3 ekran + kamera); her biri { id, label, kind? }
            const dropped = [];
            let deniedPerm = '';
            me.shares = m.shares
              .slice(0, 4)
              .map((x) => {
                const s = { id: String(x?.id || '').slice(0, 40), label: String(x?.label || 'Ekran').slice(0, 60) };
                if (x?.kind === 'camera') s.kind = 'camera';
                return s;
              })
              .filter((x) => x.id)
              .filter((x) => {
                const perm = x.kind === 'camera' ? 'camera' : 'stream';
                if (me.bot || (!timedOut(me) && can(me, perm))) return true;
                dropped.push(x.id);
                deniedPerm ||= perm;
                return false;
              });
            me.sharing = me.shares.length > 0;
            if (dropped.length) {
              // Yeni istemci bu yayınları kapatır; eskiler için de izleyenlere hiç görünmez
              send(ws, { t: 'stopShares', ids: dropped, reason: timedOut(me) ? 'timeout' : deniedPerm });
              if (timedOut(me)) timeoutErr(me);
              else denyQuiet(me, deniedPerm);
            }
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
        }
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
          // Yetkiler: mesaj, dosya/resim, GIF, zaman aşımı, salt okunur, yavaş mod
          if (!canPost(me, cid, { attach: !!(image || (file && file.by === me.id)), gif: !!gif })) break;
          // @herkes yetkisi yoksa bahsetme bildirim göndermesin (yazı aynen görünür)
          const body = me.bot || can(me, 'mentionEveryone') ? text : neutralizeEveryone(text);
          const msg = { t: 'chat', id: crypto.randomUUID(), channelId: cid, from: me.id, name: me.name, text: body, ts: Date.now(), _k: me.clientKey };
          if (me.nameStyle) msg.ns = nsOf(me); // isim stili mesajla saklanır (kişi çıkınca da görünsün)
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
          if (link && !gif && conf.linkPreviews !== false)
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
          // Müzik panelindeki düğmelerden gelen komutlar (sohbete yazılmaz). Zaman aşımındaki kişi botu yönetemez.
          if (me.bot) break;
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          forwardToBot(me, m.cmd, m.arg);
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
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          msg.text = me.bot || can(me, 'mentionEveryone') ? text : neutralizeEveryone(text);
          msg.edited = Date.now();
          broadcast({ t: 'chatUpdate', channelId: cid, msg: pubMsg(msg) }, audience(cid));
          break;
        }
        case 'chatDelete': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!canModify(me, msg)) break; // yazan ya da "Mesajları yönet" yetkisi olan silebilir
          const arr = chatHistory.get(cid);
          arr.splice(arr.indexOf(msg), 1);
          broadcast({ t: 'chatDelete', channelId: cid, id: msg.id }, audience(cid));
          // Silinen mesajın içeriği kayda yazılmaz, sadece kimin, hangi kanalda
          if (msg._k !== me.clientKey) audit(me, 'messageDelete', msg.name, chLabel(channels.find((c) => c.id === cid)));
          break;
        }
        case 'react': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          const emoji = String(m.emoji || '').slice(0, 16);
          if (!msg || msg.system || !emoji || POISON_KEYS.has(emoji)) break;
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          msg.reactions = msg.reactions || {};
          const has = Object.hasOwn(msg.reactions, emoji);
          const list = has && Array.isArray(msg.reactions[emoji]) ? msg.reactions[emoji] : [];
          if (list.includes(me.name)) msg.reactions[emoji] = list.filter((n) => n !== me.name);
          else if (Object.keys(msg.reactions).length < 20 || has) msg.reactions[emoji] = [...list, me.name].slice(-200);
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
            if (cid && !timedOut(me) && can(me, 'sendMessages')) broadcast({ t: 'typing', from: me.id, name: me.name, channelId: cid }, (u) => aud(u) && u.id !== me.id);
          }
          break;
        case 'pin': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!msg || msg.system) break;
          const own = msg._k === me.clientKey;
          if (!own && !can(me, 'manageMessages')) {
            deny(me, 'manageMessages');
            break;
          }
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          if (m.on) {
            msg.pinned = true;
            msg.pinnedBy = me.name;
          } else {
            delete msg.pinned;
            delete msg.pinnedBy;
          }
          updateMsg(cid, msg);
          if (!own) audit(me, m.on ? 'pin' : 'unpin', msg.name, chLabel(channels.find((c) => c.id === cid)));
          break;
        }
        case 'poll': {
          const cid = chatTarget(me, m.channelId);
          const q = String(m.question || '').trim().slice(0, 200);
          const opts = (Array.isArray(m.options) ? m.options.slice(0, 50) : []).map((x) => String(x || '').trim().slice(0, 80)).filter(Boolean).slice(0, 10);
          if (!cid || !q || opts.length < 2) break;
          if (!me.bot && !can(me, 'createPolls')) {
            deny(me, 'createPolls');
            break;
          }
          if (!canPost(me, cid)) break;
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
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          // Oylar cihaz anahtarına göre tutulur: yeniden bağlanıp ya da başka adla ikinci kez oy verilemez,
          // çıkan birinin adını alan kişi onun oyunu değiştiremez. Herkese sadece adlar gider.
          const pv = msg._pv || (msg._pv = new Map()); // clientKey -> { name, opts:Set }
          const rec = pv.get(me.clientKey) || { name: me.name, opts: new Set() };
          rec.name = me.name;
          const had = rec.opts.has(i);
          if (!p.multi) rec.opts.clear();
          else rec.opts.delete(i);
          if (!had) rec.opts.add(i);
          if (rec.opts.size) pv.set(me.clientKey, rec);
          else pv.delete(me.clientKey);
          p.options.forEach((o, j) => (o.votes = [...pv.values()].filter((r) => r.opts.has(j)).map((r) => r.name)));
          updateMsg(cid, msg);
          break;
        }
        case 'pollClose': {
          const cid = chatTarget(me, m.channelId);
          const msg = findMsg(cid, m.id);
          if (!msg?.poll || (msg._k !== me.clientKey && !can(me, 'manageMessages'))) break;
          msg.poll.closed = true;
          updateMsg(cid, msg);
          break;
        }
        case 'wheel': {
          // Çark: sonucu sunucu seçer, herkes aynı sonucu görür
          const cid = chatTarget(me, m.channelId);
          const opts = (Array.isArray(m.options) ? m.options.slice(0, 100) : []).map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 24);
          if (!cid || opts.length < 2) break;
          if (!can(me, 'createPolls')) {
            deny(me, 'createPolls');
            break;
          }
          if (!canPost(me, cid)) break;
          const msg = newMsg(me, cid);
          msg.wheel = { title: String(m.title || '').trim().slice(0, 100), options: opts, result: crypto.randomInt(opts.length) };
          postMsg(cid, msg);
          break;
        }
        case 'teams': {
          // Takım kur: ses kanalındakileri rastgele N takıma böler
          if (!me.channelId) break;
          const cid = chatTarget(me, m.channelId);
          if (!can(me, 'createPolls')) {
            deny(me, 'createPolls');
            break;
          }
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
          if (!canPost(me, cid)) break;
          const msg = newMsg(me, cid);
          msg.teams = { teams, channel: channels.find((c) => c.id === me.channelId)?.name || '' };
          postMsg(cid, msg);
          break;
        }
        case 'voteStart': {
          const target = users.get(m.to);
          const action = m.action === 'afk' ? 'afk' : 'mute';
          if (!target || target.bot || target.id === me.id || target.clientKey === me.clientKey || !me.channelId || target.channelId !== me.channelId) break;
          if (!can(me, 'startVotes')) {
            deny(me, 'startVotes');
            break;
          }
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          // Yönetim yetkisi olan herkes (ve sahibin cihazı) oylamaya karşı korunur
          if (isMod(target) || isStaff(target) || isOwnerKey(target.clientKey)) {
            errorTo(me, 'Yönetici ve moderatörler oylamayla susturulamaz ya da taşınamaz.');
            break;
          }
          if (votes.has(target.id) || [...votes.values()].some((x) => x.targetKey === target.clientKey)) break;
          if (action === 'afk' && (!afkId() || target.channelId === afkId())) {
            errorTo(me, 'Bu sunucuda AFK kanalı yok.');
            break;
          }
          if (Date.now() - (voteStartAt.get(me.clientKey) || 0) < 60000) {
            errorTo(me, 'Yeni bir oylama için 1 dakika beklemelisin.');
            break;
          }
          // Oy hakkı cihaz başına bir: aynı cihazdan açılan ek bağlantılar sayıyı şişiremez
          const voters = new Set([...users.values()].filter((u) => u.channelId === me.channelId && !u.bot && u.clientKey !== target.clientKey).map((u) => u.clientKey));
          if (voters.size < 2) {
            errorTo(me, 'Oylama için kanalda senden başka en az bir kişi daha olmalı.');
            break;
          }
          if (voteStartAt.size > 5000) voteStartAt.clear();
          voteStartAt.set(me.clientKey, Date.now());
          const v = { id: crypto.randomUUID(), targetId: target.id, targetKey: target.clientKey, targetName: target.name, action, by: me.name, channelId: me.channelId, yes: new Set([me.clientKey]), no: new Set(), required: Math.max(2, Math.ceil(voters.size * 0.75)), total: voters.size, until: Date.now() + 60000 };
          v.timer = setTimeout(() => endVote(v, false), 60000);
          votes.set(target.id, v);
          sendVote(v);
          break;
        }
        case 'vote': {
          const v = [...votes.values()].find((x) => x.id === m.id);
          if (!v || me.bot || me.channelId !== v.channelId || me.id === v.targetId || me.clientKey === v.targetKey) break;
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          // Oy cihaz anahtarına göre: yeniden bağlanıp ya da ikinci bağlantıyla iki kez oy verilemez
          (m.yes ? v.yes : v.no).add(me.clientKey);
          (m.yes ? v.no : v.yes).delete(me.clientKey);
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
          if (!can(me, 'useGifs')) {
            send(ws, { t: 'gifResults', q: m.q, error: 'forbidden' });
            denyQuiet(me, 'useGifs');
            break;
          }
          gifSearch(String(m.q || '').trim().slice(0, 100))
            .then((r) => send(ws, { t: 'gifResults', q: m.q, ...r }))
            .catch(() => send(ws, { t: 'gifResults', q: m.q, error: 'fail' }));
          break;
        case 'mark': {
          // Yayına işaret: izleyenin tıkladığı nokta herkesin görüntüsünde ve yayıncının ekranında kısa süre görünür
          const now = Date.now();
          const owner = users.get(m.owner);
          if (!owner || !me.channelId || owner.channelId !== me.channelId || now - (me.markAt || 0) < 60 || timedOut(me)) break;
          me.markAt = now;
          const clamp = (x) => Math.max(0, Math.min(1, Number(x) || 0));
          const pts = (Array.isArray(m.pts) ? m.pts : [[m.x, m.y]]).slice(0, 80).map((p) => [clamp(p?.[0]), clamp(p?.[1])]);
          broadcast({ t: 'mark', from: me.id, name: me.name, color: pingColorOf(me), owner: owner.id, share: String(m.share || '').slice(0, 40), kind: m.kind === 'line' ? 'line' : 'ping', pts, stroke: String(m.stroke || '').slice(0, 40) }, (u) => u.channelId === me.channelId && !u.bot);
          break;
        }
        case 'watchCtl': {
          // Birlikte izle: izleyenin durdur/oynat/sar isteği yayıncıya gider
          // Sadece o kişinin gerçekten açık olan yayınına gider; saniyede en fazla birkaç istek
          const owner = users.get(m.owner);
          const share = String(m.share || '').slice(0, 40);
          if (!owner || !me.channelId || owner.channelId !== me.channelId || !share || !owner.shares.some((x) => x.id === share)) break;
          if (!can(me, 'startWatch')) {
            denyQuiet(me, 'startWatch');
            break;
          }
          if (timedOut(me)) break;
          const now = Date.now();
          if (now - (me.watchCtlAt || 0) < 150) break;
          me.watchCtlAt = now;
          send(owner.ws, { t: 'watchCtl', from: me.id, name: me.name, share, act: String(m.act || '').slice(0, 12), time: Number(m.time) || 0 });
          break;
        }
        case 'watchState':
          if (!me.channelId || timedOut(me)) break;
          if (!can(me, 'startWatch')) {
            denyQuiet(me, 'startWatch');
            break;
          }
          broadcast(
            { t: 'watchState', owner: me.id, share: String(m.share || '').slice(0, 40), paused: !!m.paused, time: Number(m.time) || 0, duration: Number(m.duration) || 0, title: String(m.title || '').slice(0, 200), by: String(m.by || '').slice(0, 40), at: Date.now() },
            (u) => u.channelId === me.channelId && u.id !== me.id && !u.bot
          );
          break;
        case 'poke': {
          const target = users.get(m.to);
          if (!target || target.bot) break;
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          // Dürtme yağmuru olmasın: kişi başı saniyede bir
          const now = Date.now();
          if (now - (me.pokeAt || 0) < 1000) break;
          me.pokeAt = now;
          send(target.ws, { t: 'poke', from: me.id, name: me.name, text: cleanReason(m.text) });
          break;
        }
        case 'liftVoteMute': {
          // Oylamayla susturulan kişinin susturmasını yetkili kaldırır (mikrofonunu kendisi açabilir)
          const target = users.get(m.to);
          if (!target || target.bot || voteMutedUntil(target) <= Date.now()) break;
          voteMutes.delete(target.clientKey);
          for (const u of usersByKey(target.clientKey)) send(u.ws, { t: 'voteMuteLifted', by: me.name });
          audit(me, 'liftVoteMute', target.name);
          broadcastState();
          break;
        }
        case 'xfer': {
          // Doğrudan dosya aktarımı: sunucu sadece el sıkışmayı hedef kişiye iletir (dosya WebRTC ile doğrudan gider)
          const target = users.get(m.to);
          if (!target || target.bot || target === me) break;
          const now = Date.now();
          // Sıklık sınırı: 5 saniyede en fazla 120 mesaj (bağlantı kurulurken ICE adayları art arda gelir)
          if (now - (me.xferWin || 0) > 5000) {
            me.xferWin = now;
            me.xferN = 0;
          }
          if (++me.xferN > 120) break;
          const id = String(m.id || '').slice(0, 40);
          if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) break;
          const kind = String(m.kind || '');
          const out = { t: 'xfer', kind, id, from: me.id, name: me.name };
          if (kind === 'offer') {
            if (!can(me, 'attachFiles')) {
              deny(me, 'attachFiles');
              break;
            }
            if (timedOut(me)) {
              timeoutErr(me);
              break;
            }
            if (now - (me.xferOfferAt || 0) < 1500) break;
            me.xferOfferAt = now;
            if (!target.xfer) {
              errorTo(me, `${target.name} doğrudan dosya alamıyor (eski sürüm ya da tarayıcıdan bağlı).`, 'info');
              break;
            }
            const files = (Array.isArray(m.files) ? m.files : []).slice(0, 50).map((f) => ({ name: cleanFileName(f?.name), size: Math.max(0, Math.floor(Number(f?.size) || 0)) }));
            if (!files.length) break;
            out.files = files;
          } else if (kind === 'answer') out.accept = !!m.accept;
          else if (kind === 'sig') {
            const sig = m.sig && typeof m.sig === 'object' ? m.sig : null;
            const str = sig ? JSON.stringify(sig) : '';
            if (!str || str.length > 16000) break;
            out.sig = sig;
          } else if (kind === 'cancel') out.reason = String(m.reason || '').slice(0, 20);
          else break;
          send(target.ws, out);
          break;
        }
        case 'spot': {
          // Ping: tıklanan nokta aynı ses kanalındaki herkesin ekranında (ya da izlenen yayının üstünde) dalga dalga parlar
          if (!me.channelId || timedOut(me)) break;
          const clamp = (x) => Math.max(0, Math.min(1, Number(x) || 0));
          let owner = null;
          let share = '';
          if (m.owner) {
            owner = users.get(m.owner);
            share = String(m.share || '').slice(0, 40);
            if (!owner || owner.channelId !== me.channelId || !share || !owner.shares.some((x) => x.id === share)) break;
          }
          const cd = pingCooldown() * 1000;
          const now = Date.now();
          const last = pingAt.get(me.clientKey || me.id) || 0;
          if (cd && now - last < cd) {
            const left = Math.ceil((cd - (now - last)) / 1000);
            errorTo(me, `Tekrar ping atmak için ${left} saniye bekle.`, 'info', { pingLeft: left });
            break;
          }
          pingAt.set(me.clientKey || me.id, now);
          broadcast({ t: 'spot', from: me.id, name: me.name, color: pingColorOf(me), x: clamp(m.x), y: clamp(m.y), owner: owner ? owner.id : '', share }, (u) => u.channelId === me.channelId && !u.bot);
          send(ws, { t: 'spotSent', cooldown: pingCooldown() });
          break;
        }
        case 'flash': {
          // Flash (CS gibi): sadece hedefe gider, karşı tarafın bütün ekranları kısa süre beyaz olur
          const target = users.get(m.to);
          if (!target || target.bot || target === me) break;
          // Sıklık Sunucu Ayarları'ndaki bekleme süresine göre (kişi başı; yeniden bağlanınca sıfırlanmasın diye cihaz anahtarıyla)
          const cd = flashCooldown() * 1000;
          const now = Date.now();
          const last = flashAt.get(me.clientKey || me.id) || 0;
          if (cd && now - last < cd) {
            const left = Math.ceil((cd - (now - last)) / 1000);
            errorTo(me, `Tekrar flash atmak için ${left} saniye bekle.`, 'info', { flashLeft: left });
            break;
          }
          flashAt.set(me.clientKey || me.id, now);
          send(target.ws, { t: 'flash', from: me.id, name: me.name });
          send(ws, { t: 'flashSent', to: target.id, cooldown: flashCooldown() });
          break;
        }
        case 'sfx': {
          // Ses efekti: sadece sesin adı iletilir, her uygulama sesi kendisi üretip çalar.
          // Kişi başı 1,2 saniyede bir (spam koruması); sadece aynı ses kanalındakilere gider.
          const sid = String(m.sid || '');
          const now = Date.now();
          if (me.bot || !me.channelId || isText(me.channelId) || !/^[a-z]{2,16}$/.test(sid)) break;
          if (!can(me, 'useSoundboard')) {
            deny(me, 'useSoundboard');
            break;
          }
          if (timedOut(me)) {
            timeoutErr(me);
            break;
          }
          if (serverMuted(me)) {
            errorTo(me, 'Sunucuda susturulduğun için ses efekti çalamazsın.', 'server_muted');
            break;
          }
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
          const slow = clampSlow(m.slowmode);
          if (slow) ch.slowmode = slow;
          if (m.readOnly) ch.readOnly = true;
          if (m.header && !text) ch.header = true;
          channels.push(ch);
          saveChannels();
          broadcastState();
          audit(me, 'channelCreate', chLabel(ch), text ? 'yazı kanalı' : 'ses kanalı');
          break;
        }
        case 'renameChannel': {
          const ch = channels.find((c) => c.id === m.channelId);
          const name = String(m.name || '').trim().slice(0, 40);
          if (ch && name && name !== ch.name) {
            const old = chLabel(ch);
            ch.name = name;
            saveChannels();
            broadcastState();
            audit(me, 'channelRename', old, chLabel(ch));
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
          audit(me, 'channelDelete', chLabel(ch), ids.size > 1 ? `${ids.size - 1} alt kanalıyla` : '');
          break;
        }
        case 'kick': {
          const target = users.get(m.to);
          if (!target || target.id === me.id) break;
          if (!outranks(me, target)) {
            hierErr(me);
            break;
          }
          const reason = cleanReason(m.reason);
          send(target.ws, { t: 'kicked', by: me.name, reason });
          log(`${me.name}, ${target.name} kullanıcısını attı${reason ? ': ' + reason : ''}`);
          activity({ kind: 'kick', name: target.name, by: me.name, reason });
          audit(me, 'kick', target.name, reason);
          setTimeout(() => target.ws.close(4001, 'kicked'), 100);
          break;
        }
        case 'move': {
          // channelId: null → sesten çıkar
          const target = users.get(m.to);
          const out = m.channelId === null || m.channelId === '';
          const dest = !out && channels.find((c) => c.id === m.channelId && joinable(c));
          if (!target || (!out && !dest)) break;
          if (target.id !== me.id && !outranks(me, target)) {
            hierErr(me);
            break;
          }
          if (out) {
            if (!target.channelId) break;
            const from = channels.find((c) => c.id === target.channelId);
            if (target.id !== me.id) send(target.ws, { t: 'moved', by: me.name, channelId: null });
            moveUser(target, null);
            audit(me, 'disconnect', target.name, chLabel(from));
            break;
          }
          if (target.channelId === dest.id) break;
          if (target.id !== me.id) send(target.ws, { t: 'moved', by: me.name, channelId: dest.id });
          moveUser(target, dest.id);
          if (target.id !== me.id) audit(me, 'move', target.name, chLabel(dest));
          break;
        }
        case 'moveAll': {
          // Bir ses kanalındaki herkesi başka kanala taşı (channelId: null → hepsini sesten çıkar)
          const from = channels.find((c) => c.id === m.from && c.type !== 'text');
          const out = m.channelId === null || m.channelId === '';
          const dest = !out && channels.find((c) => c.id === m.channelId && joinable(c));
          if (!from || (!out && !dest) || from.id === dest?.id) break;
          let moved = 0;
          let skipped = 0;
          for (const u of [...users.values()]) {
            if (u.channelId !== from.id) continue;
            if (u.id !== me.id && !outranks(me, u)) {
              skipped++;
              continue;
            }
            if (u.id !== me.id) send(u.ws, { t: 'moved', by: me.name, channelId: out ? null : dest.id });
            moveUser(u, out ? null : dest.id);
            moved++;
          }
          if (moved) audit(me, out ? 'disconnectAll' : 'moveAll', chLabel(from), `${out ? '' : chLabel(dest) + ' · '}${moved} kişi`);
          send(ws, { t: 'adminNotice', message: `${moved} kişi ${out ? 'sesten çıkarıldı' : `${dest.name} kanalına taşındı`}${skipped ? ` (${skipped} kişiye yetkin yetmedi)` : ''}.` });
          break;
        }
        case 'serverMute':
        case 'serverDeafen': {
          const flag = m.t === 'serverMute' ? 'mute' : 'deaf';
          // Eski istemci: { t:'serverMute', to } → tek seferlik mikrofon kapatma (kişi tekrar açabilir)
          if (flag === 'mute' && !('on' in m)) {
            const target = users.get(m.to);
            if (!target || target.id === me.id) break;
            if (!outranks(me, target)) {
              hierErr(me);
              break;
            }
            send(target.ws, { t: 'forceMute', by: me.name });
            audit(me, 'forceMute', target.name);
            break;
          }
          const t = resolveTarget(m);
          if (!t || t.key === me.clientKey) break;
          if (!outranksT(me, t)) {
            hierErr(me);
            break;
          }
          const on = !!m.on;
          const cur = memberOf(t.key);
          if (!!cur?.[flag] === on) break;
          const mem = cur || (conf.members[t.key] = { name: t.name, roles: [] });
          if (on) mem[flag] = true;
          else delete mem[flag];
          cleanupMember(t.key);
          saveConf();
          const reason = cleanReason(m.reason);
          const change = flag === 'mute' ? (on ? 'mute' : 'unmute') : on ? 'deafen' : 'undeafen';
          for (const u of usersByKey(t.key)) {
            if (on && flag === 'mute') u.muted = true;
            if (on && flag === 'deaf') u.deafened = true;
            notePenaltyIp(u);
            send(u.ws, modStateMsg(u, me.name, change, reason));
            if (on && flag === 'mute') send(u.ws, { t: 'forceMute', by: me.name, server: true }); // eski istemciler de kapatsın
          }
          audit(me, { mute: 'serverMute', unmute: 'serverUnmute', deafen: 'serverDeafen', undeafen: 'serverUndeafen' }[change], t.name, reason);
          broadcastState();
          break;
        }
        case 'timeout': {
          // seconds: 0 → zaman aşımını kaldır; en fazla 1 hafta
          const t = resolveTarget(m);
          if (!t || t.key === me.clientKey) break;
          if (!outranksT(me, t)) {
            hierErr(me);
            break;
          }
          const secs = Math.max(0, Math.min(7 * 86400, Math.floor(Number(m.seconds) || 0)));
          const reason = cleanReason(m.reason);
          if (secs) {
            const entry = { until: Date.now() + secs * 1000, by: me.name, reason };
            startTimeout(t.key, entry);
            for (const u of usersByKey(t.key)) {
              notePenaltyIp(u);
              u.muted = true;
              const ids = u.shares.map((s) => s.id);
              if (ids.length) {
                u.shares = [];
                u.sharing = false;
                send(u.ws, { t: 'stopShares', ids, reason: 'timeout' });
              }
              send(u.ws, modStateMsg(u, me.name, 'timeout', reason));
              send(u.ws, { t: 'forceMute', by: me.name, server: true, until: entry.until }); // eski istemciler de kapatsın
            }
            audit(me, 'timeout', t.name, `${fmtLeft(secs * 1000)}${reason ? ' · ' + reason : ''}`);
          } else {
            if (!timeouts.delete(t.key)) break;
            for (const u of usersByKey(t.key)) send(u.ws, modStateMsg(u, me.name, 'untimeout'));
            audit(me, 'untimeout', t.name);
          }
          broadcastState();
          break;
        }
        case 'setRole': {
          // Eski istemcilerin "Moderatör yap / al" isteği: hazır "Moderatör" rolüne çevrilir
          const add = !m.key && m.role === 'mod';
          const t = m.key ? resolveTarget({ mid: String(m.key) }) : resolveTarget({ to: m.to });
          if (!t) break;
          let mod = roleById('mod');
          if (!mod && !add) break;
          if (!mod) {
            if (!canGrant(me, MOD_PRESET)) {
              errorTo(me, 'Bu sunucuda "Moderatör" rolü yok; Roller bölümünden bir rol oluştur.', 'forbidden');
              break;
            }
            mod = makeModRole();
            mod.position = 0.5;
            conf.roleDefs.push(mod);
            sortRoles();
            saveConf();
            audit(me, 'roleCreate', mod.name);
          }
          const cur = memberOf(t.key)?.roles || [];
          setMemberRoles(me, t, add ? [...cur, mod.id] : cur.filter((id) => id !== mod.id));
          break;
        }
        case 'memberRoles': {
          // Kişinin bütün rol listesini ver: { to | mid, roles: [rolId] }
          const t = resolveTarget(m);
          if (t && Array.isArray(m.roles)) setMemberRoles(me, t, m.roles.slice(0, MAX_ROLES + 1));
          break;
        }
        case 'memberPingColor': {
          // Kişinin ping/çizim rengi: { to | mid, color } ('' = varsayılan beyaz)
          const t = resolveTarget(m);
          if (!t) break;
          if (t.key !== me.clientKey && !outranksT(me, t)) {
            hierErr(me);
            break;
          }
          const c = hex(m.color);
          const cur = memberOf(t.key);
          if ((cur?.pingColor || '') === (c === '#ffffff' ? '' : c)) break;
          const mem = cur || (conf.members[t.key] = { name: t.name, roles: [] });
          if (c && c !== '#ffffff') mem.pingColor = c;
          else delete mem.pingColor;
          if (t.user) mem.name = t.user.name;
          cleanupMember(t.key);
          saveConf();
          audit(me, 'pingColor', t.name, c && c !== '#ffffff' ? c : 'beyaz');
          broadcastState();
          break;
        }
        case 'memberRole': {
          // Tek rol ver / al: { to | mid, roleId, on }
          const t = resolveTarget(m);
          const id = String(m.roleId || '');
          if (!t || !roleById(id)) break;
          const cur = memberOf(t.key)?.roles || [];
          setMemberRoles(me, t, m.on ? [...cur, id] : cur.filter((x) => x !== id));
          break;
        }
        case 'roleCreate': {
          if (conf.roleDefs.length - 1 >= MAX_ROLES) {
            errorTo(me, `En fazla ${MAX_ROLES} rol oluşturulabilir.`);
            break;
          }
          const perms = cleanPerms(m.perms);
          if (!canGrant(me, perms)) {
            errorTo(me, 'Kendinde olmayan bir yetkiyi bir role veremezsin.', 'forbidden');
            break;
          }
          // Yeni rol en alta (@herkes'in hemen üstüne) eklenir
          const role = { id: crypto.randomBytes(6).toString('hex'), name: cleanRoleName(m.name) || 'yeni rol', color: hex(m.color), perms, hoist: !!m.hoist, position: 0.5 };
          conf.roleDefs.push(role);
          sortRoles();
          saveConf();
          audit(me, 'roleCreate', role.name);
          send(ws, { t: 'roleCreated', role: publicRole(role) });
          broadcastState();
          syncPerms(me.name);
          break;
        }
        case 'roleUpdate': {
          const role = roleById(String(m.id || ''));
          if (!role) break;
          if (!canEditRole(me, role)) {
            hierErr(me, `“${role.name}” rolü`);
            break;
          }
          const isEv = role.id === 'everyone';
          let nextPerms = role.perms;
          let added = [];
          let removed = [];
          if (Array.isArray(m.perms)) {
            nextPerms = cleanPerms(m.perms);
            added = nextPerms.filter((p) => !role.perms.includes(p));
            removed = role.perms.filter((p) => !nextPerms.includes(p));
            if (!canGrant(me, [...added, ...removed])) {
              errorTo(me, 'Kendinde olmayan bir yetkiyi veremez ya da alamazsın.', 'forbidden');
              break;
            }
            // @herkes'e "Yönetici" verilirse herkes bir anda her yetkiyi (IP'leri görmek dahil) alır: bunu sadece sahip yapabilir
            if (isEv && !me.admin && (added.includes('administrator') || removed.includes('administrator'))) {
              errorTo(me, '@herkes rolünün Yönetici yetkisini sadece sunucu sahibi değiştirebilir.', 'forbidden', { perm: 'administrator' });
              break;
            }
          }
          const changes = [];
          const name = !isEv && typeof m.name === 'string' ? cleanRoleName(m.name) : '';
          if (name && name !== role.name) {
            changes.push(`ad: ${role.name} → ${name}`);
            role.name = name;
          }
          if (!isEv && 'color' in m && hex(m.color) !== role.color) {
            role.color = hex(m.color);
            changes.push(role.color ? `renk ${role.color}` : 'renk kaldırıldı');
          }
          if (!isEv && 'hoist' in m && !!m.hoist !== role.hoist) {
            role.hoist = !!m.hoist;
            changes.push(role.hoist ? 'ayrı gösterilir' : 'ayrı gösterilmez');
          }
          if (added.length || removed.length) {
            role.perms = nextPerms;
            changes.push(...added.map((p) => '+' + PERM_LABEL[p]), ...removed.map((p) => '−' + PERM_LABEL[p]));
          }
          if (!changes.length) break;
          saveConf();
          audit(me, 'roleUpdate', role.name, changes.join(', '));
          broadcastState();
          syncPerms(me.name);
          break;
        }
        case 'roleDelete': {
          const role = roleById(String(m.id || ''));
          if (!role || role.id === 'everyone') break;
          if (!canEditRole(me, role)) {
            hierErr(me, `“${role.name}” rolü`);
            break;
          }
          conf.roleDefs = conf.roleDefs.filter((r) => r !== role);
          for (const k of Object.keys(conf.members)) {
            conf.members[k].roles = conf.members[k].roles.filter((id) => id !== role.id);
            cleanupMember(k);
          }
          sortRoles();
          saveConf();
          audit(me, 'roleDelete', role.name);
          broadcastState();
          syncPerms(me.name);
          break;
        }
        case 'roleOrder':
        case 'roleMove': {
          // roleOrder: { ids: [üstten alta bütün rol id'leri, @herkes hariç] }   roleMove: { id, dir: 'up' | 'down' }
          const rest = conf.roleDefs.filter((r) => r.id !== 'everyone');
          let ids;
          if (m.t === 'roleOrder') ids = Array.isArray(m.ids) ? m.ids.slice(0, MAX_ROLES + 1).map(String) : [];
          else {
            ids = rest.map((r) => r.id);
            const i = ids.indexOf(String(m.id || ''));
            const j = m.dir === 'up' ? i - 1 : i + 1;
            if (i < 0 || j < 0 || j >= ids.length) break;
            [ids[i], ids[j]] = [ids[j], ids[i]];
          }
          if (ids.length !== rest.length || new Set(ids).size !== ids.length || !ids.every((id) => id !== 'everyone' && roleById(id))) break;
          const pos = new Map(ids.map((id, i) => [id, ids.length - i]));
          if (rest.every((r) => pos.get(r.id) === r.position)) break;
          // Sadece kendi en üst rolünün altındaki roller, yine onun altında kalacak şekilde yer değiştirebilir
          const myRank = rankOf(me);
          const bad = !me.admin && rest.find((r) => pos.get(r.id) !== r.position && (r.position >= myRank || pos.get(r.id) >= myRank));
          if (bad) {
            hierErr(me, `“${bad.name}” rolü`);
            break;
          }
          for (const r of rest) r.position = pos.get(r.id);
          sortRoles();
          saveConf();
          audit(me, 'roleOrder', '', ids.map((id) => roleById(id).name).join(' › '));
          broadcastState();
          syncPerms(me.name);
          break;
        }
        case 'ban': {
          // Çevrimiçi (to) ya da çevrimdışı üye (mid) yasaklanabilir
          const t = resolveTarget(m);
          if (!t || t.key === me.clientKey) break;
          if (!outranksT(me, t)) {
            hierErr(me);
            break;
          }
          const reason = cleanReason(m.reason);
          if (!conf.bans.some((b) => b.key === t.key)) conf.bans.push({ id: crypto.randomUUID(), key: t.key, ip: t.user && !privateIp(t.user.ip) ? t.user.ip : '', name: t.name, reason, by: me.name, at: Date.now() });
          delete conf.members[t.key]; // yasaklanınca rolleri de gider
          timeouts.delete(t.key);
          saveConf();
          for (const u of usersByKey(t.key)) {
            send(u.ws, { t: 'kicked', by: me.name, reason, banned: true });
            setTimeout(() => u.ws.close(4003, 'banned'), 100);
          }
          activity({ kind: 'kick', name: t.name, by: me.name, reason, banned: true });
          log(`${me.name}, ${t.name} kullanıcısını yasakladı${reason ? ': ' + reason : ''}`);
          audit(me, 'ban', t.name, reason);
          if (!t.user) send(ws, { t: 'adminNotice', message: `${t.name} yasaklandı.` });
          break;
        }
        case 'unban': {
          const b = conf.bans.find((x) => x.id === m.id);
          if (!b) break;
          conf.bans = conf.bans.filter((x) => x !== b);
          saveConf();
          audit(me, 'unban', b.name);
          send(ws, { t: 'adminNotice', message: 'Yasak kaldırıldı.' });
          break;
        }
        case 'channelSettings': {
          // Ses kanalı: kişi sınırı, şifre. Her kanal: yavaş mod, salt okunur, konu, ad
          const ch = channels.find((c) => c.id === m.channelId);
          if (!ch) break;
          const voice = ch.type !== 'text';
          const changes = [];
          if (voice && 'limit' in m) {
            const n = Math.max(0, Math.min(99, Math.floor(Number(m.limit) || 0)));
            if ((ch.limit || 0) !== n) changes.push(n ? `kişi sınırı ${n}` : 'kişi sınırı kaldırıldı');
            if (n) ch.limit = n;
            else delete ch.limit;
          }
          if (voice && typeof m.password === 'string') {
            if (m.password) {
              ch.salt = crypto.randomBytes(8).toString('hex');
              ch.pwHash = hashPw(ch.salt, m.password.slice(0, 100));
              for (const u of users.values()) u.unlocked?.delete(ch.id);
              changes.push('şifre ayarlandı');
            } else {
              if (ch.pwHash) changes.push('şifre kaldırıldı');
              delete ch.salt;
              delete ch.pwHash;
            }
          }
          if ('slowmode' in m) {
            const s = clampSlow(m.slowmode);
            if ((ch.slowmode || 0) !== s) changes.push(s ? `yavaş mod ${s} sn` : 'yavaş mod kapatıldı');
            if (s) ch.slowmode = s;
            else delete ch.slowmode;
          }
          if (voice && 'header' in m) {
            if (!!m.header !== !!ch.header) changes.push(m.header ? 'başlık kanalı (girilemez)' : 'normal ses kanalı');
            if (m.header) {
              ch.header = true;
              if (ch.id === conf.afkChannelId) (conf.afkChannelId = null), saveConf();
            } else delete ch.header;
          }
          if ('readOnly' in m) {
            if (!!m.readOnly !== !!ch.readOnly) changes.push(m.readOnly ? 'salt okunur' : 'herkes yazabilir');
            if (m.readOnly) ch.readOnly = true;
            else delete ch.readOnly;
          }
          if (typeof m.topic === 'string') {
            const tp = m.topic.trim().slice(0, 200);
            if (tp !== (ch.topic || '')) changes.push('konu değişti');
            ch.topic = tp;
          }
          if (typeof m.name === 'string') {
            const n = m.name.trim().slice(0, 40);
            if (n && n !== ch.name) {
              changes.push(`ad: ${ch.name} → ${n}`);
              ch.name = n;
            }
          }
          // Başlık yapılan kanaldakiler Lobi'ye taşınır
          if (ch.header) for (const u of [...users.values()]) if (u.channelId === ch.id) {
            send(u.ws, { t: 'moved', by: me.name, channelId: lobbyId() });
            moveUser(u, lobbyId());
          }
          saveChannels();
          broadcastState();
          send(ws, { t: 'adminNotice', message: `${ch.name} kanalının ayarları kaydedildi.` });
          if (changes.length) audit(me, 'channelUpdate', chLabel(ch), changes.join(', '));
          break;
        }
        case 'setConfig': {
          const changes = [];
          const set = (key, val, label) => {
            if (conf[key] === val) return;
            conf[key] = val;
            changes.push(label);
          };
          if ('afkMinutes' in m) set('afkMinutes', Math.max(0, Math.min(240, Math.floor(Number(m.afkMinutes) || 0))), 'AFK süresi');
          if ('afkChannelId' in m) set('afkChannelId', channels.find((c) => c.id === m.afkChannelId && joinable(c)) ? m.afkChannelId : null, 'AFK kanalı');
          if (typeof m.gifKey === 'string') set('gifKey', m.gifKey.trim().slice(0, 200), 'GIF anahtarı');
          if (['klipy', 'giphy'].includes(m.gifProvider)) set('gifProvider', m.gifProvider, 'GIF sağlayıcısı');
          if (typeof m.description === 'string') set('description', m.description.trim().slice(0, 300), 'açıklama');
          if (typeof m.welcomeMessage === 'string') set('welcomeMessage', m.welcomeMessage.trim().slice(0, 500), 'hoş geldin mesajı');
          if ('linkPreviews' in m) set('linkPreviews', !!m.linkPreviews, m.linkPreviews ? 'bağlantı önizlemeleri açık' : 'bağlantı önizlemeleri kapalı');
          if (typeof m.announcement === 'string') setAnnouncement(me, m.announcement);
          // TURN bilgileri bağlanan herkese gider (WebRTC için gerekli); bu yüzden gizli sayılmaz
          if ('webClient' in m) set('webClient', !!m.webClient, m.webClient ? 'tarayıcıdan katılma açık' : 'tarayıcıdan katılma kapalı');
          if (typeof m.turnUrl === 'string') set('turnUrl', m.turnUrl.trim().slice(0, 400), 'TURN adresi');
          if (typeof m.turnUser === 'string') set('turnUser', m.turnUser.trim().slice(0, 200), 'TURN kullanıcı adı');
          if (typeof m.turnPass === 'string') set('turnPass', m.turnPass.slice(0, 200), 'TURN şifresi');
          if ('pingCooldown' in m) set('pingCooldown', Math.max(0, Math.min(600, Math.floor(Number(m.pingCooldown) || 0))), 'ping bekleme süresi');
          if ('flashCooldown' in m) set('flashCooldown', Math.max(0, Math.min(3600, Math.floor(Number(m.flashCooldown) || 0))), 'flash bekleme süresi');
          if (typeof m.icon === 'string') {
            // Sunucu resmi: küçültülmüş PNG/JPEG/WebP/GIF (en fazla ~256 KB), boş metin kaldırır
            const ok = m.icon === '' || (m.icon.length <= 350000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(m.icon));
            if (!ok) {
              send(ws, { t: 'error', code: 'info', message: 'Sunucu resmi kaydedilemedi: PNG, JPEG, WebP ya da GIF olmalı ve çok büyük olmamalı.' });
              break;
            }
            if (m.icon !== (conf.icon || '')) {
              conf.icon = m.icon;
              conf.iconV = m.icon ? Date.now() : 0;
              changes.push(m.icon ? 'sunucu resmi değişti' : 'sunucu resmi kaldırıldı');
            }
          }
          saveConf();
          broadcastState();
          send(ws, { t: 'adminNotice', message: 'Sunucu ayarları kaydedildi.' });
          if (changes.length) audit(me, 'configUpdate', '', changes.join(', '));
          break;
        }
        case 'announce':
          // Duyuru şeridi: herkesin ekranının üstünde, kaldırılana kadar (text: '' → kaldır)
          if (setAnnouncement(me, m.text)) broadcastState();
          break;
        case 'setServer': {
          const changes = [];
          if (typeof m.name === 'string' && m.name.trim() && m.name.trim().slice(0, 40) !== serverName) {
            serverName = m.name.trim().slice(0, 40);
            changes.push(`ad: ${serverName}`);
          }
          if (typeof m.password === 'string' && m.password.slice(0, 100) !== password) {
            password = m.password.slice(0, 100);
            changes.push(password ? 'şifre değişti' : 'şifre kaldırıldı');
          }
          log(`Sunucu ayarları güncellendi (${me.name})`);
          broadcastState();
          send(ws, { t: 'adminNotice', message: 'Sunucu ayarları kaydedildi.' });
          if (changes.length) audit(me, 'serverUpdate', '', changes.join(', '));
          break;
        }
        case 'purge': {
          // Kanalı temizle: son N mesaj (count) ya da hepsi (count yok/0)
          const cid = m.channelId ? String(m.channelId) : me.channelId;
          const ch = channels.find((c) => c.id === cid);
          if (!ch) break;
          const arr = chatHistory.get(cid) || [];
          const n = Math.max(0, Math.min(1000, Math.floor(Number(m.count) || 0)));
          const removed = n ? arr.splice(Math.max(0, arr.length - n)) : arr.splice(0);
          if (!removed.length) {
            errorTo(me, 'Silinecek mesaj yok.');
            break;
          }
          // Eski istemciler de doğru görsün diye kalan geçmiş baştan gönderilir
          broadcast({ t: 'history', channelId: cid, messages: arr.map(pubMsg) }, audience(cid));
          broadcast({ t: 'chatPurged', channelId: cid, count: removed.length, by: me.name }, audience(cid));
          audit(me, 'purge', chLabel(ch), `${removed.length} mesaj`);
          send(ws, { t: 'adminNotice', message: `${chLabel(ch)}: ${removed.length} mesaj silindi.` });
          break;
        }
        case 'audit': {
          const n = Math.max(1, Math.min(500, Math.floor(Number(m.limit) || 200)));
          send(ws, { t: 'auditLog', entries: auditLog.slice(-n).reverse() });
          break;
        }
        case 'adminInfo': {
          const seeIp = me.admin || can(me, 'administrator');
          const memberRow = (key) => {
            const mem = memberOf(key);
            const on = usersByKey(key)[0];
            const to = timeouts.get(key);
            return {
              mid: midOf(key),
              name: on?.name || mem?.name || '',
              roles: rolesOfKey(key).map((r) => r.id),
              online: !!on,
              userId: on?.id || null,
              owner: !!on?.admin,
              serverMuted: !!mem?.mute,
              serverDeafened: !!mem?.deaf,
              pingColor: mem?.pingColor || '#ffffff',
              timeoutUntil: to && to.until > Date.now() ? to.until : 0,
            };
          };
          const keys = new Set([...Object.keys(conf.members), ...[...users.values()].filter((u) => !u.bot).map((u) => u.clientKey), ...[...timeouts.keys()].filter((k) => timeouts.get(k).until > Date.now())]);
          const modRole = roleById('mod');
          send(ws, {
            t: 'adminInfo',
            serverName,
            hasPassword: !!password,
            startedAt,
            now: Date.now(),
            perms: [...permsOf(me)],
            rank: rankOf(me),
            users: [...users.values()].map((u) => ({ ...publicUser(u), ip: seeIp ? u.ip : '', connectedAt: u.connectedAt, mid: u.bot ? null : midOf(u.clientKey) })),
            bans: can(me, 'ban') ? conf.bans.map((b) => ({ id: b.id, name: b.name, reason: b.reason, by: b.by, at: b.at, ip: !!b.ip })) : [],
            // Eski arayüz için: "Moderatör" rolündekiler (key = üye kimliği, setRole { key } ile kaldırılır)
            mods: modRole
              ? Object.keys(conf.members)
                  .filter((k) => conf.members[k].roles.includes(modRole.id))
                  .map((k) => memberRow(k))
                  .map((r) => ({ key: r.mid, name: r.name, online: r.online }))
              : [],
            members: [...keys].map(memberRow),
            roles: conf.roleDefs.map(publicRole),
            afkMinutes: conf.afkMinutes,
            afkChannelId: afkId(),
            gifProvider: conf.gifProvider,
            hasGifKey: !!conf.gifKey,
            description: conf.description || '',
            welcomeMessage: conf.welcomeMessage || '',
            linkPreviews: conf.linkPreviews !== false,
            turnUrl: conf.turnUrl || '',
            turnUser: conf.turnUser || '',
            turnSet: !!conf.turnPass,
            webClient: conf.webClient === true,
            flashCooldown: flashCooldown(),
            pingCooldown: pingCooldown(),
            announcement: conf.announcement || null,
            audit: can(me, 'viewAudit') ? auditLog.slice(-100).reverse() : [],
          });
          break;
        }
        case 'ping':
          send(ws, { t: 'pong', ts: typeof m.ts === 'number' ? m.ts : 0 });
          break;
      }
    };
    // Tek bir bozuk mesaj bütün sunucuyu düşürmesin
    let errLogAt = 0;
    ws.on('message', (raw) => {
      try {
        handleMessage(raw);
      } catch (e) {
        if (e instanceof SyntaxError && /JSON/.test(e.message)) return;
        if (Date.now() - errLogAt > 5000) {
          errLogAt = Date.now();
          log('Mesaj işlenemedi:', e && e.message);
        }
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
