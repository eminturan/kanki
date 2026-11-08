# Kanki — Sesli sohbet + ekran paylaşımı (macOS & Windows)

**İndirme sayfası:** https://kanki-app.github.io

Arkadaş grubu için kanal tabanlı sesli sohbet uygulaması. Kanallar, yazılı sohbet, dürtme ve **yüksek kaliteli ekran paylaşımı** (1080p/1440p/4K, 60 FPS'e kadar, sistem sesiyle) içerir.

## İki sürüm

| | **Kanki** (arkadaşlar için) | **Kanki Admin** (senin için) |
|---|---|---|
| Sunucuya bağlanma, konuşma, ekran paylaşımı | ✅ | ✅ |
| Sunucu kurma (bu bilgisayarda) + ngrok ile internete açma | — | ✅ |
| Kanal oluşturma / yeniden adlandırma / silme | — | ✅ |
| Kullanıcıyı başka kanala taşıma (sağ tık ya da sürükle-bırak) | — | ✅ |
| Kullanıcının mikrofonunu kapatma, sunucudan atma | — | ✅ |
| Yönetim paneli: bağlı kullanıcılar, IP'ler, adresler, sunucu adı ve şifresi | — | ✅ |
| Simge | mavi | turuncu, taçlı |

İki sürüm aynı bilgisayara yan yana kurulabilir.

## Kurulum dosyaları

**Arkadaşlarına gönderilecekler — `dist/client/`**

| Platform | Dosya |
|---|---|
| macOS Apple Silicon (M1–M4) | `Kanki-mac-arm64.dmg` |
| macOS Intel | `Kanki-mac-x64.dmg` |
| Windows (kurulum) | `Kanki-Setup.exe` |

**Senin için — `dist/admin/`**

| Platform | Dosya |
|---|---|
| macOS Apple Silicon (M1–M4) | `Kanki-Admin-mac-arm64.dmg` |
| macOS Intel | `Kanki-Admin-mac-x64.dmg` |
| Windows (kurulum) | `Kanki-Admin-Setup.exe` |

Uygulamalar imzasız olduğu için ilk açılışta uyarı görülür:
- **macOS:** Uygulamayı Applications klasörüne sürükle, sonra sağ tık → **Aç** → **Aç**. "Hasarlı" uyarısı çıkarsa Terminal'de: `xattr -cr /Applications/Kanki.app` (Admin için `"/Applications/Kanki Admin.app"`).
- **Windows:** SmartScreen'de **Ek bilgi → Yine de çalıştır**.

## Nasıl kullanılır

1. **Kanki Admin**'i aç → **Sunucu Kur** → **Sunucuyu Başlat ve Bağlan**. Sunucuyu kuran kişi otomatik olarak yönetici olur (adının yanında taç görünür).
2. Üst bardaki yeşil etikete tıklayınca adres kopyalanır; arkadaşlarına gönder.
3. Arkadaşların **Kanki**'yi açar, takma adını ve adresi yazıp **Bağlan**'a basar.
4. Kanala katılmak için çift tıkla. Ekranını paylaşmak için **Ekran Paylaş**.
5. Yönetim için üst bardaki **Yönetim** düğmesi; kullanıcılara ve kanallara sağ tık.

### Yönetici anahtarı
- Sunucuyu Kanki Admin ile kurduğunda yönetici anahtarı otomatik üretilir ve bu bilgisayarda saklanır. Her seferinde yönetici olarak girersin, şifre girmene gerek kalmaz.
- Başka bir bilgisayardan (ya da VPS'teki sunucuyu) yönetmek istersen Kanki Admin'in **Sunucuya Bağlan** ekranındaki *Yönetici anahtarı* alanına bu anahtarı yaz. Anahtarı yönetim panelindeki **Anahtarı kopyala** ile alabilirsin.
- Anahtarı kimseyle paylaşma; sahibi sunucuyu yönetebilir.

### İnternet üzerinden bağlanmak (farklı evlerden) — ngrok ile
Kanki Admin'in içinde ngrok desteği var. Port açmaya ya da ayrı bir program kurmaya gerek yok.

**Bir kerelik hazırlık (sadece sen):**
1. [ngrok.com](https://dashboard.ngrok.com/signup) adresinden ücretsiz hesap aç.
2. [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) sayfasından token'ı kopyala.
3. *(Önerilir)* [Domains](https://dashboard.ngrok.com/domains) sayfasından ücretsiz sabit domain'ini al (ör. `bizim-kanki.ngrok-free.app`). Böylece adres hiç değişmez.

**Her seferinde:**
1. **Sunucu Kur** sekmesinde **İnternete aç (ngrok)** kutusunu işaretle, token'ı ve (varsa) domain'i yapıştır. Bunlar hatırlanır.
2. **Sunucuyu Başlat ve Bağlan**. Üst barda `İnternette açık · bizim-kanki.ngrok-free.app` yazar. Tıklayınca adres kopyalanır.
3. Arkadaşların Kanki'de sadece bu adresi yazar. `https://` eklemelerine ya da port yazmalarına gerek yok.

Notlar:
- Sunucu, senin bilgisayarın ve Kanki Admin açık olduğu sürece çalışır.
- ngrok tünelinden sadece kanal bilgisi ve sohbet geçer. Ses ve ekran görüntüsü arkadaşlarınız arasında doğrudan akar, bu yüzden ngrok'un ücretsiz plan limitleri yayın kalitesini etkilemez.
- Ücretsiz ngrok hesabında aynı anda tek bir tünel açık olabilir.

Diğer seçenekler:
- **[Tailscale](https://tailscale.com):** Herkes kurar, Tailscale IP'si (`100.x.x.x:4455`) ile bağlanır.
- **Port yönlendirme:** Modemde TCP `4455` portunu sunucu bilgisayara yönlendir, arkadaşlar `dış-ip:4455` adresine bağlanır.
- **VPS'te sürekli açık sunucu:** `node server/server.js` (Node 18+). Ortam değişkenleri: `PORT`, `SERVER_NAME`, `SERVER_PASSWORD`, `ADMIN_KEY`, `TURN_URL`, `TURN_USER`, `TURN_PASS`. `ADMIN_KEY` verilmezse başlangıçta rastgele üretilip konsola yazılır.

> Ses ve görüntü sunucudan geçmez; kullanıcılar arasında doğrudan (P2P, WebRTC) akar. Bazı kısıtlı ağlarda (ör. mobil hat, CGNAT) doğrudan bağlantı kurulamazsa bir TURN sunucusu (coturn) gerekir ya da Tailscale kullanılır.

## Otomatik güncelleme ve yeni sürüm çıkarma
- **Kurulumlu Windows sürümü (`Kanki-Setup.exe`)** kendini günceller: açılışta ve açık kaldığı sürece 4 saatte bir GitHub Releases'a bakar. Uygulama açılır açılmaz yeni sürüm bulunursa (henüz bir sunucuya bağlanılmadıysa) indirip kurar ve kendiliğinden yeniden açılır. Kullanım sırasında bulunursa arka planda iner; sağ üstteki yeşil indirme düğmesi ilerlemeyi gösterir, hazır olunca düğmeye basmak güncelleyip yeniden başlatır. Basılmazsa uygulama kapatılınca kurulur.
- Mac sürümleri ve Kanki Admin kendini güncellemez; yeni sürüm indirme sayfasından elle indirilir.
- Kurulumsuz (portable) Windows sürümü şimdilik derlenmiyor. Tekrar açmak için `electron-builder.*.json` dosyalarında `win.target` listesine `portable` ekle ve `.github/workflows/build.yml` içindeki yorum satırlarını aç.
- Otomatik güncelleme 1.0.2 ile gelen bir özellik; daha eski sürümü kuranlar bir kere elle güncellemeli.

Yeni sürüm çıkarmak için `package.json` içindeki `version`'ı artır, commit'le ve aynı sürümün etiketini gönder:
```bash
npm version 1.0.3 --no-git-tag-version
git commit -am "Sürüm 1.0.3"
git tag v1.0.3
git push origin main v1.0.3
```
GitHub Actions paketleri derler, Release'e `latest.yml` ile birlikte ekler; kurulu uygulamalar güncellemeyi buradan görür.

## Ekran paylaşımı
- **Aynı anda birden fazla yayın:** Herkes en fazla 3 ekran/pencere paylaşabilir (ör. oyun + Discord penceresi + kod editörü). Paylaşırken sol alttaki **Ekran** düğmesiyle yenisi eklenir, her birinin altta kendi **Durdur** düğmesi vardır. Sistem sesi yankı yapmasın diye sadece ilk yayına eklenir.
- **Aynı anda birden fazla yayın izleme:** Kanaldaki tüm yayınlar üstte düğme olarak görünür; tıklayınca sahneye eklenir. Yayınlar otomatik olarak en büyük sığacak şekilde dizilir.
- **İstediğin yere yerleştir:** Her yayın penceresi üst çubuğundan tutulup sürüklenir, sağ alt köşesinden boyutlandırılır. Çift tıklayınca sahneyi kaplar. **Izgara** düğmesi hepsini yeniden düzenler. **Ayrı pencerede aç** ile yayın kendi penceresine çıkar; o pencere ekranın herhangi bir yerine ya da başka bir monitöre taşınabilir, kapatınca uygulamaya geri döner.
- Ekran veya tek pencere seçilebilir. Çözünürlük 720p'den 4K'ya, kare hızı 15/30/60 FPS arasında seçilebilir. Öncelik olarak **Akıcılık** (oyun) ya da **Netlik** (yazı/kod) seçilebilir. Bit hızı otomatik veya elle ayarlanır.
- **Yayını düzenle:** Yayın panelindeki **Düzenle** ile paylaşılan ekranı/pencereyi, çözünürlüğü, kare hızını, önceliği, bit hızını ve sistem sesini yayını durdurmadan değiştirebilirsin; izleyenler aynı pencerede izlemeye devam eder. Kaynak değişince (varsa) uzaktan kontrol durur.
- **Sistem sesi:** Windows'ta doğrudan çalışır. macOS'ta 14.2 ve üstü gerekir; desteklenmiyorsa yayın sadece görüntüyle başlar. Kanki'nin kendi çaldığı sesler (arkadaş sesleri, izlenen yayınlar) yayına girmez, böylece izleyenler kendi seslerini yankı olarak duymaz. Bunu desteklemeyen eski Windows'ta (10 2004 öncesi) tüm sistem sesi gider ve uygulama uyarır.
- Görüntü **sadece izlemeyi seçenlere** gönderilir. Yayıncının gereken yükleme hızı yaklaşık *bit hızı × izleyici sayısı* kadardır (ör. 1080p60 ≈ 7 Mbps × 3 izleyici ≈ 21 Mbps).
- İzlerken sağ üstte gelen çözünürlük, FPS, Mbps ve kodek görünür. Tam ekran için **F** tuşuna bas ya da videoya çift tıkla.
- Ayarlar'dan kodek seçilebilir: H.264 (donanım, varsayılan), VP9 veya AV1.
- **macOS:** İlk paylaşımda *Sistem Ayarları → Gizlilik ve Güvenlik → Ekran Kaydı* bölümünden Kanki'ye izin ver ve uygulamayı yeniden başlat.

## Sohbet ve kişiler
- **Yazı kanalları:** Kenar çubuğunun üstündeki `#` kanallar sese katılmadan herkesin okuyup yazabildiği kanallardır. Mesajlar ve resimler diske kaydedilmez; sunucu kapanınca silinir. Açık olmayan kanaldaki yeni mesajlar kanal adının yanında sayı olarak görünür (senden bahsedilirse kırmızı). Ses kanallarının kendi sohbeti de duruyor: bulunduğun ses kanalının adına tıklayınca açılır. Yönetici `+` ile yazı kanalı açar, sağ tıkla yeniden adlandırır ya da siler.
- **Durum:** Sol alttaki adına tıklayıp Çevrimiçi / Boşta / Rahatsız Etmeyin seçilir; 10 dakika hareketsiz kalınca otomatik Boşta olur. Rahatsız Etmeyin'de mesaj sesleri, bildirimler ve dürtme titreşimi kapalıdır.
- **Profil kartı:** Bir kişiye tıklayınca durumu, kişiye özel ses seviyesi ve Dürt / Sustur / Yayını izle düğmeleri açılır. Sağ tık menüsü de duruyor.
- **Sunucu menüsü:** Sol üstte sunucu adına tıklayınca davet adresini kopyala, sunucu yönetimi (yönetici), kanal oluştur, ayarlar ve bağlantıyı kes.
- **Üye listesi:** Sohbet panelinin sağ üstündeki kişiler simgesi tüm sunucudakileri kanal kanal gösterir.
- **Mesajlar:** `**kalın**`, `*italik*`, `~~üstü çizili~~`, `` `kod` `` ve ```` ```kod bloğu``` ```` desteklenir. `@isim` ile bahsedilen kişide mesaj sarı vurgulanır ve ses çalar (`@herkes` kanaldaki herkese). "X yazıyor…" göstergesi, emoji seçici, gün ayraçları ve yukarı kaydırınca "Yeni mesajlar ↓" düğmesi vardır.
- **Tepki, yanıt, düzenleme, silme:** Mesajın üzerine gelince sağ üstte araç çubuğu çıkar (sağ tık menüsü de var). Tepkiler mesajın altında sayılarıyla görünür. Yanıtta asıl mesaj alıntılanır, tıklayınca ona gider. Kendi mesajını düzenleyip silebilirsin (boş kutuda `↑` son mesajını düzenler); yönetici herkesin mesajını silebilir.
- **Resim gönderme:** Resmi mesaj kutusuna yapıştır, sohbet paneline sürükle-bırak ya da `+` düğmesiyle seç. Gönderilmeden önce küçültülür (en uzun kenar 1920 px). Sunucu her kanalda son 30 resmi saklar. Resme tıklayınca büyür, oradan kaydedilebilir.
- **Profil:** Ayarlar › Profilim'den profil fotoğrafı ve durum yazısı (ör. "🎮 Oyun oynuyor") eklenir. Fotoğraf her yerde baş harfin yerine görünür.
- **Sohbeti gizle:** Sahnenin sağ üstündeki sohbet düğmesi sağ paneli kapatır, yayınlara daha çok yer kalır; gizliyken gelen mesaj sayısı düğmede görünür.
- Mesaj kutusu çok satırlıdır: `Enter` gönderir, `Shift+Enter` yeni satır açar.

## Müzik botu
- Sunucuyu kuran kişinin **Kanki Admin** uygulamasında kendiliğinden çalışır ve kanal listesinde "Müzik Botu" olarak görünür.
- Sohbete yaz: `!çal <YouTube linki ya da şarkı adı>` (oynatma listesi linki en fazla 50 şarkı ekler), `!geç`, `!duraklat`, `!devam`, `!dur` (kuyruğu da temizler), `!kuyruk`, `!çıkar <sıra>`, `!temizle`, `!karıştır`, `!tekrar`, `!ses <0-100>`, `!şimdi`, `!gel`, `!ayrıl`, `!yardım`.
- Aynı işler sahnenin sağ üstündeki nota düğmesinden ve çalan şarkı çubuğundan da yapılır. Kişiye özel bot sesi: botun profil kartındaki ses sürgüsü.
- Kanalda 1 dakika kimse kalmazsa bot durur ve kanaldan ayrılır.
- Bir YouTube şarkısının başlaması 10–15 saniye sürebilir: bağlantı çözülür ve YouTube bazı videolarda akışı reklam süresi kadar (birkaç saniye) bekletir. Kuyruktaki sıradaki şarkı önceden hazırlandığı için geçişler genelde beklemesizdir. Canlı yayınlar çalınamaz.
- YouTube için [yt-dlp](https://github.com/yt-dlp/yt-dlp) kullanılır: ilk kullanımda resmi GitHub sürümünden Kanki Admin'in veri klasörüne indirilir ve haftada bir kendini günceller. Doğrudan ses dosyası ve radyo bağlantıları buna gerek duymaz.

## Yazı stili
- Ayarlar › Yazı stili: adın için yazı tipi (12 seçenek), efekt (düz, gradyan, neon, parıltı, gökkuşağı, nabız, ateş) ve iki renk. Önizleme anında güncellenir.
- "Mesajlarımda da kullan" açılırsa mesaj metnin de aynı yazı tipi ve renkle görünür (efektsiz, okunaklı kalsın diye).
- Yazı tipleri uygulamanın içinde gelir (SIL Open Font License), internet gerekmez.

## Uzaktan kontrol
- İzlediğin **tüm ekran** yayınının üst çubuğundaki fare simgesiyle kontrol iste. Yayıncıya onay penceresi çıkar; 30 saniye içinde yanıt vermezse istek reddedilir.
- İzin verilince görüntüye tıkla: fare (tıklama, sürükleme, tekerlek) ve klavye karşı tarafa gider. Kanki kısayolları da karşıya gider; bitirince yayının altındaki **Bırak** düğmesine bas ya da görüntünün dışına tıkla (klavye sende kalır).
- Kontrol edilen kişinin ekranının üstünde her zaman görünen bir çubuk çıkar: kimin kontrol ettiği ve **Durdur** düğmesi. `Ctrl+Shift+X` (Mac'te `⌘⇧X`) de anında durdurur.
- Olaylar doğrudan (P2P) gider. Tuşlar fiziksel konumuyla gönderilir, yani karşı bilgisayarın klavye düzeni geçerlidir.
- Sınırlar: pencere paylaşımında çalışmaz. Windows'ta yönetici olarak çalışan pencerelere (ör. Görev Yöneticisi, bazı oyunlar, UAC soruları) Kanki yönetici olarak açılmadıkça dokunulamaz. macOS'ta yayıncının Kanki'ye *Erişilebilirlik* izni vermesi gerekir.

## Kamera
- Ses panelindeki **Kamera** düğmesi ya da sahnenin altındaki kamera düğmesiyle açılır. Kameralar herkeste kendiliğinden görünür, kişinin kutusunda (kendi görüntün ayna gibi).
- Yayın izlerken kanaldakiler sahnenin altında küçük kutular halinde (kameralarıyla) durur.
- Kamera seçimi ve önizleme: Ayarlar › Ses ve görüntü. macOS'ta ilk açılışta kamera izni istenir.
- Kamera 720p / 30 FPS, kişi başı yaklaşık 1,5 Mbps yükleme kullanır.

## Ses
- Konuşma modları: sesle etkinleştirme (eşik ayarlanabilir), bas-konuş, sürekli açık.
- Bas-konuş tuşu **global** çalışır, yani oyun içindeyken de algılanır. macOS'ta bunun için *Erişilebilirlik* izni gerekir.
- Gürültü bastırma, yankı engelleme ve otomatik kazanç açılıp kapatılabilir. Giriş ve çıkış cihazı seçilebilir.
- Bir kullanıcıya sağ tıklayarak: kişiye özel ses seviyesi, yerel susturma, dürtme, yayınını izleme.
- Kısayollar: `Ctrl/Cmd+Shift+M` mikrofonu, `Ctrl/Cmd+Shift+D` hoparlörü açar/kapatır.
- Sahnenin altındaki düğmeler (Discord'daki gibi): kamera, ekran paylaş, mikrofon, ses, bağlantıyı kes.
- Kanala katılmak için kanal adına bir kez tıklamak yeterli.
- Tüm kısayollar: Ayarlar › Kısayollar.

## Geliştirme
```bash
npm install
npm start               # Kanki Admin olarak aç
npm run start:client    # arkadaş sürümü olarak aç
npm run server          # sadece sunucu
npm run dist            # 4 paketin hepsi (Mac + Windows, Kanki + Kanki Admin)
npm run dist:client:mac # tek tek de üretilebilir: dist:client:win, dist:admin:mac, dist:admin:win
```
- Sürüm ayarları `electron-builder.client.json` ve `electron-builder.admin.json` dosyalarında.
- Arkadaş sürümünde sunucu adresinin hazır yazılı gelmesini istersen `electron-builder.client.json` içindeki `kankiDefaultServer` alanına adresi yaz (ör. `bizim-kanki.ngrok-free.app`) ve yeniden derle.
- `.github/workflows/build.yml` GitHub Actions üzerinde iki sürümü iki platform için de paketler.

## Mimari
- `server/server.js` — WebSocket sinyal sunucusu. Kanalları, kullanıcı durumunu, sohbeti ve yönetici yetkilerini yönetir. Kanki Admin'in içine gömülüdür, ayrıca tek başına da çalışır.
- `src/main/` — Electron ana süreci: sürüm (admin/client) ayrımı, ekran kaynağı seçimi, sistem sesi yakalama, izinler, global bas-konuş tuşu, ngrok tüneli.
- `src/renderer/` — Arayüz ve WebRTC. Kanaldaki her kişiyle mesh P2P bağlantı kurulur (perfect negotiation). Ekran görüntüsü sadece izleyicilere ayrı bir iz olarak eklenir.

Yetkiler sunucu tarafında denetlenir: arkadaş sürümünü değiştiren biri bile yönetici anahtarı olmadan kanal silemez ya da kimseyi atamaz.

Mesh mimari 2–6 kişilik gruplar için idealdir. Daha kalabalık yayınlar için bir SFU (ör. LiveKit) eklenebilir.
