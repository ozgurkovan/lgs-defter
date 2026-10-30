// Tekrar takviminin (gradeItem) örnek senaryolarla kontrolü: node tools/test-schedule.mjs
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const pick = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const code = [
  pick('const SUBJECTS', '// Hata takibi:'),
  pick('const MISTAKE_LADDER', 'const REASONS'),
  pick('function localDate', 'function fmtDate'),
  pick('function gradeItem', '/* Bugünün oturumunu'),
  pick('/* Sorular sınavdaki gibi', '// ---------------------------------------------------------------- öğrenci: bugün'),
  pick('/* Tekrar zamanı: FSRS', 'const wordsPerDay'),
  pick('/* Kelime kahramanı', '// Mağaza:'),
  'return { gradeItem, localDate, addDays, SUBJECTS, examOrder, dailyPlan, planTotal, nextWordBox, nextWordState, wordDays, fitWordScale, heroLevel, heroCoins, heroBest, heroPower, heroCap };',
].join('\n');
const { gradeItem, localDate, addDays, SUBJECTS, examOrder, dailyPlan, planTotal, nextWordBox, nextWordState, wordDays, fitWordScale, heroLevel, heroCoins, heroBest, heroPower, heroCap } = new Function(code)();

// Soru süreleri LGS oturum sürelerine eşit olmalı: sözel 50 soru / 75 dk, sayısal 40 soru / 80 dk.
const counts = { turkce: 20, inkilap: 10, din: 10, ingilizce: 10, matematik: 20, fen: 20 };
const total = (list) => list.reduce((s, k) => s + counts[k] * SUBJECTS[k].sec, 0) / 60;

const today = localDate();
const lgs = '2027-06-13';
const ok = (r) => [{ correct: true, strong: r !== 'weak' }];
const wrong = [{ correct: false, strong: false }];
let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };

check('sözel oturum 75 dk', total(['turkce', 'inkilap', 'din', 'ingilizce']) === 75, `${total(['turkce', 'inkilap', 'din', 'ingilizce'])} dk`);
check('sayısal oturum 80 dk', total(['matematik', 'fen']) === 80, `${total(['matematik', 'fen'])} dk, fen ${SUBJECTS.fen.sec} sn/soru`);

// Hata takibi: hep rahat doğru → 2, 4, 14, 30 gün sonra bitiş (ease küçük artar)
let it = { track: 'mistake', step: 0, ease: 1, consecutive_wrong: 0 };
const gaps = [];
for (let i = 0; i < 5; i++) { it = { ...it, ...gradeItem(it, ok(), lgs) }; gaps.push(it.interval_days + (it.state === 'done' ? '(bitti)' : '')); }
check('hata takibi merdiveni', it.state === 'done', gaps.join(' → '));

// Yanlış → başa döner, ertesi gün
it = { track: 'mistake', step: 3, ease: 1, consecutive_wrong: 0 };
it = { ...it, ...gradeItem(it, wrong, lgs) };
check('yanlışta başa dönüş', it.step === 0 && it.interval_days === 1 && it.due_date === addDays(today, 1), `step ${it.step}, ${it.interval_days} gün, ease ${it.ease}`);

// Yavaş/emin değil doğru → aralık aynı
it = { track: 'mistake', step: 2, ease: 1, consecutive_wrong: 1 };
it = { ...it, ...gradeItem(it, ok('weak'), lgs) };
check('zayıf doğruda aralık aynı', it.step === 2 && it.interval_days === 4 && it.consecutive_wrong === 0, `${it.interval_days} gün`);

// Üç yanlış üst üste → consecutive_wrong 3 (konu eksiği işareti)
it = { track: 'mistake', step: 0, ease: 1, consecutive_wrong: 0 };
for (let i = 0; i < 3; i++) it = { ...it, ...gradeItem(it, wrong, lgs) };
check('3 yanlış üst üste', it.consecutive_wrong === 3);

// Konu tekrarı Fibonacci
it = { track: 'topic', step: 0, ease: 1, consecutive_wrong: 0 };
const fib = [];
for (let i = 0; i < 9; i++) { it = { ...it, ...gradeItem(it, [{ correct: true, strong: true }, { correct: true, strong: true }], '2030-06-01') }; fib.push(it.interval_days); }
check('konu tekrarı aralıkları', fib[0] === 3 && fib[fib.length - 1] >= 55, fib.join(' → '));

