'use strict';
// =====================================================================
//  Oyun odası: ses kanalının ortasında isteğe bağlı 3 boyutlu oda (Three.js r128, vendor/three).
//  Sunucuya bir şey göndermez; S.users / S.avatars / izlenen yayınlardan çizer.
// =====================================================================
const room = { mounted: false, el: null, renderer: null, scene: null, camera: null, raf: 0, fps: 0, bloom: false, chars: new Map() };

let roomWebgl = null; // WebGL açılabiliyor mu (bir kez denenir)
function roomSupported() {
  if (S.web || !window.THREE) return false;
  if (roomWebgl === null) {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      roomWebgl = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      roomWebgl = false;
    }
  }
  return roomWebgl;
}
// Büyüt modunda (S.roomTiles) oda kapanır, bugünkü yayın pencereleri açılır
const roomActive = () => !!(settings.roomView && S.channelId && !S.roomTiles && roomSupported());

function roomMount(el) {
  if (room.mounted) return true;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      // Odayı kendimiz kapatınca (forceContextLoss) da bu olay gelir; sadece açık odanın bağlamı koparsa hata say
      if (room.renderer === renderer) roomFail('Ekran kartı bağlantısı koptu.');
    });
    el.append(renderer.domElement);
    room.tags = el.appendChild(document.createElement('div'));
    room.tags.className = 'rm-tags';
    room.bar = el.appendChild(document.createElement('div'));
    room.bar.className = 'rm-bar';
    room.bar.innerHTML = '<button data-e="wave" title="El salla">👋</button><button data-e="dance" title="Dans et">💃</button><button class="rm-auto" hidden title="Karakterin kendi gezsin">🤖 Otomatik</button>';
    room.bar.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.e) send({ t: 'room', kind: 'emote', emote: b.dataset.e });
      else {
        send({ t: 'room', kind: 'auto' });
        b.hidden = true;
      }
    };
    room.emotes = new Map();
    room.pings = [];
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = roomTheme().exp;
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(roomTheme().bg);
    scene.fog = new THREE.FogExp2(roomTheme().bg, roomTheme().fog);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.78);
    composer.addPass(bloomPass);
    Object.assign(room, { mounted: true, el, renderer, scene, camera, composer, bloomPass, view: { yaw: 0, pitch: 0.62, dist: 15 }, anim: [], t0: performance.now(), slow: { n: 0, ms: 0 } });
    roomBuild();
    roomControls();
    room.ro = new ResizeObserver(roomResize);
    room.ro.observe(el);
    roomResize();
    roomPerf();
    room.last = 0;
    room.fpsWin = [];
    room.raf = requestAnimationFrame(roomFrame);
    return true;
  } catch (e) {
    console.warn('[kanki] room mount failed', e?.stack || e);
    roomUnmount();
    return false;
  }
}

function roomUnmount() {
  cancelAnimationFrame(room.raf);
  room.ro?.disconnect();
  room.off?.();
  if (room.renderer) {
    room.renderer.dispose();
    room.renderer.forceContextLoss();
  }
  if (room.tvVideo) room.tvVideo.srcObject = null;
  room.tvTex?.dispose();
  room.envRT?.dispose();
  room.el?.replaceChildren();
  room.chars.clear();
  room.tags = null;
  Object.assign(room, { mounted: false, el: null, renderer: null, scene: null, camera: null, composer: null, bloomPass: null, raf: 0, fps: 0, bloom: false, ro: null, off: null, anim: [], tvVideo: null, tvTex: null, tvKey: null, tvList: [], tvBar: null, envRT: null, rv: null, bubbles: null, bar: null, emotes: null, pings: [], vac: null });
}

function roomFail(why) {
  roomUnmount();
  toast('3D oda açılamadı', `${why} Klasik görünüme geçildi.`, 'err', 7000);
  settings.roomView = false;
  saveSettings();
  renderStage();
}

function roomDebug() {
  const v = room.tvVideo;
  const tv = { key: room.tvKey || null, playing: !!(v && v.srcObject && v.readyState >= 2 && !v.paused) };
  const mem = room.renderer ? { ...room.renderer.info.memory } : {};
  return { mounted: room.mounted, fps: room.fps, bloom: room.bloom, tv, mem, follow: room.follow || null, vac: room.rv?.pose || null, chars: Object.fromEntries([...room.chars].map(([id, c]) => [id, c.debug || {}])) };
}

// ---------- Sahne ----------
// Oda temaları (sunucu genelinde; sunucuyu yönetme yetkisi olan seçer). neon: ilk tasarım
const ROOM_THEMES = {
  neon: { bg: 0x020203, fog: 0.012, exp: 1.15, hemi: [0x8a90ff, 0x1a0508, 0.55], key: 0.55, walls: [0x1b1320, 0x151522], neon: [0xff3048, 0x3a6bff, 0xb04dff], lights: [0xff3048, 0x3a6bff, 0xb04dff], led: true, beams: 0.045, wood: [22, 34, 12], dust: 0xffc0d0 },
  club: { bg: 0x000000, fog: 0.02, exp: 1.25, hemi: [0x40206a, 0x050008, 0.22], key: 0.12, walls: [0x0b0812, 0x09080f], neon: [0xff00b4, 0x00e5ff, 0x8a2bff], lights: [0xff00b4, 0x00e5ff, 0x8a2bff], led: true, beams: 0.09, sweep: true, disco: true, wood: [260, 20, 7], dust: 0xd0a0ff },
  retro: { bg: 0x0d0020, fog: 0.014, exp: 1.15, hemi: [0xff7ad9, 0x2a0050, 0.55], key: 0.4, walls: [0x2a0a4a, 0x200840], neon: [0xff7a00, 0xff2fd0, 0x00f0ff], lights: [0xff7a00, 0xff2fd0, 0x00f0ff], led: true, beams: 0.05, grid: true, dust: 0xffb0ff, sunset: true },
};
const roomTheme = () => ROOM_THEMES[S.roomTheme] || ROOM_THEMES.neon;
const RW = 20, RD = 15; // oda genişliği / derinliği
// Görev yerleri [x, z] (karakterler buralara gider)
const ROOM_SPOTS = {
  tv: [[-1.6, 1.5], [0, 1.5], [1.6, 1.5]],
  desk: [[-RW / 2 + 2.3, -3.4], [-RW / 2 + 2.3, 0], [-RW / 2 + 2.3, 3.4]],
  arcade: [[RW / 2 - 2, -4.5]],
  foos: [[RW / 2 - 3.5, 2.4], [RW / 2 - 3.5, 4.8]],
  puf: [[-3.6, -1.5], [3.6, -1.5]],
};
const rmMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const rmGlow = (c, i = 2.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, toneMapped: false });
function rmBox(w, h, d, mat, x, y, z, parent = room.scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function rmCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), c);
  return c;
}
function rmLight(c, x, y, z, i = 1.4, d = 12) {
  const l = new THREE.PointLight(c, i, d);
  l.position.set(x, y, z);
  room.scene.add(l);
  return l;
}

