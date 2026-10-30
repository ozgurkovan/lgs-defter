// Arayüz duman testi. Giriş yapılmış bir TEST hesabıyla (IrfTest, test velisi ya da test öğretmeni) uygulama sayfasında çalışır:
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
          ask: ['yapamadığım sorular', 'beğendiğim sorular', 'kalemle'], paper: ['hangi deneme?'], topics: [], settings: [], together: ['birlikte bakılacaklar'] }
      : role === 'parent'
        ? { report: ['gün gün çalışma', 'denemeler', 'mesaj bırak'], questions: [], topics: [], upload: ['hangi deneme?', 'kitap sayfası ekle'],
            book: ['kitap sayfası ekle', 'sayfalar'], settings: ['günlük plan', 'aile'], together: ['birlikte bakılacaklar'] }
        : { report: ['gün gün çalışma', 'denemeler'], questions: [], topics: [], settings: [], together: ['birlikte bakılacaklar'] };
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

    // Geri: tarayıcı tuşu da üst çubuktaki düğme de bir önceki sayfaya döner.
    const [a, b] = role === 'student' ? ['topics', 'settings'] : ['questions', 'topics'];
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
