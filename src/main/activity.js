'use strict';
/**
 * Oynadığın oyunu ve Spotify'da dinlediğin şarkıyı bulur (Discord'daki "… oynuyor" gibi).
 * - Oyun: çalışan programların adları bilinen oyunlar listesiyle karşılaştırılır.
 * - Spotify (Windows): Spotify penceresinin başlığı "Sanatçı - Şarkı" olur.
 * - Spotify (macOS): AppleScript ile çalan şarkı sorulur (ilk seferde macOS izin ister).
 * Hiçbir bilgi bilgisayardan dışarı gitmez; sadece bulunan oyun/şarkı adı sunucuya gönderilir.
 */
const { execFile } = require('child_process');
const path = require('path');

// Program adı (küçük harf, .exe olmadan) -> oyun adı
const GAMES = {
  seafight: 'Seafight',
  'valorant-win64-shipping': 'Valorant',
  cs2: 'Counter-Strike 2',
  csgo: 'Counter-Strike: Global Offensive',
  'league of legends': 'League of Legends',
  leagueoflegends: 'League of Legends',
  dota2: 'Dota 2',
  'fortniteclient-win64-shipping': 'Fortnite',
  r5apex: 'Apex Legends',
  r5apex_dx12: 'Apex Legends',
  gta5: 'GTA V',
  gta5_enhanced: 'GTA V',
  playgtav: 'GTA V',
  rdr2: 'Red Dead Redemption 2',
  'rocketleague': 'Rocket League',
  overwatch: 'Overwatch 2',
  'minecraft.windows': 'Minecraft',
  minecraft: 'Minecraft',
  robloxplayerbeta: 'Roblox',
  roblox: 'Roblox',
  eldenring: 'Elden Ring',
  cyberpunk2077: 'Cyberpunk 2077',
  rainbowsix: 'Rainbow Six Siege',
  rainbowsix_vulkan: 'Rainbow Six Siege',
  rainbowsix_be: 'Rainbow Six Siege',
  'tslgame': 'PUBG: Battlegrounds',
  fc24: 'EA SPORTS FC 24',
  fc25: 'EA SPORTS FC 25',
  fc26: 'EA SPORTS FC 26',
  valheim: 'Valheim',
  'among us': 'Among Us',
  terraria: 'Terraria',
  eurotrucks2: 'Euro Truck Simulator 2',
  amtrucks: 'American Truck Simulator',
  metin2client: 'Metin2',
  knightonline: 'Knight Online',
  'wolfteam.bin': 'Wolfteam',
  zula: 'Zula',
  bf2042: 'Battlefield 2042',
  bf6: 'Battlefield 6',
  'cod': 'Call of Duty',
  'cod24': 'Call of Duty',
  modernwarfare: 'Call of Duty: Modern Warfare',
  blackops6: 'Call of Duty: Black Ops 6',
  'deadbydaylight-win64-shipping': 'Dead by Daylight',
  rustclient: 'Rust',
  discovery: 'THE FINALS',
  'marvel-win64-shipping': 'Marvel Rivals',
  helldivers2: 'Helldivers 2',
  bg3: "Baldur's Gate 3",
  bg3_dx11: "Baldur's Gate 3",
  'palworld-win64-shipping': 'Palworld',
  'lethal company': 'Lethal Company',
  phasmophobia: 'Phasmophobia',
  hearthstone: 'Hearthstone',
  wow: 'World of Warcraft',
  'diablo iv': 'Diablo IV',
  pathofexile: 'Path of Exile',
  pathofexile_x64: 'Path of Exile',
  pathofexile_x64steam: 'Path of Exile',
  pathofexile2: 'Path of Exile 2',
  'osu!': 'osu!',
  genshinimpact: 'Genshin Impact',
  zenlesszonezero: 'Zenless Zone Zero',
  starrail: 'Honkai: Star Rail',
  'warframe.x64': 'Warframe',
  sotgame: 'Sea of Thieves',
  aces: 'War Thunder',
  worldoftanks: 'World of Tanks',
  'wotblitz': 'World of Tanks Blitz',
  'thehunterm': 'theHunter',
  fallguys_client_game: 'Fall Guys',
  'fallguys_client': 'Fall Guys',
  'stardew valley': 'Stardew Valley',
  'hollow knight': 'Hollow Knight',
  'hollow knight silksong': 'Hollow Knight: Silksong',
  cuphead: 'Cuphead',
  'witcher3': 'The Witcher 3',
  'hogwartslegacy': 'Hogwarts Legacy',
  'starfield': 'Starfield',
  'skyrimse': 'Skyrim',
  'fallout4': 'Fallout 4',
  'sekiro': 'Sekiro',
  'darksoulsiii': 'Dark Souls III',
  'monsterhunterwilds': 'Monster Hunter Wilds',
  'monsterhunterworld': 'Monster Hunter: World',
  'nba2k25': 'NBA 2K25',
  'f1_24': 'F1 24',
  'forzahorizon5': 'Forza Horizon 5',
  'forzahorizon4': 'Forza Horizon 4',
  'assettocorsa': 'Assetto Corsa',
  'acc': 'Assetto Corsa Competizione',
  'arma3_x64': 'Arma 3',
  'dayz_x64': 'DayZ',
  'escapefromtarkov': 'Escape from Tarkov',
  'hunt': 'Hunt: Showdown',
  'deeprockgalactic': 'Deep Rock Galactic',
  'payday3': 'PAYDAY 3',
  'payday2_win32_release': 'PAYDAY 2',
  'left4dead2': 'Left 4 Dead 2',
  'gmod': "Garry's Mod",
  'hl2': 'Half-Life 2',
  'tf_win64': 'Team Fortress 2',
  'teardown': 'Teardown',
  'satisfactory': 'Satisfactory',
  'factorio': 'Factorio',
  'cities2': 'Cities: Skylines II',
  'cities': 'Cities: Skylines',
  'civilizationvi': 'Civilization VI',
  'civ7': 'Civilization VII',
  'eu4': 'Europa Universalis IV',
  'hoi4': 'Hearts of Iron IV',
  'ck3': 'Crusader Kings III',
  'stellaris': 'Stellaris',
  'aoe2de_s': 'Age of Empires II',
  'aoe4': 'Age of Empires IV',
  'sc2': 'StarCraft II',
  'mountblade2': 'Mount & Blade II',
  'bannerlord': 'Mount & Blade II: Bannerlord',
  'r6-siege': 'Rainbow Six Siege',
  'deltaforce-win64-shipping': 'Delta Force',
  'naraka': 'Naraka: Bladepoint',
  'smite2': 'SMITE 2',
  'paladins': 'Paladins',
  'brawlhalla': 'Brawlhalla',
  'multiversus': 'MultiVersus',
  'tekken8': 'Tekken 8',
  'streetfighter6': 'Street Fighter 6',
  'mk1': 'Mortal Kombat 1',
  'efootball': 'eFootball',
  'pes2021': 'eFootball PES 2021',
  'fm': 'Football Manager',
  'fm24': 'Football Manager 24',
  'stumbleguys': 'Stumble Guys',
  'brawlstars': 'Brawl Stars',
  'clashroyale': 'Clash Royale',
  'leagueclient': null, // istemci açık ama oyunda değil
  'riotclientservices': null,
};

