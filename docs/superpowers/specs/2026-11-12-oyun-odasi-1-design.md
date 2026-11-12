# Oyun Odası — 1. parça (1.1.0) tasarımı

Tarih: 2026-11-12 · Sürüm: 1.1.0 · Önizleme: `gameroom-preview.html` (oturumdaki taslak)

## Amaç

Ses kanalının ortasındaki kişi kartlarının yerine, isteyen kişi için 3 boyutlu bir oyun odası göstermek. Kanaldaki herkes odada bir karakterdir; karakterin kafasında profil fotoğrafı vardır, konuşma / sessiz / boşta / oyunda durumları karakterde görünür, izlenen yayın duvardaki TV'de oynar.

Başarı ölçütü: oda açıkken her şey bugünkü kart görünümündeki kadar anlaşılır olur, ngrok trafiği artmaz, Kanki arka plandayken ekran kartını yormaz.

## Kullanıcının kararları

- Görünüm kişiye özel: herkes "Oyun odası / Klasik" arasında kendisi seçer. Varsayılan **Klasik**.
- Karakter rengi = adminin belirlediği **ping rengi** (`u.pingColor`, varsayılan beyaz). Yeni ayar, yeni sunucu alanı yok.
- Sürüm **1.1.0**. Sonraki parçalar 1.1.x.
- Bu parçada sunucu ve ağ değişikliği yok.

## Kapsam

### Var
1. **Görünüm düğmesi:** Sahne başlığında (`.stage-actions`) bir düğme: 🎮 Oyun odası ↔ ▦ Klasik. Seçim `settings.roomView` olarak saklanır.
2. **Oda:** Önizlemedeki oda: TV, koltuk, 3 oyun masası, atari, langırt, puflar, bitkiler; neon şeritler, "KANKİ" tabelası (arada titrer), kumanda tabelası, RGB LED, tavan ışık konileri, toz parçacıkları, parlak zemin, bloom, vinyet; kameraya bakan duvar gizlenir. Sürükle = döndür, tekerlek = yakınlaş.
3. **Karakterler:** Kanaldaki her kişi (bot hariç) bir karakter. Gövde rengi `u.pingColor`'dan türetilir (beyazsa açık gri tonu). Kafada kameraya dönük yüz diski: `S.avatars` içindeki profil fotoğrafı, yoksa baş harf + `colorFor(name)` renkli zemin. Diskin çerçevesi ve isim etiketi kişinin isim rengi (`u.color` / `nameStyle`). Kendi karakterinde "(sen)".
4. **Durumlar (mevcut veriden):**
   - Konuşma: `setSpeaking(id, on)` olayı → ayak halkası parlar, dalgalar yayılır.
   - `u.muted` / `u.deafened` → etiketteki ikonlar (kart görünümündeki ICON.micOff / ICON.headOff).
   - Boşta (`presenceOf(u) === 'idle'`) → pufa gider, başı düşer, "Z" yükselir.
   - Oyunda (`u.activity.game`) → boş bir oyun masasına oturur, etikette "🎮 Oyun adı".
   - Ekran paylaşıyor → etikette CANLI.
   - Diğerleri: rastgele dolaşır, koltuğa oturur, atari/langırt oynar (her bilgisayarda kendi rastgeleliği; herkesin aynı sahneyi görmesi 2. parça).
5. **TV:** Oda açıkken izlenen yayınlar sahnede pencere (tile) olarak açılmaz, TV'de oynar (`S.remoteScreens.get(key).video` → `VideoTexture`). Birden fazla izlenen yayın varsa TV'nin altında küçük seçici. TV'de "Büyüt" → oda geçici gizlenir, bugünkü pencere görünümü açılır (işaret, ping, yakınlaştırma, uzaktan kontrol orada çalışır); "Odaya dön" ile geri. Yayın yoksa TV'de Kanki logosu.
6. **Tıklama:** Karaktere sol tık = kamera takip eder (boşluğa tık = bırak) ve bugünkü profil kartı (`openProfile`) açılır. Sağ tık = bugünkü `userMenu`.
7. **Performans:**
   - En fazla 30 FPS; sahne boyutu değişmeden ve kimse hareket etmiyorsa da 30'da kalır (basit tutuldu).
   - Pencere gizli / küçültülmüş / odak dışı ve `document.hidden` iken çizim durur (`requestAnimationFrame` zaten durur; odak dışında 5 FPS'e iner).
   - `settings.perfMode` açıkken bloom, toz, gölge ve ışık konileri kapalı, piksel oranı 1.
   - WebGL açılamazsa ya da ilk 3 saniyede ortalama FPS 15'in altındaysa uyarı + Klasik görünüme dönülür.
8. **Kaynaklar:** Three.js r128 ve bloom eklentileri `src/renderer/vendor/three/` altına kopyalanır, `index.html`'den yüklenir (internetten değil). ~650 KB.

### Yok (sonraki parçalar)
- Herkeste aynı sahne / senkron gezinme (2. parça).
- Kendi karakterini bir yere gönderme, el sallama, dans, odada ping (3. parça).
- Kıyafet, oda teması, admin oda ayarı (4. parça).
- Müzik botu karakteri, kamera görüntüsünün karakterde gösterilmesi.
- Tarayıcıdan bağlananlar (web) için oda: düğme gizli.

## Yapı

- **`src/renderer/room.js` (yeni):** Odanın bütün kodu. Dışarıya küçük bir arayüz verir:
  - `roomMount(el)` / `roomUnmount()` — sahneyi kurar/söker (WebGL bağlamı serbest kalır).
  - `roomSync(members)` — `renderStage` her çağrıldığında: karakter ekle/çıkar, isim, renk, fotoğraf, durumları güncelle.
  - `roomSpeaking(id, on)` — `setSpeaking`'den çağrılır.
  - `roomTv(list)` — izlenen yayınların listesi (anahtar, etiket, `<video>`).
- **`app.js` değişiklikleri (küçük):** görünüm düğmesi; `renderStage` içinde `settings.roomView` açıkken `renderParticipants` yerine `roomSync`, tile'lar yerine `roomTv`; `setSpeaking` içinde `roomSpeaking`; "Büyüt / Odaya dön" durumu (`S.roomTiles`).
- **`styles.css`:** `#room` katmanı, isim etiketleri (HTML, 3D'nin üstünde), TV seçici, düğme.
- **`index.html`:** `<div id="room">`, vendor script'leri, `room.js`.
- `scripts/harden.js` vendor klasörünü zaten küçültmeden kopyalıyor; ek iş yok.

## Veri akışı

Sunucudan gelen `state` (değişmedi) → `S.users` → `renderStage` → `roomSync`. Konuşma `audio` analizörlerinden → `setSpeaking` → `roomSpeaking`. Yayın görüntüsü WebRTC'den (doğrudan, ngrok değil) → `roomTv`. Oda hiçbir şey göndermez.

## Hata durumları

- WebGL yok / bağlam kaybı (`webglcontextlost`) → oda sökülür, toast "3D açılamadı, klasik görünüme geçildi", `settings.roomView = false`.
- Fotoğraf yüklenemezse baş harfli disk.
- Yayın bitince TV logoya döner; "Büyüt" modundayken yayın biterse odaya dönülür.

## Test

İki istemcili test düzeneği (Emin + Deniz, `KANKI_AUTOTEST`), `KANKI_EXEC` ile:
- Oda açılır, her üyeye bir karakter düşer; biri çıkınca karakter silinir.
- `muted` / boşta / oyunda değişince etiket ve yer değişir.
- Konuşma olayı halkayı yakar.
- Canvas test yayını izlenince TV dokusu güncellenir; "Büyüt" tile görünümünü açar, "Odaya dön" kapatır.
- Klasik'e dönünce WebGL bağlamı serbest kalır (sızıntı yok), 10 kez aç/kapa sonrası bellek sabit.
- Ekran görüntüsü + FPS ve işlemci ölçümü (normal / performans modu) kullanıcıya raporlanır.

## Riskler

- Ekran kartı yükü: oyun oynarken arka planda açık kalırsa FPS düşebilir → odak dışında 5 FPS, performans modu, otomatik geri dönüş.
- Windows'ta denenmeyecek (Mac'te test edilir).
- Karakterlerin rastgele hareketi kişiden kişiye farklı görünür (2. parçada düzelir).
