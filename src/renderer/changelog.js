'use strict';
/* Sürüm notları — "Yenilikler" penceresi ve Ayarlar › Hakkında › Sürüm notları buradan okur.
 * Yeni sürüm çıkarırken en üste bir kayıt ekle. Türler:
 *   added   = yeni özellik      fixed   = hata düzeltmesi
 *   changed = değişen davranış  removed = kaldırılan şey
 */
const CHANGELOG = [
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