function roomBuild() {
  const sc = room.scene;
  const W = RW, D = RD;
  const th = roomTheme();
  sc.add(new THREE.HemisphereLight(...th.hemi));
  const key = new THREE.DirectionalLight(0xffffff, th.key);
  key.position.set(6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  sc.add(key);
  rmLight(th.lights[0], -8, 3, -6);
  rmLight(th.lights[1], 8, 3, -6);
  rmLight(th.lights[2], 0, 3.5, 6, 0.9, 14);

  // zemin: koyu ahşap parke
  const floorTex = new THREE.CanvasTexture(
    rmCanvas(512, 512, (g) => {
      const rows = 8, h = 512 / rows;
      for (let r = 0; r < rows; r++) {
        for (let x = -((r * 157) % 256); x < 512; ) {
          const w = 170 + ((r * 53 + x * 7) & 127);
          g.fillStyle = th.grid ? '#120326' : `hsl(${th.wood[0] + ((r + x) % 5)}, ${th.wood[1]}%, ${th.wood[2] + ((r * 7 + x) & 7) * 0.9}%)`;
          g.fillRect(x, r * h, w, h);
          g.strokeStyle = 'rgba(0,0,0,0.22)';
          g.lineWidth = 1;
          for (let k = 0; k < 6; k++) {
            const y = r * h + 6 + (k * (h - 12)) / 5;
            g.beginPath();
            g.moveTo(x, y);
            g.bezierCurveTo(x + w / 3, y + 3, x + (2 * w) / 3, y - 3, x + w, y + 1);
            g.stroke();
          }
          g.fillStyle = '#07050a';
          g.fillRect(x, r * h, 2, h);
          x += w;
        }
        g.fillStyle = '#07050a';
        g.fillRect(0, r * h, 512, 2);
      }
      if (th.grid) {
        g.strokeStyle = '#ff2fd0';
        g.shadowColor = '#ff2fd0';
        g.shadowBlur = 8;
        g.lineWidth = 3;
        for (let i = 0; i <= 512; i += 64) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
          g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
        }
      }
    })
  );
  floorTex.encoding = THREE.sRGBEncoding;
  floorTex.anisotropy = 4;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 5, D / 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.4, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  sc.add(floor);
  room.floor = floor;

  // duvarlar: kameraya bakan gizlenir; neon şeritler duvara bağlı
  room.walls = [
    [rmBox(W, 5, 0.3, rmMat(th.walls[0]), 0, 2.5, -D / 2), new THREE.Vector3(0, 0, -1)],
    [rmBox(0.3, 5, D, rmMat(th.walls[1]), -W / 2, 2.5, 0), new THREE.Vector3(-1, 0, 0)],
    [rmBox(0.3, 5, D, rmMat(th.walls[1]), W / 2, 2.5, 0), new THREE.Vector3(1, 0, 0)],
    [rmBox(W, 5, 0.3, rmMat(th.walls[0]), 0, 2.5, D / 2), new THREE.Vector3(0, 0, 1)],
  ];
  rmBox(W - 1, 0.08, 0.08, rmGlow(th.neon[0]), 0, 2.1, 0.2, room.walls[0][0]);
  rmBox(0.08, 0.08, D - 1, rmGlow(th.neon[1]), 0.2, 2.1, 0, room.walls[1][0]);
  rmBox(0.08, 0.08, D - 1, rmGlow(th.neon[2]), -0.2, 2.1, 0, room.walls[2][0]);

  // "KANKİ" tabelası (arada titrer) ve kumanda tabelası
  const signCan = rmCanvas(512, 160, () => {});
  const signTex = new THREE.CanvasTexture(signCan);
  const drawSign = (on) => {
    const g = signCan.getContext('2d');
    g.clearRect(0, 0, 512, 160);
    g.font = 'italic 900 112px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const sc0 = '#' + new THREE.Color(th.neon[0]).getHexString();
    g.shadowColor = sc0;
    g.shadowBlur = on ? 30 : 6;
    g.strokeStyle = on ? '#ffffff' : '#333';
    g.lineWidth = 5;
    g.strokeText('KANKİ', 256, 84);
    g.fillStyle = on ? sc0 : '#222';
    g.fillText('KANKİ', 256, 84);
    signTex.needsUpdate = true;
  };
  drawSign(true);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.25), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(-6.6, 3.3, -D / 2 + 0.2);
  sc.add(sign);
  const signLight = rmLight(th.neon[0], -6.6, 3, -D / 2 + 1.2, 1.6, 8);
  let flick = false;
  room.anim.push((now) => {
    const f = now % 7000 > 6500 && Math.random() < 0.5;
    if (f !== flick) {
      flick = f;
      drawSign(!f);
      signLight.intensity = f ? 0.2 : 1.6;
    }
  });
  const pad = rmCanvas(256, 256, (g) => {
    g.strokeStyle = '#3ad0ff'; g.lineWidth = 9; g.shadowColor = '#3ad0ff'; g.shadowBlur = 20; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(60, 100); g.quadraticCurveTo(128, 80, 196, 100); g.quadraticCurveTo(240, 190, 200, 196); g.quadraticCurveTo(170, 196, 150, 160);
    g.lineTo(106, 160); g.quadraticCurveTo(86, 196, 56, 196); g.quadraticCurveTo(16, 190, 60, 100); g.stroke();
    g.beginPath(); g.moveTo(80, 135); g.lineTo(104, 135); g.moveTo(92, 123); g.lineTo(92, 147); g.stroke();
    g.fillStyle = '#ff3a8a';
    for (const [x, y] of [[165, 128], [182, 142]]) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
  });
  const padM = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pad), transparent: true, toneMapped: false }));
  padM.position.set(6.6, 3.2, -D / 2 + 0.2);
  sc.add(padM);
  rmLight(0x3ad0ff, 6.6, 3, -D / 2 + 1.2, 1.2, 7);

  // zemin kenarında renk değiştiren RGB LED
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
  rmBox(W - 0.6, 0.04, 0.06, ledMat, 0, 0.03, -D / 2 + 0.2);
  rmBox(0.06, 0.04, D - 0.6, ledMat, -W / 2 + 0.2, 0.03, 0);
  rmBox(0.06, 0.04, D - 0.6, ledMat, W / 2 - 0.2, 0.03, 0);
  room.anim.push((now) => ledMat.color.setHSL((now * (th.sweep ? 0.0004 : 0.00008)) % 1, 1, 0.55));
  ledMat.visible = th.led;

  // tavan lambaları ve ışık konileri
  room.beams = [];
  [[-5, -2], [5, -2], [0, 3]].forEach(([x, z], i) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 5, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: th.lights[i], transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.position.set(x, 2.5, z);
    sc.add(cone);
    room.beams.push(cone);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 20), new THREE.MeshBasicMaterial({ color: th.lights[i], toneMapped: false }));
    lamp.position.set(x, 4.98, z);
    sc.add(lamp);
  });
  room.anim.push((now) =>
    room.beams.forEach((b, i) => {
      b.material.opacity = th.beams ? th.beams + Math.sin(now * 0.0015 + i * 2) * 0.02 : 0;
      if (th.sweep) b.rotation.set(Math.sin(now * 0.0011 + i * 2.1) * 0.45, 0, Math.cos(now * 0.0009 + i * 1.3) * 0.45); // kulüp: ışıklar döner
    })
  );

  // havada süzülen toz
  const N = 260;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W;
    pos[i * 3 + 1] = Math.random() * 4.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * D;
    seed[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = new THREE.CanvasTexture(
    rmCanvas(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
    })
  );
  room.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.07, map: dot, transparent: true, opacity: 0.55, color: th.dust, depthWrite: false, blending: THREE.AdditiveBlending }));
  sc.add(room.dust);
  room.anim.push((now) => {
    if (!room.dust.visible) return;
    for (let i = 0; i < N; i++) {
      const k = seed[i];
      pos[i * 3] += Math.sin(now * 0.0003 + k) * 0.003;
      pos[i * 3 + 1] += 0.0025 + Math.sin(now * 0.001 + k) * 0.001;
      if (pos[i * 3 + 1] > 4.8) pos[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
  });

  // halı: koyu petrol mavisi, halkalı desen (koltuktan ayrı dursun)
  const rugTex = new THREE.CanvasTexture(
    rmCanvas(512, 512, (g) => {
      g.fillStyle = '#0f3a40';
      g.fillRect(0, 0, 512, 512);
      const ring = (r, c, w) => {
        g.strokeStyle = c;
        g.lineWidth = w;
        g.beginPath();
        g.arc(256, 256, r, 0, 7);
        g.stroke();
      };
      ring(246, '#d8c9a8', 10);
      ring(226, '#1d5c63', 16);
      ring(204, '#c79a4a', 4);
      ring(150, '#1a5258', 34);
      ring(96, '#c79a4a', 4);
      ring(56, '#14474d', 44);
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = i & 1 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
        g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
    })
  );
  rugTex.encoding = THREE.sRGBEncoding;
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.03, 64), rmMat(0xffffff, { map: rugTex, roughness: 1 }));
  rug.position.set(0, 0.015, -1.5);
  rug.receiveShadow = true;
  sc.add(rug);
  // koltuk: gövde, ayrı oturak ve sırt minderleri, kumaş dokusu, ayaklar
  const fabric = new THREE.CanvasTexture(
    rmCanvas(128, 128, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 3000; i++) {
        const v = (195 + Math.random() * 60) | 0;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect((Math.random() * 128) | 0, (Math.random() * 128) | 0, 1, 1);
      }
    })
  );
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(3, 3);
  const sofa = new THREE.Group();
  sofa.position.set(0, 0, 1.6);
  sc.add(sofa);
  const sofaMat = rmMat(0x5a1424, { map: fabric, roughness: 0.95 });
  const cushMat = rmMat(0x6e1a2e, { map: fabric, roughness: 0.95 });
  rmBox(5.2, 0.35, 1.3, sofaMat, 0, 0.32, 0, sofa);
  rmBox(5.2, 1.0, 0.25, sofaMat, 0, 0.95, 0.53, sofa);
  rmBox(0.35, 0.8, 1.3, sofaMat, -2.6, 0.62, 0, sofa);
  rmBox(0.35, 0.8, 1.3, sofaMat, 2.6, 0.62, 0, sofa);
  for (const x of [-1.62, 0, 1.62]) {
    rmBox(1.58, 0.22, 1.0, cushMat, x, 0.6, -0.1, sofa);
    rmBox(1.58, 0.72, 0.24, cushMat, x, 1.05, 0.33, sofa).rotation.x = -0.12;
  }
  for (const x of [-2.55, 2.55]) for (const z of [-0.5, 0.5]) rmBox(0.1, 0.15, 0.1, rmMat(0x1a120c), x, 0.075, z, sofa);

  // oyun masaları
  [[-3.4, 0xff3048], [0, 0x3a6bff], [3.4, 0x22d47e]].forEach(([z, col]) => {
    const g = new THREE.Group();
    g.position.set(-W / 2 + 1.3, 0, z);
    g.rotation.y = Math.PI / 2;
    sc.add(g);
    rmBox(2.2, 0.08, 1, rmMat(0x222228), 0, 1.05, 0, g);
    rmBox(0.08, 1.05, 0.9, rmMat(0x111114), -1.05, 0.52, 0, g);
    rmBox(0.08, 1.05, 0.9, rmMat(0x111114), 1.05, 0.52, 0, g);
    rmBox(1.3, 0.75, 0.06, rmMat(0x050505), 0, 1.6, -0.3, g);
    rmBox(1.2, 0.66, 0.02, rmGlow(col, 0.9), 0, 1.6, -0.26, g);
    rmBox(0.6, 0.6, 0.6, rmMat(0x2a2a34), 0, 0.5, 0.95, g);
    rmBox(0.6, 0.8, 0.1, rmMat(0x2a2a34), 0, 1.1, 1.22, g);
    rmBox(0.25, 0.5, 0.45, rmGlow(col, 0.5), 0.85, 1.35, -0.2, g);
    rmBox(1.5, 0.012, 0.6, rmGlow(col, 0.35), 0, 1.096, 0.12, g);
    rmBox(0.9, 0.035, 0.28, rmMat(0x0c0c10, { roughness: 0.5 }), -0.15, 1.12, 0.12, g);
    rmBox(0.84, 0.006, 0.22, rmGlow(col, 0.7), -0.15, 1.14, 0.12, g);
    rmBox(0.1, 0.045, 0.16, rmMat(0x0c0c10, { roughness: 0.4 }), 0.5, 1.12, 0.14, g);
  });
  // atari makinesi
  const arc = new THREE.Group();
  arc.position.set(W / 2 - 1.1, 0, -4.5);
  arc.rotation.y = -Math.PI / 2;
  sc.add(arc);
  rmBox(1.1, 2.4, 0.9, rmMat(0x2a0a40), 0, 1.2, 0, arc);
  rmBox(0.9, 0.7, 0.05, rmGlow(0xb04dff, 1), 0, 1.75, 0.46, arc);
  rmBox(1.2, 0.2, 0.5, rmMat(0x1a0628), 0, 1.15, 0.6, arc);
  // langırt
  const foos = new THREE.Group();
  foos.position.set(W / 2 - 3.5, 0, 3.6);
  sc.add(foos);
  rmBox(2.6, 0.35, 1.4, rmMat(0x1f5a2a), 0, 1.0, 0, foos);
  rmBox(2.8, 0.12, 1.6, rmMat(0x3a2414), 0, 0.82, 0, foos);
  for (const x of [-1.1, 1.1]) for (const z of [-0.55, 0.55]) rmBox(0.12, 0.8, 0.12, rmMat(0x3a2414), x, 0.4, z, foos);
  for (let i = -3; i <= 3; i++) rmBox(0.04, 0.04, 2.2, rmMat(0x999999, { metalness: 0.8 }), i * 0.32, 1.25, 0, foos);
  // puflar, bitkiler
  for (const [i, [x, z]] of ROOM_SPOTS.puf.entries()) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), rmMat([0x3a6bff, 0x22d47e][i]));
    m.scale.y = 0.6;
    m.position.set(x, 0.33, z);
    m.castShadow = true;
    sc.add(m);
  }
  for (const [x, z] of [[-W / 2 + 0.8, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8]]) {
    rmBox(0.5, 0.6, 0.5, rmMat(0x2b2b30), x, 0.3, z);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), rmMat(0x1f7a3a));
    l.position.set(x, 1.05, z);
    l.castShadow = true;
    sc.add(l);
  }

  // TV: gövde + ekran (yayın yokken Kanki logosu; yayın Task 5'te)
  rmBox(6.6, 3.9, 0.15, rmMat(0x050505), 0, 2.75, -D / 2 + 0.25);
  rmBox(6.9, 0.06, 0.06, rmGlow(0xff3048), 0, 0.85, -D / 2 + 0.3);
  rmBox(6.9, 0.06, 0.06, rmGlow(0xff3048), 0, 4.75, -D / 2 + 0.3);
  room.tvLogo = new THREE.CanvasTexture(
    rmCanvas(640, 360, (g) => {
      const gr = g.createLinearGradient(0, 0, 640, 360);
      gr.addColorStop(0, '#1a0610');
      gr.addColorStop(1, '#07070c');
      g.fillStyle = gr;
      g.fillRect(0, 0, 640, 360);
      g.font = 'italic 900 96px -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#ff3048';
      g.shadowBlur = 24;
      g.fillStyle = '#ff3048';
      g.fillText('KANKİ', 320, 170);
      g.shadowBlur = 0;
      g.font = '600 22px -apple-system, "Segoe UI", sans-serif';
      g.fillStyle = '#8a8a95';
      g.fillText('Kimse yayın açmadı', 320, 250);
    })
  );
  room.tv = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 3.55), new THREE.MeshBasicMaterial({ map: room.tvLogo, toneMapped: false }));
  room.tv.position.set(0, 2.75, -D / 2 + 0.34);
  sc.add(room.tv);
  room.tvLight = rmLight(0xff9a70, 0, 2.2, -D / 2 + 2.4, 1.2, 11);
  room.anim.push((now) => (room.tvLight.intensity = 1.3 + Math.sin(now * 0.004) * 0.2));

  // masaların arkasında ses yalıtım panelleri (sol duvara bağlı, tek çizim)
  const foam = new THREE.CanvasTexture(
    rmCanvas(64, 64, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i & 1 ? '#bdbdbd' : '#ffffff';
        g.fillRect(0, i * 8, 64, 8);
      }
    })
  );
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.42, 0.42), rmMat(0xffffff, { map: foam, roughness: 1 }), 27);
  const pm4 = new THREE.Matrix4();
  let pi = 0;
  [[-3.4, 0xff3048], [0, 0x3a6bff], [3.4, 0x22d47e]].forEach(([z, col]) =>
    [-0.1, 0.36, 0.82].forEach((y, r) =>
      [-0.46, 0, 0.46].forEach((dz, c) => {
        panels.setMatrixAt(pi, pm4.makeTranslation(0.18, y, z + dz));
        panels.setColorAt(pi++, new THREE.Color((r + c) & 1 ? 0x24242c : col).multiplyScalar((r + c) & 1 ? 1 : 0.35));
      })
    )
  );
  panels.receiveShadow = true;
  room.walls[1][0].add(panels);

  // arka duvarda raf: kitaplar ve küçük figür
  const back = room.walls[0][0];
  rmBox(2.6, 0.06, 0.4, rmMat(0x3a2414), -6.6, -0.7, 0.35, back);
  let bx = -7.8;
  [0xb03a3a, 0x2f5fa8, 0xd8b04a, 0x2f8a5a, 0x7a3ab0, 0xdedede, 0xb06a2a].forEach((c, k) => {
    const w = 0.09 + (k % 3) * 0.03, h = 0.3 + ((k * 5) % 4) * 0.04;
    rmBox(w, h, 0.28, rmMat(c, { roughness: 0.6 }), bx + w / 2, -0.67 + h / 2, 0.33, back).rotation.z = k === 6 ? 0.25 : 0;
    bx += w + 0.015;
  });
  const fig = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), rmMat(0xffd21a, { roughness: 0.3, metalness: 0.4 }));
  fig.position.set(-5.9, -0.45, 0.35);
  back.add(fig);
  rmBox(0.18, 0.12, 0.18, rmMat(0x111114), -5.9, -0.61, 0.35, back);

  // akvaryum: sağ duvarda, atari ile langırt arasında
  const aq = new THREE.Group();
  aq.position.set(9.15, 0, -1);
  sc.add(aq);
  rmBox(0.95, 0.9, 2.7, rmMat(0x141418, { roughness: 0.4 }), 0, 0.45, 0, aq);
  rmBox(0.74, 0.08, 2.44, rmMat(0xc8b48a, { roughness: 1 }), 0, 0.94, 0, aq);
  for (const [x, z, r] of [[0.1, -0.6, 0.14], [-0.15, 0.7, 0.11], [0.15, 0.3, 0.08]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rmMat(0x6a6a70, { roughness: 0.9 }));
    rock.position.set(x, 0.98 + r * 0.5, z);
    aq.add(rock);
  }
  const weeds = [];
  for (let k = 0; k < 7; k++) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45 + (k % 3) * 0.12, 5), rmMat(k & 1 ? 0x2f9a4a : 0x1f7a3a));
    w.geometry.translate(0, 0.22, 0); // dipten sallansın
    w.position.set(((k * 37) % 5) * 0.12 - 0.24, 0.97, -1.1 + k * 0.36);
    w.userData.live = true;
    aq.add(w);
    weeds.push(w);
  }
  const fish = [0xff7a1a, 0xffd21a, 0x3ad0ff, 0xff3a8a, 0xff7a1a, 0x9dff5a].map((c, k) => {
    const f = new THREE.Group();
    const m = rmMat(c, { roughness: 0.35, emissive: c, emissiveIntensity: 0.25 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m);
    body.scale.set(0.6, 0.9, 1.6);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), m);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -0.12;
    f.add(body, tail);
    f.userData.live = true;
    aq.add(f);
    return { f, k, sp: 0.00035 + k * 0.00007 };
  });
  // su: ışıktan etkilenmeyen mavi tül (aydınlatınca beyazlaşıyordu); cam: ince kenar çizgileri
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.86, 2.46), new THREE.MeshBasicMaterial({ color: 0x0b5f8a, transparent: true, opacity: 0.45, depthWrite: false }));
  water.position.y = 1.35;
  aq.add(water);
  const glass = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 1.0, 2.5)), new THREE.LineBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.6 }));
  glass.position.y = 1.4;
  aq.add(glass);
  rmBox(0.84, 0.06, 2.54, rmMat(0x141418, { roughness: 0.4 }), 0, 1.93, 0, aq);
  rmBox(0.6, 0.02, 2.3, rmGlow(0x3ab8ff, 0.6), 0, 1.89, 0, aq);
  // kabarcıklar
  const BN = 24;
  const bpos = new Float32Array(BN * 3);
  for (let k = 0; k < BN; k++) bpos.set([(Math.random() - 0.5) * 0.5, 1 + Math.random() * 0.8, -1 + (k % 3) * 0.06], k * 3);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  room.bubbles = new THREE.Points(bgeo, new THREE.PointsMaterial({ size: 0.04, map: dot, transparent: true, opacity: 0.8, color: 0xdff8ff, depthWrite: false }));
  aq.add(room.bubbles);
  room.anim.push((now) => {
    for (const { f, k, sp } of fish) {
      const a = now * sp + k * 1.7;
      f.position.set(Math.sin(a * 1.3 + k) * 0.18, 1.3 + Math.sin(a * 2.1 + k) * 0.25, Math.sin(a) * 1.0);
      f.rotation.y = roomLerpAngle(f.rotation.y, Math.cos(a) > 0 ? 0 : Math.PI, 0.12);
    }
    weeds.forEach((w, k) => (w.rotation.z = Math.sin(now * 0.0012 + k) * 0.15));
    if (!room.bubbles.visible) return;
    for (let k = 0; k < BN; k++) {
      bpos[k * 3 + 1] += 0.008 + (k % 4) * 0.002;
      if (bpos[k * 3 + 1] > 1.75) bpos[k * 3 + 1] = 1;
    }
    bgeo.attributes.position.needsUpdate = true;
  });

  // robot süpürge ve istasyonu (arka duvarın sağında); hareketi herkeste aynı (roomVacuum)
  const white = rmMat(0xf2f2f2, { roughness: 0.35 });
  rmBox(0.7, 0.04, 0.55, white, RV_DOCK[0], 0.02, -7.0);
  rmBox(0.7, 0.5, 0.22, white, RV_DOCK[0], 0.25, -7.22);
  rmBox(0.12, 0.03, 0.01, rmGlow(0x22d47e, 2), RV_DOCK[0], 0.42, -7.105);
  const vac = new THREE.Group();
  vac.userData.live = true;
  const vb = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.09, 32), white);
  vb.position.y = 0.065;
  vb.castShadow = true;
  const bump = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.05, 32, 1, true, -Math.PI / 2, Math.PI), rmMat(0x9a9aa0, { side: THREE.DoubleSide }));
  bump.position.y = 0.055;
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 20), rmMat(0xdcdcdc, { roughness: 0.3 }));
  lidar.position.set(0, 0.13, -0.08);
  const ledMat2 = new THREE.MeshBasicMaterial({ color: 0x22d47e, toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), ledMat2);
  led.position.set(0, 0.11, 0.2);
  const brush = new THREE.Group();
  brush.position.set(0.2, 0.02, 0.2);
  brush.userData.live = true;
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.012), rmMat(0x444448));
    b.rotation.y = (k * Math.PI * 2) / 3;
    b.geometry.translate(0.08, 0, 0);
    brush.add(b);
  }
  vac.add(vb, bump, lidar, led, brush);
  sc.add(vac);
  room.vac = vac;
  room.rv = { k: -1, route: null, pose: null };
  room.anim.push((now) => {
    const p = roomVacuum(roomNow());
    vac.position.set(p.x, 0, p.z);
    vac.rotation.y = roomLerpAngle(vac.rotation.y, p.dir, 0.25);
    brush.rotation.y += p.cleaning ? 0.5 : 0;
    ledMat2.color.setHex(p.cleaning ? (now % 1200 < 600 ? 0x3ad0ff : 0x1a70aa) : 0x22d47e);
  });

  // ---- temaya özel eşyalar ----
  if (th.disco) {
    // disko topu: tavanda döner, aynalı yüzeyler
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), rmMat(0xffffff, { metalness: 1, roughness: 0.12, flatShading: true }));
    ball.position.set(0, 4.2, 0);
    ball.userData.live = true;
    sc.add(ball);
    rmBox(0.02, 0.6, 0.02, rmMat(0x888888), 0, 4.75, 0);
    room.anim.push((now) => (ball.rotation.y = now * 0.0006));
    // zeminde dönen renkli ışık benekleri
    const spots = new THREE.Group();
    spots.userData.live = true;
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: th.neon[i % 3], transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      const a = i * 2.4, r = 1.5 + (i % 6) * 1.1;
      d.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r * 0.8);
      spots.add(d);
    }
    sc.add(spots);
    room.anim.push((now) => (spots.rotation.y = now * 0.0003));
  }
  if (th.sunset) {
    // retro: sağ duvarda (akvaryumun üstünde) gün batımı ve dağlar posteri
    const ret = new THREE.CanvasTexture(
      rmCanvas(512, 256, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#1a0040');
        gr.addColorStop(0.55, '#ff2fd0');
        gr.addColorStop(1, '#ff7a00');
        g.fillStyle = gr;
        g.fillRect(0, 0, 512, 256);
        g.fillStyle = '#ffd23a';
        g.beginPath();
        g.arc(256, 170, 80, Math.PI, 0);
        g.fill();
        g.fillStyle = '#1a0040';
        for (let y = 120; y < 175; y += 12) g.fillRect(0, y, 512, 4);
        g.fillStyle = '#12002a';
        g.beginPath();
        g.moveTo(0, 256); g.lineTo(90, 150); g.lineTo(170, 210); g.lineTo(260, 140); g.lineTo(360, 215); g.lineTo(440, 160); g.lineTo(512, 200); g.lineTo(512, 256);
        g.fill();
      })
    );
    ret.encoding = THREE.sRGBEncoding;
    const post = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshBasicMaterial({ map: ret, toneMapped: false }));
    post.rotation.y = -Math.PI / 2;
    post.position.set(-0.17, 0.9, -1);
    room.walls[2][0].add(post);
  }

  // yansımalar: sahneden bir kez ortam haritası (her karede ek maliyeti yok)
  // (odanın kendisi değil, odanın ışıklarını taklit eden küçük bir sahne: hızlı ve sorunsuz)
  const envSc = new THREE.Scene();
  envSc.add(new THREE.Mesh(new THREE.BoxGeometry(20, 6, 15), new THREE.MeshBasicMaterial({ color: new THREE.Color(th.walls[0]).multiplyScalar(0.5), side: THREE.BackSide })));
  for (const [c, x, y, z, w, h] of [[th.neon[0], -6, 2, -7.4, 6, 0.6], [0xff9a70, 0, 1.5, -7.4, 6, 3.5], [th.neon[1], 6, 2, -7.4, 6, 0.6], [th.neon[1], -9.9, 2, 0, 0.1, 0.5], [th.neon[2], 9.9, 2, 0, 0.1, 0.5], [0xffffff, 0, 2.9, 0, 6, 0.1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w === 0.1 ? 14 : 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
    m.position.set(x, y, z);
    envSc.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(room.renderer);
  room.envRT = pmrem.fromScene(envSc, 0.04);
  pmrem.dispose();
  envSc.traverse((o) => (o.geometry?.dispose(), o.material?.dispose()));
  sc.environment = room.envRT.texture;

  // sabit eşyalar: matrisleri bir kez hesapla; ışıyan ve saydam parçalar gölge atmasın (gölge çizimi azalır)
  sc.updateMatrixWorld(true);
  sc.traverse((o) => {
    if (o.isMesh && (o.material.toneMapped === false || o.material.transparent)) o.castShadow = false;
    let live = false;
    for (let q = o; q; q = q.parent) live ||= !!q.userData.live;
    if (!live) o.matrixAutoUpdate = false;
  });
}

// ---------- Kamera: sürükle = döndür, tekerlek = yakınlaş ----------
function roomControls() {
  const cv = room.renderer.domElement;
  const v = room.view;
  let drag = null;
  const down = (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    v.yaw -= dx * 0.006;
    v.pitch = Math.max(0.2, Math.min(1.3, v.pitch + dy * 0.004));
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const up = (e) => {
    if (drag && !drag.moved) room.onClick?.(e);
    drag = null;
  };
  const wheel = (e) => {
    e.preventDefault();
    v.dist = Math.max(7, Math.min(30, v.dist * Math.exp(e.deltaY * 0.001)));
  };
  cv.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  cv.addEventListener('wheel', wheel, { passive: false });
  // Sağ tık: karakterin bugünkü kullanıcı menüsü
  cv.addEventListener('contextmenu', (e) => {
    const id = roomPick(e.clientX, e.clientY);
    const u = id && S.users.get(id);
    if (u) return userMenu(e, u);
    e.preventDefault();
    const fp = rmFloorPt(e.clientX, e.clientY);
    if (fp) send({ t: 'room', kind: 'ping', p: fp });
  });
  // Sol tık: karakteri takip et + profil kartı; boşluğa tık: bırak
  room.onClick = (e) => {
    const id = roomPick(e.clientX, e.clientY);
    room.follow = id;
    if (id) return openProfile(id, room.chars.get(id).tag);
    const fp = rmFloorPt(e.clientX, e.clientY);
    if (!fp || !room.chars.has(S.myId)) return;
    // eşyanın yanına tıklandıysa oraya otur / oyna
    let best = null, bd = 1.3;
    for (const [g, list] of Object.entries(ROOM_SPOTS))
      for (const q of list) {
        const d = Math.hypot(q[0] - fp[0], q[1] - fp[1]);
        if (d < bd) [best, bd] = [g, d];
      }
    send({ t: 'room', kind: 'go', p: fp, spot: best });
  };
  room.off = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
  };
}

function roomResize() {
  if (!room.mounted) return;
  const w = room.el.clientWidth || 1, h = room.el.clientHeight || 1;
  room.renderer.setSize(w, h, false);
  room.composer.setSize(w, h);
  room.camera.aspect = w / h;
  room.camera.fov = w < 700 ? 58 : 42;
  room.camera.updateProjectionMatrix();
}

// Performans modu: ışıma, toz, gölge, ışık konileri, yansıma ve kabarcıklar kapalı, piksel oranı 1
function roomPerf() {
  if (!room.mounted) return;
  const lite = !!settings.perfMode;
  room.bloom = !lite;
  room.bloomPass.enabled = !lite;
  room.dust.visible = !lite;
  room.beams.forEach((b) => (b.visible = !lite));
  room.bubbles.visible = !lite;
  room.scene.environment = lite ? null : room.envRT.texture;
  room.renderer.shadowMap.enabled = !lite;
  room.renderer.setPixelRatio(lite ? 1 : Math.min(devicePixelRatio, 2));
  roomResize();
}

// ---------- Döngü: en fazla 30 FPS, odak dışında 5 FPS, gizliyken hiç (rAF durur) ----------
function roomFrame(now) {
  if (!room.mounted) return;
  room.raf = requestAnimationFrame(roomFrame);
  const focused = document.hasFocus();
  if (now - room.last < (focused ? 1000 / 30 : 200) - 2) return;
  const dt = Math.min(0.1, (now - (room.last || now)) / 1000);
  room.last = now;
  room.fpsWin.push(now);
  while (room.fpsWin[0] < now - 1000) room.fpsWin.shift();
  room.fps = room.fpsWin.length;
  // İlk 3 saniye (odaktayken) ortalama 15 FPS'in altındaysa bu bilgisayar için ağır
  if (focused && room.slow && dt > 0) {
    room.slow.n++;
    room.slow.ms += dt * 1000;
    if (room.slow.ms > 3000) {
      const avg = (room.slow.n * 1000) / room.slow.ms;
      room.slow = null;
      if (avg < 15) return roomFail('Bu bilgisayarda oda yavaş çalışıyor.');
    }
  }
  for (const f of room.anim) f(now, dt);
  const v = room.view, cam = room.camera;
  const look = room.look || (room.look = new THREE.Vector3(0, 1, 0));
  const fc = room.follow && room.chars.get(room.follow);
  if (room.follow && !fc) room.follow = null; // takip edilen çıktı
  look.lerp(fc ? rmTmp.set(fc.g.position.x, 1.2, fc.g.position.z) : rmTmp.set(0, 1, 0), 0.08);
  const dd = (fc ? Math.min(v.dist, 9) : v.dist) * Math.max(1, 1.5 / cam.aspect);
  cam.position.set(look.x + Math.sin(v.yaw) * Math.cos(v.pitch) * dd, look.y + Math.sin(v.pitch) * dd, look.z + Math.cos(v.yaw) * Math.cos(v.pitch) * dd);
  cam.lookAt(look);
  cam.updateMatrixWorld(); // etiketler ve tıklama bu karenin kamerasıyla hesaplansın (takipte titremesin)
  roomTick?.(now, dt);
  for (const [w, n] of room.walls) w.visible = n.x * cam.position.x + n.z * cam.position.z < 2;
  room.composer.render();
}

// ---------- Karakterler ----------
const ROOM_GRAY = '#c9ccd3'; // beyaz ping rengi gövdede bembeyaz parlamasın
function roomBodyColor(u) {
  const c = new THREE.Color(u.pingColor || '#ffffff');
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.85 ? ROOM_GRAY : '#' + c.getHexString();
}
const roomNameColor = (u) => u.color || colorFor(u.name);

// Yüz diski dokusu: profil fotoğrafı (daireye kırpılır) ya da baş harf
function roomFaceTex(c, u) {
  const photo = S.avatars.get(u.id) || null;
  const key = photo ? 'p:' + photo.length + ':' + photo.slice(-32) : 'i:' + u.name + roomNameColor(u);
  if (c.faceKey === key) return;
  c.faceKey = key;
  c.debug.face = photo ? 'photo' : 'initial';
  const cv = rmCanvas(256, 256, (g) => {
    g.beginPath();
    g.arc(128, 128, 128, 0, 7);
    g.clip();
    const gr = g.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, colorFor(u.name));
    gr.addColorStop(1, '#0b0b0d');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff';
    g.font = 'bold 150px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((u.name || '?').trim().charAt(0).toLocaleUpperCase('tr'), 128, 140);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  c.face.material.map?.dispose();
  c.face.material.map = tex;
  c.face.material.needsUpdate = true;
  if (!photo) return;
  const img = new Image();
  img.onload = () => {
    if (c.faceKey !== key) return;
    const g = cv.getContext('2d');
    const sz = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - sz) / 2, (img.height - sz) / 2, sz, sz, 0, 0, 256, 256); // ortadan kare kırp
    tex.needsUpdate = true;
  };
  img.src = photo;
}

function roomMakeChar(u) {
  const g = new THREE.Group();
  const bodyM = rmMat(0xffffff, { roughness: 0.55 });
  const part = (geo, mat, y, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // İnsan: ten ve saç rengi kimlikten (herkeste aynı), tişört ping rengi, kot, spor ayakkabı
  const hsh = rmHash(u.id);
  const skinM = rmMat([0xf2c9a0, 0xe0ac69, 0xc68642, 0x8d5524][hsh % 4], { roughness: 0.6 });
  const hairM = rmMat([0x1c140f, 0x3b2516, 0x0c0c0e, 0x6b4423, 0xb8924f][(hsh >> 3) % 5], { roughness: 0.9 });
  const jeanM = rmMat(0x2c3d5c, { roughness: 0.9 });
  const shoeM = rmMat(0xf4f4f6, { roughness: 0.5 });
  const phoneM = rmMat(0x2a2b33, { roughness: 0.4, metalness: 0.3 });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); // kulaklık ışığı (ping rengi)
  // gövde (tişört): kalça → bel → göğüs → omuz → boyun profili, önden arkaya basık
  const torso = [[0, 0], [0.27, 0], [0.28, 0.1], [0.25, 0.36], [0.3, 0.62], [0.32, 0.74], [0.24, 0.84], [0.1, 0.88], [0, 0.88]].map(([x, y]) => new THREE.Vector2(x, y));
  part(new THREE.LatheGeometry(torso, 28), bodyM, 0.66, g).scale.z = 0.72;
  part(new THREE.CylinderGeometry(0.285, 0.29, 0.22, 28), jeanM, 0.7, g).scale.z = 0.74; // kot (kalça)
  part(new THREE.CylinderGeometry(0.075, 0.085, 0.2, 14), skinM, 1.58, g); // boyun
  // kol: kısa kollu tişört + çıplak ön kol + el; bacak: kot + ayakkabı
  const limb = (x, y, parts) => {
    const piv = new THREE.Group();
    piv.position.set(x, y, 0);
    let at = 0;
    for (const [r0, r1, len, mat] of parts) {
      part(new THREE.CylinderGeometry(r0, r1, len, 14), mat, at - len / 2, piv);
      part(new THREE.SphereGeometry(r0 * 1.02, 14, 10), mat, at, piv); // eklem
      at -= len;
    }
    g.add(piv);
    return { piv, end: at };
  };
  const legs = [-0.14, 0.14].map((x) => {
    const { piv, end } = limb(x, 0.66, [[0.12, 0.1, 0.32, jeanM], [0.1, 0.08, 0.3, jeanM]]);
    const shoe = part(new THREE.SphereGeometry(0.1, 16, 10), shoeM, end + 0.02, piv);
    shoe.scale.set(1, 0.6, 1.7);
    shoe.position.z = 0.07;
    return piv;
  });
  const arms = [-0.37, 0.37].map((x) => {
    const { piv, end } = limb(x, 1.42, [[0.095, 0.085, 0.24, bodyM], [0.065, 0.055, 0.34, skinM]]);
    const hand = part(new THREE.SphereGeometry(0.065, 12, 10), skinM, end - 0.04, piv);
    hand.scale.set(0.8, 1.2, 1);
    return piv;
  });
  const head = new THREE.Group();
  head.position.y = 1.95;
  g.add(head);
  const skull = part(new THREE.SphereGeometry(0.22, 32, 24), skinM, -0.12, head);
  skull.scale.set(0.9, 1.08, 0.98);
  // saç: kafanın üstü ve arkası
  const hair = part(new THREE.SphereGeometry(0.235, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, -0.1, head);
  hair.scale.set(0.92, 1.05, 1.0);
  hair.rotation.x = -0.35;
  // yüz: gözler, kaşlar, burun, kulaklar
  for (const sx of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.028, 12, 8), rmMat(0xffffff, { roughness: 0.3 }), -0.1, head);
    eye.position.set(sx * 0.075, -0.1, 0.185);
    const iris = part(new THREE.SphereGeometry(0.016, 10, 8), rmMat(0x2a1a10, { roughness: 0.2 }), -0.1, head);
    iris.position.set(sx * 0.075, -0.1, 0.207);
    const brow = part(new THREE.BoxGeometry(0.07, 0.014, 0.02), hairM, -0.055, head);
    brow.position.set(sx * 0.075, -0.055, 0.2);
    const ear = part(new THREE.SphereGeometry(0.045, 10, 8), skinM, -0.12, head);
    ear.position.x = sx * 0.2;
    ear.scale.set(0.5, 1, 0.8);
  }
  const nose = part(new THREE.SphereGeometry(0.03, 10, 8), skinM, -0.15, head);
  nose.position.z = 0.215;
  nose.scale.set(0.8, 1, 1.1);
  const mouth = part(new THREE.BoxGeometry(0.07, 0.012, 0.01), rmMat(0x7a3030, { roughness: 0.6 }), -0.21, head);
  mouth.position.z = 0.2;
  // oyuncu kulaklığı: kafanın üstünden bant, iki yanda ışıklı kulaklar
  part(new THREE.TorusGeometry(0.245, 0.022, 8, 28, Math.PI), phoneM, -0.11, head);
  for (const sx of [-1, 1]) {
    const cup = part(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 20), phoneM, -0.12, head);
    cup.rotation.z = Math.PI / 2;
    cup.position.x = sx * 0.225;
    const led = part(new THREE.CylinderGeometry(0.055, 0.055, 0.062, 20), glowM, -0.12, head);
    led.rotation.z = Math.PI / 2;
    led.position.x = sx * 0.228;
    led.castShadow = false;
  }
  const facePiv = new THREE.Group();
  head.add(facePiv);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), new THREE.MeshBasicMaterial({ toneMapped: false }));
  face.position.z = 0.53;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.045, 8, 40), new THREE.MeshBasicMaterial({ toneMapped: false }));
  rim.position.z = 0.53;
  facePiv.add(face, rim);
  facePiv.position.y = -0.12;
  facePiv.scale.setScalar(0.55);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0x22d47e, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  const waves = [0, 1, 2].map(() => {
    const w = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 48), new THREE.MeshBasicMaterial({ color: 0x22d47e, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    w.rotation.x = -Math.PI / 2;
    w.position.y = 0.03;
    g.add(w);
    return w;
  });
  const zz = [0, 1, 2].map((k) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: roomZTex(), transparent: true, depthWrite: false, opacity: 0 }));
    sp.scale.setScalar(0.35 + k * 0.12);
    sp.visible = false;
    g.add(sp);
    return sp;
  });
  // ilk yer: odanın ortasına yakın rastgele
  g.position.set((Math.random() - 0.5) * 8, 0, 3 + Math.random() * 2.5); // koltuğun arkası, boş alan
  room.scene.add(g);
  const tag = document.createElement('div');
  tag.className = 'rm-tag';
  tag.innerHTML = '<div class="rm-n"><span class="rm-name"></span><span class="rm-ic"></span></div><div class="rm-a"></div>';
  room.tags.append(tag);
  return { id: u.id, g, bodyM, glowM, legs, arms, head, facePiv, face, rim, ring, waves, zz, tag, phase: (rmHash(u.id) % 1000) / 160, speaking: false, debug: { speaking: false } };
}

