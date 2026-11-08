'use strict';
/**
 * Uzaktan kontrol: izleyen kişiden gelen fare/klavye olaylarını bu bilgisayara uygular.
 *
 * Güvenlik: olaylar sadece yayıncı isteği kabul ettikten sonra (start → stop arası) uygulanır.
 * Koordinatlar paylaşılan ekranın içine sıkıştırılır; başka ekrana dokunulmaz.
 *
 * Windows: user32 SetCursorPos + SendInput (tuşlar fiziksel tarama koduyla, yani klavye düzeni
 *          karşı tarafın değil bu bilgisayarın düzenine göre yorumlanır).
 *          Not: Yönetici olarak çalışan pencerelere (UAC) yetkisiz uygulama olay gönderemez.
 * macOS:   CoreGraphics CGEvent* (Erişilebilirlik izni gerekir).
 */
const { screen, systemPreferences } = require('electron');

const isWin = process.platform === 'win32';
// Test: KANKI_RC_DRYRUN=1 ise olaylar uygulanmaz, sadece kayda yazılır
const DRY = !!process.env.KANKI_RC_DRYRUN;
const isMac = process.platform === 'darwin';

// KeyboardEvent.code → [Windows tarama kodu, genişletilmiş mi]
const WIN_SCAN = {
  Escape: [0x01], Digit1: [0x02], Digit2: [0x03], Digit3: [0x04], Digit4: [0x05], Digit5: [0x06], Digit6: [0x07],
  Digit7: [0x08], Digit8: [0x09], Digit9: [0x0a], Digit0: [0x0b], Minus: [0x0c], Equal: [0x0d], Backspace: [0x0e],
  Tab: [0x0f], KeyQ: [0x10], KeyW: [0x11], KeyE: [0x12], KeyR: [0x13], KeyT: [0x14], KeyY: [0x15], KeyU: [0x16],
  KeyI: [0x17], KeyO: [0x18], KeyP: [0x19], BracketLeft: [0x1a], BracketRight: [0x1b], Enter: [0x1c],
  ControlLeft: [0x1d], KeyA: [0x1e], KeyS: [0x1f], KeyD: [0x20], KeyF: [0x21], KeyG: [0x22], KeyH: [0x23],
  KeyJ: [0x24], KeyK: [0x25], KeyL: [0x26], Semicolon: [0x27], Quote: [0x28], Backquote: [0x29], ShiftLeft: [0x2a],
  Backslash: [0x2b], KeyZ: [0x2c], KeyX: [0x2d], KeyC: [0x2e], KeyV: [0x2f], KeyB: [0x30], KeyN: [0x31],
  KeyM: [0x32], Comma: [0x33], Period: [0x34], Slash: [0x35], ShiftRight: [0x36], NumpadMultiply: [0x37],
  AltLeft: [0x38], Space: [0x39], CapsLock: [0x3a], F1: [0x3b], F2: [0x3c], F3: [0x3d], F4: [0x3e], F5: [0x3f],
  F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44], ScrollLock: [0x46], Numpad7: [0x47],
  Numpad8: [0x48], Numpad9: [0x49], NumpadSubtract: [0x4a], Numpad4: [0x4b], Numpad5: [0x4c], Numpad6: [0x4d],
  NumpadAdd: [0x4e], Numpad1: [0x4f], Numpad2: [0x50], Numpad3: [0x51], Numpad0: [0x52], NumpadDecimal: [0x53],
  IntlBackslash: [0x56], F11: [0x57], F12: [0x58],
  NumpadEnter: [0x1c, 1], ControlRight: [0x1d, 1], NumpadDivide: [0x35, 1], PrintScreen: [0x37, 1],
  AltRight: [0x38, 1], NumLock: [0x45, 1], Home: [0x47, 1], ArrowUp: [0x48, 1], PageUp: [0x49, 1],
  ArrowLeft: [0x4b, 1], ArrowRight: [0x4d, 1], End: [0x4f, 1], ArrowDown: [0x50, 1], PageDown: [0x51, 1],
  Insert: [0x52, 1], Delete: [0x53, 1], MetaLeft: [0x5b, 1], MetaRight: [0x5c, 1], ContextMenu: [0x5d, 1],
};

