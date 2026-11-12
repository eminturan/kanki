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
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020203);
    scene.fog = new THREE.FogExp2(0x020203, 0.012);
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
  room.el?.replaceChildren();
  room.chars.clear();
  room.tags = null;
  Object.assign(room, { mounted: false, el: null, renderer: null, scene: null, camera: null, composer: null, bloomPass: null, raf: 0, fps: 0, bloom: false, ro: null, off: null, anim: [], tvVideo: null, tvTex: null, tvKey: null, tvList: [], tvBar: null });
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
  return { mounted: room.mounted, fps: room.fps, bloom: room.bloom, tv, mem, follow: room.follow || null, chars: Object.fromEntries([...room.chars].map(([id, c]) => [id, c.debug || {}])) };
}

// ---------- Sahne ----------
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
  sc.add(new THREE.HemisphereLight(0x8a90ff, 0x1a0508, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  sc.add(key);
  rmLight(0xff3048, -8, 3, -6);
  rmLight(0x3a6bff, 8, 3, -6);
  rmLight(0xb04dff, 0, 3.5, 6, 0.9, 14);

  // zemin
  const floorTex = new THREE.CanvasTexture(
    rmCanvas(256, 256, (g) => {
      g.fillStyle = '#17171c';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#22222a';
      g.lineWidth = 3;
      for (let i = 0; i <= 256; i += 64) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
      }
    })
  );
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  sc.add(floor);
  room.floor = floor;

  // duvarlar: kameraya bakan gizlenir; neon şeritler duvara bağlı
  room.walls = [
    [rmBox(W, 5, 0.3, rmMat(0x1b1320), 0, 2.5, -D / 2), new THREE.Vector3(0, 0, -1)],
    [rmBox(0.3, 5, D, rmMat(0x151522), -W / 2, 2.5, 0), new THREE.Vector3(-1, 0, 0)],
    [rmBox(0.3, 5, D, rmMat(0x151522), W / 2, 2.5, 0), new THREE.Vector3(1, 0, 0)],
    [rmBox(W, 5, 0.3, rmMat(0x1b1320), 0, 2.5, D / 2), new THREE.Vector3(0, 0, 1)],
  ];
  rmBox(W - 1, 0.08, 0.08, rmGlow(0xff3048), 0, 2.1, 0.2, room.walls[0][0]);
  rmBox(0.08, 0.08, D - 1, rmGlow(0x3a6bff), 0.2, 2.1, 0, room.walls[1][0]);
  rmBox(0.08, 0.08, D - 1, rmGlow(0xb04dff), -0.2, 2.1, 0, room.walls[2][0]);

  // "KANKİ" tabelası (arada titrer) ve kumanda tabelası
  const signCan = rmCanvas(512, 160, () => {});
  const signTex = new THREE.CanvasTexture(signCan);
  const drawSign = (on) => {
    const g = signCan.getContext('2d');
    g.clearRect(0, 0, 512, 160);
    g.font = 'italic 900 112px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3048';
    g.shadowBlur = on ? 30 : 6;
    g.strokeStyle = on ? '#ffd0d6' : '#5a1520';
    g.lineWidth = 5;
    g.strokeText('KANKİ', 256, 84);
    g.fillStyle = on ? '#ff3048' : '#3a0a12';
    g.fillText('KANKİ', 256, 84);
    signTex.needsUpdate = true;
  };
  drawSign(true);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.25), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
  sign.position.set(-6.6, 3.3, -D / 2 + 0.2);
  sc.add(sign);
  const signLight = rmLight(0xff3048, -6.6, 3, -D / 2 + 1.2, 1.6, 8);
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
  room.anim.push((now) => ledMat.color.setHSL((now * 0.00008) % 1, 1, 0.55));

  // tavan lambaları ve ışık konileri
  room.beams = [];
  [[-5, -2], [5, -2], [0, 3]].forEach(([x, z], i) => {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 5, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: [0xff3048, 0x3a6bff, 0xb04dff][i], transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    cone.position.set(x, 2.5, z);
    sc.add(cone);
    room.beams.push(cone);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 20), new THREE.MeshBasicMaterial({ color: [0xff6070, 0x6a8bff, 0xc87dff][i], toneMapped: false }));
    lamp.position.set(x, 4.98, z);
    sc.add(lamp);
  });
  room.anim.push((now) => room.beams.forEach((b, i) => (b.material.opacity = 0.045 + Math.sin(now * 0.0015 + i * 2) * 0.02)));

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
  room.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.07, map: dot, transparent: true, opacity: 0.55, color: 0xffc0d0, depthWrite: false, blending: THREE.AdditiveBlending }));
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

  // halı, koltuk
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), rmMat(0x3a1020));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, -1.5);
  rug.receiveShadow = true;
  sc.add(rug);
  const sofa = new THREE.Group();
  sofa.position.set(0, 0, 1.6);
  sc.add(sofa);
  const sofaMat = rmMat(0x5a1424);
  rmBox(5.2, 0.55, 1.3, sofaMat, 0, 0.45, 0, sofa);
  rmBox(5.2, 1.1, 0.35, sofaMat, 0, 0.95, 0.5, sofa);
  rmBox(0.35, 0.85, 1.3, sofaMat, -2.6, 0.7, 0, sofa);
  rmBox(0.35, 0.85, 1.3, sofaMat, 2.6, 0.7, 0, sofa);

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
    if (u) userMenu(e, u);
    else e.preventDefault();
  });
  // Sol tık: karakteri takip et + profil kartı; boşluğa tık: bırak
  room.onClick = (e) => {
    const id = roomPick(e.clientX, e.clientY);
    room.follow = id;
    if (id) openProfile(id, room.chars.get(id).tag);
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

// Performans modu: ışıma, toz, gölge ve ışık konileri kapalı, piksel oranı 1
function roomPerf() {
  if (!room.mounted) return;
  const lite = !!settings.perfMode;
  room.bloom = !lite;
  room.bloomPass.enabled = !lite;
  room.dust.visible = !lite;
  room.beams.forEach((b) => (b.visible = !lite));
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
  roomTick?.(now, dt);
  const v = room.view, cam = room.camera;
  const look = room.look || (room.look = new THREE.Vector3(0, 1, 0));
  const fc = room.follow && room.chars.get(room.follow);
  if (room.follow && !fc) room.follow = null; // takip edilen çıktı
  look.lerp(fc ? rmTmp.set(fc.g.position.x, 1.2, fc.g.position.z) : rmTmp.set(0, 1, 0), 0.08);
  const dd = (fc ? Math.min(v.dist, 9) : v.dist) * Math.max(1, 1.5 / cam.aspect);
  cam.position.set(look.x + Math.sin(v.yaw) * Math.cos(v.pitch) * dd, look.y + Math.sin(v.pitch) * dd, look.z + Math.cos(v.yaw) * Math.cos(v.pitch) * dd);
  cam.lookAt(look);
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
  part(new THREE.CylinderGeometry(0.34, 0.42, 0.9, 18), bodyM, 1.05, g);
  const limb = (x, y, r, len, mat) => {
    const piv = new THREE.Group();
    piv.position.set(x, y, 0);
    part(new THREE.CylinderGeometry(r, r, len, 10), mat, -len / 2, piv);
    g.add(piv);
    return piv;
  };
  const legs = [-0.15, 0.15].map((x) => limb(x, 0.62, 0.11, 0.6, rmMat(0x1a1a20)));
  const arms = [-0.45, 0.45].map((x) => limb(x, 1.4, 0.09, 0.62, bodyM));
  const head = new THREE.Group();
  head.position.y = 1.95;
  g.add(head);
  part(new THREE.SphereGeometry(0.5, 28, 20), bodyM, 0, head);
  const facePiv = new THREE.Group();
  head.add(facePiv);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), new THREE.MeshBasicMaterial({ toneMapped: false }));
  face.position.z = 0.53;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.045, 8, 40), new THREE.MeshBasicMaterial({ toneMapped: false }));
  rim.position.z = 0.53;
  facePiv.add(face, rim);
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
  g.position.set((Math.random() - 0.5) * 8, 0, 2 + Math.random() * 3);
  room.scene.add(g);
  const tag = document.createElement('div');
  tag.className = 'rm-tag';
  tag.innerHTML = '<div class="rm-n"><span class="rm-name"></span><span class="rm-ic"></span></div><div class="rm-a"></div>';
  room.tags.append(tag);
  return { id: u.id, g, bodyM, legs, arms, head, facePiv, face, rim, ring, waves, zz, tag, phase: Math.random() * 6, speaking: false, debug: { speaking: false } };
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
    const nc = roomNameColor(u);
    c.rim.material.color.set(nc);
    roomFaceTex(c, u);
    const name = u.name + (u.id === S.myId ? ' (sen)' : '');
    const icons = [u.muted && 'mic', u.deafened && 'head', screenSharesOf(u).length && 'live'].filter(Boolean);
    const n = c.tag.querySelector('.rm-name');
    n.textContent = name;
    n.style.color = nc;
    c.tag.querySelector('.rm-ic').innerHTML = (u.muted ? ICON.micOff : '') + (u.deafened ? ICON.headOff : '') + (icons.includes('live') ? '<b class="live">CANLI</b>' : '');
    Object.assign(c.debug, { name, body, icons });
    roomPlan(c);
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
    roomFree(c);
    room.chars.delete(id);
  }
}

