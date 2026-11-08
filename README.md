# Kanki — Sesli sohbet + ekran paylaşımı (macOS & Windows)

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
| macOS Apple Silicon (M1–M4) | `Kanki-1.0.0-arm64.dmg` |
| macOS Intel | `Kanki-1.0.0-x64.dmg` |
| Windows (kurulum) | `Kanki-Setup-1.0.0.exe` |
| Windows (kurulumsuz) | `Kanki-Portable-1.0.0.exe` |

**Senin için — `dist/admin/`**

| Platform | Dosya |
|---|---|
| macOS Apple Silicon (M1–M4) | `Kanki-Admin-1.0.0-arm64.dmg` |
| macOS Intel | `Kanki-Admin-1.0.0-x64.dmg` |
| Windows (kurulum) | `Kanki-Admin-Setup-1.0.0.exe` |
| Windows (kurulumsuz) | `Kanki-Admin-Portable-1.0.0.exe` |

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

## Ekran paylaşımı
- Ekran veya tek pencere seçilebilir. Çözünürlük 720p'den 4K'ya, kare hızı 15/30/60 FPS arasında seçilebilir. Öncelik olarak **Akıcılık** (oyun) ya da **Netlik** (yazı/kod) seçilebilir. Bit hızı otomatik veya elle ayarlanır.
- **Sistem sesi:** Windows'ta doğrudan çalışır. macOS'ta 14.2 ve üstü gerekir; desteklenmiyorsa yayın sadece görüntüyle başlar.
- Görüntü **sadece izlemeyi seçenlere** gönderilir. Yayıncının gereken yükleme hızı yaklaşık *bit hızı × izleyici sayısı* kadardır (ör. 1080p60 ≈ 7 Mbps × 3 izleyici ≈ 21 Mbps).
- İzlerken sağ üstte gelen çözünürlük, FPS, Mbps ve kodek görünür. Tam ekran için **F** tuşuna bas ya da videoya çift tıkla.
- Ayarlar'dan kodek seçilebilir: H.264 (donanım, varsayılan), VP9 veya AV1.
- **macOS:** İlk paylaşımda *Sistem Ayarları → Gizlilik ve Güvenlik → Ekran Kaydı* bölümünden Kanki'ye izin ver ve uygulamayı yeniden başlat.

## Ses
- Konuşma modları: sesle etkinleştirme (eşik ayarlanabilir), bas-konuş, sürekli açık.
- Bas-konuş tuşu **global** çalışır, yani oyun içindeyken de algılanır. macOS'ta bunun için *Erişilebilirlik* izni gerekir.
- Gürültü bastırma, yankı engelleme ve otomatik kazanç açılıp kapatılabilir. Giriş ve çıkış cihazı seçilebilir.
- Bir kullanıcıya sağ tıklayarak: kişiye özel ses seviyesi, yerel susturma, dürtme, yayınını izleme.
- Kısayollar: `Ctrl/Cmd+Shift+M` mikrofonu, `Ctrl/Cmd+Shift+D` hoparlörü açar/kapatır.

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
