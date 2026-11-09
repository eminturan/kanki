'use strict';
/* Kanki — Discord benzeri roller ve yetkiler (istemci tarafı) ve tam ekran "Sunucu Ayarları".
 * extras.js'den sonra yüklenir; app.js ve extras.js'in yardımcılarını (S, h, $, send, toast, feat, formModal…) kullanır.
 * app.js ve extras.js de buradaki can(), outranks(), chatBlock(), modMenuItems()… işlevlerini çalışma anında çağırır.
 *  - Yetkiler: sunucunun gönderdiği etkin yetkiler, roller, hiyerarşi (sunucu her işlemi ayrıca kontrol eder)
 *  - Sunucu susturması / sağırlaştırma / zaman aşımı kilitleri, yavaş mod, salt okunur kanallar
 *  - Duyuru şeridi, hoş geldin mesajı, rol renkleri, sağ tık moderasyon menüleri
 *  - Sunucu Ayarları: Genel Bakış, Roller, Üyeler, Kanallar, Yasaklılar, Denetim Kaydı, Bağlantı */

// =====================================================================
//  Yetkiler
// =====================================================================
const OWNER_RANK = 1000000; // sunucu sahibi (yönetici anahtarıyla bağlanan) her rolün üstündedir
// Sunucu eskiyse (rol sistemi yoksa) herkesin yapabildikleri ve eski moderatörün yetkileri
const EVERYONE_DEFAULT = ['sendMessages', 'attachFiles', 'useGifs', 'useSoundboard', 'createPolls', 'startWatch', 'stream', 'camera', 'startVotes', 'mentionEveryone'];
const LEGACY_MOD_PERMS = ['kick', 'moveMembers', 'muteMembers', 'manageMessages'];
// Bunlardan biri olan Sunucu Ayarları'nı açabilir
const STAFF_PERMS = ['administrator', 'manageServer', 'manageRoles', 'manageChannels', 'viewAudit', 'kick', 'ban', 'timeout', 'muteMembers', 'deafenMembers', 'moveMembers', 'manageMessages'];
const MEMBER_PERMS = ['kick', 'ban', 'timeout', 'muteMembers', 'deafenMembers', 'moveMembers', 'manageRoles'];
const PERM_GROUPS = [
  ['genel', 'Genel'],
  ['uye', 'Üyeler'],
  ['sohbet', 'Sohbet'],
  ['ses', 'Ses ve görüntü'],
];

Object.assign(S, {
  perms: new Set(), // etkin yetkilerim
  rank: 0, // en üst rolümün sırası
  myRoles: [],
  roles: [], // sunucudaki roller (üstten alta, @herkes en sonda)
  permDefs: [], // yetkilerin adı, açıklaması ve grubu (sunucudan)
  mid: null,
  modState: { serverMuted: false, serverDeafened: false, timeoutUntil: 0 },
  announcement: null,
  serverDesc: '',
  slowUntil: new Map(), // yavaş mod: kanal -> bir sonraki mesajın gönderilebileceği an
});

function can(p) {
  if (S.isAdmin) return true;
  if (!feat('perms')) return EVERYONE_DEFAULT.includes(p) || (S.isMod && LEGACY_MOD_PERMS.includes(p));
  return S.perms.has('administrator') || S.perms.has(p);
}
const isStaff = () => S.isAdmin || (feat('perms') && STAFF_PERMS.some(can));
const myRank = () => (S.isAdmin ? OWNER_RANK : S.rank || 0);
const roleById = (id) => S.roles.find((r) => r.id === id) || null;
const userRoles = (u) => (u?.roles || []).map(roleById).filter(Boolean);
function rankOfUser(u) {
  if (!u) return 0;
  if (u.admin || u.owner) return OWNER_RANK;
  return userRoles(u).reduce((mx, r) => Math.max(mx, r.position || 0), 0);
}
// Bu kişiye işlem yapabilir miyim (at, yasakla, sustur, taşı, rol ver…)? Sunucu sahibine kimse dokunamaz.
function outranks(u) {
  if (!u || u.admin || u.owner || u.id === S.myId || u.userId === S.myId) return false;
  if (!feat('perms')) return S.isAdmin || (S.isMod && !u.mod);
  return S.isAdmin || myRank() > rankOfUser(u);
}
// Rolü düzenleyebilir / verebilir miyim? (kendi en üst rolümün altındakiler)
const canEditRole = (r) => !!r && (S.isAdmin || (can('manageRoles') && (r.position || 0) < myRank()));
// Kendimde olmayan yetkiyi bir role veremem (sahip ve "Yönetici" hariç)
const canGrantPerm = (p) => S.isAdmin || S.perms.has('administrator') || S.perms.has(p);
const roleColorOf = (u) => u?.color || '';
// Yazı olarak kullanılan rol rengi: açık temada koyulaşır (sarı/açık renkler beyaz zeminde okunsun).
// Tema türü değişince refreshAvatars() isimleri yeniden çizer (appearance.js). Noktalar/örnekler gerçek rengi kullanır.
const roleInk = (c) => (c && document.documentElement.dataset.scheme === 'light' ? `color-mix(in oklab, ${c} 66%, #000)` : c || '');
function roleColorByName(name) {
  if (!name) return '';
  if (name === S.myName) return roleInk(S.users.get(S.myId)?.color);
  for (const u of S.users.values()) if (u.name === name) return roleInk(u.color);
  return '';
}
// İsim: kendi yazı stili yoksa en üst renkli rolün rengi
function roleTint(el, u) {
  if (el && u?.color && !hasNameStyle(styleOfUser(u))) el.style.color = roleInk(u.color);
  return el;
}
const isTimedOutUser = (u) => (u?.timeoutUntil || 0) > Date.now();
const myTimeout = () => Math.max(0, (S.modState.timeoutUntil || 0) - Date.now());
// Sunucunun susturduğu ya da zaman aşımındaki kişinin sesi bende de çalmasın (eski istemciler kilide uymasa bile)
const silencedByServer = (id) => {
  const u = S.users.get(id);
  return !!u && (u.serverMuted || u.voteMuted || isTimedOutUser(u));
};

function fmtLeft(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} sn`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} dk`;
  const hr = Math.floor(m / 60);
  if (hr < 24) return `${hr} sa${m % 60 ? ` ${m % 60} dk` : ''}`;
  const d = Math.floor(hr / 24);
  return `${d} gün${hr % 24 ? ` ${hr % 24} sa` : ''}`;
}
function micLockReason() {
  if (S.afk?.channelId && S.channelId === S.afk.channelId && feat('afkMic')) return 'AFK kanalında mikrofon açılamaz. Başka bir kanala geçince açabilirsin.';
  if (S.modState.serverMuted) return 'Bir yetkili seni sunucuda susturdu. Kaldırılana kadar mikrofonunu açamazsın.';
  if (myTimeout()) return `Zaman aşımındasın; ${fmtLeft(myTimeout())} sonra tekrar konuşabilirsin.`;
  return '';
}
const deafLockReason = () => (S.modState.serverDeafened ? 'Bir yetkili seni sunucuda sağırlaştırdı. Kaldırılana kadar sesi açamazsın.' : '');

// Mesaj kutusu neden kapalı? (null = yazabilirsin). soft: yazabilirsin ama henüz gönderemezsin (yavaş mod)
function chatBlock(cid = chatChannel()) {
  if (!S.myId) return null;
  if (myTimeout()) return { kind: 'timeout', short: 'Zaman aşımındasın', text: `Zaman aşımındasın · ${fmtLeft(myTimeout())} sonra yazabilirsin` };
  if (!can('sendMessages')) return { kind: 'perm', short: 'Yazma yetkin yok', text: 'Bu sunucuda mesaj gönderme yetkin yok' };
  const ch = S.channels.find((c) => c.id === cid);
  if (ch?.readOnly && !can('manageMessages')) return { kind: 'readonly', short: 'Salt okunur kanal', text: `#${ch.name} salt okunur; sadece yetkililer yazabilir` };
  const left = slowLeft(cid);
  if (left) return { kind: 'slow', soft: true, text: `Yavaş mod: ${fmtLeft(left)} sonra yazabilirsin` };
  return null;
}
const slowBypass = () => can('manageMessages') || can('manageChannels');
const slowLeft = (cid) => (slowBypass() ? 0 : Math.max(0, (S.slowUntil.get(cid) || 0) - Date.now()));
// Mesaj gönderildi: kanal yavaş moddaysa geri sayım başlar (sunucu da kontrol eder)
function noteChatSent(cid) {
  const ch = S.channels.find((c) => c.id === cid);
  if (ch?.slowmode && !slowBypass()) S.slowUntil.set(cid, Date.now() + ch.slowmode * 1000);
  renderComposerLock();
}

// =====================================================================
//  Sunucudan gelen rol / moderasyon mesajları
// =====================================================================
function onPermsWelcome(m) {
  const fresh = S.users.size === 0; // yeniden bağlanma değil, yeni giriş
  S.perms = new Set(m.perms || []);
  S.rank = m.rank || 0;
  S.myRoles = m.roles || [];
  if (m.permDefs) S.permDefs = m.permDefs;
  S.mid = m.mid || null;
  S.modState = { serverMuted: !!m.serverMuted, serverDeafened: !!m.serverDeafened, timeoutUntil: m.timeoutUntil || 0 };
  S.announcement = m.announcement || null;
  S.serverDesc = m.description || '';
  S.slowUntil.clear();
  renderAnnouncement();
  if (S.modState.serverDeafened && !S.deafened) toggleDeafen();
  if (fresh && m.welcomeMessage) setTimeout(() => toast(`👋 ${m.serverName} sunucusuna hoş geldin!`, m.welcomeMessage, 'welcome', 14000), 900);
  // Yeniden girişte süren kısıtlamaları hatırlat
  const left = [S.modState.serverMuted && 'Sunucuda susturulmuşsun.', S.modState.serverDeafened && 'Sunucuda sağırlaştırılmışsın.', myTimeout() && `Zaman aşımın sürüyor: ${fmtLeft(myTimeout())} kaldı.`].filter(Boolean);
  if (fresh && left.length) setTimeout(() => toast('Kısıtlamaların sürüyor', left.join(' '), 'err', 8000), 1200);
}
function onPermsState(m) {
  if (m.roles) S.roles = m.roles;
  S.serverDesc = m.description || '';
  if ('announcement' in m && JSON.stringify(m.announcement || null) !== JSON.stringify(S.announcement || null)) {
    S.announcement = m.announcement || null;
    renderAnnouncement();
  }
  queueMicrotask(() => {
    renderComposerLock();
    if (!$('#admin-panel').classList.contains('hidden')) ssRenderLive();
  });
}

// Sunucudan gelen hata: yetki hataları daha anlaşılır gösterilir. İşlendiyse true
function onPermError(m) {
  const T = {
    forbidden: 'Yetkin yok',
    hierarchy: 'Yetkin yetmiyor',
    timed_out: 'Zaman aşımındasın',
    read_only: 'Salt okunur kanal',
    server_muted: 'Sunucuda susturuldun',
  };
  if (m.code === 'slowmode') {
    const cid = m.channelId || chatChannel();
    S.slowUntil.set(cid, Date.now() + (m.wait || 1) * 1000);
    renderComposerLock();
    toast('Yavaş mod', m.message || `Biraz bekle: ${m.wait} sn`, 'err', 3500);
    return true;
  }
  if (!T[m.code]) return false;
  if (m.code === 'timed_out' && m.until) S.modState.timeoutUntil = m.until;
  toast(T[m.code], m.message || '', 'err');
  renderComposerLock();
  return true;
}

