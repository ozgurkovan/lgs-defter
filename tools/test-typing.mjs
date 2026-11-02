// Klavye derslerinin kontrolü: node tools/test-typing.mjs
// Derslerdeki her harf o ana kadar öğrenilen tuşlarda mı, satırlar düzgün mü, yıldız ve kahramana katkı doğru mu,
// klavyenin her tuşunun parmağı var mı.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const src = readFileSync(join(root, 'docs', 'typing.js'), 'utf8');
const pick = (text, from, to) => {
  const a = text.indexOf(from), b = text.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`bölüm bulunamadı: ${from}`);
  return text.slice(a, b);
};
const code = [
  pick(app, 'function localDate', 'function parseDay'),
  pick(src, '/* Klavye dersleri: saf kısım', '/* Klavye: ses */'),
  pick(src, 'const TQ_ROWS', 'const KB = '),
  'return { TQ_KEY, FINGER_OF, TYPING_LESSONS, typingLines, typingStars, typingStats, typingOpen, typingNext, typingPerDay, TQ_ROWS, localDate,'
    + ' gameWords, gameLevel, gameFall, gameEvery, gameMax, gameLen, gameWord, GAME_ROOFS, GAME_ROOF_HP,'
    + ' gameRepair, gameSuperWord, gameSuperDue, GAME_SUPER_GAP, GAME_SUPER_SLOW, GAME_DOUBLE_MS, gameVolley, GAME_VOLLEY_MS, GAME_POWER_MAX,'
    + ' gameGuard, GAME_GUARD_S };',
].join('\n');
const T = new Function(code)();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };

// Derslerde yalnızca öğrenilmiş harfler; her kelimede o dersin yeni harflerinden en az biri.
const bad = [];
let known = new Set([' ']);
T.TYPING_LESSONS.forEach((l) => {
  if (l.keys) for (const c of l.keys) known.add(c);
  const allowed = l.stage < 3 ? known : new Set(Object.keys(T.TQ_KEY));
  for (const t of [...(l.drills || []), ...(l.words || []), ...(l.lines || [])]) {
    const wrong = [...t].filter((c) => !allowed.has(c));
    if (wrong.length) bad.push(`${l.id}: "${t}" (${wrong.join('')})`);
  }
  if (l.keys) for (const w of l.words || []) if (![...w].some((c) => l.keys.includes(c))) bad.push(`${l.id}: "${w}" yeni harf yok`);
});
check('dersler yalnızca öğrenilmiş harflerle', !bad.length, bad.slice(0, 6).join(' | '));
check('22 ders, kimlikler tek ve geçerli', T.TYPING_LESSONS.length === 22 && new Set(T.TYPING_LESSONS.map((l) => l.id)).size === 22
  && T.TYPING_LESSONS.every((l) => /^[a-z0-9-]{1,40}$/.test(l.id)));
const allKeys = new Set(T.TYPING_LESSONS.flatMap((l) => [...(l.keys || '')]));
check('alfabenin bütün harfleri ve nokta öğretiliyor', [...'abcçdefgğhıijklmnoöprsştuüvyzqwx.'].every((c) => allKeys.has(c)));
check('her harfin tuşu ve parmağı var', Object.entries(T.TQ_KEY).every(([, c]) => T.FINGER_OF[c] != null));
check('parmaklar: A sol serçe, F sol işaret, J sağ işaret, Ş ve ⌫ sağ serçe, boşluk başparmak',
  T.FINGER_OF.KeyA === 0 && T.FINGER_OF.KeyF === 3 && T.FINGER_OF.KeyJ === 4 && T.FINGER_OF.Semicolon === 7
  && T.FINGER_OF.Backspace === 7 && T.FINGER_OF.Space === 8 && T.TQ_KEY['ı'] === 'KeyI' && T.TQ_KEY.i === 'Quote');
const rowsOk = T.TQ_ROWS.every((row) => row.reduce((n, k) => n + (k[2] || 1), 0) === 15);
const fingersOk = T.TQ_ROWS.flat().every(([c]) => c === 'EnterB' || T.FINGER_OF[c] != null);
check('klavye: her sıra 15 tuş birimi, her tuşun parmağı var', rowsOk && fingersOk, `${T.TQ_ROWS.flat().length - 1} tuş`);

