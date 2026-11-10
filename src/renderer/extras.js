'use strict';
/* Kanki ek özellikleri: Geçmiş sekmesi, sabitlenmiş mesajlar, sohbette arama, dosya gönderme, GIF, bağlantı
 * önizlemesi, anket / çark / takım kurma, oylamayla susturma, moderatörler, kanal şifresi ve kişi sınırı, AFK'ya
 * otomatik taşıma, yasaklar, oyun ve Spotify durumu, kendi kısayolların, konuşanlar katmanı, davet bağlantısı,
 * yapay zekâ gürültü engelleme, yayına işaret koyma ve birlikte izleme.
 * app.js'den sonra yüklenir; onun yardımcılarını (S, settings, h, $, send, toast…) kullanır. */

const feat = (f) => !!S.features?.has(f);
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const hhmm = (ts, sec = false) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const chName = (id) => S.channels.find((c) => c.id === id)?.name || '';
const httpBase = () => S.url.replace(/^ws/i, 'http').replace(/\/+$/, '');
const canModerate = () => can('manageMessages'); // başkasının mesajını sabitle / anketi bitir (admin.js)
const fmtClock = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

// =====================================================================
//  Genel form penceresi (anket, çark, kanal ayarları, kısayol…)
// =====================================================================
function formModal({ title, desc = '', fields = [], submit = 'Tamam', danger = false, extra = null, onSubmit }) {
  $('#fm-title').textContent = title;
  $('#fm-desc').textContent = desc;
  $('#fm-desc').classList.toggle('hidden', !desc);
  const form = $('#fm-form');
  form.innerHTML = '';
  const inputs = {};
  for (const f of fields) {
    if (!f) continue;
    let input;
    if (f.type === 'select') {
      input = h('select', {});
      for (const [v, l] of f.options) {
        const o = h('option', { value: v }, l);
        if (String(v) === String(f.value ?? '')) o.selected = true;
        input.append(o);
      }
    } else if (f.type === 'textarea') {
      input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '', maxlength: f.max || 2000 });
      input.value = f.value ?? '';
    } else if (f.type === 'check') {
      input = h('input', { type: 'checkbox' });
      input.checked = !!f.value;
      inputs[f.key] = input;
      form.append(h('label', { class: 'check fm-check' }, input, h('span', {}, f.label)));
      continue;
    } else if (f.type === 'keycapture') {
      input = h('input', { type: 'text', readonly: true, placeholder: 'Buraya tıkla ve kısayola bas' });
      input.value = f.value || '';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') return input.blur();
        if (e.key === 'Backspace' || e.key === 'Delete') return (input.value = '');
        const acc = accelFrom(e);
        if (acc === '') {
          input.value = '';
          input.placeholder = 'Ctrl, Alt ya da Shift ile birlikte bas (F tuşları tek başına olur)';
        } else if (acc) input.value = acc;
      });
    } else {
      input = h('input', { type: f.type || 'text', placeholder: f.placeholder || '', autocomplete: 'off' });
      if (f.max) input.maxLength = f.max;
      if (f.min != null) input.min = f.min;
      if (f.maxNum != null) input.max = f.maxNum;
      input.value = f.value ?? '';
    }
    inputs[f.key] = input;
    const row = h('label', { class: `field compact ${f.cls || ''}` }, h('span', {}, f.label), input, f.hint ? h('small', { class: 'fm-hint' }, f.hint) : null);
    form.append(row);
    if (f.showIf) {
      const upd = () => row.classList.toggle('hidden', !f.showIf(Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]))));
      form.addEventListener('input', upd);
      form.addEventListener('change', upd);
      queueMicrotask(upd);
    }
  }
  const actions = h('div', { class: 'prompt-actions' });
  if (extra) actions.append(h('button', { type: 'button', class: 'btn', onclick: () => (hideModal('form-modal'), extra.onClick()) }, extra.label), h('span', { class: 'grow' }));
  actions.append(h('button', { type: 'button', class: 'btn', onclick: () => hideModal('form-modal') }, 'İptal'), h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}` }, submit));
  form.append(actions);
  form.onsubmit = (e) => {
    e.preventDefault();
    const vals = {};
    for (const [k, el] of Object.entries(inputs)) vals[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (onSubmit(vals) !== false) hideModal('form-modal');
  };
  showModal('form-modal');
  setTimeout(() => form.querySelector('input:not([type=checkbox]), textarea, select')?.focus(), 40);
}

// =====================================================================
//  Geçmiş sekmesi: kim geldi, kim gitti, dürtmeler, ses efektleri, oylamalar
// =====================================================================
S.log = [];
function logEvent(icon, text, o = {}) {
  S.log.push({ ts: Date.now(), icon, text, ...o });
  if (S.log.length > 400) S.log.shift();
  if (rightTab === 'log') renderLog();
  else if (!o.dim) $('#log-dot').classList.remove('hidden');
}
function renderLog() {
  $('#log-dot').classList.add('hidden');
  const box = $('#log-list');
  box.replaceChildren(
    ...[...S.log]
      .reverse()
      .map((e) => h('div', { class: `log-row ${e.dim ? 'dim' : ''} ${e.hot ? 'hot' : ''}` }, h('span', { class: 'log-time' }, hhmm(e.ts, true)), h('span', { class: 'log-ico' }, e.icon), h('span', { class: 'log-text' }, e.text)))
  );
  if (!S.log.length) box.append(h('div', { class: 'log-empty' }, 'Henüz bir şey olmadı. Kanala gelen giden, dürtmeler, ses efektleri ve oylamalar burada saatleriyle görünür.'));
}
$('#log-clear').addEventListener('click', () => {
  S.log = [];
  renderLog();
});
function onActivity(m) {
  if (m.kind === 'move') {
    if (m.id === S.myId) {
      if (m.to) logEvent('➡️', chName(m.to) ? `${chName(m.to)} kanalına geçtin` : 'Sunucuya bağlandın', { dim: true });
      return;
    }
    if (m.to && m.to === S.channelId) logEvent('🟢', m.from ? `${m.name} kanala geldi (${chName(m.from)} kanalından)` : `${m.name} sunucuya bağlandı ve kanala geldi`);
    else if (m.from && m.from === S.channelId) logEvent('🔴', m.to ? `${m.name} kanaldan ayrıldı (${chName(m.to)} kanalına geçti)` : `${m.name} kanaldan ayrıldı`);
    else if (!m.from) logEvent('🔌', `${m.name} sunucuya bağlandı (${chName(m.to)})`, { dim: true });
    else logEvent('↔️', `${m.name}: ${chName(m.from)} → ${chName(m.to) || 'kanalsız'}`, { dim: true });
  } else if (m.kind === 'leave') {
    if (m.id === S.myId) return;
    logEvent(m.from === S.channelId ? '🔴' : '⚪', `${m.name} sunucudan ayrıldı`, { dim: m.from !== S.channelId });
  } else if (m.kind === 'kick') {
    logEvent('⛔', `${m.name} ${m.banned ? 'yasaklandı' : 'sunucudan atıldı'} (${m.by})${m.reason ? ': ' + m.reason : ''}`);
  } else if (m.kind === 'vote' && m.channelId === S.channelId) {
    logEvent('🗳️', `${m.name} için ${m.action === 'mute' ? 'susturma' : "AFK'ya gönderme"} oylaması ${m.passed ? 'kabul edildi' : 'reddedildi'}`);
  }
}

// =====================================================================
//  Sunucudan gelen yeni mesaj türleri
// =====================================================================
function onExtraMessage(m) {
  switch (m.t) {
    case 'activity':
      onActivity(m);
      break;
    case 'needPassword':
      onNeedPassword(m);
      break;
    case 'vote':
      onVote(m.vote);
      break;
    case 'voteEnd':
      onVoteEnd(m);
      break;
    case 'role':
      S.isMod = !!m.mod;
      if (feat('perms')) break; // yeni sunucu: rol değişikliğini 'perms' mesajı bildirir (admin.js)
      toast(m.mod ? 'Moderatör oldun 🛡️' : 'Moderatörlüğün alındı', m.mod ? `${m.by} seni moderatör yaptı: kişileri taşıyabilir, atabilir, mikrofonlarını kapatabilir ve mesaj sabitleyebilirsin.` : `${m.by} tarafından.`);
      renderAll();
      break;
    case 'gifResults':
      onGifResults(m);
      break;
    case 'mark':
      onMark(m);
      break;
    case 'spot':
      onPing(m);
      break;
    case 'spotSent':
      S.pingAt = Date.now();
      if (typeof m.cooldown === 'number') S.pingCd = m.cooldown;
      break;
    case 'watchCtl':
      onWatchCtl(m);
      break;
    case 'watchState':
      onWatchState(m);
      break;
    default:
      onAdminMessage(m); // roller, moderasyon, duyuru, denetim kaydı (admin.js)
  }
}

function onStateExtras(prevUsers, prevChannel) {
  const me = S.users.get(S.myId);
  S.isMod = !!me?.mod;
  if (prevChannel !== S.channelId) {
    S.lastTalkAt = Date.now();
    for (const [id, v] of S.votes) if (!S.users.get(v.targetId) || S.users.get(v.targetId).channelId !== S.channelId) S.votes.delete(id);
    renderVotes();
  }
  // Biten birlikte izleme yayınlarının durumunu unut
  for (const key of [...S.watchStates.keys()]) {
    const [uid, sid] = splitKey(key);
    if (!sharesOf(S.users.get(uid)).some((x) => x.id === sid)) S.watchStates.delete(key);
  }
  if (S.actFor !== S.myId) {
    S.actFor = S.myId;
    lastAct = '';
    setTimeout(scanActivity, 2500);
  }
  if (!S.kbApplied) {
    S.kbApplied = true;
    applyKeybinds();
  }
}

// =====================================================================
//  Sabitlenmiş mesajlar ve sohbette arama
// =====================================================================
const pinnedMsgs = () => (S.chat.get(chatChannel()) || []).filter((m) => m.pinned);
function snippet(m) {
  if (m.text) return m.text.slice(0, 160);
  if (m.image) return '📷 Resim';
  if (m.file) return `📎 ${m.file.name}`;
  if (m.gif) return 'GIF';
  if (m.poll) return `📊 ${m.poll.q}`;
  if (m.wheel) return `🎡 Çark${m.wheel.title ? ': ' + m.wheel.title : ''}`;
  if (m.teams) return '👥 Takımlar';
  return '';
}
function miniMsg(m, onclick, extraEl = null) {
  return h(
    'div',
    { class: 'mini-msg', onclick },
    h(
      'div',
      { class: 'mm-body' },
      h('div', { class: 'mm-head' }, h('b', { style: `color:${colorFor(m.name)}` }, m.name), h('span', { class: 'mm-time' }, `${dayLabel(m.ts)} ${hhmm(m.ts)}`)),
      h('div', { class: 'mm-text' }, snippet(m))
    ),
    extraEl
  );
}
function renderChatExtras() {
  const n = pinnedMsgs().length;
  $('#pin-n').textContent = n ? String(n) : '';
  $('#btn-pins').classList.toggle('has', n > 0);
  $('#btn-pins').classList.toggle('hidden', !feat('pins'));
  if (!$('#pins-pop').classList.contains('hidden')) renderPins();
  if (!$('#chat-search').classList.contains('hidden')) runSearch();
}
function renderPins() {
  const pop = $('#pins-pop');
  const list = pinnedMsgs().reverse();
  pop.replaceChildren(
    h('div', { class: 'pp-head' }, `📌 Sabitlenmiş mesajlar (${list.length})`),
    ...(list.length
      ? list.map((m) =>
          miniMsg(
            m,
            () => {
              pop.classList.add('hidden');
              jumpToMsg(m.id);
            },
            isMineMsg(m) || canModerate()
              ? h(
                  'button',
                  {
                    class: 'mm-x',
                    title: 'Sabitlemeyi kaldır',
                    onclick: (e) => {
                      e.stopPropagation();
                      send({ t: 'pin', id: m.id, on: false, channelId: chatChannel() });
                    },
                  },
                  '×'
                )
              : null
          )
        )
      : [h('div', { class: 'pp-empty' }, 'Bu kanalda sabitlenmiş mesaj yok. Bir mesaja sağ tıklayıp "Sabitle" de.')])
  );
}
$('#btn-pins').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#pins-pop');
  pop.classList.toggle('hidden');
  if (!pop.classList.contains('hidden')) renderPins();
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#pins-pop, #btn-pins')) $('#pins-pop').classList.add('hidden');
  if (!e.target.closest('#gif-pop, #btn-gif')) $('#gif-pop').classList.add('hidden');
});

function openSearch() {
  if (rightTab !== 'chat') $('.chat-tab[data-tab="chat"]').click();
  $('#chat-search').classList.remove('hidden');
  $('#search-input').focus();
  $('#search-input').select();
  runSearch();
}
function closeSearch() {
  $('#chat-search').classList.add('hidden');
  $('#search-results').classList.add('hidden');
  $('#search-input').value = '';
}
function runSearch() {
  const q = $('#search-input').value.trim();
  const box = $('#search-results');
  if (!q) return box.classList.add('hidden');
  let from = null;
  const want = [];
  const words = [];
  for (const tok of q.split(/\s+/)) {
    const fm = /^(from|kimden):(.+)$/i.exec(tok);
    const hm = /^has:(.+)$/i.exec(tok);
    if (fm) from = trLower(fm[2]);
    else if (hm) want.push(trLower(hm[1]));
    else words.push(trLower(tok));
  }
  const hasOk = (m) =>
    want.every(
      (x) =>
        (/resim|image|foto/.test(x) && m.image) ||
        (/dosya|file/.test(x) && m.file) ||
        (/link|bağlantı|baglanti/.test(x) && /https?:\/\//.test(m.text || '')) ||
        (/gif/.test(x) && m.gif) ||
        (/anket|poll/.test(x) && m.poll)
    );
  const res = (S.chat.get(chatChannel()) || [])
    .filter((m) => !m.system && (!from || trLower(m.name).includes(from)) && hasOk(m) && words.every((w) => trLower(`${m.text || ''} ${m.file?.name || ''} ${m.poll?.q || ''}`).includes(w)))
    .reverse();
  box.classList.remove('hidden');
  box.replaceChildren(
    h('div', { class: 'sr-head' }, res.length ? `${res.length} sonuç` : 'Sonuç yok'),
    ...res.slice(0, 100).map((m) =>
      miniMsg(m, () => {
        closeSearch();
        jumpToMsg(m.id);
      })
    )
  );
}
$('#btn-chat-search').addEventListener('click', () => ($('#chat-search').classList.contains('hidden') ? openSearch() : closeSearch()));
$('#search-close').addEventListener('click', closeSearch);
$('#search-input').addEventListener('input', runSearch);
$('#search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeSearch();
  }
});
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f' && S.myId && $('#settings').classList.contains('hidden')) {
    e.preventDefault();
    openSearch();
  }
});

// =====================================================================
//  Mesaj içerikleri: dosya, GIF, bağlantı önizlemesi, anket, çark, takımlar
// =====================================================================
function extraContent(m, c) {
  if (m.pinned) c.prepend(h('div', { class: 'pin-tag' }, `📌 Sabitlendi${m.pinnedBy ? ' · ' + m.pinnedBy : ''}`));
  if (m.file) c.append(fileCard(m.file));
  if (m.gif) {
    const img = h('img', { class: 'msg-img msg-gif', src: m.gif.url, alt: 'GIF', draggable: 'false', loading: 'lazy' });
    if (m.gif.w && m.gif.h) {
      img.style.aspectRatio = `${m.gif.w} / ${m.gif.h}`;
      img.style.width = `min(100%, ${m.gif.w}px, ${Math.round((220 * m.gif.w) / m.gif.h)}px)`;
    }
    img.addEventListener('click', () => openLightbox(m.gif.url, m.name));
    c.append(img);
  }
  if (m.preview && !m.gif) c.append(previewCard(m.preview));
  if (m.poll) c.append(pollCard(m));
  if (m.wheel) c.append(wheelCard(m));
  if (m.teams) c.append(teamsCard(m));
}

function fileCard(f) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1] || '').toUpperCase();
  return h(
    'div',
    { class: 'file-card' },
    h('div', { class: 'fc-ico' }, ext || 'DOSYA'),
    h('div', { class: 'fc-info' }, h('div', { class: 'fc-name', title: f.name }, f.name), h('div', { class: 'fc-meta' }, fmtBytes(f.size))),
    h('button', { type: 'button', class: 'btn sm', onclick: () => downloadFile(f) }, 'İndir')
  );
}
async function downloadFile(f) {
  try {
    const r = await kanki.downloadFile({ url: `${httpBase()}/f/${f.id}?k=${encodeURIComponent(S.token || '')}`, name: f.name });
    if (r?.ok) toast('İndirildi', r.path, '', 5000);
    else if (r?.error) toast('İndirilemedi', r.error, 'err');
  } catch (e) {
    toast('İndirilemedi', String(e.message || e), 'err');
  }
}

function previewCard(p) {
  if (p.imageOnly) {
    const img = h('img', { class: 'msg-img', src: p.image, loading: 'lazy', alt: '' });
    img.addEventListener('click', () => openLightbox(p.image, ''));
    return img;
  }
  const card = h(
    'div',
    { class: `link-card ${p.big ? 'big' : ''}` },
    h(
      'div',
      { class: 'lc-text' },
      p.site ? h('div', { class: 'lc-site' }, p.site) : null,
      p.title ? h('a', { class: 'lc-title', href: p.url, target: '_blank', rel: 'noopener' }, p.title) : null,
      p.desc ? h('div', { class: 'lc-desc' }, p.desc) : null
    )
  );
  if (p.image) {
    const img = h('img', { class: 'lc-img', src: p.image, loading: 'lazy', alt: '' });
    img.addEventListener('error', () => img.remove());
    img.addEventListener('click', () => openLightbox(p.image, p.site || ''));
    card.append(img);
  }
  return card;
}

function pollCard(m) {
  const p = m.poll;
  const total = new Set(p.options.flatMap((o) => o.votes)).size;
  const card = h('div', { class: `poll-card ${p.closed ? 'closed' : ''}` }, h('div', { class: 'poll-q' }, '📊 ' + p.q), h('div', { class: 'poll-sub' }, p.closed ? 'Anket bitti' : p.multi ? 'Birden fazla seçebilirsin' : 'Bir seçenek seç'));
  p.options.forEach((o, i) => {
    const mine = o.votes.includes(S.myName);
    const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
    card.append(
      h(
        'button',
        {
          type: 'button',
          class: `poll-opt ${mine ? 'mine' : ''}`,
          disabled: p.closed,
          title: o.votes.length ? o.votes.join(', ') : 'Henüz oy yok',
          onclick: () => send({ t: 'pollVote', id: m.id, option: i, channelId: chatChannel() }),
        },
        h('span', { class: 'po-bar', style: `width:${pct}%` }),
        h('span', { class: 'po-text' }, (mine ? '✓ ' : '') + o.text),
        h('span', { class: 'po-n' }, `${o.votes.length} · %${pct}`)
      )
    );
  });
  card.append(
    h(
      'div',
      { class: 'poll-foot' },
      h('span', {}, `${total} kişi oy verdi`),
      !p.closed && (isMineMsg(m) || canModerate()) ? h('a', { onclick: () => send({ t: 'pollClose', id: m.id, channelId: chatChannel() }) }, 'Anketi bitir') : null
    )
  );
  return card;
}

const WHEEL_COLORS = ['#22d47e', '#5865f2', '#f0b232', '#eb459e', '#3ba7f5', '#ff7a45', '#9b59b6', '#1abc9c', '#e74c3c', '#f1c40f'];
const spunWheels = new Set();
function wheelCard(m) {
  const w = m.wheel;
  const n = w.options.length;
  const seg = 360 / n;
  const size = 220;
  const cv = h('canvas', { class: 'wheel-cv', width: size * 2, height: size * 2 });
  const g = cv.getContext('2d');
  g.scale(2, 2);
  const r = size / 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i * seg * Math.PI) / 180;
    const a1 = ((i + 1) * seg * Math.PI) / 180;
    g.beginPath();
    g.moveTo(r, r);
    g.arc(r, r, r - 2, a0, a1);
    g.closePath();
    g.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    g.fill();
    // Dilim araları şeffaf: kartın rengi görünür, her temada (açık tema dahil) doğru durur
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
    g.save();
    g.translate(r, r);
    g.rotate((a0 + a1) / 2);
    g.fillStyle = '#081009';
    g.font = `600 ${n > 12 ? 9 : 11}px system-ui, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const label = w.options[i].length > 14 ? w.options[i].slice(0, 13) + '…' : w.options[i];
    g.fillText(label, r - 10, 0);
    g.restore();
  }
  // Göbek: ortası boş, tema renginde göbeği CSS çizer (.wheel-wrap::after)
  g.beginPath();
  g.arc(r, r, 14, 0, Math.PI * 2);
  g.globalCompositeOperation = 'destination-out';
  g.fill();
  g.globalCompositeOperation = 'source-over';
  // İbre üstte: sonuç dilimin ortası 270°'ye gelecek kadar döndür
  const final = 270 - (w.result + 0.5) * seg;
  const result = h('div', { class: 'wheel-result' }, `🎯 ${w.options[w.result]}`);
  const wrap = h('div', { class: 'wheel-wrap' }, h('div', { class: 'wheel-pointer' }), cv);
  const fresh = Date.now() - m.ts < 15000 && !spunWheels.has(m.id);
  spunWheels.add(m.id);
  if (fresh) {
    cv.style.transform = 'rotate(0deg)';
    result.classList.add('pending');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cv.style.transition = 'transform 4.5s cubic-bezier(.12,.7,.16,1)';
        cv.style.transform = `rotate(${final + 360 * 6}deg)`;
      })
    );
    setTimeout(() => result.classList.remove('pending'), 4600);
  } else cv.style.transform = `rotate(${final}deg)`;
  return h('div', { class: 'wheel-card' }, h('div', { class: 'poll-q' }, `🎡 ${w.title || 'Çark'}`), wrap, result);
}