const run = (cmd, args, timeout = 8000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? '' : String(out || '')));
  });

const exeKey = (raw) => String(raw || '').toLowerCase().replace(/\.exe$/, '').trim();
function gameFrom(names, custom = []) {
  // Kullanıcının kendi eklediği oyunlar önce bakılır
  const mine = new Map(custom.filter((g) => g && g.exe && g.name).map((g) => [exeKey(g.exe), String(g.name).slice(0, 60)]));
  for (const raw of names) {
    const n = exeKey(raw);
    if (mine.has(n)) return mine.get(n);
    if (GAMES[n]) return GAMES[n];
  }
  return '';
}

async function processNames() {
  if (process.platform === 'win32') {
    const out = await run('tasklist', ['/fo', 'csv', '/nh']);
    return out
      .split(/\r?\n/)
      .map((l) => (/^"([^"]+)"/.exec(l) || [])[1])
      .filter(Boolean);
  }
  const out = await run('ps', ['-axo', 'comm=']);
  return out
    .split('\n')
    .map((l) => path.basename(l.trim()))
    .filter(Boolean);
}

let macSpotifyDenied = false;
async function spotify(names) {
  if (process.platform === 'win32') {
    if (!names.some((n) => n.toLowerCase() === 'spotify.exe')) return '';
    const out = await run('tasklist', ['/v', '/fo', 'csv', '/nh', '/fi', 'imagename eq Spotify.exe']);
    for (const line of out.split(/\r?\n/)) {
      const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
      const title = cols[cols.length - 1] || '';
      // Çalmıyorken başlık "Spotify" / "Spotify Premium" olur
      if (title && / - /.test(title) && !/^spotify/i.test(title)) return title.slice(0, 120);
    }
    return '';
  }
  if (process.platform === 'darwin') {
    if (macSpotifyDenied || !names.includes('Spotify')) return '';
    const script = 'tell application "Spotify" to if player state is playing then return (artist of current track) & " - " & (name of current track)';
    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 5000 }, (err, out, errOut) => {
        if (err) {
          if (/-1743|not authori[sz]ed/i.test(String(errOut || err.message))) macSpotifyDenied = true; // izin verilmedi: bir daha sorma
          return resolve('');
        }
        resolve(String(out || '').trim().slice(0, 120));
      });
    });
  }
  return '';
}

// Program listesi birkaç saniye saklanır: sık tarama (şarkı değişimi için) bilgisayarı yormasın
let namesCache = { at: 0, names: [] };
async function cachedNames(maxAge) {
  if (Date.now() - namesCache.at > maxAge) namesCache = { at: Date.now(), names: await processNames() };
  return namesCache.names;
}
async function scan({ games = true, music = true, custom = [], list = false } = {}) {
  if (list) {
    // "Oyun ekle" penceresi için: şu an çalışan programlar (sistem programları hariç)
    const names = await cachedNames(0);
    const skip = /^(svchost|system|idle|registry|smss|csrss|wininit|winlogon|services|lsass|fontdrvhost|dwm|conhost|explorer|runtimebroker|searchhost|sihost|taskhostw|ctfmon|dllhost|tasklist|backgroundtaskhost|applicationframehost|startmenuexperiencehost|textinputhost|shellexperiencehost|securityhealth.*|msedgewebview2|audiodg|spoolsv|memory compression|wudfhost|smartscreen|kanki.*|electron)$/i;
    return { names: [...new Set(names.map((n) => n.replace(/\.exe$/i, '')))].filter((n) => !skip.test(n)).sort((a, b) => a.localeCompare(b)) };
  }
  if (!games && !music) return { game: '', music: '' };
  const names = await cachedNames(25000);
  return { game: games ? gameFrom(names, custom) : '', music: music ? await spotify(names) : '' };
}

module.exports = { scan, GAMES };
