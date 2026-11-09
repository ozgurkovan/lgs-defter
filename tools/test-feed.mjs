// Kahramanı beslemenin kontrolü: node tools/test-feed.mjs
// Bronzun hesabı (doğru cevap, ikramiye, kelime kartı, klavye dersi, oyun sınırı), tokluğun zamanla düşmesi ve
// dondurulması, kahramanın hali ve sözü, yemek fiyatları, kahraman çiziminin aç ve tok halleri.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const src = readFileSync(join(root, 'docs', 'feed.js'), 'utf8');
const pick = (text, from, to) => {
  const a = text.indexOf(from), b = text.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`bölüm bulunamadı: ${from}`);
  return text.slice(a, b);
};
const T = new Function([
  pick(src, '/* Besleme: saf kısım', '/* Besleme: ekran */'),
  pick(app, 'const HERO_LOOK = {', '// Yolculuğun yerleri'),
  'return { FEED_START, FEED_DECAY, FEED_WORDS_PER, FEED_GAME_CHARS, FEED_FOODS, feedOn, feedStart, feedPaused, feedPrice, feedEarned,'
    + ' feedActiveMs, feedSatiety, feedMood, feedPick, feedSay, heroSvg };',
].join('\n'))();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };
const day = 86400000, t0 = +new Date('2026-11-10T08:00:00+03:00');
const iso = (ms) => new Date(ms).toISOString();

check('besleme 7. sınıfa kadar açık gelir, 8. sınıftan sonra kapalı; velinin seçimi her sınıfta geçerli',
  T.feedOn({ grade: 3 }) && T.feedOn({ grade: 7 }) && !T.feedOn({ grade: 8 }) && !T.feedOn({}) && T.feedOn({ grade: 8, hero_feed: true })
  && !T.feedOn({ grade: 3, hero_feed: false }));
check('başlangıç: veli sonradan açtıysa o an, yoksa beslemenin başladığı gün',
  T.feedStart({}) === T.FEED_START && T.feedStart({ hero_feed_at: '2026-12-01T10:00:00Z' }) === '2026-12-01T10:00:00Z'
  && T.feedStart({ hero_feed_at: '2026-01-01T10:00:00Z' }) === T.FEED_START);

// Bronz: günde 35 soruluk plan (ikramiye 4 + 4, klavye dersi 2, oyun en çok 4).
const e = T.feedEarned([
  { day: '2026-11-10', answered: 35, correct: 20, words: 9, lessons: 3, game_chars: 1000 },
  { day: '2026-11-11', answered: 18, correct: 10, words: 2, lessons: 1, game_chars: 79 },
  { day: '2026-11-12', answered: 17, correct: 17, words: 0, lessons: 0, game_chars: 0 },
], 35, 2);
check('bronz: her doğru cevap 1; planın yarısında ve tamamında ikramiye; dört kelime kartı 1; klavye dersi günlük sayıya kadar; oyun sınırlı',
  e.correct === 47 && e.bonus === 12 && e.words === 2 && e.typing === 6 && e.game === 5 && e.total === 72 && e.half === 4 && e.lesson === 2 && e.gameCap === 4,
  JSON.stringify(e));
const big = T.feedEarned([{ answered: 105, correct: 80, words: 0, lessons: 4, game_chars: 5000 }], 105, 4);
check('bronz plana göre: günde 105 soruda ikramiye 11 + 11, klavye dersi 5, oyun en çok 11; klavye kapalıysa ders bronzu yok',
  big.bonus === 22 && big.typing === 20 && big.game === 11 && T.feedEarned([{ answered: 0, correct: 0, lessons: 5 }], 105, 0).typing === 0, JSON.stringify(big));
check('bronz: boş liste sıfır, eksik alanlar sayılmaz', T.feedEarned([], 35, 2).total === 0 && T.feedEarned(null, 35, 2).total === 0
  && T.feedEarned([{ correct: 3 }], 35, 2).total === 3);

