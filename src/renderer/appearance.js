// =====================================================================
//  Görünüm: tema, vurgu rengi, efektler, yerleşim (themes.css ile birlikte)
//  Ayarlar settings içinde düz anahtarlar olarak durur, saveSettings() ile saklanır.
// =====================================================================
const KANKI_THEMES = [
  { id: 'sade', name: 'Sade', mood: 'Efektsiz, en az bellek', lite: true },
  { id: 'kanki', name: 'Kanki', mood: 'İmza yeşil, derin koyu' },
  { id: 'oled', name: 'Zifiri', mood: 'Saf siyah, pil dostu' },
  { id: 'midnight', name: 'Gece Mavisi', mood: 'Serin lacivert gece' },
  { id: 'synthwave', name: 'Neon', mood: "80'ler neon havası" },
  { id: 'sunset', name: 'Gün Batımı', mood: 'Sıcak akşam ışığı' },
  { id: 'ocean', name: 'Okyanus', mood: 'Turkuaz ve derin mavi' },
  { id: 'sampiyon', name: 'Şampiyon', mood: 'Grafit üstüne altın' },
  { id: 'light', name: 'Gündüz', mood: 'Aydınlık ve net' },
];
const AP_DEFAULTS = {
  theme: 'kanki', themeAuto: false, accent: '', glass: true, aurora: true, speakGlow: true,
  motion: 'system', panels: 'float', density: 'cozy', chatScale: 100,
};
for (const [k, v] of Object.entries(AP_DEFAULTS)) if (settings[k] === undefined) settings[k] = v;

const AP_ACCENTS = [
  ['Nane', '#22d47e'], ['Gök', '#4c9bff'], ['Lavanta', '#a78bfa'], ['Pembe', '#ff5cd0'],
  ['Mercan', '#ff7a59'], ['Altın', '#f5c542'], ['Turkuaz', '#2dd4bf'], ['Kar', '#f4f5f7'],
];
const AP_INLINE = ['--accent', '--accent-2', '--accent-ink', '--accent-soft', '--selected', '--glow', '--grad-a', '--grad-b'];
const apMqLight = matchMedia('(prefers-color-scheme: light)');
const apMqReduce = matchMedia('(prefers-reduced-motion: reduce)');

function apThemeId() {
  const ok = KANKI_THEMES.some((t) => t.id === settings.theme) ? settings.theme : 'kanki';
  if (!settings.themeAuto) return ok;
  return apMqLight.matches ? 'light' : ok === 'light' ? 'kanki' : ok;
}

// Sade tema: efektler (cam, ışıklar, parlama) seçimden bağımsız kapalı
const apIsLite = () => !!KANKI_THEMES.find((t) => t.id === apThemeId())?.lite;

