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
  'return { TQ_KEY, FINGER_OF, TYPING_LESSONS, typingLines, typingStars, typingStats, typingOpen, typingNext, typingPerDay, TQ_ROWS, localDate };',
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
check('yıldız: %97 üç, %90 iki, %75 bir, altı sıfır', T.typingStars(97, 3) === 3 && T.typingStars(96, 4) === 2 && T.typingStars(90, 10) === 2
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
const none = {}, first = { fj: 1 }, allDone = Object.fromEntries(T.TYPING_LESSONS.map((l, i) => [l.id, i === 5 ? 1 : 3]));
check('ilk ders açık, sonraki bir yıldızla açılır', T.typingOpen(none, 0) && !T.typingOpen(none, 1) && T.typingOpen(first, 1) && !T.typingOpen(first, 2));
check('sıradaki ders: yıldızsız ilk açık ders, hepsi bittiyse en az yıldızlı', T.typingNext(none) === 0 && T.typingNext(first) === 1 && T.typingNext(allDone) === 5);
check('günde kaç ders: ilkokulda 2, sonra kapalı, veli ayarı geçer', T.typingPerDay({ grade: 4 }) === 2 && T.typingPerDay({ grade: 8 }) === 0
  && T.typingPerDay({ grade: 3, daily_typing: 0 }) === 0 && T.typingPerDay({ grade: 8, daily_typing: 5 }) === 5);

process.exit(fails ? 1 : 0);