// Konu tekrarında yanlış → iki basamak geri
it = { track: 'topic', step: 5, ease: 1, consecutive_wrong: 0 };
it = { ...it, ...gradeItem(it, [{ correct: true, strong: true }, { correct: false, strong: false }], '2030-06-01') };
check('konu tekrarında yanlış', it.step === 3, `step ${it.step}, ${it.interval_days} gün`);

// Emin olma ölçeği
it = { track: 'topic', step: 4, ease: 1, consecutive_wrong: 0 };
let g = gradeItem(it, [{ correct: true, strong: true, confidence: 100 }], '2030-06-01');
check('tam emin doğru: aralık uzar, destek yok', g.step === 5 && g.support === 0, `step ${g.step}, ${g.interval_days} gün`);
g = gradeItem(it, [{ correct: true, strong: false, confidence: 75 }], '2030-06-01');
check('%75 emin doğru: aralık aynı, 1 destek', g.step === 4 && g.support === 1, `step ${g.step}, ${g.interval_days} gün`);
g = gradeItem(it, [{ correct: true, strong: false, confidence: 50 }], '2030-06-01');
check('tahmine yakın doğru: bir basamak geri, 2 destek', g.step === 3 && g.support === 2, `step ${g.step}, ${g.interval_days} gün`);
g = gradeItem(it, [{ correct: false, strong: false, confidence: 100 }], '2030-06-01');
check('emin ama yanlış: kavram yanılgısı notu', g.step === 2 && g.support === 2 && g.note.includes('kavram'), g.note);

// Sınav yakınken uzun aralık son tekrara çekilir
const nearLgs = addDays(today, 40);
it = { track: 'topic', step: 6, ease: 1, consecutive_wrong: 0 };
it = { ...it, ...gradeItem(it, [{ correct: true, strong: true }], nearLgs) };
check('sınav öncesi son tekrar', it.due_date === addDays(nearLgs, -10), `${it.due_date} (sınav ${nearLgs})`);

// Oturum soruları LGS kitapçık sırasıyla gruplanır; ders içinde müfredat sırası, destek soruları yan yana.
const e = (subject, sort, id) => ({ item: { topics: { subject, sort } }, question: { subject, id } });
const mixed = [e('fen', 2, 'f2'), e('turkce', 5, 't5'), e('matematik', 1, 'm1'), e('fen', 1, 'f1a'), e('fen', 1, 'f1b'),
  e('ingilizce', 1, 'i1'), e('turkce', 2, 't2'), e('din', 1, 'd1'), e('inkilap', 3, 'k3')];
const ordered = examOrder(mixed).map((x) => x.question.id).join(' ');
check('sınav sırasıyla gruplama', ordered === 't2 t5 k3 d1 i1 m1 f1a f1b f2', ordered);

// LGS'de sık çıkan konu (yılda 2+ soru) 21 günden uzun aralığa düşmez; seyrek konu normal merdivenle gider.
const freq = gradeItem({ track: 'topic', step: 6, ease: 1, consecutive_wrong: 0, topics: { lgs_avg: 3 } }, [{ correct: true, strong: true }], '2030-06-01');
const rare = gradeItem({ track: 'topic', step: 6, ease: 1, consecutive_wrong: 0, topics: { lgs_avg: 1 } }, [{ correct: true, strong: true }], '2030-06-01');
check('sık çıkan konu en çok 21 gün', freq.interval_days === 21 && rare.interval_days > 21, `sık ${freq.interval_days} gün, diğer ${rare.interval_days} gün`);

// Seyrek konu (yılda < 0,5 soru): aralık velinin seçtiği kat kadar açılır; kat 1 iken normal.
const seyrek = { track: 'topic', step: 4, ease: 1, consecutive_wrong: 0, topics: { lgs_avg: 0.1 } };
const s1 = gradeItem(seyrek, [{ correct: true, strong: true }], '2030-06-01', 1);
const s2 = gradeItem(seyrek, [{ correct: true, strong: true }], '2030-06-01', 2);
const sw = gradeItem(seyrek, [{ correct: false, strong: false }], '2030-06-01', 2);
check('seyrek konu aralığı 2 kat', s2.interval_days === s1.interval_days * 2, `normal ${s1.interval_days} gün, 2 kat ${s2.interval_days} gün`);
check('seyrek konuda yanlışta yine kısalır', sw.interval_days < s1.interval_days, `yanlışta ${sw.interval_days} gün`);