function onAdminMessage(m) {
  switch (m.t) {
    case 'perms': {
      const before = new Set(S.myRoles);
      S.perms = new Set(m.perms || []);
      S.rank = m.rank || 0;
      S.myRoles = m.roles || [];
      S.isAdmin = !!m.admin;
      S.isMod = !!m.mod;
      const added = S.myRoles.filter((id) => !before.has(id)).map(roleById).filter(Boolean);
      const removed = [...before].filter((id) => !S.myRoles.includes(id)).map(roleById).filter(Boolean);
      if (added.length) toast(`Yeni rol: ${added.map((r) => r.name).join(', ')}`, 'Yetkilerin güncellendi.', 'role', 6000);
      else if (removed.length) toast(`Rolün alındı: ${removed.map((r) => r.name).join(', ')}`, '', '', 5000);
      afterPermsChange();
      break;
    }
    case 'modState':
      onModState(m);
      break;
    case 'stopShares': {
      for (const id of m.ids || []) removeShare(id);
      const why = { stream: 'Ekran paylaşma yetkin yok.', camera: 'Kamera açma yetkin yok.', timeout: 'Zaman aşımındayken yayın açamazsın.' }[m.reason] || '';
      toast('Yayının durduruldu', why, 'err', 6000);
      break;
    }
    case 'chatPurged':
      logEvent('🧹', `${m.by}, ${chName(m.channelId) || 'kanal'} sohbetinden ${m.count} mesaj sildi`);
      if (m.channelId === chatChannel()) toast('Sohbet temizlendi', `${m.by} ${m.count} mesajı sildi.`);
      break;
    case 'announce':
      S.announcement = m.announcement || null;
      renderAnnouncement();
      if (S.announcement && S.announcement.by !== S.myName) beep('mention');
      if (!$('#admin-panel').classList.contains('hidden')) ssFillAnnouncement();
      break;
    case 'roleCreated':
      // Durum mesajı birazdan gelir; o zamana kadar seçili kalsın diye listeye şimdiden ekle (@herkes'in üstüne)
      if (!roleById(m.role.id)) S.roles.splice(Math.max(0, S.roles.length - 1), 0, m.role);
      SS.roleSel = m.role.id;
      SS.roleTab = 'display';
      SS.focusRoleName = true;
      if (SS.tab === 'roles') renderRolesPane(true);
      break;
    case 'auditEntry':
      SS.audit.unshift(m.entry);
      if (SS.audit.length > 500) SS.audit.length = 500;
      if (SS.tab === 'audit' && !$('#admin-panel').classList.contains('hidden')) renderAuditList();
      break;
    case 'auditLog':
      SS.audit = m.entries || [];
      if (SS.tab === 'audit') renderAuditPane();
      break;
  }
}

function afterPermsChange() {
  applyAdminUi();
  if (typeof syncNsMsgPerm === "function") syncNsMsgPerm();
  renderAll();
  renderTextChannels();
  renderComposerLock();
  const panel = $('#admin-panel');
  if (!panel.classList.contains('hidden')) {
    if (!isStaff()) {
      hideModal('admin-panel');
      toast('Sunucu ayarları kapandı', 'Artık bu sayfaya erişimin yok.');
    } else ssRenderNav(), ssShowTab(SS.tab);
  }
}

let modTick = null;
function onModState(m) {
  const prev = S.modState;
  S.modState = { serverMuted: !!m.serverMuted, serverDeafened: !!m.serverDeafened, timeoutUntil: m.timeoutUntil || 0 };
  const by = m.by || 'Bir yetkili';
  const why = m.reason ? ` Sebep: ${m.reason}` : '';
  if (S.modState.serverDeafened && !S.deafened) toggleDeafen();
  if ((S.modState.serverMuted || myTimeout()) && !S.muted) toggleMute(true);
  const T = {
    mute: ['🔇 Sunucuda susturuldun', `${by} mikrofonunu kapattı; kaldırılana kadar açamazsın.${why}`, 'err'],
    unmute: ['🎙️ Susturman kaldırıldı', `${by} sunucu susturmanı kaldırdı. Mikrofonunu açabilirsin.`, ''],
    deafen: ['🔕 Sunucuda sağırlaştırıldın', `${by} sesini kapattı; kaldırılana kadar kimseyi duyamazsın.${why}`, 'err'],
    undeafen: ['🔔 Sağırlaştırma kaldırıldı', `${by} sağırlaştırmanı kaldırdı. Sesini açabilirsin.`, ''],
    timeout: ['⏳ Zaman aşımı', `${by} sana ${fmtLeft(myTimeout())} zaman aşımı verdi: bu sürede konuşamaz, yazamaz, tepki veremezsin.${why}`, 'err'],
    untimeout: ['✅ Zaman aşımın kaldırıldı', `${by} zaman aşımını kaldırdı. Artık konuşabilir ve yazabilirsin.`, ''],
  }[m.change];
  if (T) toast(T[0], T[1], T[2], 8000);
  if (m.change) logEvent('🛡️', T ? T[0].replace(/^\S+\s/, '') + (m.by ? ` (${m.by})` : '') : m.change);
  void prev;
  renderControls();
  renderSelfShare(); // kamera / ekran düğmeleri (zaman aşımı bitince tekrar açılır)
  renderComposerLock();
  startModTick();
}
// Zaman aşımı / yavaş mod geri sayımı: süre dolunca kilit kendiliğinden kalkar
function startModTick() {
  clearInterval(modTick);
  modTick = setInterval(() => {
    const slow = [...S.slowUntil.values()].some((t) => t > Date.now());
    if (S.modState.timeoutUntil && !myTimeout()) {
      S.modState.timeoutUntil = 0;
      toast('✅ Zaman aşımın bitti', 'Artık konuşabilir ve yazabilirsin.');
      renderControls();
      renderSelfShare();
    }
    renderComposerLock();
    if (!myTimeout() && !slow) {
      clearInterval(modTick);
      modTick = null;
    }
  }, 1000);
}

// Sohbet kutusu küçülünce (duyuru şeridi, kilit şeridi açılınca) en alttaysan en altta kal; son mesaj şeridin altında kalmasın
{
  const log = $('#chat-log');
  let pinned = true;
  log?.addEventListener('scroll', () => (pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 60), { passive: true });
  if (log && window.ResizeObserver) new ResizeObserver(() => pinned && (log.scrollTop = log.scrollHeight)).observe(log);
}

// =====================================================================
//  Mesaj kutusu kilidi (zaman aşımı, salt okunur, yetki yok, yavaş mod)
// =====================================================================
function renderComposerLock() {
  const form = $('#chat-form');
  const inp = $('#chat-input');
  if (!form || !inp) return;
  let bar = $('#composer-lock');
  if (!bar) {
    bar = h('div', { class: 'composer-lock hidden', id: 'composer-lock' });
    form.querySelector('.chat-input-wrap')?.before(bar);
  }
  const b = chatBlock();
  const hard = !!b && !b.soft;
  const wasLocked = form.classList.contains('locked');
  form.classList.toggle('locked', hard);
  inp.disabled = hard;
  if (hard) inp.placeholder = b.short || b.text; // uzun açıklama üstteki şeritte
  else if (wasLocked) return renderComposerExtras(); // kilit kalktı: normal yer tutucu yazısı geri gelsin (bunu yeniden çağırır)
  const ch = S.channels.find((c) => c.id === chatChannel());
  let info = null;
  if (b) info = b;
  else if (ch?.slowmode) info = { kind: 'slowinfo', text: slowBypass() ? `Yavaş mod açık (${fmtLeft(ch.slowmode * 1000)}) — yetkin olduğu için seni etkilemez` : `Yavaş mod açık: her ${fmtLeft(ch.slowmode * 1000)} bir mesaj` };
  else if (ch?.readOnly) info = { kind: 'roinfo', text: 'Salt okunur kanal — yetkin olduğu için yazabilirsin' };
  bar.className = `composer-lock ${info ? 'k-' + info.kind : 'hidden'}`;
  bar.textContent = info ? info.text : '';
  if (info) bar.prepend(svgEl(info.kind === 'timeout' ? ICON_CLOCK : info.kind.startsWith('slow') ? ICON_SLOW : ICON_LOCK));
  if (b?.kind === 'slow' || myTimeout()) if (!modTick) startModTick();
  // Ek düğmeler: yetkiye göre gizlenir, kilitliyken soluk
  const attachOk = can('attachFiles') || can('createPolls');
  $('#btn-attach')?.classList.toggle('perm-hidden', !attachOk);
  $('#btn-gif')?.classList.toggle('perm-hidden', !can('useGifs') || !feat('gif'));
  for (const id of ['#btn-attach', '#btn-gif', '#btn-emoji']) if ($(id)) $(id).disabled = hard;
}
const ICON_LOCK = '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3Z"/></svg>';
const ICON_CLOCK = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 3v4.6l3.4 3.4-1.4 1.4-4-4V7h2Z"/></svg>';
const ICON_SLOW = '<svg viewBox="0 0 24 24"><path d="M12 4a9 9 0 0 1 9 9v1h-2v-1a7 7 0 1 0-14 0v1H3v-1a9 9 0 0 1 9-9Zm4.2 3.4 1.4 1.4-4.2 4.2a2 2 0 1 1-1.4-1.4l4.2-4.2ZM5 17h14v2H5v-2Z"/></svg>';

// Arama çubuğu ve ses paneli düğmeleri: yetkisi olmayan özellik gizlenir; kilitliyken mikrofon/hoparlör kilit gösterir
function gateCallBar() {
  const tog = (sel, off) => $(sel)?.classList.toggle('perm-hidden', !!off);
  tog('#cb-sfx', !can('useSoundboard'));
  tog('#cb-watch', !can('startWatch'));
  tog('#cb-camera', !can('camera'));
  tog('#btn-camera', !can('camera'));
  tog('#cb-share', !can('stream'));
  tog('#btn-share', !can('stream'));
  const micLock = micLockReason();
  const deafLock = deafLockReason();
  if ($('#cb-sfx')) $('#cb-sfx').disabled = !!micLock;
  // Zaman aşımında yayın, kamera ve birlikte izle açılamaz (sunucu da kapatır)
  const timed = !!myTimeout();
  for (const id of ['#cb-camera', '#cb-watch']) if ($(id)) $(id).disabled = timed;
  if (timed) for (const id of ['#btn-camera', '#btn-share', '#cb-share']) if ($(id)) $(id).disabled = true; // süre bitince renderSelfShare eski haline getirir
  for (const id of ['#btn-mic', '#cb-mic']) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('locked', !!micLock);
    if (micLock) b.title = micLock;
  }
  for (const id of ['#btn-deafen', '#cb-deafen']) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('locked', !!deafLock);
    if (deafLock) b.title = deafLock;
  }
}

