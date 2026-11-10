/* Dil katmanı (velinin isteği, 2026-11-10: "ABD öğrencilerine Türkçe hiçbir şey gösteremeyiz"). Uygulama Türkçe yazılır;
   ABD hesaplarında (profiles.curriculum 'us' ile başlar) ekrana giren her yazı burada İngilizceye çevrilir. Çeviriler
   docs/i18n-en.js'te (tools/i18n/en.json'dan tools/i18n-build.mjs üretir) ve yalnızca İngilizce gerektiğinde yüklenir.
   Ekrandaki yazı sözlükte birebir aranır; şablonlu yazılar ("12 soru · 10 doğru") {0}, {1} kalıplarıyla eşleşir, kalıbın
   yakaladığı parçalar da çevrilir. {0|question|questions} sayıya göre tekil ya da çoğul seçer. Çevrilemeyen Türkçe yazı
   I18N.miss'e düşer; ekran testi bunu ve sayfada kalan Türkçe harfleri yakalar. app.js'ten önce yüklenir. */

let LANG = 'tr';
let LOCALE = 'tr-TR';
const I18N = { en: null, content: null, patterns: [], miss: new Set(), observer: null };
const I18N_TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
// Türkçe harf taşımayan ama Türkçe olan yaygın ekran sözcükleri (tools/i18n-extract.mjs ile aynı liste).
const I18N_TR_WORDS = new Set(('Kapat Geri Rapor Konular Konu Sorular Soru Deneme Denemeler Ayarlar Ayar Kitap Kitaplar Kelime Kelimeler Klavye ' +
  'Kahraman Tamam Evet Sil Kaydet Ana Yeter Hata Ders Dersler Tekrar Tekrarlar Oyun Mola Bilmece Bulmaca Oyna Ekle Veli Anne Baba Aile ' +
  'Yeni Eski Bitti Bitir Devam Ara Kalan Puan Seviye Hedef Plan Yolla Tekrarla Dinle Yaz Oku Sayfa Sayfalar Sonraki Sonra Bilgi ' +
  'Merhaba Selam Hadi Aferin Bravo Harika Kolay Zor Orta Kalem Silgi Defter Okul Sinav Mesaj Mesajlar Yorum Not Notlar Takvim Hafta Saat ' +
  'Dakika Saniye Kapali Kapalı Acik Tahmin Kart Kartlar Altın Bronz Seri Rozet Hediye Yemek Elma Pasta Uyku Yorgun Mutlu ' +
  've ile bir bu da de ne mi mu var yok ama icin için gibi kadar sonra once önce daha en cok çok az hem soru konu ders gun gün dk sn').split(/\s+/));
const I18N_SKIP_WORDS = new Set(['Plan', 'Net', 'Not', 'Ana', 'Bravo', 'Seri', 'Orta', 'Hedef', 'Puan']); // İngilizcede de geçenler tek başına Türkçe sayılmaz

// Sayının yanındaki birimler: [tekil, çoğul].
const I18N_UNITS = { soru: ['question', 'questions'], dk: ['min', 'min'], sa: ['hr', 'hr'], sn: ['sec', 'sec'], dakika: ['minute', 'minutes'],
  saat: ['hour', 'hours'], gün: ['day', 'days'], hafta: ['week', 'weeks'], kart: ['card', 'cards'], kelime: ['word', 'words'], konu: ['topic', 'topics'],
  ders: ['lesson', 'lessons'], sayfa: ['page', 'pages'], yanlış: ['wrong', 'wrong'], doğru: ['correct', 'correct'], boş: ['blank', 'blank'],
  altın: ['gold', 'gold'], bronz: ['bronze', 'bronze'], yıldız: ['star', 'stars'], deneme: ['practice test', 'practice tests'], tekrar: ['review', 'reviews'],
  kitap: ['book', 'books'], fotoğraf: ['photo', 'photos'], puan: ['point', 'points'], net: ['net', 'net'], kez: ['time', 'times'] };