// Satırlar: tohumlu rastgele ile; genişliği aşmaz, boş değil; ilk alıştırma satırı tek alıştırmanın tekrarı.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const lineBad = [];
for (const l of T.TYPING_LESSONS) {
  for (let k = 0; k < 20; k++) {
    const lines = T.typingLines(l, rnd);
    const width = l.lines ? 40 : l.stage === 0 ? 22 : 28;
    if (lines.length < 3 || lines.some((x) => !x || x.length > width || x !== x.trim() || x.includes('  '))) lineBad.push(`${l.id}: ${JSON.stringify(lines)}`);
  }
}
check('satırlar: 3–4 satır, genişliği aşmıyor, boşluklar düzgün', !lineBad.length, lineBad.slice(0, 2).join(' | '));
const asLine = T.typingLines(T.TYPING_LESSONS.find((l) => l.id === 'as'), rnd)[0];
check('"asas asas asas" gibi: ilk satır tek alıştırmanın tekrarı', new Set(asLine.split(' ')).size === 1 && asLine.split(' ').length >= 3, asLine);

// Yıldızlar doğruluğa göre.
check('yıldız: %95 üç, %90 iki, %75 bir, altı sıfır', T.typingStars(95, 5) === 3 && T.typingStars(62, 3) === 3 && T.typingStars(94, 6) === 2 && T.typingStars(90, 10) === 2
  && T.typingStars(89, 11) === 1 && T.typingStars(75, 25) === 1 && T.typingStars(74, 26) === 0 && T.typingStars(0, 0) === 0);

// Kahramana katkı: dersin en iyi sonucu; yıldız başına 1 güç ve 5 altın; günün dersleri bittiği gün 5 altın.
const today = T.localDate();
const at = (d) => `${d}T10:00:00`;
const results = [
  { lesson: 'fj', stars: 1, created_at: at('2026-10-28') }, { lesson: 'fj', stars: 3, created_at: at('2026-10-29') },
  { lesson: 'fj', stars: 2, created_at: at('2026-10-29') }, { lesson: 'dk', stars: 0, created_at: at('2026-10-29') },
  { lesson: 'dk', stars: 2, created_at: at(today) }, { lesson: 'yok', stars: 3, created_at: at(today) },
];
const st = T.typingStats(results, 2);
check('klavye yıldızları kahramana: en iyi sonuç, tekrar şişirmez', st.stars === 5 && st.power === 5 && st.best.fj === 3 && st.best.dk === 2 && !('yok' in st.best),
  JSON.stringify(st.best));
check('klavye altını: yıldız başına 5, günün dersleri bittiği gün 5', st.coins === 5 * 5 + 5, `altın ${st.coins}, bugün ${st.today}`);
check('bugün bitirilen ders sayısı (yıldızlı)', st.today === 1);

// Kilit ve sıradaki ders.
// Önce iyice öğrensin (velinin isteği): sonraki ders üç yıldızla açılır.
const none = {}, two = { fj: 2 }, three = { fj: 3 }, stuck = Object.fromEntries(T.TYPING_LESSONS.map((l, i) => [l.id, i === 5 ? 2 : 3]));
const all3 = Object.fromEntries(T.TYPING_LESSONS.map((l) => [l.id, 3]));
check('ilk ders açık, sonraki üç yıldızla açılır', T.typingOpen(none, 0) && !T.typingOpen(none, 1) && !T.typingOpen(two, 1) && T.typingOpen(three, 1)
  && !T.typingOpen(three, 2) && !T.typingOpen(stuck, 6));
check('sıradaki ders: üç yıldızı olmayan ilk açık ders, hepsi bittiyse sonuncusu', T.typingNext(none) === 0 && T.typingNext(two) === 0
  && T.typingNext(three) === 1 && T.typingNext(stuck) === 5 && T.typingNext(all3) === 21);
check('günde kaç ders: aile açar, açılmadıysa kapalı (her sınıfta)', T.typingPerDay({ grade: 4 }) === 0 && T.typingPerDay({ grade: 8 }) === 0
  && T.typingPerDay({ grade: 3, daily_typing: 0 }) === 0 && T.typingPerDay({ grade: 8, daily_typing: 2 }) === 2);

