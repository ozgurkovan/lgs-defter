// Arayüz duman testi. Giriş yapılmış bir TEST hesabıyla (IrfTest, test4.sinif, test velisi ya da test öğretmeni) uygulama sayfasında çalışır:
// tarayıcı bölmesinin JavaScript aracına bu dosyanın içeriği verilir ya da tarayıcı konsoluna yapıştırılır.
// Rolün bütün sayfalarını açar; hata kutusu, eksik bölüm, eksik ya da fazladan "← Geri" ve geri tuşu davranışını
// raporlar. Veritabanına hiçbir şey yazmaz: soru cevaplamaz, kaydetmez; açtığı deneme telefondan silinir.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function settle() {
    await wait(250);
    for (let i = 0; i < 80 && document.querySelector('#app .boot'); i++) await wait(150);
    await wait(500);
  }
  const pageText = () => document.getElementById('app').innerText.toLocaleLowerCase('tr');
  const errors = [];
  const onErr = (e) => errors.push(String(e.message || e.reason?.message || e.reason || e));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const realConfirm = window.confirm;
  window.confirm = () => true; // geri tuşunun "çıkılsın mı?" sorusuna evet
  const results = [];
  const check = (name, ok, detail = '') => results.push(`${ok ? 'OK  ' : 'HATA'} ${name}${detail ? ` (${detail})` : ''}`);
  try {
    const role = state.profile.role;
    const root = rootTab();
    const pages = role === 'student'
      ? { home: ['hata tekrarı', 'konu tekrarı'], upload: ['deneme çöz', 'karma deneme'], send: ['soru ekle', 'kâğıt deneme'],
          ask: ['yapamadığım sorular', 'beğendiğim sorular', 'kalemle'], paper: ['hangi deneme?'], settings: [], together: ['birlikte bakılacaklar'] }
      : role === 'parent'
        ? { report: ['gün gün çalışma', 'denemeler', 'mesaj bırak'], questions: [], topics: [], upload: ['hangi deneme?', 'kitap sayfası ekle'],
            book: ['kitap sayfası ekle', 'sayfalar'], settings: ['günlük plan', 'aile', 'kelime kartları', 'klavye dersleri', 'kelime kahramanı'], together: ['birlikte bakılacaklar'] }
        : { report: ['gün gün çalışma', 'denemeler'], questions: [], topics: [], settings: [], together: ['birlikte bakılacaklar'] };
    if (role === 'student' && wordsPerDay(state.student) > 0) {
      pages.words = ['kelime kartları', 'güç', 'mağaza'];
      pages.shop = ['mağaza', 'kelime altını', 'yolculuk araçları', 'dünyanı süsle'];
    }
    // Klavye dersleri: klavyeli cihazda (bu tarayıcı bölmesi) sekmesi olan öğrencide.
    const typingTab = role === 'student' && typingPerDay(state.student) > 0 && hasKeyboard();
    if (typingTab) pages.typing = ['on parmak klavye', 'orta sıra', 'kelimeler ve cümleler', 'başla: ders'];
    // İlkokul: okuduğu kitabın sayfaları Yükle sekmesinden gönderilir.
    if (role === 'student' && (state.student?.grade || 8) <= 4) {
      pages.send = [...pages.send, 'okuduğum kitap'];
      pages.read = ['kitap sayfalarını gönder', 'hangi kitap?', 'kitabın sayfaları'];
    }
    // Öğretmen mesaj bırakamaz, aileyi yönetemez.
    if (role === 'teacher') {
      go('report'); await settle();
      check('Öğretmende mesaj kutusu yok', !pageText().includes('mesaj bırak'));
    }
    for (const [tab, must] of Object.entries(pages)) {
      go(tab); await settle();
      const t = pageText();
      const broken = t.includes('bir şey ters gitti');
      const missing = must.filter((m) => !t.includes(m));
      const back = !!document.querySelector('.topbar .back');
      const wantBack = tab !== root || navDepth() > 0;
      check(`Sayfa: ${tab}`, state.tab === tab && !broken && !missing.length && back === wantBack,
        [state.tab !== tab && `açılan ${state.tab}`, broken && 'hata kutusu', missing.length && 'eksik: ' + missing.join(', '),
          back !== wantBack && (back ? 'fazladan Geri' : 'Geri yok')].filter(Boolean).join('; '));
    }

    // Konuları veli işaretler, yıllık plana göre kendiliğinden de açılır; öğrencide Konularım yok, adresle de açılmaz.
    if (role === 'student') {
      const noTab = ![...document.querySelectorAll('nav.tabs button')].some((x) => /Konular/.test(x.textContent));
      go('topics'); await settle();
      check('Konularım öğrencide yok', noTab && state.tab === 'home', `açılan ${state.tab}`);
    }

    // Klavye sekmesi yalnızca dersleri açık öğrencide (ilkokulda varsayılan açık, sonrasında veli açar).
    if (role === 'student' && !typingTab) {
      check('Klavye sekmesi kapalıyken görünmez', ![...document.querySelectorAll('nav.tabs button')].some((x) => x.textContent.trim() === 'Klavye'));
    }

    // Okuduğum kitap yalnızca ilkokulda.
    if (role === 'student' && (state.student?.grade || 8) > 4) {
      go('send'); await settle();
      check('İlkokul dışında "Okuduğum kitap" görünmez', !pageText().includes('okuduğum kitap'));
    }

    // Kelime kahramanı İngilizce sayfasında çizilir, altında yolculuk çubuğu. Araçların pencereleri sayfaya eklenmeden
    // çizilir; aracı yoksa pencere yok. Büyük ödül kutlaması açılır, "Yola çık!" kapatır. Hiçbir şey yazılmaz.
    if (role === 'student' && wordsPerDay(state.student) > 0) {
      go('words'); await settle();
      check('Kelime kahramanı ve yolculuk çubuğu çizilir', !!document.querySelector('.hero-scene svg.hero') && !!document.querySelector('.trip .trip-road'));
      const all = new Set(HERO_RIDES.map(([id]) => id));
      const seen = [[2, new Set(['araba'])], [5, new Set(['araba', 'denizalti'])], [7, new Set(['araba', 'denizalti', 'hovercraft'])], [8, all], [9, all], [10, all]]
        .map(([lv, own]) => rideWindow(lv, own)?.className.replace('ride-window ride-', '') || 'yok');
      check('Araç pencereleri sırayla', seen.join() === 'araba,denizalti,hovercraft,ucak,roket,roket' && rideWindow(2, new Set()) === null, seen.join(', '));
      rideParty(HERO_SHOP[0], 3, 4); await wait(50);
      const party = !!document.querySelector('.party .party-ride');
      document.querySelector('.party button')?.click(); await settle();
      check('Büyük ödül kutlaması açılır ve kapanır', party && !document.querySelector('.party') && state.tab === 'words');
    }

    // Kelime kartlarının sekmesi "İngilizce" adıyla Ayarlar'ın hemen solunda (velinin isteği).
    if (role === 'student' && wordsPerDay(state.student) > 0) {
      go(root); await settle();
      const labels = [...document.querySelectorAll('nav.tabs button')].map((x) => x.textContent.trim());
      check('İngilizce sekmesi Ayarlar\'ın solunda', labels.at(-2) === 'İngilizce' && labels.at(-1) === 'Ayarlar', labels.join(', '));
      if (typingTab) check('Klavye sekmesi İngilizce\'nin solunda', labels.at(-3) === 'Klavye', labels.join(', '));
    }

    // Klavye dersi: ders soru çözme gibi açılır (alt menü gizli), ekranda bütün tuşlar ve eller. F ve J'ye basınca yeni
    // tuşlar tanıtılır; doğru harf alttaki satırda yanar; yanlışta ⌫ yanıp söner, sağ serçe parmak ona uzanır; ⌫ siler.
    // Geri tuşu önce sorar, Klavye sayfasına döner. Ders bitmediği için hiçbir şey yazılmaz.
    if (typingTab) {
      go('typing'); await settle();
      [...document.querySelectorAll('#app button.primary')].find((x) => x.textContent.startsWith('Başla: Ders'))?.click(); await wait(200);
      const r = state.session;
      const key = (k, c) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true, cancelable: true }));
      const opened = r?.track === 'typing' && history.state?.overlay === 'session' && !document.querySelector('nav.tabs')
        && document.querySelectorAll('.kb .k').length === 62 && /F ve J/.test(document.querySelector('.ty-guide')?.textContent || '');
      key('f', 'KeyF'); key('j', 'KeyJ');
      const intro = r?.phase === 'intro';
      while (r && r.phase === 'intro') { const ch = r.intro[r.ii]; key(ch, TQ_KEY[ch]); }
      for (let i = 0; i < 3 && r; i++) { const ch = r.lines[0][r.pos]; key(ch, TQ_KEY[ch]); }
      const lit = document.querySelectorAll('.ty-typed .lit').length === 3;
      const wrong = r && [...'qzx'].find((c) => c !== r.lines[0][r.pos]);
      key(wrong, TQ_KEY[wrong]);
      const erase = !!document.querySelector('.kb .k.erase') && /⌫/.test(document.querySelector('.ty-guide')?.textContent || '') && !!document.querySelector('.ty-typed .bad');
      key('Backspace', 'Backspace');
      const cleared = !r?.err && !document.querySelector('.kb .k.erase');
      history.back(); await settle();
      check('Klavye dersi: tuşlar ve eller, F-J ile başlar, doğru harf yanar, yanlışta ⌫ gösterilir, geri tuşu Klavye sayfasına döner',
        opened && intro && lit && erase && cleared && !state.session && state.tab === 'typing' && !history.state?.overlay,
        [!opened && 'açılmadı', !intro && 'tanıtım yok', !lit && 'satır yanmadı', !erase && '⌫ yok', !cleared && 'silinmedi'].filter(Boolean).join('; '));
    }

    // Günlük plan: İngilizce ve Klavye'yi aile açar (açma düğmeleri).
    if (role === 'parent') {
      go('settings'); await settle();
      let sw = [];
      for (let i = 0; i < 40 && (sw = ['Kelime kartları (İngilizce sekmesi) açık', 'Klavye dersleri (Klavye sekmesi) açık']
        .map((l) => document.querySelector(`input[aria-label="${l}"]`))).some((x) => !x); i++) await wait(150);
      check('Günlük plan: İngilizce ve Klavye açma düğmeleri', sw.every(Boolean), sw.map((x) => (x ? (x.checked ? 'açık' : 'kapalı') : 'yok')).join(', '));
    }

    // Aile: kelime kartları açık çocuğun kahramanının görünüşü açılır, seçim önizlemeyi değiştirir (kaydedilmez).
    if (role === 'parent') {
      go('settings'); await settle();
      let det = null; // Aile listesi sunucudan ayrıca gelir
      for (let i = 0; i < 50 && !(det = document.querySelector('details.hero-edit')); i++) await wait(150);
      if (det) {
        det.open = true;
        for (let i = 0; i < 40 && !det.querySelector('.hero-preview svg'); i++) await wait(150);
        const swatches = det.querySelectorAll('.swatch').length, chips = det.querySelectorAll('.chip').length;
        const before = det.querySelector('.hero-preview')?.innerHTML;
        det.querySelectorAll('.swatch')[5]?.click();
        const changed = !!before && det.querySelector('.hero-preview').innerHTML !== before;
        check('Aile: kahramanın görünüşü açılır, seçim önizlemeyi değiştirir', swatches === 19 && chips === 9 && changed && /fotoğraf/i.test(det.innerText),
          `renk ${swatches}, seçenek ${chips}, değişti ${changed}`);
        det.open = false;
      } else check('Aile: kahramanın görünüşü', false, 'kelime kartları açık çocuk yok');
    }

    // Geri: tarayıcı tuşu da üst çubuktaki düğme de bir önceki sayfaya döner.
    const [a, b] = role === 'student' ? ['send', 'settings'] : ['questions', 'topics'];
    go(a); await settle(); go(b); await settle();
    history.back(); await settle();
    check('Tarayıcı geri tuşu önceki sayfaya döner', state.tab === a, `şu an ${state.tab}`);
    go(b); await settle();
    document.querySelector('.topbar .back')?.click(); await settle();
    check('Üst çubuktaki ← Geri önceki sayfaya döner', state.tab === a, `şu an ${state.tab}`);
    const d = navDepth(); go(a); await settle();
    check('Aynı sayfayı yeniden açmak geçmişe kayıt eklemez', navDepth() === d, `derinlik ${d} → ${navDepth()}`);

    if (role === 'student') {
      go('home'); await settle();
      // Soru çözerken geri tuşu: önce sorar (burada evet), ana sayfaya döner. Soru cevaplanmadığı için hiçbir şey yazılmaz.
      const s = state.cache?.topic?.entries?.length ? state.cache.topic : state.cache?.mistake;
      if (s?.entries?.length) {
        runSession('topic', s); await settle();
        const inSession = !!state.session && history.state?.overlay === 'session' && !document.querySelector('nav.tabs');
        history.back(); await settle();
        check('Soru çözerken geri tuşu ana sayfaya döner', inSession && !state.session && state.tab === 'home' && !history.state?.overlay);
      } else check('Soru çözerken geri tuşu', true, 'bugün soru yok, atlandı');

      // Oturum sonu: "Ana sayfa" oturum kaydını geri alır, geri tuşunda ana sayfa iki kez durmaz.
      go('home'); await settle();
      const d0 = navDepth();
      runSession('topic', { entries: [], seconds: 0 }); await settle();
      [...document.querySelectorAll('button')].find((x) => x.textContent === 'Ana sayfa')?.click(); await settle();
      check('Oturum sonu "Ana sayfa" geçmişi şişirmez', state.tab === 'home' && navDepth() === d0 && !history.state?.overlay, `derinlik ${d0} → ${navDepth()}`);

      // Deneme: geri tuşu önce sorar, deneme telefonda saklanır, Deneme sayfasına dönülür.
      go('upload'); await settle();
      if (!savedExam()) {
        await startMixedExam(isLgsStudent(state.student) ? 'sayisal' : null); await settle();
        const inExam = !!state.exam && history.state?.overlay === 'exam';
        history.back(); await settle();
        check('Denemede geri tuşu Deneme sayfasına döner, deneme saklanır', inExam && !state.exam && state.tab === 'upload' && !!savedExam());
        dropExam(); go('upload', 'replace'); await settle();
      } else check('Denemede geri tuşu', true, 'telefonda yarım deneme var, atlandı');

      // Gerçek LGS kitapçığı yalnızca bütün soruları gelip hepsinin konusu işlenince görünür.
      go('upload'); await settle();
      const [bq, ts] = await Promise.all([
        sb.from('questions').select('booklet, topic_id').in('booklet', BOOKLETS.map((x) => x[0])).eq('active', true),
        sb.from('topic_status').select('topic_id').eq('student_id', sid()).in('status', ['active', 'gap']),
      ]);
      const openSet = new Set((ts.data || []).map((x) => x.topic_id));
      const shown = new Set([...document.querySelectorAll('#app .card b')].map((x) => x.textContent));
      const wrongBooklets = BOOKLETS.filter(([id, title, , n]) => {
        const rows = (bq.data || []).filter((x) => x.booklet === id);
        const due = isLgsStudent(state.student) && rows.length >= n && rows.every((x) => !x.topic_id || openSet.has(x.topic_id));
        return due !== shown.has(title);
      }).map((x) => x[1]);
      check('Gerçek LGS kitapçığı konuları işlenince görünür', !bq.error && !ts.error && !wrongBooklets.length,
        bq.error?.message || ts.error?.message || wrongBooklets.join(', '));

      // Kelime kartları: oyun soru çözme gibi açılır (alt menü gizli, dört şık); şık seçilince sorulardaki emin olma
      // ölçeği çıkar, ölçek seçilmeden gönderilemez; geri tuşu önce sorar, Kelime sayfasına döner. Kart gönderilmez,
      // hiçbir şey yazılmaz.
      if (wordsPerDay(state.student) > 0) {
        go('words'); await settle();
        const startBtn = [...document.querySelectorAll('#app button')].find((x) => /^(Başla|Devam et|\d+ kelime daha)$/.test(x.textContent));
        if (startBtn) {
          startBtn.click(); await settle();
          const inGame = state.session?.track === 'words' && history.state?.overlay === 'session' && !document.querySelector('nav.tabs')
            && !!document.querySelector('.trip') // yolculuk çubuğu kartın üstünde
            && document.querySelectorAll('.word-opt').length === 4
            && (!!document.querySelector('.word-big')?.textContent || !!document.querySelector('.listen-big')); // dinleme kartında yazı yok
          document.querySelector('.word-opt')?.click(); await wait(100);
          const send = [...document.querySelectorAll('#app button.primary')].find((x) => x.textContent === 'Cevabı gönder');
          const scale = document.querySelectorAll('.scale .conf').length === 4 && !!send && send.disabled && !send.closest('[hidden]');
          history.back(); await settle();
          check('Kelime kartı açılır, emin olma ölçeği çıkar, geri tuşu Kelime sayfasına döner',
            inGame && scale && !state.session && state.tab === 'words' && !history.state?.overlay,
            [!inGame && 'kart açılmadı', !scale && 'ölçek yok'].filter(Boolean).join('; '));
        } else check('Kelime kartı', true, 'çalışacak kelime yok, atlandı');
      }

      // Kartlar: şaka, bilmece, bulmaca, fıkra ve şiir hatasız çizilir.
      let cardErr = null;
      try { for (let i = 0; i < 40; i++) { jokeCard(); poemCard('Mola'); } } catch (e) { cardErr = e.message; }
      check('Şaka ve şiir kartları', !cardErr, cardErr || '');
    }
    go(root); await settle();
  } finally {
    window.confirm = realConfirm;
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
  }
  check('Sayfada yakalanmamış hata yok', !errors.length, errors.slice(0, 3).join(' | '));
  return results.join('\n');
})();