// =====================================================================
//  Duyuru şeridi (uygulamanın en üstünde, kapatılabilir)
// =====================================================================
const annKey = (a) => (a ? `${a.at}|${a.text}` : '');
function renderAnnouncement() {
  let bar = $('#ann-banner');
  if (!bar) {
    bar = h('div', { class: 'ann-banner hidden', id: 'ann-banner' });
    $('#app .layout')?.before(bar);
  }
  const a = S.announcement;
  let dismissed = '';
  try {
    dismissed = localStorage.getItem('kanki-ann-dismissed') || '';
  } catch {}
  if (!a?.text || dismissed === annKey(a)) {
    bar.classList.add('hidden');
    return;
  }
  const text = h('span', { class: 'ann-text' });
  text.innerHTML = linkify(a.text);
  const x = h('button', {
    class: 'ann-x',
    title: 'Bu duyuruyu gizle',
    onclick: () => {
      try {
        localStorage.setItem('kanki-ann-dismissed', annKey(a));
      } catch {}
      bar.classList.add('hidden');
    },
  });
  x.innerHTML = ICON_X;
  const ico = h('span', { class: 'ann-ico' });
  ico.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 3v18l-6-4H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3h5l6-4Zm2 6a3 3 0 0 1 0 6V9ZM7 17h3l1 4H8l-1-4Z"/></svg>';
  bar.replaceChildren(ico, h('span', { class: 'ann-label' }, 'Duyuru'), text, h('span', { class: 'ann-by' }, `${a.by} · ${hhmm(a.at)}`), x);
  bar.classList.remove('hidden');
}

// =====================================================================
//  Kişi satırları: rozetler, rol renkleri, üye listesi grupları, profil kartı
// =====================================================================
// Sunucu susturması, sağırlaştırma, zaman aşımı rozetleri (kanal ağacında)
function modBadges(u, badges) {
  if (u.serverMuted) badges.append(svgFlag(ICON.micOff, 'mod-flag', 'Sunucuda susturuldu'));
  if (u.serverDeafened) badges.append(svgFlag(ICON.headOff, 'mod-flag', 'Sunucuda sağırlaştırıldı'));
  if (isTimedOutUser(u)) badges.append(svgFlag(ICON_CLOCK, 'mod-flag amber', `Zaman aşımında · ${fmtLeft(u.timeoutUntil - Date.now())} kaldı`));
}
function svgFlag(svg, cls, title) {
  const s = h('span', { class: cls, title });
  s.innerHTML = svg;
  return s;
}
// Yetkili rozeti: en üst rolün renginde kalkan (eski 🛡️ yerine)
function staffBadge(u) {
  if (u.admin) return h('span', { class: 'crown', title: 'Sunucu sahibi' }, ICON_CROWN());
  if (!u.mod) return null;
  const top = userRoles(u).find((r) => r.color) || userRoles(u)[0];
  const b = svgFlag('<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z"/></svg>', 'mod-badge role-shield', top ? top.name : 'Moderatör');
  if (top?.color) b.style.color = roleInk(top.color);
  return b;
}
// Üye listesi grupları: önce "ayrı göster" (hoist) rolleri, sonra kanallara göre (Discord gibi)
function memberGroups() {
  const all = [...S.users.values()];
  const placed = new Set();
  const groups = [];
  // Sunucu sahibi her zaman en üstte, kendi başlığı altında
  const owners = all.filter((u) => (u.admin || u.owner) && !u.bot);
  owners.forEach((u) => placed.add(u.id));
  if (owners.length) groups.push(['👑 Sunucu sahibi', owners, '']);
  if (feat('perms'))
    for (const r of S.roles) {
      if (!r.hoist || r.id === 'everyone') continue;
      const list = all.filter((u) => !placed.has(u.id) && !u.bot && (u.roles || []).includes(r.id) && userRoles(u).find((x) => x.hoist)?.id === r.id);
      list.forEach((u) => placed.add(u.id));
      if (list.length) groups.push([r.name, list, r.color]);
    }
  for (const ch of S.channels) {
    const list = all.filter((u) => !placed.has(u.id) && u.channelId === ch.id);
    if (list.length) groups.push([ch.name, list, '']);
  }
  const rest = all.filter((u) => !placed.has(u.id) && !S.channels.some((c) => c.id === u.channelId));
  if (rest.length) groups.push(['Kanalsız', rest, '']);
  return groups;
}
// Profil kartı: roller (yetkin varsa ver/al) ve moderasyon durumu
function profileRoles(u) {
  if (!feat('perms') || u.bot) return null;
  const roles = userRoles(u);
  const manage = can('manageRoles') && (u.id === S.myId || outranks(u));
  const flags = [];
  if (u.serverMuted) flags.push('Sunucuda susturuldu');
  if (u.serverDeafened) flags.push('Sunucuda sağırlaştırıldı');
  if (isTimedOutUser(u)) flags.push(`Zaman aşımı · ${fmtLeft(u.timeoutUntil - Date.now())}`);
  if (!roles.length && !manage && !flags.length) return null;
  const box = h('div', { class: 'pf-roles' });
  for (const r of roles) box.append(roleChip(r, manage && canEditRole(r) ? () => send({ t: 'memberRole', to: u.id, roleId: r.id, on: false }) : null));
  if (manage) {
    const add = h('button', { class: 'role-chip add', title: 'Rol ver' }, '+');
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = add.getBoundingClientRect();
      showCtx({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {} }, roleToggleItems(subjectOf(u)));
    });
    box.append(add);
  }
  const sec = h('div', { class: 'pf-section' }, h('div', { class: 'pf-label' }, roles.length ? 'Roller' : 'Rol yok'), box);
  for (const f of flags) sec.append(h('div', { class: 'pf-modflag' }, f));
  return sec;
}
function roleChip(r, onRemove = null) {
  const chip = h('span', { class: 'role-chip', title: r.name }, h('i', { class: 'role-dot', style: r.color ? `background:${r.color}` : '' }), h('span', {}, r.name));
  if (onRemove) {
    const x = h('button', { class: 'role-chip-x', title: `${r.name} rolünü al` }, '×');
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
    chip.append(x);
  }
  return chip;
}

// =====================================================================
//  Sağ tık menüleri: kişi, ses kanalı, yazı kanalı
// =====================================================================
const TIMEOUTS = [
  [60, '60 saniye'],
  [300, '5 dakika'],
  [600, '10 dakika'],
  [3600, '1 saat'],
  [86400, '1 gün'],
  [604800, '1 hafta'],
];
// Fazla / baştaki / sondaki ayırıcıları at
function cleanItems(items) {
  const out = [];
  for (const it of items) {
    if (!it) continue;
    if (it === '-' && (!out.length || out[out.length - 1] === '-')) continue;
    out.push(it);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}
// Kişiyi (çevrimiçi ya da değil) menülerin anlayacağı biçime getir
function subjectOf(u) {
  return {
    name: u.name,
    userId: u.id,
    mid: null,
    roles: u.roles || [],
    admin: !!u.admin,
    owner: !!u.admin,
    mod: !!u.mod,
    bot: !!u.bot,
    online: true,
    channelId: u.channelId || null,
    serverMuted: !!u.serverMuted,
    serverDeafened: !!u.serverDeafened,
    timeoutUntil: u.timeoutUntil || 0,
  };
}
const targetOf = (t) => (t.userId ? { to: t.userId } : { mid: t.mid });
function roleToggleItems(t) {
  const roles = S.roles.filter((r) => r.id !== 'everyone' && canEditRole(r));
  if (!roles.length) return [{ html: '<div class="ctx-note">Verebileceğin bir rol yok. Roller, senin en üst rolünün altında olmalı.</div>' }];
  return roles.map((r) => {
    const has = (t.roles || []).includes(r.id);
    return {
      label: h('span', { class: 'ctx-role' }, h('i', { class: 'role-dot', style: r.color ? `background:${r.color}` : '' }), h('span', { class: 'ctx-role-name' }, r.name), h('b', { class: `ctx-check ${has ? 'on' : ''}` }, has ? '✓' : '')),
      run: () => send({ t: 'memberRole', ...targetOf(t), roleId: r.id, on: !has }),
    };
  });
}
function moveSubmenu(t) {
  const voice = S.channels.filter((c) => c.type !== 'text' && c.id !== t.channelId);
  return {
    label: 'Kanala taşı',
    submenu: [...voice.map((c) => ({ label: c.name, run: () => send({ t: 'move', to: t.userId, channelId: c.id }) }))],
  };
}
// Moderasyon bölümü (kişi menüsü ve Üyeler tablosundaki ⋯ düğmesi)
function modMenuItems(t) {
  if (!feat('perms')) return legacyModItems(t);
  const items = [];
  const self = t.userId === S.myId;
  if (t.bot) {
    if (can('moveMembers') && t.online) items.push(moveSubmenu(t), t.channelId && { label: 'Sesten çıkar', run: () => send({ t: 'move', to: t.userId, channelId: null }) });
    return cleanItems(items);
  }
  const reach = outranks(t);
  if (can('manageRoles') && (self || reach)) items.push({ label: 'Roller', submenu: roleToggleItems(t) });
  if (self) return cleanItems(items);
  const any = MEMBER_PERMS.some(can);
  if (!reach) {
    if (any) items.push({ html: `<div class="ctx-note">${t.owner ? 'Sunucu sahibine işlem yapılamaz.' : 'Bu kişinin rolü seninkiyle aynı ya da daha yüksek; işlem yapamazsın.'}</div>` });
    return cleanItems(items);
  }
  if (can('moveMembers') && t.online) {
    items.push(moveSubmenu(t));
    if (t.channelId) items.push({ label: 'Sesten çıkar', run: () => send({ t: 'move', to: t.userId, channelId: null }) });
  }
  if (can('muteMembers')) items.push({ label: t.serverMuted ? 'Sunucu susturmasını kaldır' : 'Sunucuda sustur', run: () => send({ t: 'serverMute', ...targetOf(t), on: !t.serverMuted }) });
  if (can('deafenMembers')) items.push({ label: t.serverDeafened ? 'Sağırlaştırmayı kaldır' : 'Sunucuda sağırlaştır', run: () => send({ t: 'serverDeafen', ...targetOf(t), on: !t.serverDeafened }) });
  if (can('timeout'))
    items.push(
      t.timeoutUntil > Date.now()
        ? { label: `Zaman aşımını kaldır (${fmtLeft(t.timeoutUntil - Date.now())} kaldı)`, run: () => send({ t: 'timeout', ...targetOf(t), seconds: 0 }) }
        : { label: 'Zaman aşımı', submenu: TIMEOUTS.map(([sec, label]) => ({ label, run: () => timeoutPrompt(t, sec, label) })) }
    );
  if (can('kick') || can('ban')) items.push('-');
  if (can('kick') && t.online)
    items.push({
      label: 'Sunucudan at…',
      danger: true,
      run: () => inlinePrompt(`${t.name} sunucudan atılsın mı?`, '', (reason) => send({ t: 'kick', to: t.userId, reason }), true, 'Sebep yazabilirsin (isteğe bağlı). Atılan kişi tekrar bağlanabilir.', { okLabel: 'At', danger: true, placeholder: 'Sebep' }),
    });
  if (can('ban') && feat('bans'))
    items.push({
      label: 'Yasakla…',
      danger: true,
      run: () =>
        inlinePrompt(
          `${t.name} yasaklansın mı?`,
          '',
          (reason) => send({ t: 'ban', ...targetOf(t), reason }),
          true,
          'Yasaklanan kişi bu bilgisayardan (ve internetten bağlanıyorsa aynı IP adresinden) tekrar giremez. Yasağı Sunucu ayarları › Yasaklılar bölümünden kaldırabilirsin.',
          { okLabel: 'Yasakla', danger: true, placeholder: 'Sebep (isteğe bağlı)' }
        ),
    });
  return cleanItems(items);
}
function timeoutPrompt(t, sec, label) {
  inlinePrompt(
    `${t.name}: ${label} zaman aşımı`,
    '',
    (reason) => send({ t: 'timeout', ...targetOf(t), seconds: sec, reason }),
    true,
    'Bu sürede konuşamaz, yazamaz, tepki veremez ve ses efekti çalamaz. Sebep yazabilirsin (isteğe bağlı).',
    { okLabel: 'Zaman aşımı uygula', danger: true, placeholder: 'Sebep' }
  );
}
// Rol sistemi olmayan eski sunucular için önceki menü
function legacyModItems(t) {
  if (!t.online || t.bot || t.owner) return [];
  if (!(S.isAdmin || (S.isMod && !t.mod))) return [];
  return cleanItems([
    moveSubmenu(t),
    { label: 'Mikrofonunu kapat', run: () => send({ t: 'serverMute', to: t.userId }) },
    { label: 'Sunucudan at…', danger: true, run: () => inlinePrompt(`${t.name} sunucudan atılsın mı?`, '', (reason) => send({ t: 'kick', to: t.userId, reason }), true, 'Sebep yazabilirsin (opsiyonel). Atılan kişi tekrar bağlanabilir.') },
    S.isAdmin && feat('roles') && { label: t.mod ? '🛡️ Moderatörlüğü al' : '🛡️ Moderatör yap', run: () => send({ t: 'setRole', to: t.userId, role: t.mod ? null : 'mod' }) },
    S.isAdmin && feat('bans') && { label: 'Yasakla…', danger: true, run: () => inlinePrompt(`${t.name} yasaklansın mı?`, '', (reason) => send({ t: 'ban', to: t.userId, reason }), true, 'Sebep yazabilirsin (opsiyonel).') },
  ]);
}

// Ses kanalı menüsü
function channelMenuItems(ch) {
  const n = [...S.users.values()].filter((u) => u.channelId === ch.id).length;
  const others = S.channels.filter((c) => c.type !== 'text' && c.id !== ch.id && !c.header);
  return cleanItems([
    ch.id !== S.channelId && !ch.header && { label: 'Kanala katıl', run: () => joinChannel(ch.id) },
    '-',
    can('manageChannels') && { label: ch.header ? 'Bu başlığa kanal ekle' : 'Alt kanal oluştur', run: () => promptChannel(ch.id) },
    can('manageChannels') && { label: 'Yeniden adlandır', run: () => renameChannel(ch) },
    can('manageChannels') && { label: 'Kanal ayarları…', run: () => channelSettings(ch) },
    can('moveMembers') &&
      n > 0 && {
        label: `Hepsini taşı (${n})`,
        submenu: [...others.map((c) => ({ label: c.name, run: () => send({ t: 'moveAll', from: ch.id, channelId: c.id }) })), { label: '⏏ Hepsini sesten çıkar', run: () => send({ t: 'moveAll', from: ch.id, channelId: null }) }],
      },
    can('manageMessages') && feat('purge') && { label: 'Sohbeti temizle…', run: () => purgeForm(ch) },
    '-',
    can('manageChannels') && { label: 'Kanalı sil', danger: true, run: () => confirmBox(`${ch.name} silinsin mi?`, 'Kanal, alt kanalları ve sohbeti herkes için silinir. İçindekiler Lobi’ye geçer.', 'Sil', () => send({ t: 'deleteChannel', channelId: ch.id })) },
  ]);
}
// Yazı kanalı menüsü
function textChannelMenuItems(ch) {
  const un = S.textUnread.get(ch.id);
  return cleanItems([
    { label: 'Sohbeti aç', run: () => openChat(ch.id) },
    un && {
      label: 'Okundu olarak işaretle',
      run: () => {
        S.textUnread.delete(ch.id);
        renderTextChannels();
      },
    },
    '-',
    can('manageChannels') && { label: 'Yeniden adlandır', run: () => renameChannel(ch) },
    can('manageChannels') && { label: 'Kanal ayarları…', run: () => channelSettings(ch) },
    can('manageMessages') && feat('purge') && { label: 'Sohbeti temizle…', run: () => purgeForm(ch) },
    '-',
    can('manageChannels') && { label: 'Kanalı sil', danger: true, run: () => confirmBox(`#${ch.name} silinsin mi?`, 'Kanal ve tüm mesaj geçmişi herkes için silinir.', 'Sil', () => send({ t: 'deleteChannel', channelId: ch.id })) },
  ]);
}

const SLOW_OPTIONS = [
  [0, 'Kapalı'],
  [5, '5 saniye'],
  [10, '10 saniye'],
  [15, '15 saniye'],
  [30, '30 saniye'],
  [60, '1 dakika'],
  [120, '2 dakika'],
  [300, '5 dakika'],
  [600, '10 dakika'],
  [900, '15 dakika'],
  [1800, '30 dakika'],
  [3600, '1 saat'],
  [7200, '2 saat'],
  [21600, '6 saat'],
];
// Kanal ayarları: ses kanalında kişi sınırı ve şifre; yazı kanalında yavaş mod ve salt okunur
function channelSettings(ch) {
  const text = ch.type === 'text';
  const slowOpts = SLOW_OPTIONS.some(([v]) => v === (ch.slowmode || 0)) ? SLOW_OPTIONS : [...SLOW_OPTIONS, [ch.slowmode, `${ch.slowmode} saniye`]];
  formModal({
    title: `${text ? '#' : ''}${ch.name} — kanal ayarları`,
    desc: text
      ? 'Yavaş modda herkes belirlediğin süre içinde bir mesaj yazabilir. Salt okunur kanala sadece "Mesajları yönet" yetkisi olanlar yazar.'
      : 'Şifreli kanala girmek isteyenden şifre istenir. "Taşı" ya da "Kanalları yönet" yetkisi olanlar şifresiz girer ve sınırı aşabilir.',
    fields: [
      { key: 'name', label: 'Kanal adı', value: ch.name, max: 40 },
      { key: 'topic', label: 'Konu (isteğe bağlı)', value: ch.topic || '', max: 200, placeholder: 'Bu kanal ne için?' },
      !text && feat('headers') && { key: 'header', label: 'Başlık kanalı (kimse giremez, altındaki kanalları gruplar)', type: 'check', value: !!ch.header },
      !text && feat('chpass') && { key: 'limit', label: 'Kişi sınırı (0 = sınırsız)', type: 'number', value: ch.limit || 0, min: 0, maxNum: 99, showIf: (v) => !v.header },
      !text && feat('chpass') && { key: 'password', label: ch.locked ? 'Yeni şifre (boş bırakırsan değişmez)' : 'Şifre (boş bırakırsan şifresiz)', type: 'password', max: 100, showIf: (v) => !v.header },
      !text && feat('chpass') && ch.locked && { key: 'clear', label: 'Şifreyi kaldır', type: 'check' },
      feat('slowmode') && { key: 'slow', label: 'Yavaş mod', type: 'select', value: String(ch.slowmode || 0), options: slowOpts.map(([v, l]) => [String(v), l]) },
      text && feat('readOnly') && { key: 'ro', label: 'Salt okunur (sadece yetkililer yazabilir)', type: 'check', value: !!ch.readOnly },
    ],
    submit: 'Kaydet',
    onSubmit: (v) => {
      const msg = { t: 'channelSettings', channelId: ch.id };
      if (v.name?.trim() && v.name.trim() !== ch.name) msg.name = v.name.trim();
      if ((v.topic || '') !== (ch.topic || '')) msg.topic = v.topic || '';
      if ('limit' in v) msg.limit = Number(v.limit) || 0;
      if (v.clear) msg.password = '';
      else if (v.password) msg.password = v.password;
      if ('slow' in v) msg.slowmode = Number(v.slow) || 0;
      if ('ro' in v) msg.readOnly = !!v.ro;
      if ('header' in v && !!v.header !== !!ch.header) msg.header = !!v.header;
      send(msg);
    },
  });
}
function purgeForm(ch) {
  formModal({
    title: `${ch.type === 'text' ? '#' : ''}${ch.name} — sohbeti temizle`,
    desc: 'Silinen mesajlar herkes için kaybolur ve geri gelmez. Sabitlenmiş mesajlar da silinir.',
    fields: [
      {
        key: 'count',
        label: 'Silinecek mesajlar',
        type: 'select',
        value: '25',
        options: [
          ['10', 'Son 10 mesaj'],
          ['25', 'Son 25 mesaj'],
          ['50', 'Son 50 mesaj'],
          ['100', 'Son 100 mesaj'],
          ['0', 'Hepsi'],
        ],
      },
    ],
    submit: 'Temizle',
    danger: true,
    onSubmit: (v) => send({ t: 'purge', channelId: ch.id, count: Number(v.count) || 0 }),
  });
}
function createChannelForm(type = 'voice') {
  const voice = S.channels.filter((c) => c.type !== 'text');
  formModal({
    title: 'Kanal oluştur',
    fields: [
      {
        key: 'type',
        label: 'Kanal türü',
        type: 'select',
        value: type,
        options: [
          ['voice', '🔊 Ses kanalı — konuşma, ekran paylaşımı'],
          ['text', '# Yazı kanalı — sese katılmadan herkes yazar'],
          ...(feat('headers') ? [['header', '📁 Başlık — kimse giremez, altına kanal eklenir (ör. Oyun Kanalları)']] : []),
        ],
      },
      { key: 'name', label: 'Kanal adı', max: 40, placeholder: 'yeni-kanal' },
      { key: 'parent', label: 'Üst kanal ya da başlık', type: 'select', value: '', options: [['', '— yok (en üstte) —'], ...voice.map((c) => [c.id, c.header ? `📁 ${c.name}` : c.name])], showIf: (v) => v.type !== 'text' },
      feat('slowmode') && { key: 'slow', label: 'Yavaş mod', type: 'select', value: '0', options: SLOW_OPTIONS.map(([v, l]) => [String(v), l]), showIf: (v) => v.type === 'text' },
      feat('readOnly') && { key: 'ro', label: 'Salt okunur (sadece yetkililer yazabilir)', type: 'check', showIf: (v) => v.type === 'text' },
    ],
    submit: 'Oluştur',
    onSubmit: (v) => {
      if (!v.name.trim()) {
        toast('Kanal adı yaz', '', 'err');
        return false;
      }
      const text = v.type === 'text';
      send({ t: 'createChannel', name: v.name.trim(), type: text ? 'text' : undefined, header: v.type === 'header' || undefined, parent: text ? null : v.parent || null, slowmode: text ? Number(v.slow) || 0 : undefined, readOnly: text ? !!v.ro : undefined });
    },
  });
}

// =====================================================================
//  Sunucu Ayarları ekranı
// =====================================================================
const SS = {
  tab: 'overview',
  info: null, // son adminInfo
  audit: [], // denetim kaydı (en yeni başta)
  roleSel: null,
  roleTab: 'display',
  rolePermQ: '',
  focusRoleName: false,
  memberQ: '',
  memberFilter: 'all',
  auditQ: '',
  auditAct: '',
  auditBy: '',
  timer: null,
  host: null, // bu bilgisayarda sunucu açık mı (Bağlantı sekmesi)
  ovDirty: false,
  sigs: {}, // sekme içeriğinin son hali (değişmediyse yeniden çizme)
};
const SS_TABS = {
  overview: () => true,
  roles: () => feat('perms') && can('manageRoles'),
  members: () => MEMBER_PERMS.some(can) || can('manageRoles'),
  channels: () => can('manageChannels') || can('moveMembers') || can('manageMessages'),
  bans: () => feat('bans') && can('ban'),
  audit: () => feat('audit') && can('viewAudit'),
  connection: () => S.isAdmin || can('manageServer'),
};
const ssVisible = (id) => !!SS_TABS[id]?.();

function openAdminPanel(tab) {
  if (!isStaff()) return toast('Sunucu ayarlarını açamazsın', 'Bunun için bir yönetim yetkisi gerekir.', 'err');
  if (typeof tab === 'string') SS.tab = tab;
  if (!ssVisible(SS.tab)) SS.tab = 'overview';
  SS.sigs = {};
  SS.ovDirty = false;
  $('#ss-savebar').classList.add('hidden');
  $('#adm-stop').textContent = 'Sunucuyu Kapat';
  delete $('#adm-stop').dataset.confirm;
  ssFillOverview(true);
  ssRenderNav();
  showModal('admin-panel');
  ssShowTab(SS.tab);
  refreshAdmin();
  if (can('viewAudit') && feat('audit')) send({ t: 'audit', limit: 500 });
  clearInterval(SS.timer);
  SS.timer = setInterval(() => {
    if ($('#admin-panel').classList.contains('hidden')) return clearInterval(SS.timer);
    refreshAdmin();
  }, 4000);
}

async function refreshAdmin() {
  if (!isStaff()) return;
  send({ t: 'adminInfo' });
  if (SS.tab === 'connection') renderConnection();
}

function renderAdminInfo(m) {
  SS.info = m;
  if (m.audit?.length && !SS.audit.length) {
    SS.audit = m.audit;
    if (SS.tab === 'audit') renderAuditPane();
  }
  if (m.roles) S.roles = m.roles;
  ssRenderStats();
  ssFillOverview(false);
  ssRenderLive();
}

function ssRenderNav() {
  $('#ss-nav-badge').textContent = (S.serverName || '?').charAt(0).toUpperCase();
  $('#ss-nav-name').textContent = S.serverName || 'Sunucu';
  for (const b of $$('#ss-nav .ss-tab')) b.classList.toggle('hidden', !ssVisible(b.dataset.ss));
  $('#ss-nav-mod').classList.toggle('hidden', !ssVisible('bans') && !ssVisible('audit'));
  $('#ss-nav .settings-nav-sep')?.classList.toggle('hidden', !ssVisible('connection'));
  const me = $('#ss-nav-me');
  const roles = S.myRoles.map(roleById).filter(Boolean);
  me.replaceChildren(
    h('div', { class: 'ss-me-label' }, 'Sen'),
    h('div', { class: 'ss-me-roles' }, ...(S.isAdmin ? [h('span', { class: 'role-chip owner' }, ICON_CROWN(), h('span', {}, 'Sunucu sahibi'))] : roles.length ? roles.map((r) => roleChip(r)) : [h('span', { class: 'role-chip' }, h('span', {}, '@herkes'))]))
  );
}
function ssShowTab(id) {
  if (!ssVisible(id)) id = 'overview';
  SS.tab = id;
  for (const b of $$('#ss-nav .ss-tab')) b.classList.toggle('active', b.dataset.ss === id);
  for (const p of $$('#admin-panel .ss-pane')) p.classList.toggle('hidden', p.dataset.ss !== id);
  SS.sigs[id] = '';
  $('#ss-main').scrollTop = 0;
  ssRenderTab(id, true);
}
function ssRenderTab(id, force = false) {
  if (id === 'overview') ssRenderStats();
  else if (id === 'roles') renderRolesPane(force);
  else if (id === 'members') renderMembersPane(force);
  else if (id === 'channels') renderChannelsPane(force);
  else if (id === 'bans') renderBansPane(force);
  else if (id === 'audit' && force) renderAuditPane();
  else if (id === 'connection') renderConnection();
}
// Durum ya da adminInfo gelince açık sekmeyi tazele
function ssRenderLive() {
  if ($('#admin-panel').classList.contains('hidden')) return;
  ssRenderNav();
  if (!ssVisible(SS.tab)) return ssShowTab('overview');
  ssRenderTab(SS.tab);
}
// İçerik değişmediyse ya da kullanıcı içinde bir şey yazıyorsa yeniden çizme
function ssChanged(key, data, box) {
  const sig = JSON.stringify(data);
  if (SS.sigs[key] === sig) return false;
  const a = document.activeElement;
  const typing = a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'color', 'radio', 'button'].includes(a.type)));
  if (box && typing && box.contains(a) && SS.sigs[key]) {
    a.addEventListener('blur', () => setTimeout(() => ssRenderTab(SS.tab), 50), { once: true });
    return false;
  }
  SS.sigs[key] = sig;
  return true;
}
$$('#ss-nav .ss-tab').forEach((b) =>
  b.addEventListener('click', () => {
    if (SS.ovDirty && SS.tab === 'overview' && b.dataset.ss !== 'overview') return ssNagSave();
    ssShowTab(b.dataset.ss);
  })
);

