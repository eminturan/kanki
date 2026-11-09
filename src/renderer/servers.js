// =====================================================================
//  Giriş (sadece kullanıcı adı) · sol sunucu çubuğu · ana sayfa (sunucu kartları)
//  Sunucular settings.servers içinde: { address, password, adminKey?, name }
//  Kanki Admin'in kendi sunucusu listede ayrıca "bu bilgisayar" olarak durur (settings.host).
// =====================================================================
const SV = { info: new Map(), timer: null, pendingInvite: null };
const HOST_ID = '__host__';
const svIsWeb = () => !!kanki.web;

// Sunucu simgesi: adın baş harfleri + addan türeyen iki renkli geçiş
const SV_GRADS = [['#7c4dff', '#ff5cd0'], ['#22d47e', '#3d8bfd'], ['#f5b83d', '#ff7a59'], ['#2dd4bf', '#4c9bff'], ['#ff5a69', '#f5b83d'], ['#a78bfa', '#4c9bff'], ['#34d399', '#a3e635'], ['#fb7185', '#c084fc']];
function svInitials(name) {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const t = w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2);
  return t.toLocaleUpperCase('tr');
}
function svGrad(name) {
  let x = 0;
  for (const c of String(name || '?')) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = SV_GRADS[x % SV_GRADS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
// Sunucu resmi: sunucudan sadece sürüm (iconV) gelir; resim değişince bir kez /icon'dan indirilip burada saklanır
const SV_ICON_KEY = 'kanki-server-icons';
let svIcons = {};
try {
  svIcons = JSON.parse(localStorage.getItem(SV_ICON_KEY) || '{}') || {};
} catch {}
const svIconOf = (id) => (id && svIcons[id]?.data) || '';
const svIconLoading = new Set();
async function svSyncIcon(e, v) {
  if (!e?.id) return;
  v = Number(v) || 0;
  const have = svIcons[e.id];
  if ((have?.v || 0) === v) return;
  if (!v) {
    delete svIcons[e.id];
    return svIconsChanged();
  }
  const base = svHttp(e);
  if (!base || svIconLoading.has(e.id)) return;
  svIconLoading.add(e.id);
  try {
    const r = await fetch(`${base}/icon?v=${v}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
    const blob = r.ok ? await r.blob() : null;
    if (!blob || !/^image\//.test(blob.type) || blob.size > 400000) return;
    const data = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    svIcons[e.id] = { v, data };
    svIconsChanged();
  } catch {
  } finally {
    svIconLoading.delete(e.id);
  }
}
function svIconsChanged() {
  try {
    localStorage.setItem(SV_ICON_KEY, JSON.stringify(svIcons));
  } catch {}
  renderRail();
  if (!$('#home-screen').classList.contains('hidden')) renderHome();
  if (S.myId) renderServerBadge();
}
// Bir öğeye sunucu resmini (yoksa baş harfler + renk geçişini) koyar
function svPaint(el, id, name) {
  const img = svIconOf(id);
  el.classList.toggle('has-icon', !!img);
  el.style.background = img ? `center / cover no-repeat url("${img}")` : svGrad(name);
}
// Bağlı olduğun sunucunun sol çubuktaki kimliği (Admin'in kendi sunucusu dahil)
function svCurrentEntry() {
  const id = svCurrentId();
  return id ? svEntries().find((x) => x.id === id) : null;
}
const svUrl = (e) => (e.id === HOST_ID ? (S.hosting ? `ws://127.0.0.1:${S.hosting.port}` : '') : normalizeAddress(e.address || '') || '');
const svHttp = (e) => svUrl(e).replace(/^ws/i, 'http');

// ---------- Liste ----------
function svMigrate() {
  if (Array.isArray(settings.servers)) return;
  settings.servers = (settings.recent || []).map((r) => ({ address: r.address, password: r.password || '', adminKey: r.adminKey || '', name: r.name || '' }));
  saveSettings();
}
function svEntries() {
  const list = (settings.servers || []).map((x) => ({ ...x, id: x.address }));
  if (S.variant === 'admin' && settings.host) list.unshift({ id: HOST_ID, name: settings.host.name || 'Benim sunucum', address: '', host: true });
  return list;
}
// enterApp başarılı olunca çağrılır (app.js)
function serversRemember(address, password, name) {
  if (!address) return;
  svMigrate();
  const old = settings.servers.find((x) => x.address === address);
  const entry = { address, password: password || '', adminKey: S.variant === 'admin' ? S.adminKey || old?.adminKey || '' : '', name: name || old?.name || '' };
  settings.servers = old ? settings.servers.map((x) => (x === old ? entry : x)) : [...settings.servers, entry];
  saveSettings();
}
function svCurrentId() {
  if (!S.myId || !S.url) return null;
  if (S.hosting && /^ws:\/\/127\.0\.0\.1:/.test(S.url)) return HOST_ID;
  const e = (settings.servers || []).find((x) => normalizeAddress(x.address) === S.url);
  return e ? e.address : null;
}

// ---------- Ekranlar ----------
function svShow(which) {
  // which: 'login' | 'home' | 'app' | 'connect'
  const web = svIsWeb();
  $('#login-screen').classList.toggle('hidden', which !== 'login');
  $('#home-screen').classList.toggle('hidden', which !== 'home');
  $('#connect-screen').classList.toggle('hidden', which !== 'connect');
  $('#app').classList.toggle('hidden', which !== 'app');
  const railOn = !web && which !== 'login';
  $('#rail').classList.toggle('hidden', !railOn);
  document.body.classList.toggle('has-rail', railOn);
  document.body.classList.toggle('on-home', which === 'home');
  if (which === 'home') renderHome();
  renderRail();
  renderMeBar();
  syncVoicePanel();
}
function showHome() {
  svShow('home');
  svPoll();
}
function showApp() {
  if (!S.myId) return showHome();
  svShow('app');
  renderAll();
}

// ---------- Giriş ----------
function svLoginRender() {
  const v = $('#login-name').value.trim();
  const av = $('#login-av');
  av.textContent = v ? v.charAt(0).toLocaleUpperCase('tr') : '?';
  av.style.background = v ? colorFor(v) : '';
}
$('#login-name').addEventListener('input', () => {
  $('#login-error').textContent = '';
  svLoginRender();
});
$('#login-name').addEventListener('keydown', (e) => e.key === 'Enter' && svLoginGo());
$('#login-go').addEventListener('click', () => svLoginGo());
function svLoginGo() {
  const name = $('#login-name').value.trim();
  if (!name) {
    $('#login-error').textContent = 'Bir kullanıcı adı yaz.';
    return $('#login-name').focus();
  }
  settings.nick = name;
  saveSettings();
  $('#in-nick').value = name;
  if (svIsWeb()) {
    svShow('connect');
    return doConnect();
  }
  if (SV.pendingInvite) {
    const p = SV.pendingInvite;
    SV.pendingInvite = null;
    showHome();
    return handleInvite(p);
  }
  showHome();
}

// ---------- Sol çubuk ----------
function railIcon(e) {
  const cur = svCurrentId() === e.id;
  const inf = SV.info.get(e.id);
  const name = e.name || inf?.name || e.address;
  const b = h('button', { class: `ri ri-srv ${cur && $('#home-screen').classList.contains('hidden') ? 'on' : ''} ${cur ? 'cur' : ''}`, 'data-id': e.id }, svIconOf(e.id) ? '' : svInitials(name));
  svPaint(b, e.id, name);
  const online = cur ? [...S.users.values()].filter((u) => !u.bot).length : inf?.online;
  if (inf && inf.ok === false && !cur) b.append(h('span', { class: 'ri-off' }));
  else if (online) b.append(h('span', { class: 'ri-cnt' }, String(online)));
  b.addEventListener('click', () => svOpen(e));
  b.addEventListener('contextmenu', (ev) => svMenu(ev, e));
  b.addEventListener('mouseenter', () => svTip(b, e));
  b.addEventListener('mouseleave', () => $('#rail-tip').classList.add('hidden'));
  return b;
}
function renderRail() {
  if ($('#rail').classList.contains('hidden')) return;
  const onHome = !$('#home-screen').classList.contains('hidden');
  $('#rail-home').classList.toggle('on', onHome);
  $('#rail-list').replaceChildren(...svEntries().map(railIcon));
  $('#rail-host').classList.toggle('hidden', S.variant !== 'admin');
}
function svStatusText(e) {
  const cur = svCurrentId() === e.id;
  if (cur) return `Buradasın · ${[...S.users.values()].filter((u) => !u.bot).length} kişi`;
  if (e.id === HOST_ID && !S.hosting) return 'Kapalı · başlatmak için tıkla';
  const inf = SV.info.get(e.id);
  if (!inf) return 'Bakılıyor…';
  if (inf.ok === false) return inf.old ? 'Eski sürüm · bilgi yok' : 'Ulaşılamıyor';
  return inf.online ? `${inf.online} kişi çevrimiçi${inf.live ? ` · ${inf.live} canlı yayın` : ''}` : 'Kimse yok';
}
function svTip(el, e) {
  const tip = $('#rail-tip');
  const r = el.getBoundingClientRect();
  tip.replaceChildren(h('b', {}, e.name || SV.info.get(e.id)?.name || e.address), h('small', {}, svStatusText(e)));
  tip.style.top = `${r.top + r.height / 2}px`;
  tip.style.left = `${r.right + 12}px`;
  tip.classList.remove('hidden');
}
$('#rail-home').addEventListener('click', () => showHome());
$('#rail-add').addEventListener('click', () => svAddForm());
$('#rail-host').addEventListener('click', () => svHostForm());

// ---------- Sunucuya gir / geç ----------
let svJoining = false;
async function svOpen(e, again = false) {
  if (svJoining) return;
  if (svCurrentId() === e.id && !again) return showApp();
  if (S.ws) disconnect();
  svJoining = true;
  try {
    if (e.id === HOST_ID) {
      // Admin'in kendi sunucusu: çalışıyorsa bağlan, değilse kayıtlı ayarlarla başlat
      if (S.hosting) await enterApp(`ws://127.0.0.1:${S.hosting.port}`, $('#in-host-password').value, null);
      else await doHost();
      return;
    }
    $('#in-address').value = e.address;
    $('#in-password').value = e.password || '';
    $('#in-admin-key').value = e.adminKey || '';
    toast(`${e.name || e.address} sunucusuna bağlanılıyor…`, '', '', 2500);
    await doConnect();
  } finally {
    svJoining = false;
    renderRail();
  }
}

// ---------- Ana sayfa ----------
function renderHome() {
  const nick = settings.nick || '';
  const av = $('#home-av');
  av.replaceWith(Object.assign(avatar(nick || '?', 'home-av'), { id: 'home-av' }));
  $('#home-title').textContent = nick ? `Selam ${nick} 👋` : 'Selam 👋';
  const list = svEntries();
  $('#home-sub').textContent = list.length ? 'Bir sunucuya tıkla, hemen içeri gir. Sol çubuktan da geçebilirsin.' : 'Henüz bir sunucun yok. Arkadaşının verdiği adresi ya da davet bağlantısını ekle.';
  const grid = $('#home-grid');
  grid.replaceChildren(...list.map(svCard), svAddCard());
}
function svCard(e) {
  const inf = SV.info.get(e.id);
  const cur = svCurrentId() === e.id;
  const name = e.name || inf?.name || e.address;
  const grad = svGrad(name);
  const people = cur ? [...S.users.values()].filter((u) => !u.bot).map((u) => u.name) : inf?.names || [];
  const online = cur ? people.length : inf?.online || 0;
  const live = cur ? [...S.users.values()].reduce((n, u) => n + screenSharesOf(u).length, 0) : inf?.live || 0;
  const off = e.id === HOST_ID ? !S.hosting : inf && inf.ok === false;
  const card = h('div', { class: `srv-card ${live ? 'is-live' : ''} ${cur ? 'is-cur' : ''}` });
  const banner = h('div', { class: 'srv-banner' });
  banner.style.background = grad;
  const ic = h('div', { class: 'srv-ic' }, svIconOf(e.id) ? '' : svInitials(name));
  svPaint(ic, e.id, name);
  if (svIconOf(e.id)) banner.style.background = `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), center / cover no-repeat url("${svIconOf(e.id)}")`;
  const badge = cur
    ? h('span', { class: 'srv-badge here' }, '● Buradasın')
    : live
      ? h('span', { class: 'srv-badge live' }, `● ${live} canlı yayın`)
      : e.id === HOST_ID
        ? h('span', { class: 'srv-badge own' }, '👑 Senin sunucun')
        : null;
  const status = off
    ? h('div', { class: 'srv-st' }, h('span', { class: 'd off' }), e.id === HOST_ID ? 'Kapalı' : inf?.old ? 'Bilgi yok (eski sürüm)' : 'Ulaşılamıyor')
    : h('div', { class: 'srv-st' }, h('span', { class: 'd' }), inf || cur ? (online ? `${online} kişi çevrimiçi` : 'Şu an kimse yok') : 'Bakılıyor…');
  const who = h('div', { class: 'srv-who' });
  if (people.length) {
    for (const n of people.slice(0, 5)) who.append(avatar(n, 'srv-wa'));
    who.append(h('span', {}, people.slice(0, 3).join(', ') + (people.length > 3 ? ` +${people.length - 3}` : '')));
  } else if (e.id === HOST_ID && !S.hosting) who.append(h('span', {}, 'Başlatınca arkadaşların girebilir'));
  else if (inf?.locked && online) who.append(h('span', {}, '🔒 Şifreli sunucu'));
  const go = h('button', { class: 'btn primary', onclick: () => svOpen(e) }, cur ? 'Geri dön' : e.id === HOST_ID && !S.hosting ? 'Başlat ve gir' : 'Gir');
  const more = h('button', { class: 'btn srv-more', title: 'Diğer', onclick: (ev) => svMenu(ev, e) }, '⋯');
  card.append(
    banner,
    ...(badge ? [badge] : []),
    h('div', { class: 'srv-head' }, ic),
    h('h3', {}, name),
    h('div', { class: 'srv-addr' }, e.id === HOST_ID ? `bu bilgisayar${S.hosting ? ` · port ${S.hosting.port}` : ''}` : e.address),
    status,
    who,
    h('div', { class: 'srv-row' }, go, more)
  );
  return card;
}
function svAddCard() {
  return h(
    'button',
    { class: 'srv-card srv-add', onclick: () => svAddForm() },
    h('div', { class: 'srv-plus' }, '+'),
    h('b', {}, 'Sunucu ekle'),
    h('div', { class: 'muted' }, 'Arkadaşının verdiği adresi ya da davet bağlantısını yapıştır')
  );
}

// ---------- Sunucu ekle / düzenle / kaldır ----------
function svParseInput(v) {
  v = String(v || '').trim();
  // Davet bağlantısı: kanki://join?d=… ya da kanki-app.github.io/join#d=… / ?d=…
  const m = /[?#&]d=([A-Za-z0-9_-]+)/.exec(v) || /^kanki:\/\/join\/([A-Za-z0-9_-]+)/i.exec(v);
  if (m) {
    try {
      const d = JSON.parse(fromB64url(m[1]));
      if (d?.a) return { address: d.a, password: d.p || '', name: d.n || '' };
    } catch {}
  }
  return { address: v.replace(/^https?:\/\//i, '').replace(/\/+$/, ''), password: '', name: '' };
}
function svAddForm() {
  formModal({
    title: 'Sunucu ekle',
    desc: 'Arkadaşının verdiği adresi (ör. isim.ngrok-free.dev ya da 192.168.1.20:4455) ya da davet bağlantısını yapıştır.',
    fields: [
      { key: 'addr', label: 'Adres ya da davet bağlantısı', placeholder: 'isim.ngrok-free.dev', max: 600 },
      { key: 'pw', label: 'Sunucu şifresi (varsa)', type: 'password', max: 100 },
    ],
    submit: 'Ekle ve gir',
    onSubmit: (v) => {
      const p = svParseInput(v.addr);
      if (!p.address || !normalizeAddress(p.address)) {
        toast('Geçerli bir adres yaz', '', 'err');
        return false;
      }
      if (v.pw) p.password = v.pw;
      svMigrate();
      if (!settings.servers.some((x) => x.address === p.address)) settings.servers.push({ address: p.address, password: p.password, adminKey: '', name: p.name });
      else settings.servers = settings.servers.map((x) => (x.address === p.address ? { ...x, password: p.password || x.password } : x));
      saveSettings();
      svFetchInfo({ id: p.address, address: p.address });
      svOpen({ id: p.address, address: p.address, password: p.password, name: p.name });
    },
  });
}
function svMenu(ev, e) {
  ev.preventDefault?.();
  const items = [];
  if (svCurrentId() === e.id) items.push({ label: 'Sunucudan çık', run: () => disconnect() }, '-');
  if (e.id === HOST_ID) items.push({ label: 'Sunucu ayarları (port, ngrok)…', run: () => svHostForm() });
  else {
    items.push({ label: 'Adresi kopyala', run: () => (navigator.clipboard.writeText(e.address), toast('Adres kopyalandı', e.address)) });
    items.push({
      label: 'Şifreyi değiştir…',
      run: () =>
        inlinePrompt('Sunucu şifresi', e.password || '', (pw) => {
          settings.servers = settings.servers.map((x) => (x.address === e.address ? { ...x, password: pw } : x));
          saveSettings();
        }, true),
    });
    items.push('-');
    items.push({
      label: 'Listeden kaldır',
      danger: true,
      run: () => {
        if (svCurrentId() === e.id) disconnect();
        settings.servers = settings.servers.filter((x) => x.address !== e.address);
        SV.info.delete(e.id);
        saveSettings();
        renderRail();
        if (!$('#home-screen').classList.contains('hidden')) renderHome();
      },
    });
  }
  const r = ev.currentTarget?.getBoundingClientRect?.();
  showCtx(r ? { clientX: r.left, clientY: r.bottom + 4, preventDefault() {} } : ev, items);
}
// Admin: sunucu kurma ayarları eski bağlanma ekranının "Sunucu Kur" sekmesinde
function svHostForm() {
  svShow('connect');
  $('.tab[data-tab="host"]')?.click();
}

// ---------- Sunucu kartı bilgisi (/info) ----------
async function svFetchInfo(e) {
  const base = svHttp(e);
  if (!base) return;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`${base}/info`, { headers: { 'ngrok-skip-browser-warning': '1' }, signal: ctl.signal, cache: 'no-store' });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('json')) {
      // Eski sürüm sunucu /info bilmez ama ayakta: "çalışıyor" yazısı döner
      SV.info.set(e.id, r.ok || r.status === 404 ? { ok: false, old: true } : { ok: false });
    } else {
      const d = await r.json();
      SV.info.set(e.id, { ok: true, ...d });
      if ('iconV' in d) svSyncIcon(e, d.iconV);
      // Kayıtlı adı güncel tut
      if (d.name && e.id !== HOST_ID) {
        const s = (settings.servers || []).find((x) => x.address === e.address);
        if (s && s.name !== d.name) {
          s.name = d.name;
          saveSettings();
        }
      }
    }
  } catch {
    SV.info.set(e.id, { ok: false });
  } finally {
    clearTimeout(t);
  }
}
async function svPoll() {
  if (svIsWeb() || $('#rail').classList.contains('hidden')) return;
  await Promise.all(svEntries().filter((e) => svCurrentId() !== e.id && (e.id !== HOST_ID || S.hosting)).map(svFetchInfo));
  renderRail();
  if (!$('#home-screen').classList.contains('hidden')) renderHome();
}
setInterval(svPoll, 30000);

// ---------- Profil çubuğu (sol altta tek, geniş) ----------
function renderMeBar() {
  if (S.myId) return; // bağlıyken app.js çizer
  const nick = settings.nick || '';
  const av = $('#me-avatar');
  if (av) {
    av.textContent = (nick || '?').charAt(0).toLocaleUpperCase('tr');
    av.style.background = colorFor(nick || '?');
    if (settings.avatar) {
      av.textContent = '';
      av.style.backgroundImage = `url("${settings.avatar}")`;
      av.classList.add('has-img');
    }
  }
  const nm = $('#me-name');
  if (nm) nm.textContent = nick;
  const st = $('#me-status');
  if (st) st.textContent = 'Bir sunucuya gir';
}

// ---------- Ayarlar › Profilim: kullanıcı adını değiştir ----------
function svSaveNick() {
  const inp = $('#set-nick');
  const name = inp.value.trim();
  if (!name) return (inp.value = settings.nick || '');
  if (name === settings.nick) return;
  settings.nick = name;
  saveSettings();
  $('#in-nick').value = name;
  renderMeBar();
  if (!S.myId) return toast('Kullanıcı adın değişti', name);
  // Bağlıyken yeni ad ancak yeniden girince görünür: aynı sunucuya hemen yeniden gir
  const cur = svCurrentId();
  const e = svEntries().find((x) => x.id === cur);
  toast('Kullanıcı adın değişti', 'Sunucuya yeni adınla yeniden giriliyor…', '', 3000);
  if (e) svOpen(e, true);
}
$('#set-nick')?.addEventListener('change', svSaveNick);
$('#set-nick')?.addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
document.addEventListener('click', (e) => e.target.closest('.snav[data-pane="profile"], #btn-settings') && setTimeout(() => ($('#set-nick').value = settings.nick || ''), 30));

// ---------- Açılış ----------
function serversBoot(info) {
  svMigrate();
  // Sol alttaki kart (Discord gibi): üstte ses bağlantısı, altta profil; çubuğun ve kanalların altına yayılır
  const me = $('.me-panel');
  const voice = $('.voice-panel');
  if (me && voice && !svIsWeb()) {
    const dock = h('div', { id: 'me-bar', class: 'me-dock' });
    dock.append(voice, me);
    document.body.append(dock);
    // Ses efektleri ve birlikte izle de bu karttan açılır
    const acts = voice.querySelector('.voice-actions');
    const mk = (id, title, icon, run) => {
      const b = h('button', { class: 'btn share icon-only', id, title, onclick: run });
      b.innerHTML = icon;
      return b;
    };
    acts.append(
      mk('dock-sfx', 'Ses efektleri', ICON_SFX, (e) => {
        e.stopPropagation();
        $('#cb-sfx').click();
      }),
      mk('dock-watch', 'Birlikte izle', ICON_WATCH, () => $('#cb-watch').click())
    );
    // Kartın yüksekliği kadar kanal listesi ve çubuk alttan boşluk bırakır
    new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)).observe(dock);
  }
  const t = kanki.autotest && !kanki.autotest.manual ? kanki.autotest : null;
  if (t?.name) settings.nick = t.name;
  if (settings.nick) $('#in-nick').value = settings.nick;
  if ($('#set-nick')) $('#set-nick').value = settings.nick || '';
  if (t) return svShow('connect'); // otomatik test: eski akış (doHost / doConnect)
  if (!settings.nick) {
    svShow('login');
    setTimeout(() => $('#login-name').focus(), 50);
    return;
  }
  if (svIsWeb()) {
    svShow('connect');
    return doConnect();
  }
  showHome();
}
