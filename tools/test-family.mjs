// Aile fonksiyonunun güvenlik testi: girişsiz ve öğrenci olarak çağrılınca reddedilmeli.
//   node tools/test-family.mjs        (her zaman test öğrencisi IrfTest olarak)
import { readFileSync } from 'node:fs';
import { testAccountEmail } from './test-accounts.mjs';

const env = Object.fromEntries(readFileSync('.secrets/supabase.env', 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const base = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
const fn = `${base}/functions/v1/family`;
const call = (token, body) => fetch(fn, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'https://ozgurkovan.github.io' },
  body: JSON.stringify(body),
}).then(async (r) => `${r.status} ${await r.text()}`);

// Test öğrencisi için kısa ömürlü oturum (şifre kullanmadan). Hep öğrenci olarak çalışır: veli olarak
// çalışsaydı aşağıdaki add_child gerçekten hesap açardı.
const admin = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
const link = await fetch(`${base}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { ...admin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: await testAccountEmail('irftest', base, admin) }),
}).then((r) => r.json());
const session = await fetch(`${base}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token ?? link.properties?.hashed_token }),
}).then((r) => r.json());
// Giriş olmadan aşağıdaki çağrılar zaten reddedilir; test boşuna geçmiş görünmesin.
if (!session.access_token) throw new Error('Test öğrencisiyle giriş yapılamadı.');

console.log('girişsiz        :', await call(env.SUPABASE_ANON_KEY, { action: 'list' }));
console.log('öğrenci list    :', await call(session.access_token, { action: 'list' }));
console.log('öğrenci add     :', await call(session.access_token, { action: 'add_child', name: 'x', email: 'x@example.invalid', password: '123456', grade: 8 }));
// Yalnızca bu oturumu kapat; test öğrencisinin başka cihazdaki oturumu açık kalır.
await fetch(`${base}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } });
