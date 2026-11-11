'use strict';
/* =====================================================================
 *  Doğrudan dosya gönderme (P2P)
 *  Kişiye sağ tık › 📁 Dosya gönder. Karşı taraf kabul edince dosya WebRTC veri kanalıyla
 *  iki bilgisayar arasında doğrudan gider; sunucudan (ngrok) sadece birkaç KB'lık el sıkışma geçer.
 *  TURN kullanılmaz: doğrudan bağlantı kurulamazsa aktarım durur, dosya hiçbir aracıya kaymaz.
 * ===================================================================== */
const XF = {
  list: new Map(), // id -> aktarım
  MAX_ACTIVE: 3,
  CHUNK: 64 * 1024, // veri kanalına giden parça
  READ: 1024 * 1024, // diskten bir seferde okunan
  WINDOW: 32 * 1024 * 1024, // alıcının diske yazmadığı en fazla veri (bellek şişmesin)
  ASK_MS: 60000,
  CONNECT_MS: 25000,
};
const xfCan = () => !!kanki.xferPick && feat('p2pFiles') && can('attachFiles');
const xfActive = () => [...XF.list.values()].filter((t) => ['wait', 'ask', 'conn', 'run'].includes(t.state)).length;
const xfId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
function xfSize(n) {
  n = Number(n) || 0;
  const f = (v, d) => v.toFixed(d).replace('.', ',');
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  if (n < 1073741824) return `${f(n / 1048576, n < 10485760 ? 1 : 0)} MB`;
  return `${f(n / 1073741824, 2)} GB`;
}
function xfDur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} sn`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} dk ${sec % 60} sn`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}
const xfExt = (name) => (/\.([a-z0-9]{1,4})$/i.exec(name || '')?.[1] || 'DOSYA').toUpperCase().slice(0, 4);
const xfTitle = (t) => (t.files.length === 1 ? t.files[0].name : t.files.map((f) => f.name).join(', '));

// Sağ tık menüsündeki seçenek
function xferMenuItem(u) {
  if (!u || u.bot || u.id === S.myId || !xfCan()) return null;
  if (!u.xfer) return { label: '📁 Dosya gönder (eski sürüm / tarayıcı)', disabled: true };
  return { label: '📁 Dosya gönder…', run: () => xferSend(u) };
}

// ---------------- Gönderen ----------------
async function xferSend(u, again) {
  if (xfActive() >= XF.MAX_ACTIVE) return toast('📁 Aynı anda en fazla 3 aktarım', 'Birinin bitmesini bekle.', 'err');
  const files = again || (await kanki.xferPick());
  if (!files?.length) return;
  const t = { id: xfId(), dir: 'out', peerId: u.id, peerName: u.name, files, total: files.reduce((a, f) => a + f.size, 0), state: 'wait', done: 0, acked: 0, startAt: Date.now() };
  XF.list.set(t.id, t);
  send({ t: 'xfer', to: u.id, kind: 'offer', id: t.id, files: files.map((f) => ({ name: f.name, size: f.size })) });
  t.timer = setTimeout(() => xfFail(t, 'timeout', true), XF.ASK_MS);
  xfRender(t);
}
function xfSenderStart(t) {
  t.state = 'conn';
  clearTimeout(t.timer);
  const pc = xfPc(t);
  const dc = pc.createDataChannel('kanki-file', { ordered: true });
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 1024 * 1024;
  t.dc = dc;
  dc.onbufferedamountlow = () => xfWake(t);
  dc.onopen = () => xfPump(t);
  dc.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.t === 'got') {
      t.acked = Math.max(t.acked, Number(m.n) || 0);
      xfWake(t);
    } else if (m.t === 'ok') {
      t.results = m.results || [];
      xfFinish(t);
    } else if (m.t === 'err') xfFail(t, 'peer', false, m.msg);
  };
  dc.onclose = () => t.state === 'run' && xfFail(t, 'lost');
  pc.createOffer()
    .then((o) => pc.setLocalDescription(o))
    .then(() => xfSig(t, { sdp: pc.localDescription }))
    .catch(() => xfFail(t, 'noconn', true));
  xfRender(t);
}
function xfWake(t) {
  const w = t.wake;
  t.wake = null;
  w?.();
}
const xfWait = (t) => new Promise((r) => (t.wake = r));
async function xfPump(t) {
  if (t.state !== 'conn') return;
  clearTimeout(t.connTimer);
  t.state = 'run';
  t.startAt = Date.now();
  xfRender(t);
  const dc = t.dc;
  try {
    for (let i = 0; i < t.files.length; i++) {
      const f = t.files[i];
      t.cur = i;
      dc.send(JSON.stringify({ t: 'file', i, name: f.name, size: f.size }));
      for (;;) {
        if (t.state !== 'run') return;
        const r = await kanki.xferRead(f.key, XF.READ);
        if (r.error) throw new Error(r.error === 'gone' ? 'Dosya okunamadı' : r.error);
        const data = r.data;
        for (let o = 0; o < data.byteLength; o += XF.CHUNK) {
          while (t.state === 'run' && (dc.bufferedAmount > 8 * 1024 * 1024 || t.done - t.acked > XF.WINDOW)) await xfWait(t);
          if (t.state !== 'run') return;
          const part = data.subarray(o, Math.min(o + XF.CHUNK, data.byteLength));
          dc.send(part);
          t.done += part.byteLength;
        }
        xfTick(t);
        if (r.sha) {
          dc.send(JSON.stringify({ t: 'end', i, sha: r.sha }));
          break;
        }
      }
    }
    dc.send(JSON.stringify({ t: 'all' }));
  } catch (e) {
    if (t.state === 'run') {
      try {
        dc.send(JSON.stringify({ t: 'err', msg: e.message }));
      } catch {}
      xfFail(t, 'read', false, e.message);
    }
  }
}

