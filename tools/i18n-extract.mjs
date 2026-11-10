// İngilizce katman için çevrilecek yazıları toplar (velinin isteği, 2026-11-10: "ABD öğrencilerine Türkçe hiçbir şey
// gösteremeyiz"). Kaynaklardaki dize ve şablon sabitlerini okur; Türkçe görünenleri anahtar yapar. Şablonlarda ${...}
// yerine {0}, {1} … gelir (docs/i18n.js ekrandaki yazıyı bu kalıplarla eşleştirir).
//   node tools/i18n-extract.mjs            → tools/i18n/keys.json (anahtar listesi) ve eksik çevirileri sayar
//   node tools/i18n-extract.mjs --missing  → çevirisi olmayan anahtarları tools/i18n/missing.json'a yazar
// Çeviriler tools/i18n/en.json'da; node tools/i18n-build.mjs onlardan docs/i18n-en.js'i üretir.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FILES = ['docs/app.js', 'docs/typing.js', 'docs/feed.js', 'supabase/functions/family/index.ts'];
// İçerik dizileri çevrilmez, ABD için yerine İngilizce içerik gelir (docs/i18n.js, I18N_CONTENT): Türk fıkraları,
// şiirler, Türkçe klavye dersleri ve sesli söylenen harf adları, LGS kitapçıkları.
const SKIP_CONSTS = ['JOKES', 'FIKRALAR', 'POEMS', 'POEM_TIPS', 'BOOKLETS', 'SWEET_LINES', 'TYPING_LESSONS', 'KEY_SAY', 'KEY_TO',
  'FINGER_NAMES', 'TQ_KEY', 'TQ_ROWS'];
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜâîû]/;
// Türkçe harf taşımayan ama ekranda görünen yaygın sözcükler.
const TR_WORDS = new Set(('Kapat Geri Rapor Konular Konu Sorular Soru Deneme Denemeler Ayarlar Ayar Kitap Kitaplar Kelime Kelimeler Klavye ' +
  'Kahraman Tamam Evet Sil Kaydet Ana Yeter Hata Ders Dersler Tekrar Tekrarlar Oyun Mola Bilmece Bulmaca Oyna Ekle Veli Anne Baba Aile ' +
  'Yeni Eski Bitti Bitir Devam Ara Kalan Puan Seviye Hedef Plan Yolla Tekrarla Dinle Yaz Oku Sayfa Sayfalar Sonraki Sonra Bilgi ' +
  'Merhaba Selam Hadi Aferin Bravo Harika Kolay Zor Orta Kalem Silgi Defter Okul Sinav Mesaj Mesajlar Yorum Not Notlar Takvim Hafta Saat ' +
  'Dakika Saniye Kapali Kapalı Acik Tahmin Kart Kartlar Altın Bronz Seri Rozet Hediye Yemek Elma Pasta Uyku Yorgun Mutlu ' +
  've ile bir bu da de ne mi mu var yok ama icin için gibi kadar sonra once önce daha en cok çok az hem soru konu ders gun gün').split(/\s+/));