function teamsCard(m) {
  const t = m.teams;
  return h(
    'div',
    { class: 'teams-card' },
    h('div', { class: 'poll-q' }, `👥 Takımlar${t.channel ? ' · ' + t.channel : ''}`),
    h(
      'div',
      { class: 'teams-grid' },
      t.teams.map((names, i) =>
        h(
          'div',
          { class: 'team', style: `--team:${WHEEL_COLORS[i % WHEEL_COLORS.length]}` },
          h('div', { class: 'team-name' }, `Takım ${i + 1}`),
          names.map((n) => h('div', { class: 'team-member' }, n))
        )
      )
    )
  );
}

// "+" düğmesi: dosya, anket, çark, takım
function attachMenu(e) {
  e.stopPropagation();
  const r = $('#btn-attach').getBoundingClientRect();
  const polls = feat('polls') && can('createPolls');
  const items = cleanItems([
    can('attachFiles') && { label: '📎 Dosya ya da resim gönder', run: () => $('#file-input').click() },
    polls && '-',
    polls && { label: '📊 Anket oluştur', run: pollForm },
    polls && { label: '🎡 Çark çevir', run: wheelForm },
    polls && S.channelId && { label: '👥 Takım kur', run: teamsForm },
  ]);
  if (items.length) showCtx({ clientX: r.left, clientY: r.top - 40 - items.length * 34, preventDefault() {} }, items);
}
const linesOf = (t) =>
  String(t || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
function pollForm() {
  formModal({
    title: '📊 Anket',
    fields: [
      { key: 'q', label: 'Soru', placeholder: 'Bu akşam hangi oyun?', max: 200 },
      { key: 'opts', label: 'Seçenekler (her satıra bir tane, 2–10)', type: 'textarea', rows: 5, placeholder: 'CS2\nValorant\nLoL' },
      { key: 'multi', label: 'Birden fazla seçenek seçilebilsin', type: 'check' },
    ],
    submit: 'Gönder',
    onSubmit: (v) => {
      const options = linesOf(v.opts);
      if (!v.q.trim() || options.length < 2) {
        toast('Anket eksik', 'Bir soru ve en az iki seçenek yaz.', 'err');
        return false;
      }
      send({ t: 'poll', question: v.q, options, multi: v.multi, channelId: chatChannel() });
    },
  });
}
function wheelForm() {
  const members = [...S.users.values()].filter((u) => u.channelId === S.channelId && !u.bot).map((u) => u.name);
  formModal({
    title: '🎡 Çark çevir',
    desc: 'Sonucu sunucu rastgele seçer; kanaldaki herkes aynı çarkın döndüğünü görür.',
    fields: [
      { key: 'title', label: 'Başlık (isteğe bağlı)', placeholder: 'Hangi oyunu oynayalım?', max: 100 },
      { key: 'opts', label: 'Seçenekler (her satıra bir tane, 2–24)', type: 'textarea', rows: 6, value: members.length > 1 ? members.join('\n') : '', placeholder: 'CS2\nValorant\nLoL\nMinecraft' },
    ],
    submit: 'Çevir',
    onSubmit: (v) => {
      const options = linesOf(v.opts);
      if (options.length < 2) {
        toast('En az iki seçenek yaz', '', 'err');
        return false;
      }
      send({ t: 'wheel', title: v.title, options, channelId: chatChannel() });
    },
  });
}
function teamsForm() {
  const n = [...S.users.values()].filter((u) => u.channelId === S.channelId && !u.bot).length;
  formModal({
    title: '👥 Takım kur',
    desc: `${chName(S.channelId)} kanalındaki ${n} kişi rastgele takımlara bölünür. Sonuç sohbete düşer.`,
    fields: [{ key: 'count', label: 'Takım sayısı', type: 'select', value: '2', options: [['2', '2 takım'], ['3', '3 takım'], ['4', '4 takım']] }],
    submit: 'Kur',
    onSubmit: (v) => send({ t: 'teams', count: Number(v.count), channelId: chatChannel() }),
  });
}

// =====================================================================
//  Dosya gönderme (sunucunun belleğinde durur, sunucu kapanınca silinir)
// =====================================================================
S.uploads = new Set();
const uploadsBox = h('div', { class: 'uploads hidden', id: 'uploads' });
$('#compose-extra').before(uploadsBox);
function renderUploads() {
  uploadsBox.replaceChildren(...[...S.uploads].map((u) => h('div', { class: 'upload-row' }, h('span', { class: 'spinner' }), h('span', { class: 'ur-name' }, u.name), h('span', { class: 'ur-meta' }, `${fmtBytes(u.size)} · yükleniyor…`))));
  uploadsBox.classList.toggle('hidden', !S.uploads.size);
}
async function uploadFile(file) {
  if (!file) return;
  if (!can('attachFiles')) return toast('Dosya gönderemezsin', 'Bu sunucuda dosya ve resim gönderme yetkin yok.', 'err');
  const blk = chatBlock();
  if (blk) return toast('Dosya gönderilemiyor', blk.text, 'err');
  if (!feat('files') || !kanki.uploadFile) return toast('Dosya gönderilemiyor', 'Bu sunucu dosya göndermeyi desteklemiyor; sunucuyu kuran kişinin Kanki Admin’i güncellemesi gerekir.', 'err');
  if (file.size > 50 * 1024 * 1024) return toast('Dosya çok büyük', 'En fazla 50 MB gönderebilirsin.', 'err');
  if (!file.size) return toast('Dosya boş', '', 'err');
  const job = { name: file.name, size: file.size };
  const channelId = chatChannel();
  const replyTo = S.replyTo?.id;
  S.uploads.add(job);
  renderUploads();
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const r = await kanki.uploadFile({ url: `${httpBase()}/upload`, token: S.token, name: file.name, type: file.type || 'application/octet-stream', data });
    if (!r || r.error) throw new Error(r?.error || 'Yüklenemedi');
    const text = $('#chat-input').value.trim();
    send({ t: 'chat', text, file: r.id, channelId, replyTo });
    if (text) {
      $('#chat-input').value = '';
      autoGrow($('#chat-input'));
    }
    S.replyTo = null;
    renderComposerExtras();
  } catch (e) {
    toast('Dosya gönderilemedi', String(e.message || e), 'err');
  } finally {
    S.uploads.delete(job);
    renderUploads();
  }
}