// WCAG yardımcıları: seçilen vurgu rengi her temada okunur kalsın
const apRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const apHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const apLum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const apContrast = (a, b) => { const x = apLum(a), y = apLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function apAccentVars(hex, light) {
  let c = apRgb(hex);
  const bg = light ? [246, 248, 249] : [10, 15, 13];
  const toward = light ? [0, 0, 0] : [255, 255, 255];
  // Zeminde en az 4.8:1 olana kadar koyulaştır (açık tema) ya da aç (koyu tema)
  for (let i = 0; i < 14 && apContrast(c, bg) < 4.8; i++) c = c.map((v, k) => v + (toward[k] - v) * 0.12);
  const a = apHex(c);
  const ink = apContrast(c, [255, 255, 255]) >= apContrast(c, [10, 13, 12]) ? '#ffffff' : '#0a0d0c';
  return {
    '--accent': a,
    '--accent-2': `color-mix(in srgb, ${a} 82%, ${light ? '#000' : '#fff'})`,
    '--accent-ink': ink,
    '--accent-soft': `color-mix(in srgb, ${a} 14%, transparent)`,
    '--selected': `color-mix(in srgb, ${a} 13%, transparent)`,
    '--glow': `color-mix(in srgb, ${a} 38%, transparent)`,
    '--grad-a': a,
    '--grad-b': `oklch(from ${a} l c calc(h + 35))`,
  };
}

function applyAppearance() {
  const r = document.documentElement;
  const id = apThemeId();
  const scheme = id === 'light' ? 'light' : 'dark';
  const schemeChanged = r.dataset.scheme !== scheme;
  r.dataset.theme = id;
  r.dataset.scheme = scheme;
  const lite = apIsLite();
  r.classList.toggle('lite', lite);
  r.classList.toggle('no-blur', lite || !settings.glass);
  r.classList.toggle('no-aurora', lite || !settings.aurora);
  r.classList.toggle('no-glow', lite || !settings.speakGlow);
  r.classList.toggle('reduce-motion', settings.motion === 'reduce' || (settings.motion === 'system' && apMqReduce.matches));
  r.classList.toggle('flush', settings.panels === 'flush');
  r.classList.toggle('compact', settings.density === 'compact');
  r.style.setProperty('--chat-scale', (settings.chatScale || 100) / 100);
  for (const p of AP_INLINE) r.style.removeProperty(p);
  if (/^#[0-9a-f]{6}$/i.test(settings.accent || '')) {
    for (const [k, v] of Object.entries(apAccentVars(settings.accent, scheme === 'light'))) r.style.setProperty(k, v);
  }
  // İsim renkleri (colorFor) açık temada koyu paletten gelir: tema türü değişince yeniden çiz
  if (schemeChanged && typeof S !== 'undefined' && S.myId) {
    try { refreshAvatars(); } catch {} // ben-kartı, ağaç, sahne, üyeler ve sohbet (kaydırma yeri korunur)
  }
  apSyncPane();
}

// Tema kartına basınca yeni tema tıklanan yerden daire şeklinde yayılır
function apSetTheme(id, ev, card) {
  settings.theme = id;
  settings.themeAuto = false; // elle seçim, sistemle eşleştirmeyi kapatır
  saveSettings();
  const r = document.documentElement;
  if (!document.startViewTransition || r.classList.contains('reduce-motion') || r.classList.contains('lite') || KANKI_THEMES.find((t) => t.id === id)?.lite) return applyAppearance();
  let x = ev?.clientX, y = ev?.clientY;
  if (!x && !y && card) { const b = card.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(() => applyAppearance());
  vt.ready.then(() => r.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
    { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
}

function apSyncPane() {
  const pane = document.querySelector('.settings-pane[data-pane="appearance"]');
  if (!pane) return;
  const cur = apThemeId();
  for (const c of pane.querySelectorAll('.theme-card')) c.setAttribute('aria-pressed', String(c.dataset.id === cur));
  const acc = (settings.accent || '').toLowerCase();
  let preset = false;
  for (const b of pane.querySelectorAll('[data-c]')) {
    const on = b.dataset.c.toLowerCase() === acc;
    b.classList.toggle('active', on);
    if (on) preset = true;
  }
  const custom = pane.querySelector('.accent-sw.custom');
  custom.classList.toggle('active', !!acc && !preset);
  if (acc && !preset) { custom.style.setProperty('--c', acc); pane.querySelector('#ap-accent-custom').value = acc; }
  pane.querySelector('#ap-auto').checked = !!settings.themeAuto;
  pane.querySelector('#ap-glass').checked = !!settings.glass;
  pane.querySelector('#ap-aurora').checked = !!settings.aurora;
  pane.querySelector('#ap-glow').checked = !!settings.speakGlow;
  const lite = apIsLite();
  for (const id of ['#ap-glass', '#ap-aurora', '#ap-glow']) {
    const inp = pane.querySelector(id);
    inp.disabled = lite;
    inp.closest('label, .sw-row, .row')?.classList.toggle('ap-fx', true);
    inp.closest('label, .sw-row, .row')?.classList.toggle('disabled', lite);
  }
  pane.querySelector('#ap-lite-note')?.classList.toggle('hidden', !lite);
  for (const seg of pane.querySelectorAll('.seg[data-key]')) {
    for (const b of seg.children) b.classList.toggle('active', b.dataset.v === String(settings[seg.dataset.key]));
  }
  pane.querySelector('#ap-chatscale').value = settings.chatScale;
  pane.querySelector('#ap-chatscale-val').textContent = `%${settings.chatScale}`;
}

function apBuildPane() {
  const pane = document.querySelector('.settings-pane[data-pane="appearance"]');
  if (!pane) return;
  $('#theme-grid').innerHTML = KANKI_THEMES.map((t) => `
    <button type="button" class="theme-card" data-theme="${t.id}" data-id="${t.id}" aria-pressed="false">
      <div class="tc-preview">
        <div class="tc-rail"><i></i><i class="on"></i><i></i><i></i></div>
        <div class="tc-stage"><b></b><b class="spk"></b><div class="tc-dock"><s></s><s class="on"></s><s class="leave"></s></div></div>
        <div class="tc-chat"><i></i><i class="me"></i><i></i></div>
      </div>
      <div class="tc-meta"><span class="tc-name">${t.name}</span><span class="tc-mood">${t.mood}</span></div>
      <span class="tc-check">✓</span>
    </button>`).join('');
  $('#ap-accents').innerHTML =
    '<button type="button" class="btn sm" data-c="">Temanın rengi</button>' +
    AP_ACCENTS.map(([n, c]) => `<button type="button" class="accent-sw" data-c="${c}" title="${n}" style="--c:${c}"></button>`).join('') +
    '<label class="accent-sw custom" title="Özel renk"><input type="color" id="ap-accent-custom" /></label>';

  const set = (k, v) => { settings[k] = v; saveSettings(); applyAppearance(); };
  pane.addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (card) return apSetTheme(card.dataset.id, e, card);
    const sw = e.target.closest('[data-c]');
    if (sw) return set('accent', sw.dataset.c);
    const sb = e.target.closest('.seg[data-key] > button');
    if (sb) return set(sb.parentElement.dataset.key, sb.dataset.v);
    if (e.target.closest('#ap-reset')) { Object.assign(settings, AP_DEFAULTS); saveSettings(); applyAppearance(); }
  });
  const checks = { 'ap-auto': 'themeAuto', 'ap-glass': 'glass', 'ap-aurora': 'aurora', 'ap-glow': 'speakGlow' };
  pane.addEventListener('change', (e) => {
    if (checks[e.target.id]) set(checks[e.target.id], e.target.checked);
    else if (e.target.id === 'ap-accent-custom') set('accent', e.target.value);
  });
  pane.addEventListener('input', (e) => {
    if (e.target.id === 'ap-chatscale') set('chatScale', +e.target.value);
    else if (e.target.id === 'ap-accent-custom') { settings.accent = e.target.value; applyAppearance(); }
  });
}

// Açık temada isim/avatar renkleri: beyaz zeminde en az 4.6:1 (app.js colorFor bunu kullanır)
self.KANKI_COLORS_LIGHT = ['#316fca', '#7d53dd', '#c23b7d', '#b35310', '#0e7d71', '#167e3c', '#8c6b05', '#c93939', '#047c90', '#944bd9'];

// Konuşma halkası sesin yüksekliğine göre büyüsün (--lvl 0..1; sadece konuşanlar, sadece değişince yazılır)
const apLvlBuf = new Float32Array(1024);
function apSetLevel(id, db) {
  if (!id) return;
  const q = String(Math.round(Math.max(0, Math.min(1, (db + 58) / 30)) * 4) / 4); // 5 kademe: az değişsin, az çizilsin
  for (const el of document.querySelectorAll(`[data-av="${id}"].speaking`)) {
    if (el.style.getPropertyValue('--lvl') !== q) el.style.setProperty('--lvl', q);
  }
}
setInterval(() => {
  if (!settings.speakGlow || apIsLite() || typeof audio === 'undefined' || typeof S === 'undefined' || !S.myId) return;
  try {
    if (S.transmitting) apSetLevel(S.myId, audio.level);
    for (const [id, r] of audio.remote) if (r.speaking && r.analyser) apSetLevel(id, rmsDb(r.analyser, apLvlBuf));
  } catch {}
}, 160);

// Canlı gelen mesaj aşağıdan kayarak girsin; sohbet baştan çizilirken (renderChat) hiçbir şey oynamasın
const apChatLog = document.getElementById('chat-log');
if (apChatLog) {
  new MutationObserver((recs) => {
    let added = [];
    for (const r of recs) {
      if (r.removedNodes.length) return;
      for (const n of r.addedNodes) if (n.nodeType === 1) added.push(n);
    }
    if (!added.length || added.length > 2) return;
    for (const n of added) if (n.classList.contains('msg')) n.classList.add('enter');
  }).observe(apChatLog, { childList: true });
}

apBuildPane();
applyAppearance();
apMqLight.addEventListener('change', () => settings.themeAuto && applyAppearance());
apMqReduce.addEventListener('change', () => settings.motion === 'system' && applyAppearance());
// Kanki arka plandayken aurora durur (oyun oynarken GPU harcamasın)
const apPause = () => document.documentElement.classList.toggle('bg-paused', document.hidden || !document.hasFocus());
window.addEventListener('blur', apPause);
window.addEventListener('focus', apPause);
document.addEventListener('visibilitychange', apPause);
apPause();
