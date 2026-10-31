// Konu çalışmasının soru seçimi (practicePick): node tools/test-practice.mjs
// Önce görülmemiş sorular, yetmezse hep doğru yapılmış sorular en eskiden; hata maddelerine ayrılan sorular ve kitap
// soruları hiç gelmez.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const pick = (from, to) => {
  const a = app.indexOf(from), b = app.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`bölüm bulunamadı: ${from}`);
  return app.slice(a, b);
};
const code = [
  pick('function shuffle', 'function toast'),
  pick('const isVariantOf', '/* Sorular sınavdaki gibi'),
  pick('function practicePick', '// ---------------------------------------------------------------- öğrenci: bugün'),
  'return { practicePick, TOPIC_PRACTICE_QUESTIONS: ' + app.match(/const TOPIC_PRACTICE_QUESTIONS = (\d+)/)[1] + ' };',
].join('\n');
const { practicePick, TOPIC_PRACTICE_QUESTIONS } = new Function(code)();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };
const none = { q: new Set(), e: new Set() };
const qs = (prefix, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, topic_id: 't', styles: [`s${i % 4}`], ...extra }));
const seen = (ids, wrong = false, day = '2026-10-01') => new Map(ids.map((id, i) => [id, { at: `${day}T10:0${i % 10}:00`, wrong }]));

check('konu çalışması 10 soru', TOPIC_PRACTICE_QUESTIONS === 10);

// Görülmemiş sorular önce; yetiyorsa daha önce görülenlere hiç dokunulmaz.
const fresh = qs('f', 12), old = qs('o', 5);
let got = practicePick([...fresh, ...old], seen(old.map((p) => p.id)), none, 10);
check('önce görülmemiş sorular', got.length === 10 && got.every((p) => p.id.startsWith('f')), got.map((p) => p.id).join(','));
check('tarzlar çeşitlenir', new Set(got.slice(0, 4).flatMap((p) => p.styles)).size === 4);

// Görülmemiş yetmezse: hep doğru yapılmış sorular, en eski cevaplanandan; yanlış yaptığı sorular gelmez.
const right = qs('r', 4), wrong = qs('w', 3);
const answered = new Map([...seen(right.map((p) => p.id)), ...seen(wrong.map((p) => p.id), true)]);
answered.set('r3', { at: '2026-09-01T08:00:00', wrong: false }); // en eski
got = practicePick([...qs('f', 3), ...right, ...wrong], answered, none, 10);
check('yetmezse doğru yaptıkları, en eskiden', got.length === 7 && got.slice(0, 3).every((p) => p.id.startsWith('f')) && got[3].id === 'r3',
  got.map((p) => p.id).join(','));
check('yanlış yaptığı sorular konu çalışmasına gelmez', !got.some((p) => p.id.startsWith('w')));

// Hata maddelerine ayrılanlar (kaynak soru ve benzerleri) ve kitap soruları gelmez.
const reserved = { q: new Set(['src']), e: new Set(['exam1']) };
const pool = [{ id: 'src', styles: [] }, { id: 'v1', variant_of: 'src', styles: [] }, { id: 'v2', variant_of_exam: 'exam1', styles: [] },
  { id: 'b1', book_id: 'kitap', styles: [] }, { id: 'ok1', styles: [] }, { id: 'ok2', styles: [] }];
got = practicePick(pool, new Map(), reserved, 10);
check('hata maddesine ayrılan ve kitap soruları gelmez', got.map((p) => p.id).sort().join(',') === 'ok1,ok2', got.map((p) => p.id).join(','));

check('boş havuz', practicePick([], new Map(), none, 10).length === 0);
check('en fazla n soru', practicePick(qs('f', 30), new Map(), none, 10).length === 10);

process.exit(fails ? 1 : 0);