// ---------- Genel Bakış ----------
function ssRenderStats() {
  const m = SS.info;
  $('#ss-hero-badge').textContent = (S.serverName || '?').charAt(0).toUpperCase();
  $('#ss-hero-name').textContent = S.serverName || '';
  $('#ss-hero-desc').textContent = S.serverDesc || 'Açıklama yok';
  $('#ss-hero-desc').classList.toggle('muted', !S.serverDesc);
  $('#adm-count').textContent = m ? m.users.filter((u) => !u.bot).length : [...S.users.values()].filter((u) => !u.bot).length;
  $('#adm-channels').textContent = S.channels.length;
  $('#adm-roles').textContent = Math.max(0, S.roles.length - 1);
  $('#adm-uptime').textContent = m ? fmtDuration(m.now - m.startedAt) : '—';
  const pass = $('#adm-haspass');
  pass.textContent = m ? (m.hasPassword ? '🔒 Şifreli' : '🔓 Şifresiz') : '';
  pass.classList.toggle('hidden', !m);
  const n = m?.bans?.length || 0;
  $('#ss-n-bans').textContent = n ? String(n) : '';
}
const OV_FIELDS = ['#adm-name', '#adm-desc', '#adm-password', '#adm-nopass', '#adm-welcome', '#adm-afk-ch', '#adm-afk-min', '#adm-gif-prov', '#adm-gif-key', '#adm-previews'];
function ssFillOverview(force) {
  if (SS.ovDirty && !force) return;
  const m = SS.info;
  const editable = can('manageServer');
  $('#ss-ov-readonly').classList.toggle('hidden', editable);
  // Yönetemeyen kişiye şifre ve GIF anahtarı alanları anlamsız: gizle
  $('#adm-password').closest('.ss-card').classList.toggle('hidden', !editable);
  $('#adm-gif-key').closest('.field').classList.toggle('hidden', !editable);
  for (const sel of OV_FIELDS) $(sel).disabled = !editable;
  for (const b of ['#adm-ann', '#adm-ann-send', '#adm-ann-clear']) $(b).disabled = !editable;
  const set = (sel, v) => {
    const el = $(sel);
    if (document.activeElement === el && !force) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  };
  set('#adm-name', S.serverName);
  set('#adm-desc', m?.description ?? S.serverDesc);
  set('#adm-password', '');
  set('#adm-nopass', false);
  set('#adm-welcome', m?.welcomeMessage || '');
  const afk = $('#adm-afk-ch');
  if (document.activeElement !== afk || force) {
    afk.replaceChildren(h('option', { value: '' }, '— yok —'), ...S.channels.filter((c) => c.type !== 'text' && !c.header).map((c) => h('option', { value: c.id }, c.name)));
    afk.value = m?.afkChannelId || S.afk?.channelId || '';
  }
  set('#adm-afk-min', m?.afkMinutes ?? S.afk?.minutes ?? 15);
  set('#adm-gif-prov', m?.gifProvider || 'klipy');
  set('#adm-gif-key', '');
  set('#adm-previews', m ? m.linkPreviews !== false : true);
  $('#adm-gif-state').textContent = m ? (m.hasGifKey ? '(kayıtlı)' : '(girilmedi)') : '';
  ssFillAnnouncement();
}
function ssFillAnnouncement() {
  const a = S.announcement;
  const cur = $('#adm-ann-current');
  cur.classList.toggle('hidden', !a?.text);
  if (a?.text) cur.replaceChildren(h('b', {}, 'Şu an yayında: '), a.text, h('span', { class: 'muted' }, ` — ${a.by}, ${dayLabel(a.at)} ${hhmm(a.at)}`));
  $('#adm-ann-clear').disabled = !a?.text || !can('manageServer');
}
function ssMarkDirty() {
  if (!can('manageServer')) return;
  SS.ovDirty = true;
  $('#ss-savebar').classList.remove('hidden');
}
for (const sel of OV_FIELDS) {
  $(sel).addEventListener('input', ssMarkDirty);
  $(sel).addEventListener('change', ssMarkDirty);
}
function ssNagSave() {
  const bar = $('#ss-savebar');
  bar.classList.remove('nag');
  void bar.offsetWidth;
  bar.classList.add('nag');
}
$('#ss-reset').addEventListener('click', () => {
  SS.ovDirty = false;
  $('#ss-savebar').classList.add('hidden');
  ssFillOverview(true);
});
$('#ss-save').addEventListener('click', () => {
  const m = SS.info || {};
  const name = $('#adm-name').value.trim();
  const srv = { t: 'setServer' };
  if (name && name !== S.serverName) srv.name = name;
  if ($('#adm-nopass').checked) srv.password = '';
  else if ($('#adm-password').value) srv.password = $('#adm-password').value;
  if ('name' in srv || 'password' in srv) send(srv);
  const cfg = { t: 'setConfig', afkChannelId: $('#adm-afk-ch').value || null, afkMinutes: Number($('#adm-afk-min').value) || 0, gifProvider: $('#adm-gif-prov').value };
  const key = $('#adm-gif-key').value.trim();
  if (key) cfg.gifKey = key;
  if (feat('welcomeMessage')) {
    cfg.description = $('#adm-desc').value;
    cfg.welcomeMessage = $('#adm-welcome').value;
    cfg.linkPreviews = $('#adm-previews').checked;
  }
  void m;
  send(cfg);
  SS.ovDirty = false;
  $('#ss-savebar').classList.add('hidden');
  $('#adm-password').value = '';
  $('#adm-gif-key').value = '';
  $('#adm-nopass').checked = false;
  setTimeout(refreshAdmin, 300);
});
$('#adm-ann-send').addEventListener('click', () => {
  const text = $('#adm-ann').value.trim();
  if (!text) return $('#adm-ann').focus();
  send({ t: 'announce', text });
  $('#adm-ann').value = '';
  toast('Duyuru yayınlandı', 'Herkesin ekranının üstünde görünüyor.');
});
$('#adm-ann-clear').addEventListener('click', () => send({ t: 'announce', text: '' }));