// Fiyatlar plana göre; planını yapan çocuk kahramanını doyurabilmeli.
const price = (id, unit) => T.feedPrice(T.FEED_FOODS.find((f) => f.id === id), unit);
check('fiyat günlük plana göre, en az 1 bronz', price('sut', 35) === 4 && price('sut', 105) === 13 && price('elma', 35) === 2 && price('yemek', 35) === 14
  && price('elma', 3) === 1, [price('sut', 35), price('sut', 105), price('elma', 35), price('yemek', 35)].join());
const ids = T.FEED_FOODS.map((f) => f.id);
check('yemekler: süt, kahvaltı, yemek, hamburger, pasta rafta; kimlikler farklı ve veritabanı kuralına uygun',
  ['sut', 'kahvalti', 'yemek', 'hamburger', 'pasta'].every((id) => ids.includes(id)) && new Set(ids).size === ids.length
  && ids.every((id) => /^[a-z0-9-]{1,40}$/.test(id)) && T.FEED_FOODS.every((f) => f.value > 0 && f.value <= 100 && f.k > 0));
for (const unit of [20, 35, 105]) {
  // Planın tamamını %60 doğruyla çözen çocuk: doğrular + ikramiye. Bir günün açlığını (FEED_DECAY) asıl yemeklerle kapatabilmeli.
  const income = T.feedEarned([{ answered: unit, correct: Math.round(unit * 0.6) }], unit, 0).total;
  const meals = T.FEED_FOODS.filter((f) => !f.treat).sort((a, b) => b.value - a.value);
  let left = income, got = 0;
  for (let guard = 0; guard < 50 && got < T.FEED_DECAY; guard++) {
    const f = meals.find((x) => T.feedPrice(x, unit) <= left);
    if (!f) break;
    left -= T.feedPrice(f, unit); got += f.value;
  }
  check(`günde ${unit} soruluk planı %60 doğruyla bitiren çocuk kahramanını bir gün doyurur`, got >= T.FEED_DECAY, `gelir ${income}, doyurdu ${got}, artan ${left}`);
  // Planın dörtte birini çözen çocuk tam doyuramaz (emekle orantılı).
  const low = T.feedEarned([{ answered: Math.floor(unit / 4), correct: Math.floor(unit / 4) }], unit, 0).total;
  const cheapest = Math.min(...meals.map((f) => T.feedPrice(f, unit) / f.value));
  check(`günde ${unit} soruluk planın dörtte biri bir günün açlığını kapatmaz`, low / cheapest < T.FEED_DECAY, `gelir ${low}`);
}

// Tokluk: günde FEED_DECAY düşer; hiç yemediyse başlangıçta tam tok; dondurulan süre sayılmaz.
const sat = (last, now, pauses) => T.feedSatiety(last, iso(t0), now, pauses);
check('tokluk: başta tam tok, bir günde yarıya iner, iki günde biter, sıfırın altına inmez',
  sat(null, t0) === 100 && sat(null, t0 + day) === 50 && sat(null, t0 + 2 * day) === 0 && sat(null, t0 + 9 * day) === 0);
check('tokluk son yemekten sayılır: yedikten sonraki tokluktan geçen süre kadar düşer',
  sat({ after: 80, at: iso(t0 + 3 * day) }, t0 + 3 * day + day / 2) === 55 && sat({ after: 100, at: iso(t0) }, t0 - 1000) === 100);
check('açlık dondurulunca tokluk düşmez; açılınca kaldığı yerden devam eder',
  sat(null, t0 + 3 * day, [[iso(t0 + day / 2), null]]) === 75
  && sat(null, t0 + 3 * day, [[iso(t0 + day / 2), iso(t0 + 2.5 * day)]]) === 50
  && sat(null, t0 + day, [[iso(t0 - 5 * day), iso(t0 - 4 * day)]]) === 50 && sat(null, t0 + day, 'bozuk') === 50 && sat(null, t0 + day, [null, [], [null, null]]) === 50);