function tokenize(src) {
  const out = [];
  let i = 0, prev = '';
  const n = src.length;
  const regexOk = () => /^$|[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of|delete|void|throw|new|else)$/.test(prev);
  const readString = (q) => {
    let s = '', j = i + 1;
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') {
        const c = src[j + 1];
        if (c === 'n') s += '\n'; else if (c === 't') s += '\t'; else if (c === 'u') { s += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 4; } else s += c;
        j += 2;
      } else { s += src[j]; j++; }
    }
    return [s, j + 1];
  };
  const readTemplate = (start) => {
    // `...${expr}...` → { parts, exprs }; ifadelerin içindeki dizeler de taranır.
    const parts = [''];
    let j = start + 1;
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') {
        const c = src[j + 1];
        parts[parts.length - 1] += c === 'n' ? '\n' : c === 't' ? '\t' : c;
        j += 2;
      } else if (src[j] === '$' && src[j + 1] === '{') {
        let depth = 1, k = j + 2;
        const exprStart = k;
        while (k < n && depth) {
          const c = src[k];
          if (c === "'" || c === '"') { const save = i; i = k; const [, e] = readString(c); i = save; k = e; continue; }
          if (c === '`') { const r = readTemplate(k); out.push(...r.inner); out.push({ kind: 'tpl', parts: r.parts, at: k }); k = r.end; continue; }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          k++;
        }
        const expr = src.slice(exprStart, k - 1);
        // İfadenin içindeki dize sabitleri (koşullu yazılar) ayrıca anahtar olur.
        for (const t of tokenize(expr)) out.push(t);
        parts.push('');
        j = k;
      } else { parts[parts.length - 1] += src[j]; j++; }
    }
    return { parts, end: j + 1, inner: [] };
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') { const [s, e] = readString(c); out.push({ kind: 'str', value: s, at: i, end: e }); i = e; prev = 'x'; continue; }
    if (c === '`') { const r = readTemplate(i); out.push({ kind: 'tpl', parts: r.parts, at: i }); i = r.end; prev = 'x'; continue; }
    if (c === '/' && regexOk()) {
      let j = i + 1, cls = false;
      while (j < n && (cls || src[j] !== '/') && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      i = j + 1; while (/[a-z]/.test(src[i] || '')) i++;
      prev = 'x'; continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z_$0-9]/.test(c)) { let j = i; while (j < n && /[A-Za-z_$0-9]/.test(src[j])) j++; prev = src.slice(i, j); i = j; continue; }
      prev = c;
    }
    i++;
  }
  return out;
}

function skipRanges(src) {
  const ranges = [];
  for (const name of SKIP_CONSTS) {
    const m = new RegExp(`^const ${name} = [\\[{]`, 'm').exec(src);
    if (!m) continue;
    const open = src[m.index + m[0].length - 1], close = open === '[' ? ']' : '}';
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "'" || ch === '"' || ch === '`') { const q = ch; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } continue; }
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) break;
    }
    ranges.push([m.index, j]);
  }
  // İngilizce veri dizileri (adı _EN ile biten sabitler, örneğin Klavye'nin İngilizce dersleri) çevrilmez.
  for (const m of src.matchAll(/^const [A-Z0-9_]+_EN = [\[{]/gm)) {
    const open = m[0].slice(-1), close = open === '[' ? ']' : '}';
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "'" || ch === '"' || ch === '`') { const q = ch; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } continue; }
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) break;
    }
    ranges.push([m.index, j]);
  }
  // playfulGreeting'in Türkçe hitapları da içerikten gelir.
  const pg = /function playfulGreeting\(/.exec(src);
  if (pg) ranges.push([pg.index, src.indexOf('\n}\n', pg.index)]);
  return ranges;
}

const looksTurkish = (s) => {
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) return false;
  if (TR_LETTERS.test(s)) return true;
  const words = s.split(/[^A-Za-zÇĞİÖŞÜçğıöşü]+/).filter(Boolean);
  if (!words.length) return false;
  if (words.length === 1) return /^[A-ZÇĞİÖŞÜ]/.test(words[0]) && TR_WORDS.has(words[0]);
  return words.some((w) => TR_WORDS.has(w)) && /\s/.test(s);
};
// CSS sınıf adları (style.css ve typing.css): yalnızca bunlardan oluşan dize sınıf listesidir, ekranda görünmez.
const CSS_CLASSES = new Set(['card', 'stack', 'row', 'spread', 'small', 'muted', 'ghost', 'primary', 'block', 'danger', 'error', 'big', 'num',
  ...['docs/style.css', 'docs/typing.css'].flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]))]);