// Varsayılan günlük plan 40 soruyu LGS ağırlığıyla böler; velinin planı varsa o kullanılır.
check('varsayılan plan 40 soru', planTotal(dailyPlan({ daily_questions: 40 })) === 40, JSON.stringify(dailyPlan({})));
// Velinin yazdığı sayı geçerli; planda hiç olmayan ders (sonradan açılan) varsayılan payını alır, 0 yazılmışsa 0 kalır.
const veli = dailyPlan({ daily_by_subject: { matematik: 15, din: 0 } });
check('velinin planı', veli.matematik === 15 && veli.din === 0 && veli.fen === 9, JSON.stringify(veli));
// İlkokul: LGS dersleri yok, varsayılan 20 soru Türkçe ve Matematik ağırlıklı bölünür.
const g3 = dailyPlan({ grade: 3, daily_questions: 20 });
check('3. sınıf dersleri', Object.keys(g3).join(',') === 'turkce,matematik,hayat,fen,ingilizce', JSON.stringify(g3));
check('3. sınıf 20 soru', planTotal(g3) === 20 && g3.turkce > g3.ingilizce, `toplam ${planTotal(g3)}`);
check('3+4. sınıf 40 soru tam', planTotal(dailyPlan({ grade: 3, extra_grades: [4], daily_questions: 40 })) === 40);
// 3. sınıf + 4. sınıf konuları açık: Sosyal ve Din de plana girer.
const g34 = dailyPlan({ grade: 3, extra_grades: [4], daily_questions: 20 });
check('3. sınıf + 4. sınıf dersleri', Object.keys(g34).join(',') === 'turkce,matematik,hayat,fen,sosyal,ingilizce,din', JSON.stringify(g34));

// Kelime kartları (FSRS). Her tekrar, kelimenin günü geldiğinde yapılmış sayılır (geçen gün = önceki aralık).
const chain = (grades) => {
  let st = null;
  return grades.map((g) => { st = nextWordState(st, g, st ? wordDays(st.stability) : 0); return { ...st, days: wordDays(st.stability) }; });
};
// İlk görüş: tamamen emin 110 gün ("yes" sürekli gelmesin), büyük ölçüde emin 4 gün, kararsız ya da yanlış yarın.
const first = (g) => wordDays(nextWordState(null, g, 0).stability);
check('kelime: ilk görüş aralıkları', first(4) === 110 && first(3) === 4 && first(2) === 1 && first(1) === 1,
  `tamamen ${first(4)}, büyük ölçüde ${first(3)}, kararsız ${first(2)}, yanlış ${first(1)} gün`);
// Bildikçe aralık açılır, üst sınır yok.
const good = chain([3, 3, 3, 3, 3, 3, 3, 3]).map((x) => x.days);
check('kelime: bildikçe açılır, üst sınır yok', good.every((g, i) => !i || g > good[i - 1]) && good.at(-1) > 730, good.join(' → ') + ' gün');
const yes = chain([4, 4, 4]).map((x) => x.days);
check('kelime: "yes" gibi bilinen kelime hızla seyrekleşir', yes[0] === 110 && yes[1] > 365 && yes[2] > yes[1], yes.join(' → ') + ' gün');
// Yanlış o kelimenin sınırını gösterir: aralık sınırın altına çekilir, kelime zorlaşır, sonra yeniden açılır.
const known = chain([3, 3, 3, 3, 3]).at(-1);
const lapsed = nextWordState(known, 1, known.days);
const regrow = nextWordState(lapsed, 3, wordDays(lapsed.stability));
check('kelime: unutunca aralık sınırın altına çekilir', wordDays(lapsed.stability) < known.days / 4 && lapsed.difficulty > known.difficulty,
  `${known.days} gün → unuttu → ${wordDays(lapsed.stability)} gün, zorluk ${known.difficulty.toFixed(1)} → ${lapsed.difficulty.toFixed(1)}`);
check('kelime: unuttuktan sonra yeniden açılır', wordDays(regrow.stability) > wordDays(lapsed.stability),
  `${wordDays(lapsed.stability)} → ${wordDays(regrow.stability)} gün`);
// Çocuğun hafızası: tahminden çabuk unutuyorsa katsayı 1'in altında, iyi hatırlıyorsa üstünde; az veriyle 1.
const synth = (n, after, rate) => Array.from({ length: n }, (_, i) => ({ stability_before: 10, elapsed_days: 10 * after, correct: i < n * rate }));
const kForget = fitWordScale(synth(60, 1, 0.6)), kGood = fitWordScale(synth(60, 3, 1)), kFew = fitWordScale(synth(5, 1, 0));
check('kelime: hafıza katsayısı', kForget < 0.8 && kGood > 1.2 && kFew === 1,
  `çabuk unutan ×${kForget.toFixed(2)}, iyi hatırlayan ×${kGood.toFixed(2)}, az veri ×${kFew}`);
check('kelime: seviye (kart türü için)', nextWordBox(0, true, 100) === 2 && nextWordBox(5, true, 50) === 4 && nextWordBox(9, false, 100) === 1);

// Kelime kahramanı: güç kelime gücüyle artar (0–10). Köyden sonrasına araç götürür (araba, denizaltı, hovercraft, uçak,
// roket; sırayla): aracı yoksa güç bir öncekinde durur, aracı alınca yetiştiği yere çıkar; sırayı atlayan araç işe yaramaz.
// Kelime gücü: her kelime en yüksek kararlılığının 7'de biri, en çok 1; unutulan kelime gücü düşürmez.
// Altın ilk denemede doğru kartlardan ve günün kartlarını bitirmekten gelir, emin olma ölçeğinden bağımsız; oturum sonu
// tekrarı altın vermez; harcadığı düşülür.
check('kahraman: güç seviyeleri', heroLevel(0) === 0 && heroLevel(4) === 0 && heroLevel(5) === 1 && heroLevel(29) === 2 && heroLevel(290) === 10 && heroLevel(2000) === 10);
const rides = (...ids) => heroCap(new Set(ids));
check('kahraman: araçlar sırayla götürür', rides() === 3 && rides('araba') === 5 && rides('araba', 'ucak') === 5 && rides('araba', 'denizalti') === 7
  && rides('araba', 'denizalti', 'hovercraft', 'ucak') === 9 && rides('araba', 'denizalti', 'hovercraft', 'ucak', 'roket') === 10,
  [rides(), rides('araba'), rides('araba', 'ucak'), rides('araba', 'denizalti')].join(' '));
check('kahraman: aracı yoksa güç durur, alınca yetişir', heroLevel(29, rides()) === 2 && heroLevel(290, rides()) === 3 && heroLevel(105, rides('araba')) === 5
  && heroLevel(140, rides('araba')) === 5 && heroLevel(140, rides('araba', 'denizalti')) === 7);
const best = heroBest(
  [{ word: 'yeni', stability: 3.5 }, { word: 'unuttu', stability: 1.2 }, { word: 'eski', stability: null, box: 2 }, { word: 'bilir', stability: 40 }],
  [{ word: 'unuttu', stability_before: 15 }, { word: 'unuttu', stability_before: 4 }, { word: 'yeni', stability_before: null }]);
const power = heroPower(best);
check('kahraman: kelime gücü', Math.abs(power - 3.5) < 1e-9 && best.get('unuttu') === 15, `güç ${power}`);
const at = (h) => `2026-10-${h}T10:00:00`;
const ans = [
  { word: 'a', correct: true, again: false, answered_at: at(28) }, { word: 'b', correct: true, again: false, answered_at: at(28) },
  { word: 'c', correct: false, again: false, answered_at: at(28) }, { word: 'c', correct: true, again: true, answered_at: at(28) },
  { word: 'd', correct: true, again: false, answered_at: at(29) },
];
const coins = heroCoins(ans, [{ item: 'top', price: 2 }], 3);
check('kahraman: altın', coins.earned === 3 + 5 && coins.spent === 2 && coins.balance === 6, JSON.stringify(coins));

process.exit(fails ? 1 : 0);
