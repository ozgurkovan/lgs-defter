// Adım adım çözümün kontrolü: node tools/test-steps.mjs
// Adımların temizlenmesi (dizi değilse yok, en çok 8, boş yazı atılır), her şekil kalıbının düzgün çizilmesi (bozuk sayı
// yok), sınırlar (çok büyük sayı, çok parça), yazıların kaçışı (yazı içindeki etiket çizime karışmaz), bilinmeyen şekil
// boş, metinde işaretlenen sözcükler.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs', 'steps.js'), 'utf8');
const pure = src.slice(src.indexOf('/* Adımlar: saf kısım'), src.indexOf('/* Adımlar: ekran */'));
const T = new Function(pure + '\nreturn { stepsClean, stepFigure, STEP_MAX };')();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };
const clean = (s) => !/NaN|undefined|Infinity/.test(s);

check('adımlar: dizi değilse ya da boşsa yok; boş yazılı adım atılır; en çok 8; yazı 500 harfle sınırlı',
  T.stepsClean(null) === null && T.stepsClean({}) === null && T.stepsClean([]) === null && T.stepsClean([{ text: '  ' }]) === null
  && T.stepsClean([{ text: 'a' }, { x: 1 }, { text: 'b', fig: 'kötü' }]).length === 2 && T.stepsClean([{ text: 'b', fig: 'kötü' }])[0].fig === null
  && T.stepsClean(Array.from({ length: 12 }, (_, i) => ({ text: `adım ${i}` }))).length === T.STEP_MAX && T.stepsClean([{ text: 'x'.repeat(900) }])[0].text.length === 500);
const figs = {
  numberline: { type: 'numberline', from: 0, to: 36, step: 3, jumps: [{ from: 0, to: 9, label: '+9' }, { from: 9, to: 18, label: '+9' }], marks: [36, { at: 18, label: 'yarısı' }] },
  fraction: { type: 'fraction', bars: [{ parts: 8, filled: 3, label: '3/8' }, { parts: 8, filled: 2 }] },
  bars: { type: 'bars', rows: [{ label: 'Ece', parts: [{ size: 1, text: '12' }] }, { label: 'Elif', parts: [{ size: 1, text: '12', tone: 1 }, { size: 2, text: '24', tone: 1 }] }] },
  grid: { type: 'grid', rows: 3, cols: 4, filled: 7, label: '3 × 4' },
  groups: { type: 'groups', groups: 4, each: 9, extra: 2, label: 'kalan 2' },
  rect: { type: 'shape', kind: 'rect', labels: { top: '8 cm', left: '5 cm' } },
  triangle: { type: 'shape', kind: 'triangle', labels: { bottom: '10', height: 'h' } },
  circle: { type: 'shape', kind: 'circle', labels: { r: '3 cm', d: '6 cm' } },
  table: { type: 'table', head: ['Anlam', 'Örnek'], rows: [['yukarı gitmek', 'Tepeye çıktı.']] },
  mark: { type: 'mark', text: 'Dağın tepesine çıktık.', marks: ['tepesine çıktık'] },
};
const out = Object.fromEntries(Object.entries(figs).map(([k, f]) => [k, T.stepFigure(f)]));
check('her şekil kalıbı çizilir, bozuk sayı yok (sayı doğrusu, kesir, bant, kareli alan, gruplar, dikdörtgen, üçgen, daire, tablo, işaret)',
  Object.values(out).every((s) => s && clean(s)) && ['numberline', 'fraction', 'bars', 'grid', 'groups', 'rect', 'triangle', 'circle'].every((k) => out[k].startsWith('<svg'))
  && out.table.startsWith('<table') && out.mark.includes('<mark>tepesine çıktık</mark>'));
check('sayı doğrusunda Türkçe ondalık virgül, İngilizcede nokta',
  T.stepFigure({ type: 'numberline', from: 0, to: 1, step: 0.5 }).includes('>0,5<') && T.stepFigure({ type: 'numberline', from: 0, to: 1, step: 0.5 }, false).includes('>0.5<'));
const evil = '<script>alert(1)</script>';
const esc = [T.stepFigure({ type: 'table', head: [evil], rows: [[evil]] }), T.stepFigure({ type: 'mark', text: `a ${evil} b`, marks: ['a'] }),
  T.stepFigure({ type: 'fraction', bars: [{ parts: 2, filled: 1, label: evil }] }), T.stepFigure({ type: 'shape', kind: 'rect', labels: { top: evil } }),
  T.stepFigure({ type: 'numberline', from: 0, to: 5, alt: '"><img src=x onerror=alert(1)>' })];
check('yazılar kaçışlı: etiket ya da tırnak çizime karışmaz', esc.every((s) => !s.includes('<script') && !s.includes('<img')));
const huge = [T.stepFigure({ type: 'numberline', from: -1e9, to: 1e9, step: 0.000001 }), T.stepFigure({ type: 'grid', rows: 999, cols: 999 }),
  T.stepFigure({ type: 'groups', groups: 500, each: 500, extra: 500 }), T.stepFigure({ type: 'fraction', parts: 1000, filled: 5000 }),
  T.stepFigure({ type: 'bars', rows: Array.from({ length: 20 }, () => ({ parts: Array.from({ length: 50 }, () => ({ size: 1e12 })) })) })];
check('çok büyük sayılar ve çok parça sınırlanır (sayfa kilitlenmez, çizim bozulmaz)',
  huge.every((s) => s && clean(s) && s.length < 40000) && (huge[1].match(/<rect/g) || []).length === 144 && (T.stepFigure({ type: 'fraction', parts: 1000 }).match(/<rect/g) || []).length === 24);
check('bilinmeyen ya da bozuk şekil boş; şekilsiz adım boş',
  T.stepFigure({ type: 'svg', raw: '<svg/>' }) === '' && T.stepFigure(null) === '' && T.stepFigure('numberline') === ''
  && T.stepFigure({ type: 'bars', rows: [] }) === '' && T.stepFigure({ type: 'table' }) === '' && T.stepFigure({ type: 'mark', text: '' }) === '');

console.log(fails ? `${fails} kontrol başarısız` : '');
process.exit(fails ? 1 : 0);
