// Plan sınırlarının kontrolü: node tools/test-plan.mjs
// Günlük soru hakkı (neler sayılır), oturumların kalan hakka kesilmesi (öncelik sırası, yarım kalan madde), uygulamadaki
// denemenin haftalık hakkı, aylık kâğıt deneme ve kitap hakkı, okunamayan planın hiçbir şeyi kısıtlamaması.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs', 'plan.js'), 'utf8');
const pure = src.slice(src.indexOf('/* Plan: saf kısım */'), src.indexOf('/* Plan: ekran */'));
const T = new Function(pure + '\nreturn { PLAN_OPEN, planNorm, planCounted, planDailyLeft, planTrim, planExamWait, planAddDays, planPaperLeft, planBooksLeft, planAllows, heroGamesOn, typingGameOn };')();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };

const FREE = T.planNorm({ plan: 'free', gift: false, daily_questions: 20, exams_week: 1, uploads: false, paper_month: 0, books_month: 0, paper_used: 0, books_used: 0, words: false, typing: false, army: false });
const PAID = T.planNorm({ plan: 'family', gift: false, daily_questions: null, exams_week: null, uploads: true, paper_month: 6, books_month: 2, paper_used: 4, books_used: 2 });
const GIFT = T.planNorm({ plan: 'family', gift: true, daily_questions: null, exams_week: null, uploads: true, paper_month: null, books_month: null, paper_used: 9, books_used: 5 });

check('plan okunamazsa (boş, hata, eksik satır) hiçbir şey kısıtlanmaz ve "bilinmiyor" işaretlenir',
  [null, undefined, {}, 'x'].every((raw) => { const p = T.planNorm(raw); return p.unknown && p.daily_questions === null && p.uploads && T.planDailyLeft(p, 500) === Infinity && T.planPaperLeft(p) === Infinity; }));
check('bedava: günde 20, haftada 1 deneme, yükleme kapalı; ücretli: sınır yok, ayda 6 deneme ve 2 kitap; hediye: hiçbir sınır yok',
  FREE.daily_questions === 20 && FREE.exams_week === 1 && !FREE.uploads && PAID.daily_questions === null && PAID.paper_month === 6 && PAID.books_month === 2
  && GIFT.gift && GIFT.paper_month === null && !FREE.unknown);

const rows = [{ track: 'mistake' }, { track: 'topic' }, { track: 'extra' }, { track: 'practice' }, { track: 'book' }, { track: 'check' }, { track: 'deneme' }, null];
check('günlük sayım: hata, konu, ek, konu çalışması ve kitap sayılır; velinin denemesi (check) ve uygulamadaki deneme sayılmaz',
  T.planCounted(rows) === 5 && T.planCounted(null) === 0, String(T.planCounted(rows)));
check('kalan hak: 20 - çözülen, eksiye düşmez; sınır yoksa Infinity',
  T.planDailyLeft(FREE, 0) === 20 && T.planDailyLeft(FREE, 7) === 13 && T.planDailyLeft(FREE, 20) === 0 && T.planDailyLeft(FREE, 31) === 0
  && T.planDailyLeft(PAID, 999) === Infinity && T.planDailyLeft(GIFT, 999) === Infinity);

const item = (id) => ({ id, track: 'topic' });
const run = (id, n) => Array.from({ length: n }, (_, i) => ({ item: item(id), question: { id: `${id}-${i}` }, last: i === n - 1 }));
const mistake = [...run('m1', 1), ...run('m2', 1), ...run('m3', 1)];
const topic = [...run('t1', 5), ...run('t2', 5)];
const extra = Array.from({ length: 6 }, (_, i) => ({ item: item('e' + i), question: { id: 'x' + i }, last: false, extra: true }));
const book = Array.from({ length: 10 }, (_, i) => ({ item: { id: null, track: 'book' }, question: { id: 'b' + i } }));
const [m, t, x, b] = T.planTrim([mistake, topic, extra, book], 20);
check('kesme: önce hata, sonra konu, ek, kitap; toplam kalan hakkı aşmaz',
  m.length === 3 && t.length === 10 && x.length === 6 && b.length === 1 && m.length + t.length + x.length + b.length === 20,
  [m.length, t.length, x.length, b.length].join());