const isUsCurriculum = (p) => /^us/.test(p?.curriculum || '');
const looksTurkish = (s) => {
  if (!s || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) return false;
  if (I18N_TR_LETTERS.test(s)) return true;
  const words = s.split(/[^A-Za-zÇĞİÖŞÜçğıöşü'’]+/).filter(Boolean); // you've, Ali'nin tek sözcük
  if (words.length === 1) return I18N_TR_WORDS.has(words[0]) && !I18N_SKIP_WORDS.has(words[0]);
  // Büyük harfle başlayan Türkçe sözcük ("Ders 6 · E and I") tek başına yeter; küçük harfli olanlar bir bağlaçla birlikte.
  if (words.some((w) => /^[A-ZÇĞİÖŞÜ]/.test(w) && I18N_TR_WORDS.has(w) && !I18N_SKIP_WORDS.has(w))) return true;
  return words.filter((w) => I18N_TR_WORDS.has(w) && !I18N_SKIP_WORDS.has(w)).length >= 1 && words.some((w) => /^(ve|ile|bir|bu|da|de|ne|var|yok|ama|soru|konu|ders|dk|sn|gün|için)$/.test(w));
};

function i18nPatterns(dict) {
  const pats = [];
  for (const [key, en] of Object.entries(dict)) {
    if (!/\{\d+\}/.test(key)) continue;
    const order = [];
    const src = key.split(/(\{\d+\})/).map((part) => {
      const m = /^\{(\d+)\}$/.exec(part);
      if (m) { order.push(+m[1]); return '([\\s\\S]+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    const literal = key.replace(/\{\d+\}/g, '').length;
    pats.push({ re: new RegExp('^' + src + '$'), en, order, literal });
  }
  return pats.sort((a, b) => b.literal - a.literal);
}

function i18nFill(en, groups) {
  return en.replace(/\{(\d+)(?:\|([^|}]*)\|([^}]*))?\}/g, (all, i, one, many) => {
    const g = groups[+i];
    if (g === undefined) return all;
    if (one !== undefined) return parseFloat(String(g).replace(',', '.')) === 1 ? one : many;
    return t(g);
  });
}

// Yazının çevirisi; çevirisi yoksa kendisi. Baştaki ve sondaki boşluklar korunur.
function t(text, depth = 0) {
  if (LANG !== 'en' || !I18N.en || text === null || text === undefined) return text;
  const s = String(text);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const key = m[2];
  if (!key) return s;
  let out = I18N.en[key];
  if (out === undefined && looksTurkish(key)) {
    for (const p of I18N.patterns) {
      const r = p.re.exec(key);
      if (!r) continue;
      const groups = [];
      p.order.forEach((idx, k) => { groups[idx] = r[k + 1]; });
      out = i18nFill(p.en, groups);
      break;
    }
  } else if (out !== undefined && out.includes('{')) out = out.replace(/\{\d+\|([^|}]*)\|[^}]*\}/g, '$1');
  // Küçük harfle cümle içine giren ad ("elma", "bir şaka"): büyük harfli karşılığı varsa o, küçük harfle; tersi de
  // (cümle başında büyük harfle yazılmış "Ormana").
  if (out === undefined && /^[a-zçğıöşü]/.test(key)) {
    const en = I18N.en[key.charAt(0).toLocaleUpperCase('tr') + key.slice(1)];
    if (en !== undefined) out = en.charAt(0).toLowerCase() + en.slice(1);
  } else if (out === undefined && /^[A-ZÇĞİÖŞÜ]/.test(key) && looksTurkish(key)) {
    const en = I18N.en[key.charAt(0).toLocaleLowerCase('tr') + key.slice(1)];
    if (en !== undefined) out = en.charAt(0).toUpperCase() + en.slice(1);
  }
  // Sayı ve birim ("0 soru", "1 sa 40 dk", "12 kelime"): birimler tekil ya da çoğul İngilizceye.
  if (out === undefined && /^\d/.test(key)) {
    const body = key.replace(/\.$/, '');
    const pairs = [...body.matchAll(/(\d+(?:[.,]\d+)?)\s+([A-Za-zçğıöşüÇĞİÖŞÜ]+)/g)];
    if (pairs.length && pairs.map((p) => p[0]).join(' ') === body.replace(/\s+/g, ' ') && pairs.every((p) => I18N_UNITS[p[2]])) {
      out = pairs.map((p) => { const u = I18N_UNITS[p[2]]; return `${p[1]} ${parseFloat(p[1].replace(',', '.')) === 1 ? u[0] : u[1]}`; }).join(' ') + (key.endsWith('.') ? '.' : '');
    }
  }
  // Sonda sayı ("Saç rengi 3", "Göz 2"): önü çevrilir, sayı yerinde kalır.
  if (out === undefined && looksTurkish(key) && /^(.*\S) (\d+)$/.test(key) && depth < 3) {
    const [, head, num] = /^(.*\S) (\d+)$/.exec(key);
    const tr = t(head, depth + 1);
    if (tr !== head) out = `${tr} ${num}`;
  }
  // Baştaki simge ya da ok ("→ ", "🎤 ") ve sondaki nokta: onlarsız aranır, sonra geri eklenir.
  if (out === undefined && looksTurkish(key) && depth < 3) {
    const pm = /^([^A-Za-zÇĞİÖŞÜçğıöşüâîû0-9"“'(]*)([\s\S]*?)([.!?…:]*)$/.exec(key);
    if (pm && (pm[1] || pm[3]) && pm[2]) {
      const inner = t(pm[2], depth + 1);
      if (inner !== pm[2]) out = pm[1] + inner + pm[3];
    }
  }
  // Arka arkaya eklenmiş cümleler: en uzun çevrilebilen cümle dizisi aranır (iki şablonun birleştiği paragraflar).
  if (out === undefined && looksTurkish(key) && depth < 3 && /[.!?] \S/.test(key)) {
    const sent = key.split(/(?<=[.!?…]) (?=\S)/);
    if (sent.length > 1) {
      const res = [];
      let ok = true;
      for (let i = 0; i < sent.length;) {
        let j = sent.length, got = null;
        for (; j > i; j--) {
          const chunk = sent.slice(i, j).join(' ');
          const tr = t(chunk, depth + 1);
          if (tr !== chunk || !looksTurkish(chunk)) { got = tr; break; }
        }
        if (got === null) { ok = false; break; }
        res.push(got);
        i = j;
      }
      if (ok) out = res.join(' ');
    }
  }
  // Parçalardan kurulmuş yazı ("İyi günler, Ali", "Mola: bir şaka", liste, iki satır): ayırıcılardan bölünür, parçalar
  // çevrilir; " ve " " and " olur.
  if (out === undefined && looksTurkish(key) && depth < 3) {
    const parts = key.split(/(\n| · |: |, | — | – | ve |\. |; )/);
    if (parts.length > 1) {
      const done = parts.map((p, i) => (i % 2 ? (p === ' ve ' ? ' and ' : p) : t(p, depth + 1)));
      if (done.some((p, i) => p !== parts[i])) out = done.join('');
    }
  }
  if (out === undefined) {
    if (looksTurkish(key) && !depth) I18N.miss.add(key);
    return s;
  }
  if (!depth && looksTurkish(out)) I18N.miss.add(key); // kalıp ya da parçalar çevrildi ama içinde Türkçe kaldı
  return m[1] + out + m[3];
}

const I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
function i18nNode(node) {
  if (node.nodeType === 3) {
    if (node.parentElement?.closest('[translate="no"], script, style')) return;
    const v = node.nodeValue, n = t(v);
    if (n !== v) node.nodeValue = n;
    return;
  }
  if (node.nodeType !== 1 || node.closest('[translate="no"]')) return;
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let x = walk.nextNode(); x; x = walk.nextNode()) i18nNode(x);
  for (const el of [node, ...node.querySelectorAll('[placeholder],[aria-label],[title],[alt]')]) {
    for (const a of I18N_ATTRS) {
      const v = el.getAttribute?.(a);
      if (v) { const n = t(v); if (n !== v) el.setAttribute(a, n); }
    }
  }
}

function i18nWatch() {
  if (I18N.observer) return;
  I18N.observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(i18nNode);
      else if (r.type === 'characterData') i18nNode(r.target);
      else if (r.type === 'attributes') {
        const v = r.target.getAttribute(r.attributeName);
        if (v) { const n = t(v); if (n !== v) r.target.setAttribute(r.attributeName, n); }
      }
    }
  });
  I18N.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  i18nNode(document.body);
  document.title = t(document.title);
}

