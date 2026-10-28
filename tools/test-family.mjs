// Aile fonksiyonunun güvenlik testi: girişsiz ve öğrenci olarak çağrılınca reddedilmeli.
//   node tools/test-family.mjs <test öğrencisinin e-postası>
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.secrets/supabase.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const base = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
const fn = `${base}/functions/v1/family`;
const call = (token, body) => fetch(fn, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'https://ozgurkovan.github.io' },
  body: JSON.stringify(body),
}).then(async (r) => `${r.status} ${await r.text()}`);

// Test öğrencisi için kısa ömürlü oturum (şifre kullanmadan).
const link = await fetch(`${base}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: process.argv[2] }),
}).then((r) => r.json());
const session = await fetch(`${base}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token ?? link.properties?.hashed_token }),
}).then((r) => r.json());

console.log('girişsiz        :', await call(env.SUPABASE_ANON_KEY, { action: 'list' }));
console.log('öğrenci list    :', await call(session.access_token, { action: 'list' }));
console.log('öğrenci add     :', await call(session.access_token, { action: 'add_child', name: 'x', email: 'x@example.invalid', password: '123456', grade: 8 }));
// Oturumu kapat.
await fetch(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } });
