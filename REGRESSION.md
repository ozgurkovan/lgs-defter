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
   - test öğretmeni (test4.sinif'e bağlanınca; hesap Isla'ya da bağlı, önce seçili çocuğun test4 olduğuna bakılır).

   Bütün satırlar `OK` olmalı. Bu test hiçbir şey kaydetmez. Yalnızca test hesaplarıyla çalışır (velinin isteği, 2026-11-10):
   giriş yapan hesap test hesabı değilse ya da sayfaları açılacak çocuk (öğrencide kendisi, veli ve öğretmende seçili çocuk)
   test çocuğu değilse tek satır "HATA Yalnızca test hesabıyla ve test çocuğuyla" yazar, hiçbir sayfa açmaz. Kimlik listesi
   `tools/test-accounts.mjs` ile aynı olmalı; yeni test hesabı eklenince `ui-smoke.js`'e de eklenir (1. adım denetler).

   İkinci bir Claude oturumu kendi önizlemesini başka bir portta açabilir (örneğin 5501). Aile fonksiyonu yalnızca 5500'e ve
   canlı siteye izin verir, o yüzden velinin Aile denetimi orada "İşlem yapılamadı" der; Aile bölümü 5500'de denenir.

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
- Aynı tarayıcıda başka sekmede başka biri giriş yaparsa açık sekmeler yenilenip o kişiyi gösterir; eski sekme eski oturumu
  geri yazıp yeni giriş yapanı önceki hesaba döndürmez (2026-11-10). [A]
- Geri: üst çubuktaki "← Geri" ve tarayıcının geri tuşu bir önceki sayfaya döner; ilk sayfada tarayıcı tuşu siteden çıkar. [A]
- Telafio adı, logosu ve yeni görünüş (velinin isteği, 2026-11-17: "güzel bir logomuz olsa… bizim app modern gözükmüyor"):
  sekme başlığı, ana ekran simgesi ve kurulum adı Telafio; açılışta ve giriş ekranında logo (giriş ekranındaki slogan aynı).
  Üst çubukta ilk sayfada logo ve ad, "← Geri" görünen sayfalarda yalnızca simge; dar telefonda üst çubuk tek satır.
  Görünüş `docs/theme.css`'te (öteki stillerden sonra yüklenir): düz açık zemin, kalın kenarlı kartlar, kabartmalı ana
  düğmeler, ana sayfada sarı "Başla" ve simgeli Hata tekrarı / Konu tekrarı kartları, mavi kahraman kartı, seçili sekmesi
  renkli alt menü, soru ekranında kalın ilerleme çubuğu ve dolu şık harfleri; koyu tema. Hiçbir ekranın içeriği değişmedi.
  Sürüm numarası theme.css'i ve export.js'i de kapsar (10 dosya). [O] (sürüm sayımı), [A] (sayfalar hatasız açılır), [E] (görünüş)
- Ülke ve müfredat ayrımı (velinin isteği, 2026-11-09; `supabase/country-curriculum.sql`): konular sınıfın yanında müfredata
  göre de seçilir (`topics.curriculum`, `profiles.curriculum`; bugün hepsi `tr`). Başka müfredatın aynı sınıftaki konusu
  öğrenciye görünmez ve yıllık plana göre açılmaz. LGS'ye özgü dersler, günlük plan ağırlıkları, sayaç ve denemeler
  yalnızca Türkiye müfredatındaki 8. sınıfta. Müfredatı veli ayarlar, çocuk değiştiremez. Görünen bir şey değişmedi;
  müfredat seçme ekranı henüz yok. [O] (`test-country-curriculum.sql`, `tools/test-schedule.mjs`), [A]
- **ABD hesapları** (velinin isteği, 2026-11-10: "ABD öğrencilerine Türkçe hiçbir şey gösteremeyiz"):
  - Müfredatı `us` ile başlayan hesap (öğrenci, veli, öğretmen) her şeyi İngilizce görür. Uygulama Türkçe yazılır;
    `docs/i18n.js` ekrana giren her yazıyı (metin, düğme etiketi, yer tutucu, onay pencereleri) `docs/i18n-en.js`
    sözlüğüyle çevirir. Sözlük yalnızca İngilizce gerekince yüklenir; Türk aileleri için hiçbir şey değişmez. Tarih ve saat
    ABD biçiminde, net ondalık noktayla. [A] (ui-smoke: ABD hesabıyla "hiçbir sayfada Türkçe yazı yok")
  - Kodda yeni bir Türkçe yazı yazılırsa çevirisi de eklenmeli: `node tools/i18n-extract.mjs --missing` eksikleri listeler,
    çeviriler `tools/i18n/en.json`'a girer, `node tools/i18n-build.mjs` dosyayı üretir. regression.mjs eksik çeviriyi,
    yer tutucu uyuşmazlığını ve İngilizcede Türkçe harfi yakalar. [O]
  - Şakalar, bilmeceler, fabllar, şiirler (kamu malı), velinin tatlı söz önerileri ve şakacı selamlar ABD'de İngilizce
    içerikten gelir (`tools/i18n/content-en.json`). [A]
  - Dersler (2026-11-10): English Language Arts (`ela`), Math, Science (`fen`) ve Social Studies (`sosyal`); ELA, Fen ve
    Sosyal konuları Pennsylvania'nın kendi standartlarından (PA Core ELA, STEELS 2023, PA sosyal bilgiler; CC BY 4.0;
    `supabase/topics-us-pa-other.sql`, `supabase/us-subjects.sql`). Matematik konuları Pennsylvania matematiği, 2., 3., 4. ve 7. sınıf, Common Core standartlarına göre
    (`supabase/topics-us-pa-math.sql`, CC BY 4.0), 2026-27 okul yılına yayılmış haftalarla; haftası gelen konu kendiliğinden
    açılır. Türk öğrenciye ABD konusu, ABD öğrencisine Türk konusu hiç gelmez. [O] (`test-country-curriculum.sql`), [A]
  - ABD'de İngilizce kelime kartları (sekme, ayar satırı) ve LGS yok. Klavye dersleri ABD klavyesiyle ve İngilizce kelimelerle
    (Klavye bölümüne bakın). [A]
  - Saatlik görev ABD öğrencisi için yalnız ABD konularını kullanır ve öğrencinin ya da velinin göreceği her şeyi İngilizce
    yazar; Matematik dışı ABD yüklemelerini nazikçe atlar (`job/INSTRUCTIONS.md`, "US students"). [E]
  - Yeni öğrencinin (henüz hiç konu tekrarı yok) ilk konu tekrarları açıldığı gün başlar, ertesi gün değil; ilk gün ana
    sayfa boş kalmaz (velinin gözlemi, 2026-11-10; `supabase/activate-topics-first-day.sql`). Sonraki konular eskisi gibi
    ertesi günden 7 güne yayılır. [O], [A]
  - Yeni hesaplar ekleyen velinin müfredatını alır (ABD velisinin çocuğu ABD konularıyla başlar;
    `supabase/functions/family`). [A]
- Büyük okumalar eksiksiz gelir. Supabase bir istekte en çok 1000 satır verir; uygulamanın ortak okuma yardımcısı (`q`) sonuç
  tam 1000 satırsa sorguyu birincil anahtara göre sıralayıp bütün sayfaları okur (2026-11-09: 1000 cevabı geçen öğrencide
  çözdüğü sorular görülmemiş sayılacak, altın ve güç yanlış hesaplanacaktı). Yazma sorguları ve kendi sınırı olanlar
  yinelenmez; sayfalar okunamazsa ilk 1000 satırla devam edilir. [O], canlı soru havuzunda [A]
- Soru çözerken ve denemedeyken geri tuşu önce sorar. Denemede süre işlemeye devam eder ve deneme telefonda saklanır. [A]
- Sayfa yenilenince aynı sayfada kalınır. Aynı sekmede çıkış yapıp başka biri girerse kendi ilk sayfasından başlar. [E]

**Bugün (ana sayfa): sade**
- Tarih ve selam. Selam bazen şakacı olur ("…ciğim, napıyon?"). 8. sınıfta LGS'ye kalan gün. [A]
- Kahramanı besleme ya da asker kahraman açıksa selamın altında kahramanın kartı (aşağıda "Kahramanı besleme" ve
  "Asker kahraman"); ikisi de kapalıysa görünmez. [A]
- Velinin okunmamış mesajları ("Okudum ❤" ile kapanır) ve bildirdiği sorulara gelen cevaplar ("Okudum"). [E]
- Mesaj yoksa girişlerin yaklaşık %30'unda bir kart: şaka, bilmece, hafif bulmaca, fıkra ya da şiir. [A]
- **Hata tekrarı** kartı:
  - deneme yanlışlarının nedenini seçme görevi ("Önce bu");
  - soru sayısı ve süre, "Başla";
  - "Birlikte bakılacak N soru" satırı. [A]
- **Konu tekrarı** kartı:
  - soru sayısı ve süre, "Başla";
  - "yeni soru hazırlanıyor", "yoğun gün: N tekrar kısa tutuldu" ve "günlük sınıra takıldı" notları (iki kartta da);
  - altında **Ek çalışma** (günlük hedefi tamamlar, en zayıf konulardan başlar). [A]

**Günlük plan ve takvim** [O]
- Velinin ders ders günlük soru sayısı. Önce hata tekrarı, sonra konu tekrarı, kalan hak ek çalışmaya gider.
- Ders kutularının üstünde "Günde toplam" kutusu (velinin isteği, 2026-11-12): toplam değişince dersler en son elle girilen
  oranla dağılır (yuvarlama en büyük kalanla, toplam tam tutar; ders başına en fazla 60). Bir dersi elle değiştirince toplam
  kendiliğinden güncellenir. Kaydet'e basmadan hiçbir şey kaydedilmez. [A]
- **Okul tatilleri** (velinin isteği, 2026-11-16: "tatillerde soru sayısını artırmamız lazım"): tatil günlerinde her dersin
  sayısı katlanır (ders başına en fazla 60). Türkiye'de MEB 2026-2027 takvimi hazır: 1. ara tatil 14–22 Kasım 2026, yarıyıl
  23 Ocak–7 Şubat 2027, 2. ara tatil 6–14 Mart 2027 (çevredeki hafta sonları dahil); ABD'de yalnızca velinin eklediği
  günler. Veli Günlük plan'da "Tatilde günlük soru": Aynı kalsın / 1,5 kat / 2 kat (önerilen, seçilmezse bu) / 3 kat;
  yaklaşan tatiller listede, kendi tatil günlerini ekler ve siler; Kaydet ile kaydedilir. Öğrencinin ana sayfasında
  selamın altında "🏖️ 1. dönem ara tatili: bugün hedefin 2 kat, 70 soru." Bronz fiyatları ve ikramiye normal planla. Ayarları
  öğrenci değiştiremez (test-holidays.sql). [O], ekran [A]
- Bir dersin hakkı bir konu tekrarından küçükse o dersin günün ilk tekrarı yine tam yapılır.
- Hata tekrarı 1, 2, 4, 14 ve 30 gün sonra gelir; her yanlışa üç benzer soru yazılır, sorunun kendisi değil.
- Aralık, "tamamen eminim" ya da "büyük ölçüde eminim" ile ipucusuz ve süresinde doğru bilinince uzar; büyük ölçüde emin
  doğrunun sonraki tekrarına 1 destek sorusu eklenir. Yavaş ya da ipuçlu doğru aralığı değiştirmez; kararsız ya da tahmin
  bir basamak geri götürür; yanlış başa döndürür.
