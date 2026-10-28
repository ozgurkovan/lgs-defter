// supabase/curriculum.json'daki konuları topics tablosuna yazar (var olanları günceller).
//   node tools/seed-curriculum.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cur = JSON.parse(readFileSync(join(root, 'supabase', 'curriculum.json'), 'utf8'));

const rows = [];
for (const [subject, list] of Object.entries(cur)) {
  if (subject.startsWith('_')) continue;
  list.forEach(([slug, unit, name, start, kazanim], i) => {
    rows.push({ id: `${subject}.${slug}`, subject, unit, name, planned_start: start, kazanim, sort: i });
  });
}
mkdirSync(join(root, '.work'), { recursive: true });
const file = join(root, '.work', 'curriculum-rows.json');
writeFileSync(file, JSON.stringify(rows));
execFileSync('node', [join(root, 'tools', 'sb.mjs'), 'post', 'topics', file], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`${rows.length} konu yazıldı`);
