# LGS Defter: özellik listesi ve regresyon testi

Kural: bir özellik geliştirilirken eskiler kaybolmaz. Bir şey ekrandan kalkacaksa başka bir yere taşınır ve
buradaki yeri güncellenir. Her değişiklikten sonra, yayınlamadan önce bu liste çalıştırılır.

Her maddenin yanında nasıl denendiği yazar:
**[O]** `node tools/regression.mjs` (otomatik), **[A]** `tools/ui-smoke.js` (arayüz duman testi),
**[E]** test hesabıyla elle.

## Nasıl çalıştırılır

1. `node tools/regression.mjs`. Uygulama dosyasının sözdizimi ve sürüm numarası, takvim ve günlük plan
   hesapları, veritabanı yetkileri (`supabase/test-*.sql`), aile dışından birinin hiçbir şey görmemesi,
   her öğrencinin bugünkü durumu. Yetki testleri kullanıcıların yerine geçip dener; hepsi geri alınır,
   veritabanında iz kalmaz. Her testin beklenen sonucu dosyasındaki `-- beklenen:` satırındadır.
2. Yerel önizlemede (`localhost:5500`) test hesabıyla giriş yapılır; `tools/ui-smoke.js` içeriği sayfada
   çalıştırılır. Dört kez çalıştırılır:
   - öğrenci IrfTest (8. sınıf);
   - ilkokul öğrencisi test4.sinif (4. sınıf);
   - test velisi;
   - test öğretmeni (IrfTest'te matematik). Öğretmenle önce seçili çocuğun IrfTest olduğuna bakılır.

   Bütün satırlar `OK` olmalı. Bu test hiçbir şey kaydetmez.

   Giriş bağlantısı: `node tools/sb.mjs login-link irftest` (ya da `test4`, `testveli`, `testogretmen`). Araç yalnızca bu
   test hesaplarına bağlantı üretir (`tools/test-accounts.mjs`).
3. Değişikliğin dokunduğu **[E]** maddeleri test hesabıyla elle denenir.
4. Gerçek hesaplar yalnızca salt okunur kontrol edilir (`supabase/check-students.sql`, 1. adımda çalışır).
   Onların adına hiçbir şey yapılmaz, girilmez.
5. İlkokul görünümü 4. sınıf test öğrencisiyle (test4.sinif) denenir; IrfTest'in sınıfını değiştirmeye gerek yok.
6. Aile fonksiyonu (`supabase/functions/family`) değiştiyse `node tools/test-family.mjs` çalıştırılır (her zaman
   test öğrencisi IrfTest olarak): girişsiz ve öğrenci olarak yapılan çağrılar reddedilmeli.

## Öğrenci

**Giriş ve uygulama**
- E-posta ve şifreyle giriş. Hata mesajları ayrı: internet yok, sunucuya ulaşılamıyor, çok deneme, şifre yanlış. "Şifremi unuttum" bağlantısı. [E]
- Yeni sürüm yayınlanınca uygulama kendini yeniler (Ctrl+F5 gerekmez). Soru çözerken, denemedeyken ya da gönderilmemiş fotoğraf varken beklenir. [E]
- Geri: üst çubuktaki "← Geri" ve tarayıcının geri tuşu bir önceki sayfaya döner; ilk sayfada tarayıcı tuşu siteden çıkar. [A]
- Soru çözerken ve denemedeyken geri tuşu önce sorar. Denemede süre işlemeye devam eder ve deneme telefonda saklanır. [A]
- Sayfa yenilenince aynı sayfada kalınır. Aynı sekmede çıkış yapıp başka biri girerse kendi ilk sayfasından başlar. [E]

**Bugün (ana sayfa): sade**
- Tarih ve selam. Selam bazen şakacı olur ("…ciğim, napıyon?"). 8. sınıfta LGS'ye kalan gün. [A]
- Velinin okunmamış mesajları ("Okudum ❤" ile kapanır) ve bildirdiği sorulara gelen cevaplar ("Okudum"). [E]
- Mesaj yoksa girişlerin yaklaşık %30'unda bir kart: şaka, bilmece, hafif bulmaca, fıkra ya da şiir. [A]
- **Hata tekrarı** kartı:
  - deneme yanlışlarının nedenini seçme görevi ("Önce bu");
  - soru sayısı ve süre, "Başla";
  - "Birlikte bakılacak N soru" satırı. [A]
- **Konu tekrarı** kartı:
  - soru sayısı ve süre, "Başla";
  - "yeni soru hazırlanıyor" ve "günlük sınıra takıldı" notları;
  - altında **Ek çalışma** (günlük hedefi tamamlar, en zayıf konulardan başlar). [A]

**Günlük plan ve takvim** [O]
- Velinin ders ders günlük soru sayısı. Önce hata tekrarı, sonra konu tekrarı, kalan hak ek çalışmaya gider.
- Bir dersin hakkı bir konu tekrarından küçükse o dersin günün ilk tekrarı yine tam yapılır.
- Hata tekrarı 1, 2, 4, 14 ve 30 gün sonra gelir; her yanlışa üç benzer soru yazılır, sorunun kendisi değil.
- Konu tekrarı Fibonacci aralıklarıyla gelir. LGS'de sık çıkan konular en fazla 21 gün arayla, seyrek konular aralık çarpı velinin katsayısıyla.
- İlkokulda (3–4. sınıf) günde 20 soru. Üstün çocuk bir üst sınıfın konularını da alabilir.

**Soru çözme** [E]
- Sorular LGS kitapçık sırasıyla (derslere göre gruplu), ders içinde müfredat sırasıyla gelir.
- Sayaç (derse göre süre), emin olma ölçeği, ipucu.
- "Bunu birlikte bakalım": boş geçer, birlikte bakılacaklara düşer.
- Yanlıştan sonra "Çözümü anladın mı? Anladım / Anlamadım". Hata tekrarında "Benzer soru" etiketi.
- "Okulda işlenmedi" düğmesi: konu bekletilir.
- "Soruda sorun var": cevap yanlış, soru hatalı ya da anlaşılmıyor seçilirse açıklama yazmak zorunlu.
- Konu tekrarında ya da ek çalışmada yanlış yapılan soru hata tekrarına girer.
- "Ara ver" düğmesi. Oturum sonunda sonuç, birlikte bakılacaklar ve çoğu zaman bir mola kartı. [A]

**Kartlar** [A]
- 12 şaka, 21 bilmece, 10 hafif bulmaca (işlemsiz denebilecek kadar), 13 fıkra, 17 şiir. Her çocuk kendi seviyesindekileri görür.
- "Şiiri sen tamamla": son dize gizli; çocuk kendi dizesini yazar. Sonra aslı, kafiyesi, anlamı ve sesli okuma ipucu gelir. Dize kafiyeli mi diye bakılır.
- Yazılan dize kaydedilir; veli raporda görür. Tamamlanan şiirler sıranın sonuna geçer.
- Aynı kart art arda gelmez, ama hiçbir kart kalıcı olarak çıkmaz.

**Kelime kartları** (ayrı "Kelime" sekmesi) [A], oynama [E]
- Okuldaki İngilizce dersinden ayrıdır, günlük plandaki ders sayılarına girmez.
- 1–4. sınıfta açık, günde 10 kart. Veli sayıyı değiştirir ya da 0 ile kapatır; büyük sınıfa da açabilir.
- Liste (`docs/words.json`): 386 kelime, 30 grup, kolaydan zora. Selamlaşma, renkler, sayılarla başlar; meslekler ve fiillerle biter.
- Kart: İngilizce kelime ve altında dört Türkçe şık. Yanlış şıklar aynı gruptan seçilir.
  - İyice bildiği kelimede bazen tersi sorulur.
  - "🔊 Dinle" telefonun İngilizce sesiyle okur.
  - Cevaptan sonra emoji ve anlamı görünür.
- Tekrar:
  - Bilemezse kelime aynı oturumun sonunda bir kez daha ve yarın gelir.
  - Bilirse sonraki tekrar 3, 7, 14, 30, 60 gün sonradır; ilk görüşte bildiği kelime 3 gün sonraya atlar.
  - 14 güne ulaşan kelime "öğrenildi" sayılır.
- Günün kartları bitince "5 kelime daha".
- Oyun sırasında alt menü gizlenir, geri tuşu önce sorar. Hızlı "Sonraki kelime" kart atlatmaz.
- Altı sekmeli alt menü dar telefona da sığar. [E]

**Yanlışların nedeni** [E]
- Deneme yanlışlarında önce öğrenci nedenini seçer, sonra Claude'un yorumunu ve çözümü görür. Bitince açıldığı sayfaya döner.

**Birlikte bakılacaklar** [A]
- Boş geçtiği, tahmin ettiği ve "anlamadım" dediği sorular, ayrı sayfada.

**Deneme sekmesi** [A], içindekiler [E]
- Gerçek LGS kitapçıkları (2024–2026, sözel ve sayısal). Bu sorular günlük tekrarda gelmez.
  - Kitapçıklar bütün yılın konularını kapsar. Bir kitapçık, bütün soruları aktarılınca ve hepsinin konusu işlenince görünür. [A]
  - O zamana kadar yerinde kısa bir not durur.
- Karma deneme: sözel ya da sayısal, ilkokulda 30 soru.
  - Yalnızca işlenen konulardan ve görülmemiş sorulardan gelir; konular LGS sıklığına göre seçilir.
  - Her başlayışta yeniden kurulur.
- Süre, "T (tahmin)" işareti, soru haritası, "Ara ver" ve devam, "Bitir".
- Sonuç ve net. Yanlış ve boşların hepsi hata tekrarına girer, konusu henüz işlenmemiş olsa da. Çözdüğün denemeler listesi.

**Yükle sekmesi** [A], gönderme [E]
- **Soru ekle**: "Yapamadığım sorular" ve "Beğendiğim sorular" fotoğrafları, istenirse not.
  - Sayfanın üstündeki not kutusu Isla'dan şunları yazmasını ister: nerede takıldığı, hangi şıklar arasında kaldığı, hangisini işaretlediği. [A]
    - Bunları ya kâğıdın üstüne kalemle ya da Not kısmına numarasıyla yazar.
    - Her soruya ayrı alan yoktur; 10 soru gönderirken zorlanmasın diye.
  - Görev bu notları okur ve çözümü takıldığı yerden anlatır.
  - Görev çözümünü yazar.
  - Yapamadığı soru hata tekrarına girer; beğendiğinin benzerleri yazılır.
  - Çözümler "Gönderdiğin sorular" altında görünür.
- **Kâğıt deneme**: kitapçık sayfaları, varsa optik form, "süre yetti mi?". Cevap anahtarı istenmez.
- Son yüklemelerin durumu.
- Gönderilmemiş fotoğraf varken sayfadan çıkılırsa sorulur. Panodan yapıştırma çalışır.

**Konularım** [A], işaretleme [E]
- Konuyu işlendi ya da işlenmedi diye işaretleme. LGS sıklığı bilgisi, seyrek konu düğmesi, bir üst sınıfın konuları.

## Veli

**Rapor** [A], içindekiler [E]
- Özet kutuları.
- "… mesaj bırak":
  - tatlı söz ya da şaka önerisi, imza;
  - bütün çocuklara gönderme;
  - okundu bilgisi, geri alma.
- Birlikte bakılacaklar ("Birlikte baktık" ile listeden çıkar).
- Gün gün çalışma: konu konu doğru ve yanlış, süre, "anladı mı?".
- Bildirdiği sorular (kendi açıklamasıyla) ve tamamladığı şiirler.
- Kelime kartları kutusu:
  - bugün, son 7 günün doğru oranı;
  - öğrendiği ve zorlandığı kelimeler;
  - hiç kart çözmediyse görünmez. [E]
- Denemeler tablosu, özel derste çalışılacaklar (eksik konu notu, YouTube), zayıf konular.
- Yanlışların nereden geldiği, derslere göre, soru tipine göre, kavram yanılgıları.
- Son 14 gün, önümüzdeki 7 gün, yüklemeler ve saatlik görevin en son çalıştığı saat.

**Diğer sayfalar**
- Sorular sayfası. [A]
- Konular: işlendi ya da işlenmedi işaretleme. [E]
- Deneme yükleme (çocuk için) ve kitap sayfası ekleme (ortak soru havuzu). [E]
- Çocuk değiştirme (üst çubukta). [E]

**Ayarlar** [E]
- Ders ders günlük soru sayısı; bugün ve son 7 günde harcanan süre; hata tekrarı sınırı aşıyorsa uyarı ve "X yap".
- Kelime kartları: günde kaç kart (0 kapalı). Ders sayılarından ayrı bir satırda, bugün kaç kart çözdüğüyle. [A]
- Sınıf (1–8), bir üst sınıfın konuları, LGS tarihi (8. sınıf).
- Seyrek konu katsayısı: 1, 1,5, 2, 3 ya da 0 (tekrar etme).
- Aile:
  - çocuk ekleme ve silme (silmede adını yazarak onay);
  - veli ekleme;
  - öğretmen bağlama (ders seçerek).

## Öğretmen [A], içindekiler [E]
- Sadece velinin açtığı çocukları ve kendi derslerini görür; salt okunur.
- Birlikte bakılacaklarda kendi derslerinin sorularını "Birlikte baktık" yapar.

## Saatlik görev (`job/INSTRUCTIONS.md`) [E: görev raporu ve sonuçlar]
- Haftası gelen konuları açar.
- Kâğıt denemeleri notlandırır: teşhis, kırpılmış soru, konu durumu, hata maddeleri.
- Kitap sayfalarından havuza soru ekler. Öğrencinin gönderdiği soruları işler (1e).
- Uygulama içi deneme yanlışlarına teşhis yazar ve her hata maddesine benzer sorular yazar.
- MEB kitapçıklarını aktarır. Bunlar aile içi kullanım içindir, hiçbir yerde yayımlanmaz.
- Soru havuzunu doldurur: boş konular önce gelir, sık çıkan konular önde.
- Konu eksiklerine özel ders notu ve konu anlatımı yazar.
- Soru bildirimlerini cevaplar.
- Hiçbir satırı ya da dosyayı silmez.

## Yetkiler [O]
- Öğrenci kendi rolünü, sınıfını ve planını değiştiremez; veli değiştirir.
- Mesajlar: veli yazar, çocuk okur ve "okudum" der; kardeşler birbirini görmez.
- Öğretmen sadece kendi derslerini görür, yazamaz.
- Birlikte baktık: veli ve o dersin öğretmeni işaretler.
- Şiir dizeleri: çocuk yazar; veli ve Türkçe öğretmeni okur.
- Soru ekle: öğrenci ve velisi gönderir; kardeşi adına gönderilemez.
- Kelime kartları:
  - çocuk kendi kutusunu ve cevabını yazar, kardeşi adına yazamaz;
  - günlük sayıyı veli ayarlar, çocuk değiştiremez;
  - veli ve İngilizce öğretmeni okur; başka öğretmen ve kardeş göremez.
- Aile dışından biri hiçbir şey görmez.
- Test araçları şifresiz giriş bağlantısını yalnızca test hesaplarına üretir (IrfTest, test4.sinif, Test Veli, Test Öğretmen).
  Başka bir ad ya da adres verilirse durur, Supabase'e hiç gitmez; hesap açılmaz.
