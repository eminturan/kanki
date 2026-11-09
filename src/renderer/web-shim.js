// =====================================================================
//  Tarayıcıdan katılma: Kanki'nin masaüstü uygulamasındaki "kanki" köprüsünün tarayıcı karşılığı.
//  Sadece sunucunun web sayfası olarak verdiği index.html'e eklenir (Electron'da hiç yüklenmez).
//  Masaüstüne özel olanlar (oyun algılama, katman, genel kısayollar, uzaktan kontrol, güncelleme) burada boştur.
// =====================================================================
(() => {
  if (window.kanki) return; // Electron'da zaten var
  const root = document.documentElement;
  root.classList.add('web');
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile) root.classList.add('web-mobile');
  const canShare = !!navigator.mediaDevices?.getDisplayMedia && !mobile;
  if (!canShare) root.classList.add('web-noshare');
  const version = document.querySelector('meta[name="kanki-version"]')?.content || '';
  const noop = () => {};
  const anoop = async () => {};

  // Son klavye/fare/dokunma zamanı (otomatik "Boşta" ve AFK için)
  let lastInput = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true });

  window.kanki = {
    web: true,
    info: async () => ({ version, title: 'Kanki', platform: 'web', variant: 'client', pttAvailable: false, defaultServer: location.origin, web: true }),
    ensurePermissions: async () => ({ microphone: 'granted', screen: 'granted' }),
    ensureCamera: async () => true,
    openScreenSettings: anoop,
    // Ekran seçimini tarayıcının kendi penceresi yapar; burada tek bir "seç" kartı var
    getSources: async () =>
      canShare
        ? [
            { id: 'web:screen', name: 'Ekran, pencere ya da sekme seç', type: 'screen', thumbnail: null, icon: null },
            { id: 'web:window', name: 'Pencere seç', type: 'window', thumbnail: null, icon: null },
          ]
        : [],
    selectSource: anoop,
    hostServer: async () => ({ ok: false, error: 'Tarayıcıdan sunucu kurulamaz.' }),
    stopServer: anoop,
    serverStatus: async () => ({ hosting: false, addresses: [] }),
    startTunnel: async () => ({ ok: false }),
    stopTunnel: anoop,
    notify: async (title, body) => {
      try {
        if (!('Notification' in window) || !document.hidden) return;
        if (Notification.permission === 'granted') new Notification(title, { body, icon: 'web-icon.png', silent: true });
      } catch {}
    },
    flash: async () => navigator.vibrate?.(120),
    shake: async () => navigator.vibrate?.([80, 40, 80]),
    setPtt: async () => false,
    capturePttKey: async () => null,
    onPtt: noop,
    updateState: async () => ({ state: 'idle' }),
    installUpdate: anoop,
    checkUpdate: async () => ({ ok: true, message: 'Tarayıcı sürümü her açılışta sunucudaki en güncel haldir.' }),
    idleTime: async () => Math.floor((Date.now() - lastInput) / 1000),
    rcCheck: async () => ({ ok: false }),
    rcStart: async () => ({ ok: false, error: 'Tarayıcıdan uzaktan kontrol yapılamaz.' }),
    rcInput: noop,
    rcStop: anoop,
    onRcStopped: noop,
    onUpdate: noop,
    // Dosya gönder: sunucuya doğrudan yüklenir (aynı adres)
    uploadFile: async ({ url, token, name, type, data }) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'x-kanki-token': token, 'x-file-name': encodeURIComponent(name), 'content-type': type || 'application/octet-stream', 'ngrok-skip-browser-warning': '1' },
          body: data,
        });
        return await r.json().catch(() => ({ error: `Sunucu yanıtı anlaşılamadı (${r.status})` }));
      } catch (e) {
        return { error: String(e.message || e) };
      }
    },
    // Dosya indir: tarayıcının kendi indirmesi
    downloadFile: async ({ url, name }) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'dosya';
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      return { ok: true, path: 'Tarayıcının indirilenler klasörüne' };
    },
    scanActivity: async () => ({ game: '', music: '' }),
    setKeybinds: anoop,
    onKeybind: noop,
    overlay: noop,
    showMark: anoop,
    watchResolve: async () => ({ error: 'Tarayıcıdan YouTube açılamıyor; bilgisayarındaki bir video dosyasını seçebilirsin ya da masaüstü uygulamasını kullan.' }),
    readAsset: async (name) => {
      if (name !== 'rnnoise') return null;
      for (const f of ['rnnoise_simd.wasm', 'rnnoise.wasm']) {
        try {
          const r = await fetch(`vendor/rnnoise/${f}`);
          if (r.ok) return await r.arrayBuffer();
        } catch {}
      }
      return null;
    },
    memUsage: async () => {
      const m = performance.memory;
      return { total: m ? Math.round(m.usedJSHeapSize / 1048576) : 0, parts: [] };
    },
    onInvite: noop,
    autotest: null,
  };

  // ---------- Telefon: tek panel + alt sekmeler (Kanallar / Sahne / Sohbet) ----------
  const setTab = (t) => {
    root.dataset.mtab = t;
    for (const b of document.querySelectorAll('#m-nav button')) b.classList.toggle('active', b.dataset.t === t);
    if (t === 'chat') document.querySelector('#m-nav [data-t="chat"]')?.classList.remove('unread');
  };
  window.kankiMobileTab = setTab;
  document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    if (!app) return;
    const nav = document.createElement('nav');
    nav.id = 'm-nav';
    const tabs = [
      ['channels', 'Kanallar', '<path d="M4 6h16M4 12h16M4 18h10" />'],
      ['stage', 'Sahne', '<path d="M3 11v2a1 1 0 0 0 1 1h3l4 4V6L7 10H4a1 1 0 0 0-1 1Zm13-3a5 5 0 0 1 0 8m2.5-10.5a8.5 8.5 0 0 1 0 13" />'],
      ['chat', 'Sohbet', '<path d="M4 5h16v11H8l-4 4V5Z" />'],
    ];
    for (const [t, label, icon] of tabs) {
      const b = document.createElement('button');
      b.dataset.t = t;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${label}</span>`;
      b.addEventListener('click', () => setTab(t));
      nav.append(b);
    }
    app.append(nav);
    setTab('channels');
    // Kanala tıklayınca sahneye geç; yazı kanalı açılınca sohbete
    document.getElementById('tree')?.addEventListener('click', (e) => {
      if (e.target.closest('.ch:not(.ch-header)')) setTimeout(() => setTab('stage'), 150);
    });
    document.getElementById('text-tree')?.addEventListener('click', () => setTimeout(() => setTab('chat'), 100));
    // Sohbet sekmesi açık değilken yeni mesaj gelirse sekmede nokta
    const log = document.getElementById('chat-log');
    if (log)
      new MutationObserver((recs) => {
        if (root.dataset.mtab === 'chat') return;
        if (recs.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && n.classList?.contains('msg')))) nav.querySelector('[data-t="chat"]').classList.add('unread');
      }).observe(log, { childList: true });
    // Bağlanınca sahneye geç (bir kez)
    let wasHidden = true;
    new MutationObserver(() => {
      const hidden = app.classList.contains('hidden');
      if (wasHidden && !hidden) setTab('stage');
      wasHidden = hidden;
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
    // Telefon tarayıcıları sesi ancak bir dokunuştan sonra çalar: her dokunuşta duran sesleri ve ses motorunu uyandır
    addEventListener(
      'pointerdown',
      () => {
        try {
          if (typeof getCtx === 'function' && getCtx().state !== 'running') getCtx().resume();
        } catch {}
        // Sesler sayfaya eklenmemiş <audio> öğeleri: kişilerin sesi ve yayın sesleri
        const els = [];
        try {
          for (const r of audio.remote.values()) if (r.el) els.push(r.el);
          for (const sc of S.remoteScreens.values()) if (sc.audioEl) els.push(sc.audioEl);
        } catch {}
        for (const a of els) if (a.paused && a.srcObject) a.play().catch(() => {});
      },
      { capture: true, passive: true }
    );
    // Bildirim izni: ilk dokunuşta bir kez sor
    addEventListener(
      'pointerdown',
      () => {
        try {
          if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        } catch {}
      },
      { once: true }
    );
  });
})();