// ---------------- Alıcı ----------------
function xfOnOffer(m) {
  const busy = xfActive() >= XF.MAX_ACTIVE;
  if (!kanki.xferDest || busy) {
    send({ t: 'xfer', to: m.from, kind: 'cancel', id: m.id, reason: busy ? 'busy' : 'unsupported' });
    return;
  }
  const files = (m.files || []).map((f) => ({ name: f.name, size: f.size }));
  const t = { id: m.id, dir: 'in', peerId: m.from, peerName: m.name, files, total: files.reduce((a, f) => a + f.size, 0), state: 'ask', done: 0, askAt: Date.now() };
  XF.list.set(t.id, t);
  t.timer = setTimeout(() => {
    if (t.state !== 'ask') return;
    send({ t: 'xfer', to: t.peerId, kind: 'answer', id: t.id, accept: false });
    xfClose(t);
  }, XF.ASK_MS);
  beep('mention');
  xfRender(t);
}
async function xfAccept(t) {
  if (t.state !== 'ask' || t.picking) return;
  t.picking = true;
  const dest = await kanki.xferDest(t.files.map((f) => ({ name: f.name, size: f.size })));
  t.picking = false;
  if (!dest || t.state !== 'ask') return; // kayıt penceresi kapatıldıysa istek açık kalır
  t.dest = dest;
  clearTimeout(t.timer);
  t.state = 'conn';
  t.results = [];
  t.q = Promise.resolve();
  send({ t: 'xfer', to: t.peerId, kind: 'answer', id: t.id, accept: true });
  const pc = xfPc(t);
  pc.ondatachannel = (e) => {
    const dc = e.channel;
    dc.binaryType = 'arraybuffer';
    t.dc = dc;
    dc.onopen = () => {
      clearTimeout(t.connTimer);
      t.state = 'run';
      t.startAt = Date.now();
      xfRender(t);
    };
    dc.onmessage = (ev) => (t.q = t.q.then(() => xfRecv(t, ev.data)));
    dc.onclose = () => t.state === 'run' && (t.q = t.q.then(() => t.state === 'run' && xfFail(t, 'lost')));
  };
  xfRender(t);
}
function xfReject(t) {
  if (t.state !== 'ask') return;
  send({ t: 'xfer', to: t.peerId, kind: 'answer', id: t.id, accept: false });
  xfClose(t);
}
async function xfRecv(t, data) {
  if (t.state !== 'run') return;
  if (typeof data !== 'string') {
    if (!t.wkey) return xfFail(t, 'proto');
    const r = await kanki.xferWrite(t.wkey, data);
    if (r.error) return xfLocalErr(t, r.error);
    t.done += data.byteLength;
    if (t.done - (t.gotSent || 0) >= 4 * 1024 * 1024) {
      t.gotSent = t.done;
      xfDc(t, { t: 'got', n: t.done });
    }
    xfTick(t);
    return;
  }
  let m;
  try {
    m = JSON.parse(data);
  } catch {
    return;
  }
  if (m.t === 'file') {
    const f = t.files[m.i];
    if (!f) return xfFail(t, 'proto');
    t.cur = m.i;
    const r = await kanki.xferOpen(t.dest, f.name, f.size);
    if (r.error) return xfLocalErr(t, r.error);
    t.wkey = r.key;
  } else if (m.t === 'end') {
    const r = await kanki.xferFinish(t.wkey);
    t.wkey = null;
    if (r.error) return xfLocalErr(t, r.error);
    t.results[m.i] = { ok: r.sha === m.sha, path: r.path };
    t.gotSent = t.done;
    xfDc(t, { t: 'got', n: t.done });
  } else if (m.t === 'all') {
    xfDc(t, { t: 'ok', results: t.results.map((x) => !!x?.ok) });
    xfFinish(t);
  } else if (m.t === 'err') xfFail(t, 'peer', false, m.msg);
}
function xfLocalErr(t, msg) {
  xfDc(t, { t: 'err', msg: `Alan tarafta hata: ${msg}` });
  xfFail(t, 'write', false, msg);
}
const xfDc = (t, m) => {
  try {
    if (t.dc?.readyState === 'open') t.dc.send(JSON.stringify(m));
  } catch {}
};