// Her kare: yüz diski kameraya dönsün, etiketler karakterin üstünde dursun
const rmTmp = new THREE.Vector3();
const rmQ = new THREE.Quaternion();
let roomTick = (now, dt) => {
  const cam = room.camera, W = room.el.clientWidth, H = room.el.clientHeight;
  const r = room.el.getBoundingClientRect();
  for (const c of room.chars.values()) {
    roomMove(c, now, dt);
    c.head.getWorldQuaternion(rmQ);
    c.facePiv.quaternion.copy(rmQ.invert()).multiply(cam.quaternion);
    const p = c.g.position;
    rmTmp.set(p.x, p.y + 2.7, p.z).project(cam);
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
const roomTaken = () => new Set([...room.chars.values()].map((c) => c.spot).filter(Boolean));
function roomFree(c) {
  c.spot = null;
}
// Varınca bakılacak yön [x, z] (null = kendi konumu)
const RM_FACE = { tv: [0, -10], desk: [-20, null], arcade: [20, null], foos: [null, 3.6], puf: [0, -10] };
function roomGo(c, goal, label, stay) {
  roomFree(c);
  c.goal = goal;
  c.label = label;
  c.until = performance.now() + stay;
  c.arrived = false;
  if (goal === 'walk') {
    c.target = new THREE.Vector3((Math.random() - 0.5) * (RW - 6), 0, (Math.random() - 0.5) * (RD - 6));
    c.sit = false;
    c.look = null;
  } else {
    const taken = roomTaken();
    const i = ROOM_SPOTS[goal].findIndex((_, j) => !taken.has(goal + j));
    const [x, z] = ROOM_SPOTS[goal][i];
    c.spot = goal + i;
    c.target = new THREE.Vector3(x, 0, z);
    c.sit = goal === 'tv' || goal === 'desk' || goal === 'puf';
    const [fx, fz] = RM_FACE[goal];
    c.look = new THREE.Vector3(fx ?? x, 0, fz ?? z);
  }
  Object.assign(c.debug, { goal, label });
}
const roomHasFree = (goal) => ROOM_SPOTS[goal].length > [...roomTaken()].filter((k) => k.startsWith(goal)).length;
// Kişinin durumuna göre ne yapacağını seç (durum değişmediyse dokunma)
function roomPlan(c) {
  const u = c.u;
  const game = u.activity?.game || '';
  const mode = presenceOf(u) === 'idle' ? 'idle' : game ? 'game:' + game : 'free';
  if (mode === c.mode) return;
  c.mode = mode;
  c.zz.forEach((z) => (z.visible = mode === 'idle'));
  if (mode === 'idle') return roomGo(c, roomHasFree('puf') ? 'puf' : 'walk', '💤 Boşta', 1e12);
  if (game) return roomGo(c, roomHasFree('desk') ? 'desk' : 'walk', '🎮 ' + game, 1e12);
  roomWander(c);
}
function roomWander(c) {
  const opts = [
    ['tv', ''], // etiket TV'nin durumuna göre roomMove'da yazılır
    ['arcade', '🕹️ Atari oynuyor'],
    ['foos', '⚽ Langırt oynuyor'],
    ['walk', '🚶 Geziniyor'],
  ].filter(([g]) => g === 'walk' || roomHasFree(g));
  const [goal, label] = opts[Math.floor(Math.random() * opts.length)];
  roomGo(c, goal, label, 6000 + Math.random() * 6000);
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
function roomMove(c, now, dt) {
  const pos = c.g.position;
  if (!c.target) return;
  rmTmp.copy(c.target).sub(pos);
  rmTmp.y = 0;
  const d = rmTmp.length();
  const act = c.tag.querySelector('.rm-a');
  // koltuktaki: TV'de yayın varsa izliyor, yoksa takılıyor (yayın sonradan açılabilir)
  if (c.goal === 'tv' && c.mode === 'free') c.label = c.debug.label = room.tvKey ? '📺 Yayını izliyor' : '🛋️ Koltukta takılıyor';
  if (!c.arrived && d > 0.08) {
    rmTmp.normalize();
    pos.addScaledVector(rmTmp, Math.min(d, dt * 2.2));
    c.g.rotation.y = roomLerpAngle(c.g.rotation.y, Math.atan2(rmTmp.x, rmTmp.z), 0.2);
    const sw = Math.sin(now * 0.012 + c.phase);
    c.legs[0].rotation.x = sw * 0.6;
    c.legs[1].rotation.x = -sw * 0.6;
    c.arms[0].rotation.x = -sw * 0.5;
    c.arms[1].rotation.x = sw * 0.5;
    pos.y = Math.abs(sw) * 0.06;
    c.head.rotation.z = 0;
    act.textContent = c.goal === 'walk' ? c.label : '🚶 → ' + c.label;
  } else {
    c.arrived = true;
    if (c.look) {
      rmTmp.copy(c.look).sub(pos);
      c.g.rotation.y = roomLerpAngle(c.g.rotation.y, Math.atan2(rmTmp.x, rmTmp.z), 0.15);
    }
    pos.y = c.sit ? RM_SIT_Y[c.goal] || 0 : 0;
    c.legs.forEach((l) => (l.rotation.x = c.sit ? -1.4 : 0));
    const play = c.goal === 'arcade' || c.goal === 'foos' || c.goal === 'desk';
    c.arms.forEach((a, j) => (a.rotation.x = play ? -1.1 + Math.sin(now * 0.02 + j * 2) * 0.12 : c.sit ? -0.3 : 0));
    c.head.rotation.z = c.mode === 'idle' ? 0.45 : Math.sin(now * 0.001 + c.phase) * 0.05;
    act.textContent = c.label;
    if (now > c.until && c.mode === 'free') roomWander(c);
  }
  // konuşma halkası ve dalgalar
  const ring = c.ring.material;
  ring.opacity += ((c.speaking ? 0.55 + Math.sin(now * 0.02) * 0.3 : 0) - ring.opacity) * 0.25;
  c.head.position.y = 1.95 + (c.speaking ? Math.abs(Math.sin(now * 0.025)) * 0.03 : 0);
  c.waves.forEach((w, k) => {
    const t = (now * 0.0009 + k / 3) % 1;
    w.scale.setScalar(1 + t * 1.6);
    w.material.opacity = c.speaking ? (1 - t) * 0.7 : Math.max(0, w.material.opacity - 0.05);
  });
  if (c.mode === 'idle')
    c.zz.forEach((z, k) => {
      const t = (now * 0.0004 + k / 3) % 1;
      z.position.set(0.3 + t * 0.5, 2.5 + t * 1.1, 0);
      z.material.opacity = Math.sin(t * Math.PI);
    });
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