// =====================================================================
//  GIF arama
// =====================================================================
let gifTimer = null;
function toggleGif(force) {
  const pop = $('#gif-pop');
  const open = force ?? pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  if (open) {
    $('#gif-q').focus();
    if (!$('#gif-grid').childElementCount) gifQuery('');
  }
}
function gifInfo(text) {
  const grid = $('#gif-grid');
  grid.classList.remove('loading');
  grid.replaceChildren(h('div', { class: 'gif-info' }, text));
}
function gifQuery(q) {
  if (!feat('gif')) return gifInfo('Bu sunucu GIF aramayı desteklemiyor; sunucuyu kuran kişinin Kanki Admin’i güncellemesi gerekir.');
  $('#gif-grid').classList.add('loading');
  send({ t: 'gifSearch', q });
}
function onGifResults(m) {
  if ((m.q || '') !== $('#gif-q').value.trim()) return; // eski arama
  if (m.error === 'nokey')
    return gifInfo(can('manageServer') ? 'GIF araması için Sunucu ayarları › Genel Bakış › Sohbet bölümüne bir KLIPY (ücretsiz) ya da GIPHY anahtarı gir.' : 'GIF araması için sunucuyu yöneten kişinin Sunucu ayarları’na bir GIF anahtarı girmesi gerekiyor.');
  if (m.error) return gifInfo('GIF araması şu an çalışmıyor. Biraz sonra tekrar dene.');
  const grid = $('#gif-grid');
  grid.classList.remove('loading');
  if (!m.results?.length) return gifInfo('Sonuç yok.');
  grid.replaceChildren(...m.results.map((g) => h('img', { class: 'gif-item', src: g.preview || g.url, loading: 'lazy', alt: g.title || 'GIF', title: g.title || '', onclick: () => sendGif(g) })));
}
function sendGif(g) {
  const blk = chatBlock();
  if (blk) return toast('GIF gönderilemiyor', blk.text, 'err');
  send({ t: 'chat', text: '', gif: { url: g.url, w: g.w, h: g.h }, channelId: chatChannel(), replyTo: S.replyTo?.id });
  S.replyTo = null;
  renderComposerExtras();
  toggleGif(false);
  $('#chat-input').focus();
}
$('#btn-gif').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleGif();
});
$('#gif-q').addEventListener('input', () => {
  clearTimeout(gifTimer);
  gifTimer = setTimeout(() => gifQuery($('#gif-q').value.trim()), 350);
});
$('#gif-q').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    toggleGif(false);
  }
});