function roomSync(members) {
  if (!room.mounted) return;
  const seen = new Set();
  for (const u of members) {
    if (u.bot) continue;
    seen.add(u.id);
    let c = room.chars.get(u.id);
    if (!c) room.chars.set(u.id, (c = roomMakeChar(u)));
    c.u = u;
    const body = roomBodyColor(u);
    c.bodyM.color.set(body);
    c.glowM.color.set(body);
    const nc = roomNameColor(u);
    c.rim.material.color.set(nc);
    roomFaceTex(c, u);
    const name = u.name + (u.id === S.myId ? ' (sen)' : '');
    const icons = [u.muted && 'mic', u.deafened && 'head', screenSharesOf(u).length && 'live'].filter(Boolean);
    const n = c.tag.querySelector('.rm-name');
    n.textContent = name;
    n.style.color = u.pingColor || '#ffffff'; // isim, adminin seçtiği ping renginde
    c.tag.querySelector('.rm-ic').innerHTML = (u.muted ? ICON.micOff : '') + (u.deafened ? ICON.headOff : '') + (icons.includes('live') ? '<b class="live">CANLI</b>' : '');
    Object.assign(c.debug, { name, body, icons });
    c.man = u.room || null;
    if (u.id === S.myId && room.bar) room.bar.querySelector('.rm-auto').hidden = !(c.man && roomNow() - c.man.at < RM_MAN_MS);
    const mode = roomMode(u);
    if (mode !== c.mode) {
      c.mode = mode;
      c.zz.forEach((z) => (z.visible = mode === 'idle'));
    }
  }
  for (const [id, c] of room.chars) {
    if (seen.has(id)) continue;
    room.scene.remove(c.g);
    // Three.js sahneden çıkarınca GPU belleğini boşaltmaz; oda gün boyu açık kalırsa büyümesin
    c.g.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        if (o.material.map !== rmZ) o.material.map?.dispose(); // Z dokusu herkesin ortak
        o.material.dispose();
      }
    });
    c.tag.remove();
    room.chars.delete(id);
  }
  const as = roomAssign(Math.floor(roomNow() / RM_SLOT));
  for (const [id, c] of room.chars) Object.assign(c.debug, { goal: as.get(id).goal, label: as.get(id).label });
}

