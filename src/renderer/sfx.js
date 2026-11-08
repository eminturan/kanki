'use strict';
/* Ses efektleri (soundboard).
 * - Hazır sesler burada WebAudio ile üretilir: dosya yok, telif derdi yok, uygulamaya ek boyut yok.
 * - Ses kanaldakilere dosya olarak gitmez: sunucu sadece sesin adını iletir, her uygulama sesi kendisi üretip çalar.
 */
const KankiSfx = (() => {
  const SR = 44100; // hazır seslerin üretim örnekleme hızı
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- küçük yapı taşları -------------------------------------------------
  function noiseBuf(ctx, sec) {
    const b = ctx.createBuffer(1, Math.ceil(sec * ctx.sampleRate), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function filt(ctx, type, freq, Q = 0.7, dest) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    if (dest) f.connect(dest);
    return f;
  }
  function gainNode(ctx, dest, v = 1) {
    const g = ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  // Kısa gürültü patlaması (alkış, trampet, vuruş tıkı)
  function burst(ctx, nb, dest, t, amp = 1, decay = 0.08, attack = 0.001) {
    const s = ctx.createBufferSource();
    s.buffer = nb;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    s.connect(g).connect(dest);
    const len = attack + decay + 0.01;
    s.start(t, Math.random() * Math.max(0, nb.duration - len), len);
  }
  // Basit ton: verilen zarfla (attack, decay) çalan osilatör
  function tone(ctx, dest, t, { type = 'sine', f, f2, glide = 0.1, amp = 1, a = 0.003, d = 0.4 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.02);
    return o;
  }
  function tom(ctx, nb, dest, t, f0, f1, d = 0.4, amp = 1) {
    tone(ctx, dest, t, { f: f0, f2: f1, glide: d * 0.6, amp, d });
    burst(ctx, nb, filt(ctx, 'lowpass', 3000, 0.7, dest), t, amp * 0.3, 0.025);
  }
  function snare(ctx, nb, dest, t, amp = 1, d = 0.16) {
    burst(ctx, nb, filt(ctx, 'highpass', 1400, 0.7, dest), t, amp, d);
    tone(ctx, dest, t, { type: 'triangle', f: 230, f2: 165, glide: 0.07, amp: amp * 0.45, d: 0.08 });
  }
  // 808 tarzı zil: uyumsuz kare dalgalar + yüksek frekanslı gürültü
  function cymbal(ctx, nb, dest, t, d = 1.3, amp = 0.7) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g.connect(dest);
    const hp = filt(ctx, 'highpass', 6500, 0.6, g);
    const sq = gainNode(ctx, hp, 0.12);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 1.7;
      o.connect(sq);
      o.start(t);
      o.stop(t + d + 0.02);
    }
    const n = ctx.createBufferSource();
    n.buffer = nb;
    n.loop = true;
    n.connect(filt(ctx, 'highpass', 5000, 0.7, gainNode(ctx, g, 0.7)));
    n.start(t);
    n.stop(t + d + 0.02);
  }
  const shaperCurve = (k) => {
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return c;
  };
  // Bakır nefesli benzeri ses: çift (hafif ayrık akortlu) testere dalga + açılıp kapanan filtre
  function brass(ctx, dest, t, dur, freqs, o = {}) {
    const { cut = [400, 2400, 1100], a = 0.03, r = 0.07, amp = 0.3, vib = 0, vibAt = 0.15, detune = 7, type = 'sawtooth', q = 1, bend = 0, drop = 0, shape = 0 } = o;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    g.gain.setValueAtTime(amp, t + dur - r);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(dest);
    const lp = filt(ctx, 'lowpass', cut[0], q);
    lp.frequency.setValueAtTime(cut[0], t);
    lp.frequency.linearRampToValueAtTime(cut[1], t + Math.min(0.09, dur / 3));
    lp.frequency.linearRampToValueAtTime(cut[2], t + dur);
    if (shape) {
      const ws = ctx.createWaveShaper();
      ws.curve = shaperCurve(shape);
      lp.connect(ws).connect(g);
    } else lp.connect(g);
    let lg = null;
    if (vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.6;
      lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + vibAt);
      lg.gain.linearRampToValueAtTime(vib, t + vibAt + 0.25);
      lfo.connect(lg);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    const n = freqs.length * 2;
    for (const f of freqs)
      for (const dt of [-detune, detune]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(bend ? f * bend : f, t);
        if (bend) osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        osc.detune.setValueAtTime(dt, t);
        if (drop) {
          osc.detune.setValueAtTime(dt, t + dur - 0.6);
          osc.detune.linearRampToValueAtTime(dt - drop, t + dur);
        }
        if (lg) lg.connect(osc.detune);
        osc.connect(gainNode(ctx, lp, 1 / n));
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
  }
  // Frekansı eğriyle değişen ton (boing gibi)
  function curveTone(ctx, dest, t, dur, fn, { type = 'sine', amp = 1, a = 0.005 } = {}) {
    const N = 600;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) curve[i] = fn((i / (N - 1)) * dur);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueCurveAtTime(curve, t, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  // ---- hazır sesler -------------------------------------------------------
  // level: ses yüksekliği dengelendikten sonra ek çarpan (tiz ya da sürekli sesler kulak tırmalamasın)
  const SOUNDS = {
    clap: {
      name: 'Alkış',
      emoji: '👏',
      dur: 3.0,
      build(ctx, out, nb) {
        const body = filt(ctx, 'lowpass', 700, 0.7, gainNode(ctx, out, 0.25));
        for (let p = 0; p < 18; p++) {
          const rate = rnd(3.4, 5.2);
          const f = rnd(900, 2600);
          const bp = filt(ctx, 'bandpass', f, rnd(0.9, 1.6), out);
          const stop = rnd(1.9, 2.8);
          let t = rnd(0, 0.35);
          while (t < stop) {
            const rise = Math.min(1, t / 0.35);
            const fall = Math.max(0, Math.min(1, (stop - t) / 0.5));
            const amp = rnd(0.5, 1) * rise * fall;
            burst(ctx, nb, bp, t, amp, rnd(0.03, 0.06));
            if (Math.random() < 0.3) burst(ctx, nb, body, t, amp * 0.6, 0.05);
            t += (1 / rate) * rnd(0.85, 1.15);
          }
        }
      },
    },
    rimshot: {
      name: 'Ba-dum-tss',
      emoji: '🤣',
      dur: 1.9,
      build(ctx, out, nb) {
        tom(ctx, nb, out, 0.02, 210, 150, 0.3, 0.9);
        tom(ctx, nb, out, 0.24, 130, 92, 0.42, 1);
        tone(ctx, out, 0.5, { f: 95, f2: 48, glide: 0.12, amp: 1, d: 0.35 });
        snare(ctx, nb, out, 0.5, 0.35, 0.1);
        cymbal(ctx, nb, out, 0.5, 1.35, 0.85);
      },
    },
    roll: {
      name: 'Davul',
      emoji: '🥁',
      dur: 3.7,
      build(ctx, out, nb) {
        const end = 2.15;
        let i = 0;
        for (let t = 0.02; t < end; t += 1 / 24, i++) {
          const k = t / end;
          snare(ctx, nb, out, t + rnd(-0.003, 0.003), (0.1 + 0.9 * k * k) * (i % 2 ? 0.82 : 1), 0.09);
        }
        tone(ctx, out, end + 0.04, { f: 90, f2: 42, glide: 0.15, amp: 1.2, d: 0.5 });
        snare(ctx, nb, out, end + 0.04, 0.8, 0.2);
        cymbal(ctx, nb, out, end + 0.04, 1.5, 1);
      },
    },
    tada: {
      name: 'Tada',
      emoji: '🎉',
      dur: 1.9,
      build(ctx, out, nb) {
        brass(ctx, out, 0, 0.15, [392, 784], { cut: [1200, 4200, 2600], a: 0.012, r: 0.03, amp: 0.8 });
        snare(ctx, nb, out, 0, 0.25, 0.08);
        brass(ctx, out, 0.18, 1.5, [523.25, 659.25, 783.99, 1046.5], { cut: [900, 4800, 1600], a: 0.02, r: 0.35, amp: 1, vib: 14, vibAt: 0.3 });
        cymbal(ctx, nb, out, 0.18, 1.4, 0.35);
        tone(ctx, out, 0.18, { f: 130, f2: 65, glide: 0.12, amp: 0.7, d: 0.4 });
      },
    },
    horn: {
      name: 'Korna',
      emoji: '📯',
      dur: 1.5,
      level: 0.85,
      build(ctx, out) {
        const blasts = [[0, 0.17], [0.23, 0.17], [0.46, 0.95]];
        for (const [t, d] of blasts) brass(ctx, out, t, d, [392, 466.16, 784], { cut: [2600, 5200, 3800], a: 0.012, r: 0.04, amp: 1, detune: 14, bend: 0.86, shape: 2.5, q: 2 });
      },
    },
    trombone: {
      name: 'Olmadı',
      emoji: '🎺',
      dur: 3.1,
      build(ctx, out) {
        const notes = [[0, 0.44, 146.83], [0.5, 0.44, 138.59], [1.0, 0.44, 130.81]];
        for (const [t, d, f] of notes) brass(ctx, out, t, d, [f], { cut: [260, 1500, 450], a: 0.06, r: 0.08, amp: 0.9, detune: 5, q: 3 });
        brass(ctx, out, 1.5, 1.55, [123.47], { cut: [260, 1500, 380], a: 0.06, r: 0.25, amp: 1, detune: 5, q: 3, vib: 45, vibAt: 0.25, drop: 90 });
      },
    },
    correct: {
      name: 'Doğru',
      emoji: '✅',
      dur: 1.2,
      level: 0.75,
      build(ctx, out) {
        for (const [t, f, d] of [[0, 1046.5, 0.3], [0.13, 1568, 1.0]]) {
          tone(ctx, out, t, { f, amp: 0.7, d });
          tone(ctx, out, t, { type: 'triangle', f: f * 2, amp: 0.12, d: d * 0.5 });
          tone(ctx, out, t, { f: f * 3, amp: 0.06, d: d * 0.3 });
        }
      },
    },
    wrong: {
      name: 'Yanlış',
      emoji: '❌',
      dur: 1.0,
      level: 0.8,
      build(ctx, out) {
        brass(ctx, out, 0, 0.24, [146, 151], { type: 'square', cut: [1800, 1800, 1500], a: 0.008, r: 0.03, amp: 1, detune: 0 });
        brass(ctx, out, 0.3, 0.62, [146, 151], { type: 'square', cut: [1800, 1800, 900], a: 0.008, r: 0.06, amp: 1, detune: 0, drop: 60 });
      },
    },
    bell: {
      name: 'Zil',
      emoji: '🛎️',
      dur: 2.3,
      level: 0.7,
      build(ctx, out, nb) {
        const f0 = 1760;
        const parts = [[1, 1, 2.2], [1.0012, 0.5, 2.0], [2.0, 0.42, 1.5], [2.76, 0.45, 1.1], [5.4, 0.22, 0.6], [8.93, 0.12, 0.35]];
        for (const [r, amp, d] of parts) tone(ctx, out, 0.01, { f: f0 * r, amp, a: 0.002, d });
        burst(ctx, nb, filt(ctx, 'highpass', 3000, 0.7, out), 0.01, 0.25, 0.02);
      },
    },
    crickets: {
      name: 'Cırcır',
      emoji: '🦗',
      dur: 3.2,
      level: 0.45,
      build(ctx, out, nb) {
        const air = ctx.createBufferSource();
        air.buffer = nb;
        air.loop = true;
        const ag = gainNode(ctx, out, 0);
        ag.gain.setValueAtTime(0, 0);
        ag.gain.linearRampToValueAtTime(0.04, 0.4);
        ag.gain.setValueAtTime(0.04, 2.7);
        ag.gain.linearRampToValueAtTime(0, 3.15);
        air.connect(filt(ctx, 'lowpass', 350, 0.7, ag));
        air.start(0);
        air.stop(3.2);
        for (const cr of [{ f: 4400, t0: 0.08, per: 0.56 }, { f: 5150, t0: 0.33, per: 0.71 }]) {
          for (let t = cr.t0; t < 2.9; t += cr.per * rnd(0.92, 1.08)) {
            for (let p = 0; p < 3; p++) {
              const tp = t + p * 0.032;
              const o = ctx.createOscillator();
              o.frequency.value = cr.f;
              const g = ctx.createGain();
              g.gain.setValueAtTime(0, tp);
              g.gain.linearRampToValueAtTime(0.5, tp + 0.004);
              g.gain.setValueAtTime(0.5, tp + 0.014);
              g.gain.linearRampToValueAtTime(0, tp + 0.022);
              o.connect(g).connect(out);
              o.start(tp);
              o.stop(tp + 0.025);
            }
          }
        }
      },
    },
    dramatic: {
      name: 'Dramatik',
      emoji: '😱',
      dur: 2.7,
      build(ctx, out) {
        const hits = [[0, 0.3, [146.83, 293.66]], [0.36, 0.3, [174.61, 349.23]], [0.72, 1.95, [138.59, 164.81, 196.0, 233.08, 277.18]]];
        for (const [t, d, fs] of hits) {
          brass(ctx, out, t, d, fs, { cut: [500, 2600, 900], a: 0.015, r: d > 1 ? 0.6 : 0.06, amp: 1, vib: d > 1 ? 18 : 0, vibAt: 0.2 });
          tone(ctx, out, t, { f: fs[0] / 2, f2: fs[0] / 2.2, glide: 0.3, amp: 0.9, d: d > 1 ? 1.2 : 0.35 });
        }
      },
    },
    boing: {
      name: 'Boing',
      emoji: '🤪',
      dur: 1.2,
      build(ctx, out) {
        const fn = (t) => (210 + 170 * (t / 1.15)) * (1 + 0.36 * Math.sin(2 * Math.PI * 13 * t) * Math.exp(-2.6 * t));
        curveTone(ctx, out, 0.01, 1.15, fn, { amp: 1 });
        curveTone(ctx, filt(ctx, 'lowpass', 1600, 2, out), 0.01, 1.15, (t) => fn(t) * 2, { type: 'sawtooth', amp: 0.18 });
      },
    },
    laser: {
      name: 'Lazer',
      emoji: '⚡',
      dur: 0.8,
      level: 0.7,
      build(ctx, out) {
        const lp = filt(ctx, 'lowpass', 5000, 0.7, out);
        for (const t of [0, 0.2, 0.4]) tone(ctx, lp, t, { type: 'square', f: 1700, f2: 160, glide: 0.17, amp: 0.8, d: 0.18 });
      },
    },
    heart: {
      name: 'Kalp',
      emoji: '💓',
      dur: 2.5,
      build(ctx, out, nb) {
        const lp = filt(ctx, 'lowpass', 400, 0.7, out);
        for (const t of [0.02, 0.85, 1.68]) {
          tom(ctx, nb, lp, t, 75, 48, 0.22, 1);
          tom(ctx, nb, lp, t + 0.17, 68, 44, 0.26, 0.75);
        }
      },
    },
    party: {
      name: 'Parti',
      emoji: '🥳',
      dur: 1.3,
      level: 0.8,
      build(ctx, out, nb) {
        const g = gainNode(ctx, out, 0);
        g.gain.setValueAtTime(0, 0);
        g.gain.linearRampToValueAtTime(1, 0.04);
        g.gain.setValueAtTime(1, 1.05);
        g.gain.linearRampToValueAtTime(0, 1.2);
        // ağızlık titreşimi: ses 26 Hz ile dalgalanır
        const trem = ctx.createGain();
        trem.gain.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 26;
        const lg = gainNode(ctx, trem.gain, 0.4);
        lfo.connect(lg);
        lfo.start(0);
        lfo.stop(1.25);
        trem.connect(g);
        const ws = ctx.createWaveShaper();
        ws.curve = shaperCurve(3);
        const bp = filt(ctx, 'bandpass', 1300, 1.5);
        bp.connect(ws).connect(trem);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(380, 0);
        o.frequency.linearRampToValueAtTime(520, 0.25);
        o.frequency.linearRampToValueAtTime(500, 1.2);
        o.connect(bp);
        o.start(0);
        o.stop(1.25);
        const n = ctx.createBufferSource();
        n.buffer = nb;
        n.loop = true;
        n.connect(filt(ctx, 'highpass', 2500, 0.7, gainNode(ctx, g, 0.12)));
        n.start(0);
        n.stop(1.25);
      },
    },
    censor: {
      name: 'Sansür',
      emoji: '🤐',
      dur: 0.75,
      level: 0.55,
      build(ctx, out) {
        const g = gainNode(ctx, out, 0);
        g.gain.setValueAtTime(0, 0.01);
        g.gain.linearRampToValueAtTime(1, 0.016);
        g.gain.setValueAtTime(1, 0.66);
        g.gain.linearRampToValueAtTime(0, 0.67);
        const o = ctx.createOscillator();
        o.frequency.value = 1000;
        o.connect(g);
        o.start(0);
        o.stop(0.7);
      },
    },
  };
  const ORDER = ['clap', 'rimshot', 'roll', 'tada', 'horn', 'trombone', 'correct', 'wrong', 'bell', 'crickets', 'dramatic', 'boing', 'laser', 'heart', 'party', 'censor'];
  const BUILTIN = ORDER.map((id) => ({ sid: id, name: SOUNDS[id].name, emoji: SOUNDS[id].emoji }));

  // Ses yüksekliğini dengele: en yüksek 50 ms'lik bölümün RMS'i hedefe çekilir, tepe 0.95'i geçmez
  function normalize(d, { target = 0.22, maxGain = Infinity, rate = SR } = {}) {
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const win = Math.max(64, Math.round(rate * 0.05));
    let maxRms = 0;
    for (let i = 0; i + win <= d.length || i === 0; i += win >> 1) {
      let s = 0;
      const end = Math.min(d.length, i + win);
      for (let j = i; j < end; j++) s += d[j] * d[j];
      maxRms = Math.max(maxRms, Math.sqrt(s / Math.max(1, end - i)));
      if (end >= d.length) break;
    }
    if (!peak || !maxRms) return d;
    const g = Math.min(target / maxRms, 0.95 / peak, maxGain);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    return d;
  }

  const cache = new Map();
  function builtin(id) {
    const def = SOUNDS[id];
    if (!def) return Promise.resolve(null);
    if (!cache.has(id)) {
      const ctx = new OfflineAudioContext(1, Math.ceil(def.dur * SR), SR);
      const out = gainNode(ctx, ctx.destination, 1);
      def.build(ctx, out, noiseBuf(ctx, 1));
      cache.set(
        id,
        ctx.startRendering().then((buf) => {
          normalize(buf.getChannelData(0), { target: 0.22 * (def.level || 1), rate: SR });
          return buf;
        })
      );
    }
    return cache.get(id);
  }
  const isBuiltin = (id) => Object.prototype.hasOwnProperty.call(SOUNDS, id);

  return { BUILTIN, builtin, isBuiltin };
})();