// =====================================================================
//  Oylamayla susturma / AFK'ya gönderme
// =====================================================================
S.votes = new Map();
S.myVotes = new Map();
function voteItems(u) {
  if (!feat('votes') || !S.channelId || u.id === S.myId || u.bot || u.channelId !== S.channelId || u.admin || u.mod || !can('startVotes') || myTimeout()) return [];
  const others = [...S.users.values()].filter((x) => x.channelId === S.channelId && !x.bot && x.id !== u.id).length;
  if (others < 2) return [];
  return [
    '-',
    { label: '🗳️ Oylamayla 1 dakika sustur', run: () => send({ t: 'voteStart', to: u.id, action: 'mute' }) },
    S.afk?.channelId && S.channelId !== S.afk.channelId && { label: "🗳️ Oylamayla AFK'ya gönder", run: () => send({ t: 'voteStart', to: u.id, action: 'afk' }) },
  ];
}
function onVote(v) {
  const isNew = !S.votes.has(v.id);
  S.votes.set(v.id, v);
  if (isNew && v.by === S.myName) S.myVotes.set(v.id, true);
  if (isNew && v.by !== S.myName) beep('mention');
  renderVotes();
}
function onVoteEnd(m) {
  S.votes.delete(m.id);
  S.myVotes.delete(m.id);
  renderVotes();
  const what = m.action === 'mute' ? '1 dakika susturuldu' : "AFK kanalına gönderildi";
  toast(m.passed ? `🗳️ ${m.targetName} ${what}` : `🗳️ Oylama reddedildi`, m.passed ? 'Kanal oylaması kabul edildi.' : `${m.targetName} için yeterli oy çıkmadı.`);
}
function castVote(v, yes) {
  S.myVotes.set(v.id, yes);
  send({ t: 'vote', id: v.id, yes });
  renderVotes();
}
function renderVotes() {
  const box = $('#vote-box');
  box.replaceChildren();
  for (const v of S.votes.values()) {
    const target = v.targetId === S.myId;
    const what = v.action === 'mute' ? '1 dakika susturmak' : "AFK kanalına göndermek";
    const left = Math.max(0, Math.ceil((v.until - Date.now()) / 1000));
    const my = S.myVotes.get(v.id);
    const card = h(
      'div',
      { class: `vote-card ${target ? 'target' : ''}` },
      h('div', { class: 'vc-title' }, target ? `🗳️ ${v.by} seni ${what} için oylama başlattı` : `🗳️ ${v.by}, ${v.targetName} kişisini ${what} için oylama başlattı`),
      h('div', { class: 'vc-bar' }, h('span', { style: `width:${Math.min(100, (v.yes / v.required) * 100)}%` })),
      h('div', { class: 'vc-meta' }, `${v.yes}/${v.required} evet · ${v.no} hayır · ${left} sn`)
    );
    if (!target)
      card.append(
        h(
          'div',
          { class: 'vc-actions' },
          h('button', { class: `btn sm ${my === true ? 'primary' : ''}`, onclick: () => castVote(v, true) }, 'Evet'),
          h('button', { class: `btn sm ${my === false ? 'danger' : ''}`, onclick: () => castVote(v, false) }, 'Hayır')
        )
      );
    box.append(card);
  }
}
setInterval(() => S.votes.size && renderVotes(), 1000);

// =====================================================================
//  Şifreli kanal ve AFK'ya otomatik taşıma (roller, yasaklar, kanal ayarları admin.js'de)
// =====================================================================
function onNeedPassword(m) {
  formModal({
    title: `🔒 ${m.name}`,
    desc: m.wrong ? 'Şifre yanlış, tekrar dene.' : 'Bu kanal şifreli. Girmek için şifreyi yaz.',
    fields: [{ key: 'pw', label: 'Kanal şifresi', type: 'password', max: 100 }],
    submit: 'Katıl',
    onSubmit: (v) => send({ t: 'join', channelId: m.channelId, password: v.pw }),
  });
}
// AFK: uzun süre hem bilgisayar başında hareket yok hem de konuşmuyorsan AFK kanalına geç
setInterval(() => {
  if (S.transmitting) S.lastTalkAt = Date.now();
}, 1000);
setInterval(async () => {
  const afk = S.afk;
  if (!afk?.channelId || !afk.minutes || !S.channelId || S.channelId === afk.channelId || !S.myId) return;
  // Yayın izleyen ya da yayın açan (ör. birlikte film izlerken) hareketsiz kalsa da taşınmaz
  if (S.watching.size || S.myShares.size) return;
  let idle = 0;
  try {
    idle = await kanki.idleTime();
  } catch {}
  const limit = afk.minutes * 60;
  if (idle >= limit && (Date.now() - (S.lastTalkAt || 0)) / 1000 >= limit) {
    S.beforeAfk = S.channelId;
    joinChannel(afk.channelId);
    logEvent('💤', `${afk.minutes} dakika hareketsiz kaldığın için AFK kanalına taşındın`);
    toast('AFK kanalına taşındın', `${afk.minutes} dakikadır hareketsizdin. Geri dönmek için kanalına tıkla.`, '', 10000);
  }
}, 30000);

// =====================================================================
//  Oynadığın oyun ve Spotify'da dinlediğin şarkı
// =====================================================================
// Oyun ve şarkı aynı anda olabilir: ikisi de gösterilir
function activityLines(u) {
  const a = u?.activity;
  if (!a) return [];
  return [a.game ? `🎮 ${a.game} oynuyor` : '', a.music ? `🎵 ${a.music}` : ''].filter(Boolean);
}
const activityText = (u) => activityLines(u).join(' · ');
function activityBadge(u, badges) {
  if (!u.activity) return;
  badges.prepend(h('span', { class: 'act-badge', title: activityLines(u).join('\n') }, u.activity.game && u.activity.music ? '🎮🎵' : u.activity.game ? '🎮' : '🎵'));
}
let lastAct = '';
async function scanActivity() {
  if (!S.myId || !feat('activity') || !kanki.scanActivity) return;
  let a = { game: '', music: '' };
  if (settings.showGame || settings.showMusic) {
    try {
      a = (await kanki.scanActivity({ games: !!settings.showGame, music: !!settings.showMusic, custom: settings.customGames || [], cacheMs: settings.perfMode ? 25000 : 9000 })) || a;
    } catch {}
  }
  const key = JSON.stringify(a);
  if (key !== lastAct) {
    lastAct = key;
    send({ t: 'activity', game: a.game || '', music: a.music || '' });
  }
}
// Şarkı değişimi birkaç saniyede görünsün (program listesi ana süreçte 9 sn saklanır, Spotify başlığı her taramada bakılır).
// Performans modunda 10 sn'de bir bakılır ve liste 25 sn saklanır: Windows'ta her tarama tasklist çalıştırıp düşük
// bilgisayarlarda oyunu kastırabiliyor.
let actBusy = false;
let actLast = 0;
setInterval(async () => {
  if (actBusy || (settings.perfMode && Date.now() - actLast < 9500)) return;
  actLast = Date.now();
  actBusy = true;
  try {
    await scanActivity();
  } finally {
    actBusy = false;
  }
}, 4000);

// Listede olmayan oyunu kendin ekle (Ayarlar › Profilim)
function renderCustomGames() {
  const box = $('#custom-games');
  if (!box) return;
  const list = settings.customGames || [];
  box.replaceChildren(
    ...list.map((g, i) =>
      h('span', { class: 'cg-chip', title: `${g.exe}.exe` }, `🎮 ${g.name}`, h('button', { class: 'cg-x', title: 'Kaldır', onclick: () => {
        settings.customGames = list.filter((_, j) => j !== i);
        saveSettings();
        renderCustomGames();
        lastAct = '';
        scanActivity();
      } }, '×'))
    )
  );
}
async function addCustomGame() {
  let names = [];
  try {
    names = (await kanki.scanActivity({ list: true }))?.names || [];
  } catch {}
  formModal({
    title: '🎮 Oyun ekle',
    desc: 'Oyun açıkken listeden programını seç (ya da dosya adını yaz) ve görünecek adını gir.',
    fields: [
      names.length
        ? { key: 'exe', label: 'Çalışan program', type: 'select', options: [['', 'Seç…'], ...names.map((n) => [n, n])] }
        : { key: 'exe', label: 'Programın dosya adı', placeholder: 'ör. Seafight' },
      { key: 'name', label: 'Görünecek ad', placeholder: 'ör. Seafight', max: 60 },
    ],
    submit: 'Ekle',
    onSubmit: (v) => {
      const exe = String(v.exe || '').trim().replace(/\.exe$/i, '');
      const name = String(v.name || '').trim() || exe;
      if (!exe) return toast('Bir program seç', '', 'err');
      settings.customGames = [...(settings.customGames || []).filter((g) => g.exe.toLowerCase() !== exe.toLowerCase()), { exe, name }].slice(-30);
      saveSettings();
      renderCustomGames();
      lastAct = '';
      scanActivity();
      toast(`🎮 ${name} eklendi`, 'Oyun açıkken adının altında görünecek.');
    },
  });
}
$('#btn-add-game')?.addEventListener('click', addCustomGame);

// Hakkında sayfası açıkken bellek kullanımı 3 sn'de bir yenilenir
async function renderMem() {
  const pane = document.querySelector('.settings-pane[data-pane="about"]');
  if (!kanki.memUsage || !pane || pane.classList.contains('hidden') || $('#settings').classList.contains('hidden')) return;
  try {
    const m = await kanki.memUsage();
    $('#mem-total').textContent = `${m.total} MB`;
    $('#mem-parts').textContent = m.parts.map(([k, v]) => `${k} ${v} MB`).join(' · ');
  } catch {}
}
setInterval(renderMem, 3000);
document.addEventListener('click', (e) => e.target.closest('.snav[data-pane="about"]') && setTimeout(renderMem, 50));
renderCustomGames();