// ---------------- Bağlantı (sadece STUN; TURN yok) ----------------
function xfPc(t) {
  const iceServers = (S.iceServers || [])
    .map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((u) => /^stun:/i.test(u)) }))
    .filter((s) => s.urls.length)
    .map(({ username, credential, ...s }) => s);
  const pc = new RTCPeerConnection({ iceServers });
  t.pc = pc;
  t.pend = [];
  pc.onicecandidate = (e) => e.candidate && xfSig(t, { cand: e.candidate.toJSON() });
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') xfFail(t, t.state === 'run' ? 'lost' : 'noconn', t.dir === 'out');
  };
  t.connTimer = setTimeout(() => t.state === 'conn' && xfFail(t, 'noconn', t.dir === 'out'), XF.CONNECT_MS);
  return pc;
}
const xfSig = (t, sig) => send({ t: 'xfer', to: t.peerId, kind: 'sig', id: t.id, sig });
async function xfOnSig(t, sig) {
  const pc = t.pc;
  if (!pc || !sig) return;
  try {
    if (sig.sdp) {
      await pc.setRemoteDescription(sig.sdp);
      if (sig.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        xfSig(t, { sdp: pc.localDescription });
      }
      for (const c of t.pend.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (sig.cand) {
      if (pc.remoteDescription) await pc.addIceCandidate(sig.cand).catch(() => {});
      else t.pend.push(sig.cand);
    }
  } catch {
    xfFail(t, 'noconn', t.dir === 'out');
  }
}

// ---------------- Sunucudan gelen el sıkışma ----------------
function onXfer(m) {
  if (m.kind === 'offer') return xfOnOffer(m);
  const t = XF.list.get(m.id);
  if (!t || t.peerId !== m.from) return;
  if (m.kind === 'answer' && t.dir === 'out' && t.state === 'wait') {
    if (m.accept) xfSenderStart(t);
    else xfFail(t, 'rejected');
  } else if (m.kind === 'sig') xfOnSig(t, m.sig);
  else if (m.kind === 'cancel') {
    if (t.state === 'ask') return xfClose(t); // gönderen vazgeçti
    xfFail(t, m.reason === 'busy' ? 'busy' : m.reason === 'unsupported' ? 'unsupported' : m.reason === 'noconn' ? 'noconn' : 'peercancel', t.dir === 'out' && m.reason === 'noconn');
  }
}

// ---------------- Bitiş, hata, iptal ----------------
function xfStop(t) {
  clearTimeout(t.timer);
  clearTimeout(t.connTimer);
  xfWake(t);
  try {
    t.dc?.close();
  } catch {}
  try {
    t.pc?.close();
  } catch {}
  t.dc = t.pc = null;
  if (t.dir === 'in') {
    if (t.wkey) kanki.xferAbort(t.wkey);
    t.wkey = null;
  }
}
function xfFinish(t) {
  if (t.state === 'done') return;
  t.state = 'done';
  t.endAt = Date.now();
  t.done = t.total;
  // Alan taraf "ok" mesajının karşıya ulaşması için bağlantıyı biraz sonra kapatır
  if (t.dir === 'in') setTimeout(() => xfStop(t), 2000);
  else xfStop(t);
  if (t.dir === 'in') kanki.xferForget(t.dest);
  const bad = (t.results || []).filter((x) => !(x === true || x?.ok)).length;
  beep(bad ? 'leave' : 'join');
  if (t.dir === 'out' && !bad) setTimeout(() => t.state === 'done' && xfClose(t), 12000);
  xfRender(t);
}
// keepFiles: gönderende "Tekrar dene" için seçilen dosyalar elde tutulur
function xfFail(t, why, keepFiles = false, msg = '') {
  if (['done', 'err'].includes(t.state)) return;
  const wasActive = ['conn', 'run'].includes(t.state);
  if (why !== 'peercancel' && why !== 'rejected' && why !== 'busy' && why !== 'unsupported' && why !== 'peer')
    send({ t: 'xfer', to: t.peerId, kind: 'cancel', id: t.id, reason: why === 'noconn' ? 'noconn' : why === 'user' ? 'user' : 'error' });
  t.state = 'err';
  t.why = why;
  t.msg = msg;
  xfStop(t);
  if (t.dir === 'in' && t.dest) kanki.xferForget(t.dest);
  if (t.dir === 'out' && !(keepFiles && why === 'noconn')) for (const f of t.files) kanki.xferRelease(f.key);
  t.canRetry = t.dir === 'out' && keepFiles && why === 'noconn';
  if (wasActive && why !== 'user') beep('leave');
  if (why === 'user' || why === 'timeout' && t.dir === 'in') return xfClose(t);
  xfRender(t);
}
function xfCancel(t) {
  if (t.state === 'ask') return xfReject(t);
  xfFail(t, 'user');
}
function xfClose(t) {
  if (['wait', 'conn', 'run'].includes(t.state)) return xfCancel(t);
  if (t.state === 'ask') {
    clearTimeout(t.timer);
    t.state = 'closed';
  }
  if (t.canRetry) for (const f of t.files) kanki.xferRelease(f.key);
  XF.list.delete(t.id);
  t.el?.remove();
  t.el = null;
}
function xfRetry(t) {
  const u = S.users.get(t.peerId) || [...S.users.values()].find((x) => x.name === t.peerName);
  const files = t.files;
  t.canRetry = false;
  XF.list.delete(t.id);
  t.el?.remove();
  if (!u) {
    for (const f of files) kanki.xferRelease(f.key);
    return toast(`${t.peerName} şu an bağlı değil`, '', 'err');
  }
  xferSend(u, files);
}
const XF_WHY = {
  noconn: ['Doğrudan bağlantı kurulamadı', (t) => `${t.peerName} ile senin aranda doğrudan bağlantı kurulamadı (internet ya da ağ izin vermiyor). Dosya sunucu üzerinden gönderilmedi.`],
  lost: ['Bağlantı koptu', (t) => (t.dir === 'in' ? 'Yarım kalan dosya silindi.' : `${t.peerName} ile bağlantı koptu.`)],
  rejected: ['Reddedildi', (t) => `${t.peerName} dosyayı almak istemedi.`],
  timeout: ['Cevap gelmedi', (t) => `${t.peerName} 60 saniye içinde cevap vermedi.`],
  busy: ['Şu an alamıyor', (t) => `${t.peerName} aynı anda en fazla 3 aktarım yapabiliyor.`],
  unsupported: ['Alamıyor', (t) => `${t.peerName} doğrudan dosya alamıyor (eski sürüm ya da tarayıcı).`],
  peercancel: ['İptal edildi', (t) => (t.dir === 'in' ? `${t.peerName} gönderimi iptal etti. Yarım kalan dosya silindi.` : `${t.peerName} aktarımı iptal etti.`)],
  peer: ['Aktarım durdu', (t) => t.msg || 'Karşı tarafta bir hata oldu.'],
  read: ['Dosya okunamadı', (t) => t.msg],
  write: ['Kaydedilemedi', (t) => `${t.msg}. Yarım kalan dosya silindi.`],
  proto: ['Aktarım bozuldu', () => 'Beklenmeyen veri geldi; yarım kalan dosya silindi.'],
};

// ---------------- Hız ve ilerleme ----------------
function xfTick(t) {
  const now = performance.now();
  if (!t.spAt) {
    t.spAt = now;
    t.spBytes = t.done;
    t.speed = 0;
  } else if (now - t.spAt >= 700) {
    const inst = ((t.done - t.spBytes) * 1000) / (now - t.spAt);
    t.speed = t.speed ? t.speed * 0.6 + inst * 0.4 : inst;
    t.spAt = now;
    t.spBytes = t.done;
  }
  if (now - (t.drawAt || 0) > 250) {
    t.drawAt = now;
    xfRender(t);
  }
}

// ---------------- Kartlar ----------------
function xfStack() {
  let s = $('#xfer-stack');
  if (!s) {
    s = h('div', { id: 'xfer-stack' });
    $('#toasts').append(s);
  }
  return s;
}
function xfFileBox(t, sub) {
  return h('div', { class: 'xf-file' }, h('div', { class: 'xf-icon' }, t.files.length > 1 ? `${t.files.length}×` : xfExt(t.files[0].name)), h('div', { class: 'xf-t' }, h('div', { class: 'xf-fn', title: xfTitle(t) }, xfTitle(t)), h('div', { class: 'xf-sub' }, sub)));
}
const xfBtn = (label, cls, fn) => h('button', { class: `xf-b ${cls || ''}`, onclick: fn }, label);
function xfRender(t) {
  if (!XF.list.has(t.id)) return;
  const now = Date.now();
  const toPeer = t.dir === 'out' ? `Kime: ${t.peerName}` : `Kimden: ${t.peerName}`;
  const pct = t.total ? Math.min(100, Math.floor((t.done / t.total) * 100)) : 100;
  let el;
  if (t.mini && t.state === 'run') {
    el = h(
      'div',
      { class: 'xf-mini', title: 'Büyüt', onclick: () => ((t.mini = false), xfRender(t)) },
      h('div', { class: 'xf-r1' }, h('span', { class: `xf-arrow ${t.dir}` }, t.dir === 'out' ? '↑' : '↓'), h('span', { class: 'xf-nm' }, `${xfTitle(t)} ${t.dir === 'out' ? '→' : '←'} ${t.peerName}`), h('span', { class: 'xf-pc' }, `${pct}% · ${xfSize(t.speed || 0)}/s`)),
      h('div', { class: 'xf-bar sm' }, h('i', { class: t.dir, style: `width:${pct}%` }))
    );
  } else {
    el = h('div', { class: `xf-card xf-s-${t.state}` });
    const left = Math.max(0, Math.ceil(((t.dir === 'out' ? t.startAt : t.askAt) + XF.ASK_MS - now) / 1000));
    const timer = () => h('div', { class: 'xf-timer' }, h('i', { style: `width:${(left / (XF.ASK_MS / 1000)) * 100}%` }));
    if (t.state === 'wait') {
      el.append(
        h('div', { class: 'xf-hdr' }, h('span', { class: 'xf-dot amber' }), 'Gönderiliyor · cevap bekleniyor'),
        xfFileBox(t, `${xfSize(t.total)} · ${toPeer}`),
        timer(),
        h('div', { class: 'xf-note' }, `Karşı tarafın kabul etmesi bekleniyor · ${left} sn`),
        h('div', { class: 'xf-btns' }, xfBtn('İptal', 'red', () => xfCancel(t)))
      );
    } else if (t.state === 'ask') {
      const av = avatar(t.peerName, 'xf-av');
      el.append(
        h('div', { class: 'xf-top' }, av, h('div', { class: 'xf-who' }, h('b', {}, t.peerName), t.files.length > 1 ? ` sana ${t.files.length} dosya göndermek istiyor` : ' sana dosya göndermek istiyor')),
        xfFileBox(t, `${xfSize(t.total)}${t.files.length > 1 ? ' toplam' : ''}`),
        h('div', { class: 'xf-btns' }, xfBtn('Reddet', 'red', () => xfReject(t)), xfBtn(t.picking ? 'Kayıt yeri seçiliyor…' : 'Kabul et ve kaydet…', 'pri', () => xfAccept(t))),
        timer(),
        h('div', { class: 'xf-note' }, h('span', { class: 'xf-lock' }, '🔒'), ` Doğrudan senin bilgisayarına gelir, sunucudan geçmez · ${left} sn`)
      );
    } else if (t.state === 'conn') {
      el.append(
        h('div', { class: 'xf-hdr' }, h('span', { class: 'xf-dot amber' }), 'Doğrudan bağlantı kuruluyor…'),
        xfFileBox(t, `${xfSize(t.total)} · ${toPeer}`),
        h('div', { class: 'xf-btns' }, xfBtn('İptal', 'red', () => xfCancel(t)))
      );
    } else if (t.state === 'run') {
      const eta = t.speed > 0 ? xfDur((t.total - t.done) / t.speed) : '…';
      const multi = t.files.length > 1 ? ` · ${(t.cur || 0) + 1}/${t.files.length}` : '';
      el.append(
        h('div', { class: 'xf-hdr' }, h('span', { class: 'xf-dot' }), t.dir === 'out' ? 'Gönderiliyor · doğrudan bağlantı' : 'Alınıyor · doğrudan bağlantı', h('span', { class: 'xf-x', title: 'Küçült', onclick: () => ((t.mini = true), xfRender(t)) }, '—')),
        xfFileBox(t, `${toPeer}${multi}`),
        h('div', { class: 'xf-bar' }, h('i', { class: t.dir, style: `width:${pct}%` })),
        h('div', { class: 'xf-stats' }, h('span', {}, h('b', {}, xfSize(t.done)), ` / ${xfSize(t.total)} · `, h('b', {}, `${pct}%`)), h('span', {}, h('b', {}, `${xfSize(t.speed || 0)}/s`), ` · ${eta}`)),
        h('div', { class: 'xf-btns' }, xfBtn('Küçült', 'sm', () => ((t.mini = true), xfRender(t))), h('span', { class: 'xf-sp' }), xfBtn('İptal', 'sm red', () => xfCancel(t)))
      );
    } else if (t.state === 'done') {
      const secs = Math.max(1, (t.endAt - t.startAt) / 1000);
      const res = t.results || [];
      const bad = res.filter((x) => !(x === true || x?.ok)).length;
      el.append(xfFileBox(t, `${xfSize(t.total)} · ${xfDur(secs)} · ort. ${xfSize(t.total / secs)}/s`));
      if (bad) el.append(h('div', { class: 'xf-err' }, h('span', { class: 'xf-ic' }, '⚠'), h('div', {}, t.files.length > 1 ? `${bad} dosya bozuk geldi` : 'Dosya bozuk geldi', h('small', {}, 'Özetler (SHA-256) uyuşmadı; dosyayı tekrar göndermek iyi olur.'))));
      else if (t.dir === 'in') el.append(h('div', { class: 'xf-ok' }, `✓ ${t.files.length > 1 ? 'Dosyalar' : 'Dosya'} sağlam geldi `, h('span', { class: 'xf-dim' }, '(SHA-256 eşleşti)')));
      else el.append(h('div', { class: 'xf-ok' }, `✓ ${t.peerName} ${t.files.length > 1 ? 'dosyaları' : 'dosyayı'} sağlam aldı`));
      const p = res.find((x) => x?.path)?.path;
      if (t.dir === 'in' && p)
        el.append(h('div', { class: 'xf-btns' }, xfBtn('Klasörde göster', '', () => kanki.xferReveal(p)), t.files.length === 1 ? xfBtn('Aç', 'pri', () => kanki.xferOpenFile(p)) : null, xfBtn('Kapat', 'sm', () => xfClose(t))));
      else el.append(h('div', { class: 'xf-btns' }, xfBtn('Kapat', '', () => xfClose(t))));
    } else if (t.state === 'err') {
      const [title, sub] = XF_WHY[t.why] || ['Aktarım durdu', () => t.msg || ''];
      el.append(
        xfFileBox(t, `${xfSize(t.total)} · ${toPeer}`),
        h('div', { class: 'xf-err' }, h('span', { class: 'xf-ic' }, '⚠'), h('div', {}, title, h('small', {}, sub(t)))),
        h('div', { class: 'xf-btns' }, xfBtn('Kapat', '', () => xfClose(t)), t.canRetry ? xfBtn('Tekrar dene', '', () => xfRetry(t)) : null)
      );
    }
  }
  if (t.el) t.el.replaceWith(el);
  else xfStack().append(el);
  t.el = el;
}
// Geri sayımlar saniyede bir güncellensin
setInterval(() => {
  for (const t of XF.list.values()) if (t.state === 'wait' || t.state === 'ask') xfRender(t);
}, 1000);
// Bekleyen istekte kişi sunucudan çıkarsa istek düşer
setInterval(() => {
  for (const t of XF.list.values()) if ((t.state === 'wait' || t.state === 'ask') && S.myId && !S.users.has(t.peerId)) t.state === 'ask' ? xfClose(t) : xfFail(t, 'lost');
}, 3000);
