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
    // Yalnızca test hesaplarıyla (velinin isteği, 2026-11-10): giriş yapan hesap bir test hesabı, sayfaları açılacak çocuk
    // (öğrencide kendisi, veli ve öğretmende seçili çocuk) bir test çocuğu değilse test hiçbir sayfa açmadan durur. Test
    // öğretmeni gerçek bir çocuğa da bağlı; o seçiliyken onun sayfaları açılıp okunurdu. Kimlikler tools/test-accounts.mjs'teki
    // TEST_ACCOUNTS ile aynı (regression.mjs denetler).
    const TEST_KIDS = ['dbdb25a7-5944-49b6-94b0-fcd855a205ed', 'c16864e7-684c-42fb-bb5e-f99c05b2a219', // irftest, test4
      '543d12a4-a7c8-464a-92ce-1bd23d37eec5', '6d0357bd-35f9-4a55-b8ab-ceb6dcd4e6d1']; // abd4, abd7
    const TEST_ADULTS = ['eac9fc92-6e78-4e48-a81b-409aff6678c9', '0502e009-7d69-40a9-b7c6-ceedaad1012f', // testveli, testogretmen
      '39be86d3-9683-41f6-8e2a-a6621594803f']; // abdveli
    const kidId = role === 'student' ? state.profile.id : state.student?.id;
    if (!(role === 'student' ? TEST_KIDS : TEST_ADULTS).includes(state.profile.id) || !TEST_KIDS.includes(kidId)) {
      check('Yalnızca test hesabıyla ve test çocuğuyla', false,
        `test durdu, hiçbir sayfa açılmadı: ${role === 'student' ? 'bir test öğrencisiyle gir' : 'test hesabıyla gir, bir test çocuğu seç'}`);
      return results.join('\n');
    }
    // ABD hesabı (velinin isteği, 2026-11-10: "ABD öğrencilerine Türkçe hiçbir şey gösteremeyiz"): her sayfa açılır, görünen
    // yazıda, düğme etiketlerinde ve yer tutucularda tek bir Türkçe yazı yok; dersler yalnız Matematik; kelime kartları ve
    // LGS yok; şakalar, fabllar ve şiirler İngilizce. Türkçe hesapların kontrolleri burada çalışmaz (yazılar İngilizce).
    if (typeof LANG !== 'undefined' && LANG === 'en') {
      const TR = /[çğıöşüÇĞİÖŞÜ]/;
      const visibleTurkish = () => {
        const lines = document.body.innerText.split('\n').map((s) => s.trim()).filter((s) => s && (TR.test(s) || looksTurkish(s)));
        const attrs = [...document.querySelectorAll('[aria-label],[placeholder],[title]')].filter((el) => el.offsetParent !== null || el === document.activeElement)
          .flatMap((el) => ['aria-label', 'placeholder', 'title'].map((a) => el.getAttribute(a)).filter(Boolean)).filter((v) => TR.test(v) || looksTurkish(v));
        return [...new Set([...lines, ...attrs])];
      };
      const bad = {};
      for (const tab of allowedTabs().filter((x) => !['konu', 'reasons'].includes(x))) {
        go(tab); await settle();
        if (tab === 'report') {
          for (const c of [...document.querySelectorAll('#app .report-tabs .chip')]) {
            c.click(); await wait(250);
            const l = visibleTurkish();
            if (l.length) bad[`report:${c.dataset.tab}`] = l.slice(0, 3);
          }
          [...document.querySelectorAll('#app .report-tabs .chip')].find((c) => c.dataset.tab === 'gun')?.click();
        } else {
          if (tab === 'settings') { document.querySelectorAll('#app details').forEach((d) => { d.open = true; }); await wait(300); }
          const l = visibleTurkish();
          if (l.length) bad[tab] = l.slice(0, 3);
        }
        if (state.tab !== tab || /something went wrong|bir şey ters gitti/i.test(pageText())) bad[tab] = [...(bad[tab] || []), 'sayfa açılmadı'];
      }
      check('ABD hesabı: hiçbir sayfada Türkçe yazı yok', !Object.keys(bad).length,
        Object.entries(bad).map(([k, v]) => `${k}: ${v.join(' / ').slice(0, 120)}`).join(' | ') || `${allowedTabs().length} sayfa`);
      go('topics'); await settle();
      const subjects = studentSubjects(state.student);
      check('ABD: dersler yalnız Matematik, konular Pennsylvania müfredatından', subjects.join() === 'matematik' && pageText().includes('math')
        && !/turkish|science|lgs/.test(pageText()), subjects.join());
      check('ABD: İngilizce kelime kartları yok', !allowedTabs().includes('words') && wordsPerDay(state.student) === 0);
      let cardTr = null;
      // Kart sayfaya eklenince çevrilir (docs/i18n.js sayfadaki yazıyı çevirir); bu yüzden önce eklenir, sonra okunur.
      try {
        for (let i = 0; i < 40 && !cardTr; i++) {
          const c = jokeCard();
          document.getElementById('app').append(c); await wait(0);
          if (TR.test(c.textContent)) cardTr = c.textContent.slice(0, 60);
          c.remove();
        }
      } catch (e) { cardTr = e.message; }
      check('ABD: şakalar, bilmeceler, fabllar ve şiirler İngilizce', !cardTr, cardTr || '');
      check('ABD: tarih İngilizce', LOCALE === 'en-US' && /monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december/i
        .test(new Date().toLocaleDateString(LOCALE, { weekday: 'long', month: 'long' })));
      go(rootTab()); await settle();
      check('Sayfada yakalanmamış hata yok', !errors.length, errors.slice(0, 3).join(' | '));
      return results.join('\n');
    }
    const root = rootTab();
    const pages = role === 'student'
      ? { home: ['hata tekrarı', 'konu tekrarı'], upload: ['deneme çöz', 'karma deneme'], send: ['soru ekle', 'kâğıt deneme'],
          topics: ['hangi konuyu çalışmak istersin', 'işlendi'],
          ask: ['yapamadığım sorular', 'beğendiğim sorular', 'kalemle'], paper: ['hangi deneme?'], settings: [], together: ['birlikte bakılacaklar'] }
      : role === 'parent'
        ? { report: ['gün gün çalışma', 'denemeler', 'mesaj bırak'], questions: [], topics: [], upload: ['hangi deneme?', 'kitap sayfası ekle'],
            book: ['kitap sayfası ekle', 'sayfalar'], settings: ['günlük plan', 'aile', 'kelime kartları', 'klavye dersleri', 'kelime kahramanı', 'kahramanı besleme', 'açlığı dondur'], together: ['birlikte bakılacaklar'] }
        : { report: ['gün gün çalışma', 'denemeler'], questions: [], topics: [], settings: [], together: ['birlikte bakılacaklar'] };
    if (role === 'student' && wordsPerDay(state.student) > 0) {
      pages.words = ['kelime kartları', 'güç', 'mağaza'];
      pages.shop = ['mağaza', 'kelime altını', 'yolculuk araçları', 'dünyanı süsle'];
    }
    // Kahramanı besleme: açık olan öğrencide (7. sınıfa kadar açık gelir) kahramanın sayfası.
    const feeding = role === 'student' && feedOn(state.student);
    if (feeding) pages.hero = ['kahramanın', 'yemekler', 'tokluk', 'bronz nasıl kazanılır'];
    // Klavye dersleri: klavyeli cihazda (bu tarayıcı bölmesi) sekmesi olan öğrencide.
    const typingTab = role === 'student' && typingPerDay(state.student) > 0 && hasKeyboard();
    if (typingTab) pages.typing = ['on parmak klavye', 'orta sıra', 'kelimeler ve cümleler', 'başla: ders', 'kelime roketi'];
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

    // Öğrencinin Konular sekmesi salt okunur (konuları veli işaretler, yıllık plana göre kendiliğinden de açılır):
    // işaret kutusu yok. İşlenen bir konuya girip yalnızca o konudan soru çözer; geri tuşu konunun sayfasına döner.
    // Soru cevaplanmadığı için hiçbir şey yazılmaz.
    if (role === 'student') {
      const tabs = [...document.querySelectorAll('nav.tabs button')].map((x) => x.textContent.trim());
      go('topics'); await settle();
      const boxes = document.querySelectorAll('#app input[type=checkbox]').length;
      check('Konular öğrencide salt okunur, Yükle\'nin sağında', tabs.indexOf('Konular') === tabs.indexOf('Yükle') + 1 && !boxes,
        `${tabs.join(', ')}${boxes ? `; ${boxes} işaret kutusu` : ''}`);
      const first = document.querySelector('button.topic-row.go');
      if (first) {
        first.click(); await settle();
        const start = [...document.querySelectorAll('button')].find((x) => /^Bu konudan \d+ soru çöz$/.test(x.textContent));
        if (start) {
          const topicId = state.topicId;
          start.click(); await settle();
          const only = !!state.session && state.session.track === 'practice' && state.session.entries.every((en) => en.question.topic_id === topicId);
          history.back(); await settle();
          check('Konu çalışması: yalnızca o konudan sorular, geri tuşu konuya döner', only && !state.session && state.tab === 'konu' && !history.state?.overlay,
            `açılan ${state.tab}`);
        } else check('Konu çalışması', state.tab === 'konu' && !pageText().includes('bir şey ters gitti'), 'konuda soru yok, oturum atlandı');
      } else check('Konu çalışması', true, 'işlenen konu yok, atlandı');
    }

    // Kahramanı besleme (velinin isteği, 2026-11-09). Açıkken: ana sayfada selamın altında kahramanın kartı (çizim, söz,
    // tokluk çubuğu, bronz, düğme; düğme kahramanın sayfasını açar); sayfada kahraman, altı yemekli raf, tokluk ve bronz;
    // İngilizce sayfasındaki kahramanın altında tokluk ve "Besle". Kapalıyken kart görünmez, sayfa "kapalı" der. Yemeğe
    // dokunulmaz: hiçbir şey yazılmaz.
    if (role === 'student') {
      go('home'); await settle();
      for (let i = 0; i < 40 && feeding && document.querySelector('.feed-home')?.hidden; i++) await wait(150);
      const card = document.querySelector('.feed-home');
      if (feeding) {
        const btn = card?.querySelector('button');
        const drawn = !!card && !card.hidden && !!card.querySelector('.feed-face svg.hero') && !!card.querySelector('.feed-bar i')
          && (card.querySelector('.feed-say')?.textContent.length || 0) > 10 && /🥉 \d+/.test(card.textContent);
        const above = !!card && !!document.querySelector('#app section.task') && !!(card.compareDocumentPosition(document.querySelector('#app section.task')) & 4);
        btn?.click(); await settle();
        const foods = [...document.querySelectorAll('.feed-shelf .feed-food')];
        const page = state.tab === 'hero' && foods.length === FEED_FOODS.length && foods.every((x) => /🥉 \d+/.test(x.textContent))
          && !!document.querySelector('.feed-hero .hero-scene svg.hero') && !!document.querySelector('.feed-hero .feed-say.bubble')
          && /Tokluk: /.test(document.getElementById('app').textContent);
        check('Kahramanı besleme: ana sayfada kahramanın kartı (selamın altında), düğmesi kahramanın sayfasını açar: kahraman, yemek rafı, tokluk, bronz',
          drawn && above && page, [!drawn && 'kart eksik', !above && 'kart tekrarların altında', !page && `sayfa eksik (açılan ${state.tab}, ${foods.length} yemek)`].filter(Boolean).join('; '));
        const faces = ['mutlu', 'iyi', 'ac', 'cokac'].map((key, i) => heroSvg(state.student.avatar, 3, state.student.hero_look, { key, form: [1, 0.8, 0.5, 0.2][i] }));
        check('Kahramanı besleme: tok, iyi, aç ve çok aç kahraman farklı çizilir; besleme dışında çizim değişmez',
          new Set(faces).size === 4 && heroSvg(state.student.avatar, 3, state.student.hero_look) === heroSvg(state.student.avatar, 3, state.student.hero_look, undefined));
        if (wordsPerDay(state.student) > 0) {
          go('words'); await settle();
          check('Kahramanı besleme: İngilizce sayfasında kahramanın altında tokluk ve "Besle"',
            !!document.querySelector('.feed-strip .feed-bar') && [...document.querySelectorAll('.feed-strip button')].some((x) => x.textContent === 'Besle'));
        }
      } else {
        go('hero'); await settle();
        check('Kahramanı besleme kapalıyken ana sayfada kart yok, kahramanın sayfası "kapalı" der',
          (!card || card.hidden) && pageText().includes('kahramanı besleme kapalı') && !document.querySelector('.feed-shelf'));
      }
    }
    // Veli: Günlük planda "Kahramanı besleme" ve "Açlığı dondur" kutuları (kaydedilmez).
    if (role === 'parent' && state.student) {
      go('settings'); await settle();
      for (let i = 0; i < 40 && !document.querySelector('#app input[aria-label="Kahramanı besleme açık"]'); i++) await wait(150);
      const on = document.querySelector('#app input[aria-label="Kahramanı besleme açık"]'), pause = document.querySelector('#app input[aria-label="Açlığı dondur"]');
      check('Kahramanı besleme: velinin Günlük planında açma kutusu ve "Açlığı dondur"; kapalıyken dondurma seçilemez',
        !!on && !!pause && on.checked === feedOn(state.student) && pause.disabled === !on.checked);
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

      // Kelime roketi: yazılan kelimeyi çatıdan kalkan roket vurur, puan artar; çatıya değen kelime çatıyı hırpalar.
      // Geri tuşu önce sorar, Klavye sayfasına döner. Oyun bitince sonucu kaydedilir (bronz için); bu denetim oyunu bitirmez,
      // bir şey kaydetmez.
      go('typing'); await settle();
      [...document.querySelectorAll('#app button')].find((x) => x.textContent === 'Oyna')?.click(); await wait(200);
      const g = state.session;
      let shot = false, bonk = false, reset = false, swap = false, fixed = false, armed = false, stacked = false, held = false, frozen = false,
        calm = false, boom = false, guard = false, iceOn = false, sprayed = false, melted = false, moved = false, lost = false,
        clear = false, turned = false, fair = false, thrifty = false, burst = false;
      if (g?.track === 'game') {
        g.paused = false;
        const w = g.spawn();
        for (const ch of w.text) key(ch, TQ_KEY[ch]);
        await wait(1200); // roketin uçuşu (arka plandaki sayfada zamanlayıcı yavaşlar)
        shot = g.hits === 1 && g.score > 0 && !g.list.includes(w);
        // Patlama kelimenin yerinde kalır: simge kendi ortasında büyüyüp söner (velinin isteği, 2026-11-09: simge soldan sağa
        // kayıyordu); halka yayılır, kıvılcımlar dört yana saçılır. Animasyon zamanı elle ileri sarılır (arka planda da çalışsın).
        const lay = g.view.layer.getBoundingClientRect(), px = lay.width * 0.8, py = lay.height * 0.4;
        gameBurst(g, px, py, '💥');
        const puff = [...g.view.layer.querySelectorAll('.tg-puff')].pop(), sparks = [...g.view.layer.querySelectorAll('.tg-spark')];
        const mid = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2 - lay.left, r.top + r.height / 2 - lay.top]; };
        const seek = (el, k) => el.getAnimations().forEach((a) => { a.pause(); a.currentTime = k * a.effect.getComputedTiming().duration; });
        const spots = puff ? [0.05, 0.4, 0.9].map((k) => { seek(puff, k); return mid(puff); }) : [];
        if (sparks[0]) seek(sparks[0], 1);
        const flew = sparks[0] ? Math.hypot(mid(sparks[0])[0] - px, mid(sparks[0])[1] - py) : 0;
        burst = spots.length === 3 && spots.every(([x, y]) => Math.abs(x - px) < 3 && Math.abs(y - py) < 3)
          && (reduceMotion() || (sparks.length >= 8 && !!g.view.layer.querySelector('.tg-ring') && flew > 20));
        const w2 = g.spawn(), roofs = g.roofs.reduce((a, b) => a + b, 0);
        w2.y = w2.ground;
        g.paused = false; // test sırasında tarayıcı bölmesi odağı kaybedince oyun durabilir
        g.tick(0.016);
        bonk = g.roofs.reduce((a, b) => a + b, 0) === roofs - 1 && !g.list.includes(w2);
        // Yanlış harf yarım kelimeyi bırakır (yazılanlar silinir); başka kelimenin ilk harfi o kelimeye geçirir.
        [...g.list].forEach((x) => gameRemove(g, x));
        const a1 = g.spawn(), a2 = g.spawn();
        if (a1 && a2) {
          a1.text = 'fjf'; a2.text = 'kdk'; gamePaintWord(a1); gamePaintWord(a2);
          g.paused = false;
          key('f', 'KeyF'); key('d', 'KeyD'); // a1'de sıradaki harf j; d ile başlayan kelime yok
          reset = !g.target && a1.pos === 0 && /baştan/.test(document.querySelector('.ty-guide')?.textContent || '');
          key('f', 'KeyF'); key('k', 'KeyK'); // a1 yeniden hedef, sonra k ile a2'ye geçer
          swap = g.target === a2 && a2.pos === 1 && a1.pos === 0;
        }
        // Yeni seviyede bir çatı onarılır: önce uçmuş olan.
        [...g.list].forEach((x) => gameRemove(g, x));
        g.roofs = [0, 1, 2, 2, 2];
        g.roofs.forEach((hp, i) => { g.view.houses[i].dataset.hp = hp; });
        g.hits = 5; g.level = 1; g.paused = false;
        const w3 = g.spawn('');
        if (w3) for (const ch of w3.text) key(ch, TQ_KEY[ch]);
        await wait(1200);
        fixed = g.level === 2 && g.roofs.join() === '2,1,2,2,2' && g.view.houses[0].dataset.hp === '2';
        // Renkli süper kelime süper silah verir; Ctrl'ye art arda iki basınca ekrandaki bütün kelimeler patlar, araya başka
        // tuş girerse patlamaz.
        [...g.list].forEach((x) => gameRemove(g, x));
        g.paused = false;
        const s = g.spawn('super');
        if (s) for (const ch of s.text) key(ch, TQ_KEY[ch]);
        await wait(1200);
        const ready = () => g.view.pads.filter((p) => p.classList.contains('on')).length;
        armed = !!s?.super && s.el.classList.contains('super') && s.text.length >= 5 && g.power === 1 && !g.view.power.hidden && ready() === 1;
        // Silahlar birikir: ikinci süper kelimeyle iki tane olur, evlerin arasında iki hazır roket durur.
        [...g.list].forEach((x) => gameRemove(g, x));
        g.paused = false;
        const s2 = g.spawn('super');
        if (s2) for (const ch of s2.text) key(ch, TQ_KEY[ch]);
        await wait(1200);
        stacked = g.power === 2 && ready() === 2 && /2 süper silah/.test(g.view.power.textContent);
        [...g.list].forEach((x) => gameRemove(g, x));
        const b1 = g.spawn(''), b2 = g.spawn(''), hits0 = g.hits;
        g.paused = false;
        key('Control', 'ControlLeft'); key('1', 'Digit1'); key('Control', 'ControlLeft');
        held = g.list.length === 2 && g.power === 2;
        // Kelimeler donar, roketler çatısına en yakın kelimeden başlayıp sırayla vurur (b2 aşağıda, önce o patlar). Roketler
        // yoldayken yeni kelime düşmez, basılan harf yanlış sayılmaz.
        if (b1 && b2) { b1.y = 20; b2.y = b2.ground - 40; }
        const popped = [];
        const seen = new MutationObserver((ms) => ms.forEach((m) => m.removedNodes.forEach((n) => n.classList?.contains('tg-word') && popped.push(n))));
        seen.observe(g.view.layer, { childList: true });
        const errors0 = g.errors; // yukarıdaki "1" yanlış sayıldı
        key('Control', 'ControlLeft');
        frozen = g.list.length === 2 && g.list.every((x) => x.locked) && !!g.volley && g.power === 1 && !g.view.power.hidden && ready() === 1;
        key('k', 'KeyK'); g.spawnIn = 0; g.tick(0.016);
        calm = g.errors === errors0 && g.list.length === 2;
        g.spawnIn = 99; // beklerken yeni kelime düşmesin
        for (let i = 0; i < 50 && g.volley; i++) await wait(100); // arka plandaki sayfada zamanlayıcı yavaşlar
        seen.disconnect();
        boom = !!b1 && !!b2 && !g.volley && g.list.length === 0 && g.hits === hits0 + 2 && popped[0] === b2.el && popped[1] === b1.el;
        // Son çatı kalınca ona çok yaklaşan kelime bir süper silahı kendiliğinden ateşler; çatı sağlam kalır.
        [...g.list].forEach((x) => gameRemove(g, x));
        g.roofs = [0, 0, 1, 0, 0];
        g.roofs.forEach((hp, i) => { g.view.houses[i].dataset.hp = hp; });
        g.paused = false; g.spawnIn = 99;
        const d = g.spawn(''), power0 = g.power;
        if (d) { d.y = d.ground - 4; g.tick(0.016); }
        const fired = !!d && power0 > 0 && d.locked && !!g.volley && g.power === power0 - 1 && /Son çatı/.test(g.view.banner.textContent);
        for (let i = 0; i < 50 && g.volley; i++) await wait(100);
        guard = fired && !g.list.includes(d) && g.roofs.join() === '0,0,1,0,0' && !g.over;
        // Roketlerin vurduğu süper ya da buzlu kelime bir şey kazandırmaz (süper silah ve makine yalnızca yazana); süper silah
        // ateşlenince sonraki 10 kelimede özel kelime gelmez (velinin isteği, 2026-11-03: patlamadan hemen sonra yeni silah ya
        // da su sıkıcı geliyor, oyun hiç bitmiyordu).
        [...g.list].forEach((x) => gameRemove(g, x));
        g.roofs = [2, 2, 2, 2, 2];
        g.roofs.forEach((hp, i) => { g.view.houses[i].dataset.hp = hp; });
        gamePower(g, 1);
        g.paused = false; g.spawnIn = 99;
        const f1 = g.spawn('super'), f2 = g.spawn('ice'), f3 = g.spawn('');
        g.superIn = 0; g.iceIn = 0;
        key('Control', 'ControlLeft'); key('Control', 'ControlLeft');
        const fired2 = !!g.volley;
        for (let i = 0; i < 50 && g.volley; i++) await wait(100);
        fair = fired2 && !!f1 && !!f2 && !!f3 && !g.volley && !g.list.length && g.power === 0 && !g.ice
          && g.superIn === GAME_CALM && g.iceIn === GAME_CALM;
        // Buz makinesi: buzlu kelimeyi vuranın çatısına makine takılır; iki sütununa düşen kelimelere kendiliğinden, sırayla buzlu
        // su püskürtür (yarı hız, ❄️), öbür sütunlara dokunmaz; su kelimelerin arkasında kalır. Buzu bitince erir, çatısı uçarsa gider.
        [...g.list].forEach((x) => gameRemove(g, x));
        g.roofs = [2, 2, 2, 2, 2];
        g.roofs.forEach((hp, i) => { g.view.houses[i].dataset.hp = hp; });
        g.hits = 12; g.level = 3; g.paused = false; g.spawnIn = 99;
        const c = g.spawn('ice');
        if (c) for (const ch of c.text) key(ch, TQ_KEY[ch]);
        await wait(1200);
        const ice = g.ice;
        iceOn = !!c?.ice && c.el.classList.contains('ice') && c.text.length >= 7 && !!ice && ice.house === c.house && ice.cols.length === 2
          && ice.cols.includes(c.house) && g.view.houses[c.house].querySelector('.tg-ice') === ice.el && ice.band.isConnected
          && /Buz makinesi/.test(g.view.banner.textContent);
        if (ice) {
          const p = g.spawn(''), p2 = g.spawn(''), r = g.spawn('');
          if (p && p2 && r) {
            p.house = ice.cols[1]; p.y = p.ground * 0.5; p2.house = ice.cols[0]; p2.y = p2.ground * 0.4;
            r.house = [0, 1, 2, 3, 4].find((i) => !ice.cols.includes(i)); r.y = r.ground * 0.6;
            const speed0 = p.speed, shots0 = ice.shots;
            g.paused = false; g.tick(0.016);
            const jet = g.view.layer.querySelector('.tg-spray');
            sprayed = p.iced && p.el.classList.contains('iced') && Math.abs(p.speed - speed0 * GAME_ICE_SLOW) < 1e-9 && !p2.iced
              && ice.shots === shots0 - 1 && !!jet && getComputedStyle(jet).zIndex === '-1';
            g.tick(0.016); // makine soğumadan ikinci kelimeye püskürtmez
            sprayed &&= !p2.iced;
            g.tick(GAME_ICE_COOL);
            sprayed &&= p2.iced && !r.iced && ice.shots === shots0 - 2;
          }
          [...g.list].forEach((x) => gameRemove(g, x));
          for (let i = 0; i < 2 * GAME_ICE_SHOTS && g.ice; i++) {
            const x = g.spawn('');
            if (!x) break;
            x.house = ice.cols[i % 2]; x.y = x.ground * 0.5;
            g.paused = false; g.tick(GAME_ICE_COOL + 0.01);
            gameRemove(g, x);
          }
          melted = !g.ice && !ice.band.isConnected && g.iceIn > 0 && /buzu bitti/.test(g.view.banner.textContent);
          for (let i = 0; i < 30 && ice.el.isConnected; i++) await wait(100);
          melted &&= !ice.el.isConnected;
        }
        // Sıradaki buzlu kelime bir önceki makinenin evine düşmez (velinin isteği: makine hep aynı sütuna geliyordu).
        [...g.list].forEach((x) => gameRemove(g, x));
        g.paused = false;
        const c2 = g.spawn('ice');
        moved = !!c && !!c2 && c2.house !== c.house;
        if (c2) for (const ch of c2.text) key(ch, TQ_KEY[ch]);
        await wait(1200);
        const at = g.ice?.house;
        if (at != null) {
          g.roofs[at] = 1; g.view.houses[at].dataset.hp = 1;
          const z = g.spawn('');
          if (z) { z.house = at; z.y = z.ground; g.paused = false; g.tick(0.016); }
        }
        lost = at != null && !g.ice && g.roofs[at] === 0 && !g.over && /buz makinesi de gitti/.test(g.view.banner.textContent);
        // Süper ya da buzlu kelime düşerken onun sütununa başka kelime düşmez; özel kelime öbürlerinin, yazılan kelime hepsinin
        // üstünde görünür (velinin isteği, 2026-11-03: arkadan gelen hızlı kelimeler özel kelimenin üstünü örtüyordu).
        [...g.list].forEach((x) => gameRemove(g, x));
        g.roofs = [2, 2, 2, 2, 2];
        g.roofs.forEach((hp, i) => { g.view.houses[i].dataset.hp = hp; });
        g.paused = false; g.spawnIn = 99;
        const zOf = (x) => getComputedStyle(x.el).zIndex;
        const s3 = g.spawn('super'), after3 = Array.from({ length: 20 }, () => g.spawn(''));
        clear = !!s3 && after3.every((x) => x && x.house !== s3.house) && zOf(s3) === '1' && zOf(after3[0]) === 'auto';
        if (clear) { after3[0].el.classList.add('target'); clear = zOf(after3[0]) === '2'; }
        [...g.list].forEach((x) => gameRemove(g, x));
        const i3 = g.spawn('ice'), after4 = Array.from({ length: 20 }, () => g.spawn(''));
        clear &&= !!i3 && after4.every((x) => x && x.house !== i3.house) && zOf(i3) === '1';
        // Buz makinesinin yanındaki çatı uçunca makine öbür yandaki çatıya döner, şerit oraya kayar (velinin isteği, 2026-11-03).
        [...g.list].forEach((x) => gameRemove(g, x));
        g.paused = false; g.spawnIn = 99;
        const c3 = g.spawn('ice');
        if (c3) { c3.house = 2; for (const ch of c3.text) key(ch, TQ_KEY[ch]); }
        await wait(1200);
        const ice3 = g.ice;
        if (ice3?.house === 2) {
          const side = ice3.cols.find((i) => i !== 2), left0 = ice3.band.style.left;
          g.roofs[side] = 1; g.view.houses[side].dataset.hp = 1;
          const y = g.spawn('');
          if (y) { y.house = side; y.y = y.ground; g.paused = false; g.spawnIn = 99; g.tick(0.016); }
          turned = g.ice === ice3 && g.roofs[side] === 0 && ice3.cols.join() === [2, 4 - side].sort((a, b) => a - b).join()
            && ice3.band.isConnected && ice3.band.style.left !== left0 && /öbür yana/.test(g.view.banner.textContent);
          // Öbür yan da uçarsa dönecek yer yok, makine yerinde kalır; uçmuş çatıya düşen (zararsız) kelimeye buz harcamaz.
          const far = ice3.cols.find((i) => i !== 2);
          g.roofs[far] = 1; g.view.houses[far].dataset.hp = 1;
          const y2 = g.spawn('');
          if (y2) { y2.house = far; y2.y = y2.ground; g.paused = false; g.spawnIn = 99; g.tick(0.016); }
          const q = g.spawn(''), k = g.spawn('');
          if (q && k && g.ice === ice3) {
            q.house = far; q.y = q.ground * 0.6; k.house = 2; k.y = k.ground * 0.3;
            const shots1 = ice3.shots;
            g.paused = false; g.spawnIn = 99; g.tick(GAME_ICE_COOL + 0.01);
            g.paused = false; g.tick(GAME_ICE_COOL + 0.01);
            thrifty = g.roofs[far] === 0 && ice3.cols.includes(far) && k.iced && !q.iced && ice3.shots === shots1 - 1;
          }
        }
      }
      history.back(); await settle();
      check('Kelime roketi: patlama kelimenin yerinde kalır (simge kaymaz), halka yayılır, kıvılcımlar saçılır', burst,
        burst ? '' : 'simge kaydı ya da halka ve kıvılcım yok');
      check('Kelime roketi: yazılan kelimeyi roket vurur, çatıya değen kelime çatıyı hırpalar, geri tuşu Klavye sayfasına döner',
        g?.track === 'game' && shot && bonk && !state.session && state.tab === 'typing' && !history.state?.overlay,
        [g?.track !== 'game' && 'açılmadı', !shot && 'vurmadı', !bonk && 'çatı hırpalanmadı', state.tab !== 'typing' && `açılan ${state.tab}`].filter(Boolean).join('; '));
      check('Kelime roketi: yanlış harf kelimeyi baştan başlatır, başka kelimenin ilk harfi ona geçirir', reset && swap,
        [!reset && 'yanlışta bırakılmadı', !swap && 'başka kelimeye geçmedi'].filter(Boolean).join('; '));
      check('Kelime roketi: yeni seviyede bir çatı onarılır (önce uçmuş olan)', fixed, g ? `seviye ${g.level}, çatılar ${g.roofs.join()}` : '');
      check('Kelime roketi: renkli kelime süper silah verir, silahlar birikir ve evlerin arasında hazır durur; Ctrl\'ye art arda iki basınca '
        + 'biri ateşlenir, roketler en alttaki kelimeden başlayıp hepsini sırayla vurur',
        armed && stacked && held && frozen && calm && boom,
        [!armed && 'süper silah gelmedi', !stacked && 'silahlar birikmedi', !held && 'araya tuş girince de patladı', !frozen && 'kelimeler donmadı ya da silah azalmadı',
          !calm && 'roketler yoldayken harf sayıldı ya da kelime düştü', !boom && 'hepsi sırayla patlamadı'].filter(Boolean).join('; '));
      check('Kelime roketi: son çatı kalınca ona çok yaklaşan kelime bir süper silahı kendiliğinden ateşler, çatı sağlam kalır', guard,
        g ? `silah ${g.power}, çatılar ${g.roofs.join()}` : '');
      check('Kelime roketi: buzlu kelime çatıya buz makinesi takar; makine iki sütununa düşen kelimelere kendiliğinden, sırayla buzlu su '
        + 'püskürtür (yarı hız), su kelimelerin arkasında kalır', iceOn && sprayed,
        [!iceOn && 'makine takılmadı', !sprayed && 'püskürtmedi, yanlış kelimeye püskürttü ya da su öne geçti'].filter(Boolean).join('; '));
      check('Kelime roketi: buz makinesi buzu bitince erir, sıradaki buzlu kelime başka eve düşer, çatısı uçan makine gider', melted && moved && lost,
        [!melted && 'buzu bitince erimedi', !moved && 'yeni buzlu kelime aynı eve düştü', !lost && 'çatı uçunca gitmedi'].filter(Boolean).join('; '));
      check('Kelime roketi: süper ya da buzlu kelimenin sütununa başka kelime düşmez; özel kelime öbürlerinin, yazılan kelime hepsinin üstünde',
        clear, clear ? '' : 'özel kelimenin sütununa kelime düştü ya da kelimeler yanlış sırada');
      check('Kelime roketi: buz makinesinin yanındaki çatı uçunca makine öbür yana döner, şerit oraya kayar; dönecek yer yoksa yerinde kalır, '
        + 'uçmuş çatıya düşen kelimeye buz harcamaz', turned && thrifty,
        [!turned && 'öbür yana dönmedi', !thrifty && 'uçmuş çatıya düşen kelimeye buz harcadı',
          g?.ice ? `sütunlar ${g.ice.cols.join()}, çatılar ${g.roofs.join()}` : 'makine yok'].filter(Boolean).join('; '));
      check('Kelime roketi: süper silahın roketlerinin vurduğu süper ya da buzlu kelime bir şey kazandırmaz; ateşlenince 10 kelime özel kelime gelmez',
        fair, fair ? '' : 'roketlerin vurduğu özel kelime silah ya da makine verdi, ya da sonraki özel kelime ertelenmedi');
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
        // Beklenen sayılar seçenek listesinden: ten + saç rengi + göz renkleri; öbür listelerin hepsi (saç, gözlük, yüz,
        // kaş, göz şekli, burun, gülüş, kulak) seçenek düğmesidir.
        const colorKeys = ['ten', 'sac', 'goz'];
        const wantSwatches = colorKeys.reduce((n, k) => n + HERO_LOOK[k].length, 0);
        const wantChips = Object.entries(HERO_LOOK).filter(([k]) => !colorKeys.includes(k)).reduce((n, [, v]) => n + v.length, 0);
        const swatches = det.querySelectorAll('.swatch').length, chips = det.querySelectorAll('.chip').length;
        const before = det.querySelector('.hero-preview')?.innerHTML;
        det.querySelectorAll('.swatch')[5]?.click();
        const changed = !!before && det.querySelector('.hero-preview').innerHTML !== before;
        check('Aile: kahramanın görünüşü açılır, seçim önizlemeyi değiştirir', swatches === wantSwatches && chips === wantChips && changed && /fotoğraf/i.test(det.innerText),
          `renk ${swatches}/${wantSwatches}, seçenek ${chips}/${wantChips}, değişti ${changed}`);
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

    // Deneme kutusu (2026-11-10): en son deneme açık, açılır listeden öbür denemeler; yanlış ya da boş sayısına dokununca o
    // dersin soruları açılır, yeniden dokununca kapanır. Salt okunur.
    if (role !== 'student') {
      go('report'); await settle();
      const sel = document.querySelector('#app select[aria-label="Hangi deneme"]');
      if (sel) {
        const card = sel.closest('section');
        const first = card.querySelector('tbody .num-link');
        let shown = 'sayı yok', hidden = true;
        if (first) {
          first.click();
          const slot = card.querySelector('.exam-wrongs');
          for (let i = 0; i < 40 && /Yükleniyor/.test(slot.textContent); i++) await wait(150);
          shown = !slot.hidden && (slot.querySelectorAll('.choice, img, .stem').length >= 1 || /bulunamadı/.test(slot.textContent)) && !slot.querySelector('.choice.right') ? 'ok' : slot.textContent.slice(0, 60);
          first.click(); await wait(100); hidden = slot.hidden;
        }
        const options = sel.options.length;
        if (options > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change')); await wait(200); }
        const switched = options < 2 || /Net \d/.test(card.textContent);
        check('Rapor: deneme kutusu; yanlış ya da boş sayısına dokununca sorular açılır, listeden başka deneme seçilir', (shown === 'ok' || shown === 'sayı yok') && hidden && switched,
          `${options} deneme, ${shown}`);
      } else check('Rapor: deneme kutusu', pageText().includes('henüz deneme yok'), 'deneme yok');
    }

    // Rapor sekmeleri (2026-11-10): yedi sekme; yalnızca seçili sekmenin bölümleri görünür, seçim hatırlanır. Salt okunur.
    if (role !== 'student') {
      go('report'); await settle();
      const chips = () => [...document.querySelectorAll('#app .report-tabs .chips .chip')];
      const visible = () => [...document.querySelectorAll('#app .report-panel')].filter((p) => !p.hidden).map((p) => p.dataset.tab);
      const names = chips().map((c) => c.textContent);
      chips().find((c) => c.dataset.tab === 'denemeler')?.click(); await wait(100);
      const afterClick = visible().join() === 'denemeler' && pageText().includes('derslere göre yanlış') && ![...document.querySelectorAll('#app h2')].some((x) => x.textContent === 'Gün gün çalışma' && x.offsetParent);
      go(role === 'parent' ? 'questions' : 'topics'); await settle(); go('report'); await settle();
      const remembered = visible().join() === 'denemeler';
      chips().find((c) => c.dataset.tab === 'gun')?.click(); await wait(100);
      check('Rapor sekmeleri: yedi sekme, seçili olanın bölümleri görünür, seçim hatırlanır', names.length === 7 && afterClick && remembered && visible().join() === 'gun',
        `${names.length} sekme: ${names.join(' | ')}; görünen ${visible().join()}`);
    }

    // Mesaj kutusu (2026-11-10): yalnızca son mesaj görünür, okudu ya da okumadı etiketiyle. Salt okunur.
    if (role === 'parent') {
      go('report'); await settle();
      for (let i = 0; i < 40 && !pageText().includes('mesaj bırak'); i++) await wait(150);
      const notes = [...document.querySelectorAll('#app .note.small')].filter((x) => /Okudu|Henüz okumadı/.test(x.textContent));
      check('Mesaj kutusu: yalnızca son mesaj, okudu ya da okumadı etiketiyle', notes.length <= 1 && (pageText().includes('son mesaj') || !notes.length),
        notes.length ? `${notes.length} mesaj` : 'hiç mesaj yok');
    }

    // Rapor, Gün gün çalışma (2026-11-09): tablodaki doğru ya da yanlış sayısına dokununca o konunun soruları tablonun altında
    // açılır, soru metni yüklenir; yeniden dokununca kapanır. Salt okunur. Çalıştığı bir gün yoksa atlanır.
    if (role !== 'student') {
      go('report'); await settle();
      [...document.querySelectorAll('#app .report-tabs .chip')].find((c) => c.dataset.tab === 'gun')?.click(); await wait(100);
      const dayBox = () => [...document.querySelectorAll('#app h2')].find((x) => x.textContent === 'Gün gün çalışma')?.parentElement;
      for (let i = 0; i < 40 && !dayBox(); i++) await wait(150);
      // Sayı olan en yakın güne git (en çok 10 gün geri).
      for (let i = 0; i < 10 && dayBox() && !dayBox().querySelector('.num-link'); i++) {
        const prev = [...dayBox().querySelectorAll('button')].find((x) => x.textContent === '‹ Önceki');
        if (!prev || prev.disabled) break;
        prev.click(); await wait(150);
      }
      const num = dayBox()?.querySelector('.num-link');
      if (num) {
        num.click(); await wait(200);
        for (let i = 0; i < 40 && /Yükleniyor/.test(dayBox().querySelector('.picked-rows')?.textContent || 'Yükleniyor'); i++) await wait(150);
        const panel = dayBox().querySelector('.picked-rows');
        const shown = !!panel && panel.querySelectorAll('details[open]').length >= 1 && panel.querySelectorAll('.study-card .choice, img, .stem').length >= 1
          && !panel.querySelector('.opt, .choice.right, .choice.wrong');
        dayBox().querySelector('.num-link[aria-expanded="true"]')?.click(); await wait(200);
        check('Rapor: tablodaki doğru ya da yanlış sayısına dokununca o sorular cevabı gizli (birlikte çöz kartı) açılır, yeniden dokununca kapanır', shown && !dayBox().querySelector('.picked-rows'),
          !shown ? (panel?.textContent || 'panel yok').slice(0, 80) : '');
      } else check('Rapor: tablodaki sayılar', true, 'son günlerde soru çözülmemiş, atlandı');
      // Derslere göre yanlış ve boş (2026-11-10): çubuğun sayısına dokununca o dersin soruları konuya göre, en yeniden eskiye açılır.
      [...document.querySelectorAll('#app .report-tabs .chip')].find((c) => c.dataset.tab === 'denemeler')?.click(); await wait(100);
      const subjBtn = document.querySelector('#app .bar-btn');
      if (subjBtn) {
        subjBtn.click();
        const slot = subjBtn.nextElementSibling;
        for (let i = 0; i < 40 && /Yükleniyor/.test(slot?.textContent || 'Yükleniyor'); i++) await wait(150);
        const dates = [...slot.querySelectorAll('p.small.muted')].map((p) => p.textContent.match(/(\d{1,2}) (\S+)/)).filter(Boolean).length;
        const ok = !slot.hidden && (slot.querySelectorAll('h4.wrong-group').length >= 1 || /bulunamadı/.test(slot.textContent));
        subjBtn.click(); await wait(100);
        check('Rapor: derse göre yanlış sayısına dokununca sorular konuya göre açılır, yeniden dokununca kapanır', ok && slot.hidden,
          `${slot.querySelectorAll('h4.wrong-group').length} konu, ${dates} soru`);
      } else check('Rapor: derse göre yanlış sayısı', true, 'deneme yanlışı yok, atlandı');
      // Zayıf konular (2026-11-09): "Yanlış soruları göster" o konunun yanlış sorularını kartın altında açar (soru metni,
      // şıklar ya da deneme fotoğrafı); yeniden dokununca kapanır. Salt okunur.
      [...document.querySelectorAll('#app .report-tabs .chip')].find((c) => c.dataset.tab === 'zayif')?.click(); await wait(100);
      const weakBtn = [...document.querySelectorAll('#app button')].find((x) => /^Yanlış soruları göster \(\d+\)$/.test(x.textContent));
      if (weakBtn) {
        weakBtn.scrollIntoView({ block: 'center' }); weakBtn.click();
        const slot = weakBtn.nextElementSibling;
        for (let i = 0; i < 40 && /Yükleniyor/.test(slot?.textContent || 'Yükleniyor'); i++) await wait(150);
        const shown = !!slot && !slot.hidden && (slot.querySelectorAll('.choice, img, .stem, .exam-img').length >= 1 || /bulunamadı|havuzda değil/.test(slot.textContent));
        const hiddenAns = !!slot && !slot.querySelector('.choice.right, .choice.wrong') && !/Çözüm:/.test(slot.textContent);
        weakBtn.click(); await wait(100);
        const groups = [...document.querySelectorAll('#app h3.weak-group')].map((x) => x.textContent.split(' · ')[0]);
        const order = studentSubjects(state.student).map((s) => SUBJECTS[s].name);
        const grouped = new Set(groups).size === groups.length && groups.every((g, i) => i === 0 || order.indexOf(groups[i - 1]) <= order.indexOf(g));
        check('Rapor: zayıf konular derse göre gruplu; "Yanlış soruları göster" soruları cevabı gizli açar, yeniden dokununca kapanır', shown && hiddenAns && slot.hidden && grouped && pageText().includes('yanlışlar nereden geliyor'),
          shown ? `${slot.querySelectorAll('.choice').length} şık, cevap ${hiddenAns ? 'gizli' : 'açık'}` : (slot?.textContent || 'panel yok').slice(0, 80));
      } else check('Rapor: zayıf konuda "Yanlış soruları göster"', true, 'zayıf konu yok, atlandı');
      // Günün yanlışları derse göre gruplu (2026-11-09): her dersin başlığı bir kez çıkar, başlıktaki sayı altındaki yanlış
      // sayısına eşittir, dersler öğrencinin ders sırasıyla gelir.
      const heads = [...(dayBox()?.querySelectorAll('h4.wrong-group') || [])];
      if (heads.length) {
        const names = heads.map((x) => x.textContent.split(' · ')[0]);
        const order = studentSubjects(state.student).map((s) => SUBJECTS[s].name);
        const counts = heads.map((x) => { let n = 0; for (let el = x.nextElementSibling; el && !el.matches('h4.wrong-group'); el = el.nextElementSibling) if (el.querySelector('.tag')) n++; return n; });
        check('Rapor: günün yanlışları derse göre gruplu', new Set(names).size === names.length
          && names.every((n, i) => i === 0 || order.indexOf(names[i - 1]) <= (order.indexOf(n) < 0 ? 99 : order.indexOf(n)))
          && heads.every((x, i) => +x.textContent.match(/(\d+) yanlış/)?.[1] === counts[i]), heads.map((x) => x.textContent).join(', '));
      } else check('Rapor: günün yanlışları derse göre gruplu', true, 'o gün yanlış yok, atlandı');
    }

    // Velinin "Birlikte çöz"ü (2026-11-10; "Benzer sorularla dene"nin yerine, benzer sorular kartın içinde): Sorular sayfasında
    // kaçırdığı sorunun altında düğme; basınca kart açılır: şıklar düğme, cevap ve çözüm gizli. "Cevabı göster" doğru cevabı,
    // ilk seçimini ve çözümü açar, "Anladı mı?" sorar; "Anladım" benzer soruyu (ya da "kalmadı" notunu) getirir. Şıklara
    // dokunulmaz: hiçbir şey yazılmaz. Veli ve öğretmende var (öğretmen kendi dersinde), öğrencide yok.
    if (role !== 'student') {
      go('questions'); await settle();
      const tabs = [...document.querySelectorAll('#app .chip')];
      let btn = null;
      for (const name of ['Denemeler', 'Tekrarlar']) {
        tabs.find((x) => x.textContent === name)?.click(); await wait(150);
        btn = [...document.querySelectorAll('#app button')].find((x) => x.textContent === 'Birlikte çöz');
        if (btn) break;
      }
      if (btn) {
        btn.click(); await wait(150);
        const card = btn.nextElementSibling?.querySelector('.study-card');
        const hiddenFirst = !!card && card.querySelectorAll('button.choice').length >= 2 && !card.querySelector('.choice.right, .choice.wrong')
          && !/Doğru cevap|Çözüm:/.test(card.textContent);
        card?.querySelector('button.ghost')?.click(); await wait(100);
        const revealed = !!card && !!card.querySelector('.choice.right') && /Doğru cevap|Doğru\./.test(card.textContent) && /Anladı mı\?/.test(card.textContent)
          && !(card.querySelector('details')?.open);
        [...(card?.querySelectorAll('button') || [])].find((x) => x.textContent.startsWith('Anladım'))?.click();
        for (let i = 0; i < 40 && /aranıyor/.test(card?.querySelector('.check-panel')?.textContent || 'aranıyor'); i++) await wait(150);
        const panel = card?.querySelector('.check-panel');
        const asked = !!panel && panel.querySelectorAll('button.choice').length >= 2 && /Benzer soru 1 \/ \d/.test(panel.textContent);
        const none = !!panel && /benzer soru kalmadı/.test(panel.textContent);
        check('Veli ya da öğretmen: "Birlikte çöz" cevabı gizler, "Cevabı göster" açar, "Anladım" benzer soruyu getirir', btn.hidden && hiddenFirst && revealed && (asked || none),
          `${hiddenFirst ? 'gizli' : 'gizli değil'}, ${revealed ? 'açıldı' : 'açılmadı'}, ` + (asked ? panel.textContent.match(/Benzer soru 1 \/ \d/)[0] : none ? 'benzer soru kalmadı' : (panel?.textContent || 'panel yok').slice(0, 80)));
      } else check('Veli ya da öğretmen: "Birlikte çöz"', true, 'kaçırdığı soru yok, atlandı');
      // Birlikte bakılacaklar (2026-11-10): kartın kendisi birlikte çöz kartı; cevap ve çözüm gizli. Salt okunur.
      go('together'); await settle();
      const tCard = document.querySelector('#app article.card');
      if (tCard) {
        const ok = !!tCard.querySelector('.study-card') && tCard.querySelectorAll('.study-card .choice').length >= 2
          && !tCard.querySelector('.choice.right, .choice.wrong, .opt') && !/Çözüm/.test(tCard.textContent) && !!tCard.querySelector('button.block');
        check('Birlikte bakılacaklar: kart birlikte çöz kartı, cevap ve çözüm gizli, "Birlikte baktık" düğmesi durur', ok, tCard.textContent.slice(0, 60));
      } else check('Birlikte bakılacaklar: birlikte çöz kartı', true, 'birlikte bakılacak soru yok, atlandı');
    }

    // Ülke ve müfredat ayrımı (2026-11-09): seçili öğrencinin müfredatı Türkiye; konuların hepsi onun müfredatından gelir
    // (başka ülkenin aynı sınıftaki konuları karışmaz). Salt okunur.
    if (state.student) {
      const cur = studentCurriculum(state.student);
      const rows = await q(sb.from('topics').select('id, curriculum, grade').eq('curriculum', cur).in('grade', studentGrades(state.student)));
      const other = await q(sb.from('topics').select('id').neq('curriculum', cur).in('grade', studentGrades(state.student)));
      check('Müfredat: öğrencinin konuları kendi müfredatından', cur === 'tr' && rows.length > 0 && rows.every((r) => r.curriculum === cur),
        `müfredat ${cur}, ${rows.length} konu` + (other.length ? `; aynı sınıfta başka müfredattan ${other.length} konu var (gösterilmiyor)` : ''));
    }

    // Supabase bir istekte en çok 1000 satır verir; q() kalan sayfaları da okur (2026-11-09). Soru havuzu 1000'den büyük:
    // okunan satır sayısı veritabanının saydığıyla aynı olmalı, hiçbir satır iki kez gelmemeli. Salt okunur.
    {
      const { count } = await sb.from('questions').select('id', { count: 'exact', head: true });
      const rows = await q(sb.from('questions').select('id'));
      check('1000 satırdan büyük okuma eksiksiz gelir', count > 0 && rows.length === count && new Set(rows.map((r) => r.id)).size === count,
        `veritabanı ${count}, okunan ${rows.length}` + (count <= SB_PAGE ? '; havuz 1000 satırdan küçük, sayfalama denenmedi' : ''));
    }

    // Fotoğraf gönderme sayfası (velinin isteği, 2026-11-09): Gönder çubuğu hep ekranda (yapışkan); gönderilmemiş fotoğraf
    // varken başka sayfaya geçmek ya da geri tuşu pencereyle sorar: "Sayfada kal" fotoğrafları korur, "Fotoğrafları sil ve
    // çık" çıkar. "Fotoğrafları gönder"e basılmaz: hiçbir şey yazılmaz.
    if (role !== 'teacher') {
      const page = role === 'student' ? 'ask' : 'upload', other = role === 'student' ? 'home' : 'report';
      go(other); await settle();
      go(page); await settle();
      const input = document.querySelector('#app .card input[type=file]');
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([255, 216, 255])], 'zz-smoke.jpg', { type: 'image/jpeg' }));
      if (input) { input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
      await wait(100);
      const bar = document.querySelector('#app .send-bar');
      const sticky = !!bar && getComputedStyle(bar).position === 'sticky' && /^Gönder \(1 fotoğraf\)$/.test(bar.querySelector('button')?.textContent || '');
      const btn = (t) => [...document.querySelectorAll('.ask button')].find((x) => x.textContent.trim() === t);
      go(other); await wait(200);
      const asked = !!document.querySelector('.ask') && state.tab === page && !!btn('Sayfada kal') && !!btn('Fotoğrafları sil ve çık')
        && (role !== 'student' || !!btn('Fotoğrafları gönder'));
      btn('Sayfada kal')?.click(); await wait(150);
      const kept = !document.querySelector('.ask') && state.tab === page && document.querySelectorAll('#app .thumb').length === 1;
      history.back(); await wait(400);
      const askedBack = !!document.querySelector('.ask') && state.tab === page && history.state?.tab === page;
      btn('Sayfada kal')?.click(); await wait(150);
      go(other); await wait(200);
      btn('Fotoğrafları sil ve çık')?.click(); await settle();
      check('Fotoğraf gönderme: Gönder çubuğu hep ekranda; gönderilmemiş fotoğrafla çıkarken pencere sorar, "Sayfada kal" fotoğrafı korur, "sil ve çık" çıkar',
        sticky && asked && kept && askedBack && state.tab === other && !document.querySelector('.ask'),
        [!sticky && 'Gönder çubuğu yapışkan değil ya da sayı yok', !asked && 'çıkarken sormadı', !kept && 'fotoğraf korunmadı', !askedBack && 'geri tuşunda sormadı',
          state.tab !== other && `çıkmadı (açık ${state.tab})`].filter(Boolean).join('; '));
    }

    if (role === 'student') {
      go('home'); await settle();
      // Soru çözerken geri tuşu: önce sorar (burada evet), ana sayfaya döner. Soru cevaplanmadığı için hiçbir şey yazılmaz.
      const s = state.cache?.topic?.entries?.length ? state.cache.topic : state.cache?.mistake;
      if (s?.entries?.length) {
        runSession('topic', s); await settle();
        const inSession = !!state.session && history.state?.overlay === 'session' && !document.querySelector('nav.tabs');
        // "Bu konuyu okulda henüz işlemedik" ve "Soruda sorun var" önce sorar (velinin isteği, 2026-11-09). Burada vazgeçilir:
        // konu bekletilmez, bildirim gönderilmez, hiçbir şey yazılmaz.
        const byText = (t) => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t);
        const inAsk = (t) => [...document.querySelectorAll('.ask button')].find((x) => x.textContent.trim() === t);
        const index0 = state.session.index, total0 = state.session.entries.length;
        const taught = byText('Bu konuyu okulda henüz işlemedik');
        let askTaught = !taught; // hata tekrarında bu düğme yok
        if (taught) {
          taught.click(); await wait(150);
          askTaught = !!inAsk('Evet, henüz işlemedik');
          inAsk('Vazgeç, soruyu çözeceğim')?.click(); await wait(150);
          askTaught = askTaught && !document.querySelector('.ask') && !taught.disabled;
        }
        byText('Soruda sorun var')?.click(); await wait(100);
        byText('Çok zor')?.click(); await wait(50);
        [...document.querySelectorAll('#app .card button.primary')].find((x) => x.textContent.trim() === 'Gönder')?.click(); await wait(150);
        const askReport = !!inAsk('Evet, bildir');
        inAsk('Vazgeç')?.click(); await wait(150); // bildirim kutusunun kendi "Vazgeç"i değil, penceredeki
        check('Oturumda "henüz işlemedik" ve "Soruda sorun var" önce sorar; vazgeçince soru yerinde kalır',
          askTaught && askReport && !document.querySelector('.ask') && !!byText('Soruda sorun var') && state.session?.index === index0
          && state.session.entries.length === total0, [!askTaught && 'işlemedik sormadı', !askReport && 'bildirim sormadı'].filter(Boolean).join('; '));
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