const [m2, t2, x2, b2] = T.planTrim([mistake, topic, extra, book], 7);
check('kesme: ortadan kesilen maddenin kalan son sorusu maddeyi kapatır (last), öncekiler değişmez; sonrakiler boş',
  m2.length === 3 && t2.length === 4 && t2[3].last === true && t2[2].last === false && t2[3].item.id === 't1' && x2.length === 0 && b2.length === 0
  && topic[3].last === false, JSON.stringify(t2.map((e) => e.last)));
const [, , x3, b3] = T.planTrim([[], [], extra, book], 4);
check('kesme: ek çalışma ve kitap sorusu madde kapatmaz (last eklenmez)',
  x3.length === 4 && x3.every((e) => e.last === false) && b3.length === 0 && !('last' in T.planTrim([book], 3)[0][2]));
check('kesme: hak 0 ise hepsi boş; hak yeterliyse listeler aynen (aynı dizi) döner; sınırsızda dokunulmaz; boş liste sorun çıkarmaz',
  T.planTrim([mistake, topic], 0).every((l) => l.length === 0) && T.planTrim([mistake, topic], 13)[1] === topic
  && T.planTrim([mistake, topic], Infinity)[0] === mistake && T.planTrim([null, mistake], 2)[1].length === 2);

const today = '2026-11-22';
check('haftalık deneme: son 7 günde deneme yoksa açık; varsa o günden 7 gün sonra açılır',
  T.planExamWait(FREE, [], today) === null && T.planExamWait(FREE, [{ exam_date: '2026-11-15' }], today) === null
  && T.planExamWait(FREE, [{ exam_date: '2026-11-16' }], today) === '2026-11-23' && T.planExamWait(FREE, [{ exam_date: today }], today) === '2026-11-29',
  String(T.planExamWait(FREE, [{ exam_date: '2026-11-16' }], today)));
check('haftalık deneme: birden çok denemede en yenisi sayılır; ücretli ve hediyede sınır yok; ay sonu geçişi',
  T.planExamWait(FREE, [{ exam_date: '2026-11-17' }, { exam_date: '2026-11-21' }, { exam_date: '2026-10-01' }], today) === '2026-11-28'
  && T.planExamWait(PAID, [{ exam_date: today }], today) === null && T.planExamWait(GIFT, [{ exam_date: today }], today) === null
  && T.planExamWait(FREE, [{ exam_date: '2026-11-28' }], '2026-11-30') === '2026-12-05' && T.planAddDays('2027-02-28', 1) === '2027-03-01');
check('aylık haklar: ücretli 6 denemeden 4 yüklendiyse 2 kalır, 2 kitaptan 2 eklendiyse 0; hediyede Infinity; bedavada 0',
  T.planPaperLeft(PAID) === 2 && T.planBooksLeft(PAID) === 0 && T.planPaperLeft(GIFT) === Infinity && T.planBooksLeft(GIFT) === Infinity
  && T.planPaperLeft(FREE) === 0 && T.planBooksLeft(FREE) === 0 && T.planPaperLeft({ ...PAID, paper_used: 9 }) === 0);

check('özellikler: bedavada kelime kartları, klavye ve asker kahraman kapalı; ücretli ve hediyede açık; plan bilinmiyorsa ya da alan yoksa açık',
  ['words', 'typing', 'army'].every((f) => !T.planAllows(FREE, f) && T.planAllows(PAID, f) && T.planAllows(GIFT, f) && T.planAllows(null, f) && T.planAllows(T.planNorm(null), f))
  && T.planNorm({ plan: 'free' }).words === true);
check('oyun ayarları: boş ya da true açık, yalnızca false kapalı (kahramanın oyunları ve Kelime roketi ayrı ayrı)',
  T.heroGamesOn({}) && T.heroGamesOn({ hero_games: null }) && T.heroGamesOn({ hero_games: true }) && !T.heroGamesOn({ hero_games: false })
  && T.typingGameOn({}) && !T.typingGameOn({ typing_game: false }) && T.typingGameOn({ hero_games: false }) && T.heroGamesOn(null));

process.exit(fails ? 1 : 0);
