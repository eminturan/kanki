'use strict';
/* Sürüm notları — "Yenilikler" penceresi ve Ayarlar › Hakkında › Sürüm notları buradan okur.
 * Yeni sürüm çıkarırken en üste bir kayıt ekle. Türler:
 *   added   = yeni özellik      fixed   = hata düzeltmesi
 *   changed = değişen davranış  removed = kaldırılan şey
 */
const CHANGELOG = [
  {
    version: '1.0.17',
    date: '2026-11-09',
    title: 'Yazı kanalı geçmişi kaydedilmiyor',
    changed: [
      'Yazı kanallarının mesajları ve resimleri artık diske kaydedilmiyor; ses kanalları gibi sunucu kapanınca silinir. Önceki sürümün kaydettiği geçmiş dosyası da silinir.',
    ],
  },
  {
    version: '1.0.16',
    date: '2026-11-09',
    title: 'Yazı kanalları',
    added: [
      'Yazı kanalları (# kanallar): sese katılmadan sunucudaki herkesin okuyup yazabildiği kanallar. Kenar çubuğunda ses kanallarının üstünde.',
      'Açık olmayan yazı kanalındaki yeni mesajlar kanal adının yanında sayı olarak görünür; senden bahsedilirse sayı kırmızı olur.',
      'Yazı kanallarının geçmişi sunucu kapanıp açılsa da kalır.',
      'Yönetici yeni yazı kanalı açabilir, yeniden adlandırabilir, silebilir. Sunucuya bir "genel" kanalı eklendi.',
    ],
    changed: ['Bulunduğun ses kanalının adına tekrar tıklayınca sağ panelde o ses kanalının sohbeti açılır.'],
  },
  {
    version: '1.0.15',
    date: '2026-11-09',
    title: 'Yayını düzenle',
    added: [
      'Yayın yaparken "Düzenle": paylaşılan ekranı ya da pencereyi yayını durdurmadan değiştir; izleyenler aynı pencerede kesintisiz izlemeye devam eder.',
      'Düzenle ile çözünürlük, kare hızı, öncelik ve bit hızı anında değişir; sistem sesi açılıp kapatılabilir.',
    ],
  },
  {
    version: '1.0.14',
    date: '2026-11-09',
    title: 'Müzik botu ve yazı stilleri',
    added: [
      'Müzik botu: sohbete `!çal <YouTube linki ya da şarkı adı>` yaz; bot kanala gelir ve şarkıyı herkese çalar. Kuyruk, geçme, duraklatma, ses ve tekrar komutları var (`!yardım`).',
      'Sahnede çalan şarkı çubuğu (kapak, ilerleme, duraklat/geç/durdur) ve şarkı eklenen, kuyruğun düzenlendiği müzik paneli.',
      'Doğrudan ses dosyası ve internet radyosu bağlantıları da çalınır.',
      'Kuyruktaki sıradaki şarkı önceden hazırlanır; şarkı yüklenirken çubukta "yükleniyor…" yazar.',
      'Ayarlar › Yazı stili: adın için 12 yazı tipi, 7 efekt (gradyan, neon, parıltı, gökkuşağı, nabız, ateş) ve renkler. İstersen mesajlarında da kullanılır.',
    ],
    changed: ['Müzik botu sunucuyu kuran kişinin Kanki Admin uygulamasında çalışır; bota mikrofon sesi gönderilmez.'],
  },
  {
    version: '1.0.13',
    date: '2026-11-08',
    title: 'Uzaktan kontrol',
    added: [
      'Uzaktan kontrol: izlediğin ekran yayınında fare simgesine basıp kontrol iste. Yayıncı izin verirse onun fare ve klavyesini kullanırsın (TeamViewer/AnyDesk gibi).',
      'Ekranı kontrol edilen kişinin ekranında her zaman üstte duran "X kontrol ediyor · Durdur" çubuğu; Ctrl+Shift+X (Mac’te ⌘⇧X) ile de anında durdurulur.',
      'Kontrol isteği 30 saniye içinde yanıtlanmazsa kendiliğinden reddedilir. Kontrol bitince basılı kalan tuşlar ve fare düğmeleri bırakılır.',
    ],
    changed: ['Kişi menüsünde her kanal için ayrı "Taşı" satırı yerine tek bir "Kanala taşı ›" alt menüsü var.'],
  },
  {
    version: '1.0.12',
    date: '2026-11-08',
    title: 'Windows düzeltmeleri',
    added: ['İzlediğin yayında hoparlör simgesine tıklayınca yayının sesi tamamen kapanır, tekrar tıklayınca açılır.'],
    fixed: [
      'Sağ üstteki güncelleme düğmesi üye sayısı düğmesinin üstüne biniyordu.',
      'Ayarlar › Ses ve görüntü bölümünde uzun kulaklık/mikrofon adları kutudan taşıyordu.',
      'Mesaj kutusundaki yazı iki satıra bölünüp aşağı kayıyordu.',
    ],
  },
  {
    version: '1.0.11',
    date: '2026-11-08',
    title: 'Yayında yankı düzeltmesi',
    fixed: [
      'Sistem sesiyle ekran paylaşılınca izleyenler kendi seslerini yayından geri duyuyordu. Artık Kanki’nin çaldığı sesler (arkadaş sesleri, izlenen yayınlar) yayına girmiyor.',
    ],
    changed: [
      'Yayın panelinde sistem sesinin "Kanki sesleri hariç" mi gittiği yazıyor. Bilgisayar bunu desteklemiyorsa eski yöntemle devam edip uyarıyor.',
    ],
  },
  {
    version: '1.0.10',
    date: '2026-11-08',
    title: 'Kamera, tepkiler ve resimler',
    added: [
      'Kamera: ses panelindeki "Kamera" düğmesiyle görüntünü aç. Kameralar herkeste kişinin kutusunda kendiliğinden görünür.',
      'Sahnenin altında Discord’daki gibi arama düğmeleri: kamera, ekran paylaş, mikrofon, ses, bağlantıyı kes.',
      'Yayın izlerken kanaldakiler sahnenin altında küçük kutular halinde (kameralarıyla) görünür.',
      'Mesajlara emoji ile tepki verme; tepkiler mesajın altında sayılarıyla görünür.',
      'Mesaj yanıtlama: asıl mesaj alıntılanır, tıklayınca ona gider. Sana yanıt gelince bahsedilmiş gibi bildirim alırsın.',
      'Kendi mesajını düzenleme ve silme; boş kutuda ↑ son mesajını düzenler. Yönetici herkesin mesajını silebilir.',
      'Mesaja sağ tıklayınca menü: tepki, yanıtla, düzenle, kopyala, sil.',
      'Sohbete resim gönderme: yapıştır, sürükle-bırak ya da + düğmesi. Resme tıklayınca büyür, kaydedilebilir.',
      'Profil fotoğrafı ve durum yazısı (Ayarlar › Profilim).',
      'Sohbeti gizle/göster düğmesi; gizliyken gelen mesaj sayısı görünür.',
      'Ayarlar › Kısayollar sayfası.',
      'Çok satırlı mesaj: Shift+Enter yeni satır açar.',
    ],
    changed: [
      'Kanala katılmak için kanal adına bir kez tıklamak yeterli.',
      'Ayarlar Profilim sayfasıyla açılıyor; "Ses ve mikrofon" bölümü artık "Ses ve görüntü" (kamera seçimi ve önizleme).',
      'Mesaj kutusunun solunda + (resim ekle) düğmesi var.',
    ],
    fixed: [
      'Kanalda 3 kişi varken kutular tek sütuna diziliyordu; artık 2+1 diziliyor.',
      'Profil kartında "İzlemeyi bırak" düğmesi iki satıra taşıyordu.',
      'Profil kartında "Çevrimiçi" yazısının yanındaki yeşil nokta görünmüyordu.',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-11-08',
    title: 'Discord tarzı özellikler',
    added: [
      'Durum seçimi: Çevrimiçi, Boşta, Rahatsız Etmeyin. Herkesin avatarında renkli durum noktası var.',
      'Bilgisayar 10 dakika kullanılmazsa durumun kendiliğinden "Boşta" olur.',
      'Rahatsız Etmeyin açıkken mesaj sesi, masaüstü bildirimi ve dürtme titreşimi susar.',
      'Profil kartı: bir kişiye tıklayınca durumu, ses seviyesi ve Dürt / Sustur / Yayını izle düğmeleri açılır.',
      'Sunucu menüsü: sunucu adına tıklayınca davet adresini kopyala, kanal oluştur, ayarlar ve bağlantıyı kes.',
      'Üye listesi: sohbetin sağ üstündeki kişiler simgesi sunucudaki herkesi kanal kanal gösterir.',
      '"X yazıyor…" göstergesi.',
      '@isim ile bahsetme: yazarken isim önerisi çıkar, bahsedilen kişide mesaj vurgulanır ve ses çalar. @herkes kanaldaki herkese gider.',
      'Mesaj biçimleri: **kalın**, *italik*, ~~üstü çizili~~, `kod` ve kod bloğu.',
      'Emoji seçici, gün ayraçları ve yukarı kaydırınca "Yeni mesajlar ↓" düğmesi.',
      'Ses bağlantısı kurulamazsa sol altta "Ses bağlanıyor…" uyarısı.',
      'Ayarlar › Hakkında: sürüm numarası, "Güncellemeleri kontrol et" ve sürüm notları.',
      'Güncellemeden sonra ilk açılışta bu "Yenilikler" penceresi.',
    ],
    changed: [
      'Ayarlar tam ekran açılıyor, solda kategoriler var.',
      'Konuşanların kutuları Discord’daki gibi: isim etiketi sol altta, konuşanın çerçevesi yeşil.',
      'Güncellemeler 4 saat yerine 30 dakikada bir kontrol ediliyor.',
    ],
    fixed: [
      'İki kişi aynı anda kanala girince aralarında ses bazen hiç bağlanmıyordu.',
      'Aynı ağdaki (aynı evdeki) arkadaşlar arasında bağlantı bazen kurulamıyordu.',
      'Mikrofon kapalıyken kulaklığı kapatıp açınca mikrofon kendiliğinden açılıyordu.',
      'Dürtme ve kanal adı soruları kanal listesinin yanında değil, ekranın ortasında açılıyor.',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-11-08',
    title: 'Yayın sesi ve ekran paylaş düğmesi',
    added: [
      'Yayın yaparken sistem sesinin gidip gitmediğini gösteren canlı ses ölçer.',
      'İzleyenlerde, sesi olmayan yayında "ses yok" etiketi.',
    ],
    changed: ['Ekran Paylaş düğmesi sol altta, "Ses bağlı" panelinin altında.'],
    fixed: ['Paylaşılan oyun/müzik sesi konuşma filtrelerinden geçip kırpılıyordu.'],
  },
  {
    version: '1.0.7',
    date: '2026-11-08',
    title: 'Yeni güncelleme düğmesi',
    added: [
      'Sağ üstte güncelleme düğmesi: indirme ilerlemesi görünür, hazır olunca tıkla-güncelle.',
      'Uygulama açılır açılmaz yeni sürüm bulunursa (henüz bağlanmadıysan) kendiliğinden kurulur.',
    ],
    removed: ['Sol alttaki güncelleme bildirimi (yerine sağ üstteki düğme geldi).'],
  },
  {
    version: '1.0.6',
    date: '2026-11-08',
    title: 'Siyah tema',
    changed: [
      'Yeni siyah/yeşil tasarım; kanal listesinde kişiler ağaç çizgileriyle bağlı.',
      'Yönetim düğmesi ve sunucu adresi kenar çubuğunun başına taşındı.',
      'Gecikme (ping), "Ses bağlı" yanındaki simgenin üzerine gelince görünüyor.',
    ],
    fixed: ['Windows’ta pencerede "Kanki" başlığı iki kez görünüyordu.'],
    removed: ['Kurulumsuz (portable) Windows sürümü.', 'Sağ üstteki ping göstergesi.'],
  },
  {
    version: '1.0.5',
    date: '2026-11-08',
    title: 'Sade tasarım',
    changed: [
      'Kenarlıksız, sade görünüm.',
      'Sol altta "Ses bağlı" paneli ve bağlantıyı kes düğmesi; altında mikrofon, kulaklık, ayarlar.',
      'Ses kanalları hoparlör simgeli.',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-11-08',
    title: 'Çoklu yayın',
    added: [
      'Aynı anda 3 ekran ya da pencereye kadar paylaşma.',
      'Aynı anda birden fazla yayın izleme.',
      'Yayın pencereleri sürüklenip boyutlandırılabiliyor; Izgara ile yeniden diziliyor.',
      'Yayını ayrı pencerede açıp başka monitöre taşıma.',
    ],
    fixed: ['Bağlantı kurulamazsa 12 saniye sonra kendiliğinden yeniden deneniyor.'],
  },
  {
    version: '1.0.3',
    date: '2026-11-08',
    title: 'Dürtme',
    added: ['Dürtülünce pencere titriyor ve titreşim sesi çalıyor.'],
  },
  {
    version: '1.0.2',
    date: '2026-11-08',
    title: 'Otomatik güncelleme',
    added: ['Kurulumlu Windows sürümü yeni sürümleri kendiliğinden indirip kuruyor.'],
  },
  {
    version: '1.0.1',
    date: '2026-11-08',
    title: 'Ayar açıklamaları',
    added: ['Her ayarın üzerine gelince ne işe yaradığını anlatan açıklama.'],
    fixed: ['Yayın yapan kişinin kartında "Yayını İzle" düğmesi ismin üzerine biniyordu.'],
  },
  {
    version: '1.0.0',
    date: '2026-11-08',
    title: 'İlk sürüm',
    added: [
      'Kanal tabanlı sesli sohbet, kanal sohbeti ve dürtme.',
      'Yüksek kaliteli ekran paylaşımı (4K, 60 FPS’e kadar, sistem sesiyle).',
      'Kanki Admin: sunucu kurma, ngrok ile internete açma ve yönetim paneli.',
    ],
  },
];