function i18nLoad() {
  if (I18N.en) return Promise.resolve();
  const v = (document.currentScript?.src || [...document.scripts].find((s) => /i18n\.js/.test(s.src))?.src || '').split('?v=')[1] || '';
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'i18n-en.js' + (v ? '?v=' + v : '');
    s.onload = () => {
      I18N.en = window.I18N_EN || {};
      I18N.content = window.I18N_CONTENT || {};
      I18N.patterns = i18nPatterns(I18N.en);
      resolve();
    };
    s.onerror = () => reject(new Error('Language file could not be loaded. Check your connection and reload.'));
    document.head.append(s);
  });
}

// Dili ayarlar. İngilizceden Türkçeye dönüşte sayfa yenilenir (ekrandaki yazılar zaten çevrilmiş olabilir).
async function setLang(lang) {
  lang = lang === 'en' ? 'en' : 'tr';
  try { localStorage.setItem('defter.lang', lang); } catch (e) { /* önemli değil */ }
  if (lang === LANG) { if (lang === 'en') i18nWatch(); return; }
  if (lang === 'tr') { location.reload(); return new Promise(() => {}); }
  await i18nLoad();
  LANG = 'en';
  LOCALE = 'en-US';
  document.documentElement.lang = 'en';
  i18nWatch();
}
// Profilden dil: ABD müfredatındaki hesap (öğrenci, veli, öğretmen) İngilizce görür.
const langForProfile = (p) => (isUsCurriculum(p) ? 'en' : 'tr');
// İçerik (şakalar, şiirler, selamlar): İngilizcede I18N_CONTENT'teki karşılığı, yoksa Türkçesi.
const i18nContent = (name, fallback) => (LANG === 'en' && I18N.content?.[name]) || fallback;

// Yerel diyaloglar da çevrilsin.
for (const fn of ['confirm', 'alert', 'prompt']) {
  const orig = window[fn].bind(window);
  window[fn] = (msg, ...rest) => orig(t(msg), ...rest);
}

// Açılışta: daha önce seçilen dil, yoksa tarayıcının dili (Türkçe değilse İngilizce). Profil yüklenince kesinleşir.
(function i18nBoot() {
  let saved = null;
  try { saved = localStorage.getItem('defter.lang'); } catch (e) { /* önemli değil */ }
  const want = saved || (/^tr\b/i.test(navigator.language || 'tr') ? 'tr' : 'en');
  if (want === 'en') {
    LANG = 'en'; LOCALE = 'en-US'; document.documentElement.lang = 'en';
    I18N.ready = i18nLoad().then(() => { if (document.body) i18nWatch(); else document.addEventListener('DOMContentLoaded', i18nWatch); }).catch(() => {});
  } else I18N.ready = Promise.resolve();
})();
