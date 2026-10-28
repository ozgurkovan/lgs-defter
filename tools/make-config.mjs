// docs/config.js dosyasını üretir. İçindeki anon anahtarı herkese açık olacak şekilde tasarlanmıştır;
// verileri RLS kuralları ve giriş korur. Gizli anahtar asla buraya yazılmaz.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(readFileSync(join(root, '.secrets', 'supabase.env'), 'utf8')
  .split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

const config = { url: `https://${env.SUPABASE_PROJECT_REF}.supabase.co`, anonKey: env.SUPABASE_ANON_KEY };
writeFileSync(join(root, 'docs', 'config.js'), `window.CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('docs/config.js yazıldı');
