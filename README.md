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

## Giriş ve sunucu listesi
- İlk açılışta sadece **kullanıcı adı** sorulur (şifre yok); ad bu bilgisayarda hatırlanır, Ayarlar › Profilim'den değiştirilir.
- **Sol çubuk** (Discord gibi): en üstte ana sayfa, altında eklenen sunucular. Simgedeki sayı içeride kaç kişi olduğunu, gri nokta sunucuya ulaşılamadığını gösterir. Tıklayınca o sunucunun içi açılır ama sese girilmez; ses kanalına tıklayınca girilir (aynı anda tek sunucudasın). Bağlantı koparsa yeniden bağlanırken önceki kanala dönülür. Sağ tık: adresi kopyala, şifreyi değiştir, listeden kaldır.
- **Ana sayfa:** sunucu kartları (çevrimiçi sayısı, kimler içeride, canlı yayın) ve "Sunucu ekle" (adres ya da davet bağlantısı yapıştırılır). Kart bilgisi sunucunun `/info` adresinden gelir (şifreli sunucuda isimler gösterilmez); 30 saniyede bir yenilenir; sunucudan çıkınca kart hemen (2 ve 6 sn sonra tekrar) yenilenir ve sen listeden düşersin.
- **Kanki Admin:** kendi sunucun listede "Senin sunucun" olarak durur, "Başlat ve gir" ile açılır. Port, şifre, ngrok ayarları çubuktaki sunucu düğmesinde.
- **Sol alttaki kart** (Discord gibi): seste iken üstte ses bağlantısı (kanal adı, bağlantıyı kes, kamera, ekran, ses efektleri, birlikte izle), altta profil. Telefon düğmesi sunucudan çıkarır ve ana sayfaya döner; ses kartı sadece bir ses kanalındayken görünür.
- **Sunucu resmi:** Sunucu Ayarları › Genel Bakış › Sunucu resmi (Sunucuyu yönet yetkisi). Resim kare kırpılıp 256 px'e küçültülür; sol çubukta, ana sayfa kartında ve kanal listesinin üstündeki logoda görünür. Sunucu mesajlarla sadece sürüm numarasını yollar, resim `/icon` adresinden bir kez indirilip saklanır (ngrok kotası harcamaz).
- **Gecikme simgesi:** üzerine gelince kişilerle aradaki ses gecikmesi (WebRTC, doğrudan bağlantı) ve sunucu gecikmesi ayrı ayrı görünür. Ses ve görüntü ngrok'tan geçmez; sunucu gecikmesi yüksekse bu sadece mesaj ve kanal işlemlerini yavaşlatır.
- Tarayıcıdan girenlerde çubuk yoktur: ad girilir ve doğrudan o sunucuya bağlanılır.

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
- **Flash (CS gibi):** "Flash at" yetkisi olan kişi birine sağ tıklayıp 💥 Flash at der. Karşı tarafın bütün monitörlerinde en üstte, tıklanamaz beyaz bir pencere açılır ve ~3 saniyede kaybolur; patlama ve çınlama sesi WebAudio ile üretilir (Ses efekti ses düzeyiyle, sağırken çalmaz). Kanki küçültülmüşken, masaüstünde, tarayıcıda ve pencereli/kenarlıksız tam ekran oyunda görünür; "exclusive fullscreen" oyunlarda Windows izin vermediği için sadece ses duyulur. Tarayıcıdan girenlerde sadece sayfa beyazlar. Yetki varsayılan olarak sadece sunucu sahibinde. Ne sıklıkta atılabileceği Sunucu Ayarları › Genel Bakış › 💥 Flash'tan saniye olarak ayarlanır (başta 30 sn, 0 = sınırsız, sahip dahil herkese); bekleme sürerken menüde kalan süre yazar.
- **Profil kartı:** Bir kişiye tıklayınca durumu, kişiye özel ses seviyesi ve Dürt / Sustur / Yayını izle düğmeleri açılır. Sağ tık menüsü de duruyor.
- **Sunucu menüsü:** Sol üstte sunucu adına tıklayınca davet adresini kopyala, Sunucu ayarları (yetkisi olana), kanal oluştur, ayarlar ve bağlantıyı kes.
- **Üye listesi:** Sohbet panelinin sağ üstündeki kişiler simgesi tüm sunucudakileri gösterir: en üstte sunucu sahibi, sonra "ayrı göster" rolleri, sonra kanal kanal herkes.
- **Mesajlar:** `**kalın**`, `*italik*`, `~~üstü çizili~~`, `` `kod` `` ve ```` ```kod bloğu``` ```` desteklenir. `@isim` ile bahsedilen kişide mesaj sarı vurgulanır ve ses çalar (`@herkes` kanaldaki herkese). "X yazıyor…" göstergesi, emoji seçici, gün ayraçları ve yukarı kaydırınca "Yeni mesajlar ↓" düğmesi vardır.
- **Tepki, yanıt, düzenleme, silme:** Mesajın üzerine gelince sağ üstte araç çubuğu çıkar (sağ tık menüsü de var). Tepkiler mesajın altında sayılarıyla görünür. Yanıtta asıl mesaj alıntılanır, tıklayınca ona gider. Kendi mesajını düzenleyip silebilirsin (boş kutuda `↑` son mesajını düzenler); "Mesajları yönet" yetkisi olan herkesin mesajını silebilir.
- **Resim gönderme:** Resmi mesaj kutusuna yapıştır, sohbet paneline sürükle-bırak ya da `+` düğmesiyle seç. Gönderilmeden önce küçültülür (en uzun kenar 1920 px). Sunucu her kanalda son 30 resmi saklar. Resme tıklayınca büyür, oradan kaydedilebilir.
- **Profil:** Ayarlar › Profilim'den profil fotoğrafı ve durum yazısı (ör. "🎮 Oyun oynuyor") eklenir. Fotoğraf her yerde baş harfin yerine görünür.
- **Sohbeti gizle:** Sahnenin sağ üstündeki sohbet düğmesi sağ paneli kapatır, yayınlara daha çok yer kalır; gizliyken gelen mesaj sayısı düğmede görünür.
- Mesaj kutusu çok satırlıdır: `Enter` gönderir, `Shift+Enter` yeni satır açar.

