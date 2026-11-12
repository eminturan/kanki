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
const roomActive = () => !!(settings.roomView && S.channelId && roomSupported());

function roomMount(el) {
  if (room.mounted) return true;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      roomFail('Ekran kartı bağlantısı koptu.');
    });
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020203);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    Object.assign(room, { mounted: true, el, renderer, scene, camera });
    const loop = () => {
      if (!room.mounted) return;
      room.raf = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();
    return true;
  } catch (e) {
    log('room mount', e?.message);
    roomUnmount();
    return false;
  }
}

function roomUnmount() {
  cancelAnimationFrame(room.raf);
  if (room.renderer) {
    room.renderer.dispose();
    room.renderer.forceContextLoss();
  }
  room.el?.replaceChildren();
  room.chars.clear();
  Object.assign(room, { mounted: false, el: null, renderer: null, scene: null, camera: null, raf: 0, fps: 0, bloom: false });
}

function roomFail(why) {
  roomUnmount();
  toast('3D oda açılamadı', `${why} Klasik görünüme geçildi.`, 'err', 7000);
  settings.roomView = false;
  saveSettings();
  renderStage();
}

function roomDebug() {
  return { mounted: room.mounted, fps: room.fps, bloom: room.bloom, chars: Object.fromEntries([...room.chars].map(([id, c]) => [id, c.debug || {}])) };
}
