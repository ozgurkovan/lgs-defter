// Regresyon testinin otomatik kısmı. Her değişiklikten sonra, yayınlamadan önce: node tools/regression.mjs
//  1. Uygulama dosyası hatasız okunuyor mu, sürüm numaraları tutuyor mu; şifresiz giriş bağlantısı yalnızca
//     test hesaplarına mı üretiliyor (bu deneme Supabase'e gitmez).
//  2. Takvim ve günlük plan hesapları (tools/test-schedule.mjs), klavye dersleri (tools/test-typing.mjs), konu
//     çalışmasının soru seçimi (tools/test-practice.mjs), kelime listesi ve günün kartları (tools/test-words.mjs),
//     kahramanı besleme (tools/test-feed.mjs), 1000 satır sınırını geçen okumalar (tools/test-paging.mjs).
//  3. Veritabanı yetkileri: supabase/test-*.sql. Her test kullanıcıların yerine geçip dener ve sonucu
//     "SONUC {...}" hatasıyla döndürür; hata yüzünden her şey geri alınır, iz kalmaz. Sonuç dosyadaki
//     "-- beklenen:" satırıyla karşılaştırılır (">0" gibi değerler sayı aralığıdır).
//  4. Erişim sayımı (test-rls.sql, salt okunur): aileye bağlı olmayan biri hiçbir şey görmemeli.
//  5. Her öğrencinin bugünkü durumu (check-students.sql, salt okunur); havuzu azalan öğrenci uyarılır.
// Arayüz denetimi (tools/ui-smoke.js) ve elle bakılacaklar: REGRESSION.md.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { testAccountEmail, TEST_ACCOUNTS } from './test-accounts.mjs';

