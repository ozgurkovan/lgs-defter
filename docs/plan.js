/* Plan sınırları (velinin isteği, 2026-11-22: "20 soru sınırını yapalım, kullanıcılar unlock yapabilsinler… deneme, kitap
   yüklemesi yapabilecekler ama onun da bir limiti olsun, mesela ayda 6 deneme, paralıda bile").
   Bedava plan: günde 20 soru (hata ve konu tekrarı, ek çalışma, konu çalışması, kitap soruları birlikte; kelime kartı ve
   klavye ayrı), uygulamada haftada bir deneme, haftada 10 soru fotoğrafı ve ayda 1 kâğıt deneme (velinin isteği, 2026-11-25:
   "bedavalar haftada en fazla 10 soru yükleyebilsin, deneme ayda 1 tane, sonrasında premium istesin"), kitap yükleme kapalı. Aile planı: soru ve deneme sınırı yok, ayda 6 kâğıt
   deneme ve 2 yeni kitap. Hediye abonelikte sınır yok. Sayılar veritabanından gelir (supabase/plan-limits.sql, plan_limits);
   okunamazsa hiçbir şey kısıtlanmaz. Çocuğa teklif gösterilmez: yalnızca "bugünlük bu kadar"; "Kilidi aç" yalnızca velide. */

/* Plan: saf kısım */
const PLAN_OPEN = { plan: 'family', gift: true, daily_questions: null, exams_week: null, uploads: true, question_week: null, question_used: 0, process_day: null, paper_month: null, books_month: null, paper_used: 0, books_used: 0, requested_at: null, words: true, typing: true, army: true };
const PLAN_PRICE = 'ayda 10 dolar';
// Veritabanından gelen satırı tamamlar; satır yoksa (okunamadı, işlev henüz yok) sınırsız sayılır.
function planNorm(raw) {
  if (!raw || typeof raw !== 'object' || !raw.plan) return { ...PLAN_OPEN, unknown: true };
  const num = (v) => (v == null || !Number.isFinite(+v) ? null : Math.max(0, Math.round(+v)));
  return {
    plan: raw.plan === 'free' ? 'free' : 'family', gift: !!raw.gift,
    daily_questions: num(raw.daily_questions), exams_week: num(raw.exams_week), uploads: raw.uploads !== false,
    // Soru fotoğrafı her planda açık; question_week haftalık sınırı (boş = sınırsız). Alanı tanımayan eski veritabanında
    // yükleme kapalıysa soru fotoğrafı da kapalı sayılır.
    question_week: 'question_week' in raw ? num(raw.question_week) : (raw.uploads !== false ? null : 0), question_used: num(raw.question_used) || 0,
    // Bedavada soru fotoğrafları sıraya girer: görev günde process_day fotoğraf işler (boş = hemen, bir saat içinde).
    process_day: num(raw.process_day),
    paper_month: num(raw.paper_month), books_month: num(raw.books_month),
    paper_used: num(raw.paper_used) || 0, books_used: num(raw.books_used) || 0, requested_at: raw.requested_at || null,
    // Aile planına bağlı özellikler: yabancı dil (kelime kartları), klavye dersleri ve oyunu, asker / balerin kahraman.
    words: raw.words !== false, typing: raw.typing !== false, army: raw.army !== false,
  };
}
// Günlük sınıra sayılan cevaplar: velinin/öğretmenin denemesi (check) ve uygulamadaki deneme (ayrı sınırı var) sayılmaz.
const planCounted = (rows) => (rows || []).filter((r) => r && r.track !== 'check' && r.track !== 'deneme').length;
// Bugün kalan soru hakkı; sınır yoksa Infinity.
const planDailyLeft = (info, done) => (info?.daily_questions == null ? Infinity : Math.max(0, info.daily_questions - (done || 0)));
/* Oturumları kalan hakka sığdırır. lists: öncelik sırasıyla soru listeleri (hata, konu, ek, kitap…). Sığmayanlar sondan
   kesilir; bir maddenin soruları ortadan kesilirse kalan son soru maddeyi kapatır (last), madde yarım kalmaz. */
