// Kelime kartlarının listesi (docs/words.json) ve günün kartlarını seçme (wordQueue): node tools/test-words.mjs
// İngilizce kelime çocuğun ilerlemesinin kimliğidir: tekrar etmemeli, önceki sürümdeki hiçbir kelime kaybolmamalı.
// Yanlış şıklar aynı gruptan seçilir: her grupta en az 4 kelime, grupta iki kelimenin Türkçesi aynı olmamalı.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { groups } = JSON.parse(readFileSync(join(root, 'docs', 'words.json'), 'utf8'));
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const pick = (from, to) => {
  const a = app.indexOf(from), b = app.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`bölüm bulunamadı: ${from}`);
  return app.slice(a, b);
};
const today = new Date().toLocaleDateString('sv-SE');
const { wordQueue, WORD_MIX, mixHash } = new Function('localDate', pick('const WORD_MIX', 'async function viewWords')
  + 'return { wordQueue, WORD_MIX, mixHash };')(() => today);

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };
const low = (s) => s.toLocaleLowerCase('tr');
const words = groups.flatMap((g) => g.words);

const badShape = words.filter((w) => !Array.isArray(w) || w.length !== 3 || w.slice(0, 2).some((s) => typeof s !== 'string' || !s || s !== s.trim()) || typeof w[2] !== 'string');
check('her kelime [İngilizce, Türkçe, emoji]', !badShape.length, badShape.slice(0, 5).map((w) => JSON.stringify(w)).join(' '));
const counts = new Map();
for (const [en] of words) counts.set(low(en), (counts.get(low(en)) || 0) + 1);
const twice = [...counts].filter(([, n]) => n > 1).map(([en]) => en);
check('İngilizce kelimeler tekrar etmez (büyük küçük harf ayrımı olmadan)', !twice.length, twice.join(', '));
const small = groups.filter((g) => !g.name || g.words.length < 4).map((g) => g.name || '(adsız)');
check('her grupta en az 4 kelime (3 yanlış şık aynı gruptan)', !small.length, small.join(', '));
const sameMeaning = groups.flatMap((g) => {
  const seen = new Map();
  return g.words.filter(([, tr]) => { const k = low(tr); const dup = seen.has(k); seen.set(k, true); return dup; }).map(([en, tr]) => `${g.name}: ${en}=${tr}`);
});
check('grupta iki kelimenin Türkçesi aynı değil', !sameMeaning.length, sameMeaning.join(', '));

