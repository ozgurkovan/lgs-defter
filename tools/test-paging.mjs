// Sayfalı okumanın kontrolü (docs/app.js, q): node tools/test-paging.mjs
// Supabase bir istekte en çok 1000 satır verir. q() sonuç tam 1000 satırsa birincil anahtara göre sıralayıp bütün sayfaları
// okumalı; satır atlamamalı, iki kez saymamalı; yazma sorgularını ve kendi sınırı olanları yinelememeli.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const a = app.indexOf('/* Sorgu sayfaları: sorgunun sonucu'), b = app.indexOf('/* Sorgu sayfaları: son */');
if (a < 0 || b < 0) throw new Error('bölüm bulunamadı: Sorgu sayfaları');
const quiet = { warn() {} };
const { q, SB_PAGE, SB_KEYS } = new Function('console', app.slice(a, b) + 'return { q, SB_PAGE, SB_KEYS };')(quiet);

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };

// Sunucunun taklidi: n satırlı tablo, istek başına en çok cap satır. Sıralanmamış istekte satırlar karışık gelir (gerçekte de
// sıra garanti değildir); sıralanınca anahtara göre. calls: yapılan istekler.
function fakeTable(n, { table = 'reviews', method = 'GET', cap = 1000, limit = null, failAt = -1 } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(6, '0') }));
  const mixed = [...rows].sort((x, y) => ((+x.id * 7919) % 10007) - ((+y.id * 7919) % 10007));
  const url = new URL(`https://x.test/rest/v1/${table}`);
  if (limit != null) url.searchParams.set('limit', String(limit));
  const calls = [];
  const builder = {
    method, url, orders: [], from: null, to: null,
    order(key) { this.orders.push(key); return this; },
    range(from, to) { this.from = from; this.to = to; return this; },
    then(done, fail) {
      calls.push({ orders: [...this.orders], from: this.from, to: this.to });
      if (calls.length - 1 === failAt) return Promise.resolve({ data: null, error: { message: 'ağ hatası' } }).then(done, fail);
      const src = this.orders.length ? rows : mixed;
      const start = this.from ?? 0, end = Math.min(this.to != null ? this.to + 1 : Infinity, start + cap, limit ?? Infinity, src.length);
      return Promise.resolve({ data: src.slice(start, Math.max(start, end)), error: null }).then(done, fail);
    },
  };
  return { builder, calls };
}
const whole = (list, n) => list.length === n && new Set(list.map((r) => r.id)).size === n;

for (const n of [0, 1, 999]) {
  const t = fakeTable(n);
  const out = await q(t.builder);
  check(`${n} satır: tek istek, sıralama eklenmez`, whole(out, n) && t.calls.length === 1 && !t.calls[0].orders.length, `${t.calls.length} istek`);
}
for (const [n, want] of [[1000, 3], [1001, 3], [2000, 4], [2500, 4], [4563, 6]]) {
  const t = fakeTable(n);
  const out = await q(t.builder);
  check(`${n} satır: hepsi gelir, hiçbiri iki kez sayılmaz`, whole(out, n) && t.calls.length === want
    && t.calls.slice(1).every((c, i) => c.orders.join() === 'id' && c.from === i * SB_PAGE && c.to === (i + 1) * SB_PAGE - 1), `${out.length} satır, ${t.calls.length} istek`);
}
{
  const t = fakeTable(2300, { table: 'word_progress' });
  await q(t.builder);
  check('birincil anahtarı "id" olmayan tabloda kendi anahtarına göre sıralanır', t.calls[1].orders.join() === 'student_id,word'
    && ['exam_results', 'family_links', 'topic_status', 'word_progress'].every((k) => Array.isArray(SB_KEYS[k]) && SB_KEYS[k].length === 2));
}
{
  const t = fakeTable(3000, { method: 'POST' });
  const out = await q(t.builder);
  check('yazma sorgusu (POST) yinelenmez', out.length === 1000 && t.calls.length === 1);
}
{
  const t = fakeTable(3000, { limit: 1000 });
  const out = await q(t.builder);
  check('kendi sınırı (limit) olan sorgu sayfalanmaz', out.length === 1000 && t.calls.length === 1);
}
{
  const t = fakeTable(3000, { failAt: 2 });
  const out = await q(t.builder);
  check('sayfalar okunamazsa eldeki ilk sayfayla devam edilir', out.length === 1000 && t.calls.length === 3);
}
{
  let threw = false;
  try { await q(Promise.resolve({ data: null, error: { message: 'yetki yok' } })); } catch (e) { threw = e.message === 'yetki yok'; }
  const single = await q(Promise.resolve({ data: { id: 1 }, error: null }));
  const plain = await q(Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }));
  check('hata fırlatılır; tek satır ve sorgu olmayan sonuç olduğu gibi döner', threw && single.id === 1 && plain.length === 1000);
}

process.exit(fails ? 1 : 0);