// KeyboardEvent.code → macOS sanal tuş kodu (kVK_*, fiziksel konum)
const MAC_KEY = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05, KeyZ: 0x06, KeyX: 0x07, KeyC: 0x08,
  KeyV: 0x09, IntlBackslash: 0x0a, KeyB: 0x0b, KeyQ: 0x0c, KeyW: 0x0d, KeyE: 0x0e, KeyR: 0x0f, KeyY: 0x10,
  KeyT: 0x11, Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit6: 0x16, Digit5: 0x17, Equal: 0x18,
  Digit9: 0x19, Digit7: 0x1a, Minus: 0x1b, Digit8: 0x1c, Digit0: 0x1d, BracketRight: 0x1e, KeyO: 0x1f, KeyU: 0x20,
  BracketLeft: 0x21, KeyI: 0x22, KeyP: 0x23, Enter: 0x24, KeyL: 0x25, KeyJ: 0x26, Quote: 0x27, KeyK: 0x28,
  Semicolon: 0x29, Backslash: 0x2a, Comma: 0x2b, Slash: 0x2c, KeyN: 0x2d, KeyM: 0x2e, Period: 0x2f, Tab: 0x30,
  Space: 0x31, Backquote: 0x32, Backspace: 0x33, Escape: 0x35, MetaRight: 0x36, MetaLeft: 0x37, ShiftLeft: 0x38,
  CapsLock: 0x39, AltLeft: 0x3a, ControlLeft: 0x3b, ShiftRight: 0x3c, AltRight: 0x3d, ControlRight: 0x3e,
  NumpadDecimal: 0x41, NumpadMultiply: 0x43, NumpadAdd: 0x45, NumLock: 0x47, NumpadDivide: 0x4b, NumpadEnter: 0x4c,
  NumpadSubtract: 0x4e, NumpadEqual: 0x51, Numpad0: 0x52, Numpad1: 0x53, Numpad2: 0x54, Numpad3: 0x55,
  Numpad4: 0x56, Numpad5: 0x57, Numpad6: 0x58, Numpad7: 0x59, Numpad8: 0x5b, Numpad9: 0x5c, F5: 0x60, F6: 0x61,
  F7: 0x62, F3: 0x63, F8: 0x64, F9: 0x65, F11: 0x67, F10: 0x6d, F12: 0x6f, Insert: 0x72, Home: 0x73, PageUp: 0x74,
  Delete: 0x75, F4: 0x76, End: 0x77, F2: 0x78, PageDown: 0x79, F1: 0x7a, ArrowLeft: 0x7b, ArrowRight: 0x7c,
  ArrowDown: 0x7d, ArrowUp: 0x7e, ContextMenu: 0x6e,
};
const MAC_MOD_FLAG = {
  ShiftLeft: 0x20000, ShiftRight: 0x20000, ControlLeft: 0x40000, ControlRight: 0x40000,
  AltLeft: 0x80000, AltRight: 0x80000, MetaLeft: 0x100000, MetaRight: 0x100000,
};

let native = null;
let loadError = '';