## Müzik botu
- Sunucuyu kuran kişinin **Kanki Admin** uygulamasında kendiliğinden çalışır ve kanal listesinde "Müzik Botu" olarak görünür.
- Sohbete yaz: `!çal <YouTube linki ya da şarkı adı>` (oynatma listesi linki en fazla 50 şarkı ekler), `!geç`, `!duraklat`, `!devam`, `!sar <1:30 | +10 | -10>`, `!radyo <isim>`, `!dur` (kuyruğu da temizler), `!kuyruk`, `!çıkar <sıra>`, `!temizle`, `!karıştır`, `!tekrar`, `!ses <0-100>`, `!şimdi`, `!gel`, `!ayrıl`, `!yardım`.
- **Radyolar:** müzik panelindeki "📻 Radyolar" sekmesinde Türkiye ve dünyanın en çok dinlenen radyoları ve arama var (liste [radio-browser.info](https://www.radio-browser.info)'dan gelir); tıklayınca bot çalar. Sohbetten `!radyo <isim>`. Radyo çalarken eklenen şarkı radyonun yerine hemen başlar; radyoda ileri/geri sarılmaz.
- Aynı işler sahnenin sağ üstündeki nota düğmesinden ve çalan şarkı çubuğundan da yapılır; çubuğa tıklayıp sürükleyerek şarkı ileri/geri sarılır. Kişiye özel bot sesi: botun profil kartındaki ses sürgüsü.
- Kanalda 1 dakika kimse kalmazsa bot durur ve kanaldan ayrılır.
- Bir YouTube şarkısının başlaması 10–15 saniye sürebilir: bağlantı çözülür ve YouTube bazı videolarda akışı reklam süresi kadar (birkaç saniye) bekletir. Kuyruktaki sıradaki şarkı önceden hazırlandığı için geçişler genelde beklemesizdir. Canlı yayınlar çalınamaz.
- YouTube için [yt-dlp](https://github.com/yt-dlp/yt-dlp) kullanılır: ilk kullanımda resmi GitHub sürümünden Kanki Admin'in veri klasörüne indirilir ve haftada bir kendini günceller. Doğrudan ses dosyası ve radyo bağlantıları buna gerek duymaz.

## Ses efektleri
- Sahnenin altındaki ses efektleri düğmesi (ekran paylaş düğmesinin yanında) paneli açar. Bir sese basınca ses kanalındaki herkeste çalar; çalanın kutusunda ve kenar çubuğunda isminin yanında sesin emojisi kısa süre görünür.
- 16 hazır ses: alkış, ba-dum-tss, davul, tada, korna, "olmadı" (üzgün trombon), doğru, yanlış, zil, cırcır böceği, dramatik, boing, lazer, kalp atışı, parti düdüğü, sansür bip. Sesler uygulamanın içinde üretilir (ses dosyası yok); sunucu sadece hangi sesin çalındığını iletir.
- Herkes kendi duyduğu efekt sesini panelin altındaki sürgüyle ayarlar (0 = kapalı). Hoparlörü kapalı olan ya da çalanı yerel olarak susturan duymaz; kişiye verdiğin ses seviyesi efektlerine de uygulanır.
- Sağ tık: sesi kanala göndermeden sadece kendin dinle.
- Spam koruması: kişi başı 1,2 saniyede bir ses. Aynı kişinin yeni sesi öncekini keser.
- Sunucu tarafında destek gerekir: Kanki Admin 1.0.18 ve üstü. Eski sunucularda panel uyarı gösterir ve sesler sadece sende çalar.

## Sohbet araçları
- **Dosya gönderme:** mesaj kutusundaki + düğmesi ya da sürükle-bırak. Resim değilse dosya olarak gider (en fazla 50 MB). Dosyalar sunucunun belleğinde durur (en fazla 400 MB, 12 saat), sunucu kapanınca silinir; diske yazılmaz.
- **Bağlantı önizlemesi:** mesajdaki ilk bağlantının başlığı, açıklaması ve resmi sunucu tarafından alınır. Yerel ağ adreslerine (192.168.x.x, 127.0.0.1…) istek atılmaz.
- **GIF:** mesaj kutusundaki GIF düğmesi. Yönetici, Sunucu Ayarları › Genel Bakış'a bir [KLIPY](https://klipy.com) (ücretsiz) ya da GIPHY anahtarı girer; arkadaşlar anahtarsız arar. (Google'ın Tenor servisi 2026'da kapandı.)
- **Anket, çark, takım kur:** + düğmesinden. Çarkın sonucunu sunucu seçer; takım kur, ses kanalındakileri rastgele böler.
- **Sabitlenmiş mesajlar:** mesaja sağ tık › Sabitle (yazan ya da Mesajları yönet yetkisi olan). Sohbet başlığındaki iğne düğmesi listeyi açar.
- **Arama:** büyüteç ya da `Ctrl/Cmd+F`. `from:isim`, `has:resim`, `has:dosya`, `has:link`, `has:gif`, `has:anket`.
- **Geçmiş sekmesi:** sağ paneldeki saat simgesi. Giriş-çıkış, dürtme, ses efekti, oylama ve birlikte izle olayları saatleriyle (sadece sende, bu oturumda).

## Birlikte izle ve yayına işaret
- Sahnenin altındaki film düğmesi: YouTube bağlantısı ya da bilgisayarındaki video dosyası. Video senin bilgisayarında oynar ve kanala yayın olarak gider; izleyenler yayının altındaki çubuktan herkes için durdurup sarabilir.
- YouTube için yt-dlp kullanılır (ilk kullanımda indirilir). Kalite: Otomatik (1080p'ye kadar, önerilen), 720p ya da 480p (yavaş internet); seçim hatırlanır.
- Videoyu başlatan kişi de videoyu sahnede büyük kutuda görür (alttaki çubuktan "Sahneden gizle / Sahnede göster").
- İzlediğin yayının üst çubuğundaki kalemle (ya da Alt + tık) yayına nokta koy ya da çiz; işaret herkeste ve tüm ekran paylaşılıyorsa yayıncının ekranında 3 saniye görünür.

## Tarayıcıdan ve telefondan katılma
Sunucu Ayarları › Bağlantı'dan "Tarayıcıdan ve telefondan katılma" açılınca (başta kapalı) Kanki Admin'in internet adresi (ngrok, ör. `https://isim.ngrok-free.dev`) tarayıcıda Kanki'nin web halini açar; kurulum gerekmez. Her sayfa açılışı yaklaşık 0,7 MB ngrok kotası harcar. ngrok ilk açılışta bir uyarı sayfası gösterir, "Visit Site"a basılır.
- Telefonda tek panel ve alt sekmeler (Kanallar / Sahne / Sohbet). Paylaş › Ana ekrana ekle ile uygulama gibi açılır.
- Çalışanlar: ses, yazışma, dosya, GIF, anket/çark, ses efektleri, müzik botu, yayın izleme. Bilgisayar tarayıcısından ekran paylaşımı da olur.
- Olmayanlar: telefonda ekran paylaşımı, oyun/Spotify gösterimi, oyun içi katman, genel kısayollar, YouTube ile birlikte izle başlatma.
- Mobil veride ses bağlanmazsa: Sunucu Ayarları › Bağlantı'ya bir TURN sunucusu (ör. metered.ca ücretsiz hesap) yazılır.
- Sunucu sadece `src/renderer` içindeki arayüz dosyalarını verir (klasör dışına çıkılamaz); tarayıcı katmanı `web-shim.js` ve `web.css`.

## Görünüm ve temalar
Ayarlar › Görünüm: 9 tema (Sade — efektsiz ve en hafif, Kanki, Zifiri, Gece Mavisi, Neon, Gün Batımı, Okyanus, Şampiyon, Gündüz), vurgu rengi, bilgisayarın açık/koyu temasına uyma, cam efekti, arka plan ışıkları, konuşurken parlama, hareketleri azaltma, yüzen/bitişik paneller, yoğunluk ve sohbet yazı boyutu. Bu ayarlar sadece o bilgisayarda geçerli. Uygulamanın ne kadar bellek kullandığı Ayarlar › Hakkında'da görünür; en az bellek için Sade tema. Tema dosyaları: `src/renderer/themes.css` (renkler ve görünüm), `theme-boot.js` (ilk boyamadan önce temayı uygular), `appearance.js` (Görünüm sayfası).

## Yönetim (Sunucu Ayarları)
Kalkan düğmesi ya da sunucu menüsü › Sunucu ayarları. Sekmeler: Genel Bakış, Roller, Üyeler, Kanallar, Yasaklılar, Denetim Kaydı, Bağlantı. Her sekme sadece ilgili yetkisi olana görünür.
- **Roller:** Discord'daki gibi. Rolün adı, rengi, "üyeleri ayrı göster" ayarı ve 24 yetkisi var (Yönetici, sunucuyu/rolleri/kanalları yönet, denetim kaydı, at, yasakla, zaman aşımı, sustur, sağırlaştır, taşı, mesajları yönet, @herkes, mesaj, dosya, GIF, anket, oylama, süslü mesaj yazısı, ses efekti, ekran paylaşımı, kamera, birlikte izle). Rolleri sürükleyerek sırala; üstteki rol alttakileri yönetir, kimse kendi rolüne eşit ya da üstteki birine işlem yapamaz. Sunucu sahibi (yönetici anahtarıyla bağlanan) her şeyi yapar ve kimse ona işlem yapamaz.
- **@herkes:** herkesin varsayılan yetkileri (ör. GIF'i ya da ses efektlerini herkese kapatmak için).
- **Moderatör:** yeni sunucularda hazır gelen rol. Eski sürümdeki moderatörler otomatik bu rolü alır.
- **Moderasyon** (kişiye sağ tık): rol ver, taşı, sesten çıkar, sunucuda sustur/sağırlaştır, zaman aşımı (60 sn – 1 hafta; bu sürede yazamaz, konuşamaz, paylaşamaz), at, yasakla.
- **Kanallar:** şifre, kişi sınırı, yavaş mod, salt okunur, konu; herkesi başka kanala taşı, sohbeti temizle.
- **Başlık kanalı:** içine kimse giremez, altındaki ses kanallarını gruplar (ör. "Oyun Kanalları"). Kanal oluştururken tür olarak "Başlık" seçilir ya da kanal ayarlarından açılır.
- **AFK kanalında** mikrofon açılamaz.
- **Genel Bakış:** sunucu adı, açıklama, şifre, hoş geldin mesajı, duyuru bandı, AFK kanalı ve süresi, GIF anahtarı, bağlantı önizlemeleri.
- **Yasak:** cihaz ve (internetten bağlanıyorsa) IP adresi yasaklanır. Yasaklılar sekmesinden kaldırılır.
- **AFK:** hem hareketsiz hem sessiz kalan kişi kendiliğinden AFK kanalına geçer (varsayılan 15 dk, 0 = kapalı); yayın izleyen ya da açan taşınmaz.
- **Oylamayla susturma / AFK:** kişiye sağ tık. Kanaldakilerin %75'i (en az 2 kişi) evet derse 1 dakika susturulur ya da AFK'ya taşınır. Oylama cihaz başına sayılır.
- **Denetim kaydı:** kim, kime, ne yaptı; kişiye ve işleme göre süzülür (son 500 kayıt).
- Bu ayarlar (roller, üyelerin rolleri, yasaklar, AFK, GIF anahtarı, duyuru) Kanki Admin'in veri klasöründe `server-config.json` içinde saklanır; mesajlar saklanmaz.

## Durum, kısayollar, katman, davet
- **Oyun / Spotify:** bilinen bir oyunu açınca adının altında "🎮 … oynuyor", Spotify'da şarkı çalınca "🎵 Sanatçı - Şarkı" görünür; ikisi aynı anda da gösterilir. 4 saniyede bir bakılır (şarkı birkaç saniyede, oyun en geç ~15 saniyede görünür). Ayarlar › Profilim'den kapatılır. Mac'te Spotify için ilk seferde izin istenir.
- **Listede olmayan oyun:** Ayarlar › Profilim › "Listede olmayan oyunu ekle". Oyun açıkken çalışan programlardan seçilir ve görünecek ad yazılır (ör. Seafight artık listede).
- **Kendi kısayolların:** Ayarlar › Kısayollar › Kısayol ekle. Ses efekti, dürtme, AFK'ya geç / geri dön, mikrofon, ses, birlikte izle durdur/oynat. Oyundayken de çalışır.
- **Oyun içi katman:** Ayarlar › Oyun içi katman. Ekranın köşesinde konuşanlar; tam ekran (özel) moddaki oyunlarda görünmeyebilir. Konum, "sadece konuşanlar" ve görünürlük (saydamlık) ayarlanır; katman kapalıyken bu seçenekler pasiftir.
- **Davet bağlantısı:** sunucu menüsü › Davet bağlantısını kopyala. Bağlantı `kanki-app.github.io/join` sayfasını açar, o da Kanki'yi açıp sunucuya bağlar (kurulu değilse indirme düğmeleri çıkar).
- **Yapay zekâ gürültü engelleme (RNNoise):** Ayarlar › Ses ve görüntü › Ses işleme.

## Yazı stili
- Ayarlar › Yazı stili: adın için yazı tipi (12 seçenek), efekt (düz, gradyan, neon, parıltı, gökkuşağı, nabız, ateş) ve iki renk. Önizleme anında güncellenir.
- "Mesajlarımda da kullan" açılırsa mesaj metnin de aynı yazı tipi ve renkle görünür (efektsiz, okunaklı kalsın diye).
- Yazı tipleri uygulamanın içinde gelir (SIL Open Font License), internet gerekmez.
- "Mesajlarımda da bu yazı tipini ve rengi kullan" seçeneği herkeste kapalı başlar; sadece **Süslü mesaj yazısı** yetkisi olan roldekiler açabilir (yönetici Roller'den verir). Yetki alınınca seçenek kendiliğinden kapanır.

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
- Sahnenin altındaki düğmeler (Discord'daki gibi): kamera, ekran paylaş, ses efektleri, mikrofon, ses, bağlantıyı kes.
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
