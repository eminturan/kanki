'use strict';
/**
 * Müzik botu için şarkı bulma: YouTube (ve yt-dlp'nin desteklediği diğer siteler) bağlantılarını
 * ya da arama sözcüklerini çalınabilir ses adresine çevirir.
 *
 * yt-dlp (https://github.com/yt-dlp/yt-dlp, Unlicense) ilk kullanımda resmi GitHub sürümünden
 * Kanki Admin'in veri klasörüne indirilir ve haftada bir kendini günceller. YouTube için gereken
 * JavaScript çalıştırıcısı olarak Kanki'nin kendi içindeki Node kullanılır (ELECTRON_RUN_AS_NODE).
 * Doğrudan ses dosyası / internet radyosu bağlantıları yt-dlp olmadan çalınır.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFile } = require('child_process');

const isWin = process.platform === 'win32';
const ASSET = isWin ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp';
const DOWNLOAD_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`;
const binPath = () => path.join(app.getPath('userData'), 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
const stampPath = () => binPath() + '.updated';

const DIRECT_AUDIO = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)(\?|#|$)/i;
const isUrl = (s) => /^https?:\/\//i.test(s);
const isYouTube = (s) => /(^|\.)((youtube\.com)|(youtu\.be)|(music\.youtube\.com))$/i.test(safeHost(s));
function safeHost(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

// GitHub yönlendirmelerini izleyerek dosya indir
function download(url, dest, redirects = 6) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Kanki' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`İndirme başarısız (HTTP ${res.statusCode})`));
      }
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () =>
        out.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        })
      );
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('İndirme zaman aşımına uğradı')));
  });
}

let ensuring = null;
// yt-dlp yoksa indir; varsa haftada bir arka planda güncelle
function ensureYtDlp(onStatus = () => {}) {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const bin = binPath();
    if (!fs.existsSync(bin)) {
      onStatus('YouTube desteği ilk kez hazırlanıyor (yaklaşık 20–35 MB indiriliyor)…');
      fs.mkdirSync(path.dirname(bin), { recursive: true });
      await download(DOWNLOAD_URL, bin);
      if (!isWin) fs.chmodSync(bin, 0o755);
      fs.writeFileSync(stampPath(), String(Date.now()));
    } else {
      let last = 0;
      try {
        last = Number(fs.readFileSync(stampPath(), 'utf8')) || 0;
      } catch {}
      if (Date.now() - last > 7 * 864e5) {
        fs.writeFileSync(stampPath(), String(Date.now()));
        execFile(bin, ['-U'], { windowsHide: true, timeout: 120000 }, () => {}); // arka planda kendini günceller
      }
    }
    return bin;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

function ytdlp(args, timeout = 90000) {
  return new Promise((resolve, reject) => {
    execFile(
      binPath(),
      ['--no-warnings', '--ignore-config', '--js-runtimes', `node:${process.execPath}`, ...args],
      // yt-dlp, YouTube'un şifre çözme kodunu çalıştırmak için Kanki'nin içindeki Node'u kullanır
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(shortError(stderr || err.message)));
        resolve(stdout);
      }
    );
  });
}
function shortError(t) {
  const line = String(t)
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => /ERROR/i.test(x))
    .pop();
  const msg = (line || String(t).trim().split('\n').pop() || 'Bilinmeyen hata').replace(/^ERROR:\s*(\[[^\]]+\]\s*)?(\S+:\s*)?/, '');
  if (/Sign in to confirm your age|age/i.test(msg)) return 'Yaş sınırlı video, çalınamıyor.';
  if (/Private video/i.test(msg)) return 'Özel video, çalınamıyor.';
  if (/unavailable/i.test(msg)) return 'Video kullanılamıyor.';
  return msg.slice(0, 160);
}

const toItem = (e) => ({
  title: e.title || e.id || 'Bilinmeyen',
  url: e.webpage_url || e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : ''),
  duration: Math.round(e.duration || 0),
  thumbnail: e.thumbnail || (e.thumbnails && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : '') || (e.id ? `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` : ''),
});

/** Arama sözcüğü ya da bağlantı → kuyruğa eklenecek şarkılar (en fazla 50) */
async function resolve(query, onStatus) {
  query = String(query || '').trim();
  if (!query) return [];
  if (isUrl(query) && !isYouTube(query) && DIRECT_AUDIO.test(new URL(query).pathname)) {
    return [{ title: decodeURIComponent(new URL(query).pathname.split('/').pop() || query), url: query, duration: 0, thumbnail: '', direct: true }];
  }
  await ensureYtDlp(onStatus);
  if (!isUrl(query)) {
    const out = JSON.parse(await ytdlp(['--flat-playlist', '-J', `ytsearch1:${query}`]));
    return (out.entries || []).slice(0, 1).map(toItem);
  }
  const u = new URL(query);
  const pureList = isYouTube(query) && u.searchParams.get('list') && !u.searchParams.get('v');
  if (pureList) {
    const out = JSON.parse(await ytdlp(['--flat-playlist', '-J', '--playlist-end', '50', query]));
    return (out.entries || []).map(toItem).filter((x) => x.url);
  }
  const info = JSON.parse(await ytdlp(['-J', '--no-playlist', '--skip-download', query]));
  if (info._type === 'playlist') return (info.entries || []).slice(0, 50).map(toItem);
  return [toItem(info)];
}

/** Çalmadan hemen önce: şarkının ses akışı adresi (adresler birkaç saat geçerli olduğu için önceden alınmaz) */
async function stream(pageUrl, onStatus) {
  if (DIRECT_AUDIO.test(pageUrl) && !isYouTube(pageUrl)) return { url: pageUrl, headers: {} };
  await ensureYtDlp(onStatus);
  const info = JSON.parse(await ytdlp(['-J', '--no-playlist', '-f', 'bestaudio[acodec=opus]/bestaudio/best', pageUrl]));
  const fmt = info.requested_formats ? info.requested_formats[0] : info;
  if (!fmt.url) throw new Error('Ses akışı bulunamadı.');
  return { url: fmt.url, headers: fmt.http_headers || info.http_headers || {}, ...toItem(info) };
}

module.exports = { resolve, stream, ensureYtDlp, isDirect: (u) => isUrl(u) && !isYouTube(u) && DIRECT_AUDIO.test(u) };