function loadNative() {
  if (native || loadError) return native;
  try {
    const koffi = require('koffi');
    if (isWin) {
      const user32 = koffi.load('user32.dll');
      // Boyutlar açıkça verilir (Windows'ta LONG/DWORD 32 bit, ULONG_PTR 64 bit)
      const MOUSEINPUT = koffi.struct('KANKI_MOUSEINPUT', { dx: 'int32_t', dy: 'int32_t', mouseData: 'uint32_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
      const KEYBDINPUT = koffi.struct('KANKI_KEYBDINPUT', { wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
      const HARDWAREINPUT = koffi.struct('KANKI_HARDWAREINPUT', { uMsg: 'uint32_t', wParamL: 'uint16_t', wParamH: 'uint16_t' });
      const INPUT_U = koffi.union('KANKI_INPUT_U', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
      const INPUT = koffi.struct('KANKI_INPUT', { type: 'uint32_t', u: INPUT_U });
      const SendInput = user32.func('uint32_t __stdcall SendInput(uint32_t cInputs, _In_ KANKI_INPUT *pInputs, int32_t cbSize)');
      const SetCursorPos = user32.func('int32_t __stdcall SetCursorPos(int32_t x, int32_t y)');
      const size = koffi.sizeof(INPUT);
      native = {
        move(x, y) {
          SetCursorPos(Math.round(x), Math.round(y));
        },
        mouse(flags, data = 0) {
          SendInput(1, [{ type: 0, u: { mi: { dx: 0, dy: 0, mouseData: data >>> 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }], size);
        },
        key(scan, ext, up) {
          const flags = 0x0008 | (up ? 0x0002 : 0) | (ext ? 0x0001 : 0); // SCANCODE | KEYUP | EXTENDEDKEY
          SendInput(1, [{ type: 1, u: { ki: { wVk: 0, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }], size);
        },
      };
    } else if (isMac) {
      const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
      const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
      const CGPoint = koffi.struct('KANKI_CGPoint', { x: 'double', y: 'double' });
      const CreateMouse = cg.func('void* CGEventCreateMouseEvent(void* source, uint32_t type, KANKI_CGPoint pos, uint32_t button)');
      const CreateKey = cg.func('void* CGEventCreateKeyboardEvent(void* source, uint16_t keycode, bool down)');
      const CreateScroll = cg.func('void* CGEventCreateScrollWheelEvent2(void* source, uint32_t units, uint32_t count, int32_t w1, int32_t w2, int32_t w3)');
      const SetFlags = cg.func('void CGEventSetFlags(void* event, uint64_t flags)');
      const SetInt = cg.func('void CGEventSetIntegerValueField(void* event, uint32_t field, int64_t value)');
      const Post = cg.func('void CGEventPost(uint32_t tap, void* event)');
      const Release = cf.func('void CFRelease(void* obj)');
      const post = (ev, flags) => {
        if (!ev) return;
        SetFlags(ev, flags);
        Post(0, ev); // kCGHIDEventTap
        Release(ev);
      };
      native = {
        mouse(type, x, y, button, flags, clicks = 0) {
          const ev = CreateMouse(null, type, { x, y }, button);
          if (ev && clicks) SetInt(ev, 1, clicks); // kCGMouseEventClickState (çift tık için)
          post(ev, flags);
        },
        key(code, down, flags) {
          post(CreateKey(null, code, down), flags);
        },
        scroll(dy, dx, flags) {
          post(CreateScroll(null, 0, 2, dy, dx, 0), flags); // piksel birimi
        },
      };
    } else {
      loadError = 'Bu işletim sisteminde desteklenmiyor.';
    }
  } catch (e) {
    loadError = e.message;
    native = null;
  }
  return native;
}

// ---------- Oturum ----------
let session = null; // { bounds, lastX, lastY, keys:Set, buttons:Set, macFlags }

function check(prompt = false) {
  if (DRY) return { ok: true };
  if (!loadNative()) return { ok: false, reason: 'unsupported', message: loadError || 'Fare/klavye kontrolü yüklenemedi.' };
  if (isMac && !systemPreferences.isTrustedAccessibilityClient(false)) {
    if (prompt) systemPreferences.isTrustedAccessibilityClient(true); // izin penceresini açar
    return { ok: false, reason: 'accessibility', message: 'macOS: Sistem Ayarları › Gizlilik ve Güvenlik › Erişilebilirlik bölümünden Kanki’ye izin ver, sonra tekrar dene.' };
  }
  return { ok: true };
}

function start(display) {
  const c = check(true);
  if (!c.ok) return c;
  const b = display.bounds;
  session = { bounds: b, lastX: b.x + b.width / 2, lastY: b.y + b.height / 2, keys: new Set(), buttons: new Set(), macFlags: 0 };
  return { ok: true };
}

function stop() {
  if (!session) return;
  if (DRY) console.log('[kanki] RC-STOP held=' + JSON.stringify([...session.keys, ...session.buttons]));
  // Basılı kalan tuş ve düğmeleri bırak (takılı kalmasın)
  for (const code of [...session.keys]) input({ t: 'k', c: code, d: false });
  for (const b of [...session.buttons]) input({ t: 'u', b });
  session = null;
}

const active = () => !!session;

// Normalleştirilmiş (0..1) konumu paylaşılan ekranın noktasına çevir
function point(nx, ny) {
  const b = session.bounds;
  const x = b.x + Math.min(Math.max(Number(nx) || 0, 0), 0.9999) * b.width;
  const y = b.y + Math.min(Math.max(Number(ny) || 0, 0), 0.9999) * b.height;
  session.lastX = x;
  session.lastY = y;
  return { x, y };
}

const WIN_BTN = { 0: [0x0002, 0x0004, 0], 1: [0x0020, 0x0040, 0], 2: [0x0008, 0x0010, 0], 3: [0x0080, 0x0100, 1], 4: [0x0080, 0x0100, 2] };
const MAC_BTN = { 0: [1, 2, 6, 0], 2: [3, 4, 7, 1], 1: [25, 26, 27, 2] }; // [down, up, dragged, cgButton]

function input(m) {
  if (DRY && session && m) return console.log('[kanki] RC-IN ' + JSON.stringify(m));
  if (!session || !native || !m) return;
  try {
    if (m.t === 'm' || ((m.t === 'd' || m.t === 'u') && m.x !== undefined)) {
      const p = point(m.x, m.y);
      if (isWin) {
        const phys = screen.dipToScreenPoint(p);
        native.move(phys.x, phys.y);
      } else if (m.t === 'm') {
        const held = [...session.buttons].find((b) => MAC_BTN[b]);
        const mb = MAC_BTN[held ?? 0];
        native.mouse(held !== undefined ? mb[2] : 5, p.x, p.y, mb[3], session.macFlags);
      }
    }
    if (m.t === 'd' || m.t === 'u') {
      const b = Number(m.b) || 0;
      const down = m.t === 'd';
      if (down) session.buttons.add(b);
      else session.buttons.delete(b);
      if (isWin) {
        const w = WIN_BTN[b];
        if (w) native.mouse(down ? w[0] : w[1], w[2]);
      } else {
        const mb = MAC_BTN[b];
        if (mb) native.mouse(down ? mb[0] : mb[1], session.lastX, session.lastY, mb[3], session.macFlags, Math.max(1, Math.min(3, Number(m.n) || 1)));
      }
    } else if (m.t === 'w') {
      const dy = Math.max(-2000, Math.min(2000, Number(m.dy) || 0));
      const dx = Math.max(-2000, Math.min(2000, Number(m.dx) || 0));
      if (isWin) {
        if (dy) native.mouse(0x0800, Math.round(-dy * 1.2)); // WHEEL: + yukarı; 120 = bir çentik
        if (dx) native.mouse(0x1000, Math.round(dx * 1.2)); // HWHEEL
      } else {
        native.scroll(Math.round(-dy), Math.round(-dx), session.macFlags);
      }
    } else if (m.t === 'k') {
      const code = String(m.c || '');
      const down = !!m.d;
      if (down) session.keys.add(code);
      else session.keys.delete(code);
      if (isWin) {
        const k = WIN_SCAN[code];
        if (k) native.key(k[0], !!k[1], !down);
      } else {
        const k = MAC_KEY[code];
        if (MAC_MOD_FLAG[code]) {
          // Değiştirici tuşlar: sonraki olaylara bayrak olarak eklenir
          const anyHeld = [...session.keys].some((x) => MAC_MOD_FLAG[x] === MAC_MOD_FLAG[code]);
          session.macFlags = anyHeld ? session.macFlags | MAC_MOD_FLAG[code] : session.macFlags & ~MAC_MOD_FLAG[code];
        }
        if (k !== undefined) native.key(k, down, session.macFlags);
      }
    }
  } catch (e) {
    console.error('[kanki] remote input', e.message);
  }
}

module.exports = { check, start, stop, input, active };
