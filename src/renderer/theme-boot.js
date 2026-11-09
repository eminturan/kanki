// Tema ilk boyamadan önce uygulanır (koyu/açık arasında yanıp sönme olmasın).
// Asıl mantık appearance.js içinde; burası sadece hızlı başlangıç.
(() => {
  try {
    const s = JSON.parse(localStorage.getItem('kanki-settings') || '{}');
    const ids = ['sade', 'kanki', 'oled', 'midnight', 'synthwave', 'sunset', 'ocean', 'sampiyon', 'light'];
    let id = ids.includes(s.theme) ? s.theme : 'kanki';
    if (s.themeAuto) id = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : id === 'light' ? 'kanki' : id;
    const r = document.documentElement;
    r.dataset.theme = id;
    r.dataset.scheme = id === 'light' ? 'light' : 'dark';
    const lite = id === 'sade';
    r.classList.toggle('lite', lite);
    r.classList.toggle('no-blur', lite || s.glass === false);
    r.classList.toggle('no-aurora', lite || s.aurora === false);
    r.classList.toggle('no-glow', lite || s.speakGlow === false);
    r.classList.toggle('perf', !!s.perfMode);
    r.classList.toggle('flush', s.panels === 'flush');
    r.classList.toggle('compact', s.density === 'compact');
    if (s.chatScale) r.style.setProperty('--chat-scale', s.chatScale / 100);
  } catch {}
})();
