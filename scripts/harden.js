'use strict';
// electron-builder "beforePack" kancası: src/ ve server/ klasörlerinin küçültülmüş (minify) kopyasını
// build/min/ altına yazar; kurulum dosyasına bu kopya girer. Kaynak dosyalara dokunulmaz.
// Üst düzey adlar korunur (arayüz dosyaları birbirinin fonksiyonlarını ortak alandan kullanır),
// sadece fonksiyon içi adlar kısaltılır, boşluk ve yorumlar silinir.
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'min');
const DIRS = ['src', 'server'];
const SKIP = (rel) => rel.split(path.sep).includes('vendor'); // hazır kütüphaneler zaten küçültülmüş
let done = null;

async function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const src = path.join(dir, e.name);
    const r = path.join(rel, e.name);
    const dst = path.join(out, r);
    if (e.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      await walk(src, r, out);
    } else if (e.name.endsWith('.js') && !SKIP(r)) {
      const code = fs.readFileSync(src, 'utf8');
      const res = await minify(code, {
        ecma: 2022,
        module: false,
        toplevel: false,
        compress: { passes: 1, keep_fargs: true },
        mangle: { toplevel: false },
        format: { comments: false, ascii_only: false },
      });
      if (!res.code) throw new Error('küçültülemedi: ' + r);
      fs.writeFileSync(dst, res.code);
    } else fs.copyFileSync(src, dst);
  }
}

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const d of DIRS) {
    fs.mkdirSync(path.join(OUT, d), { recursive: true });
    await walk(path.join(ROOT, d), d, OUT);
  }
}

module.exports = async function beforePack() {
  if (!done) done = build(); // her mimari için bir kez değil, bir kez
  await done;
};
if (require.main === module) module.exports().then(() => console.log('build/min hazır'));