// =====================================================================
//  Kendi kısayolların (oyundayken de çalışır)
// =====================================================================
const KB_ACTIONS = [
  ['sfx', 'Ses efekti çal'],
  ['poke', 'Birini dürt'],
  ['afk', 'AFK kanalına geç'],
  ['back', 'AFK’dan önceki kanala dön'],
  ['mute', 'Mikrofonu kapat / aç'],
  ['deafen', 'Sesi kapat / aç'],
  ['watch', 'Birlikte izle: durdur / oynat'],
  ['ping', '📍 Ping at'],
];
function accelFrom(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.metaKey) mods.push('Command');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const c = e.code;
  let k = null;
  if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
  else if (/^Digit\d$/.test(c)) k = c.slice(5);
  else if (/^F\d{1,2}$/.test(c)) k = c;
  else if (/^Numpad\d$/.test(c)) k = 'num' + c.slice(6);
  else
    k =
      {
        Space: 'Space',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        Insert: 'Insert',
        Delete: 'Delete',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Semicolon: ';',
        Comma: ',',
        Period: '.',
        Slash: '/',
        NumpadAdd: 'numadd',
        NumpadSubtract: 'numsub',
        NumpadMultiply: 'nummult',
        NumpadDivide: 'numdiv',
        NumpadDecimal: 'numdec',
      }[c] || null;
  if (!k) return null; // sadece Ctrl/Alt/Shift basılı
  if (!mods.length && !/^F\d/.test(k) && !/^num/.test(k)) return '';
  return [...mods, k].join('+');
}
function kbText(b) {
  const a = KB_ACTIONS.find((x) => x[0] === b.action)?.[1] || b.action;
  if (b.action === 'sfx') {
    const s = SFX_BY_ID.get(b.sid);
    return s ? `${s.emoji} ${s.name} sesini çal` : a;
  }
  if (b.action === 'poke') return `👉 ${b.who} kişisini dürt`;
  return a;
}
let kbFailed = new Set();
async function applyKeybinds() {
  if (!kanki.setKeybinds) return;
  try {
    const r = await kanki.setKeybinds(settings.keybinds.map((b) => ({ id: b.id, accel: b.accel })));
    kbFailed = new Set(r?.failed || []);
  } catch {}
  renderKeybinds();
}
function renderKeybinds() {
  const box = $('#kb-list');
  box.replaceChildren(
    ...settings.keybinds.map((b) =>
      h(
        'div',
        { class: `key-row ${kbFailed.has(b.id) ? 'kb-fail' : ''}`, title: kbFailed.has(b.id) ? 'Bu kısayol başka bir program tarafından kullanılıyor; başka bir tuş seç.' : '' },
        h('span', {}, kbText(b)),
        h(
          'span',
          { class: 'kb-right' },
          b.accel.split('+').map((k) => h('kbd', {}, k)),
          kbFailed.has(b.id) ? h('span', { class: 'kb-warn' }, 'kullanılamıyor') : null,
          h(
            'button',
            {
              class: 'mm-x',
              title: 'Kaldır',
              onclick: () => {
                settings.keybinds = settings.keybinds.filter((x) => x.id !== b.id);
                saveSettings();
                applyKeybinds();
              },
            },
            '×'
          )
        )
      )
    )
  );
  if (!settings.keybinds.length) box.append(h('div', { class: 'muted kb-empty' }, 'Henüz kısayol yok.'));
}
function addKeybind() {
  formModal({
    title: 'Kısayol ekle',
    fields: [
      { key: 'action', label: 'Ne yapsın?', type: 'select', value: 'sfx', options: KB_ACTIONS },
      { key: 'sid', label: 'Ses efekti', type: 'select', value: 'clap', options: KankiSfx.BUILTIN.map((x) => [x.sid, `${x.emoji} ${x.name}`]), showIf: (v) => v.action === 'sfx' },
      { key: 'who', label: 'Kimi dürtsün? (adı)', placeholder: 'Örn. Deniz', max: 32, showIf: (v) => v.action === 'poke' },
      { key: 'accel', label: 'Kısayol', type: 'keycapture', hint: 'Kutuya tıkla ve tuşlara bas. Silmek için Backspace.' },
    ],
    submit: 'Ekle',
    onSubmit: (v) => {
      if (!v.accel) {
        toast('Bir kısayol seç', 'Kutuya tıklayıp tuşlara bas.', 'err');
        return false;
      }
      if (v.action === 'poke' && !v.who.trim()) {
        toast('Kimi dürteceğini yaz', '', 'err');
        return false;
      }
      if (settings.keybinds.some((b) => b.accel === v.accel)) {
        toast('Bu kısayol zaten atanmış', '', 'err');
        return false;
      }
      settings.keybinds.push({ id: 'k' + Date.now().toString(36), action: v.action, sid: v.action === 'sfx' ? v.sid : undefined, who: v.action === 'poke' ? v.who.trim() : undefined, accel: v.accel });
      saveSettings();
      applyKeybinds();
    },
  });
}
$('#kb-add').addEventListener('click', addKeybind);
kanki.onKeybind?.((id) => {
  const b = settings.keybinds.find((x) => x.id === id);
  if (!b || !S.myId) return;
  switch (b.action) {
    case 'sfx':
      if (S.channelId) sendSfx(b.sid);
      break;
    case 'poke': {
      const u = [...S.users.values()].find((x) => trLower(x.name) === trLower(b.who)) || [...S.users.values()].find((x) => trLower(x.name).startsWith(trLower(b.who)));
      if (!u || u.id === S.myId) return toast(`${b.who} şu an bağlı değil`);
      send({ t: 'poke', to: u.id, text: '' });
      logEvent('👉', `${u.name} kişisini dürttün`, { dim: true });
      toast(`${u.name} dürtüldü`);
      break;
    }
    case 'afk':
      if (S.afk?.channelId && S.channelId !== S.afk.channelId) {
        S.beforeAfk = S.channelId;
        joinChannel(S.afk.channelId);
      }
      break;
    case 'back':
      if (S.beforeAfk && S.beforeAfk !== S.channelId) joinChannel(S.beforeAfk);
      break;
    case 'mute':
      toggleMute();
      break;
    case 'deafen':
      toggleDeafen();
      break;
    case 'ping':
      startPing();
      break;
    case 'watch': {
      const id = myWatchShare();
      if (id) {
        const w = S.watch.get(id);
        w.video.paused ? w.video.play() : w.video.pause();
      } else {
        const key = [...S.watchStates.keys()].find((k) => S.remoteScreens.has(k));
        const st = key && S.watchStates.get(key);
        if (st) send({ t: 'watchCtl', owner: st.owner, share: st.share, act: st.paused ? 'play' : 'pause' });
      }
      break;
    }
  }
});

// =====================================================================
//  Ayarlar: oyun/müzik durumu, RNNoise, konuşanlar katmanı
// =====================================================================
(function bindExtraSettings() {
  const bind = (sel, key, after) => {
    const el = $(sel);
    el.checked = !!settings[key];
    el.addEventListener('change', () => {
      settings[key] = el.checked;
      saveSettings();
      after?.();
    });
  };
  bind('#set-show-game', 'showGame', () => ((lastAct = ''), scanActivity()));
  bind('#set-show-music', 'showMusic', () => ((lastAct = ''), scanActivity()));
  bind('#set-rnnoise', 'rnnoise', () => S.myId && startMic());
  // Katman kapalıyken alt seçenekler pasif
  const syncOverlayOpts = () => {
    const off = !settings.overlay;
    $('#set-overlay-only').disabled = off;
    $('#set-overlay-pos').disabled = off;
    $('#set-overlay-alpha').disabled = off;
    $('#overlay-sub').classList.toggle('off', off);
  };
  bind('#set-overlay', 'overlay', syncOverlayOpts);
  bind('#set-overlay-only', 'overlayOnly');
  const alpha = $('#set-overlay-alpha');
  alpha.value = settings.overlayAlpha || 75;
  $('#set-overlay-alpha-val').textContent = `%${alpha.value}`;
  alpha.addEventListener('input', () => {
    settings.overlayAlpha = Number(alpha.value);
    $('#set-overlay-alpha-val').textContent = `%${alpha.value}`;
    saveSettings();
  });
  syncOverlayOpts();
  $('#set-overlay-pos').value = settings.overlayPos || 'tl';
  $('#set-overlay-pos').addEventListener('change', (e) => {
    settings.overlayPos = e.target.value;
    saveSettings();
  });
  renderKeybinds();
})();

