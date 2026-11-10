// İngilizce katmanın dosyasını üretir: tools/i18n/en-part-*.json'ları (varsa) tools/i18n/en.json'a katar, çevirileri
// denetler ve docs/i18n-en.js'i yazar (I18N_EN sözlüğü + I18N_CONTENT: şakalar, fabllar, şiirler, selamlar).
//   node tools/i18n-build.mjs           → yazar, sorun varsa listeler ve 1 ile çıkar
//   node tools/i18n-build.mjs --check   → yalnızca denetler (regression.mjs çalıştırır)
import fs from 'node:fs';
import path from 'node:path';
import { extract, COMPOSE } from './i18n-extract.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dir = path.join(ROOT, 'tools/i18n');
const enPath = path.join(dir, 'en.json');
const check = process.argv.includes('--check');

let en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {};
if (!check) {
  for (const f of fs.readdirSync(dir).filter((x) => /^en-part-\d+\.json$/.test(x)).sort()) {
    Object.assign(en, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
}
// Kod değerleri (ünlü kümeleri, tek harfler) ekranda tek başına görünmez; sözlüğe girmez.
// Ekranda görünmeyen kod değerleri: tek harfler ve Türkçe ek kümeleri (ünlüler, ekler).
const CODE_VALUES = new Set(['aeıioöuü', 'çfhkpsşt', 'ığım', 'iğim', 'uğum', 'üğüm', 'eiöü', 'aeiou']);
const isCode = (k) => [...k].length <= 1 || CODE_VALUES.has(k);
for (const k of Object.keys(en)) if (isCode(k)) delete en[k];

const problems = [];
const ph = (s) => [...new Set([...s.matchAll(/\{(\d+)(?:\|[^}]*)?\}/g)].map((m) => m[1]))].sort().join(',');
const PROPER = /Nasreddin|Hoca|Âkif|Hız Yayınları|Yunus/;
for (const [k, v] of Object.entries(en)) {
  if (typeof v !== 'string' || !v.trim()) problems.push(`boş çeviri: ${k}`);
  else {
    if (ph(k) !== ph(v)) problems.push(`yer tutucular uymuyor: ${k} → ${v}`);
    if (/[çğıöşüÇĞİÖŞÜ]/.test(v.replace(PROPER, ''))) problems.push(`İngilizcede Türkçe harf: ${v}`);
  }
}
const keys = extract();
// Parçalı yazılar: birleşik çevirisi yoksa parçalarının çevirilerinden kurulur.
for (const [k, pieces] of COMPOSE) {
  if (k in en || !keys.has(k)) continue;
  const done = pieces.map((p) => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(p); return !m[2] || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(m[2]) ? p : en[m[2]] === undefined ? null : m[1] + en[m[2]] + m[3]; });
  if (done.every((x) => x !== null)) en[k] = done.join('');
}
const missing = [...keys.keys()].filter((k) => !isCode(k) && !(k in en));
if (missing.length) problems.push(`çevirisi eksik ${missing.length} yazı (node tools/i18n-extract.mjs --missing): ${missing.slice(0, 5).join(' | ')}`);
const content = JSON.parse(fs.readFileSync(path.join(dir, 'content-en.json'), 'utf8'));
for (const name of ['JOKES', 'FIKRALAR', 'POEMS', 'POEM_TIPS', 'SWEET_LINES', 'PLAYFUL']) {
  if (!Array.isArray(content[name]) || !content[name].length) problems.push(`içerik eksik: ${name}`);
  else if (/[çğıöşüÇĞİÖŞÜ]/.test(JSON.stringify(content[name]))) problems.push(`içerikte Türkçe harf: ${name}`);
}

if (!check) {
  const sorted = Object.fromEntries(Object.entries(en).sort(([a], [b]) => a.localeCompare(b, 'tr')));
  fs.writeFileSync(enPath, JSON.stringify(sorted, null, 1) + '\n');
  const { _source, ...pack } = content;
  const js = '/* Üretilmiş dosya: node tools/i18n-build.mjs (kaynak tools/i18n/en.json ve content-en.json). Elle değiştirme.\n' +
    '   İngilizce katmanın sözlüğü ve ABD içeriği; docs/i18n.js yalnızca İngilizce gerektiğinde yükler. */\n' +
    'window.I18N_EN = ' + JSON.stringify(sorted) + ';\n' +
    'window.I18N_CONTENT = ' + JSON.stringify(pack) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'docs/i18n-en.js'), js);
  console.log(`docs/i18n-en.js yazıldı: ${Object.keys(sorted).length} çeviri, ${Math.round(fs.statSync(path.join(ROOT, 'docs/i18n-en.js')).size / 1024)} KB`);
}
if (problems.length) {
  console.log(problems.slice(0, 30).join('\n'));
  process.exit(1);
}
console.log('İngilizce katman: sorun yok');