- Yoğun gün: bir dersin günü gelen hata ve konu tekrarları (destek sorularıyla) o dersin kalan hakkını aşıyorsa o derste
  destek soruları atlanır, konu tekrarı 5 yerine 3 soru olur; her madde en az bir kez görülür.
- Toplu gelen hatalar (birkaç deneme birlikte, uygulamada tam LGS, on soru birden) ilk tekrar günlerine yayılır: bir derse
  bir günde o dersin günlük sayısından fazla hata tekrarı düşmez (`spread_new_mistake` tetiği, `test-spread.sql`).
- Konu tekrarı Fibonacci aralıklarıyla gelir. LGS'de sık çıkan konular en fazla 21 gün arayla, seyrek konular aralık çarpı velinin katsayısıyla.
- İlkokulda (3–4. sınıf) günde 20 soru. Üstün çocuk bir üst sınıfın konularını da alabilir.

**Soru çözme** [E]
- Sorular LGS kitapçık sırasıyla (derslere göre gruplu), ders içinde müfredat sırasıyla gelir.
- Sayaç (derse göre süre), emin olma ölçeği, ipucu.
- "Bunu birlikte bakalım": boş geçer, birlikte bakılacaklara düşer.
- Yanlıştan sonra "Çözümü anladın mı? Anladım / Anlamadım". Hata tekrarında "Benzer soru" etiketi.
- **Adım adım çözüm** (velinin isteği, 2026-11-16: "birisi kısa çözüm, diğeri daha detaylı hatta şekilli, bir bir yavaş
  yavaş"; `docs/steps.js`, `questions.steps`): kısa çözümün altında, sorunun adımları yazılmışsa "🪜 Adım adım anlat".
  Adımlar "Sonraki adım ›" ile tek tek açılır (öncekiler üstte soluk, "‹ Önceki adım", sonda "Baştan anlat"); her adımda
  🔊 sesli okuma (Türkçe ya da İngilizce) ve gerekirse şekil: sayı doğrusu, kesir şeridi, bant modeli, kareli alan, gruplar,
  dikdörtgen/kare/üçgen/daire, tablo, metinde işaretli sözcükler (uygulamanın kalıpları; yazılar kaçışlı, sayılar sınırlı).
  Çözümün göründüğü her yerde: oturumda cevaptan sonra, birlikte bakılacaklar, Birlikte çöz kartı, benzer sorular, deneme
  sonucu, öğrencinin gönderdiği sorular, velinin soru listeleri. Adımları saatlik görev yazar, önce son 14 günde yanlış
  yapılan sorulara (job/INSTRUCTIONS.md 1h). Adım yoksa yalnız kısa çözüm. [O] şekiller, [A] görünüm
- "Bu konuyu okulda henüz işlemedik" düğmesi önce sorar (velinin isteği, 2026-11-09): pencerede konunun adı, öne çıkan
  "Vazgeç, soruyu çözeceğim" ve "Evet, henüz işlemedik". Evet denirse konu bekletilir; vazgeçilirse soru yerinde kalır. [A]
  Konu tekrarında, hata tekrarında ve ek çalışmada çıkar (velinin sorusu, 2026-11-16: denemedeki yanlışlar konusu
  işlenmemiş olsa da hata tekrarına girer); kitap soruları ve konu çalışmasında yok. Konu "işlendi" olunca sorular geri gelir.
- "Soruda sorun var": cevap yanlış, soru hatalı ya da anlaşılmıyor seçilirse açıklama yazmak zorunlu. "Gönder" önce sorar:
  ne bildirdiğini ve sonucunu söyler ("Soru kontrol edilecek ve sana sayılmayacak"); "Evet, bildir" ya da "Vazgeç". [A]
- Soru beğenisi (velinin isteği, 2026-11-16): cevaptan sonra "Bu soru nasıldı? 👍 👎". Dokununca hemen kaydedilir
  ("Teşekkürler!"), oy değiştirilebilir; 👎'de "Neden beğenmedin?" kutusu açılır, yazmak isteğe bağlı. Sonucu, takvimi
  ve bronzu etkilemez; yalnızca öğrencinin kendi hesabında görünür (veli/öğretmen denerken yok). `question_votes`; öğrenci
  yalnızca kendi oyunu yazar, veli görür, yazamaz (test-question-votes.sql). Saatlik görev 👎'leri okur, soruyu yeniden
  çözer; hatalıysa kapatır, kafa karıştırıyorsa yalnızca ifadesini düzeltir (INSTRUCTIONS 4b). Çok beğenilmeyen soru
  (velinin isteği, 2026-11-17: en az 3 öğrenci 👎 ve 👎 en az 👍 kadar; test hesapları sayılmaz) baştan incelenir: 👎
  verenler soruyu doğru mu yanlış mı yaptı, notlar aynı sorunu mu söylüyor, herkesin doğru oranı konunun öteki sorularına
  göre nasıl. Haklı çıkarsa ifade düzeltilir ya da soru havuzdan çıkarılır (`active=false`, silinmez) ve yerine aynı
  kazanımdan yeni soru yazılır; yalnızca zorluktan gelen 👎'de soru kalır. Yüklenen sorular oy yüzünden çıkarılmaz.
  Kararlar görev özetine yazılır. [A] sahte kayıtla, yetki [O]
- Konu tekrarında ya da ek çalışmada yanlış yapılan soru hata tekrarına girer.
- "Ara ver" düğmesi. Oturum sonunda sonuç, birlikte bakılacaklar ve çoğu zaman bir mola kartı. [A]

**Kartlar** [A]
- 12 şaka, 21 bilmece, 10 hafif bulmaca (işlemsiz denebilecek kadar), 13 fıkra, 17 şiir. Her çocuk kendi seviyesindekileri görür.
- "Şiiri sen tamamla": son dize gizli; çocuk kendi dizesini yazar. Sonra aslı, kafiyesi, anlamı ve sesli okuma ipucu gelir. Dize kafiyeli mi diye bakılır.
- Yazılan dize kaydedilir; veli raporda görür. Tamamlanan şiirler sıranın sonuna geçer.
- Aynı kart art arda gelmez, ama hiçbir kart kalıcı olarak çıkmaz.

**Kelime kartları** (ayrı "İngilizce" sekmesi, Ayarlar'ın solunda) [A], oynama [E]
- Okuldaki İngilizce dersinden ayrıdır, günlük plandaki ders sayılarına girmez.
- Aile isterse açar (Ayarlar → Günlük plan, açma düğmesi), her sınıfta; açılmadıysa kapalı. Açıkken günde kaç kart (varsayılan 10).
- Liste (`docs/words.json`): 1104 kelime, 80 grup, kolaydan zora. Selamlaşma, renkler, sayılarla başlar; ilk 30 grup temel
  kelimeler (386). 2026-11-01'de İrfan ve Ömer bunların hepsini görünce 50 grup eklendi: masallar ve uzaydan başlar,
  fiiller, zıt anlamlılar, zor sıfatlar ve "and, but, because" gibi küçük kelimelerle biter. [O, `test-words.mjs`]
  - Kelime kimliği İngilizcesidir: önceki sürümdeki hiçbir kelime silinmez ya da yazımı değişmez, yeni gruplar sona eklenir.
  - Kelimeler tekrar etmez; her grupta en az 4 kelime var ve grupta iki kelimenin Türkçesi aynı değil.
- Yeni kelimeler her çocuğa kendi sırasıyla gelir (velinin isteği: kardeşler aynı kartları yan yana çözüp kavga
  ediyordu). Liste 6 gruplık bloklara ayrılır. Çocuk her blokta kendine düşen gruptan başlar, grup içinde kelimeler
  karışık gelir. Bir grubun kelimeleri yine arka arkaya gelir. Sıra her açılışta aynı; kolaydan zora en fazla 5 grup
  sapar. İki çocuğun ilk 20 kartı çoğunlukla farklıdır. [O, `test-words.mjs`]
- Bütün kelimeleri gördüyse ve hiçbirinin günü gelmediyse "Yarın yeni kelimeler gelecek" yazmaz. Bunun yerine
  "Listedeki N kelimenin hepsini gördün… sıradaki <tarih>" yazar. Velinin Günlük plan satırında "hepsini gördü: … sayıyı
  artırmak yeni kart getirmez" yazar; değilse "N kelimenin M tanesini gördü". [E]
- Kart: İngilizce kelime ve altında dört Türkçe şık. Yanlış şıklar aynı gruptan seçilir.
  - İyice bildiği kelimede bazen tersi sorulur.
  - "🔊 Dinle" telefonun İngilizce sesiyle okur.
  - Şık seçilince sorulardaki emin olma ölçeği çıkar (%25 tahmin … %100 tamamen emin); ölçek seçilmeden "Cevabı gönder" açılmaz. [A]
  - Cevaptan sonra emoji ve anlamı görünür.
- Tekrar:
  - Bilemezse kelime aynı oturumun sonunda bir kez daha ve yarın gelir.
  - Doğru ama kararsız ya da tahminse oturum sonunda bir kez daha gelir ve kutusu bir geri gider.
  - Tekrar zamanını FSRS hesaplar. Her kelimenin kararlılığı ve zorluğu tutulur. Kelime unutulmadan önce, hatırlama
    olasılığı %90'a düşerken gelir. [O, `test-schedule.mjs`]
    - Bildikçe aralık açılır, üst sınır yoktur (örnek: 4 → 15 → 49 → 146 → 393 → 973 gün).
    - Yanlış cevap o kelimenin sınırını gösterir. Aralık sınırın altına çekilir (393 gün → 13 gün), kelime zorlaşır,
      sonra yeniden ama daha yavaş açılır.
    - Emin olma ölçeği nottur: yanlış, kararsız ya da tahmin, büyük ölçüde emin, tamamen emin.
  - Çocuğun hafızası öğrenilir. Tekrar cevaplarında modelin tahmininden iyi mi kötü mü hatırladığına göre bütün
    aralıklar bir katsayıyla çarpılır. 10 cevaptan önce katsayı 1'dir; az veriyle 1'e yakın kalır. Raporda görünür. [O]
  - İlk görüşte "tamamen eminim" dediği kelime zaten biliniyor sayılır: 110 gün sonra gelir, sonra yaklaşık 2 yıl,
    13 yıl. Böylece "yes" gibi kelimeler sürekli gelmez. "Büyük ölçüde eminim" 4 gün sonra gelir. [O]
  - Kart türü:
    - yeni kelime yazılı gelir;
    - bildiği kelime ikinci kez gelince yalnızca dinleme kartı olur: yazı görünmez, kelime kendiliğinden okunur,
      Türkçesini seçer;
    - daha iyi bildiği kelimelerde yazılı, ters ve dinleme karışık gelir. [E]
  - Kararlılığı 3 haftayı aşan kelime "öğrenildi" sayılır.
  - Raporda emin olmadan bildiklerinin ve dinleyerek bildiklerinin sayısı da görünür.
- Günün kartları bitince "5 kelime daha".
- Oyun sırasında alt menü gizlenir, geri tuşu önce sorar. Hızlı "Sonraki kelime" kart atlatmaz.
- Altı sekmeli alt menü dar telefona da sığar. [E]

**Kelime kahramanı** (İngilizce sekmesi) [A], oyun [E]
- Sevimli bir çocuk çizimi, hep pazılarını gösterir. Görünüşünü veli seçer (Ayarlar → Aile → 🦸 Kelime kahramanı); seçilmediyse
  kıvırcık saçlı. Çocuk bunu kendisi değiştiremez.
- Velinin kuralı: kahraman her seviyede ve her görünüşte sevimli kalır (yumuşak hatlı yüz, gülümseme, pembe yanak). Fotoğraftan
  benzetme yalnızca hazır seçeneklerden en yakınını seçer. Yüz de benzer (yüz şekli, kaş, göz şekli, burun, gülüş, kulak);
  kardeşlerin kahramanları birbirinden ayrılır. Bu çizgiler seçilmemişse eski yüz aynen kalır. [E]
- Güç 0–10, kelime gücünden gelir: 5, 15, 30, 50 … 290. [O]
  - Kelime gücü: her kelime, ulaştığı en yüksek kararlılığın 7'de biri kadar sayılır, en çok 1. Hiç azalmaz; unuttuğu kelime
    gücü düşürmez.
  - Seviye arttıkça kolları kalınlaşır, pazıları şişer, omuzları genişler.
  - Kıyafet: düz tişört → yıldızlı mavi tişört → çizgili spor ve şapka (uzun saçta saç bandı) → 10 numaralı forma ve bileklik
    → pelerinli kahraman → altın madalya ve taç.
- Yolculuk: her güç bir yer. Ev, park, çiftlik, köy, orman, büyük şehir, mercan bahçesi, batık gemi, buzullar, bulutların
  üstü, uzay. Kahramanın sahnesi bulunduğu yerin renklerini alır.
  - Yolculuk çubuğu: bulunduğu yer → gittiği yer; yolda aracı, aracı yoksa yürüyen çocuk; "Ormana N kelime kaldı".
  - Köyden sonrasına araç götürür; araçlar büyük ödüldür ve sırayla alınır. Araba (orman, büyük şehir), denizaltı (mercan
    bahçesi, batık gemi), hovercraft (buzullar), uçak (bulutların üstü), roket (uzay). [O]
  - Aracı yoksa güç bir öncekinde durur; çubukta "Ormana araba götürür: N altın daha biriktir" yazar. Aracı alınca gücü
    hemen yetiştiği yere çıkar. Sırayı atlayan araç işe yaramaz.
- Aracı olan çocuk kartları aracın penceresinden çözer [E]:
  - araba yan camı, denizaltı lombozları, hovercraft ön camı, uçak pencereleri, roket penceresi;
  - camdan gittiği yerin manzarası görünür, doğru her cevapta akar;
  - yeni yere varınca pencerede "🎉 Orman! Güç 5" çıkar, manzara (gerekirse araç) değişir.
- Kelime altını 🪙: ilk denemede doğru her kart 1, günün kartlarını bitirdiği her gün 5. [O]
  - Emin olma ölçeğinden bağımsızdır; çocuk fazla altın için "tamamen eminim" demez.
  - Oturum sonunda tekrar sorulan kart altın vermez.
- Mağaza:
  - en üstte sıradaki büyük ödül, biriken altın çubuğu ve "Arabayı al!";
  - yolculuk araçları sırayla ("Önce arabayı al");
  - dünyanı süsle: toptan şatoya 12 eşya, her biri bir kez. Aldıkları kahramanın sahnesinde durur.
- Araç alınınca gösterişli kutlama: araç ekrana süzülür, konfeti yağar, "Ormana vardın! Güç 5"; "Yola çık!" kelime sayfasına
  götürür. [E]
- Oturum sonunda kazandığı altın görünür. Yeni yere varınca konfetili kutlama ve yeni kahraman görünür.
- Raporda güç, bulunduğu yer, altın, aracı beklediği ve aldıkları görünür.

**Kahramanı besleme** (velinin isteği, 2026-11-09; `docs/feed.js`) [O], ekran [A], yedirme [E]
- Çocuk çalışmazsa kahraman acıkır. Tokluk 0–100: günde 50 düşer (tam tok kahraman iki günde acıkır); besleme başlarken
  tam toktur. Tok ve mutlu (70 ve üstü), iyi (40), acıktı (15), çok aç. [O]
- Kahramanın hali çizimde görünür: tokken gülüşü büyür, pazılarının yanında parıltı; acıkınca pazıları söner, kaşları
  kaygılı olur, karnı guruldar; çok açken kolları yana düşer. Her halde sevimli kalır (pembe yanak, gözyaşı yok).
  Seviye, araçlar ve alınan eşyalar hiç kaybolmaz. Besleme kapalıyken çizim eskisiyle birebir aynıdır. [O]
- Bronz altından ayrı paradır; yalnızca yemeğe gider. Kazanma [O]:
  - her doğru cevap 1 bronz (hata tekrarı, konu tekrarı, ek çalışma, konu çalışması, kitap, deneme);
  - günlük planın yarısını çözdüğü gün ve tamamını çözdüğü gün ikramiye (planın onda biri kadar, doğru sayısından
    bağımsız: zorlanan çocuğun kahramanı aç kalmasın);
  - ilk denemede doğru her 4 kelime kartı 1 bronz;
  - günün klavye dersleri (yıldızlı, günlük ders sayısına kadar) ve Kelime roketi (40 harf 1 bronz, günlük sınırla: oyun
    soru çözmenin yerini almasın). Oyunun sonucu bunun için `typing_results`'a "oyun" adıyla yazılır; dersleri,
    yıldızları, günün ders sayısını ve rapordaki klavye kutusunu etkilemez.
  - Bronz ve tokluk beslemenin başladığı günden sayılır (2026-11-09; veli sonradan açtıysa açtığı andan).
- Yemekler: elma, süt, kahvaltı, yemek, hamburger, pasta. Fiyat çocuğun günlük planına göredir (günde 105 soru çözenle
  35 soru çözen aynı emekle doyurur). Planını %60 doğruyla bitiren çocuk kahramanını bir gün doyurur; planın dörtte biri
  yetmez. [O]
- **Kahramanın sayfası** ("Kahramana git" ya da "Besle"): ortada kahraman ve sözü, yanda yemek rafı, altında tokluk
  çubuğu, bronz ve bugün yedikleri; "Bronz nasıl kazanılır?" kutusu. [A]
  - Rafta bir yemeğe dokununca bronzu yetiyorsa alınır, yemek kahramanın ağzına uçar, kahraman teşekkür eder, tokluk
    artar, bronz düşer. Bronz yetmiyorsa "… bronz daha gerek"; karnı toksa (95 ve üstü) yemez. [E]
  - Sayfa arka plandayken de yedirme tamamlanır (uçuş bitmesini beklemez). [E]
- **Kahramanın kartı**: küçük kahraman, sözü, tokluk çubuğu, bronz, düğme. Ana sayfada selamın altında; soru oturumu,
  kelime kartları ve klavye dersi bitince de görünür. Acıkmış ve bronzu yetiyorsa düğme "Kahramanı besle" (öne çıkar),
  değilse "Kahramana git". [A]
  - Kahraman yardım ister, suçlamaz: tokken teşekkür eder; bronzu yetiyorsa "Bana … alır mısın?"; yetmiyorsa en ucuz
    yemeğe kaç doğru cevap kaldığını söyler ("2 doğru cevapla elma alabiliriz"). [O]
- İngilizce ve Klavye sayfalarındaki kahraman da aynı haldedir; altında tokluk çubuğu, bronz ve "Besle". [A]
- Veli (Ayarlar → Günlük plan, Klavye satırının altında): "Kahramanı besleme" çocuk başına açılır ya da kapanır.
  7. sınıfa kadar açık gelir, 8. sınıftan sonra kapalı (büyük çocuğa çocukça gelebilir). "Açlığı dondur" (hastalık,
  tatil): tokluk düşmez; açılınca kaldığı yerden devam eder. Altında kahramanın şimdiki hali, bronzu, bugün yedikleri.
  Kapatıp yeniden açınca bronz sıfırdan başlar. Kapalıyken çocukta kart, raf ve bronz görünmez; kahraman eskisi gibidir. [A], kaydetme [E]

**Asker kahraman** (velinin isteği, 2026-11-13; `docs/army.js`, `supabase/hero-army.sql`) [O], ekran [A], kol seçimi [E]
- Kahramanın göğsünde bir forma numarası var; çalıştıkça artar, hiç azalmaz. Hesap veritabanında (`hero_army_state`) [O]:
  hata tekrarında her 10 doğru +1, öteki sorularda (konu tekrarı, ek çalışma, deneme, kitap, konu çalışması, kâğıt
  deneme) her 20 doğru +1; ilk denemede doğru 5 kelime kartı (2026-11-15'e kadar 8) ve yıldızlı her klavye dersi birer
  "öteki doğru". Puan olarak: hata tekrarı doğrusu 2, öteki doğru 1; 20 puan bir numara. Kahramanın kartında "sıradaki
  numaraya N puan", kahramanın sayfasında sıradaki numaranın çubuğu ve "N puan kaldı" (askerken de). Sayım
  2026-11-13'ten (yayın günü) başlar. Bugün kaç arttığı da görünür ("bugün +2").
- Asker değilken numara göğsün ortasında (yıldızın ve "10"un yerinde); pelerinli seviyelerde amblem ya da madalya sola
  kayar, numara sağda. Pelerin, taç, şapka yerinde kalır. Asker kahraman kapalıyken çizim eskisiyle birebir aynıdır. [O]
- **100 olunca asker olur**: kahramanın kartında "Kolunu seç", bir kez kutlama ("100'e ulaştın!"). Kahramanın sayfasında
  "Askerlik töreni": Türkiye'de Kara, Deniz, Hava; ABD'de Army, Navy, Air Force, Marines, Space Force. Her kolda kahraman
  o kolun üniformasıyla görünür; çocuk birine dokunur, onaylar, "Artık askersin!" kutlaması. [A], seçim [E]
  - Kolu yalnızca öğrenci, numarası 100 olunca, bir kez ve ülkesine uygun seçer (`set_hero_corps`). [O]
- Askerken üniforma: kolunun gömleği (Kara, Army, Marines kamuflajlı; Deniz, Navy denizci yakalı), pantolon, bot, kolunun
  şapkası (bere, denizci şapkası, kep); subay rütbesinde (Asteğmen ve üstü) siperlikli şapka. Göğsün solunda bayrak ve
  rütbe işareti, sağında numara künyesi (10. seviyede üstünde madalya). Pelerin ve taç çıkar; yüz ve gülüş aynı, sevimli. [O]
- **Rütbe**: Er 100, Onbaşı 115, Çavuş 135, Üstçavuş 160, Astsubay 190, Asteğmen 225, Teğmen 265, Üsteğmen 310,
  Yüzbaşı 360, Binbaşı 415, Yarbay 475, Albay 540, General 620 (Deniz'de Amiral). ABD'de kolun kendi İngilizce
  rütbeleri. Terfi edince bir kez kutlama ("Terfi! … oldun!"); ilk açılışta eski durum kutlanmaz. [O]
- **Madalyalar** (velinin isteği, 2026-11-14: asker olana kadar motivasyon): 5'te İlk Adım Rozeti, sonra 10, 20 … 90'da
  birer madalya (Cesaret Madalyası, Azim Yıldızı, Şimşek Rozeti, Aslan Yürek Madalyası, Yarı Yol Kupası, Bilgelik Nişanı,
  Kartal Gözü Rozeti, Zirve Madalyası, Kahramanlık Nişanı); ilk üçü bronz, dördü gümüş, son üçü altın. Yeni madalyada bir
  kez kutlama (madalya, övgü, sıradaki madalya). Kazanılanların kurdeleleri kahramanın göğsünde (asker değilken üst ortada,
  askerken sağda künyenin üstünde). Kahramanın sözünde son madalya ve sıradakine kalan; kartın satırında madalya sayısı;
  kahramanın sayfasında madalya rafı (kazanılan renkli, sıradaki işaretli, kalanlar gri ve numaralı), askerken de. [O], ekran [A]
- **Antrenman** (velinin isteği, 2026-11-16: asker olana kadar; `army.js`, trainScene/trainSlot): oturumda her cevabın
  altında ("Doğru"/"Yanlış" satırının hemen altı) 2-4 saniyelik sahne; üst üste doğrularla büyür (velinin isteği,
  2026-11-17). 1. doğru: birkaç yumruk, sonuncusunda torba çok uzağa savrulur, geri gelirken kahraman eliyle tutar, söz söylemez, zıplayıp sevinir (velinin isteği, 2026-11-17: "Tuttum demesin").
  2: sağdan soldan kroşeler, torbada el izleri kalır ("Sağ, sol!"). 3: tekme ("Tekme!"; kahraman önce gerilir, ayağı vuruşta bir an kalır, yaklaşık 1 saniye: velinin isteği, 2026-11-17, "çok hızlı oldu"). 4: yumruk tekme kombosu. 5: kroşe ve
  döner tekme, torba tam tur atar. 6 ve üstü: seri yumruk, tekme, döner tekme ("Kombo ×6!") ile 4. ve 5. sahneler sırayla.
  Yanlışta kahraman vurur, torba geri gelip kahramanı devirir; başında yıldızlar, kalkar ve sırayla "Hadi bir daha
  deneyelim!", "Düştüm ama kalktım!", "Bir dahakine olacak!", "Hata yapmak öğrenmektir!"; seri baştan başlar.
  70 numaradan sonra torba yerine eldivenli sevimli uzaylı partner (vurulunca sendeler, gülüp
  eldivenlerini kaldırır; yanlışta kahramanı hafifçe iter, "Hihi!"). Boş geçilen soruda sahne yok, seri sıfırlanır. Asker
  olunca (100 ya da kol seçildi), asker kahraman kapalıysa, hareket azaltılmışsa ve denemede yok. Hiçbir şey kaydetmez.
  İngilizce öğrencide sözler İngilizce. [O] hesap ve çizimler, [A] ekran
  - **Kombolar** (velinin isteği, 2026-11-18: "kombolar hep aynı olunca sıkıcı oluyor", kickboks, taekwondo vb.): her basamakta
    üç kombo, oturumda sırayla döner (başlangıcı her oturumda değişir); yukarıdakiler her basamağın ilki olarak duruyor.
    1: yumruklar, bir-iki, aparkat (boks; aparkatta torba havaya kalkar). 2: kroşeler (boks), iki diz (muay thai),
    ön tekme ve yumruk (karate). 3: tekme (kickboks), balta tekmesi (taekwondo; ayak tepeden iner, torba ezilir, "GÜM!"),
    geri tekme (karate; kahraman arkasını döner). 4: yumruk tekme, bir-iki ve alçak tekme (kickboks; torbanın altı savrulur,
    "ŞAK!"), havada çift tekme (taekwondo). 5: döner tekme, tornado tekme (havada iki tur, çevresinde dönen hava), uçan
    tekme (hız çizgileri). 6 ve üstü: süper kombo ve öncekiler sırayla. Her kombo kendi sporunun salonunda: boks,
    kickboks ve muay thaide ring ipleri, taekwondoda kırmızı mavi minder, karatede tatami, süper komboda altın zemin;
    sağ üstte sporun adı (🥊 Boks, 🥋 Taekwondo…), altında vuruş sayısı (×2, ×3…). Güçlü vuruşta halka. Döner ve tornado
    tekmede kahraman gövdesinin ortasında döner (başı yere girmez). Uzaylı partnerde de aynı kombolar. [O] [A]
  - **Eskiyen torba** (velinin isteği, 2026-11-18: "vurdukça iyice eskisin, çalışmanın sonuna yaklaşılıyorsa kum da
    dökülmeye başlayabilir"): her oturum yeni torbayla başlar; sahneler ve oturumun ilerleyişiyle sürtük ve çizik, sonra
    solmuş ve turuncu yamalı, sonra gri bantla çarpı yapıştırılmış (dikişi atmış, şeridi kalkmış). Oturumun %70'inden sonra
    sağ altta yırtıktan kum sızar, %85'ten sonra dökülür; vuruşta kum saçılır, yerde yığın büyür (torba sallanırken akış
    gizli); kum ilk döküldüğü sahnenin sonunda "Eyvah, kum dökülüyor!". Eski torbada güçlü vuruşta toz çıkar. Uzaylıda
    eskime ve kum yok. [O] [A]
- **Bale** (velinin isteği, 2026-11-18: kızlar için; `army.js`, balletScene/danceGame, `profiles.train_style`): kum torbasının
  yerine küçük balerin. Kahramanı kız olan çocukta varsayılan, ötekilerde kum torbası; veli Günlük plan → "Kahraman"
  satırında Asker ya da Balerin seçer (öğrenci değiştiremez, test-train-style.sql). Balerin kahramanın
  ten, saç, göz rengi, gözlüğü ve çilleriyle çizilir; saç topuz, pembe mayo ve tütü, hep sevimli. Cevaptan sonra: doğruda
  piruet (pırıltılar), 3 doğru üst üste büyük sıçrama ("Büyük sıçrama!"), 5 ve üstü koreografi (piruet, sıçrama, arabesk,
  reverans; "Muhteşem ×5!"); yanlışta sendeler, pıt diye oturur, başında yıldızlar, kalkar ve "Hadi bir daha deneyelim!"
  (sırayla öteki sözler). Yalnızken sahnenin sağında bale barı; 70 numaradan sonra tütülü sevimli uzaylı dans partneri
  (onunla döner, alkışlar; düşüşte kıkırdar "Hihi!", el uzatıp kaldırır). [O] hesap ve çizimler, [A] ekran
  - **Uzaylıyla dans** (oturum ve uygulamadaki deneme sonunda, balerin çocukta 70'ten sonra, asker olana kadar): her 3 doğru
    bir tur (en çok 5). Uzaylı dansı gösterir (üstte oklar sırayla yanar), "Sıra sende!": çocuk yön tuşlarıyla ya da ekrandaki
    dört okla aynı sırayla basar; her doğru tuşta balerin o hareketi yapar (← → piruet, ↑ sıçrama, ↓ reverans), hepsi
    doğruysa dansın tamamını yapar, reverans eder, uzaylı alkışlar ("Bravo!"). Yanlışta sendeler, "Hadi bir daha
    deneyelim!", uzaylı yeniden gösterir; turda 3 hak, sonra "Bir dahaki tura!". İlk tur 3 hareket (3. sınıfa kadar 2), her
    turda bir fazla, en çok 6. Son: "Hepsini yaptın!" ya da "Dans bitti! 4 turun 3 tanesini yaptın."; "Atla". Kum torbasında,
    70'ten önce ve askerde kart yok. Hiçbir şey yazmaz. [O] hesap, [A] oyun (yanlış tuş, yön tuşları), oynamak [E]
- Kahramanın sayfasında asker kartı: asker değilken numara çubuğu ve 100'e kalan; askerken rütbe rozeti, sıradaki rütbeye
  kalan, bütün rütbeler; "Numara nasıl artar?". Besleme kapalı, asker kahraman açıksa sayfa kahramanı ve asker kartını
  gösterir (yemek rafı yok). Kahramanın kartında numara ya da rütbe satırı. İngilizce ve Klavye sayfalarındaki kahraman
  da numarasıyla ya da üniformasıyla çizilir. [A]
- Veli (Ayarlar → Günlük plan, besleme satırının altında; velinin isteği, 2026-11-18: "üstte kahraman olacak, içinde
  dropdownlarla balerin ya da asker seçilecek"): "Kahraman" başlığının yanında Kapalı / Asker / Balerin seçimi, çocuk
  başına; altında yalnızca seçilenin açıklaması, seçim değişince açıklama da değişir. 7. sınıfa kadar açık gelir (kahramanı
  kız olanda Balerin, ötekilerde Asker), sonrasında Kapalı. Kapatıp açmak numarayı silmez, kapatmak türü değiştirmez. Kol
  seçildiyse "Kolunu yeniden seçsin" (numara ve rütbe kalır). Altında şimdiki numara, kol ve rütbe. [A], kaydetme [E]
- **Uzaylı savaşı** (ikinci aşama, 2026-11-14): yalnızca asker olmuş (kolunu seçmiş) çocukta, oturum sonunda (konu ve
  hata tekrarı, ek çalışma, kitap, konu çalışması) sonuç kartının altında; uygulamadaki deneme bitince Net kartının altında.
  Asker değilken kart görünmez. Hiçbir şey kaydedilmez. [O] hesap, [A] oyun, oynamak [E]
  - Cephane: her doğru bir mermi; zor sorunun doğrusu el bombası (oturumda en çok 3, denemede 5). Zor soru: hata
    tekrarındaki soru ya da uzun soru (hedef süresi 2 dk ve üstü; 4. sınıfa kadar 1,5 dk ve üstü). 3 uzaylı ve her yanlış
    (boş dahil) için bir uzaylı daha (oturumda en çok 10, denemede 12). Başlangıç kartında sayılar ve "Savaşa başla!". [O]
  - Uzaylılar kolun yerine göre sandık ve kaya (kara), buzdağı (deniz), bulut (hava), asteroit (uzay) arkasına saklanır,
    yalnızca antenleri görünür. Başını çıkarınca dokunulursa vurulur: "POF!", gözü fırıldak, kaçış kapsülüyle uçar ("Pardon!").
    Saklanmışken atılan mermi boşa gider. El bombası düğmesi, sonra saklanma yerine dokunmak: orası patlar, arkasındakilerin
    hepsi kaçar. Uzaylılar ara ara jöle atar; çarparsa kahraman bir an sersemler (ölmez, yaralanmaz). 4. sınıfa kadar
    uzaylı daha uzun bakar, tek tek çıkar. [A], oyun [E]
  - Son: hepsi kovalanınca "Kovaladık, kaçtılar!" (artan mermi ve bomba yazar); mermi bitince kahraman geri çekilir,
    kalanlar kapsüllerle radara kaçar ("Daha çok doğru, daha çok mermi!"); 20 saniye dokunulmazsa ya da süre (oturum 1 dk,
    deneme 100 sn) bitince uzaylılar sıkılıp kaçar; "Atla" sonu yazar. Yeniden oynanmaz (cephane yalnızca sorulardan). [O]
  - Denemede ana gemi: küçük uzaylılar bitince kalkanı iner, 6 can (mermi 1, el bombası 3); yüzde 80 ve üstü doğruda
    "Süper bomba" tek seferde patlatır ("KABUM!"). Mermi biterse ana gemi kaçar. [O], oyun [E]
  - Radarda hata tekrarında bekleyen soru sayısı; hata tekrarı oturumunda "Radardaki uzaylılar geldi!". ABD'de hepsi
    İngilizce. [A]

**Klavye** (on parmak klavye, bilgisayarda) [A], ders [E]
- Alt menüde "Klavye" sekmesi, İngilizce'nin solunda. Yalnızca klavyeli cihazda (fare ya da dokunmatik yüzey varsa) görünür,
  telefonda görünmez. Aile isterse açar (Ayarlar → Günlük plan, açma düğmesi), her sınıfta (8. sınıf da); açılmadıysa
  kapalı. Açıkken günde kaç ders (varsayılan 2). [A]
- Ekranda Türkçe Q klavyenin bütün tuşları (62 tuş) parmak renkleriyle: serçe mor, yüzük mavi, orta yeşil, işaret turuncu.
  Üstünde iki el; F ve J'deki çıkıntı çizili. [A]
- Ders önce "İşaret parmaklarını F ve J'ye koy… Hazırsan F ve J'ye bas" der. [A]
  - Sonra yeni tuşlar tek tek gelir: "Yeni tuş: D · sol orta parmağın. D'ye üç kez bas".
  - Her harfte hangi parmağın hangi tuşa basacağı yazar. Tuş yanar, o parmak renklenip tuşa uzanır.
- "asas asas asas asas" gibi satırlar yazılır. Doğru yazdıkça alttaki satırda harf harf ışık yanar. [A]
  - Yanlışta harf kırmızı olur ve "Önce sağ serçe parmağınla ⌫ geri sil, sonra sol işaret parmağınla F'ye bas" gibi yazar.
  - ⌫ yanıp söner, sağ serçe parmak ona uzanır (on parmakta ⌫'nin doğru parmağı). Doğru harfin tuşu ve parmağı da yanar.
    ⌫'den başka tuş kabul edilmez.
- Bilgisayarda Türkçe ses varsa parmak ve tuş sesli de söylenir; "Sesli anlatım" düğmesiyle kapanır. [E]
- 22 ders. Her derste yalnızca öğrenilmiş harfler kullanılır. Bir ders, bir öncekinden üç yıldız alınca açılır (velinin
  isteği: önce iyice öğrensin); sonuçta "üç yıldız gerekiyor: bu derste en çok N yanlış" yazar. [O]
  - Orta sıra: F J, D K, S L, A Ş, G H, İ.
  - Üst sıra ve alt sıra.
  - Sonra hayvanlar, renkler ve sayılar, cümleler, İngilizce kelimeler.
- Ders sonunda gösterilenler: puan (harf sayısı eksi yanlış), doğruluk, dakikada kelime, en çok zorlandığı tuşlar. [O]
  - Doğruluk aşağı yuvarlanır.
  - Yıldız doğruluğa göredir: %95 üç (60 harflik derste en çok 3 yanlış), %90 iki, %75 bir.
  - "Tekrar dene" ve "Sonraki ders" düğmeleri var.
  - Yarıda bırakılan ders kaydedilmez; geri tuşu önce sorar.
- 🚀 **Kelime roketi** (oyun, velinin isteği; Klavye sayfasında "Oyna") [A], oyun [E]
  - Gece göğünden kelimeler düşer; alt kenarda beş ev. Kelimeler yalnızca en az bir yıldızla bitirdiği derslerin
    harflerinden (sırayla, ilk bitirmediği derse kadar), kelime azsa tuş alıştırmaları da. Açılmış ama yapmadığı dersin
    harfleri gelmez (velinin isteği, 2026-11-01). Hiç ders bitirmediyse "Oyna" yerine "İlk dersi (F ve J) bitirince oyun
    açılır". Ekrandaki kelimeler farklı harfle başlar. [O]
  - İlk harfe basınca çatıya en yakın o harfle başlayan kelime hedef olur; yazdıkça harfleri yeşillenir. Yönerge ve ekrandaki
    klavye sıradaki harfin tuşunu ve parmağını gösterir. Kelime bitince en yakın sağlam çatıdan roket kalkar, vurur (💥),
    puan = harf sayısı × seviye.
  - Patlama (velinin isteği, 2026-11-09: simge soldan sağa kayıyordu, daha hoş olsun): 💥 (süper kelimede 🌟, buzluda ❄️)
    kelimenin yerinde büyüyüp söner, kaymaz; çevresine bir halka yayılır, 8 renkli kıvılcım dört yana saçılır (süper kelimede
    gökkuşağı, buzluda buz mavisi). Süper silahın roketlerinin patlamaları daha büyük, 12 kıvılcımlı. Öteki simgeler (çatıya
    değince 💨, onarımda 🔨, makine eriyince 💧) de yerinde kalır. Hareketi azalt açıksa halka ve kıvılcım yok. [O]
  - Yanlış tuş hedefi bırakır, yazdıkları silinir ("O tuş değil, kelime baştan"); saha sallanır (velinin isteği: yanlıştan
    sonra kelimede takılı kalıyorlardı). Basılan harfle başlayan başka bir kelime varsa hemen o kelimeye geçer; başka
    kelimeye geçmek tek tuş, bu yanlış sayılmaz. ⌫ ya da Esc de hedefi bırakır.
  - Çatıya değen kelime çatıyı hırpalar: ilk darbede yara bandı 🩹, ikincide çatı uçar. Beş çatı da gidince oyun biter.
  - Gittikçe zorlaşır: her 6 kelimede bir seviye; düşüş 12 sn'den en az 2,5 sn'ye, iki kelime arası 3,2 sn'den en az 0,6 sn'ye
    (12. seviyeden sonra da hızlanır; velinin isteği, 2026-11-03: hızlı yazınca oyun hiç bitmiyordu, eskiden 4 sn ve 0,9 sn'de
    dururdu), ekranda en çok 7 kelime; kelimeler uzar (başta en çok 4 harf). İlk 10 seviye değişmedi. [O]
  - Her yeni seviyede bir çatı baştan sağlam olur (velinin isteği, 2026-11-02): önce uçmuş olan (çatı yerine iner, 🔨),
    yoksa hırpalanmış olan, eşitse soldaki. Şerit: "⭐ Seviye N! Bir çatı onarıldı." Çatılar sağlamsa "Kelimeler hızlanıyor". [O]
  - Süper kelime (velinin isteği, 2026-11-02): ilki 30. kelimede, sonra her 30–40 kelimede bir renkli, parlayan, 🌟'lı bir
    kelime düşer (velinin isteği: 8–12'de bir, sonra 15–20'de bir de çok sık geliyordu; 2026-11-03: oyun hiç bitmiyordu).
    Süper silah ateşlenince sonraki 10 kelimede süper ya da buzlu kelime gelmez. Biraz uzundur (başta 5–8, sonra 7–10 harf;
    ilk derslerde alıştırmalar yan yana) ve biraz yavaş düşer. Elinde dört süper silah varken ya da ekranda süper ya da buzlu
    kelime varken gelmez (bir seferde tek özel kelime). Çatıya değerse o da çatıyı hırpalar. [O]
  - Süper ya da buzlu kelime düşerken onun sütununa başka kelime düşmez (başka sağlam çatı yoksa düşer); kelimeler üst üste
    binerse özel kelime öbürlerinin, yazılan (hedef) kelime hepsinin üstünde görünür (velinin isteği, 2026-11-03: arkadan gelen
    hızlı kelimeler yavaş düşen özel kelimenin üstünü örtüyordu). Roketler ve 💥 en üstte. [O]
  - Süper kelimeyi vuran süper silah kazanır; silahlar dörde kadar birikir (velinin isteği, 2026-11-02). Elindekiler evlerin
    arasında soldan sağa dik duran, parlayan, ateşe hazır roketler olarak görünür. Sol üstte saydam "🌟 Süper silah hazır" rozeti
    (birden çoksa "2 süper silah hazır"; kelimelerin arkasında), yönergede "Ctrl'ye iki kez bas", ekrandaki klavyede iki Ctrl tuşu
    yanar. Ctrl'ye art arda iki kez basınca (en çok yarım saniye arayla, arada başka tuş yok) bir silah harcanır: en sağdaki hazır
    roket havalanıp kaybolur, ekrandaki kelimeler donar (yeşil); çatısına en yakın olandan başlayarak her birine evlerden sırayla
    büyük, parlak bir roket kalkar (velinin isteği, 2026-11-02), kelimeler büyük 💥 ile aşağıdan yukarı patlar, sonuncusunda
    gök bir an parlar ve şeritte "N kelime patladı" (seviye atladıysa seviye) yazar. Roketler yoldayken yeni kelime düşmez,
    basılan harf yanlış sayılmaz, Ctrl bir şey yapmaz. Her kelime vurulmuş sayılır (puan, seviye, çatı onarımı). Silah yokken
    "renkli kelimeyi vur", ekranda kelime yokken "silahın duruyor" der; silah harcanmaz. Roketlerin vurduğu süper ya da buzlu
    kelime (o da 💥 ile) patlar ama bir şey kazandırmaz: süper silah ve buz makinesi yalnızca kelimeyi yazana (velinin isteği,
    2026-11-03: patlamadan hemen sonra yeni silah ya da su sıkıcı geliyor, oyun hiç bitmiyordu). Oyundaki yardım yazısı da söyler.
  - Son çatı koruması (velinin isteği, 2026-11-02): yalnızca bir çatı kalmışken ona düşen kelime değmesine 0,8 saniye kalınca,
    elde süper silah varsa biri kendiliğinden ateşlenir (şerit: "🚨 Son çatı! Süper silah kendiliğinden ateşlendi."), roketler
    ekrandaki bütün kelimeleri vurur. Her seferinde yalnızca bir silah; kelimeler yine çok yaklaşınca sıradaki ateşlenir. Silah
    yoksa kelime çatıya değer. [O]
  - Buz makinesi (velinin isteği, 2026-11-02): oyun biraz hızlanınca (3. seviyeden sonra; ilki 3. seviyeden sonraki 11.
    kelimede, sonra makine yokken her 20–28 kelimede bir; velinin isteği, 2026-11-03: 3. kelimede ve 10–14'te bir çok sık
    geliyordu) buz mavisi, parlayan, ❄️'lı bir kelime düşer. Süper kelime gibi biraz uzundur ve biraz yavaş
    düşer. Makine varken ya da ekranda süper ya da buzlu kelime varken gelmez; ikisinin birden sırası gelirse önce süper kelime.
    Bir önceki buz makinesinin evine düşmez, başka sağlam çatı yoksa düşer (velinin isteği, 2026-11-02: makine hep aynı sütuna
    geliyordu). Onu yazıp vuranın kelimenin düştüğü çatısına buz makinesi takılır, uçtuysa en yakın sağlam çatıya (süper
    silahın roketleri patlatırsa makine gelmez).
    Şerit: "❄️ Buz makinesi takıldı: kelimeleri yavaşlatacak!" [O]
  - Makine çatının tepesinde buz mavisi bir kutudur (❄️, ağzı yukarıda, altındaki çizgi kalan buz). O çatının ve yanındaki bir
    çatının sütununu korur: yanındakilerden sağlam olanı; ikisi de sağlamsa hırpalanmış olanı, eşitse ortaya yakını. İki sütun
    gökyüzünde buğulu, kar yağan bir şeritle görünür. [O]
  - Yanındaki çatı uçarsa makine öbür yandaki sağlam çatının sütununa döner, şerit oraya kayar; şerit: "❄️ Buz makinesi öbür
    yana döndü!" (velinin isteği, 2026-11-03). Öbür yan yoksa (kenardaki ev) ya da o da uçmuşsa yerinde kalır; öbür yan sonra
    yeni seviyede onarılınca ona döner. Yan çatı hırpalanınca dönmez. Oyundaki yardım yazısı da söyler. [O]
  - Bu iki sütuna düşen kelimeye kendiliğinden buzlu su püskürtür: makineden kelimenin altına genişleyen kısa bir su huzmesi,
    kelimenin çevresinde kar. Kelime buz mavisi olur, köşesinde ❄️, yarı hızla düşer. Su, kar ve şerit kelimelerin arkasında
    kalır; kelimeyi örtmez (velinin isteği). Çatısına en yakın kelime önce; her kelime bir kez ıslanır, iki püskürtme arası
    0,6 sn. Roketi yolda olan kelimeye, çatısı uçmuş sütuna düşen (zararsız) kelimeye, süper silahın roketleri yoldayken ve
    oyun dururken püskürtmez. [O]
  - Makinede 8 buz var; bitince erir ("💧 Buz makinesinin buzu bitti."), yeni buzlu kelime 10–14 kelime sonra gelir. Çatısı
    uçarsa makine de gider ("💨 Çatı uçtu, buz makinesi de gitti."). [O]
  - Oyunda Ctrl'li kısayollar çalışmaz (Ctrl+R, Ctrl+P…); Ctrl+W ya da sayfayı yenileme tarayıcıda "çıkılsın mı?" sorar.
  - Bitişte puan, vurulan kelime, seviye, doğruluk, en iyi puan (bu tarayıcıda; "Yeni rekor!"), "Tekrar oyna".
    Rekor veritabanında (velinin isteği, 2026-11-16: tablet, telefon ve bilgisayarda aynı): her oyunun puanı oyun satırına
    yazılır (typing_results.score), rekor en yüksek puandır; en son 'oyun-sifir' satırından önceki oyunlar sayılmaz (biri
    çocuğun yerine oynadıysa o satır silinir ya da 'oyun-sifir' yazılır). Cihazdaki eski rekor bir kez silinir. Çocuk yalnız
    kendi puanını yazar, eksi ya da çok büyük puan yazılamaz (test-game-score.sql). [O], ekran [A]
  - Pencere arka plana geçince oyun durur, bir harfe basınca sürer. Geri tuşu önce sorar. Oyunun sonucu yalnızca bronz sayımı için kaydedilir
    (kahramanı besleme).
- Klavye kahramanı da büyütür. Kelime sayfası, mağaza ve rapor bunu sayar; güç arttıysa kutlama olur. Kahraman Klavye
  sayfasında da görünür. [O]
  - Her dersin en iyi yıldızı 1 güç verir; aynı dersi tekrarlamak şişirmez.
  - Her yeni yıldız 5 altın, günün dersleri bittiği her gün 5 altın.
- ABD öğrencisi (LANG 'en'; velinin isteği, 2026-11-10: ABD öğrencilerine Türkçe hiçbir şey gösterilmez). Türkçe dersler ve
  Türkçe öğrencinin ilerlemesi değişmedi. Elle deneme ABD test hesabıyla (ABD4 ya da ABD7). [O], ders ve oyun [E]
  - Ekrandaki klavye ABD klavyesi (US QWERTY, 61 tuş): ; ' , . / [ ] \ ` - = ABD yerlerinde, Enter tek sırada; Ş, Ğ, Ü, Ö,
    Ç, İ yok. Basılan tuş ABD yerine göre denetlenir: I tuşu i'dir (Türkçe Q'da ı). [O]
  - 20 İngilizce ders, aynı aşamalar: Home row (F J, D K, S L, A ;, G H), Top row (E I, R U, T Y, O W, P Q), Bottom row
    (V N, B M, C ve virgül, X ve nokta, Z), Words and sentences (hayvanlar, renkler ve sayılar, iki cümle dersi, okul ve ev).
    Her derste yalnızca öğrenilmiş harfler; Türkçe söz ve harf yok. [O]
  - İlerleme ayrı ders kimlikleriyle ("en-…"): Türkçe derslerin yıldızları ABD derslerini ve oyununu açmaz. Kahramana iki
    dersin yıldızları da sayılır. [O]
  - Yönerge ve sesli anlatım İngilizce: parmak adları ("left index finger"), "New key: E · left middle finger. Press it three
    times.", "Wrong key! First press ⌫ backspace with your right pinky, then…". İngilizce ses varsa (önce ABD İngilizcesi)
    sesli söylenir. Ders başlığı "Lesson 6 · E and I". [E]
  - Kelime roketinin kelimeleri bitirdiği ABD derslerinin İngilizce kelimeleri. [O]
  - Yazılacak satırlar, düşen kelimeler ve klavyenin tuş yazıları ekrandaki çeviriye girmez (translate="no").

**Okuduğum kitap** (ilkokul, Yükle sekmesi) [A], gönderme ve sorular [E]
- Çocuk okuduğu kitabın sayfalarını fotoğraflar. Genelde hikâye kitabı olur, ama her tür kitap gönderilebilir.
  - Kitap seçilir ya da yeni kitap eklenir: adı ve biliyorsa sınav tarihi.
  - Bölüm bölüm gönderilebilir. "Kitap bitti" notu yazılabilir.
- Görev sayfaları okur ve kitap başına en az 100 anlama sorusu yazar (`job/INSTRUCTIONS.md` 1f).
  - Sayfa sırasıyla yazar.
  - 1–3. sınıfa üç şık, 4. sınıfa dört şık.
- Sorular Bugün'de, Konu tekrarı kartının altında "📚 Kitap" satırında gelir. Ana sayfaya yeni kart eklenmez.
  - Her gün en az 10 soru gelir. Kalan sorular sınava kalan günlere bölünür; sınav tarihi yoksa günde 10.
  - Sorulardaki emin olma ölçeği burada da var. Kitap soruları günlük plandaki ders sayılarına girmez.
- Yanlış ya da "birlikte bakalım" denen soru hata tekrarına girer. Benzerleri kitabın aynı sayfalarından yazılır.
- Sınav tarihi geçince o kitaptan hiç soru gelmez, hata tekrarındaki soruları da gelmez.
  - Uygulama bu soruları atlar; görev de hata maddelerini bekletir.
  - Sınav tarihini sonradan yalnızca veli değiştirir.
- "Kitap okuma" konusu Konular sayfasında görünmez.

**Yanlışların nedeni** [E]
- Deneme yanlışlarında önce öğrenci nedenini seçer, sonra Claude'un yorumunu ve çözümü görür. Bitince açıldığı sayfaya döner.

**Birlikte bakılacaklar** [A]
- Boş geçtiği, tahmin ettiği ve "anlamadım" dediği sorular, ayrı sayfada.
- Veli ve öğretmende kartın kendisi "birlikte çöz" kartıdır (velinin isteği, 2026-11-10): cevap ve çözüm gizli, çocuk
  yanlarında çözer; sonra doğru/yanlış, ilk seçimi, çözüm (kapalı, dokununca açılır), "anladı mı?", benzer soru. Öğrenci
  kendi sayfasında cevabı ve çözümü görür. [A]

**Deneme sekmesi** [A], içindekiler [E]
- Gerçek LGS kitapçıkları (2024–2026, sözel ve sayısal). Bu sorular günlük tekrarda gelmez.
  - Kitapçıklar bütün yılın konularını kapsar. Bir kitapçık, bütün soruları aktarılınca ve hepsinin konusu işlenince görünür. [A]
  - O zamana kadar yerinde kısa bir not durur.
- Karma deneme: sözel ya da sayısal, ilkokulda 30 soru.
  - Yalnızca işlenen konulardan ve görülmemiş sorulardan gelir; konular LGS sıklığına göre seçilir.
  - Her başlayışta yeniden kurulur.
- Süre, "T (tahmin)" işareti, soru haritası, "Ara ver" ve devam, "Bitir".
- Sonuç ve net. Yanlış ve boşların hepsi hata tekrarına girer, konusu henüz işlenmemiş olsa da. Çözdüğün denemeler listesi.
  Listede her denemenin toplam neti, kaç soruda kaç doğru, yanlış ve boş yaptığı, birden çok ders varsa ders ders neti
  (velinin isteği, 2026-11-17).

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
- Son yüklemelerin durumu; her yüklemenin altında ne zaman gönderildiği ("Gönderildi 20 Kas 14:05"), işlendiyse ne zaman
  işlendiği ("· işlendi 20 Kas 15:02") (velinin isteği, 2026-11-20). [A]
- Gönder çubuğu hep ekranda, alt menünün üstünde durur; aşağı kaydırmak gerekmez. Düğmede fotoğraf sayısı yazar
  ("Gönder (3 fotoğraf)"), altında neyin eksik olduğu (velinin isteği, 2026-11-09: çocuklar aşağıdaki düğmeyi görmeyip
  başka düğmelere basıyor, fotoğraflar siliniyordu). Soru gönder, kâğıt deneme, okuduğum kitap ve velinin kitap sayfası
  sayfalarında aynı. [A]
- Gönderilmemiş fotoğraf varken sayfadan çıkılırsa (alt menü, geri tuşu, "← Geri", çocuk değiştirme, çıkış) pencere
  sorar; tarayıcının "Tamam / İptal" kutusu değil, her düğmesinde ne olacağı yazar: "Fotoğrafları gönder" (gönderilebiliyorsa,
  öne çıkar), "Sayfada kal", "Fotoğrafları sil ve çık". Gönderilemiyorsa neyin eksik olduğunu söyler; yükleme sürerken
  beklemesini söyler. Esc ve pencerenin dışı "Sayfada kal" sayılır. [A]
- Panodan yapıştırma çalışır.

**Konular** (öğrenci, Yükle'nin sağında; velinin isteği, 2026-11-01) [A]
- Salt okunur: öğrenci konuları görür, işaretleyemez. Konuları veli işaretler (velinin Konular sekmesi), yıllık plandaki
  haftası gelince kendiliğinden de açılır. Derse göre kartlar; işlenmeyen konu soluk ("Plan: tarih" ya da "Henüz işlenmedi").
  Üst sınıf konularından yalnızca velinin açtıkları görünür.
- İşlenen konuya dokununca konunun sayfası: durumu (eksik, takipteki yanlış, oturdu…), sıradaki konu tekrarı, varsa kısa
  anlatım, YouTube bağlantısı ve "Bu konudan N soru çöz".
- Konu çalışması: en fazla 10 soru, yalnızca o konudan. Önce hiç görmediği sorular (velinin seçimi), ama konunun 10 görülmemiş
  sorusu günlük tekrarlara kalır (konu ve hata tekrarı yalnızca görülmemiş soru alır; konu çalışması onları soru sıkıntısına
  düşürmez). Yetmezse daha önce hep doğru yaptıkları (en eskiden). Hata maddelerine ayrılmış benzerler ve kitap soruları
  gelmez. Soru kalmadıysa konunun sayfası yeni soruların hazırlandığını söyler. [O: `test-practice.mjs`]
  - Yanlış yaptığı (ya da "birlikte bakalım" dediği) soru hata tekrarına girer, ertesi gün benzeri gelir.
  - Konu tekrarının takvimi değişmez; cevaplar günlük plana sayılmaz (o gün günü gelen tekrarlar ertelenmez).
  - "Ara ver", geri tuşu ve oturum sonundaki "Konuya dön" konunun sayfasına döner. Raporda "konu çalışması" olarak görünür.
- Eksik konuların kısa anlatımı soru çözerken de açılır: o konunun sorusunda "Anlamadım" deyince ya da yardım isteyince,
  YouTube bağlantısının yanında "📖 Bu konunun kısa anlatımı". [E]

## Veli

**Rapor** [A], içindekiler [E]
- Sekmeye dokununca yalnızca o sekmenin bölümleri görünür; sekmelerle bölüm arasında başka kart yok (velinin isteği,
  2026-11-20: "Gün gün çalışmaya basınca yalnızca o görünsün"). Önceden sekmelerin üstünde her zaman duran kartlar taşındı:
  deneme kutusu Denemeler sekmesinin en üstünde; mesaj kutusu "Mesaj" sekmesinde (yalnız veli); birlikte bakılacaklar,
  soru varsa "Birlikte bakılacaklar (N)" sekmesinde (sarı çerçeveli). Sekme sırası: Gün gün çalışma · Birlikte
  bakılacaklar · Mesaj · Bildirdiği sorular · Denemeler · Zayıf konular · Son 14 gün · Yüklemeler · Kelime, Klavye, Kitap.
  Açılışta Gün gün çalışma (ya da en son seçilen sekme; o sekme artık yoksa Gün gün çalışma). [A]
  Hiçbir sekme boş kalmaz (velinin isteği, 2026-11-20: "burası boş"): Kelime · Klavye · Kitap'ta kelime kartı, klavye dersi
  ve kitap yoksa "Henüz kelime kartı, klavye dersi ya da okuduğu kitap yok." ve velide nereden açıldığı (ABD'de yalnızca
  klavye); Bildirdiği sorular'da bildirim ve şiir yoksa "Henüz … yok." [A]
  - Deneme kutusu (velinin isteği, 2026-11-10; dört özet kutusunun yerine): en son deneme açık gelir, açılır listeden öbür
    denemelere geçilir. Net, toplam doğru/yanlış/boş ve derse göre tablo; yanlış ya da boş sayısına dokununca o dersin o
    denemedeki soruları açılır (soru, cevabı ve doğrusu, çözüm, "Benzer sorularla dene"), yeniden dokununca kapanır.
    Eksik konu, bugün çözülen tekrar ve oturan konu sayısı altta tek satırda. [A] Altı yedi sekmeye ayrılmıştır (velinin isteği,
  2026-11-10; sayfa çok uzamıştı): Gün gün çalışma · Bildirdiği sorular (ve tamamladığı şiirler) · Denemeler (tablo,
  derslere ve soru tipine göre, kavram yanılgıları) · Zayıf konular (özel derste çalışılacaklar, derse göre gruplu zayıf
  konular ve "Yanlışlar nereden geliyor?") · Son 14 gün (ve önümüzdeki 7 gün) · Yüklemeler (ve saatlik görevin son çalışması) · Kelime, Klavye,
  Kitap. Seçilen sekme bu tarayıcıda hatırlanır. Hiçbir bölüm kaldırılmadı, yalnızca sekmelere taşındı. [A]
  Sekme düğmeleri başlığın hemen altında (velinin isteği, 2026-11-16: "en üste getir"), seçili sekmenin bölümleri hemen
  altlarında; sayfa aşağı kaymışken sekmeye dokununca sekmeler yeniden görünür. [A]
- Yüklemeler sekmesi: son altı yükleme, durumu ve görevin notu; her birinin altında ne zaman gönderildiği, işlendiyse ne
  zaman işlendiği ("Gönderildi 20 Kas 14:05 · işlendi 20 Kas 15:02"; velinin isteği, 2026-11-20). [A]
- Özet kutuları.
- "… mesaj bırak":
  - tatlı söz ya da şaka önerisi, imza;
  - bütün çocuklara gönderme;
  - okundu bilgisi, geri alma. Altında yalnızca son mesaj görünür: tarih, imza, "Okudu" ya da "Henüz okumadı" (velinin
    isteği, 2026-11-10; önceden son beş mesaj). [A]
- Birlikte bakılacaklar ("Birlikte baktık" ile listeden çıkar).
- **Birlikte çöz** (velinin isteği, 2026-11-10): yanlış sorunun açıldığı her yerde (deneme kutusu, derse göre yanlışlar,
  zayıf konunun soruları, Birlikte bakılacaklar, Gün gün; Sorular listesinde "Birlikte çöz" düğmesiyle) cevap ve çözüm
  önce gizlidir: şıklar düğmedir, çocuk soruyu velinin ya da öğretmeninin yanında yeniden çözer. Sonra doğru/yanlış, doğru
  cevap, ilk seferdeki seçimi (ya da boş bıraktığı) ve çözüm (kapalı, dokununca açılır) gelir; "Cevabı göster" çözmeden açar. Ardından "Anladı mı?":
  "Anladım" benzer soruyu aynı kartta sorar, "Anlamadım" konuya birlikte bakmayı önerir (benzer soru düğmesi yine durur).
  Doğru yaparsa "anladı mı?" sorulmaz: "Bu sefer doğru. Benzer bir soruyla pekiştirelim mi?" ve "Benzer soru gelsin" /
  "Yeter" (velinin sorusu, 2026-11-10).
  Yeniden çözüm havuzdaki soruysa 'check' tarzıyla kaydedilir (doğruysa bronz), hata tekrarına yeniden girmez. Kâğıt
  denemenin fotoğrafında yalnız A–D harfleri. Öğrencide yok. [A]
  Deneme sorusunun yorumu (nerede takıldığı, "Dikkat:" yanılgısı) cevap açılınca kartta "Yorum" olarak görünür (velinin
  isteği, 2026-11-11); Sorular listesinde yorum kartın üstünde zaten olduğu için kartta tekrar çıkmaz. [A]
  - **Kim çözüyor** (velinin isteği, 2026-11-16: "Veli mi öğrenci mi, sonra datalar bozulmasın"): havuzdaki soruda şıkka
    ilk dokunuşta "Bu soruyu kim çözüyor?": "Öğrenci (ad) çözüyor" ya da "Veli deniyor (kaydedilmez)" (öğretmende
    "Öğretmen deniyor"). Veli denerse hiçbir şey kaydedilmez: cevap, bronz, numara yok; benzer sorularda da hata tekrarı
    açılmaz, hepsi doğru olsa da "birlikte bakıldı" işaretlenmez; kartta "kaydedilmedi". Seçim o öğrenci için oturum boyunca
    hatırlanır; kartın üstünde "Çözen: …" ve "Değiştir". [A]
- **Özel ders notları kaybolmaz** (velinin isteği, 2026-11-11: "bu güzel notu kaldırmış olabilir miyiz?"). Eksik konu
  tekrarlarda düzelip "Özel derste çalışılacaklar"dan çıkınca not ve konu anlatımı silinmez: Rapor → Zayıf konular'da
  "Önceki özel ders notları" bölümünde (açılır kutular, ne zaman eksik konu olduğu), zayıf konu kartında ve velinin konu
  sayfasında ("📝 Özel ders notu") durur. Öğrencinin "Anlamadım"ında konu anlatımı kapanan konuda da açılır. [A]
- **Benzer sorularla dene** (velinin isteği, 2026-11-09; artık Birlikte çöz kartının içinde "Anladım" deyince açılır): çocuk yanlış yaptığı soruyu "anladım" deyince veli birkaç benzer
  soruyla dener. Sorular sekmesinde kaçırdığı her sorunun, Birlikte bakılacaklar'daki her sorunun ve raporda zayıf konunun
  yanlış sorularının altında düğme. Veli ve öğretmen (öğretmen kendi dersinde; velinin isteği, 2026-11-09: öğrenci öğretmen
  eşliğinde çözebilsin, `teacher-check.sql`); öğrencide yok. [A]
  - En fazla üç soru gelir, hepsi çocuğun görmediği: önce o sorudan yazılmış benzerler ("Bu sorudan yazıldı"), sonra aynı
    kaynağın kardeş soruları, sonra aynı tarzda, sonra konunun öbür soruları. Kitap soruları gelmez. [O]
  - Çocuk velinin ekranında şıkkı seçer; doğru ya da yanlış ve çözüm hemen görünür, "Sonraki benzer soru". Sonunda "3 benzer
    sorudan 2 tanesini doğru yaptı". [E]
  - Cevaplar çocuğun adına "Veli/öğretmen denemesi" olarak kaydedilir: soru görülmüş sayılır, günlük plana ve ikramiye sayımına
    girmez (doğrusu bronz kazandırır). Yanlış yapılan benzer soru yarın hata tekrarına girer. [E]
  - Birlikte bakılacaklar'da hepsini doğru yaparsa soru kendiliğinden "birlikte bakıldı" olur. [E]
  - Görmediği benzer soru yoksa "benzer soru kalmadı" notu çıkar. [A]
- Gün gün çalışma: konu konu doğru ve yanlış, süre, "anladı mı?".
  - Tablodaki doğru ya da yanlış sayısına dokununca o konunun o günkü soruları tablonun hemen altında açılır: saat, tür,
    emin olma, süre ve sorunun kendisi birlikte çöz kartı olarak (cevap ve çözüm gizli; "Cevabı göster" seçimi, doğru
    cevabı ve çözümü açar; velinin isteği, 2026-11-10: soru cevabıyla açık geliyordu). Aynı sayıya yeniden dokunmak ya da
    "Kapat" kapatır (velinin isteği, 2026-11-09: sayılara basınca soru gelmiyordu). "Yanlışlarını anladı mı?" listesindeki
    "Soruyu göster" de aynı kartı açar. [A]
  - "Yanlışlarını anladı mı?" listesi derse göre grupludur: her dersin başlığı ("Türkçe · 3 yanlış") ve altında o dersin
    yanlışları; dersler öğrencinin ders sırasıyla, ders içinde çözdüğü saate göre (velinin isteği, 2026-11-09). [A]
- Bildirdiği sorular (kendi açıklamasıyla) ve tamamladığı şiirler.
- Kelime kartları kutusu:
  - bugün, son 7 günün doğru oranı;
  - öğrendiği ve zorlandığı kelimeler;
  - hiç kart çözmediyse görünmez. [E]
- Klavye dersleri kutusu:
  - bitirdiği dersler, yıldızlar, bugün kaç ders;
  - son ders (doğruluk ve hız), son 7 günde en çok zorlandığı tuşlar;
  - hiç ders yoksa görünmez. [E]
- Okuduğu kitaplar kutusu:
  - sayfa sayısı, hazır soru, çözdüğü soru ve doğru oranı;
  - "Sorular hazırlanıyor" ve "Sınavı geçti" etiketleri;
  - veli sınav tarihini buradan değiştirir;
  - hiç kitap yoksa görünmez. [E]
- Denemeler tablosu, özel derste çalışılacaklar (eksik konu notu, YouTube), zayıf konular.
  - Zayıf konu kartında "Yanlış soruları göster (N)": son 30 günün tekrarlarında yanlış yaptığı ve denemelerde yanlış ya da
    boş bıraktığı sorular kartın altında, soru metni, şıklar (seçimi ve doğrusu işaretli), deneme fotoğrafı ve çözümle
    açılır; velide her sorunun altında "Benzer sorularla dene". Yeniden dokununca kapanır (velinin isteği, 2026-11-09:
    öğretmeniyle üstünden geçebilsinler). [A]
- Yanlışların nereden geldiği, derslere göre, soru tipine göre, kavram yanılgıları.
  - "Derslere göre yanlış ve boş" çubuğunun sayısına dokununca o dersin denemelerdeki yanlış ve boş soruları konuya göre
    gruplu, en yeniden eskiye açılır (deneme adı, soru no, tarih, soru, cevabı ve doğrusu, çözüm, "Benzer sorularla dene").
    Yeniden dokununca kapanır (velinin isteği, 2026-11-10). [A]
- Son 14 gün, önümüzdeki 7 gün, yüklemeler ve saatlik görevin en son çalıştığı saat.
- **Yanlışlar hangi konulardan geliyor?** (velinin isteği, 2026-11-21: "hangi derste yanlışlar hangi konulardan gelmiş, grafikli…
  öğretmenleri görsün"; `docs/export.js`, missChart): Zayıf konular sekmesinin en üstünde. Her ders için toplam çubuğu, altında
  konuları çoktan aza (ders başına en çok 8, kalanı tek satırda "ve N konu daha"); çubuk yanlış (kırmızı), boş (sarı) ve
  tahminle doğru (mavi) diye bölünür. Son 30 günün tekrarları ve bütün denemeler; uygulamadaki denemenin cevapları iki kez
  sayılmaz. Öğretmen yalnızca kendi derslerini görür. Altında "Bu soruları yazdır ya da Excel'e aktar". [O] sayım, [A]
- **Yazdır ve Excel** (velinin isteği, 2026-11-21: "bilemediği soruların print'ini alabilir miyiz? okulda öğretmenine sormak
  istiyor, excel butonu lazım"; `docs/export.js`, 'cikti' sayfası): "Öğretmene sorulacak sorular". Öğrenci, veli ve öğretmen açar:
  öğrencide Konular'ın başından ve Birlikte bakılacaklar'dan; velide ve öğretmende Sorular'ın başından, Birlikte bakılacaklar
  kutusundan ve sayfasından, Zayıf konular'daki grafiğin altından. [A]
  - Sorular: seçilen dönemde (son 7 / 30 / 90 gün, açılışta 30) yanlış yaptığı, boş bıraktığı ve tahminle doğru yaptığı
    sorular; tekrarlar ve denemeler birlikte, en yeni üstte, aynı soru bir kez. Süzme: "Bütün yanlış ve boşlar" ya da
    "Yalnızca birlikte bakılacaklar" (Birlikte bakılacaklar'dan gelince bu seçili), ders. Üstte aynı konu grafiği (bütün
    konularıyla). Her soruda dersi, konusu, görseli, metni, şıkları, işaretlediği şık, nereden geldiği ve tarihi. "Doğru
    cevapları ve çözümleri de ekle" işaretlenirse doğru şık ve çözüm de görünür (açılışta kapalı). [A]
  - "Yazdır": görseller indikten sonra (en çok 8 sn bekler) tarayıcının yazdırma penceresi; kâğıtta menü, üst çubuk, süzme
    düğmeleri yok, başta öğrencinin adı, sınıfı ve dönem, sorular sayfa ortasında bölünmez, koyu temada da açık renk. Kâğıda
    en yeni 60 soru çıkar (fazlası sayının yanında yazar). [A] pencerenin açılması, kâğıt [E]
  - "Excel'e aktar": gerçek bir .xlsx dosyası iner (`telafio-sorular-<tarih>.xlsx`; ek kütüphane yok). "Sorular" sayfası: No,
    Tarih, Ders, Konu, Nereden, Durum, Soru, A–D, İşaretlediği, (işaretliyse Doğru cevap ve Çözüm), boş "Öğretmenin notu"
    sütunu; bütün sorular (60 sınırı yok); görselli soruda görselin çıktıda olduğu yazar. "Konu özeti" sayfası: derse ve
    konuya göre yanlış, boş, tahminle doğru, toplam. Başlık satırı kalın ve dondurulmuş. ABD'de hepsi İngilizce. [O] dosyanın
    yapısı, [A] satır sayısı, dosyayı Excel'de açmak [E]
  - Hiçbir şey kaydetmez; soru yoksa "Bu seçimde soru yok", düğmeler kapalı. [A]

**Diğer sayfalar**
- Sorular sayfası. [A]
- Konular: işlendi ya da işlenmedi işaretleme (yalnızca veli; "Bu konuları okulda işlediniz mi?" sorusu da burada). LGS
  sıklığı bilgisi, seyrek konu düğmesi, bir üst sınıfın konuları. [E]
- Deneme yükleme (çocuk için) ve kitap sayfası ekleme (ortak soru havuzu). [E]
- Çocuk değiştirme (üst çubukta). [E]

**Ayarlar** [E]
- Ders ders günlük soru sayısı; bugün ve son 7 günde harcanan süre; madde başına bir soruyla bile sınırı aşan hata tekrarı
  varsa uyarı ve "X yap".
- İngilizce (kelime kartları) ve Klavye dersleri: aile isterse açar, her sınıfta; açma düğmesi ve açıkken günde kaç kart ya
  da ders. Kapalıyken çocuğun sekmesi görünmez. Ders sayılarından ayrı satırlarda; kelimede bugün kaç kart çözdüğü. [A]
- Sınıf (1–8), bir üst sınıfın konuları, LGS tarihi (8. sınıf).
  - Veli sınıfı değiştirince hemen geçerli olur (velinin isteği, 2026-11-10; `supabase/set-student-grade.sql`): eski
    sınıfın konu tekrarları durur, yeni sınıfın haftası gelmiş konuları açılır, eski sınıfa dönülünce duranlar kaldığı yerden
    devam eder. Yalnızca velisi değiştirebilir; çocuk ve öğretmen değiştiremez. [O] (`test-set-grade.sql`), [A]
- Seyrek konu katsayısı: 1, 1,5, 2, 3 ya da 0 (tekrar etme).
- Aile:
  - çocuk ekleme ve silme (silmede adını yazarak onay);
  - veli ekleme;
  - öğretmen bağlama (ders seçerek);
  - 🦸 Kelime kahramanı (İngilizce, Klavye ya da kahramanı besleme açık her çocuk). Kız ya da erkek, ten, yüz şekli, saç rengi, saç modeli
    (kısa, kısa perçemli, yana taralı, kıvırcık, uzun, örgülü, at kuyruğu, kâküllü), kaş, göz rengi ve şekli, burun, gülüş,
    kulak, gözlük, çil seçilir; önizleme hemen değişir; Kaydet, Sıfırla.
  - Vesikalık fotoğraf yüklenir; saatlik iş bir saat içinde kahramanı ona benzetir, yine çizgi karakter kalır. Fotoğrafı
    yalnızca veliler görür; benzetildikten sonra "Fotoğrafı sil".

## Öğretmen [A], içindekiler [E]
- Sadece velinin açtığı çocukları ve kendi derslerini görür; salt okunur.
- Birlikte bakılacaklarda kendi derslerinin sorularını "Birlikte baktık" yapar.

## Saatlik görev (`job/INSTRUCTIONS.md`) [E: görev raporu ve sonuçlar]
- Haftası gelen konuları açar.
- Kâğıt denemeleri notlandırır: teşhis, kırpılmış soru, konu durumu, hata maddeleri.
- Kitap sayfalarından havuza soru ekler. Öğrencinin gönderdiği soruları işler (1e).
- Okuduğu kitabın sayfalarından anlama soruları yazar (1f). Sınavı geçmiş kitabın hata maddelerini bekletir (1c).
- Velinin yüklediği vesikalık fotoğrafa bakıp kahramanın görünüşünü yazar (1g); kahraman sevimli kalır. Fotoğrafı tarif
  etmez, kopyalamaz, silmez.
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
- Kelime kahramanı (`test-hero.sql`):
  - çocuk alışverişini (araç ya da eşya) kendisi yapar, aynı şeyi iki kez alamaz, kardeşi adına alamaz;
  - kahramanın kız ya da erkek oluşunu ve görünüşünü veli seçer, çocuk değiştiremez;
  - alışverişi veli ve İngilizce öğretmeni görür;
  - vesikalık fotoğrafı yalnızca çocuğun velileri yükler ve görür; çocuk, kardeş ve öğretmen göremez.
- Konu durumunun geçmişi (`test-topic-status-log.sql`; velinin isteği, 2026-11-09): bir konunun durumu değişince kimin
  değiştirdiği kayda yazılır (öğrenci, veli, öğretmen ya da takvim; girişsiz değişiklik takvim sayılır). Aynı durum yeniden
  yazılınca kayıt eklenmez. Kaydı çocuk, veli ve kardeş okuyamaz; ileride konuların gerçekte hangi hafta işlendiğini
  çıkarmak için birikir. Uygulamada görünen bir şey değişmez.
- Öğretmenin benzer soru denemesi (`test-teacher-check.sql`): öğretmen kendi dersinde öğrencisi adına yalnızca "veli/öğretmen
  denemesi" cevabı ve ondan doğan hata maddesi yazar; başka tarzda cevap, başka dersin sorusu, başka öğrenci yazamaz; cevabı
  değiştiremez.
- Kahramanı besleme (`test-hero-feed.sql`):
  - çocuk kahramanına kendisi yedirir, kardeşi adına yediremez; besleme ayarını ve açlığı dondurmayı veli seçer, çocuk
    değiştiremez;
  - yemekleri ve bronz sayımını çocuk ve velisi görür; öğretmen ve kardeş göremez.
- Asker kahraman (`test-hero-army.sql`):
  - çocuk açma ayarını ve kolunu doğrudan değiştiremez; numarası 100 olmadan, kapalıyken, başka ülkenin kolunu ya da
    ikinci kez kol seçemez; 100 olunca ülkesine uygun kolu bir kez seçer;
  - numarayı çocuk ve velisi görür, öğretmen ve kardeş göremez; veli kolu yalnızca sıfırlar (bir kol yazamaz), açma
    ayarını o değiştirir; öğretmen sıfırlayamaz; numaranın hesabı (800 hata tekrarı + 400 öteki doğru = 100).
- Okuduğu kitap:
  - çocuk kendi kitabını ekler ve sayfalarını gönderir, kardeşi adına ekleyemez;
  - sınav tarihini sonradan yalnızca veli değiştirir;
  - veli ve Türkçe öğretmeni görür; başka öğretmen ve kardeş göremez (`test-books.sql`).
- Klavye dersleri (`test-typing.sql`):
  - çocuk kendi ders sonucunu yazar, kardeşi adına yazamaz;
  - günlük ders sayısını veli seçer, çocuk değiştiremez;
  - sonucu çocuk ve velisi görür; öğretmen ve kardeş göremez.
- Kelime kartları:
  - çocuk kendi kutusunu ve cevabını yazar, kardeşi adına yazamaz;
  - günlük sayıyı veli ayarlar, çocuk değiştiremez;
  - veli ve İngilizce öğretmeni okur; başka öğretmen ve kardeş göremez.
- Abonelik (`test-subscriptions.sql`; velinin isteği, 2026-11-16): abonelik bir veliye yazılır; o velinin veli bağıyla bağlı
  çocukları ve çocukların öteki velisi aynı plandadır (`my_plan()`: 'family' ya da 'free'), öğretmen bağı plan taşımaz,
  süresi biten abonelik sayılmaz. Satırı yalnızca gizli anahtar yazar: çocuk da veli de yazamaz; veli yalnız kendi satırını
  görür, çocuk ve başka veli hiçbir satır görmez. Uygulama planı henüz okumuyor; hiçbir kısıt bağlı değil.
- Aile dışından biri hiçbir şey görmez.
- Test araçları şifresiz giriş bağlantısını yalnızca test hesaplarına üretir (IrfTest, test4.sinif, Test Veli, Test Öğretmen).
  Başka bir ad ya da adres verilirse durur, Supabase'e hiç gitmez; hesap açılmaz.