// Her kare: yüz diski kameraya dönsün, etiketler karakterin üstünde dursun
const rmTmp = new THREE.Vector3();
const rmQ = new THREE.Quaternion();
let roomTick = (now, dt) => {
  const cam = room.camera, W = room.el.clientWidth, H = room.el.clientHeight;
  const r = room.el.getBoundingClientRect();
  for (const c of room.chars.values()) roomMove(c);
  roomSeparate();
  roomPings(now);
  for (const c of room.chars.values()) {
    c.head.getWorldQuaternion(rmQ);
    c.facePiv.quaternion.copy(rmQ.invert()).multiply(cam.quaternion);
    const p = c.g.position;
    rmTmp.set(p.x, p.y + 2.35, p.z).project(cam);
    const x = ((rmTmp.x + 1) / 2) * W, y = ((1 - rmTmp.y) / 2) * H;
    c.tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    c.tag.style.opacity = rmTmp.z < 1 ? (room.follow && room.follow !== c.id ? 0.45 : 1) : 0;
    rmTmp.set(p.x, p.y + 1.4, p.z).project(cam);
    c.debug.screen = { x: r.left + ((rmTmp.x + 1) / 2) * W, y: r.top + ((1 - rmTmp.y) / 2) * H };
  }
};

// ---------- Davranış: boşta → puf, oyunda → masa, diğerleri gezer ----------
let rmZ = null;
function roomZTex() {
  if (!rmZ)
    rmZ = new THREE.CanvasTexture(
      rmCanvas(64, 64, (g) => {
        g.font = 'bold 54px sans-serif';
        g.fillStyle = '#9ad8ff';
        g.shadowColor = '#3a9bff';
        g.shadowBlur = 10;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('Z', 32, 34);
      })
    );
  return rmZ;
}
// ---------- Engeller ve yol bulma ----------
// Eşyaların zemindeki kutuları [x0, x1, z0, z1]; ilki koltuk
const ROOM_OBST = [
  [-2.78, 2.78, 0.95, 2.28],
  ...[-3.4, 0, 3.4].map((z) => [-9.2, -7.45, z - 1.1, z + 1.1]), // masa + sandalye
  [8.3, 9.4, -5.05, -3.95], // atari
  [5.1, 7.9, 2.8, 4.4], // langırt
  [-4.15, -3.05, -2.05, -0.95], // puflar
  [3.05, 4.15, -2.05, -0.95],
  [-9.45, -8.95, -6.95, -6.45], // bitkiler
  [8.95, 9.45, 6.45, 6.95],
  [8.65, 9.65, -2.4, 0.4], // akvaryum
  [6.8, 7.6, -7.35, -6.65], // süpürge istasyonu
];
const RM_R = 0.4; // karakterin yarıçapı
const RM_BX = RW / 2 - 0.6, RM_BZ = RD / 2 - 0.6; // duvarlardan uzak dur
const roomInObst = (x, z, r = 0) => ROOM_OBST.some(([x0, x1, z0, z1]) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r);
const roomFreeAt = (x, z) => Math.abs(x) <= RM_BX && Math.abs(z) <= RM_BZ && !roomInObst(x, z, RM_R);
// Oturulan yere önden yaklaşma noktası (koltuk, masa sandalyesi, puf eşyanın içinde)
const RM_APPROACH = { tv: ([x]) => [x, 0.3], desk: ([x, z]) => [x + 1.1, z], puf: ([x, z]) => [x, z + 1.0] };
const RM_CELL = 0.5;
const RM_NX = Math.floor((2 * RM_BX) / RM_CELL) + 1, RM_NZ = Math.floor((2 * RM_BZ) / RM_CELL) + 1;
const rmCellXZ = (i) => [-RM_BX + (i % RM_NX) * RM_CELL, -RM_BZ + Math.floor(i / RM_NX) * RM_CELL];
let rmGrid = null; // geçilebilir hücreler (bir kez hesaplanır)
function rmNearestCell(x, z) {
  rmGrid ||= Array.from({ length: RM_NX * RM_NZ }, (_, i) => roomFreeAt(...rmCellXZ(i)));
  let best = -1, bd = Infinity;
  rmGrid.forEach((ok, i) => {
    if (!ok) return;
    const [cx, cz] = rmCellXZ(i);
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd) [best, bd] = [i, d];
  });
  return best;
}
const rmClear = (a, b) => {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
  for (let k = 1; k < n; k++) if (!roomFreeAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)) return false;
  return true;
};
// from'dan goal'ün i. yerine (walk: walkTo'ya, verilmezse rastgele boş noktaya) yol: [[x, z], ...], son nokta hedefin kendisi
function roomPath(from, goal, i = 0, walkTo = null) {
  const head = [];
  let start = from;
  // bir yerde oturuyorsa önce o yerin önüne çık
  if (roomInObst(from[0], from[1], RM_R)) {
    for (const [g, list] of Object.entries(ROOM_SPOTS))
      list.forEach((s) => {
        if (RM_APPROACH[g] && Math.hypot(s[0] - from[0], s[1] - from[1]) < 0.3) start = RM_APPROACH[g](s);
      });
    if (start !== from) head.push(start);
  }
  let end, tail;
  if (goal === 'walk') {
    end = walkTo;
    for (let k = 0; k < 50 && !end; k++) {
      const p = [(Math.random() - 0.5) * (RW - 6), (Math.random() - 0.5) * (RD - 6)];
      if (roomFreeAt(...p)) end = p;
    }
    end ||= [0, 4];
    tail = [end];
  } else {
    const spot = ROOM_SPOTS[goal][i];
    end = RM_APPROACH[goal] ? RM_APPROACH[goal](spot) : spot;
    tail = end === spot ? [spot] : [end, spot];
  }
  // A* ızgarada (8 yön, köşe kesmeden)
  const s0 = rmNearestCell(...start), e0 = rmNearestCell(...end);
  const prev = new Map([[s0, -1]]), cost = new Map([[s0, 0]]);
  const open = [[0, s0]];
  const h = (i2) => Math.hypot(rmCellXZ(i2)[0] - rmCellXZ(e0)[0], rmCellXZ(i2)[1] - rmCellXZ(e0)[1]);
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, cur] = open.shift();
    if (cur === e0) break;
    const cx = cur % RM_NX, cz = Math.floor(cur / RM_NX);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= RM_NX || nz >= RM_NZ) continue;
      const n = nz * RM_NX + nx;
      if (!rmGrid[n] || (dx && dz && (!rmGrid[cz * RM_NX + nx] || !rmGrid[nz * RM_NX + cx]))) continue;
      const nc = cost.get(cur) + Math.hypot(dx, dz);
      if (nc >= (cost.get(n) ?? Infinity)) continue;
      cost.set(n, nc);
      prev.set(n, cur);
      open.push([nc + h(n), n]);
    }
  }
  const cells = [];
  if (prev.has(e0)) for (let c = e0; c !== -1; c = prev.get(c)) cells.unshift(rmCellXZ(c));
  // gereksiz köşeleri at: görülebilen en uzak noktaya doğrudan git
  const pts = [start, ...cells, end];
  const out = [];
  for (let a = 0; a < pts.length - 1; ) {
    let b = pts.length - 1;
    while (b > a + 1 && !rmClear(pts[a], pts[b])) b--;
    out.push(pts[b]);
    a = b;
  }
  return [...head, ...out.slice(0, -1), ...tail];
}
// ---------- Davranış: herkeste aynı sahne ----------
// Zaman 12 sn'lik dilimlere bölünür. Her dilimde kimin nereye gideceği kişinin kimliği ve dilim
// numarasından türeyen sabit bir "zar"la seçilir; yer, dilim başından geçen süreden hesaplanır.
// Böylece ağdan konum göndermeden her bilgisayar aynı sahneyi çizer (saat: sunucu saati).
const RM_SLOT = 12000;
const RM_SPEED = 2.2; // birim/sn
const roomNow = () => Date.now() + (S.clockOffset || 0);
function rmHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// (tohum, n) → [0, 1) her yerde aynı
function rmRand(seed, n) {
  let t = (seed + Math.imul(n | 0, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Kişinin durumu: boşta → puf, oyunda → masa, diğerleri serbest
function roomMode(u) {
  // sunucunun gönderdiği durum (presenceOf kendin için yerel ayarı okur; herkes aynı veriyi kullansın)
  if ((u.presence || (u.away ? 'idle' : 'online')) === 'idle') return 'idle';
  return u.activity?.game ? 'game:' + u.activity.game : 'free';
}
const RM_LABEL = { arcade: '🕹️ Atari oynuyor', foos: '⚽ Langırt oynuyor', walk: '🚶 Geziniyor' };
// k. dilimde herkesin hedefi: Map(id → { goal, i, p:[x,z], label }) — kimlik sırasıyla dağıtılır
const rmAssignCache = new Map();
const RM_MAN_MS = 180000;
const RM_SPOT_LABEL = { tv: '🛋️ Koltukta', desk: '🖥️ Masada', arcade: '🕹️ Atari oynuyor', foos: '⚽ Langırt oynuyor', puf: '🪑 Pufta' };
// c'nin k. dilimde geçerli elle hedefi (before: bu andan önce verilmiş olanlar); durum değişince sunucu siler
const rmManual = (c, k, before = Infinity) =>
  c.man && c.man.at < before && c.man.at < (k + 1) * RM_SLOT && k * RM_SLOT < c.man.at + RM_MAN_MS ? c.man : null;
function roomAssign(k, before = Infinity) {
  const ids = [...room.chars.keys()].sort();
  const key = k + '|' + before + '|' + ids.map((id) => id + ':' + room.chars.get(id).mode + ':' + (rmManual(room.chars.get(id), k, before)?.at || '')).join(',');
  if (rmAssignCache.has(key)) return rmAssignCache.get(key);
  const taken = new Set();
  const out = new Map();
  const take = (goal) => {
    const i = ROOM_SPOTS[goal].findIndex((_, j) => !taken.has(goal + j));
    if (i >= 0) taken.add(goal + i);
    return i;
  };
  const walk = (id, label) => {
    const seed = rmHash(id);
    let p = [0, 4];
    for (let n = 0; n < 40; n++) {
      const q = [(rmRand(seed, k * 97 + n + 1) - 0.5) * (RW - 6), (rmRand(seed, k * 89 + n + 3) - 0.5) * (RD - 6)];
      if (roomFreeAt(...q)) {
        p = q;
        break;
      }
    }
    return { goal: 'walk', i: 0, p, label };
  };
  const spot = (goal, i, label) => ({ goal, i, p: ROOM_SPOTS[goal][i], label });
  // önce elle verilenler (erken verilen önce): seçilen eşyanın en yakın boş yeri, yoksa tıklanan nokta
  const mans = ids.map((id) => [id, rmManual(room.chars.get(id), k, before)]).filter(([, m]) => m).sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
  for (const [id, m] of mans) {
    let a = null;
    if (m.spot && ROOM_SPOTS[m.spot]) {
      const free = ROOM_SPOTS[m.spot].map((q, j) => [j, Math.hypot(q[0] - m.p[0], q[1] - m.p[1])]).filter(([j]) => !taken.has(m.spot + j)).sort((x, y) => x[1] - y[1]);
      if (free.length) {
        taken.add(m.spot + free[0][0]);
        a = spot(m.spot, free[0][0], RM_SPOT_LABEL[m.spot]);
      }
    }
    if (!a) a = { goal: 'walk', i: 0, p: roomFreeAt(...m.p) ? m.p : rmCellXZ(rmNearestCell(...m.p)), label: '🧍 Takılıyor' };
    out.set(id, { ...a, at: m.at });
  }
  // sonra duruma bağlı olanlar (yerleri her dilimde aynı kalır)
  for (const id of ids) {
    if (out.has(id)) continue;
    const m = room.chars.get(id).mode;
    if (m === 'idle') {
      const i = take('puf');
      out.set(id, i >= 0 ? spot('puf', i, '💤 Boşta') : walk(id, '💤 Boşta'));
    } else if (m.startsWith('game:')) {
      const i = take('desk');
      const label = '🎮 ' + m.slice(5);
      out.set(id, i >= 0 ? spot('desk', i, label) : walk(id, label));
    }
  }
  // sonra serbestler: zar
  for (const id of ids) {
    if (out.has(id)) continue;
    const goal = ['tv', 'arcade', 'foos', 'walk'][Math.floor(rmRand(rmHash(id), k) * 4)];
    const i = goal === 'walk' ? -1 : take(goal);
    out.set(id, i >= 0 ? spot(goal, i, RM_LABEL[goal] || '') : walk(id, RM_LABEL.walk));
  }
  if (rmAssignCache.size > 50) rmAssignCache.clear();
  rmAssignCache.set(key, out);
  return out;
}
// Yürüyüş parçası: from'dan a hedefine, start anında yola çıkar
function rmSeg(from, a, start, k) {
  const path = [from, ...roomPath(from, a.goal, a.i, a.p)];
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return { from, a, start, k, path, lens, startsInside: roomInObst(from[0], from[1], RM_R) };
}
const rmSameTarget = (a, b) => a && b && a.goal === b.goal && a.i === b.i && a.p[0] === b.p[0] && a.p[1] === b.p[1];
// t anında c'nin parçası (dilim değişince yeni parça; dilim içinde hedef değişirse 2 sn'lik sınırda döner)
function rmSegAt(c, t) {
  const k = Math.floor(t / RM_SLOT);
  const want = roomAssign(k).get(c.id);
  let s = c.seg;
  if (!s || s.k !== k) {
    // yeni dilim: önceki hedeften (bilinmiyorsa önceki dilimin hesabından) yola çık
    const prev = s && s.k === k - 1 ? s.a.p : roomAssign(k - 1).get(c.id)?.p || want.p;
    if (want.at > k * RM_SLOT) {
      // dilimin ortasında verilmiş: o ana kadar eski hedefe yürüyordu
      s = rmSeg(prev, roomAssign(k, want.at).get(c.id) || want, k * RM_SLOT, k);
      if (t >= want.at) {
        const p = rmPose(s, want.at);
        s = rmSeg([p.x, p.z], want, want.at, k);
      }
      c.seg = s;
    } else s = c.seg = rmSeg(prev, want, k * RM_SLOT, k);
    c.pendingAt = 0;
  } else if (!rmSameTarget(s.a, want) && want.at > s.start) {
    // elle verilen yeni hedef: tam verildiği anda dön
    if (t >= want.at) {
      const p = rmPose(s, want.at);
      s = c.seg = rmSeg([p.x, p.z], want, want.at, k);
      c.pendingAt = 0;
    }
  } else if (!rmSameTarget(s.a, want)) {
    // durum ya da kanaldakiler değişti: herkeste aynı anda (sonraki 2 sn'lik sınırda) yeni hedefe dön
    c.pendingAt ||= Math.ceil(t / 2000) * 2000;
    if (t >= c.pendingAt) {
      const e = c.pendingAt;
      const p = rmPose(s, e);
      s = c.seg = rmSeg([p.x, p.z], want, e, k);
      c.pendingAt = 0;
    }
  }
  return s;
}
// parçada t anındaki yer: { x, z, dir, arrived, seated }
function rmPose(s, t) {
  const d = Math.max(0, ((t - s.start) / 1000) * RM_SPEED);
  const L = s.lens[s.lens.length - 1];
  const sit = s.a.goal === 'tv' || s.a.goal === 'desk' || s.a.goal === 'puf';
  if (d >= L) {
    const e = s.path[s.path.length - 1];
    return { x: e[0], z: e[1], dir: null, arrived: true, seated: sit, goal: s.a.goal };
  }
  let i = 1;
  while (s.lens[i] < d) i++;
  const a = s.path[i - 1], b = s.path[i];
  const f = (d - s.lens[i - 1]) / (s.lens[i] - s.lens[i - 1] || 1);
  const leg = i === 1 && s.startsInside; // oturduğu yerden kalkıyor
  const last = i === s.path.length - 1 && sit; // oturacağı yere giriyor
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dir: Math.atan2(b[0] - a[0], b[1] - a[1]), arrived: false, seated: leg || last, goal: s.a.goal };
}
// Test ve hata ayıklama: id'nin t anındaki yeri (herkeste aynı olmalı)
function roomPoseAt(id, t) {
  const c = room.chars.get(id);
  if (!c) return null;
  const k = Math.floor(t / RM_SLOT);
  // şimdiki ya da gelecek an: canlı parçayı ilerlet; geçmiş an: o anın parçası (canlıya dokunmadan)
  if (!c.seg || k > c.seg.k || (k === c.seg.k && t >= c.seg.start)) return rmPose(rmSegAt(c, t), t);
  return rmPose(rmSeg(roomAssign(k - 1).get(id).p, roomAssign(k).get(id), k * RM_SLOT, k), t);
}
function roomSpeaking(id, on) {
  const c = room.chars.get(id);
  if (!c) return;
  c.speaking = !!on;
  c.debug.speaking = c.speaking;
}

function roomLerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
const RM_SIT_Y = { tv: 0.12, desk: 0.18, puf: 0.02 };
// Varınca bakılacak yön [x, z] (null = kendi konumu)
const RM_FACE = { tv: [0, -10], desk: [-20, null], arcade: [20, null], foos: [null, 3.6], puf: [0, -10] };
function roomMove(c) {
  const t = roomNow();
  const s = rmSegAt(c, t);
  const p = rmPose(s, t);
  const a = s.a;
  const pos = c.g.position;
  pos.x = p.x;
  pos.z = p.z;
  // koltuktaki: TV'de yayın varsa izliyor, yoksa takılıyor
  const label = a.goal === 'tv' && c.mode === 'free' ? (room.tvKey ? '📺 Yayını izliyor' : '🛋️ Koltukta takılıyor') : a.label;
  Object.assign(c.debug, { goal: a.goal, label, pos: { x: p.x, z: p.z }, seated: p.seated, t });
  c.fixed = p.seated || (p.arrived && a.goal !== 'walk'); // oturan / oynayan itilmez
  const act = c.tag.querySelector('.rm-a');
  const text = p.arrived || a.goal === 'walk' ? label : '🚶 → ' + label;
  if (act.textContent !== text) act.textContent = text;
  const sit = p.arrived && (a.goal === 'tv' || a.goal === 'desk' || a.goal === 'puf');
  if (!p.arrived) {
    c.g.rotation.y = roomLerpAngle(c.g.rotation.y, p.dir, 0.2);
    const sw = Math.sin(t * 0.012 + c.phase);
    c.legs[0].rotation.x = sw * 0.6;
    c.legs[1].rotation.x = -sw * 0.6;
    c.arms[0].rotation.x = -sw * 0.5;
    c.arms[1].rotation.x = sw * 0.5;
    pos.y = Math.abs(sw) * 0.06;
    c.head.rotation.z = 0;
  } else {
    const [fx, fz] = RM_FACE[a.goal] || [null, null];
    if (fx !== null || fz !== null) c.g.rotation.y = roomLerpAngle(c.g.rotation.y, Math.atan2((fx ?? p.x) - p.x, (fz ?? p.z) - p.z), 0.15);
    pos.y = sit ? RM_SIT_Y[a.goal] || 0 : 0;
    c.legs.forEach((l) => (l.rotation.x = sit ? -1.4 : 0));
    const play = a.goal === 'arcade' || a.goal === 'foos' || a.goal === 'desk';
    c.arms.forEach((arm, j) => (arm.rotation.x = play ? -1.1 + Math.sin(t * 0.02 + j * 2) * 0.12 : sit ? -0.3 : 0));
    c.head.rotation.z = c.mode === 'idle' ? 0.45 : Math.sin(t * 0.001 + c.phase) * 0.05;
  }
  // el sallama / dans (4 sn, herkeste aynı an)
  c.arms.forEach((arm) => (arm.rotation.z = 0));
  const em = room.emotes?.get(c.id);
  const et = em ? t - em.at : -1;
  c.debug.emote = et >= 0 && et < 4000 ? em.kind : null;
  if (c.debug.emote === 'wave') {
    c.arms[1].rotation.x = 0;
    c.arms[1].rotation.z = 2.5 + Math.sin(et * 0.015) * 0.35;
  } else if (c.debug.emote === 'dance') {
    const b = et * 0.011;
    c.arms[0].rotation.z = -2.2 - Math.sin(b) * 0.6;
    c.arms[1].rotation.z = 2.2 - Math.sin(b) * 0.6;
    c.arms.forEach((arm) => (arm.rotation.x = 0));
    if (!sit) {
      pos.y = Math.abs(Math.sin(b)) * 0.18;
      c.g.rotation.y += Math.sin(b * 0.5) * 0.06;
      c.legs[0].rotation.x = Math.sin(b) * 0.35;
      c.legs[1].rotation.x = -Math.sin(b) * 0.35;
    }
  }
  // konuşma halkası ve dalgalar
  const ring = c.ring.material;
  ring.opacity += ((c.speaking ? 0.55 + Math.sin(t * 0.02) * 0.3 : 0) - ring.opacity) * 0.25;
  c.head.position.y = 1.95 + (c.speaking ? Math.abs(Math.sin(t * 0.025)) * 0.03 : 0);
  c.waves.forEach((w, k) => {
    const q = (t * 0.0009 + k / 3) % 1;
    w.scale.setScalar(1 + q * 1.6);
    w.material.opacity = c.speaking ? (1 - q) * 0.7 : Math.max(0, w.material.opacity - 0.05);
  });
  if (c.mode === 'idle')
    c.zz.forEach((z, k) => {
      const q = (t * 0.0004 + k / 3) % 1;
      z.position.set(0.3 + q * 0.5, 2.5 + q * 1.1, 0);
      z.material.opacity = Math.sin(q * Math.PI);
    });
}

// ---------- Robot süpürge: 5 dakikada bir ~1 dakika temizler, sonra istasyonuna döner ----------
// Rota dönem numarasından türeyen sabit zarla seçilir ve sunucu saatiyle yürür: herkeste aynı.
const RV_CYCLE = 300000, RV_CLEAN = 60000, RV_SPEED = 0.55;
const RV_DOCK = [7.2, -6.95], RV_FRONT = [7.2, -6.1];
function rvRoute(k) {
  if (room.rv.k === k) return room.rv.route;
  const seed = rmHash('robot-supurge');
  const pts = [RV_DOCK, RV_FRONT];
  let cur = RV_FRONT, len = 0;
  const add = (path) => {
    for (const q of path) {
      const a = pts[pts.length - 1];
      len += Math.hypot(q[0] - a[0], q[1] - a[1]);
      pts.push(q);
    }
  };
  for (let n = 0; len < (RV_CLEAN / 1000) * RV_SPEED && n < 80; n++) {
    const q = [(rmRand(seed, k * 131 + n * 2 + 1) - 0.5) * (2 * RM_BX - 1), (rmRand(seed, k * 131 + n * 2 + 2) - 0.5) * (2 * RM_BZ - 1)];
    if (!roomFreeAt(...q)) continue;
    add(roomPath(cur, 'walk', 0, q));
    cur = q;
  }
  add(roomPath(cur, 'walk', 0, RV_FRONT));
  pts.push(RV_DOCK);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  room.rv.k = k;
  room.rv.route = { pts, lens };
  return room.rv.route;
}
// t anında süpürgenin yeri: { x, z, dir, cleaning }
function roomVacuum(t) {
  const k = Math.floor(t / RV_CYCLE);
  const { pts, lens } = rvRoute(k);
  const d = ((t - k * RV_CYCLE) / 1000) * RV_SPEED;
  const L = lens[lens.length - 1];
  let pose;
  if (d >= L) pose = { x: RV_DOCK[0], z: RV_DOCK[1], dir: 0, cleaning: false };
  else {
    let i = 1;
    while (lens[i] < d) i++;
    const a = pts[i - 1], b = pts[i];
    const f = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    const dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
    // istasyona geri geri girer
    pose = { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dir: i === pts.length - 1 ? dir + Math.PI : dir, cleaning: true };
  }
  room.rv.pose = pose;
  return pose;
}

// ---------- TV: izlenen yayın duvardaki ekranda oynar ----------
// list: [{ key, label, stream }] — yayın sesi bugünkü gibi ayrı çalar, TV videosu sessiz
function roomTv(list) {
  if (!room.mounted) return;
  room.tvList = list;
  // Yayın etiketine tıklanan yayın (henüz görüntüsü gelmemiş olabilir) gelince TV'ye geçer
  if (room.tvWant && list.some((x) => x.key === room.tvWant)) [room.tvKey, room.tvWant] = [room.tvWant, null];
  if (!list.some((x) => x.key === room.tvKey)) room.tvKey = list[0]?.key || null;
  const cur = list.find((x) => x.key === room.tvKey) || null;
  if (!room.tvVideo) {
    room.tvVideo = document.createElement('video');
    Object.assign(room.tvVideo, { muted: true, playsInline: true, autoplay: true });
  }
  const v = room.tvVideo;
  const want = cur?.stream || null;
  if (v.srcObject !== want) {
    v.srcObject = want;
    if (want) v.play().catch(() => {});
  }
  if (want && !room.tvTex) {
    room.tvTex = new THREE.VideoTexture(v);
    room.tvTex.encoding = THREE.sRGBEncoding;
  }
  const map = want ? room.tvTex : room.tvLogo;
  if (room.tv.material.map !== map) {
    room.tv.material.map = map;
    room.tv.material.needsUpdate = true;
  }
  roomTvBar(cur, list);
}
function roomTvBar(cur, list) {
  let bar = room.tvBar;
  if (!bar) {
    bar = room.tvBar = room.el.appendChild(document.createElement('div'));
    bar.className = 'rm-tv-bar';
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const L = room.tvList;
      const i = L.findIndex((x) => x.key === room.tvKey);
      if (act === 'big') {
        S.roomTiles = true;
        renderStage();
      } else if (act === 'prev' || act === 'next') {
        room.tvKey = L[(i + (act === 'next' ? 1 : -1) + L.length) % L.length]?.key || null;
        roomTv(L);
      }
    });
  }
  bar.classList.toggle('hidden', !cur);
  if (!cur) return;
  const multi = list.length > 1;
  bar.innerHTML = `${multi ? '<button data-act="prev" title="Önceki yayın">‹</button>' : ''}<span class="rm-tv-name"></span>${multi ? '<button data-act="next" title="Sonraki yayın">›</button>' : ''}<button data-act="big" title="Yayını büyük izle (işaret, ping, yakınlaştırma burada)">⛶ Büyüt</button>`;
  bar.querySelector('.rm-tv-name').textContent = '📺 ' + cur.label;
}