check('dondurulmuş mu: bitişi olmayan aralık varsa', T.feedPaused({ hero_pauses: [['2026-11-10T00:00:00Z', null]] })
  && !T.feedPaused({ hero_pauses: [['2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z']] }) && !T.feedPaused({}) && !T.feedPaused({ hero_pauses: 'x' }));

// Hal ve söz
const moods = [100, 70, 69, 40, 39, 15, 14, 0].map((s) => T.feedMood(s).key).join();
check('hal: 70 ve üstü mutlu, 40 ve üstü iyi, 15 ve üstü aç, altı çok aç', moods === 'mutlu,mutlu,iyi,iyi,ac,ac,cokac,cokac', moods);
check('pazıların dolgunluğu toklukla artar, 0,2 ile 1 arasında kalır',
  T.feedMood(0).form === 0.2 && T.feedMood(100).form === 1 && T.feedMood(70).form === 1 && T.feedMood(20).form < T.feedMood(50).form);
check('parasının yettiği en doyurucu asıl yemeği seçer; yetmiyorsa keyif yiyeceği, o da yoksa hiçbiri',
  T.feedPick(100, 35).id === 'yemek' && T.feedPick(13, 35).id === 'kahvalti' && T.feedPick(4, 35).id === 'sut' && T.feedPick(2, 35).id === 'elma'
  && T.feedPick(1, 35) === null);
const say = (sat, balance, paused = false) => T.feedSay({ sat, balance, unit: 35, paused });
const all = [say(90, 0), say(50, 0), say(50, 9), say(30, 0), say(30, 9), say(5, 0), say(5, 9), say(5, 9, true)];
check('söz: tokken teşekkür eder; parası yetiyorsa yemek ister; yetmiyorsa kaç doğru cevap kaldığını söyler; dondurulunca dinlenir',
  /Teşekkür/.test(all[0]) && /çalışalım mı/.test(all[1]) && /9 bronzun var\. Bana kahvaltı alır mısın/.test(all[2]) && /2 doğru cevapla elma/.test(all[3])
  && /^Acıktım! .*kahvaltı alır mısın/.test(all[4]) && /yardım eder misin\? 2 doğru cevapla elma/.test(all[5]) && /Dinleniyorum/.test(all[7]), all[5]);
// Kahraman yardım ister, suçlamaz (velinin isteği).
check('söz suçlamaz: "senin yüzünden", "çalışmadın", "tembel" gibi sözler yok', all.every((t) => !/yüzünden|çalışmadın|tembel|ihmal|kötü/i.test(t)));

// Çizim: mood verilmezse eski çizim; aç ve çok aç halleri farklı ama her zaman yanaklı, gözyaşı yok.
const looks = [null, { kas: 'kalin', agiz: 'disli', gozluk: 'yuvarlak' }, { model: 'uzun', agiz: 'yamuk' }];
let same = true, differ = true, cute = true;
for (const g of ['kiz', 'erkek']) for (const L of [0, 3, 6, 10]) for (const lk of looks) {
  const plain = T.heroSvg(g, L, lk);
  if (T.heroSvg(g, L, lk, undefined) !== plain) same = false;
  const pics = ['mutlu', 'iyi', 'ac', 'cokac'].map((key, i) => T.heroSvg(g, L, lk, { key, form: [1, 0.8, 0.5, 0.2][i] }));
  if (new Set(pics).size !== 4 || pics.includes(plain) && pics.indexOf(plain) !== 1 && L > 0) differ = false;
  if (!pics.every((p) => p.includes('#F79E9E') && p.startsWith('<svg class="hero"') && !/💧|😢|😭/u.test(p))) cute = false;
}
check('çizim: besleme kapalıyken kahraman eskisiyle aynı', same);
check('çizim: tok, iyi, aç ve çok aç halleri birbirinden farklı', differ);
check('çizim: her halde pembe yanaklı, gözyaşı yok (kahraman hep sevimli)', cute);

process.exit(fails ? 1 : 0);