function planTrim(lists, left) {
  let room = left === Infinity ? Infinity : Math.max(0, Math.floor(+left || 0));
  return lists.map((list) => {
    const src = list || [];
    if (room >= src.length) { room -= src.length; return src; }
    const out = src.slice(0, room);
    room = 0;
    const tail = out[out.length - 1];
    if (tail && 'last' in tail && !tail.last && !tail.extra && tail.item?.id) out[out.length - 1] = { ...tail, last: true };
    return out;
  });
}
/* Uygulamadaki deneme: haftada exams_week tane. exams: [{ exam_date }] (uygulamada çözdükleri). Hak dolduysa yeni denemenin
   açılacağı günü ('YYYY-MM-DD') döndürür, hak varsa null. Hafta: bugün dahil son 7 gün. */
function planExamWait(info, exams, today) {
  const cap = info?.exams_week;
  if (cap == null) return null;
  const from = planAddDays(today, -6);
  const recent = (exams || []).map((e) => e.exam_date).filter((d) => d && d >= from && d <= today).sort();
  if (recent.length < cap) return null;
  return planAddDays(recent[recent.length - cap], 7);
}
function planAddDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Bu ay kalan kâğıt deneme ve yeni kitap hakkı; sınır yoksa Infinity. Kâğıt deneme paper_month ile sınırlıdır (bedavada
// ayda 1); kitap 'uploads' kapalıysa 0.
const planPaperLeft = (info) => (!info ? 0 : info.paper_month == null ? (info.uploads ? Infinity : 0) : Math.max(0, info.paper_month - (info.paper_used || 0)));
// Bu hafta (pazartesiden beri) kalan soru fotoğrafı hakkı; sınır yoksa Infinity. Her fotoğraf bir sorudur.
const planQuestionLeft = (info) => (info?.question_week == null ? Infinity : Math.max(0, info.question_week - (info.question_used || 0)));
// Yüklemesi sırada bekler mi (bedava plan)? Ücretli, hediye ve bilinmeyen planda "bir saat içinde".
const planQueued = (info) => info?.process_day != null;
// Plan bu özelliği açıyor mu ('words' | 'typing' | 'army')? Plan bilinmiyorsa açık sayılır.
const planAllows = (info, feature) => !info || info[feature] !== false;
const planBooksLeft = (info) => (!info?.uploads ? 0 : info.books_month == null ? Infinity : Math.max(0, info.books_month - info.books_used));

// Oyunlar açık mı (velinin ayarı; boş = açık): kahramanın oyunları (uzaylı savaşı, uzaylıyla dans) ve Kelime roketi.
const heroGamesOn = (p) => p?.hero_games !== false;
const typingGameOn = (p) => p?.typing_game !== false;

/* Plan: ekran */
// Seçili öğrencinin planı; bir dakika hatırlanır. Okunamazsa sınırsız (uygulama kilitlenmesin).
async function planInfo(force = false) {
  const id = sid();
  const c = state.planCache;
  if (!force && c && c.id === id && c.by === state.user?.id && Date.now() - c.at < 60000) return c.info;
  let info;
  try {
    const { data, error } = await sb.rpc('plan_limits', { student: id });
    info = planNorm(error ? null : data);
  } catch (e) { info = planNorm(null); }
  if (!info.unknown) state.planCache = { id, by: state.user?.id, at: Date.now(), info };
  return info;
}
const planForget = () => { state.planCache = null; };
/* Seçili öğrencide özellik açık mı? Sekmeler ve kahraman çizimi beklemeden sorar; plan girişte ve çocuk değişince okunur
   (planInfo). Başka çocuğun ya da okunmamış planın cevabı "açık"tır. Velinin ayarı değişmez: yalnızca çocuğun ekranında
   görünmez, aile planına geçince ayarlandığı gibi geri gelir. */
function planHas(feature, p = state.student) {
  const c = state.planCache;
  if (!c || !p || c.id !== p.id) return true;
  return planAllows(c.info, feature);
}
// Bugün kalan soru hakkı (konu çalışması gibi ana sayfa dışındaki oturumlar için). Sınır yoksa veritabanına gitmez.
async function planLeftToday(info) {
  if (info.daily_questions == null) return Infinity;
  const rows = await q(sb.from('reviews').select('id, track').eq('student_id', sid()).eq('voided', false).gte('answered_at', localDate() + 'T00:00:00'));
  return planDailyLeft(info, planCounted(rows));
}
const planDay = (day) => new Date(day + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const planMonthStart = () => { const d = new Date(); return planDay(localDate(new Date(d.getFullYear(), d.getMonth() + 1, 1))); };

// Velinin "Kilidi aç" düğmesi: isteği kaydeder (ödeme adımı bağlanana kadar abonelik elle açılır).
function planUnlockButton(info, after) {
  if (info.requested_at) {
    return h('p', { class: 'small quota-asked' }, `✓ İsteğin alındı (${fmtDate(localDate(new Date(info.requested_at)))}). Ödeme adımı için sana yazacağız; plan açılınca burada görünür.`);
  }
  const btn = h('button', { class: 'primary block quota-unlock', onclick: async () => {
    const ok = await askDialog({
      title: 'Aile planı',
      text: `Aile planı ${PLAN_PRICE}: bütün çocuklarında günlük soru, deneme ve soru fotoğrafı sınırı kalkar; kâğıt deneme ve kitap yükleme, kelime kartları, klavye ve kahraman açılır (çocuğun neyle karşılaşacağı kartta yazıyor). İsteğini bırak; ödeme adımı için sana yazacağız. Şimdi hiçbir ödeme alınmaz.`,
      actions: [{ label: 'İsteğimi gönder', value: true, cls: 'primary block' }, { label: 'Vazgeç', value: false }],
      cancel: false,
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await q(sb.from('unlock_requests').insert({ note: null }));
      planForget();
      toast('İsteğin alındı.');
      if (after) after();
    } catch (e) { btn.disabled = false; toast('İstek gönderilemedi: ' + (e.message || e)); }
  } }, `Kilidi aç · ${PLAN_PRICE}`);
  return btn;
}

/* Açmadan önce veli çocuğun neyle karşılaşacağını bilsin (velinin isteği, 2026-11-22: "veliye bunları açmadan önce
   öğrencinin neyle karşılaşacağını bildirelim"). Her özelliğin çocuğun ekranında ne olduğu, kısa ve açık: oyun var mı,
   ne kadar sürer, ne göstermez. Hepsi açıldıktan sonra da Günlük plan'dan çocuk çocuk kapatılır. */
const PLAN_PREVIEW = [
  ['Sınırsız soru ve deneme', 'Günlük soru sayısını Günlük plan\'da siz belirlersiniz; çocuk ana sayfada o kadar soru görür. Uygulamadaki denemeler her gün açıktır.'],
  ['Fotoğraf yükleme', 'Çocuk ya da siz, kâğıt denemesinin, yapamadığı soruların ve okuduğu kitabın fotoğrafını gönderirsiniz; bir saat içinde notlanır, çözümleri yazılır, takıldığı konular tekrarlarına eklenir. Soru fotoğrafı sınırsız; ayda 6 kâğıt deneme ve 2 kitap.'],
  ['İngilizce kelime kartları', 'Ayrı bir "İngilizce" sekmesi: İngilizce kelime, dört Türkçe şık, sesli okuma. Kelime kahramanı kartlarla güçlenir, altın biriktirir, altınla araç ve süs alır (gerçek para yok). Günde kaç kart olacağını siz seçersiniz.'],
  ['Klavye dersleri ve Kelime roketi', 'Bilgisayarda on parmak klavye dersleri. "Kelime roketi" bir oyundur: düşen kelimeleri yazıp vurur, evlerin çatılarını korur; çocuk istediği kadar oynayabilir. Günde kaç ders olacağını siz seçersiniz; oyunu Günlük plan → Oyunlar\'dan kapatabilirsiniz.'],
  ['Asker ya da balerin kahraman', 'Her cevaptan sonra 2-4 saniyelik çizgi film sahnesi: kum torbasına yumruk ve tekme ya da bale. Doğrularla forma numarası artar, madalya kazanır; 100\'de asker olur, oturum sonunda en çok bir dakikalık "uzaylı savaşı" oyunu açılır. Uzaylılar sevimli çizimlerdir: kimse ölmez, yaralanmaz, vurulan uzaylı kapsülüyle kaçar. Gerçek silah, kan ya da ülke düşmanı yok. Oyunu istemezseniz Günlük plan → Oyunlar\'dan kapatırsınız; kahraman ve numarası kalır.'],
];
function planPreview() {
  return h('details', { class: 'quota-preview' },
    h('summary', {}, 'Çocuğunuz neyle karşılaşacak?'),
    h('div', { class: 'stack', style: 'gap: 8px; margin-top: 8px' },
      PLAN_PREVIEW.map(([title, text]) => h('div', {}, h('b', { class: 'small' }, title), h('p', { class: 'small muted' }, text))),
      h('p', { class: 'small' }, 'Kelime kartları, klavye ve kahraman açıldıktan sonra da Günlük plan\'dan çocuk çocuk kapatılır. Çocuğa reklam ya da satın alma teklifi gösterilmez.')));
}

/* Günlük plandaki "Oyunlar" satırı (velinin isteği, 2026-11-22: "oyun açmak istemeyebilir veli, 100'den sonraki oyun
   hoşlarına gitmeyebilir"): veli oyunları çocuk çocuk kapatır; kahraman, antrenman sahneleri ve dersler yerinde kalır.
   value(): kaydedilecek değişiklikler; show(): kaydedilen profili yeniden gösterir. */
function gamesSetting(p) {
  const hero = h('input', { type: 'checkbox', 'aria-label': 'Kahramanın oyunları açık' });
  const rocket = h('input', { type: 'checkbox', 'aria-label': 'Kelime roketi açık' });
  const paint = () => { hero.checked = heroGamesOn(p); rocket.checked = typingGameOn(p); };
  paint();
  const row = h('div', { class: 'stack games-setting', style: 'gap: 4px; padding: 10px 0 4px; border-top: 1px solid var(--rule)' },
    h('b', {}, 'Oyunlar'),
    h('label', { class: 'row small' }, hero, h('span', {}, 'Kahramanın oyunları: asker olunca (100 numaradan sonra) oturum ve deneme sonunda en çok bir dakikalık "uzaylı savaşı"; balerinde 70\'ten sonra "uzaylıyla dans".')),
    h('label', { class: 'row small' }, rocket, h('span', {}, 'Kelime roketi: Klavye sayfasındaki yazma oyunu.')),
    h('p', { class: 'small muted' }, 'Kapatınca yalnızca oyun kartı görünmez; kahraman, numarası, cevaptan sonraki kısa sahneler ve klavye dersleri kalır. Çocuk bu ayarı değiştiremez.'));
  row.value = () => {
    const upd = {};
    if (hero.checked !== heroGamesOn(p)) upd.hero_games = hero.checked;
    if (rocket.checked !== typingGameOn(p)) upd.typing_game = rocket.checked;
    return upd;
  };
  row.show = paint;
  return row;
}

// Velinin Ayarlar'ındaki plan kartı.
function planCard() {
  const box = h('section', { class: 'card stack quota-card', style: 'gap: 8px' }, h('p', { class: 'label' }, 'Plan'), h('p', { class: 'small muted' }, 'Yükleniyor…'));
  const paint = async (force) => {
    const info = await planInfo(force);
    if (info.unknown) { box.hidden = true; return; }
    const kids = [];
    if (info.plan === 'free') {
      kids.push(h('h2', {}, 'Bedava plan'),
        h('p', { class: 'small' }, `Günde ${info.daily_questions} soru (tekrarlar, ek çalışma, konu çalışması ve kitap soruları birlikte), uygulamada haftada ${info.exams_week} deneme, haftada ${info.question_week} soru fotoğrafı ve ayda ${info.paper_month} kâğıt deneme (sıraya girer, sıra gelince işlenir). Kitap yükleme, İngilizce kelime kartları, klavye dersleri ve oyunu, asker ve balerin kahraman kapalı; aşağıdaki ayarların saklanır.`),
        h('p', { class: 'small muted' }, `Aile planı ${PLAN_PRICE}, ailedeki bütün çocuklar için.`),
        planPreview(),
        planUnlockButton(info, () => paint(true)));
    } else if (info.gift) {
      kids.push(h('h2', {}, 'Aile planı'), h('p', { class: 'small muted' }, 'Hediye abonelik: soru, deneme ve yükleme sınırı yok.'));
    } else {
      kids.push(h('h2', {}, 'Aile planı'),
        h('p', { class: 'small' }, 'Soru ve deneme sınırı yok.'),
        h('p', { class: 'small muted' }, `Bu ay ${state.student?.display_name || ''}: ${info.paper_month} kâğıt denemenin ${info.paper_used} tanesi, ${info.books_month} yeni kitabın ${info.books_used} tanesi yüklendi. Haklar her ayın 1'inde yenilenir.`));
    }
    box.replaceChildren(h('p', { class: 'label' }, 'Plan'), ...kids);
  };
  paint(false);
  return box;
}

/* Velinin raporundaki (Yüklemeler) çağrı kartı (velinin isteği, 2026-11-24: "veliye de söylememiz lazım, öğrencinin
   yapamadığı soruları yükle diye"): veli de çocuğunun yapamadığı soruları gönderir. Sınırlı planda haftalık sayaç. */
function planAskCard() {
  const line = h('p', { class: 'small muted quota-line', hidden: true });
  const more = h('p', { class: 'small muted', hidden: true }, 'Aile planında soru fotoğrafı sınırsızdır; kâğıt deneme ve kitap da yüklenir.');
  const btn = h('button', { class: 'primary block', onclick: () => go('ask') }, 'Soru yükle');
  const box = h('section', { class: 'card stack quota-ask', style: 'gap: 8px' },
    h('h2', {}, 'Yapamadığı soruları yükleyin'),
    h('p', { class: 'small' }, 'Çocuğunuzun okulda, ödevde ya da testte yapamadığı soruların fotoğrafını çekip gönderin. Çözümü yazılır; takıldığı konu tekrarlarına eklenir.'),
    line, btn, more);
  planInfo().then((info) => {
    if (planQueued(info)) more.textContent = t('Bedava planda sorular sıraya girer, sıra gelince işlenir. Aile planında bir saat içinde işlenir ve soru fotoğrafı sınırsızdır; kâğıt deneme ve kitap da yüklenir.');
    if (info.question_week == null) return;
    line.textContent = t(`Bu hafta ${info.question_week} soru fotoğrafının ${info.question_used} tanesi gönderildi.`);
    line.hidden = false;
    more.hidden = false;
    if (planQuestionLeft(info) <= 0) btn.disabled = true;
  });
  return box;
}

/* Yükleme sayfasının kilidi: yükleme kapalıysa ya da hakkı dolduysa sayfanın yerine geçen kart; açıksa null.
   kind: 'deneme' | 'soru' | 'okuma' | 'kitap'. Soru fotoğrafı her planda açık (bedavada haftada sınırlı); kâğıt deneme ve
   kitap aile planında. Çocuk yalnızca durumu okur; teklif ve düğme velide. */
function planUploadLock(info, kind) {
  const parent = state.profile?.role === 'parent';
  if (kind === 'soru') {
    if (planQuestionLeft(info) > 0) return null;
    return h('section', { class: 'card stack quota-lock', style: 'gap: 8px; margin-top: 6vh' },
      h('h2', {}, 'Bu haftanın soru fotoğrafları tamam'),
      h('p', { class: 'muted' }, parent
        ? `Bu hafta ${info.question_week} soru fotoğrafı gönderildi; yeni hak pazartesi açılır. Aile planında soru fotoğrafı sınırsızdır, kâğıt deneme ve kitap da yüklenir.`
        : `Bu hafta ${info.question_week} soru fotoğrafı gönderdin. Yeni hak pazartesi açılır.`),
      parent && info.plan === 'free' ? planUnlockButton(info, () => go(state.tab, 'replace')) : null,
      h('button', { class: 'block', onclick: goBack }, 'Geri dön'));
  }
  const free = info.plan === 'free';
  const askBtn = () => (planQuestionLeft(info) > 0
    ? h('button', { class: parent ? 'block quota-ask' : 'primary block quota-ask', onclick: () => go('ask', 'replace') }, parent ? 'Yapamadığı soruları yükle' : 'Soru gönder') : null);
  if (kind !== 'deneme' && !info.uploads) {
    return h('section', { class: 'card stack quota-lock', style: 'gap: 8px; margin-top: 6vh' },
      h('h2', {}, 'Kitap yükleme kapalı'),
      h('p', { class: 'muted' }, parent
        ? `Bedava planda kitap yüklenmez; haftada ${info.question_week} soru fotoğrafı ve ayda ${info.paper_month} kâğıt deneme gönderilir. Aile planında kitap da açılır.`
        : 'Kitap yükleme şu an kapalı. Velin Ayarlar\'dan açabilir. Yapamadığın soruların fotoğrafını gönderebilirsin.'),
      askBtn(),
      parent ? planUnlockButton(info, () => go(state.tab, 'replace')) : null,
      h('button', { class: 'block', onclick: goBack }, 'Geri dön'));
  }
  if (kind === 'deneme' && planPaperLeft(info) <= 0) {
    // Bedavada ayda 1 kâğıt deneme; fazlası aile planında (teklif yalnızca velide).
    return h('section', { class: 'card stack quota-lock', style: 'gap: 8px; margin-top: 6vh' },
      h('h2', {}, 'Bu ayın kâğıt denemeleri tamam'),
      h('p', { class: 'muted' }, free && parent
        ? `Bu ay ${info.paper_month} kâğıt deneme yüklendi; yeni hak ${planMonthStart()} günü açılır. Aile planında daha çok kâğıt deneme ve kitap yüklenir, soru fotoğrafı sınırsızdır.`
        : `Bu ay ${info.paper_month} kâğıt deneme yüklendi. Yeni hak ${planMonthStart()} günü açılır. Uygulamadaki denemeler ve soru fotoğrafları açık.`),
      free ? askBtn() : null,
      free && parent ? planUnlockButton(info, () => go(state.tab, 'replace')) : null,
      h('button', { class: 'block', onclick: goBack }, 'Geri dön'));
  }
  return null;
}
// Yükleme sayfasının başındaki sayaç satırı (ücretli ailede); sınır yoksa null.
function planUploadLine(info, kind) {
  if (kind === 'soru' && info.question_week != null) return h('p', { class: 'small muted quota-line' }, `Bu hafta ${info.question_week} soru fotoğrafının ${info.question_used} tanesi gönderildi.`);
  if (kind === 'deneme' && info.paper_month != null) return h('p', { class: 'small muted quota-line' }, `Bu ay ${info.paper_month} kâğıt denemenin ${info.paper_used} tanesi yüklendi.`);
  if (kind === 'okuma' && info.books_month != null) return h('p', { class: 'small muted quota-line' }, `Bu ay ${info.books_month} yeni kitabın ${info.books_used} tanesi eklendi; eklediğin kitaba sayfa göndermek sayılmaz.`);
  return null;
}