// Ekrandaki noktada hangi karakter var (kullanıcı id'si ya da null)
const rmRay = new THREE.Raycaster();
// Ekrandaki noktanın zemindeki karşılığı [x, z] (oda dışıysa null)
const rmFloor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function rmFloorPt(clientX, clientY) {
  if (!room.mounted) return null;
  const r = room.renderer.domElement.getBoundingClientRect();
  rmRay.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, room.camera);
  const v = rmRay.ray.intersectPlane(rmFloor, new THREE.Vector3());
  return v && Math.abs(v.x) < RW / 2 && Math.abs(v.z) < RD / 2 ? [+v.x.toFixed(2), +v.z.toFixed(2)] : null;
}

// Sunucudan gelen oda olayı: el sallama / dans ya da ping
function roomEvent(m) {
  if (!room.mounted) return;
  if (m.kind === 'emote') room.emotes.set(m.from, { kind: m.emote, at: m.at });
  if (m.kind !== 'ping' || !m.p) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 40), new THREE.MeshBasicMaterial({ color: m.color || '#ffffff', transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(m.p[0], 0.04, m.p[1]);
  room.scene.add(ring);
  const tag = room.tags.appendChild(document.createElement('div'));
  tag.className = 'rm-ping';
  tag.textContent = '📍 ' + m.name;
  tag.style.color = m.color || '#ffffff';
  room.pings.push({ ring, tag, p: m.p, at: m.at });
}
// Ping halkaları: 4 sn büyüyüp sönerek durur
function roomPings() {
  const t = roomNow(), cam = room.camera, W = room.el.clientWidth, H = room.el.clientHeight;
  room.pings = room.pings.filter((pg) => {
    const age = (t - pg.at) / 4000;
    if (age >= 1) {
      room.scene.remove(pg.ring);
      pg.ring.geometry.dispose();
      pg.ring.material.dispose();
      pg.tag.remove();
      return false;
    }
    pg.ring.scale.setScalar(1 + ((age * 4) % 1) * 0.8);
    pg.ring.material.opacity = 1 - age;
    rmTmp.set(pg.p[0], 0.7, pg.p[1]).project(cam);
    pg.tag.style.transform = `translate(${((rmTmp.x + 1) / 2) * W}px, ${((1 - rmTmp.y) / 2) * H}px) translate(-50%, -100%)`;
    pg.tag.style.opacity = rmTmp.z < 1 ? 1 - age * age : 0;
    return true;
  });
}

// Çarpışma: aynı andaki hesaplanmış yerlerden durumsuz itme (her bilgisayarda aynı sonuç, ağ yok).
// Yürüyenler birbirinden 0,8 birim uzak durur; oturan / oynayan yerinden oynamaz; süpürge kişilerden kaçar.
const RM_GAP = 0.8, RV_GAP = 0.75;
function roomSeparate() {
  const list = [...room.chars.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const off = list.map(() => [0, 0]);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.fixed && b.fixed) continue;
      const pa = a.g.position, pb = b.g.position;
      let dx = pb.x - pa.x, dz = pb.z - pa.z;
      const d = Math.hypot(dx, dz);
      if (d >= RM_GAP) continue;
      [dx, dz] = d > 1e-4 ? [dx / d, dz / d] : [1, 0];
      const push = RM_GAP - d;
      const wa = a.fixed ? 0 : b.fixed ? 1 : 0.5;
      off[i][0] -= dx * push * wa;
      off[i][1] -= dz * push * wa;
      off[j][0] += dx * push * (1 - wa);
      off[j][1] += dz * push * (1 - wa);
    }
  list.forEach((c, i) => {
    const pos = c.g.position, x = pos.x + off[i][0], z = pos.z + off[i][1];
    if ((off[i][0] || off[i][1]) && !roomInObst(x, z, 0.25)) {
      pos.x = x;
      pos.z = z;
    }
  });
  const v = room.vac?.position;
  if (!v) return;
  let ox = 0, oz = 0;
  for (const c of list) {
    const dx = v.x - c.g.position.x, dz = v.z - c.g.position.z, d = Math.hypot(dx, dz);
    if (d < RV_GAP && d > 1e-4) {
      ox += (dx / d) * (RV_GAP - d);
      oz += (dz / d) * (RV_GAP - d);
    }
  }
  if ((ox || oz) && !roomInObst(v.x + ox, v.z + oz, 0.2)) {
    v.x += ox;
    v.z += oz;
  }
}

function roomPick(clientX, clientY) {
  if (!room.mounted) return null;
  const r = room.renderer.domElement.getBoundingClientRect();
  rmRay.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, room.camera);
  const hits = rmRay.intersectObjects([...room.chars.values()].map((c) => c.g), true);
  for (const h of hits) {
    for (let o = h.object; o; o = o.parent) for (const c of room.chars.values()) if (c.g === o) return c.id;
  }
  return null;
}
