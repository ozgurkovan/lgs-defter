// Müfredat dosyasındaki konuları topics tablosuna yazar (var olanları günceller).
//   node tools/seed-curriculum.mjs                                  8. sınıf (supabase/curriculum.json)
//   node tools/seed-curriculum.mjs supabase/curriculum-g3.json      dosyadaki _grade sınıfı
// Konu kimliği 8. sınıfta "ders.slug", diğer sınıflarda "g<sınıf>.ders.slug".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ? resolve(process.argv[2]) : join(root, 'supabase', 'curriculum.json');
const cur = JSON.parse(readFileSync(source, 'utf8'));
const grade = Number(cur._grade ?? 8);
if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error(`geçersiz _grade: ${cur._grade}`);

const rows = [];
for (const [subject, list] of Object.entries(cur)) {
  if (subject.startsWith('_')) continue;
  list.forEach(([slug, unit, name, start, kazanim], i) => {
    const id = grade === 8 ? `${subject}.${slug}` : `g${grade}.${subject}.${slug}`;
    rows.push({ id, grade, subject, unit, name, planned_start: start, kazanim, sort: i });
  });
}
mkdirSync(join(root, '.work'), { recursive: true });
const file = join(root, '.work', `curriculum-rows-g${grade}.json`);
writeFileSync(file, JSON.stringify(rows));
execFileSync('node', [join(root, 'tools', 'sb.mjs'), 'post', 'topics', file], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`${grade}. sınıf: ${rows.length} konu yazıldı`);