// Kelime roketi (oyun): kelimeler yalnızca bitirdiği derslerin harflerinden; oyun gittikçe hızlanır ve zorlaşır.
// Çalıştığı harfler: sırayla, en az bir yıldızla bitirdiği derslerin harfleri (ilk bitirmediği derse kadar). Açılmış ama
// yapmadığı dersin harfleri sayılmaz (velinin isteği: oyunda çalışmadığı harfler çıkıyordu).
const lettersOf = (best) => {
  const done = T.TYPING_LESSONS.findIndex((l) => !(best[l.id] > 0));
  return new Set(T.TYPING_LESSONS.slice(0, done < 0 ? undefined : done).flatMap((l) => [...(l.keys || 'abcçdefgğhıijklmnoöprsştuüvyzqwx')]));
};
const onlyKnown = (best) => { const k = lettersOf(best); return T.gameWords(best).every((w) => [...w].every((c) => k.has(c))); };
const first = T.gameWords(two), opened = T.gameWords(three), mid = T.gameWords(stuck), all = T.gameWords(all3);
const fourDone = Object.fromEntries(T.TYPING_LESSONS.slice(0, 4).map((l) => [l.id, 3])); // beşinci ders (G ve H) açık, yapılmadı
check('oyun kelimeleri yalnızca bitirdiği derslerin harflerinden',
  first.length > 0 && first.every((w) => /^[fj]+$/.test(w)) && opened.every((w) => /^[fj]+$/.test(w))
  && onlyKnown(stuck) && onlyKnown(fourDone) && !T.gameWords(fourDone).some((w) => /[gh]/.test(w)),
  `ilk derste ${first.length} kelime, dört ders bitince ${T.gameWords(fourDone).length}`);
check('hiç ders bitirmediyse oyun kelimesi yok (oyun ilk dersten sonra açılır)', T.gameWords(none).length === 0
  && T.gameWords({ fj: 0 }).length === 0 && T.gameWords({ dk: 3 }).length === 0, `${T.gameWords(none).length} kelime`);
check('eşik değişmeden önce bitirdiği ders de sayılır (en az bir yıldız)', mid.length > T.gameWords(fourDone).length && onlyKnown(stuck), `${mid.length} kelime`);
check('oyun kelimeleri: boşluk, nokta, tek harf yok; kelime çoksa tuş alıştırması yok',
  all.every((w) => /^[a-zçğıöşü]{2,}$/u.test(w)) && !all.includes('fff') && !all.includes('yaz geldi.') && all.includes('kedi'), `${all.length} kelime`);
const levels = Array.from({ length: 25 }, (_, i) => i + 1);
const falls = levels.map(T.gameFall), gaps = levels.map(T.gameEvery);
check('oyun gittikçe hızlanır: düşüş 12 sn → en az 4 sn, aralık 3,2 sn → en az 0,9 sn, ekranda en çok 7 kelime',
  falls[0] === 12 && falls.every((f, i) => i === 0 || f <= falls[i - 1]) && Math.min(...falls) === 4 && falls[1] < falls[0]
  && gaps[0] === 3.2 && gaps.every((g, i) => i === 0 || g <= gaps[i - 1]) && Math.min(...gaps) === 0.9
  && T.gameMax(1) === 3 && T.gameMax(25) === 7 && T.gameLevel(0) === 1 && T.gameLevel(5) === 1 && T.gameLevel(6) === 2,
  `seviye 5: ${T.gameFall(5).toFixed(1)} sn düşüş, ${T.gameEvery(5).toFixed(1)} sn aralık`);
seed = 11;
const picks = Array.from({ length: 40 }, () => T.gameWord(all, 1, rnd, new Set(['k', 'a'])));
check('kelime seçimi: başta kısa kelimeler, ekrandakilerden farklı ilk harf; olmazsa kural gevşer',
  picks.every((w) => w.length <= 4 && !'ka'.includes(w[0])) && T.gameWord(['fj', 'jf'], 1, rnd, new Set(['f', 'j'])) != null
  && T.gameWord([], 1, rnd) === null && T.gameLen(1) === 4 && T.gameLen(5) === 99);