// Önceki sürüm (git HEAD) ile karşılaştırma: kelime silinmez ve yazımı değişmez, yoksa çocuğun ilerlemesi kopar.
let before = null;
try { before = JSON.parse(execFileSync('git', ['show', 'HEAD:docs/words.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
catch (e) { /* git yoksa karşılaştırma atlanır */ }
if (before) {
  const now = new Set(words.map(([en]) => en));
  const lost = before.groups.flatMap((g) => g.words.map(([en]) => en)).filter((en) => !now.has(en));
  check('önceki sürümün kelimelerinin hepsi duruyor', !lost.length, lost.join(', '));
  const order = before.groups.map((g) => g.name).every((name, i) => groups[i]?.name === name);
  check('eski gruplar yerinde, yeniler sonda (yeni kelimeler sırayla gelir)', order);
} else check('önceki sürümle karşılaştırma', true, 'git yok, atlandı');
console.log(`OK   liste: ${groups.length} grup, ${words.length} kelime`);

// wordQueue: önce günü gelen tekrarlar (en eskisi önce), sonra sıradaki yeni kelimeler; bugün cevaplananlar yeniden
// gelmez. Bütün kelimeler görülmüş ve hiçbirinin günü gelmemişse kart çıkmaz.
const list = groups.flatMap((g, group) => g.words.map(([en, tr, emoji]) => ({ en, tr, emoji, group })));
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const prog = (en, due, box = 2) => ({ word: en, due_date: due, box });
let q = wordQueue(list, [prog(list[5].en, day(-2)), prog(list[3].en, day(-1)), prog(list[0].en, day(9))], new Set(), 4);
check('önce günü gelen tekrarlar, en eskisi önce', q[0].en === list[5].en && q[1].en === list[3].en, q.map((w) => w.en).join(','));
check('sonra listedeki ilk görülmemiş kelimeler', q[2].en === list[1].en && q[3].en === list[2].en, q.map((w) => w.en).join(','));
q = wordQueue(list, list.map((w) => prog(w.en, day(30))), new Set(), 40);
check('hepsi görülmüş ve günü gelmemişse kart yok', q.length === 0, `${q.length} kart`);
q = wordQueue(list, list.slice(0, -2).map((w) => prog(w.en, day(30))), new Set([list.at(-1).en]), 40);
check('bugün cevapladığı yeni kelime yeniden gelmez', q.length === 1 && q[0].en === list.at(-2).en, q.map((w) => w.en).join(','));

// Her çocuğa kendi sırası (seed: öğrenci kimliği): kardeşler aynı akşam aynı kelimeleri aynı sırayla görmez, ama sıra
// kolaydan zora kalır: bir kelime en fazla WORD_MIX - 1 grup önce ya da sonra gelir. Örnekte ikisi de ilk 30 grubu
// (386 kelime) görmüş, sıradaki blok baştan başlıyor.
const seen386 = list.slice(0, 386).map((w) => prog(w.en, day(30)));
const turnOf = (s) => Math.floor(WORD_MIX * mixHash(s));
const seeds = Array.from({ length: 400 }, (_, i) => `kardes-${i}`);
const kidA = seeds[0], kidB = seeds.find((s) => turnOf(s) === (turnOf(kidA) + WORD_MIX / 2) % WORD_MIX);
const order = (s, n = list.length) => wordQueue(list, seen386, new Set(), n, s);
const common = (x, y, from, to) => x.slice(from, to).filter((w) => y.slice(from, to).some((v) => v.en === w.en)).length;
const a = order(kidA), b = order(kidB);
check('başka gruptan başlayan iki çocuğun ilk 20 kartı ortak değil', common(a, b, 0, 20) === 0, `ortak ${common(a, b, 0, 20)}`);
const pairs = Array.from({ length: 100 }, (_, i) => [order(seeds[2 * i], 20), order(seeds[2 * i + 1], 20)]);
const avg = pairs.reduce((n, [x, y]) => n + common(x, y, 0, 20), 0) / pairs.length;
check('rastgele iki çocukta ilk 20 kartın ortalama ortağı 20\'nin üçte birinden az', avg < 20 / 3, `ortalama ${avg.toFixed(1)}`);
check('aynı çocuğun sırası her açılışta aynı', order(kidA, 40).every((w, i) => w.en === a[i].en));
check('her yeni kelime bir kez gelir', a.length === list.length - 386 && new Set(a.map((w) => w.en)).size === a.length);
check('bir grubun kelimeleri arka arkaya gelir (yanlış şıklar aynı gruptan)', a.every((w, i) => i === 0 || w.group === a[i - 1].group
  || !a.slice(0, i - 1).some((v) => v.group === w.group)));
let worst = 0;
for (const s of seeds.slice(0, 50)) {
  let maxBefore = -1;
  for (const w of order(s)) { worst = Math.max(worst, maxBefore - w.group); maxBefore = Math.max(maxBefore, w.group); }
}
check(`kolaydan zora: önce gelen kelime en fazla ${WORD_MIX - 1} grup ileriden`, worst < WORD_MIX && a[0].group < 30 + WORD_MIX,
  `en büyük geri dönüş ${worst} grup, ilk kart ${a[0].group}. gruptan`);
q = wordQueue(list, [...seen386, prog(list[7].en, day(-1))], new Set(), 3, kidB);
check('seed varken de önce günü gelen tekrar', q[0].en === list[7].en && q.length === 3);

process.exit(fails ? 1 : 0);