// =====================================================================
//  Konuşanlar katmanı (oyun içi, her zaman üstte)
// =====================================================================
let overlayKey = '';
setInterval(() => {
  if (!kanki.overlay) return;
  const on = !!(settings.overlay && S.channelId && S.myId);
  let items = [];
  if (on) {
    items = [...S.users.values()]
      .filter((u) => u.channelId === S.channelId && !u.bot)
      .map((u) => ({ name: u.name, color: colorFor(u.name), speaking: u.id === S.myId ? !!S.transmitting : !!audio.remote.get(u.id)?.speaking, muted: !!u.muted, deaf: !!u.deafened }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (settings.overlayOnly) items = items.filter((x) => x.speaking);
  }
  const payload = { on, pos: settings.overlayPos || 'tl', alpha: settings.overlayAlpha || 75, channel: chName(S.channelId), items };
  const key = JSON.stringify(payload);
  if (key !== overlayKey) {
    overlayKey = key;
    kanki.overlay(payload);
  }
}, 150);

// =====================================================================
//  Davet bağlantısı: tıklayınca Kanki açılır ve sunucuya bağlanır
// =====================================================================
const b64url = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
function copyInviteLink(withPw) {
  const d = { a: inviteAddress(), n: S.serverName };
  if (withPw && S.password) d.p = S.password;
  const link = `https://kanki-app.github.io/join/#${b64url(JSON.stringify(d))}`;
  navigator.clipboard.writeText(link);
  toast('Davet bağlantısı kopyalandı', withPw ? 'Bağlantıda sunucu şifresi de var; sadece güvendiğin kişilere gönder.' : 'Arkadaşın tıklayınca Kanki açılır ve bu sunucuya bağlanır (Kanki kurulu değilse indirme sayfası açılır).', '', 7000);
}
function handleInvite(payload) {
  let d;
  try {
    d = JSON.parse(fromB64url(payload));
  } catch {
    return toast('Davet bağlantısı bozuk', '', 'err');
  }
  if (!d?.a) return;
  if (S.myId && normalizeAddress(d.a) === S.url) return toast(`Zaten ${d.n || d.a} sunucusundasın`);
  // Henüz kullanıcı adı yoksa önce giriş, sonra davet
  if (!settings.nick && typeof SV !== 'undefined') {
    SV.pendingInvite = payload;
    return toast(`${d.n || 'Sunucu'} daveti`, 'Önce kullanıcı adını yaz, sonra sunucuya girersin.');
  }
  const go = () => {
    // Sunucu listeye eklenir ve girilir (sol çubukta kalır)
    if (typeof svOpen === 'function' && !S.web) {
      svMigrate();
      if (!settings.servers.some((x) => x.address === d.a)) settings.servers.push({ address: d.a, password: d.p || '', adminKey: '', name: d.n || '' });
      saveSettings();
      return svOpen({ id: d.a, address: d.a, password: d.p || '', name: d.n || '' });
    }
    if (S.ws) disconnect();
    $('.tab[data-tab="join"]')?.click();
    $('#in-address').value = d.a;
    $('#in-password').value = d.p || '';
    if ($('#in-nick').value.trim()) doConnect();
    else {
      $('#in-nick').focus();
      toast(`${d.n || 'Sunucu'} daveti`, 'Takma adını yazıp Bağlan’a bas.');
    }
  };
  if (S.myId) formModal({ title: 'Sunucu daveti', desc: `${d.n || d.a} sunucusuna geçilsin mi? Şu anki sunucudan çıkarsın.`, submit: 'Geç', onSubmit: go });
  else go();
}
kanki.onInvite?.((p) => handleInvite(p));

// =====================================================================
//  Yapay zekâ ile gürültü engelleme (RNNoise, 48 kHz)
// =====================================================================
let rnn = null;
let rnnWasm = null;
async function rnnoiseStream(stream) {
  stopRnnoise();
  if (!rnnWasm) rnnWasm = await kanki.readAsset('rnnoise');
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('vendor/rnnoise/workletProcessor.js');
  const node = new AudioWorkletNode(ctx, '@sapphi-red/web-noise-suppressor/rnnoise', { processorOptions: { maxChannels: 1, wasmBinary: rnnWasm.slice(0) } });
  const src = ctx.createMediaStreamSource(stream);
  const dest = ctx.createMediaStreamDestination();
  src.connect(node).connect(dest);
  if (ctx.state === 'suspended') await ctx.resume();
  rnn = { ctx, node, src };
  log('rnnoise on');
  return dest.stream;
}
function stopRnnoise() {
  if (!rnn) return;
  try {
    rnn.node.port.postMessage('destroy');
  } catch {}
  rnn.ctx.close().catch(() => {});
  rnn = null;
}

// =====================================================================
//  Ping: Ping tuşuna (ya da kısayola) basıp ekranda bir yere tıklanır; aynı ses kanalındaki herkesin
//  ekranında o nokta atanın adı ve rengiyle dalga dalga parlar. Yayının üstüne tıklanırsa izlenen yayında görünür.
// =====================================================================
const canPing = () => feat('ping') && can('ping');
const pingLeft = () => Math.max(0, Math.ceil(((S.pingAt || 0) + (S.pingCd ?? 3) * 1000 - Date.now()) / 1000));
function pingWave(host, x, y, name, color, flipX, flipY) {
  const g = h('div', { class: 'pg', style: `left:${x}px;top:${y}px;--c:${color}` }, h('div', { class: 'w' }), h('div', { class: 'w' }), h('div', { class: 'w' }), h('div', { class: 'd' }), h('div', { class: `n${flipX ? ' fx' : ''}${flipY ? ' fy' : ''}` }, name));
  host.append(g);
  setTimeout(() => g.classList.add('f'), 3000);
  setTimeout(() => g.remove(), 3700);
}
function renderPingBtn() {
  const b = $('#btn-ping');
  if (!b) return;
  b.classList.toggle('hidden', !canPing());
  b.disabled = !S.channelId;
  b.classList.toggle('on', !!S.pinging);
  b.title = S.pinging ? 'Ping seçiliyor: bir yere tıkla (Esc: vazgeç)' : 'Ping at: tıkladığın yer kanaldaki herkesin ekranında parlar';
}
// Tarayıcıdan girenler: ekranın geneline katman açılamaz, sayfanın içinde seçilir ve gösterilir
function pagePick() {
  return new Promise((resolve) => {
    const cover = h('div', { class: 'ping-pick' }, h('div', { class: 'ping-pick-hint' }, h('b', {}, '📍 Ping'), ' · Bir yere tıkla  ·  Esc ya da sağ tık: vazgeç'));
    const done = (r) => {
      cover.remove();
      removeEventListener('keydown', key, true);
      resolve(r);
    };
    const key = (e) => e.key === 'Escape' && (e.preventDefault(), done(null));
    cover.addEventListener('contextmenu', (e) => e.preventDefault());
    cover.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      done(e.button === 0 ? { x: e.clientX / innerWidth, y: e.clientY / innerHeight, inWin: { x: e.clientX, y: e.clientY } } : null);
    });
    addEventListener('keydown', key, true);
    document.body.append(cover);
  });
}
async function startPing() {
  if (!S.myId || !canPing()) return;
  if (!S.channelId) return toast('📍 Ping için bir ses kanalında ol', '', '', 2500);
  if (S.pinging) return kanki.pingPick?.(); // ikinci basış seçimi iptal eder
  const left = pingLeft();
  if (left) return toast(`📍 Tekrar ping atmak için ${left} saniye bekle`, '', '', 2000);
  S.pinging = true;
  renderPingBtn();
  let r = null;
  try {
    r = kanki.pingPick ? await kanki.pingPick() : await pagePick();
  } catch {}
  S.pinging = false;
  renderPingBtn();
  if (!r || !S.channelId) return;
  // Kanki'nin içinde izlenen bir yayının üstüne tıklandıysa ping o yayına gider
  if (r.inWin) {
    const tile = document.elementFromPoint(r.inWin.x, r.inWin.y)?.closest('.tile[data-key]');
    const video = tile?.querySelector('video');
    const key = tile?.dataset.key;
    if (video && feat('marks') && !isCamKey(key) && !isOwnKey(key)) {
      const vr = videoRect(video);
      const x = (r.inWin.x - vr.x) / vr.w;
      const y = (r.inWin.y - vr.y) / vr.h;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        const [owner, share] = splitKey(key);
        return send({ t: 'spot', owner, share, x, y });
      }
    }
  }
  send({ t: 'spot', x: r.x, y: r.y });
}
function onPing(m) {
  const color = colorFor(m.name);
  if (m.owner) onMark({ ...m, kind: 'ping', pts: [[m.x, m.y]] });
  else if (kanki.screenPing) kanki.screenPing({ x: m.x, y: m.y, name: m.name, color });
  else pingWave($('#ping-page') || document.body.appendChild(h('div', { id: 'ping-page' })), m.x * innerWidth, m.y * innerHeight, m.name, color, m.x > 0.85, m.y < 0.06);
  pingSound();
}
function pingSound() {
  if (S.deafened) return;
  try {
    const ctx = sfxCtx();
    const t = ctx.currentTime + 0.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.05, (settings.sfxVolume ?? 50) / 260), t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    g.connect(ctx.destination);
    for (const [f, d] of [[1320, 0], [1760, 0.09]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + d);
      o.connect(g);
      o.start(t + d);
      o.stop(t + 0.46);
    }
  } catch {}
}
$('#btn-ping')?.addEventListener('click', startPing);

// =====================================================================
//  Yayına işaret koyma: izleyen tıklar ya da çizer, herkeste (ve yayıncının ekranında) kısa süre görünür
// =====================================================================
function videoRect(video) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s;
  const hh = vh * s;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - hh) / 2, w, h: hh };
}
const ICON_PEN = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>';
function decorateTile(el, key, video) {
  const [owner, share] = splitKey(key);
  const layer = h('div', { class: 'mark-layer' });
  el.append(layer);
  // Birlikte izle kontrolleri (sadece o yayın "birlikte izle" ise görünür)
  el.append(buildWatchBar(key));
  if (!feat('marks') || isCamKey(key) || isOwnKey(key)) return;
  const btn = h('button', { class: 'tile-btn mark-btn', title: 'Yayına işaret koy / çiz (Alt + tık da olur)' });
  btn.append(svgEl(ICON_PEN));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.classList.toggle('marking');
    btn.classList.toggle('on', el.classList.contains('marking'));
  });
  el.querySelector('.tile-bar .spacer')?.after(btn);
  let pts = null;
  let lastSend = 0;
  const pos = (e) => {
    const r = videoRect(video);
    return [Math.max(0, Math.min(1, (e.clientX - r.x) / r.w)), Math.max(0, Math.min(1, (e.clientY - r.y) / r.h))];
  };
  video.addEventListener(
    'pointerdown',
    (e) => {
      if (!(el.classList.contains('marking') || e.altKey) || e.button !== 0) return;
      if (typeof isControlling === 'function' && isControlling(key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pts = [pos(e)];
      video.setPointerCapture(e.pointerId);
    },
    true
  );
  video.addEventListener('pointermove', (e) => {
    if (!pts) return;
    const p = pos(e);
    const l = pts[pts.length - 1];
    if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.004) pts.push(p);
    // Uzun çizgiler parça parça gider ki herkes çizilirken görsün
    if (pts.length > 6 && Date.now() - lastSend > 120) {
      lastSend = Date.now();
      send({ t: 'mark', owner, share, kind: 'line', pts: pts.slice(0, 80), stroke: 'part' });
      pts = [pts[pts.length - 1]];
    }
  });
  const end = () => {
    if (!pts) return;
    const p = pts;
    pts = null;
    const moved = p.length > 2;
    send({ t: 'mark', owner, share, kind: moved ? 'line' : 'ping', pts: moved ? p.slice(0, 80) : [p[0]] });
  };
  video.addEventListener('pointerup', end);
  video.addEventListener('pointercancel', end);
}
function drawMark(layer, video, m) {
  const tile = layer.parentElement;
  const tr = tile.getBoundingClientRect();
  const r = videoRect(video);
  const X = (x) => r.x - tr.x + x * r.w;
  const Y = (y) => r.y - tr.y + y * r.h;
  const color = colorFor(m.name);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('width', tr.width);
  svg.setAttribute('height', tr.height);
  if (m.kind === 'ping') {
    const [x, y] = m.pts[0];
    pingWave(layer, X(x), Y(y), m.name, color, x > 0.85, y < 0.06);
    return;
  } else {
    const pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', m.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' '));
    pl.setAttribute('class', 'mk-line');
    pl.setAttribute('style', `--c:${color}`);
    svg.append(pl);
  }
  layer.append(svg);
  setTimeout(() => svg.classList.add('fade'), 2600);
  setTimeout(() => svg.remove(), 3400);
}
function onMark(m) {
  const key = shareKey(m.owner, m.share);
  const tile = $(`.tile[data-key="${CSS.escape(key)}"]`);
  if (tile) drawMark(tile.querySelector('.mark-layer'), tile.querySelector('video'), m);
  if (m.owner === S.myId) {
    const sh = S.myShares.get(m.share);
    if (sh?.opts?.sourceId && kanki.showMark) kanki.showMark({ sourceId: sh.opts.sourceId, kind: m.kind, pts: m.pts, name: m.name, color: colorFor(m.name) });
    if (m.from !== S.myId && m.stroke !== 'part' && Date.now() - (S.lastMarkLog || 0) > 4000) {
      S.lastMarkLog = Date.now();
      logEvent('📍', `${m.name} yayınına işaret koydu`, { dim: true });
    }
  }
}

