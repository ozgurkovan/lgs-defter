// supabase/lgs-weights.json'daki konu başına LGS ortalamalarını topics.lgs_avg'a yazar ve LGS'de nadir
// (ortalaması 0,5'in altında) konuların açık konu tekrarlarını kapatır (paused; Konular'dan açılabilir).
//   node tools/seed-lgs-weights.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const w = JSON.parse(readFileSync(join(root, 'supabase', 'lgs-weights.json'), 'utf8'));
const lines = Object.entries(w.topics).map(([id, t]) =>
  `update public.topics set lgs_avg = ${Number(t.avg)} where id = '${id.replace(/'/g, "''")}' and grade = 8;`);
lines.push(`update public.items set state = 'paused', note = 'LGS''de nadir çıkıyor; konu tekrarı kapalı (Konular''dan açılabilir).'
  where track = 'topic' and state = 'active'
    and topic_id in (select id from public.topics where grade = 8 and lgs_avg < 0.5);`);
mkdirSync(join(root, '.work'), { recursive: true });
const file = join(root, '.work', 'lgs-weights.sql');
writeFileSync(file, lines.join('\n') + '\n');
execFileSync('node', [join(root, 'tools', 'sb.mjs'), 'sql', file], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`${Object.keys(w.topics).length} konunun LGS ortalaması yazıldı; nadir konuların tekrarları kapatıldı`);