// ---------- Roller ----------
const ROLE_SWATCHES = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b', '#11806a', '#1f8b4c', '#206694', '#71368a', '#ad1457', '#c27c0e', '#a84300', '#992d22', '#979c9f', '#546e7a'];
function roleMemberCount(id) {
  const rows = SS.info?.members;
  if (rows) return rows.filter((x) => (x.roles || []).includes(id)).length;
  return [...S.users.values()].filter((u) => (u.roles || []).includes(id)).length;
}
function renderRolesPane(force = false) {
  const box = $('#ss-roles');
  const roles = S.roles;
  if (!roles.length) return box.replaceChildren(h('p', { class: 'hint' }, 'Roller yükleniyor…'));
  if (!roleById(SS.roleSel)) SS.roleSel = (roles.find((r) => r.id !== 'everyone' && canEditRole(r)) || roles[0]).id;
  const sig = [roles, SS.roleSel, SS.roleTab, SS.rolePermQ, (SS.info?.members || []).map((x) => [x.mid, x.roles, x.name, x.online]), myRank()];
  if (!force && !ssChanged('roles', sig, box)) return;
  SS.sigs.roles = JSON.stringify(sig);
  const list = h('div', { class: 'ss-role-list' });
  const others = roles.filter((r) => r.id !== 'everyone');
  list.append(
    h('div', { class: 'ss-role-list-head' }, h('span', {}, `Roller — ${others.length}`), h('button', { class: 'btn sm primary', onclick: () => send({ t: 'roleCreate', name: 'yeni rol', color: '', perms: [], hoist: false }) }, '+ Rol oluştur')),
    h('p', { class: 'ss-mini-hint' }, 'Üstteki rol alttakileri yönetebilir. Sıralamak için sürükle.')
  );
  let dragId = null;
  for (const r of roles) {
    const editable = canEditRole(r);
    const movable = r.id !== 'everyone' && editable;
    const row = h(
      'div',
      {
        class: `ss-role-row ${r.id === SS.roleSel ? 'sel' : ''} ${editable ? '' : 'locked'} ${r.id === 'everyone' ? 'everyone' : ''}`,
        draggable: movable ? 'true' : null,
        onclick: () => {
          SS.roleSel = r.id;
          renderRolesPane(true);
        },
        ondragstart: (e) => {
          dragId = r.id;
          e.dataTransfer.effectAllowed = 'move';
          row.classList.add('dragging');
        },
        ondragend: () => row.classList.remove('dragging'),
        ondragover: (e) => {
          if (!dragId || r.id === 'everyone' || !movable) return;
          e.preventDefault();
          const rc = row.getBoundingClientRect();
          row.classList.toggle('drop-above', e.clientY < rc.top + rc.height / 2);
          row.classList.toggle('drop-below', e.clientY >= rc.top + rc.height / 2);
        },
        ondragleave: () => row.classList.remove('drop-above', 'drop-below'),
        ondrop: (e) => {
          e.preventDefault();
          const below = row.classList.contains('drop-below');
          row.classList.remove('drop-above', 'drop-below');
          if (!dragId || dragId === r.id) return;
          const ids = others.map((x) => x.id).filter((id) => id !== dragId);
          ids.splice(ids.indexOf(r.id) + (below ? 1 : 0), 0, dragId);
          dragId = null;
          send({ t: 'roleOrder', ids });
        },
      },
      h('span', { class: 'ss-grip' }, movable ? '⋮⋮' : ''),
      h('i', { class: 'role-dot big', style: r.color ? `background:${r.color}` : '' }),
      h('span', { class: 'ss-role-name' }, r.name),
      r.hoist ? h('span', { class: 'ss-role-tag', title: 'Üye listesinde ayrı gösterilir' }, 'ayrı') : null,
      editable ? null : svgFlag(ICON_LOCK, 'ss-role-lock', 'Bu rol senin en üst rolünle aynı ya da daha yüksek; düzenleyemezsin'),
      h('span', { class: 'ss-role-count', title: 'Üye sayısı' }, r.id === 'everyone' ? 'herkes' : String(roleMemberCount(r.id)))
    );
    list.append(row);
  }
  box.replaceChildren(h('div', { class: 'ss-head-row' }, h('h2', {}, 'Roller')), h('div', { class: 'ss-roles-wrap' }, list, renderRoleEditor(roleById(SS.roleSel))));
  if (SS.focusRoleName) {
    SS.focusRoleName = false;
    setTimeout(() => {
      const inp = $('#ss-role-name');
      inp?.focus();
      inp?.select();
    }, 30);
  }
}
function renderRoleEditor(r) {
  const ed = h('div', { class: 'ss-role-editor' });
  const editable = canEditRole(r);
  const everyone = r.id === 'everyone';
  const idx = S.roles.findIndex((x) => x.id === r.id);
  const others = S.roles.filter((x) => x.id !== 'everyone');
  const head = h(
    'div',
    { class: 'ss-re-head' },
    h('i', { class: 'role-dot big', style: r.color ? `background:${r.color}` : '' }),
    h('div', { class: 'ss-re-title' }, h('small', {}, 'Rolü düzenle'), h('b', {}, r.name))
  );
  if (!everyone && editable) {
    const up = h('button', { class: 'icon-btn', title: 'Yukarı taşı', onclick: () => send({ t: 'roleMove', id: r.id, dir: 'up' }) }, '▲');
    const down = h('button', { class: 'icon-btn', title: 'Aşağı taşı', onclick: () => send({ t: 'roleMove', id: r.id, dir: 'down' }) }, '▼');
    up.disabled = idx <= 0 || !canEditRole(S.roles[idx - 1]);
    down.disabled = idx >= others.length - 1;
    head.append(h('span', { class: 'spacer' }), up, down);
  }
  ed.append(head);
  if (!editable) ed.append(h('div', { class: 'ss-note' }, everyone ? 'Bu rolü düzenlemek için "Rolleri yönet" yetkisi ve en az bir rol gerekir.' : 'Bu rol senin en üst rolünle aynı seviyede ya da daha yüksek. Sadece görüntüleyebilirsin.'));
  const tabs = h('div', { class: 'ss-subtabs' });
  const tabList = everyone ? [['perms', 'Yetkiler']] : [['display', 'Görünüm'], ['perms', 'Yetkiler'], ['members', `Üyeler (${roleMemberCount(r.id)})`]];
  if (!tabList.some(([k]) => k === SS.roleTab)) SS.roleTab = tabList[0][0];
  for (const [k, l] of tabList)
    tabs.append(
      h(
        'button',
        {
          class: `ss-subtab ${SS.roleTab === k ? 'active' : ''}`,
          onclick: () => {
            SS.roleTab = k;
            renderRolesPane(true);
          },
        },
        l
      )
    );
  ed.append(tabs);
  const upd = (patch) => send({ t: 'roleUpdate', id: r.id, ...patch });
  if (SS.roleTab === 'display') {
    const name = h('input', { id: 'ss-role-name', maxlength: 32, value: r.name, autocomplete: 'off' });
    name.disabled = !editable;
    const commit = () => name.value.trim() && name.value.trim() !== r.name && upd({ name: name.value.trim() });
    name.addEventListener('change', commit);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    ed.append(h('label', { class: 'field' }, h('span', {}, 'Rol adı'), name));
    // Renk
    const sw = h('div', { class: 'ss-swatches' });
    const pick = (c) => editable && upd({ color: c });
    const none = h('button', { class: `ss-swatch none ${!r.color ? 'sel' : ''}`, title: 'Renksiz (varsayılan)', onclick: () => pick('') });
    sw.append(none);
    const custom = h('input', { type: 'color', class: 'ss-color-input', title: 'Özel renk', value: r.color || '#99aab5' });
    custom.disabled = !editable;
    custom.addEventListener('change', () => pick(custom.value));
    sw.append(h('label', { class: `ss-swatch custom ${r.color && !ROLE_SWATCHES.includes(r.color) ? 'sel' : ''}`, title: 'Özel renk seç', style: r.color && !ROLE_SWATCHES.includes(r.color) ? `background:${r.color}` : '' }, custom, '🎨'));
    for (const c of ROLE_SWATCHES) sw.append(h('button', { class: `ss-swatch ${r.color === c ? 'sel' : ''}`, style: `background:${c}`, title: c, onclick: () => pick(c) }));
    for (const b of sw.querySelectorAll('button')) b.disabled = !editable;
    ed.append(h('div', { class: 'field' }, h('span', {}, 'Rol rengi'), h('small', { class: 'ss-mini-hint' }, 'Üyeler kendi yazı stilini seçmediyse adları en üst renkli rollerinin renginde görünür.'), sw));
    // Önizleme
    const pv = h('div', { class: 'ss-role-preview' });
    const pvName = (txt) => h('span', { class: 'ss-pv-name', style: r.color ? `color:${roleInk(r.color)}` : '' }, txt);
    pv.append(
      h('div', { class: 'ss-pv-row' }, avatar(S.myName || 'Kanki'), h('div', {}, h('div', {}, pvName(S.myName || 'Kanki'), h('span', { class: 'ss-pv-time' }, 'Bugün ' + hhmm(Date.now()))), h('div', { class: 'ss-pv-text' }, 'Rol rengi böyle görünür 👋')))
    );
    ed.append(h('div', { class: 'field' }, h('span', {}, 'Önizleme'), pv));
    // Ayrı göster
    const hoist = h('input', { type: 'checkbox' });
    hoist.checked = !!r.hoist;
    hoist.disabled = !editable;
    hoist.addEventListener('change', () => upd({ hoist: hoist.checked }));
    ed.append(h('label', { class: 'ss-switch-row' }, h('span', { class: 'ss-sw-text' }, h('b', {}, 'Üyeleri ayrı göster'), h('small', {}, 'Bu roldeki çevrimiçi kişiler üye listesinde kendi başlıkları altında görünür.')), h('span', { class: 'ss-switch' }, hoist, h('i'))));
    if (editable)
      ed.append(
        h(
          'div',
          { class: 'ss-danger-row' },
          h(
            'button',
            {
              class: 'btn danger',
              onclick: () => confirmBox(`"${r.name}" rolü silinsin mi?`, `Rol ${roleMemberCount(r.id)} kişiden alınır. Bu geri alınamaz.`, 'Rolü sil', () => send({ t: 'roleDelete', id: r.id })),
            },
            'Rolü sil'
          )
        )
      );
  } else if (SS.roleTab === 'perms') {
    if (everyone) ed.append(h('p', { class: 'hint' }, '@herkes rolünün yetkileri sunucudaki herkesin varsayılan yetkileridir. Bir şeyi herkese kapatıp sadece bir role açmak için burada kapat, o rolde aç.'));
    const q = h('input', { class: 'ss-search', placeholder: 'Yetki ara…', value: SS.rolePermQ, autocomplete: 'off' });
    q.addEventListener('input', () => {
      SS.rolePermQ = q.value;
      filterPerms();
    });
    const tools = h('div', { class: 'ss-toolbar' }, q);
    if (editable && !everyone) tools.append(h('button', { class: 'btn sm', onclick: () => confirmBox('Bu rolün tüm yetkileri kapatılsın mı?', '', 'Hepsini kapat', () => upd({ perms: [] })) }, 'Hepsini kapat'));
    ed.append(tools);
    const defs = S.permDefs.length ? S.permDefs : [];
    const rows = [];
    for (const [g, gl] of PERM_GROUPS) {
      const ps = defs.filter((d) => d.group === g);
      if (!ps.length) continue;
      const grp = h('div', { class: 'ss-perm-group' }, h('h3', {}, gl));
      for (const d of ps) {
        const on = r.perms.includes(d.key);
        // @herkes'e Yönetici yetkisini sadece sunucu sahibi verebilir (sunucu da reddeder)
        const ownerOnly = r.id === 'everyone' && d.key === 'administrator' && !S.isAdmin;
        const lockedPerm = !editable || !canGrantPerm(d.key) || ownerOnly;
        const inp = h('input', { type: 'checkbox' });
        inp.checked = on;
        inp.disabled = lockedPerm;
        inp.addEventListener('change', () => {
          const next = inp.checked ? [...new Set([...r.perms, d.key])] : r.perms.filter((p) => p !== d.key);
          r.perms = next; // anında görünsün; sunucu durumu da gönderir
          upd({ perms: next });
        });
        const row = h(
          'label',
          { class: `ss-perm ${lockedPerm ? 'locked' : ''} ${d.key === 'administrator' ? 'danger' : ''}`, 'data-q': trLower(`${d.label} ${d.desc}`) },
          h('span', { class: 'ss-sw-text' }, h('b', {}, d.label), h('small', {}, d.desc), editable && !canGrantPerm(d.key) ? h('small', { class: 'ss-perm-why' }, 'Bu yetki sende olmadığı için değiştiremezsin.') : editable && ownerOnly ? h('small', { class: 'ss-perm-why' }, 'Bunu sadece sunucu sahibi değiştirebilir.') : null),
          h('span', { class: 'ss-switch' }, inp, h('i'))
        );
        rows.push(row);
        grp.append(row);
      }
      ed.append(grp);
    }
    const filterPerms = () => {
      const t = trLower(SS.rolePermQ.trim());
      for (const row of rows) row.classList.toggle('hidden', !!t && !row.dataset.q.includes(t));
      for (const g of ed.querySelectorAll('.ss-perm-group')) g.classList.toggle('hidden', !g.querySelector('.ss-perm:not(.hidden)'));
    };
    filterPerms();
  } else if (SS.roleTab === 'members') {
    const rows = (SS.info?.members || []).filter((x) => (x.roles || []).includes(r.id));
    const cands = (SS.info?.members || []).filter((x) => !(x.roles || []).includes(r.id) && !x.owner);
    if (editable && cands.length) {
      const sel = h('select', { class: 'ss-select' }, h('option', { value: '' }, 'Üye ekle…'), ...cands.sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((x) => h('option', { value: x.mid }, `${x.name}${x.online ? '' : ' (çevrimdışı)'}`)));
      sel.addEventListener('change', () => {
        if (sel.value) send({ t: 'memberRole', mid: sel.value, roleId: r.id, on: true });
        sel.blur();
      });
      ed.append(h('div', { class: 'ss-toolbar' }, sel));
    }
    if (!rows.length) ed.append(h('div', { class: 'ss-empty' }, 'Bu rolde kimse yok.'));
    for (const x of rows)
      ed.append(
        h(
          'div',
          { class: 'ss-mrow' },
          avatar(x.name),
          h('span', { class: 'ss-mrow-name', style: r.color ? `color:${roleInk(r.color)}` : '' }, x.name),
          h('span', { class: `ss-online ${x.online ? 'on' : ''}` }, x.online ? 'çevrimiçi' : 'çevrimdışı'),
          editable ? h('button', { class: 'btn sm', onclick: () => send({ t: 'memberRole', mid: x.mid, roleId: r.id, on: false }) }, 'Rolü al') : null
        )
      );
  }
  return ed;
}