// =====================================================================
//  Birlikte izle: YouTube ya da video dosyası, yayın olarak herkese gider; herkes durdurup sarabilir
// =====================================================================
const ICON_WATCH = '<svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm6 3.5v7l6-3.5-6-3.5Z"/></svg>';
S.watch = new Map(); // benim birlikte izle yayınlarım: shareId -> { video, audioEl, ctx, title }
S.watchHidden = new Set(); // sahneden gizlediğim kendi birlikte izle yayınlarım
S.watchStates = new Map(); // izlediğim birlikte izle yayınlarının durumu
function myWatchShare() {
  for (const id of S.watch.keys()) if (S.myShares.has(id)) return id;
  return null;
}
$('#cb-watch').addEventListener('click', () => {
  const id = myWatchShare();
  if (id) {
    formModal({ title: '🎬 Birlikte izlemeyi bitir', desc: `"${S.watch.get(id).title}" yayını kapansın mı?`, submit: 'Bitir', danger: true, onSubmit: () => removeShare(id) });
  } else watchForm();
});
function watchForm() {
  if (!S.channelId) return toast('Önce bir ses kanalına gir');
  if (!can('startWatch')) return toast('Birlikte izle kapalı', 'Bu sunucuda birlikte izleme yetkin yok.', 'err');
  formModal({
    title: '🎬 Birlikte izle',
    desc: 'Videoyu sen oynatırsın, kanaldakiler yayın olarak izler; herkes durdurup ileri-geri sarabilir. YouTube bağlantısı yapıştır ya da bilgisayarından bir video dosyası seç.',
    fields: [
      { key: 'url', label: 'YouTube bağlantısı', placeholder: 'https://www.youtube.com/watch?v=…', max: 500 },
      { key: 'q', label: 'Kalite', type: 'select', value: settings.watchQuality || 'auto', options: WATCH_Q },
    ],
    submit: 'Başlat',
    extra: { label: 'Video dosyası seç…', onClick: () => {
      const q = $('#form-modal select')?.value;
      if (q) setWatchQuality(q);
      pickVideoFile();
    } },
    onSubmit: (v) => {
      setWatchQuality(v.q);
      const url = v.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        toast('Bir YouTube bağlantısı yapıştır', 'Ya da "Video dosyası seç" ile bilgisayarından bir dosya aç.', 'err');
        return false;
      }
      startWatchYouTube(url);
    },
  });
}
// Kalite: Otomatik = 1080p'ye kadar (yayın en fazla 1080p gider, üstü boşa iner). Yavaş internette 720p/480p.
const WATCH_Q = [['auto', 'Otomatik — 1080p’ye kadar (önerilen)'], ['720', '720p — orta internet'], ['480', '480p — yavaş internet']];
const watchMaxH = () => ({ 720: 720, 480: 480 })[settings.watchQuality] || 1080;
function setWatchQuality(q) {
  if (!WATCH_Q.some(([k]) => k === q) || settings.watchQuality === q) return;
  settings.watchQuality = q;
  saveSettings();
}
// Yayın bit hızı videonun gerçek yüksekliğine ve seçilen sınıra göre
function watchBitrate(videoHeight) {
  const h = Math.min(videoHeight || 1080, watchMaxH());
  return h >= 1000 ? autoBitrate('1080', 30) : h >= 700 ? autoBitrate('720', 30) : 1200;
}
function pickVideoFile() {
  const inp = h('input', { type: 'file', accept: 'video/*,.mkv,.mp4,.webm,.mov,.m4v' });
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    if (f) startWatch({ src: URL.createObjectURL(f), title: f.name.replace(/\.[^.]+$/, ''), revoke: true });
  });
  inp.click();
}
async function startWatchYouTube(url) {
  if (!kanki.watchResolve) return toast('Bu sürüm YouTube açamıyor', '', 'err');
  toast('Video hazırlanıyor…', 'YouTube videosu 10–20 saniyede başlar.', '', 6000);
  try {
    const r = await kanki.watchResolve(url, watchMaxH());
    if (r.error) throw new Error(r.error);
    const wait = (r.availableAt || 0) - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, Math.min(wait + 300, 30000)));
    await startWatch({ src: r.video, audioSrc: r.audio, title: r.title || 'YouTube', remote: true });
  } catch (e) {
    toast('Video açılamadı', String(e.message || e), 'err');
  }
}
async function startWatch({ src, audioSrc, title, revoke, remote }) {
  if (!S.channelId) return toast('Önce bir ses kanalına gir');
  if (myScreenShares().length >= MAX_SHARES) return toast(`En fazla ${MAX_SHARES} yayın açabilirsin`, '', 'err');
  const video = document.createElement('video');
  if (remote) video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  let audioEl = null;
  if (audioSrc) {
    audioEl = new Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'auto';
    audioEl.src = audioSrc;
  }
  try {
    await new Promise((res, rej) => {
      video.addEventListener('loadedmetadata', res, { once: true });
      video.addEventListener('error', () => rej(new Error('Video oynatılamıyor (biçim desteklenmiyor olabilir).')), { once: true });
      setTimeout(() => rej(new Error('Video yüklenemedi (zaman aşımı).')), 40000);
    });
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const monitor = ctx.createGain();
    monitor.gain.value = 0.8;
    monitor.connect(ctx.destination);
    const asrc = ctx.createMediaElementSource(audioEl || video);
    asrc.connect(dest);
    asrc.connect(monitor);
    await video.play();
    if (audioEl) {
      audioEl.currentTime = video.currentTime;
      await audioEl.play().catch(() => {});
    }
    const vt = video.captureStream().getVideoTracks()[0];
    if (!vt) throw new Error('Videodan görüntü alınamadı.');
    const stream = new MediaStream([vt, ...dest.stream.getAudioTracks()]);
    const label = `🎬 ${title}`.slice(0, 60);
    const id = addShare(stream, { fps: '30', res: '1080', bitrate: watchBitrate(video.videoHeight), bitrateSel: '0', hint: 'motion', audioMode: 'clean', watch: true }, label);
    const w = { video, audioEl, ctx, monitor, title, revoke: revoke ? src : null, timer: null };
    S.watch.set(id, w);
    const push = () => broadcastWatch(id);
    for (const ev of ['play', 'pause', 'seeked', 'ratechange']) video.addEventListener(ev, push);
    if (audioEl) {
      const sync = () => {
        if (Math.abs(audioEl.currentTime - video.currentTime) > 0.25) audioEl.currentTime = video.currentTime;
        if (video.paused !== audioEl.paused) video.paused ? audioEl.pause() : audioEl.play().catch(() => {});
      };
      for (const ev of ['play', 'pause', 'seeked']) video.addEventListener(ev, sync);
      w.sync = sync;
    }
    video.addEventListener('ended', () => {
      push();
      toast('🎬 Video bitti', 'Yayını kapatmak için birlikte izle düğmesine bas.');
    });
    w.timer = setInterval(() => {
      w.sync?.();
      push();
    }, 1000);
    push();
    renderWatchHost();
    renderCallBar();
    renderStage(); // videoyu başlatan da sahnede izlesin
    logEvent('🎬', `Birlikte izle başlattın: ${title}`, { dim: true });
  } catch (e) {
    video.pause();
    video.removeAttribute('src');
    audioEl?.pause();
    if (revoke) URL.revokeObjectURL(src);
    toast('Birlikte izle başlatılamadı', String(e.message || e), 'err');
  }
}
function broadcastWatch(id) {
  const w = S.watch.get(id);
  if (!w || !feat('watch')) return;
  send({ t: 'watchState', share: id, paused: w.video.paused, time: w.video.currentTime, duration: Number.isFinite(w.video.duration) ? w.video.duration : 0, title: w.title, by: S.myName });
  renderWatchHost();
}
function cleanupWatch(id) {
  const w = S.watch.get(id);
  if (!w) return;
  clearInterval(w.timer);
  w.video.pause();
  w.audioEl?.pause();
  w.video.removeAttribute('src');
  w.audioEl?.removeAttribute('src');
  w.ctx.close().catch(() => {});
  if (w.revoke) URL.revokeObjectURL(w.revoke);
  S.watch.delete(id);
  S.watchHidden.delete(id);
  setTimeout(() => {
    renderWatchHost();
    renderCallBar();
    renderStage();
  });
}
// Yayın kapanınca (düğmeden ya da başka yoldan) videoyu da kapat
const removeShareBase = removeShare;
removeShare = function (id, notify) {
  cleanupWatch(id);
  return removeShareBase(id, notify);
};
function applyWatchCtl(w, act, time) {
  if (act === 'play') w.video.play().catch(() => {});
  else if (act === 'pause') w.video.pause();
  else if (act === 'seek' && Number.isFinite(time)) w.video.currentTime = Math.max(0, Math.min(time, w.video.duration || time));
}
function onWatchCtl(m) {
  const w = S.watch.get(m.share);
  if (!w) return;
  applyWatchCtl(w, m.act, m.time);
  const what = { play: 'oynattı', pause: 'durdurdu', seek: `${fmtClock(m.time)} anına sardı` }[m.act] || m.act;
  logEvent('🎬', `${m.name} videoyu ${what}`);
  if (m.act !== 'seek') toast(`🎬 ${m.name} videoyu ${what}`, '', '', 2500);
}
// Yayıncının kendi kontrol çubuğu (sahnenin altında)
function renderWatchHost() {
  let bar = $('#watch-host');
  const id = myWatchShare();
  if (!id) return bar?.remove();
  const w = S.watch.get(id);
  if (!bar) {
    bar = h('div', { class: 'watch-host', id: 'watch-host' });
    $('#call-bar').before(bar);
    bar.append(
      h('button', { class: 'wh-pp', onclick: () => (w.video.paused ? w.video.play() : w.video.pause()) }),
      h('span', { class: 'wh-title' }),
      h('input', { type: 'range', class: 'wh-seek', min: 0, max: 1000, value: 0 }),
      h('span', { class: 'wh-time' }),
      h('input', { type: 'range', class: 'wh-vol', min: 0, max: 100, value: 80, title: 'Videonun sende ne kadar yüksek çalacağı' }),
      h('button', { class: 'btn sm wh-view', onclick: () => {
        const sid = myWatchShare();
        if (!sid) return;
        if (S.watchHidden.has(sid)) S.watchHidden.delete(sid);
        else S.watchHidden.add(sid);
        renderStage();
        renderWatchHost();
      } })
    );
    const seek = bar.querySelector('.wh-seek');
    seek.addEventListener('input', () => (bar.dataset.drag = '1'));
    seek.addEventListener('change', () => {
      const cur = S.watch.get(myWatchShare());
      if (cur && cur.video.duration) cur.video.currentTime = (Number(seek.value) / 1000) * cur.video.duration;
      delete bar.dataset.drag;
    });
    bar.querySelector('.wh-vol').addEventListener('input', (e) => {
      const cur = S.watch.get(myWatchShare());
      if (cur) cur.monitor.gain.value = Number(e.target.value) / 100;
    });
  }
  const v = w.video;
  bar.querySelector('.wh-pp').innerHTML = v.paused ? ICON_PLAY : ICON_PAUSE;
  bar.querySelector('.wh-title').textContent = `🎬 ${w.title}`;
  bar.querySelector('.wh-view').textContent = S.watchHidden.has(id) ? 'Sahnede göster' : 'Sahneden gizle';
  bar.querySelector('.wh-time').textContent = `${fmtClock(v.currentTime)} / ${fmtClock(v.duration)}`;
  if (!bar.dataset.drag && v.duration) bar.querySelector('.wh-seek').value = Math.round((v.currentTime / v.duration) * 1000);
}
// İzleyenin kontrol çubuğu (yayın kutusunun içinde)
function buildWatchBar(key) {
  const bar = h('div', { class: 'watch-bar hidden' });
  const pp = h('button', { class: 'wb-pp', title: 'Herkes için durdur / oynat' });
  const seek = h('input', { type: 'range', class: 'wb-seek', min: 0, max: 1000, value: 0, title: 'Herkes için sar' });
  const time = h('span', { class: 'wb-time' });
  const title = h('span', { class: 'wb-title' });
  bar.append(pp, title, seek, time);
  const ctl = (act, t) => {
    const st = S.watchStates.get(key);
    if (st) send({ t: 'watchCtl', owner: st.owner, share: st.share, act, time: t });
  };
  pp.addEventListener('click', (e) => {
    e.stopPropagation();
    const st = S.watchStates.get(key);
    if (st) ctl(st.paused ? 'play' : 'pause');
  });
  seek.addEventListener('pointerdown', (e) => e.stopPropagation());
  seek.addEventListener('input', () => (bar.dataset.drag = '1'));
  seek.addEventListener('change', () => {
    const st = S.watchStates.get(key);
    if (st?.duration) ctl('seek', (Number(seek.value) / 1000) * st.duration);
    delete bar.dataset.drag;
  });
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.addEventListener('dblclick', (e) => e.stopPropagation());
  return bar;
}
const watchNow = (st) => Math.min(st.duration || Infinity, st.time + (st.paused ? 0 : (Date.now() - st.recvAt) / 1000));
function updateWatchBars() {
  for (const [key, st] of S.watchStates) {
    const bar = $(`.tile[data-key="${CSS.escape(key)}"] .watch-bar`);
    if (!bar) continue;
    bar.classList.remove('hidden');
    bar.querySelector('.wb-pp').innerHTML = st.paused ? ICON_PLAY : ICON_PAUSE;
    bar.querySelector('.wb-title').textContent = st.title ? `🎬 ${st.title}` : '';
    const now = watchNow(st);
    bar.querySelector('.wb-time').textContent = `${fmtClock(now)} / ${fmtClock(st.duration)}`;
    if (!bar.dataset.drag && st.duration) bar.querySelector('.wb-seek').value = Math.round((now / st.duration) * 1000);
  }
}
function onWatchState(m) {
  const key = shareKey(m.owner, m.share);
  const prev = S.watchStates.get(key);
  S.watchStates.set(key, { ...m, recvAt: Date.now() });
  if (prev && prev.paused !== m.paused) logEvent('🎬', `${m.by || userName(m.owner)}: video ${m.paused ? 'durdu' : 'oynuyor'}`, { dim: true });
  updateWatchBars();
}
setInterval(() => {
  if (S.watchStates.size) updateWatchBars();
  if (myWatchShare()) renderWatchHost();
}, 500);

// =====================================================================
//  Müzik botu: hazır radyolar (radio-browser.info; bot istasyonu kimliğiyle çalar)
// =====================================================================
const RADIO_HOSTS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
const radioCache = new Map(); // istek -> { at, list }
let radioMode = 'tr';
let radioQ = '';
let radioTimer = null;
const radioPlayable = (s) => /^https?:\/\//i.test(s.url_resolved || s.url || '') && !/\.(m3u8|pls|m3u)(\?|$)/i.test(s.url_resolved || s.url || '') && s.lastcheckok !== 0;
async function radioFetch(path) {
  const hit = radioCache.get(path);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  let lastErr;
  for (const host of RADIO_HOSTS) {
    try {
      const r = await fetch(`https://${host}${path}`);
      if (!r.ok) throw new Error(String(r.status));
      const list = (await r.json()).filter(radioPlayable);
      radioCache.set(path, { at: Date.now(), list });
      return list;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
async function renderRadio() {
  const box = $('#mp-radio-list');
  if (!box) return;
  const q = radioQ.trim();
  const path = q
    ? `/json/stations/search?name=${encodeURIComponent(q)}&order=votes&reverse=true&limit=40&hidebroken=true`
    : radioMode === 'tr'
      ? '/json/stations/search?countrycode=TR&order=votes&reverse=true&limit=60&hidebroken=true'
      : '/json/stations/search?order=votes&reverse=true&limit=60&hidebroken=true';
  box.replaceChildren(h('div', { class: 'muted mp-radio-empty' }, 'Yükleniyor…'));
  let list;
  try {
    list = await radioFetch(path);
  } catch {
    return box.replaceChildren(h('div', { class: 'muted mp-radio-empty' }, 'Radyo listesine ulaşılamadı. İnternetini kontrol edip tekrar dene.'));
  }
  // Aynı adlı tekrarları ayıkla
  const seen = new Set();
  list = list.filter((s) => {
    const k = s.name.trim().toLocaleLowerCase('tr');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40);
  if (!list.length) return box.replaceChildren(h('div', { class: 'muted mp-radio-empty' }, 'Sonuç yok.'));
  const nowTitle = S.botState?.current?.live ? S.botState.current.title : '';
  box.replaceChildren(
    ...list.map((s) => {
      const ico = h('span', { class: 'rs-ico' }, '📻');
      if (/^https:\/\//.test(s.favicon || '')) {
        const img = h('img', { src: s.favicon, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => img.remove(), { once: true });
        ico.replaceChildren(img);
      }
      const meta = [s.country && s.countrycode !== 'TR' ? s.country : '', (s.tags || '').split(',').slice(0, 2).join(', '), s.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' · ');
      return h(
        'button',
        {
          class: `rs-item ${nowTitle && nowTitle === s.name.trim().slice(0, 80) ? 'on' : ''}`,
          title: `${s.name} — kanalda çal`,
          onclick: () => {
            if (!botHere()) return toast('Bot bu kanalda değil', 'Önce "Botu bu kanala çağır"a bas.', 'err');
            botCmd('radyo', s.stationuuid);
            toast(`📻 ${s.name.trim()}`, 'Radyo açılıyor…', '', 2500);
          },
        },
        ico,
        h('span', { class: 'rs-text' }, h('b', {}, s.name.trim()), meta ? h('small', {}, meta) : null)
      );
    })
  );
}
function setMusicView(v) {
  for (const b of $$('#mp-tabs button')) b.classList.toggle('active', b.dataset.v === v);
  $('#music-pop .mp-queue')?.classList.toggle('hidden', v !== 'queue');
  $('#mp-radio')?.classList.toggle('hidden', v !== 'radio');
  if (v === 'radio') renderRadio();
}
$('#mp-tabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (b) setMusicView(b.dataset.v);
});
$('#mp-radio-seg')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-r]');
  if (!b) return;
  radioMode = b.dataset.r;
  for (const x of $$('#mp-radio-seg button')) x.classList.toggle('active', x === b);
  radioQ = '';
  $('#mp-radio-q').value = '';
  renderRadio();
});
$('#mp-radio-q')?.addEventListener('input', (e) => {
  radioQ = e.target.value;
  clearTimeout(radioTimer);
  radioTimer = setTimeout(renderRadio, 350);
});
