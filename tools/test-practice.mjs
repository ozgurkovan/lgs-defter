// Konu çalışmasının soru seçimi (practicePick): node tools/test-practice.mjs
// Önce görülmemiş sorular, ama konunun 10 görülmemiş sorusu günlük tekrarlara kalır; yetmezse hep doğru yapılmış sorular
// en eskiden. Hata maddelerine ayrılan sorular ve kitap soruları hiç gelmez.
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
  'const PRACTICE_KEEP_UNSEEN = ' + app.match(/const PRACTICE_KEEP_UNSEEN = (\d+)/)[1] + ';',
  pick('function practicePick', '// ---------------------------------------------------------------- öğrenci: bugün'),
  'return { practicePick, similarPick, PRACTICE_KEEP_UNSEEN, TOPIC_PRACTICE_QUESTIONS: ' + app.match(/const TOPIC_PRACTICE_QUESTIONS = (\d+)/)[1] + ' };',
].join('\n');
const { practicePick, similarPick, PRACTICE_KEEP_UNSEEN, TOPIC_PRACTICE_QUESTIONS } = new Function(code)();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };
const none = { q: new Set(), e: new Set() };
const qs = (prefix, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, topic_id: 't', styles: [`s${i % 4}`], ...extra }));
const seen = (ids, wrong = false, day = '2026-10-01') => new Map(ids.map((id, i) => [id, { at: `${day}T10:0${i % 10}:00`, wrong }]));

check('konu çalışması 10 soru, 10 görülmemiş soru tekrarlara kalır', TOPIC_PRACTICE_QUESTIONS === 10 && PRACTICE_KEEP_UNSEEN === 10);

// Görülmemiş sorular önce (velinin seçimi); yetiyorsa daha önce görülenlere hiç dokunulmaz.
const fresh = qs('f', 25), old = qs('o', 5);
let got = practicePick([...fresh, ...old], seen(old.map((p) => p.id)), none, 10);
check('önce görülmemiş sorular', got.length === 10 && got.every((p) => p.id.startsWith('f')), got.map((p) => p.id).join(','));
check('tarzlar çeşitlenir', new Set(got.slice(0, 4).flatMap((p) => p.styles)).size === 4);

// Günlük tekrarlar (konu ve hata tekrarı) yalnızca görülmemiş soru alır: konunun 10 görülmemiş sorusu onlara kalır.
got = practicePick(qs('f', 12), new Map(), none, 10);
check('10 görülmemiş soru günlük tekrarlara kalır', got.length === 2, `${got.length} soru alındı`);
check('görülmemiş soru 10 ya da azsa hiçbirine dokunulmaz', practicePick(qs('f', 10), new Map(), none, 10).length === 0
  && practicePick(qs('f', 4), new Map(), none, 10).length === 0);

// Görülmemiş yetmezse: hep doğru yapılmış sorular, en eski cevaplanandan; yanlış yaptığı sorular gelmez.
const right = qs('r', 4), wrong = qs('w', 3);
const answered = new Map([...seen(right.map((p) => p.id)), ...seen(wrong.map((p) => p.id), true)]);
answered.set('r3', { at: '2026-09-01T08:00:00', wrong: false }); // en eski
got = practicePick([...qs('f', 13), ...right, ...wrong], answered, none, 10);
check('yetmezse doğru yaptıkları, en eskiden', got.length === 7 && got.slice(0, 3).every((p) => p.id.startsWith('f')) && got[3].id === 'r3',
  got.map((p) => p.id).join(','));
check('yanlış yaptığı sorular konu çalışmasına gelmez', !got.some((p) => p.id.startsWith('w')));

// Hata maddelerine ayrılanlar (kaynak soru ve benzerleri) ve kitap soruları gelmez (burada tekrarlara soru bırakılmıyor).
const reserved = { q: new Set(['src']), e: new Set(['exam1']) };
const pool = [{ id: 'src', styles: [] }, { id: 'v1', variant_of: 'src', styles: [] }, { id: 'v2', variant_of_exam: 'exam1', styles: [] },
  { id: 'b1', book_id: 'kitap', styles: [] }, { id: 'ok1', styles: [] }, { id: 'ok2', styles: [] }];
got = practicePick(pool, new Map(), reserved, 10, 0);
check('hata maddesine ayrılan ve kitap soruları gelmez', got.map((p) => p.id).sort().join(',') === 'ok1,ok2', got.map((p) => p.id).join(','));

check('boş havuz', practicePick([], new Map(), none, 10).length === 0);
check('en fazla n soru', practicePick(qs('f', 30), new Map(), none, 10).length === 10);

// Velinin "Benzer sorularla dene"si (2026-11-09): yanlış sorunun benzerleri. Önce o sorudan yazılanlar, sonra aynı kaynağın
// kardeşleri, sonra aynı tarzdakiler, sonra konunun öbür soruları; görülmüş soru, kitap sorusu ve sorunun kendisi gelmez.
{
  const sim = [
    { id: 'src', styles: ['grafik'] },
    { id: 'v1', variant_of: 'src', styles: ['x'] }, { id: 'v2', variant_of: 'src', styles: ['x'] },
    { id: 'e1', variant_of_exam: 'eq9', styles: ['x'] },
    { id: 's1', styles: ['grafik'] }, { id: 's2', styles: ['grafik', 'tablo'] },
    { id: 'o1', styles: ['metin'] }, { id: 'o2', styles: [] }, { id: 'o3' },
    { id: 'kitap', styles: ['grafik'], book_id: 'b1' },
    { id: 'gordu', variant_of: 'src', styles: ['grafik'] },
  ];
  const seen = new Set(['gordu']);
  const ids = (src, n) => similarPick(src, sim, seen, n).map((p) => p.id);
  let good = true, info = '';
  for (let t = 0; t < 30 && good; t++) {
    const a = ids({ questionId: 'src', styles: ['grafik'] }, 3);
    const b = ids({ questionId: 'src', styles: ['grafik'] }, 6);
    const c = ids({ examQuestionId: 'eq9', styles: ['metin'] }, 2);
    const d = ids({ questionId: 'v1', variantOf: 'src', styles: ['x'] }, 3);
    good = a.length === 3 && a.slice(0, 2).sort().join() === 'v1,v2' && ['s1', 's2'].includes(a[2])
      && b.slice(0, 2).sort().join() === 'v1,v2' && b.slice(2, 4).sort().join() === 's1,s2' && b.length === 6
      && !b.includes('src') && !b.includes('gordu') && !b.includes('kitap')
      && c[0] === 'e1' && c[1] === 'o1'
      && d.slice(0, 2).sort().join() === 'src,v2' && !d.includes('v1');
    info = [a.join(), b.join(), c.join(), d.join()].join(' | ');
  }
  check('benzer soru seçimi: önce o sorudan yazılanlar, sonra kardeşleri, sonra aynı tarz; görülmüş, kitap ve kendisi yok', good, info);
  check('benzer soru yoksa boş döner; hepsi görülmüşse de', similarPick({ questionId: 'src' }, [], new Set()).length === 0
    && similarPick({ questionId: 'src' }, sim, new Set(sim.map((p) => p.id))).length === 0);
}

process.exit(fails ? 1 : 0);
