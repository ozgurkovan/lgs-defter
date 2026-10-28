// Supabase yardımcı komutları (sadece bu bilgisayarda, saatlik görev ve kurulum için).
// Anahtarlar .secrets/supabase.env dosyasından okunur ve asla ekrana yazılmaz.
//
//   node tools/sb.mjs sql <dosya.sql>            SQL çalıştırır (yönetim API'si)
//   node tools/sb.mjs sql -e "select 1"
//   node tools/sb.mjs keys                       API anahtarlarını .secrets dosyasına kaydeder
//   node tools/sb.mjs auth '{"disable_signup":true}'   giriş ayarlarını günceller
//   node tools/sb.mjs get <tablo?sorgu>           REST okuma (JSON yazar)
//   node tools/sb.mjs post <tablo> <dosya.json>   REST ekleme / upsert (dizi veya nesne)
//   node tools/sb.mjs patch <tablo?filtre> <dosya.json|json>
//   node tools/sb.mjs download <bucket> <yol> <çıkış dosyası>
//   node tools/sb.mjs upload <bucket> <yol> <dosya>

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.secrets', 'supabase.env');

function readEnv() {
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = readEnv();
const ref = env.SUPABASE_PROJECT_REF;
const base = `https://${ref}.supabase.co`;
const mgmt = `https://api.supabase.com/v1/projects/${ref}`;

async function mgmtFetch(path, opts = {}) {
  const res = await fetch(mgmt + path, {
    ...opts,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function serviceHeaders(extra = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY yok: önce "node tools/sb.mjs keys" çalıştır');
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function rest(method, path, body) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function jsonArg(arg) {
  if (arg === undefined) return undefined;
  return existsSync(arg) ? JSON.parse(readFileSync(arg, 'utf8')) : JSON.parse(arg);
}

const [cmd, ...args] = process.argv.slice(2);
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + '\n');

try {
  switch (cmd) {
    case 'sql': {
      const query = args[0] === '-e' ? args[1] : readFileSync(args[0], 'utf8');
      out(await mgmtFetch('/database/query', { method: 'POST', body: JSON.stringify({ query }) }));
      break;
    }
    case 'keys': {
      const keys = await mgmtFetch('/api-keys?reveal=true');
      const secret = keys.find((k) => k.type === 'secret');
      const publishable = keys.find((k) => k.type === 'publishable');
      const anon = keys.find((k) => k.name === 'anon');
      let text = readFileSync(envPath, 'utf8').replace(/^SUPABASE_(SECRET|PUBLISHABLE|ANON)_KEY=.*\r?\n?/gm, '');
      if (!text.endsWith('\n')) text += '\n';
      text += `SUPABASE_SECRET_KEY=${secret.api_key}\nSUPABASE_PUBLISHABLE_KEY=${publishable.api_key}\nSUPABASE_ANON_KEY=${anon.api_key}\n`;
      writeFileSync(envPath, text);
      out({ saved: ['SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'] });
      break;
    }
    case 'anon':
      // Uygulamaya gömülen herkese açık anahtar (RLS korur); gizli değildir.
      process.stdout.write(env.SUPABASE_ANON_KEY + '\n');
      break;
    case 'auth':
      if (args[0]) await mgmtFetch('/config/auth', { method: 'PATCH', body: JSON.stringify(jsonArg(args[0])) });
      {
        const c = await mgmtFetch('/config/auth');
        out({ disable_signup: c.disable_signup, site_url: c.site_url, uri_allow_list: c.uri_allow_list });
      }
      break;
    case 'users': {
      // Giriş hesapları: sadece e-posta ve kimlik (şifre asla görünmez).
      const res = await fetch(`${base}/auth/v1/admin/users?per_page=50`, { headers: serviceHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const { users } = await res.json();
      out(users.map((u) => ({ id: u.id, email: u.email, confirmed: !!u.email_confirmed_at, last_sign_in: u.last_sign_in_at })));
      break;
    }
    case 'set-email': {
      // Bir hesabın giriş e-postasını değiştirir (şifre aynı kalır).
      const [id, email] = args;
      const res = await fetch(`${base}/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        headers: serviceHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, email_confirm: true }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const u = await res.json();
      out({ id: u.id, email: u.email, confirmed: !!u.email_confirmed_at });
      break;
    }
    case 'recovery-link': {
      // E-posta göndermeden şifre sıfırlama bağlantısı üretir (1 saat geçerli, tek kullanımlık).
      const res = await fetch(`${base}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: serviceHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'recovery', email: args[0], redirect_to: 'https://ozgurkovan.github.io/lgs-defter/' }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = await res.json();
      process.stdout.write((data.action_link || data.properties?.action_link) + '\n');
      break;
    }
    case 'get':
      out(await rest('GET', args[0]));
      break;
    case 'post':
      out(await rest('POST', args[0], jsonArg(args[1])));
      break;
    case 'patch':
      out(await rest('PATCH', args[0], jsonArg(args[1])));
      break;
    case 'download': {
      const [bucket, path, file] = args;
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { headers: serviceHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      mkdirSync(dirname(resolve(file)), { recursive: true });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      out({ saved: resolve(file) });
      break;
    }
    case 'upload': {
      const [bucket, path, file] = args;
      const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: serviceHeaders({ 'Content-Type': type, 'x-upsert': 'true' }),
        body: readFileSync(file),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      out({ uploaded: `${bucket}/${path}` });
      break;
    }
    default:
      console.error('Komut: sql | keys | auth | get | post | patch | download | upload');
      process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