// ---------- Üyeler ----------
function memberRowsData() {
  const m = SS.info;
  if (!m) return [];
  const byId = new Map(m.users.map((u) => [u.id, u]));
  const members =
    m.members ||
    m.users.filter((u) => !u.bot).map((u) => ({ mid: null, name: u.name, roles: [], online: true, userId: u.id, owner: !!u.admin, serverMuted: false, serverDeafened: false, timeoutUntil: 0 }));
  return members.map((x) => {
    const live = x.userId ? S.users.get(x.userId) : null;
    const u = x.userId ? byId.get(x.userId) : null;
    return {
      ...x,
      name: live?.name || x.name,
      roles: live ? live.roles || [] : x.roles || [],
      admin: !!x.owner,
      owner: !!x.owner,
      mod: !!live?.mod,
      online: !!live,
      userId: live ? x.userId : null,
      channelId: live?.channelId || null,
      serverMuted: live ? !!live.serverMuted : x.serverMuted,
      serverDeafened: live ? !!live.serverDeafened : x.serverDeafened,
      timeoutUntil: live ? live.timeoutUntil || 0 : x.timeoutUntil || 0,
      ip: u?.ip || '',
      connectedAt: u?.connectedAt || 0,
      color: live?.color || userRoles(x).find((r) => r.color)?.color || '',
    };
  });
}
function renderMembersPane(force = false) {
  const box = $('#ss-members');
  if (!SS.info) return box.replaceChildren(h('p', { class: 'hint' }, 'Üyeler yükleniyor…'));
  let rows = memberRowsData();
  const q = trLower(SS.memberQ.trim());
  const now = Date.now();
  if (q) rows = rows.filter((x) => trLower(x.name).includes(q) || userRoles(x).some((r) => trLower(r.name).includes(q)));
  if (SS.memberFilter === 'online') rows = rows.filter((x) => x.online);
  if (SS.memberFilter === 'roles') rows = rows.filter((x) => x.roles.length);
  if (SS.memberFilter === 'punished') rows = rows.filter((x) => x.serverMuted || x.serverDeafened || x.timeoutUntil > now);
  rows.sort((a, b) => b.online - a.online || rankOfUser(b) - rankOfUser(a) || a.name.localeCompare(b.name, 'tr'));
  const showIp = S.isAdmin || can('administrator');
  const sig = [rows.map((x) => [x.mid, x.name, x.roles, x.online, x.channelId, x.serverMuted, x.serverDeafened, Math.ceil((x.timeoutUntil - now) / 60000), x.ip]), S.roles.map((r) => [r.id, r.name, r.color, r.position]), Math.floor(now / 60000), myRank(), document.documentElement.dataset.scheme];
  if (!force && !ssChanged('members', sig, box)) return;
  SS.sigs.members = JSON.stringify(sig);
  const total = SS.info.members?.length ?? rows.length;
  const table = h('div', { class: `ss-table ${showIp ? 'with-ip' : ''}` });
  table.append(h('div', { class: 'ss-tr ss-th' }, h('span', {}, `Üye (${rows.length}${rows.length !== total ? '/' + total : ''})`), h('span', {}, 'Roller'), h('span', {}, 'Kanal'), showIp ? h('span', {}, 'IP') : null, h('span', {}, 'Bağlandı'), h('span', {})));
  if (!rows.length) table.append(h('div', { class: 'ss-empty' }, q ? 'Aramana uyan üye yok.' : 'Gösterilecek üye yok.'));
  for (const x of rows) {
    const me = x.userId === S.myId;
    const nm = h('span', { class: 'ss-mname', style: x.color ? `color:${roleInk(x.color)}` : '' }, x.name);
    const flags = [];
    if (x.owner) flags.push(h('span', { class: 'crown', title: 'Sunucu sahibi' }, ICON_CROWN()));
    if (x.serverMuted) flags.push(svgFlag(ICON.micOff, 'mod-flag', 'Sunucuda susturuldu'));
    if (x.serverDeafened) flags.push(svgFlag(ICON.headOff, 'mod-flag', 'Sunucuda sağırlaştırıldı'));
    if (x.timeoutUntil > now) flags.push(svgFlag(ICON_CLOCK, 'mod-flag amber', `Zaman aşımı · ${fmtLeft(x.timeoutUntil - now)} kaldı`));
    const av = avatar(x.name);
    if (x.online) withDot(av, S.users.get(x.userId));
    const sub = x.online ? (me ? 'sen' : 'çevrimiçi') : 'çevrimdışı';
    const cell1 = h('div', { class: 'ss-mcell' }, av, h('div', { class: 'ss-mtext' }, h('div', { class: 'ss-mline' }, nm, ...flags), h('div', { class: 'ss-msub' }, sub)));
    // Roller
    const manage = feat('perms') && can('manageRoles') && (me || outranks(x));
    const rc = h('div', { class: 'ss-rolecell' });
    for (const r of userRoles(x)) rc.append(roleChip(r, manage && canEditRole(r) ? () => send({ t: 'memberRole', ...targetOf(x), roleId: r.id, on: false }) : null));
    if (manage) {
      const add = h('button', { class: 'role-chip add', title: 'Rol ver' }, '+');
      add.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = add.getBoundingClientRect();
        showCtx({ clientX: b.left, clientY: b.bottom + 4, preventDefault() {} }, roleToggleItems(x));
      });
      rc.append(add);
    }
    if (!rc.childElementCount) rc.append(h('span', { class: 'muted' }, '—'));
    // Kanal (taşıma yetkin varsa seçilebilir)
    let chCell;
    if (x.online && can('moveMembers') && (me || outranks(x)) && S.channels.length) {
      const sel = h('select', { class: 'ss-select sm', title: 'Kanala taşı' }, h('option', { value: '' }, '— ses dışı —'));
      for (const c of S.channels.filter((c) => c.type !== 'text')) sel.append(h('option', { value: c.id }, c.name));
      sel.value = x.channelId || '';
      sel.addEventListener('change', () => {
        send({ t: 'move', to: x.userId, channelId: sel.value || null });
        sel.blur();
      });
      chCell = sel;
    } else chCell = h('span', { class: 'muted' }, x.online ? chName(x.channelId) || 'ses dışı' : '—');
    const more = h('button', { class: 'icon-btn ss-more', title: 'İşlemler' });
    more.innerHTML = ICON_MORE;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      const items = modMenuItems(x);
      const b = more.getBoundingClientRect();
      showCtx({ clientX: b.left - 160, clientY: b.bottom + 4, preventDefault() {} }, items.length ? [{ html: `<div class="ctx-label">${esc(x.name)}</div>` }, ...items] : [{ html: '<div class="ctx-note">Bu kişi için yapabileceğin bir işlem yok.</div>' }]);
    });
    table.append(
      h(
        'div',
        { class: `ss-tr ${x.online ? '' : 'offline'}`, oncontextmenu: (e) => (e.preventDefault(), more.click()) },
        cell1,
        rc,
        h('div', {}, chCell),
        showIp ? h('span', { class: 'ss-mono muted' }, x.ip || '—') : null,
        h('span', { class: 'muted' }, x.connectedAt ? fmtDuration(SS.info.now - x.connectedAt) : '—'),
        me ? h('span') : more
      )
    );
  }
  box.replaceChildren(table, h('p', { class: 'ss-mini-hint' }, 'Rolü ya da susturması olan kişiler çevrimdışıyken de listede kalır. Satıra sağ tıklayarak da işlem yapabilirsin.'));
}
$('#ss-member-q').addEventListener('input', (e) => {
  SS.memberQ = e.target.value;
  renderMembersPane(true);
});
$$('#ss-member-filter button').forEach((b) =>
  b.addEventListener('click', () => {
    SS.memberFilter = b.dataset.f;
    $$('#ss-member-filter button').forEach((x) => x.classList.toggle('active', x === b));
    renderMembersPane(true);
  })
);

// ---------- Kanallar ----------
function renderChannelsPane(force = false) {
  const box = $('#ss-channels');
  $('#ss-ch-create').classList.toggle('hidden', !can('manageChannels'));
  const counts = {};
  for (const u of S.users.values()) if (u.channelId) counts[u.channelId] = (counts[u.channelId] || 0) + 1;
  const sig = [S.channels, counts, S.afk];
  if (!force && !ssChanged('channels', sig, box)) return;
  SS.sigs.channels = JSON.stringify(sig);
  const row = (ch, depth) => {
    const text = ch.type === 'text';
    const n = counts[ch.id] || 0;
    const tags = [];
    if (ch.locked) tags.push(h('span', { class: 'ss-tag' }, '🔒 şifreli'));
    if (ch.limit) tags.push(h('span', { class: 'ss-tag' }, `👥 en fazla ${ch.limit}`));
    if (ch.slowmode) tags.push(h('span', { class: 'ss-tag' }, `🐢 yavaş mod ${fmtLeft(ch.slowmode * 1000)}`));
    if (ch.readOnly) tags.push(h('span', { class: 'ss-tag' }, '👁 salt okunur'));
    if (ch.header) tags.push(h('span', { class: 'ss-tag' }, '📁 başlık · girilemez'));
    if (S.afk?.channelId === ch.id) tags.push(h('span', { class: 'ss-tag' }, '💤 AFK'));
    const ico = h('span', { class: 'ss-ch-ico' });
    ico.innerHTML = text ? ICON_HASH : ICON.channel;
    const acts = h('div', { class: 'ss-ch-acts' });
    if (can('manageChannels')) acts.append(h('button', { class: 'btn sm', onclick: () => channelSettings(ch) }, 'Düzenle'));
    if (!text && can('moveMembers') && n) {
      const b = h('button', { class: 'btn sm' }, `Hepsini taşı (${n})`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const rc = b.getBoundingClientRect();
        showCtx({ clientX: rc.left, clientY: rc.bottom + 4, preventDefault() {} }, [
          { html: `<div class="ctx-label">${esc(ch.name)} kanalındaki ${n} kişiyi taşı</div>` },
          ...S.channels.filter((c) => c.type !== 'text' && c.id !== ch.id).map((c) => ({ label: c.name, run: () => send({ t: 'moveAll', from: ch.id, channelId: c.id }) })),
          '-',
          { label: '⏏ Hepsini sesten çıkar', danger: true, run: () => send({ t: 'moveAll', from: ch.id, channelId: null }) },
        ]);
      });
      acts.append(b);
    }
    if (can('manageMessages') && feat('purge')) acts.append(h('button', { class: 'btn sm', onclick: () => purgeForm(ch) }, 'Temizle'));
    if (can('manageChannels'))
      acts.append(
        h(
          'button',
          { class: 'btn sm danger-ghost', onclick: () => confirmBox(`${text ? '#' : ''}${ch.name} silinsin mi?`, text ? 'Kanal ve tüm mesaj geçmişi herkes için silinir.' : 'Kanal, alt kanalları ve sohbeti silinir. İçindekiler Lobi’ye geçer.', 'Sil', () => send({ t: 'deleteChannel', channelId: ch.id })) },
          'Sil'
        )
      );
    const el = h(
      'div',
      { class: 'ss-ch-row', style: `--depth:${depth}`, oncontextmenu: (e) => (e.preventDefault(), showCtx(e, text ? textChannelMenuItems(ch) : channelMenuItems(ch))) },
      ico,
      h('div', { class: 'ss-ch-text' }, h('div', { class: 'ss-ch-name' }, ch.name, !text && n ? h('span', { class: 'ss-ch-n' }, `${n} kişi`) : null), ch.topic ? h('div', { class: 'ss-ch-topic' }, ch.topic) : null, tags.length ? h('div', { class: 'ss-ch-tags' }, ...tags) : null),
      acts
    );
    return el;
  };
  const voice = h('div', { class: 'ss-card flush' }, h('h3', {}, 'Ses kanalları'));
  const walk = (parent, depth) => {
    for (const ch of childrenOf(parent)) {
      voice.append(row(ch, depth));
      walk(ch.id, depth + 1);
    }
  };
  walk(null, 0);
  const texts = S.channels.filter((c) => c.type === 'text').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const text = h('div', { class: 'ss-card flush' }, h('h3', {}, 'Yazı kanalları'));
  if (!texts.length) text.append(h('div', { class: 'ss-empty' }, 'Yazı kanalı yok.'));
  for (const ch of texts) text.append(row(ch, 0));
  box.replaceChildren(text, voice);
}
$('#ss-ch-create').addEventListener('click', () => createChannelForm());

// ---------- Yasaklılar ----------
function renderBansPane(force = false) {
  const box = $('#ss-bans');
  const bans = SS.info?.bans;
  if (!bans) return box.replaceChildren(h('p', { class: 'hint' }, 'Yükleniyor…'));
  if (!force && !ssChanged('bans', bans, box)) return;
  SS.sigs.bans = JSON.stringify(bans);
  if (!bans.length) return box.replaceChildren(h('div', { class: 'ss-empty big' }, h('div', { class: 'ss-empty-ico' }, '🕊️'), 'Yasaklı kimse yok. Huzurlu bir sunucu!'));
  box.replaceChildren(
    ...bans.map((b) =>
      h(
        'div',
        { class: 'ss-ban-row' },
        avatar(b.name),
        h('div', { class: 'ss-ban-text' }, h('b', {}, b.name), h('small', {}, `${new Date(b.at).toLocaleDateString('tr-TR')} · ${b.by}${b.reason ? ' · “' + b.reason + '”' : ''}${b.ip ? ' · IP yasağı' : ''}`)),
        h('button', { class: 'btn sm', onclick: () => (send({ t: 'unban', id: b.id }), setTimeout(refreshAdmin, 300)) }, 'Yasağı kaldır')
      )
    )
  );
}

// ---------- Denetim kaydı ----------
const AUDIT = {
  kick: ['⛔', 'sunucudan attı', 'red'],
  ban: ['🔨', 'yasakladı', 'red'],
  unban: ['🕊️', 'yasağını kaldırdı', 'green'],
  timeout: ['⏳', 'zaman aşımı verdi', 'amber'],
  untimeout: ['⌛', 'zaman aşımını kaldırdı', 'green'],
  serverMute: ['🔇', 'sunucuda susturdu', 'amber'],
  serverUnmute: ['🎙️', 'sunucu susturmasını kaldırdı', 'green'],
  serverDeafen: ['🔕', 'sunucuda sağırlaştırdı', 'amber'],
  serverUndeafen: ['🔔', 'sağırlaştırmayı kaldırdı', 'green'],
  forceMute: ['🔇', 'mikrofonunu kapattı', 'amber'],
  move: ['➡️', 'taşıdı', ''],
  disconnect: ['⏏', 'sesten çıkardı', 'amber'],
  moveAll: ['⏩', 'herkesi taşıdı', ''],
  disconnectAll: ['⏏', 'herkesi sesten çıkardı', 'amber'],
  purge: ['🧹', 'sohbeti temizledi', 'red'],
  messageDelete: ['🗑️', 'mesajını sildi', 'red'],
  pin: ['📌', 'mesajını sabitledi', ''],
  unpin: ['📌', 'sabitlemeyi kaldırdı', ''],
  roleCreate: ['🛡️', 'rol oluşturdu', 'green'],
  roleUpdate: ['🛡️', 'rolü düzenledi', ''],
  roleDelete: ['🛡️', 'rolü sildi', 'red'],
  roleOrder: ['↕️', 'rollerin sırasını değiştirdi', ''],
  memberRoles: ['🏷️', 'rollerini değiştirdi', ''],
  channelCreate: ['➕', 'kanal oluşturdu', 'green'],
  channelRename: ['✏️', 'kanalı yeniden adlandırdı', ''],
  channelUpdate: ['⚙️', 'kanal ayarlarını değiştirdi', ''],
  channelDelete: ['➖', 'kanalı sildi', 'red'],
  serverUpdate: ['🏠', 'sunucu ayarlarını değiştirdi', ''],
  configUpdate: ['⚙️', 'sunucu ayarlarını değiştirdi', ''],
  announce: ['📣', 'duyuru yayınladı', ''],
};
function renderAuditPane() {
  const act = $('#ss-audit-act');
  const by = $('#ss-audit-by');
  if (document.activeElement !== act) {
    const used = [...new Set(SS.audit.map((e) => e.action))];
    act.replaceChildren(h('option', { value: '' }, 'Tüm işlemler'), ...used.map((a) => h('option', { value: a }, `${AUDIT[a]?.[0] || '•'} ${AUDIT[a]?.[1] || a}`)));
    act.value = used.includes(SS.auditAct) ? SS.auditAct : '';
  }
  if (document.activeElement !== by) {
    const names = [...new Set(SS.audit.map((e) => e.by))].sort((a, b) => a.localeCompare(b, 'tr'));
    by.replaceChildren(h('option', { value: '' }, 'Herkes'), ...names.map((n) => h('option', { value: n }, n)));
    by.value = names.includes(SS.auditBy) ? SS.auditBy : '';
  }
  renderAuditList();
}
function renderAuditList() {
  const box = $('#ss-audit');
  const q = trLower(SS.auditQ.trim());
  const list = SS.audit.filter((e) => (!SS.auditAct || e.action === SS.auditAct) && (!SS.auditBy || e.by === SS.auditBy) && (!q || trLower(`${e.by} ${e.target} ${e.detail} ${AUDIT[e.action]?.[1] || ''}`).includes(q)));
  if (!SS.audit.length) return box.replaceChildren(h('div', { class: 'ss-empty big' }, h('div', { class: 'ss-empty-ico' }, '📋'), 'Henüz kayıt yok. Atma, yasaklama, rol ve kanal değişiklikleri burada görünür (sunucu açık kaldığı sürece).'));
  if (!list.length) return box.replaceChildren(h('div', { class: 'ss-empty' }, 'Filtreye uyan kayıt yok.'));
  box.replaceChildren(
    ...list.slice(0, 300).map((e) => {
      const [ico, verb, tone] = AUDIT[e.action] || ['•', e.action, ''];
      const d = new Date(e.ts);
      const byColor = roleColorByName(e.by);
      return h(
        'div',
        { class: `ss-audit-row ${tone}` },
        h('span', { class: 'ss-audit-ico' }, ico),
        h(
          'div',
          { class: 'ss-audit-text' },
          h('div', {}, h('b', { style: byColor ? `color:${byColor}` : '' }, e.by), ` ${verb}`, e.target ? h('span', {}, ': ', h('b', {}, e.target)) : null),
          e.detail ? h('div', { class: 'ss-audit-detail' }, e.detail) : null
        ),
        h('span', { class: 'ss-audit-time', title: d.toLocaleString('tr-TR') }, `${dayLabel(e.ts)} ${hhmm(e.ts)}`)
      );
    })
  );
}
$('#ss-audit-q').addEventListener('input', (e) => {
  SS.auditQ = e.target.value;
  renderAuditList();
});
$('#ss-audit-act').addEventListener('change', (e) => {
  SS.auditAct = e.target.value;
  renderAuditList();
});
$('#ss-audit-by').addEventListener('change', (e) => {
  SS.auditBy = e.target.value;
  renderAuditList();
});

// ---------- Bağlantı (adresler, yönetici anahtarı, sunucuyu kapat) ----------
async function renderConnection() {
  let st = { hosting: false };
  try {
    st = await kanki.serverStatus();
  } catch {}
  const hostingHere = !!(st.hosting && S.hosting);
  $('#adm-host-section').classList.toggle('hidden', !hostingHere || !S.isAdmin);
  const box = $('#adm-addresses');
  const sig = JSON.stringify([hostingHere, st.tunnelUrl, st.addresses, st.port, S.url]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
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
    for (const a of st.addresses || []) addAddr(`${a.address}:${st.port}`, 'yerel ağ');
    if (!st.tunnelUrl) box.append(h('div', { class: 'muted', style: 'font-size:12px;width:100%' }, 'İnternetten bağlanılabilmesi için sunucuyu "İnternete aç (ngrok)" seçeneğiyle başlat.'));
  } else {
    addAddr(S.url.replace(/^wss?:\/\//, ''), 'bağlı olduğun sunucu');
  }
}
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
$('#btn-admin').addEventListener('click', () => openAdminPanel());