// Ekranda görünebilecek yazı mı? Türkçe görünen her şey; ayrıca harf taşıyan, kod olmayan dizeler (Türkçe harfsiz
// Türkçe yazılar da var: "Okudum", "Besle", "Kaydedilemedi, tekrar dene."). İngilizce olanlar kendisine çevrilir.
const KEY_CODES = /^(GET|POST|PATCH|Key[A-Z]?|Digit\d?|Arrow|Shift|Control|Alt|Meta|Enter|Backspace|Space|Tab|Escape|CapsLock|IntlBackslash|ContextMenu|Slash|Backslash|Quote|Semicolon|Bracket|Comma|Period|Backquote|Minus|Equal|AuthRetryableFetchError|use strict)/;
function uiText(staticText, isTemplate) {
  const st = staticText.trim();
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(st)) return false;
  if (looksTurkish(st)) return true;
  if (/[_=<>{}[\];#\\]|--|^\.|\bpx\b|\bvh\b|var\(|https?:|^M\d|^[a-z-]+:\s?\S/.test(st)) return false; // kod, CSS, SVG yolu
  if (KEY_CODES.test(st)) return false;
  const words = st.split(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9-]+/).filter(Boolean);
  if (words.every((w) => CSS_CLASSES.has(w))) return false;
  if (/^[a-z][a-zA-Z0-9-]*$/.test(st)) return false; // tek küçük kelime: anahtar ya da kimlik
  if (/^[a-z_]+(, ?[a-z_.!()]+)+$/.test(st)) return false; // veritabanı sütun listeleri
  if (/^[a-z]+\(|\)$/.test(st) && /[a-z]+\(/.test(st)) return false;
  return true;
}
const notUi = (s) => /^[a-z0-9_.\-:/#?=&%]+$/.test(s) || /^(select|insert|update)\b/i.test(s) || /^[a-z_]+\(/.test(s) || /^var\(--/.test(s);

// '…' + '…' + '…' ile yan yana yazılmış dizeler ekranda tek yazıdır: birleşik anahtar olur, parçaları COMPOSE'da kalır
// (i18n-build.mjs birleşik çeviriyi parçaların çevirilerinden kurar).
export const COMPOSE = new Map();
function joinConcats(src, tokens) {
  const out = [];
  for (const tk of tokens) {
    const last = out[out.length - 1];
    if (tk.kind === 'str' && last?.kind === 'str' && last.end !== undefined && /^\s*\+\s*$/.test(src.slice(last.end, tk.at))) {
      last.pieces = [...(last.pieces || [last.value]), tk.value];
      last.value += tk.value;
      last.end = tk.end;
      continue;
    }
    out.push({ ...tk });
  }
  return out;
}

export function extract() {
  const keys = new Map();
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const ranges = skipRanges(src);
    for (const t of joinConcats(src, tokenize(src))) {
      if (ranges.some(([a, b]) => t.at >= a && t.at <= b)) continue;
      if (t.pieces && t.value.trim()) COMPOSE.set(t.value.trim(), t.pieces);
      let key;
      if (t.kind === 'str') key = t.value;
      else key = t.parts.map((p, i) => (i ? `{${i - 1}}` : '') + p).join('');
      key = key.trim();
      if (!key || notUi(key)) continue;
      const staticText = t.kind === 'str' ? key : t.parts.join(' ');
      if (!uiText(staticText, t.kind === 'tpl')) continue;
      if (/^\{\d+\}$/.test(key)) continue;
      if (!keys.has(key)) keys.set(key, f);
    }
  }
  // index.html: açılış yazısı ve sayfa başlığı.
  for (const k of ['Defter açılıyor…', 'Yükleniyor…']) keys.set(k, 'docs/index.html');
  return keys;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'tools/i18n-extract.mjs')) {
  const keys = extract();
  fs.mkdirSync(path.join(ROOT, 'tools/i18n'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tools/i18n/keys.json'), JSON.stringify([...keys.keys()], null, 1) + '\n');
  const enPath = path.join(ROOT, 'tools/i18n/en.json');
  const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {};
  const missing = [...keys.keys()].filter((k) => !(k in en));
  if (process.argv.includes('--missing')) fs.writeFileSync(path.join(ROOT, 'tools/i18n/missing.json'), JSON.stringify(missing, null, 1) + '\n');
  const byFile = {};
  for (const f of keys.values()) byFile[f] = (byFile[f] || 0) + 1;
  console.log(`${keys.size} anahtar (${Object.entries(byFile).map(([f, c]) => `${path.basename(f)} ${c}`).join(', ')}); çevirisi eksik: ${missing.length}`);
}
