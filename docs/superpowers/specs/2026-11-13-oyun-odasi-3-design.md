# Oyun odası 3. parça + çarpışma (kısa tasarım)

**Amaç:** Kullanıcı odayla etkileşsin (kendi karakterini yönlendirsin, el sallasın, dans etsin, odada ping atsın); karakterler ve robot süpürge birbirinin içinden geçmesin. Herkes yine aynı sahneyi görsün.

**Yaklaşımlar:**
- Yönlendirme: (seçilen) sunucu, komuta kendi saatini (`at`) ekler; son "git" komutu kişinin durumunda (`u.room`) tutulur, her istemci hareketi `at`'tan itibaren aynı hesapla çizer. (elenen) Konumu sürekli yayınlamak: ngrok trafiği artar, gerek yok.
- Çarpışma: (seçilen) her karede, aynı t anındaki hesaplanmış yerlerden durumsuz itme (herkeste aynı sonuç, ağ yok). (elenen) Yer ayırmalı yol planlama: karmaşık, bu oda için gereksiz.

**Davranış:**
- Yere sol tık → kendi karakteri oraya yürür; eşyanın yanına tık (≤1,3 birim) → oraya oturur/oynar (dolu ise aynı türde boş yer, yoksa yanına yürür). Karaktere tık: bugünkü gibi takip + profil.
- Elle hedef yalnızca durum "serbest"ken geçerli (boşta/oyunda otomatik kazanır); `at`'tan 3 dk sonraki ilk 12 sn'lik dilimde otomatiğe döner; "🤖 Otomatik" düğmesi hemen döndürür.
- 👋 / 💃 düğmeleri: 4 sn el sallama / dans, herkeste aynı anda (yalnız yayın, saklanmaz).
- Yere sağ tık → ping halkası + isim, ping renginde, 4 sn (yalnız yayın).
- Sunucu: `t:'room'` (`go` / `auto` / `emote` / `ping`), kişi başı 250 ms sınırı, noktalar oda sınırına kırpılır; `go`/`auto` durumda `room` alanını değiştirir, diğerleri kanala yayınlanır. Eski istemciler bunu yok sayar.
- Çarpışma: yürüyen karakterler 0,8 birimden yakınsa birbirinden itilir (oturan/oynayan sabit); itme eşyanın içine sokuyorsa uygulanmaz. Süpürge karakterlere 0,75 birimden yaklaşırsa kenara kayar.

**Kapsam dışı:** klavyeyle yürütme, yeni animasyon dosyaları, kıyafet/tema (4. parça).