let failed = 0;
const report = (good, name, detail = '') => {
  console.log(`${good ? 'OK  ' : 'HATA'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!good) failed++;
};
const node = (args) => {
  try { return execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
};

// 1
const checked = node(['--check', 'docs/app.js']) + node(['--check', 'docs/typing.js']) + node(['--check', 'docs/feed.js'])
  + node(['--check', 'docs/i18n.js']) + node(['--check', 'docs/i18n-en.js']);
report(!checked.trim(), 'app.js, typing.js, feed.js ve dil dosyaları sözdizimi', checked.trim().split('\n')[0]);
const html = readFileSync('docs/index.html', 'utf8');
const v = JSON.parse(readFileSync('docs/version.json', 'utf8')).v;
const inHtml = [...html.matchAll(/(?:app\.js|style\.css|typing\.js|typing\.css|feed\.js|i18n\.js)\?v=(\d+)/g)].map((m) => +m[1]); // config.js'in kendi numarası var
report(inHtml.length === 6 && inHtml.every((x) => x === v), 'Sürüm numarası', `version.json ${v}, index.html ${[...new Set(inHtml)].join(',')}`);
// Başka bir adres reddedilmeli. Deneme kapalı bir porta gider: koruma bozulsa bile Supabase'e ulaşmaz, hesap açılmaz.
// Giriş bağlantısı üreten her araç adresi test-accounts.mjs'ten almalı.
const refused = await testAccountEmail('velitest@hotmail.com', 'http://127.0.0.1:9', {}).then(() => 'kabul edildi', (e) => e.message);
const rawMagic = readdirSync('tools').filter((f) => f.endsWith('.mjs')).filter((f) => {
  const src = readFileSync(`tools/${f}`, 'utf8');
  return /['"]magiclink['"]/.test(src) && !src.includes('testAccountEmail(');
});
const onlyTest = refused.startsWith('Giriş bağlantısı yalnızca');
report(onlyTest && !rawMagic.length, 'Giriş bağlantısı yalnızca test hesaplarına',
  [!onlyTest && `başka adres: ${refused}`, rawMagic.length && `adresi doğrudan alan: ${rawMagic.join(', ')}`].filter(Boolean).join('; '));
// Ekran testi yalnızca test hesaplarıyla çalışır (velinin isteği, 2026-11-10); oradaki kimlik listesi test-accounts.mjs ile aynı olmalı.
const smokeSrc = readFileSync('tools/ui-smoke.js', 'utf8');
const smokeMissing = Object.entries(TEST_ACCOUNTS).filter(([, id]) => !smokeSrc.includes(id)).map(([name]) => name);
report(!smokeMissing.length, 'Ekran testi yalnızca test hesaplarıyla',
  smokeMissing.length ? `ui-smoke.js listesinde yok: ${smokeMissing.join(', ')}` : `${Object.keys(TEST_ACCOUNTS).length} test hesabı`);

// 2
const sched = node(['tools/test-schedule.mjs']).trim().split(/\r?\n/).filter(Boolean);
const schedBad = sched.filter((l) => !l.startsWith('OK'));
report(sched.length > 0 && !schedBad.length, 'Takvim ve günlük plan', schedBad.length ? schedBad.join(' | ') : `${sched.length} kontrol`);
// Klavye dersleri: harfler, satırlar, yıldız ve kahramana katkı (tools/test-typing.mjs).
const typingOut = node(['tools/test-typing.mjs']).trim().split(/\r?\n/).filter(Boolean);
const typingBad = typingOut.filter((l) => !l.startsWith('OK'));
report(typingOut.length > 0 && !typingBad.length, 'Klavye dersleri', typingBad.length ? typingBad.join(' | ') : `${typingOut.length} kontrol`);
// Konu çalışması: öğrencinin seçtiği konudan soru seçimi (tools/test-practice.mjs).
const practiceOut = node(['tools/test-practice.mjs']).trim().split(/\r?\n/).filter(Boolean);
const practiceBad = practiceOut.filter((l) => !l.startsWith('OK'));
report(practiceOut.length > 0 && !practiceBad.length, 'Konu çalışması', practiceBad.length ? practiceBad.join(' | ') : `${practiceOut.length} kontrol`);
// Kelime kartları: liste (kelime kaybolmaz, tekrar etmez, grupta şıklar farklı) ve günün kartları (tools/test-words.mjs).
const wordsOut = node(['tools/test-words.mjs']).trim().split(/\r?\n/).filter(Boolean);
const wordsBad = wordsOut.filter((l) => !l.startsWith('OK'));
report(wordsOut.length > 0 && !wordsBad.length, 'Kelime listesi', wordsBad.length ? wordsBad.join(' | ') : `${wordsOut.length} kontrol`);
// Sayfalı okuma: 1000 satır sınırını geçen sorgular eksiksiz okunur (tools/test-paging.mjs).
const pagingOut = node(['tools/test-paging.mjs']).trim().split(/\r?\n/).filter(Boolean);
const pagingBad = pagingOut.filter((l) => !l.startsWith('OK'));
report(pagingOut.length > 0 && !pagingBad.length, 'Sayfalı okuma', pagingBad.length ? pagingBad.join(' | ') : `${pagingOut.length} kontrol`);
// Kahramanı besleme: bronz, tokluk, kahramanın sözü ve çizimi (tools/test-feed.mjs).
const feedOut = node(['tools/test-feed.mjs']).trim().split(/\r?\n/).filter(Boolean);
const feedBad = feedOut.filter((l) => !l.startsWith('OK'));
report(feedOut.length > 0 && !feedBad.length, 'Kahramanı besleme', feedBad.length ? feedBad.join(' | ') : `${feedOut.length} kontrol`);
// İngilizce katman (2026-11-10): kodda yeni bir Türkçe yazı varsa çevirisi de olmalı; çeviriler yer tutucuları korur,
// Türkçe harf taşımaz; docs/i18n-en.js en.json'dan üretilmiş ve güncel (tools/i18n-build.mjs).
const i18nOut = node(['tools/i18n-build.mjs', '--check']).trim();
const enJs = readFileSync('docs/i18n-en.js', 'utf8');
const enSrc = JSON.parse(readFileSync('tools/i18n/en.json', 'utf8'));
const enFresh = enJs.includes(JSON.stringify(enSrc).slice(0, 2000)) && Object.keys(enSrc).length === Object.keys(JSON.parse(enJs.split('window.I18N_EN = ')[1].split(';\nwindow.I18N_CONTENT')[0])).length;
report(/sorun yok/.test(i18nOut) && enFresh, 'İngilizce katman: her Türkçe yazının çevirisi var, i18n-en.js güncel',
  /sorun yok/.test(i18nOut) ? (enFresh ? '' : 'node tools/i18n-build.mjs çalıştırılmalı') : i18nOut.split('\n').slice(0, 3).join(' | '));

// 3
const fits = (want, got) => {
  const range = typeof want === 'string' && want.match(/^([<>]=?)(\d+)$/);
  if (!range) return JSON.stringify(want) === JSON.stringify(got);
  const [, op, n] = range;
  return typeof got === 'number' && ({ '>': got > +n, '>=': got >= +n, '<': got < +n, '<=': got <= +n })[op];
};
for (const file of readdirSync('supabase').filter((f) => /^test-.*\.sql$/.test(f) && f !== 'test-rls.sql').sort()) {
  const src = readFileSync(`supabase/${file}`, 'utf8');
  const line = src.match(/^-- beklenen: (.*)$/m);
  if (!line) { report(false, file, '"-- beklenen:" satırı yok'); continue; }
  const want = JSON.parse(line[1]);
  const out = node(['tools/sb.mjs', 'sql', `supabase/${file}`]).replace(/\\"/g, '"');
  const m = out.match(/SONUC (\{[^{}]*\})/);
  if (!m) { report(false, file, 'sonuç okunamadı: ' + out.slice(0, 160)); continue; }
  const got = JSON.parse(m[1]);
  const diffs = Object.keys(want).filter((k) => !fits(want[k], got[k])).map((k) => `${k}: beklenen ${JSON.stringify(want[k])}, gelen ${JSON.stringify(got[k])}`);
  report(!diffs.length, file, diffs.join('; ') || `${Object.keys(want).length} kontrol`);
}

// 4
try {
  const rows = JSON.parse(node(['tools/sb.mjs', 'sql', 'supabase/test-rls.sql']));
  const stranger = rows.find((r) => r.role === '-');
  const zero = stranger && Object.values(stranger.sees).every((n) => n === 0);
  report(!!zero, 'Yabancı hiçbir şey görmüyor', stranger ? JSON.stringify(stranger.sees) : 'satır yok');
} catch (e) { report(false, 'test-rls.sql', e.message); }

// 5 (adlar sadece bu ekranda görünür, hiçbir yere yazılmaz)
try {
  const rows = JSON.parse(node(['tools/sb.mjs', 'sql', 'supabase/check-students.sql']));
  for (const r of rows) {
    const d = r.durum;
    const low = d.aktif_konu > 0 && d.gorulmemis_soru < 20;
    console.log(`${low ? 'UYARI' : 'BİLGİ'} ${r.display_name} (${r.grade}. sınıf): ${d.aktif_konu} işlenen konu, bugün ${d.bugun_hata} hata + ${d.bugun_konu} konu tekrarı, ` +
      `${d.gorulmemis_soru} görmediği soru, ${d.okunmamis_mesaj} okunmamış mesaj, ${d.bekleyen_yukleme} bekleyen yükleme`);
  }
} catch (e) { report(false, 'check-students.sql', e.message); }

console.log(failed ? `\n${failed} kontrol başarısız.` : '\nOtomatik kontrollerin hepsi geçti. Sırada arayüz denetimi (REGRESSION.md).');
process.exit(failed ? 1 : 0);