check('beş ev, her çatı iki darbe', T.GAME_ROOFS === 5 && T.GAME_ROOF_HP === 2);
// Her yeni seviyede bir çatı onarılır (velinin isteği): önce uçmuş olan, yoksa hırpalanmış olan, eşitse soldaki.
check('yeni seviyede onarılan çatı: önce uçmuş, sonra hırpalanmış, eşitse soldaki; hepsi sağlamsa yok',
  T.gameRepair([2, 2, 2, 2, 2]) === -1 && T.gameRepair([2, 1, 0, 2, 0]) === 2 && T.gameRepair([2, 1, 2, 1, 2]) === 1
  && T.gameRepair([0, 0, 0, 0, 1]) === 0);
// Süper kelime (velinin isteği): arada bir renkli, biraz uzun kelime; vurana süper silah, Ctrl'ye iki kez basınca patlar.
seed = 5;
const sup1 = Array.from({ length: 40 }, () => T.gameSuperWord(all, 1, rnd, new Set(['k', 'a'])));
const sup5 = Array.from({ length: 40 }, () => T.gameSuperWord(all, 5, rnd));
const supFj = Array.from({ length: 20 }, () => T.gameSuperWord(first, 1, rnd));
check('süper kelime biraz uzun: başta 5–8, sonra 7–10 harf, farklı ilk harf; ilk derste kelimeler yan yana (yalnızca F ve J)',
  sup1.every((w) => w.length >= 5 && w.length <= 8 && !'ka'.includes(w[0])) && sup5.every((w) => w.length >= 7 && w.length <= 10)
  && supFj.every((w) => w.length >= 5 && /^[fj]+$/.test(w)) && T.gameSuperWord([], 1, rnd) === null, `${sup1[0]}, ${sup5[0]}, ${supFj[0]}`);
const due = (o) => T.gameSuperDue({ superIn: 0, power: 0, list: [], ...o });
check('süper kelime sırası gelince; silahlar dörde kadar birikir, dördü varken ya da ekranda süper kelime varken gelmez; Ctrl iki basış yarım saniyede',
  due({}) && due({ list: [{ super: false }] }) && !due({ superIn: 3 }) && due({ power: 3 }) && !due({ power: 4 }) && !due({ list: [{ super: true }] })
  && T.GAME_POWER_MAX === 4 && T.GAME_SUPER_GAP === 8 && T.GAME_SUPER_SLOW > 1 && T.GAME_DOUBLE_MS === 500);
// Süper silahın roketleri (velinin isteği): çatısına en yakın kelimeden başlayıp sırayla kalkar; roketi yolda olan atlanır.
const sky = [{ id: 'a', y: 10, ground: 300 }, { id: 'b', y: 250, ground: 300 }, { id: 'c', y: 290, ground: 300, locked: true }, { id: 'd', y: 200, ground: 260 }];
const volley = T.gameVolley(sky).map((w) => w.id).join('');
check('süper silah: roketler çatısına en yakın kelimeden başlar, roketi yolda olan atlanır', volley === 'bda'
  && sky.map((w) => w.id).join('') === 'abcd' && T.gameVolley([]).length === 0 && T.GAME_VOLLEY_MS > 0, volley);
// Son çatı koruması (velinin isteği): tek çatı kalmışken ona çok yaklaşan kelime bir süper silahı kendiliğinden ateşler.
const last = { power: 1, volley: null, roofs: [0, 0, 2, 0, 0] }, near = { house: 2, ground: 300, y: 290, speed: 30 };
check('son çatı: ona çok yaklaşan kelime süper silahı kendiliğinden ateşler; silah yoksa, çatı çoksa, roketler yoldaysa ya da kelime uzaksa ateşlemez',
  T.gameGuard(last, near) && !T.gameGuard(last, { ...near, y: 200 }) && !T.gameGuard({ ...last, power: 0 }, near)
  && !T.gameGuard({ ...last, roofs: [0, 1, 2, 0, 0] }, near) && !T.gameGuard({ ...last, volley: {} }, near)
  && !T.gameGuard(last, { ...near, house: 1 }) && T.GAME_GUARD_S > 0 && T.GAME_GUARD_S <= 1);

process.exit(fails ? 1 : 0);
