/* Klavye (velinin isteği): on parmak klavye dersleri. Ekranda Türkçe Q klavyenin bütün tuşları ve iki el. Çocuk
   işaret parmaklarını F ve J'ye koyar; her harfte hangi parmağın hangi tuşa basacağı söylenir: tuş ve parmak yanar,
   bilgisayarda Türkçe ses varsa sesli de söylenir. "asas asas" gibi satırlar yazar; doğru yazdıkça alttaki satırda
   ışık yanar, yanlışta sağ serçe parmakla ⌫ geri silmesi gösterilir. Ders bitince puan, doğruluğa göre yıldız;
   yıldızlar kelime kahramanını güçlendirir ve altın kazandırır. Dersler orta sıradan başlar; üst sıra, alt sıra, sonra
   kelimeler ve cümleler. app.js'ten sonra yüklenir, onun yardımcılarını kullanır (h, render, sb, state…). */

/* Klavye dersleri: saf kısım (tools/test-typing.mjs ayrıca dener) */

// Türkçe Q klavyede harfin tuşu (KeyboardEvent.code). ı I tuşunda, i İ tuşunda; Ş, İ, Ğ, Ü, Ö, Ç ve nokta kendi
// yerlerinde.
const TQ_KEY = { ' ': 'Space', '.': 'Slash', ',': 'Backslash', 'ı': 'KeyI', 'i': 'Quote', 'ş': 'Semicolon', 'ğ': 'BracketLeft', 'ü': 'BracketRight', 'ö': 'Comma', 'ç': 'Period' };
for (const c of 'abcdefghjklmnopqrstuvwxyz') TQ_KEY[c] = 'Key' + c.toUpperCase();
// Hangi parmak: 0–3 sol serçe, yüzük, orta, işaret; 4–7 sağ işaret, orta, yüzük, serçe; 8 başparmaklar.
const FINGER_NAMES = ['sol serçe parmağın', 'sol yüzük parmağın', 'sol orta parmağın', 'sol işaret parmağın',
  'sağ işaret parmağın', 'sağ orta parmağın', 'sağ yüzük parmağın', 'sağ serçe parmağın', 'başparmağın'];
const FINGER_OF = {};
for (const [f, codes] of [
  [0, 'Backquote Digit1 Tab KeyQ CapsLock KeyA ShiftLeft IntlBackslash KeyZ ControlLeft'],
  [1, 'Digit2 KeyW KeyS KeyX MetaLeft'],
  [2, 'Digit3 KeyE KeyD KeyC AltLeft'],
  [3, 'Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB'],
  [4, 'Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM'],
  [5, 'Digit8 KeyI KeyK Comma AltRight'],
  [6, 'Digit9 KeyO KeyL Period MetaRight'],
  [7, 'Digit0 Minus Equal Backspace KeyP BracketLeft BracketRight Enter Semicolon Quote Backslash Slash ShiftRight ContextMenu ControlRight'],
  [8, 'Space'],
]) for (const c of codes.split(' ')) FINGER_OF[c] = f;

// Dersler. keys: o derste öğrenilen harfler; drills: tuş alıştırmaları; words: yalnızca o ana kadar öğrenilen
// harflerle kelimeler; lines: hazır cümleler. Satırlar her seferinde yeniden dizilir, tekrar eden ders aynı gelmez.
const TYPING_STAGES = ['Orta sıra', 'Üst sıra', 'Alt sıra', 'Kelimeler ve cümleler'];
const TYPING_LESSONS = [
  { id: 'fj', stage: 0, keys: 'fj', title: 'F ve J', drills: ['fff', 'jjj', 'fj', 'jf', 'ffjj', 'jjff', 'fjf', 'jfj', 'fjfj'] },
  { id: 'dk', stage: 0, keys: 'dk', title: 'D ve K', drills: ['ddd', 'kkk', 'dk', 'kd', 'dkd', 'kdk', 'fdf', 'jkj', 'fdjk', 'kjdf'] },
  { id: 'sl', stage: 0, keys: 'sl', title: 'S ve L', drills: ['sss', 'lll', 'sl', 'ls', 'sls', 'lsl', 'sdf', 'lkj', 'fds', 'jkl', 'sdfjkl'] },
  { id: 'as', stage: 0, keys: 'aş', title: 'A ve Ş', drills: ['asas', 'aaa', 'şşş', 'aşa', 'şaş', 'lşlş', 'asdf', 'jklş', 'fdsa', 'şlkj'],
    words: ['as', 'al', 'ad', 'ada', 'ala', 'kas', 'kasa', 'kafa', 'sal', 'kal', 'dal', 'fal', 'laf', 'saf', 'şal', 'kaş', 'şaka', 'asla', 'sakla', 'salla', 'dalda', 'salda', 'adada', 'kasada'] },
  { id: 'gh', stage: 0, keys: 'gh', title: 'G ve H', drills: ['fgf', 'jhj', 'gh', 'hg', 'fgjh', 'ggg', 'hhh', 'gaga', 'haha'],
    words: ['hal', 'hala', 'saha', 'halk', 'hak', 'şah', 'aha', 'gala', 'gaga', 'kahkaha', 'haşla', 'halka'] },
  { id: 'i', stage: 0, keys: 'i', title: 'İ', drills: ['şiş', 'iii', 'şi', 'li', 'ki', 'ili', 'iki', 'şişi'],
    words: ['iki', 'fil', 'dil', 'kil', 'sil', 'ilk', 'şiş', 'kişi', 'dişi', 'disk', 'hadi', 'silgi', 'gidiş', 'ikili', 'kaşif', 'hilal', 'kişilik'] },
  { id: 'ei', stage: 1, keys: 'eı', title: 'E ve I', drills: ['ded', 'kık', 'ede', 'ıkı', 'eee', 'ııı', 'de', 'kı', 'dek', 'kıd'],
    words: ['el', 'ses', 'kek', 'kale', 'lale', 'kedi', 'eşek', 'eski', 'ekşi', 'keşke', 'kafes', 'kış', 'ışık', 'kaşık', 'halı', 'ıslak', 'ılık', 'akıl', 'dalış', 'sıkı', 'dede', 'elde', 'ekle'] },
  { id: 'ru', stage: 1, keys: 'ru', title: 'R ve U', drills: ['frf', 'juj', 'ru', 'ur', 'rrr', 'uuu', 'fur', 'jur', 'ruru'],
    words: ['su', 'kar', 'dur', 'kuş', 'arı', 'sarı', 'kara', 'fare', 'ders', 'uslu', 'erik', 'şeker', 'kuru', 'dere', 'fıkra', 'şiir', 'kulak', 'ufuk', 'sıra', 'kural', 'kardeş', 'kurdele', 'kuşlar', 'sular'] },
  { id: 'ty', stage: 1, keys: 'ty', title: 'T ve Y', drills: ['ftf', 'jyj', 'ty', 'yt', 'ttt', 'yyy', 'fty', 'jyt'],
    words: ['ay', 'at', 'et', 'tek', 'taş', 'tay', 'yer', 'yıl', 'ayı', 'ayak', 'saat', 'sayı', 'kutu', 'kayak', 'kayık', 'tilki', 'tatil', 'tatlı', 'yatak', 'yeşil', 'tahta', 'tarla', 'hayat', 'ateş', 'yarış', 'taşıt', 'kartal', 'kaykay', 'tuşlar'] },
  { id: 'ow', stage: 1, keys: 'ow', title: 'O ve W', drills: ['lol', 'sws', 'ooo', 'www', 'lo', 'ws', 'olo', 'wsw'],
    words: ['o', 'ok', 'oda', 'kol', 'yol', 'okul', 'orta', 'otel', 'dost', 'tost', 'toka', 'sofra', 'sokak', 'koşu', 'kolay', 'koala', 'doktor', 'okulda', 'sorular', 'okuyor'] },
  { id: 'pq', stage: 1, keys: 'pq', title: 'P ve Q', drills: ['şpş', 'aqa', 'ppp', 'qqq', 'pq', 'qp', 'pip', 'qaq'],
    words: ['ip', 'top', 'pul', 'hap', 'pide', 'kapı', 'tepe', 'kupa', 'sepet', 'pasta', 'palto', 'kapak', 'kitap', 'pilot', 'parti', 'patates', 'papatya', 'portakal', 'kitaplık'] },
  { id: 'gu', stage: 1, keys: 'ğü', title: 'Ğ ve Ü', drills: ['şğş', 'iüi', 'ğğğ', 'üüü', 'ğü', 'üğ', 'ağa', 'üşü'],
    words: ['dağ', 'yağ', 'sağ', 'süt', 'tüy', 'ütü', 'küp', 'üst', 'düş', 'kuğu', 'doğa', 'sürü', 'uğur', 'güle', 'düdük', 'doğru', 'güreş', 'süper', 'türkü', 'değil', 'yüksek', 'dağlar', 'yoğurt', 'ağustos'] },
  { id: 'vn', stage: 2, keys: 'vn', title: 'V ve N', drills: ['fvf', 'jnj', 'vn', 'nv', 'vvv', 'nnn', 'fvn', 'jnv'],
    words: ['on', 'un', 'ev', 'ne', 'dün', 'evet', 'anne', 'nane', 'nine', 'yeni', 'oyun', 'renk', 'kova', 'ayva', 'tavuk', 'kavun', 'vagon', 'vapur', 'aslan', 'kaplan', 'tavşan', 'hayvan', 'dünya', 'ekran', 'klavye'] },
  { id: 'bm', stage: 2, keys: 'bm', title: 'B ve M', drills: ['fbf', 'jmj', 'bm', 'mb', 'bbb', 'mmm', 'fbm', 'jmb'],
    words: ['bir', 'ben', 'bal', 'mum', 'baba', 'masa', 'mavi', 'elma', 'boya', 'bebek', 'balık', 'kalem', 'bulut', 'limon', 'ekmek', 'sabah', 'akşam', 'araba', 'mutlu', 'makas', 'tabak', 'maymun', 'mektup', 'kumbara', 'bisiklet', 'bilgisayar'] },
  { id: 'co', stage: 2, keys: 'cö', title: 'C ve Ö', drills: ['dcd', 'kök', 'cö', 'öc', 'ccc', 'ööö', 'dck', 'köd'],
    words: ['cep', 'cam', 'göl', 'gök', 'cuma', 'cadı', 'dört', 'ödev', 'cevap', 'ceket', 'cümle', 'cetvel', 'köpek', 'böcek', 'börek', 'köprü', 'ördek', 'öykü', 'örnek', 'civciv', 'boncuk', 'bilmece', 'oyuncak', 'eğlence', 'öğrenci', 'öğretmen', 'örümcek'] },
  { id: 'xc', stage: 2, keys: 'xç', title: 'X ve Ç', drills: ['sxs', 'lçl', 'xç', 'çx', 'xxx', 'ççç', 'sxl', 'lçs'],
    words: ['aç', 'iç', 'üç', 'çay', 'çok', 'kaç', 'saç', 'geç', 'güç', 'çöl', 'uçak', 'ağaç', 'ilaç', 'çanta', 'çorba', 'çatal', 'çilek', 'çiçek', 'çocuk', 'çorap', 'güçlü', 'bahçe', 'çalış', 'çekiç', 'çiftlik', 'uçurtma', 'çikolata'] },
  { id: 'zn', stage: 2, keys: 'z.', title: 'Z ve nokta', drills: ['aza', 'ş.ş', 'zzz', '...', 'z.', 'az.', 'zaz', 'ş.'],
    words: ['az', 'biz', 'siz', 'yaz', 'kız', 'göz', 'yüz', 'tuz', 'zil', 'kuzu', 'gezi', 'uzay', 'deniz', 'beyaz', 'güzel', 'kazak', 'kiraz', 'horoz', 'üzüm', 'yüzük', 'zebra', 'yıldız', 'zeytin', 'zürafa', 'sözlük', 'denizaltı', 'televizyon', 'yaz geldi.', 'deniz mavi.', 'çok güzel.'] },
  { id: 'hayvanlar', stage: 3, title: 'Hayvanlar',
    words: ['kedi', 'köpek', 'kuş', 'balık', 'at', 'inek', 'tavşan', 'aslan', 'fil', 'zürafa', 'kaplan', 'ayı', 'tilki', 'kuzu', 'ördek', 'civciv', 'maymun', 'zebra', 'horoz', 'tavuk', 'kurbağa', 'kelebek', 'arı', 'karınca', 'yılan', 'penguen', 'yunus', 'ahtapot', 'deve', 'koyun', 'keçi', 'eşek', 'kaplumbağa'] },
  { id: 'renkler', stage: 3, title: 'Renkler ve sayılar',
    words: ['kırmızı', 'sarı', 'mavi', 'yeşil', 'mor', 'turuncu', 'pembe', 'siyah', 'beyaz', 'gri', 'lacivert', 'kahverengi', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on', 'yirmi', 'yüz', 'bin'] },
  { id: 'cumle1', stage: 3, title: 'Cümleler',
    lines: ['kedi süt içti. kuş uçtu.', 'annem kek yaptı. çok tatlı.', 'babam bana kitap okudu.', 'top yere düştü. çok güldük.',
      'bugün okula erken gittim.', 'deniz çok mavi. hava sıcak.', 'elma kırmızı ve tatlı.', 'ağaçta küçük bir kuş var.'] },
  { id: 'cumle2', stage: 3, title: 'Uzun cümleler',
    lines: ['bugün hava çok güzel.', 'parkta arkadaşımla top oynadık.', 'kahramanım her gün güçleniyor.', 'her gün yeni kelime öğreniyorum.',
      'klavyede on parmakla yazıyorum.', 'kardeşimle bisiklete bindik.', 'yarın denize gideceğiz.', 'kitap okumayı çok seviyorum.'] },
  { id: 'ingilizce', stage: 3, title: 'İngilizce kelimeler',
    words: ['cat', 'dog', 'bird', 'fish', 'red', 'blue', 'green', 'yellow', 'apple', 'book', 'pen', 'hello', 'yes', 'no', 'one', 'two', 'three',
      'mother', 'father', 'sun', 'moon', 'star', 'water', 'milk', 'box', 'six', 'queen', 'happy', 'school', 'friend'] },
];
const pickOne = (list, rnd) => list[Math.floor(rnd() * list.length)];
// "asas asas asas" gibi: bir alıştırma tekrar tekrar (ilk satırda dersin ilk alıştırması); karışık satırda ikişer
// ikişer iki alıştırma.
function drillLine(pool, width, rnd, mixed) {
  const a = mixed ? pickOne(pool, rnd) : pool[0];
  let b = a;
  for (let i = 0; i < 6 && b === a && pool.length > 1; i++) b = pickOne(pool, rnd);
  const out = [];
  for (let i = 0, len = -1; i < 40; i++) {
    const t = mixed && Math.floor(i / 2) % 2 ? b : a;
    if (out.length && len + 1 + t.length > width) break;
    out.push(t);
    len += 1 + t.length;
  }
  return out.join(' ');
}
// Kelime satırı: karışık kelimeler, aynısı art arda gelmez.
function wordLine(pool, width, rnd) {
  const out = [];
  for (let i = 0, len = -1; i < 60; i++) {
    const t = pickOne(pool, rnd);
    if (t === out[out.length - 1] && pool.length > 1) continue;
    if (out.length && len + 1 + t.length > width) break;
    out.push(t);
    len += 1 + t.length;
  }
  return out.join(' ');
}
// Dersin satırları: ilk derslerde kısa (22 harf), sonra 28. Cümle derslerinde hazır cümlelerden dördü.
function typingLines(lesson, rnd = Math.random) {
  if (lesson.lines) {
    const a = [...lesson.lines];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, 4);
  }
  const width = lesson.stage === 0 ? 22 : 28;
  const d = (mixed) => drillLine(lesson.drills, width, rnd, mixed), w = () => wordLine(lesson.words, width, rnd);
  if (!lesson.drills) return [w(), w(), w(), w()];
  if (!lesson.words) return [d(false), d(true), d(true)];
  return [d(false), w(), d(true), w()];
}
// Yıldız doğruluğa göre (hız değil; önce doğru yazmak): %95 üç (velinin seçimi), %90 iki, %75 bir yıldız.
function typingStars(chars, errors) {
  const acc = chars ? chars / (chars + errors) : 0;
  return acc >= 0.95 ? 3 : acc >= 0.9 ? 2 : acc >= 0.75 ? 1 : 0;
}
// Ders sonuçlarından: her dersin en iyi yıldızı, bugün bitirdiği ders sayısı, kahramana katkısı. Her dersin yalnızca en
// iyi sonucu sayılır (aynı dersi tekrar tekrar yapmak şişirmez): her yıldız 1 güç ve 5 altın; günün dersleri (en az bir
// yıldızlı) bittiği her gün 5 altın daha.
function typingStats(results, goal) {
  const ids = new Set(TYPING_LESSONS.map((l) => l.id));
  const best = {}, days = {};
  for (const r of results) {
    if (!ids.has(r.lesson)) continue;
    best[r.lesson] = Math.max(best[r.lesson] || 0, r.stars);
    if (r.stars > 0) { const day = localDate(new Date(r.created_at)); days[day] = (days[day] || 0) + 1; }
  }
  const stars = Object.values(best).reduce((n, s) => n + s, 0);
  const goalDays = goal > 0 ? Object.values(days).filter((n) => n >= goal).length : 0;
  return { best, stars, power: stars, coins: stars * 5 + goalDays * 5, today: days[localDate()] || 0 };
}
// Ders açık mı: ilk ders her zaman; sonrakiler bir öncekinden üç yıldızla (velinin isteği: önce iyice öğrensin).
const TYPING_PASS = 3;
const typingOpen = (best, i) => i === 0 || (best[TYPING_LESSONS[i - 1].id] || 0) >= TYPING_PASS;
// Sıradaki ders: açık olup üç yıldızı olmayan ilk ders; hepsi üç yıldızlıysa sonuncusu.
function typingNext(best) {
  const i = TYPING_LESSONS.findIndex((l, k) => typingOpen(best, k) && (best[l.id] || 0) < TYPING_PASS);
  return i >= 0 ? i : TYPING_LESSONS.length - 1;
}
// Günde kaç ders: aile isterse açar (velinin isteği), her sınıfta; açılmadıysa kapalı.
const typingPerDay = (p) => p?.daily_typing ?? 0;

/* Klavye: ses */

// Tuşun adı ekranda (klavyedeki yazısı) ve seste (Türkçe okunuşu).
const keyName = (ch) => (ch === ' ' ? 'boşluk' : ch === 'i' ? 'İ' : ch === 'ı' ? 'I' : ch.toLocaleUpperCase('tr'));
// "D'ye bas", "A'ya bas", "boşluğa bas": harfin okunuşuna göre ek.
const KEY_TO = { 'a': 'ya', 'ı': 'ya', 'o': 'ya', 'u': 'ya', 'e': 'ye', 'i': 'ye', 'ö': 'ye', 'ü': 'ye', 'w': 'ya', 'x': 'e' };
const keyTo = (ch) => ({ ' ': 'boşluğa', '.': 'noktaya', ',': 'virgüle' })[ch] || `${keyName(ch)}'${KEY_TO[ch] || 'ye'}`;
const KEY_SAY = { ' ': 'boşluk', '.': 'nokta', ',': 'virgül', 'ğ': 'yumuşak ge', 'q': 'kü', 'w': 'dabılyu', 'x': 'iks' };
const keySay = (ch) => KEY_SAY[ch] || (/[aeıioöuü]/.test(ch) ? ch : ch + 'e');
const trVoice = () => (window.speechSynthesis?.getVoices() || []).find((v) => /^tr/i.test(v.lang)) || null;
window.speechSynthesis?.getVoices(); // sesler geç yüklenir; ilk derste hazır olsun
let typingVoice = true;
try { typingVoice = localStorage.getItem('defter.typingVoice') !== '0'; } catch (e) { /* tarayıcı izin vermiyor */ }
// Türkçe ses varsa söyler (yoksa sessiz; Türkçe olmayan sesle tuhaf okumasın).
function sayTr(text) {
  const voice = typingVoice && trVoice();
  if (!voice) return;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* Klavye: ekrandaki klavye ve eller */

// Türkçe Q klavyenin tuşları sıra sıra: [kod, üstündeki yazı, genişlik (tuş birimi)]. Enter iki sıraya yayılır (ISO);
// alt sıradaki parçası "EnterB" yer tutucusudur, Enter'la birlikte çizilir.
const TQ_ROWS = [
  [['Backquote', '"'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'],
    ['Digit8', '8'], ['Digit9', '9'], ['Digit0', '0'], ['Minus', '*'], ['Equal', '-'], ['Backspace', '⌫', 2]],
  [['Tab', 'Tab', 1.5], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'],
    ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', 'Ğ'], ['BracketRight', 'Ü'], ['Enter', 'Enter', 1.5]],
  [['CapsLock', 'Caps', 1.75], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'],
    ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', 'Ş'], ['Quote', 'İ'], ['Backslash', ','], ['EnterB', '', 1.25]],
  [['ShiftLeft', 'Shift', 1.25], ['IntlBackslash', '<'], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'],
    ['KeyM', 'M'], ['Comma', 'Ö'], ['Period', 'Ç'], ['Slash', '.'], ['ShiftRight', 'Shift', 2.75]],
  [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', '', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', 'boşluk', 6.25], ['AltRight', 'Alt Gr', 1.25],
    ['MetaRight', '', 1.25], ['ContextMenu', '', 1.25], ['ControlRight', 'Ctrl', 1.25]],
];
const KB = { u: 44, gap: 4, pad: 8, top: 34 }; // tuş birimi, aralık, kenar; üstte ⌫ okunun yeri
const KB_KEY = KB.u - KB.gap, KB_W = 15 * KB.u + 2 * KB.pad - KB.gap, KB_H = KB.top + 5 * KB.u + 86;
const FINGER_COLOR = ['#9B6BFF', '#3D8BFF', '#21A86A', '#F28C00', '#F28C00', '#21A86A', '#3D8BFF', '#9B6BFF', '#7D8799'];
const FINGER_TINT = ['#EEE6FF', '#E1EDFF', '#DDF3E7', '#FFEBD1', '#FFEBD1', '#DDF3E7', '#E1EDFF', '#EEE6FF', '#ECEFF3'];
const HOME_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']; // parmakların durduğu tuşlar
// Parmakların avuçtaki kökü (8, 9: sol ve sağ başparmak), başparmakların boşluktaki yeri, parmak kalınlığı.
const HAND_BASE = [[114, 300], [152, 292], [192, 290], [230, 296], [376, 296], [414, 290], [454, 292], [492, 300], [246, 318], [362, 318]];
const THUMB_TIP = [[268, 230], [350, 230]];
const FINGER_W = [19, 22, 23, 23, 23, 23, 22, 19, 25, 25];

// Klavye çizimi (SVG) ve üstünde iki el. show({ codes, erase, all }): basılacak tuş(lar) yanar, o parmak renklenip tuşa
// uzanır; erase: ⌫ yanıp söner, sağ serçe parmak ona uzanır, üstünde ok (codes o sırada doğru harfin tuşu: o da yanar,
// parmağı serçe değilse tuşa uzanır); all: bütün parmaklar kendi renginde (parmak
// yerleri). flash(kod, doğru mu): basılan tuş bir an yeşil ya da kırmızı yanar.
function keyboardView() {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  };
  const svg = mk('svg', { viewBox: `0 0 ${KB_W} ${KB_H}`, class: 'kb', 'aria-hidden': 'true' });
  const keys = {};
  TQ_ROWS.forEach((row, r) => {
    let at = 0;
    for (const [code, label, w = 1] of row) {
      const x = KB.pad + at * KB.u, y = KB.top + r * KB.u, width = w * KB.u - KB.gap;
      at += w;
      if (code === 'EnterB') continue;
      const f = FINGER_OF[code] ?? 8;
      const g = mk('g', { class: 'k', style: `--f: ${FINGER_COLOR[f]}` }, svg);
      if (code === 'Enter') {
        const x2 = KB.pad + 13.75 * KB.u, right = x + width, bottom = y + KB.u + KB_KEY;
        mk('path', { class: 'kc', fill: FINGER_TINT[f], d: `M${x} ${y} H${right} V${bottom} H${x2} V${y + KB_KEY} H${x} Z` }, g);
      } else {
        mk('rect', { class: 'kc', fill: FINGER_TINT[f], x, y, width, height: KB_KEY, rx: 7 }, g);
      }
      if (label) mk('text', { class: label.length > 2 ? 'kl sm' : 'kl', x: x + width / 2, y: y + KB_KEY / 2 }, g).textContent = label;
      // F ve J'deki çıkıntı: bakmadan bulmak için
      if (code === 'KeyF' || code === 'KeyJ') mk('rect', { class: 'bump', x: x + width / 2 - 7, y: y + KB_KEY - 9, width: 14, height: 3, rx: 1.5 }, g);
      keys[code] = { g, cx: x + width / 2, cy: y + KB_KEY / 2 + (code === 'Enter' ? KB.u / 2 : 0) };
    }
  });
  // Eller: avuçlar klavyenin altında, parmaklar duruş tuşlarına uzanır.
  const hands = mk('g', { class: 'hands' }, svg);
  for (const cx of [172, 434]) mk('ellipse', { class: 'palm', cx, cy: 334, rx: 88, ry: 48 }, hands);
  const TIP_DOWN = 12; // parmak ucu tuşun alt yarısında durur, tuşun harfi görünsün
  const homeTip = (i) => (i < 8 ? [keys[HOME_KEYS[i]].cx, keys[HOME_KEYS[i]].cy + TIP_DOWN] : THUMB_TIP[i - 8]);
  const tips = HAND_BASE.map((_, i) => homeTip(i));
  const fingers = HAND_BASE.map(([x1, y1], i) => mk('line', { class: 'fg', x1, y1, x2: tips[i][0], y2: tips[i][1], 'stroke-width': FINGER_W[i] }, hands));
  const arrow = mk('text', { class: 'kb-arrow', x: keys.Backspace.cx, y: 26 }, svg);
  arrow.textContent = '👇';
  let anim = 0;
  const moveTo = (want) => {
    const from = tips.map((t) => [...t]);
    const t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = (now) => {
      const k = reduceMotion() ? 1 : Math.min(1, (now - t0) / 140);
      fingers.forEach((line, i) => {
        tips[i] = [from[i][0] + (want[i][0] - from[i][0]) * k, from[i][1] + (want[i][1] - from[i][1]) * k];
        line.setAttribute('x2', tips[i][0]);
        line.setAttribute('y2', tips[i][1]);
      });
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  let lit = [];
  const show = ({ codes = [], erase = false, all = false } = {}) => {
    for (const g of lit) g.classList.remove('target', 'erase');
    lit = [];
    const want = HAND_BASE.map((_, i) => homeTip(i));
    const active = new Set(all ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : []);
    for (const code of erase ? ['Backspace', ...codes] : codes) {
      const k = keys[code];
      if (!k) continue;
      k.g.classList.add(erase && code === 'Backspace' ? 'erase' : 'target');
      lit.push(k.g);
      const f = FINGER_OF[code] ?? 8;
      if (f === 8) { active.add(8); active.add(9); } else if (!active.has(f)) { active.add(f); want[f] = [k.cx, k.cy + TIP_DOWN]; }
    }
    svg.classList.toggle('all', all);
    fingers.forEach((line, i) => {
      line.classList.toggle('on', active.has(i));
      line.style.stroke = active.has(i) ? (erase && i === 7 ? '#E5484D' : FINGER_COLOR[Math.min(i, 8)]) : '';
    });
    arrow.classList.toggle('show', erase);
    moveTo(want);
  };
  const flash = (code, ok) => {
    const k = keys[code];
    if (!k) return;
    k.g.classList.remove('hit', 'miss');
    k.g.classList.add(ok ? 'hit' : 'miss');
    clearTimeout(k.timer);
    k.timer = setTimeout(() => k.g.classList.remove('hit', 'miss'), 200);
  };
  const el = h('div', { class: 'kb-box' });
  el.append(svg);
  return { el, show, flash, keys };
}

/* Klavye: öğrencinin sayfaları */

// Klavye dersleri bilgisayar klavyesiyle yapılır: fare ya da dokunmatik yüzey olan cihazda sekme görünür (telefonda değil).
const hasKeyboard = () => !!window.matchMedia?.('(any-hover: hover) and (any-pointer: fine)').matches;
ICONS.keyboard = 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9.5h.01M10.5 9.5h.01M14 9.5h.01M17.5 9.5h.01M7 13h.01M17.5 13h.01M10 13h4M8.5 16h7';

// Kahraman: kelime kartları ve klavye dersleri birlikte (güç, araçların izin verdiği güç, altın).
async function typingHero() {
  const id = sid();
  const [progress, answers, purchases, results] = await Promise.all([
    q(sb.from('word_progress').select('word, box, stability').eq('student_id', id)),
    q(sb.from('word_answers').select('word, correct, again, answered_at, stability_before').eq('student_id', id)),
    q(sb.from('purchases').select('item, price').eq('student_id', id)),
    q(sb.from('typing_results').select('lesson, stars, created_at').eq('student_id', id)),
  ]);
  const typing = typingStats(results, typingPerDay(state.student));
  const owned = new Set(purchases.map((p) => p.item));
  const wordPower = heroPower(heroBest(progress, answers));
  const at = (stars) => heroLevel(wordPower + stars, heroCap(owned));
  return { owned, typing, wordPower, level: at(typing.power), at, coins: heroCoins(answers, purchases, wordsPerDay(state.student), typing.coins) };
}

async function viewTyping() {
  loading();
  const hero = await typingHero();
  const { best } = hero.typing;
  const goal = typingPerDay(state.student);
  const next = typingNext(best);
  const lesson = TYPING_LESSONS[next];
  const kb = keyboardView();
  const tile = (l, i) => {
    const open = typingOpen(best, i), stars = best[l.id] || 0;
    return h('button', { class: 'ty-lesson' + (i === next ? ' next' : ''), disabled: !open || null,
      'aria-label': `Ders ${i + 1}: ${l.title}${open ? `, ${stars} yıldız` : ', kilitli: önceki dersten üç yıldız gerekiyor'}`, onclick: () => runTyping(i, hero) },
      h('span', { class: 'small muted' }, `Ders ${i + 1}`), h('b', {}, l.title),
      h('span', { class: 'stars' }, open ? '⭐'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒'));
  };
  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Klavye'), h('h1', {}, 'On parmak klavye'),
      h('p', { class: 'muted' }, 'Klavyeye bakmadan, on parmakla yazmayı öğren. Her harfte hangi parmağın hangi tuşa basacağı ekranda yanar. '
        + 'Bir dersten üç yıldız alınca sonraki açılır.')),
    hasKeyboard() ? null : h('p', { class: 'card warn' }, 'Bu dersler bilgisayar klavyesiyle yapılır. Bilgisayardan aç.'),
    h('section', { class: 'card stack', style: 'gap: 10px' },
      heroScene(state.student, hero.level, hero.owned),
      h('div', { class: 'spread' },
        h('b', {}, `💪 Güç ${hero.level}`),
        h('b', { class: 'num' }, `🪙 ${hero.coins.balance}`),
        h('button', { class: 'small', onclick: () => go('shop') }, 'Mağaza')),
      h('p', { class: 'small muted' }, `Klavye yıldızların: ${hero.typing.stars} ⭐. Her yıldız kahramanını güçlendirir; yeni yıldız 5 altın.`)),
    h('section', { class: 'card stack', style: 'gap: 10px' },
      goal ? h('div', { class: 'spread' }, h('b', { class: 'num' }, `Bugün ${Math.min(hero.typing.today, goal)}/${goal} ders`),
        h('span', { class: 'small muted' }, `${TYPING_LESSONS.filter((l) => best[l.id] > 0).length}/${TYPING_LESSONS.length} ders bitti`)) : null,
      goal ? h('div', { class: 'progress' }, h('i', { style: `width: ${Math.min(100, (hero.typing.today / goal) * 100)}%` })) : null,
      h('button', { class: 'primary block', onclick: () => runTyping(next, hero) }, `Başla: Ders ${next + 1} · ${lesson.title}`),
      h('p', { class: 'small muted' }, 'Parmakların böyle durur: işaret parmakların F ve J\'de (bu iki tuşta küçük çıkıntı var), başparmakların boşlukta.'),
      kb.el),
    TYPING_STAGES.map((name, s) => [
      h('h2', {}, name),
      h('div', { class: 'ty-lessons' }, TYPING_LESSONS.map((l, i) => (l.stage === s ? tile(l, i) : null))),
    ]));
  kb.show({ all: true, codes: ['KeyF', 'KeyJ'] });
}

// Ders: önce parmaklar yerleşir (F ve J'ye basar), yeni tuşlar tanıtılır (her biri üç kez), sonra satırlar yazılır.
// Soru çözme gibi açılır: alt menü gizli, geri tuşu önce sorar. Sonuç ders bitince kaydedilir.
function runTyping(index, hero) {
  const lesson = TYPING_LESSONS[index];
  const run = {
    track: 'typing', index, lesson, hero, lines: typingLines(lesson), li: 0, pos: 0, err: null,
    phase: 'ready', ready: new Set(), intro: [...(lesson.keys || '')], ii: 0, hits: 0,
    chars: 0, errors: 0, lineErrors: 0, points: 0, ms: 0, last: 0, misses: {}, kb: keyboardView(),
    leaveText: 'Dersten çıkılsın mı? Bu ders kaydedilmez, sonra baştan başlarsın.',
  };
  const onKey = (e) => {
    if (state.session !== run) { window.removeEventListener('keydown', onKey, true); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // kısayollar tarayıcının
    if (e.key === 'Tab') e.preventDefault();
    if (e.key !== 'Backspace' && e.key.length !== 1) return; // Shift, Enter, oklar…: sayılmaz
    e.preventDefault();
    if (!e.repeat) typingKey(run, e);
  };
  run.detach = () => { window.removeEventListener('keydown', onKey, true); clearTimeout(run.timer); window.speechSynthesis?.cancel(); };
  // Sonuç ekranından "Tekrar" ya da "Sonraki ders": aynı oturum kaydı kullanılır, geçmiş şişmez.
  if (history.state?.overlay === 'session') history.replaceState(history.state, '');
  else pushOverlay('session');
  state.session = run;
  state.leaveOverlay = run.detach;
  window.addEventListener('keydown', onKey, true);
  document.activeElement?.blur?.();
  drawTyping(run);
  sayTr('İşaret parmaklarını F ve J tuşlarına koy.');
}

// Türkçe Q'da basılan tuş bu harf mi: önce tuşun yeri (kod), bilinmeyen tuşta yazdığı harf.
const typedIs = (e, ch) => (e.code && FINGER_OF[e.code] != null && TQ_KEY[ch] ? e.code === TQ_KEY[ch] : (e.key || '').toLocaleLowerCase('tr') === ch);

function typingKey(run, e) {
  const { kb } = run;
  if (run.phase === 'ready') {
    if (e.code === 'KeyF' || e.code === 'KeyJ') { run.ready.add(e.code); kb.flash(e.code, true); }
    if (run.ready.size === 2) {
      run.phase = run.intro.length ? 'intro' : 'type';
      if (run.intro.length) sayTr(`Yeni tuş: ${keySay(run.intro[0])}. ${upFirst(FINGER_NAMES[FINGER_OF[TQ_KEY[run.intro[0]]]])}la bas.`);
    }
    return drawTyping(run);
  }
  if (run.phase === 'intro') {
    const ch = run.intro[run.ii];
    const ok = typedIs(e, ch);
    kb.flash(e.code, ok);
    run.introMiss = !ok;
    if (ok && ++run.hits >= 3) {
      run.ii++;
      run.hits = 0;
      if (run.ii >= run.intro.length) run.phase = 'type';
      else sayTr(`Yeni tuş: ${keySay(run.intro[run.ii])}. ${upFirst(FINGER_NAMES[FINGER_OF[TQ_KEY[run.intro[run.ii]]]])}la bas.`);
    }
    return drawTyping(run);
  }
  if (run.phase !== 'type') return;
  if (run.err) {
    // Yanlıştan sonra yalnızca ⌫ (sağ serçe parmak) kabul edilir.
    if (e.key === 'Backspace') { run.err = null; kb.flash('Backspace', true); } else kb.flash(e.code, false);
    return drawTyping(run);
  }
  if (e.key === 'Backspace') return; // doğru yazılanı silmeye gerek yok
  // Süre: tuşlar arası, en çok 8 sn (ara verdiyse o süre sayılmaz).
  const now = performance.now();
  if (run.last) run.ms += Math.min(now - run.last, 8000);
  run.last = now;
  const line = run.lines[run.li], ch = line[run.pos];
  if (typedIs(e, ch)) {
    run.pos++;
    run.chars++;
    kb.flash(e.code, true);
    if (run.pos >= line.length) return lineDone(run);
  } else {
    run.errors++;
    run.lineErrors++;
    run.misses[ch] = (run.misses[ch] || 0) + 1;
    run.err = e.key === ' ' ? '·' : e.key;
    kb.flash(e.code, false);
    sayTr('Sağ serçe parmağınla geri sil.');
  }
  drawTyping(run);
}

// Satır bitti: puan (harf sayısı eksi yanlış), kısa bir kutlama, sonra sıradaki satır.
function lineDone(run) {
  const line = run.lines[run.li];
  run.linePoints = Math.max(0, line.length - run.lineErrors);
  run.points += run.linePoints;
  run.phase = 'done';
  drawTyping(run);
  run.timer = setTimeout(() => {
    if (state.session !== run) return;
    run.li++;
    run.pos = 0;
    run.lineErrors = 0;
    run.last = 0;
    if (run.li >= run.lines.length) return endTyping(run);
    run.phase = 'type';
    drawTyping(run);
  }, 900);
}

// Ders sayfası bir kez çizilir; her tuşta yalnızca yönerge, satırlar ve klavye güncellenir.
function drawTyping(run) {
  if (!run.view) {
    const v = run.view = { guide: h('div', { class: 'ty-guide', role: 'status' }), target: h('div', { class: 'ty-target' }),
      typed: h('div', { class: 'ty-typed' }), count: h('span', { class: 'small muted num' }), bar: h('i') };
    const voice = trVoice() ? h('button', { class: 'ghost small' }) : null;
    const voiceLabel = () => { if (voice) voice.textContent = typingVoice ? '🔊 Sesli anlatım açık' : '🔇 Sesli anlatım kapalı'; };
    if (voice) voice.onclick = () => {
      typingVoice = !typingVoice;
      try { localStorage.setItem('defter.typingVoice', typingVoice ? '1' : '0'); } catch (e) { /* önemli değil */ }
      if (!typingVoice) window.speechSynthesis?.cancel();
      voiceLabel();
      voice.blur();
    };
    voiceLabel();
    render(
      h('div', { class: 'qhead stack', style: 'gap: 8px' },
        h('div', { class: 'spread' },
          h('button', { class: 'ghost', onclick: () => go('typing') }, '← Ara ver'),
          h('b', {}, `Ders ${run.index + 1} · ${run.lesson.title}`), v.count),
        h('div', { class: 'progress' }, v.bar)),
      h('section', { class: 'ty-wrap stack' }, v.guide, h('div', { class: 'ty-lines' }, v.target, v.typed), run.kb.el,
        h('div', { class: 'spread small muted' }, h('span', {}, 'Klavyeye değil, ekrandaki klavyeye bak.'), voice)));
  }
  const v = run.view;
  const total = run.lines.reduce((n, l) => n + l.length, 0);
  const done = run.lines.slice(0, run.li).reduce((n, l) => n + l.length, 0) + run.pos;
  v.bar.style.width = `${(done / total) * 100}%`;
  v.count.textContent = run.phase === 'ready' || run.phase === 'intro' ? 'Hazırlık' : `Satır ${Math.min(run.li + 1, run.lines.length)}/${run.lines.length}`;
  const dot = (f) => h('span', { class: 'dot', style: `background: ${FINGER_COLOR[f]}` });
  const spans = (text, cls) => [...text].map((c, i) => h('span', { class: cls(i) + (c === ' ' ? ' sp' : '') }, c === ' ' ? '·' : c));
  v.guide.className = 'ty-guide';
  if (run.phase === 'ready') {
    fill(v.guide, '👆 İşaret parmaklarını F ve J\'ye koy. Bu iki tuşta küçük çıkıntı var, bakmadan bulabilirsin. Hazırsan F ve J\'ye bas.');
    fill(v.target, spans('f j', (i) => (i === 1 ? 'todo' : run.ready.has(i ? 'KeyJ' : 'KeyF') ? 'done' : 'cur')));
    fill(v.typed, h('span', { class: 'small muted' }, 'Diğer parmakların yanlarında: sol elin A S D F, sağ elin J K L Ş üstünde.'));
    run.kb.show({ all: true, codes: ['KeyF', 'KeyJ'].filter((c) => !run.ready.has(c)) });
    return;
  }
  if (run.phase === 'intro') {
    const ch = run.intro[run.ii], code = TQ_KEY[ch], f = FINGER_OF[code];
    if (run.introMiss) v.guide.classList.add('bad');
    fill(v.guide, dot(f), run.introMiss ? `O tuş değil. ${upFirst(FINGER_NAMES[f])}la ${keyTo(ch)} bas.`
      : `Yeni tuş: ${keyName(ch)} · ${FINGER_NAMES[f]}. ${upFirst(keyTo(ch))} üç kez bas.`);
    fill(v.target, h('span', { class: 'cur big' }, keyName(ch)));
    fill(v.typed, [0, 1, 2].map((i) => h('span', { class: i < run.hits ? 'lit' : 'slot' }, i < run.hits ? '✓' : '·')));
    run.kb.show({ codes: [code] });
    return;
  }
  const line = run.lines[Math.min(run.li, run.lines.length - 1)];
  const pos = run.phase === 'done' ? line.length : run.pos;
  fill(v.target, spans(line, (i) => (i < pos ? 'done' : i === pos ? (run.err ? 'cur bad' : 'cur') : 'todo')));
  fill(v.typed, [...line].map((c, i) => (i < pos ? h('span', { class: 'lit' + (c === ' ' ? ' sp' : '') }, c === ' ' ? '·' : c)
    : i === pos && run.err ? h('span', { class: 'bad' }, run.err) : h('span', { class: 'slot' }, c === ' ' ? '·' : c))));
  if (run.phase === 'done') {
    v.guide.classList.add('ok');
    fill(v.guide, `🎉 Satır tamam! +${run.linePoints} puan`);
    run.kb.show({});
  } else if (run.err) {
    v.guide.classList.add('bad');
    const ch = line[pos], f = FINGER_OF[TQ_KEY[ch]] ?? 8;
    fill(v.guide, dot(7), `Yanlış tuş! Önce sağ serçe parmağınla ⌫ geri sil, sonra ${FINGER_NAMES[f]}la ${keyTo(ch)} bas.`);
    run.kb.show({ erase: true, codes: [TQ_KEY[ch]] });
  } else {
    const ch = line[pos], code = TQ_KEY[ch] || '', f = FINGER_OF[code] ?? 8;
    fill(v.guide, dot(f), `${upFirst(FINGER_NAMES[f])} → ${keyName(ch)}`);
    run.kb.show({ codes: [code] });
  }
}

// Ders bitti: puan, doğruluk, hız, yıldızlar; sonuç kaydedilir. Yeni yıldız kahramanı güçlendirir (güç arttıysa kutlama).
async function endTyping(run) {
  run.detach();
  state.session = null;
  const seconds = Math.max(1, Math.round(run.ms / 1000));
  const stars = typingStars(run.chars, run.errors);
  const acc = Math.floor((100 * run.chars) / Math.max(1, run.chars + run.errors)); // aşağı: %94,9 "%95" görünüp iki yıldız almasın
  const wpm = Math.round(run.chars / 5 / (seconds / 60));
  const before = run.hero?.typing.best[run.lesson.id] || 0;
  const misses = Object.entries(run.misses).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => keyName(c));
  let saved = true;
  try {
    await q(sb.from('typing_results').insert({ student_id: sid(), lesson: run.lesson.id, chars: run.chars, errors: run.errors, seconds, stars,
      misses: Object.keys(run.misses).length ? run.misses : null }));
  } catch (e) { saved = false; }
  const gained = saved ? Math.max(0, stars - before) : 0;
  const hero = run.hero;
  const level = hero && gained ? hero.at(hero.typing.power + gained) : hero?.level;
  const up = hero && level > hero.level;
  if (hero && saved) {
    hero.typing.best[run.lesson.id] = Math.max(before, stars);
    hero.typing.today += stars > 0 ? 1 : 0;
    hero.typing.power += gained;
    hero.typing.stars += gained;
    hero.level = level;
  }
  const nextOpen = run.index + 1 < TYPING_LESSONS.length && (stars >= TYPING_PASS || typingOpen(hero?.typing.best || {}, run.index + 1));
  const maxErrors = Math.floor((run.chars * 5) / 95); // üç yıldızın (%95) izin verdiği yanlış
  if (stars) sayTr(stars === 3 ? 'Harika! Üç yıldız.' : stars === 2 ? 'Aferin! İki yıldız.' : 'Aferin! Bir yıldız.');
  render(
    h('section', { class: 'card stack', style: 'margin-top: 4vh; text-align: center; align-items: center' },
      h('h2', {}, stars ? 'Ders bitti! 🎉' : 'Biraz daha çalışalım 💪'),
      h('p', { class: 'ty-stars', 'aria-label': `${stars} yıldız` }, '⭐'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('p', { class: 'num' }, `${run.points} puan · doğruluk %${acc} · dakikada ${wpm} kelime`),
      gained ? h('p', {}, `+${gained} yeni yıldız: kahramanına +${gained} güç, +${gained * 5} 🪙`) : null,
      stars < TYPING_PASS && !nextOpen ? h('p', { class: 'small' }, `Sonraki derse geçmek için üç yıldız gerekiyor: bu derste en çok ${maxErrors} yanlış. `
        + 'Önce bu dersi iyice öğren; yavaş ve dikkatli yaz, hız sonra gelir.')
        : stars < 3 ? h('p', { class: 'small muted' }, 'Daha az yanlışla daha çok yıldız kazanırsın.') : null,
      misses.length ? h('p', { class: 'small' }, `En çok zorlandığın tuşlar: ${misses.join(', ')}`) : null,
      saved ? null : h('p', { class: 'error small' }, 'Sonuç kaydedilemedi; internetini kontrol et.'),
      h('div', { class: 'row', style: 'justify-content: center' },
        h('button', { onclick: () => runTyping(run.index, hero) }, 'Tekrar dene'),
        nextOpen ? h('button', { class: 'primary', onclick: () => runTyping(run.index + 1, hero) }, `Sonraki ders: ${TYPING_LESSONS[run.index + 1].title}`) : null,
        h('button', { class: nextOpen ? 'ghost' : 'primary', onclick: () => go('typing') }, 'Derslere dön'))),
    up ? h('section', { class: 'card stack party-inline', style: 'text-align: center; gap: 8px' },
      h('div', { class: 'party-confetti', 'aria-hidden': 'true' }, Array.from({ length: 16 }, (_, i) =>
        h('span', { style: `left: ${(i * 41) % 100}%; animation-delay: ${(i % 6) * 0.15}s` }, ['🎉', '✨', '⭐', '🎊'][i % 4]))),
      h('h2', {}, `💪 Güç ${level}! Kahramanın güçlendi.`),
      heroScene(state.student, level, hero.owned)) : null);
}

/* Klavye: veli ve öğretmen */

// Rapordaki klavye dersleri özeti: bitirdiği dersler, yıldızlar, son ders, bugün, zorlandığı tuşlar. Hiç ders yoksa görünmez.
function typingBox() {
  const box = h('section', { class: 'card stack', style: 'gap: 8px', hidden: true });
  (async () => {
    const rows = await q(sb.from('typing_results').select('lesson, chars, errors, seconds, stars, misses, created_at').eq('student_id', sid())
      .order('created_at', { ascending: false }).limit(500));
    if (!rows.length) return;
    const stats = typingStats(rows, typingPerDay(state.student));
    const last = rows[0], lesson = TYPING_LESSONS.find((l) => l.id === last.lesson);
    const week = rows.filter((r) => r.created_at >= addDays(localDate(), -6) + 'T00:00:00');
    const miss = {};
    for (const r of week) for (const [c, n] of Object.entries(r.misses || {})) miss[c] = (miss[c] || 0) + n;
    const hard = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => keyName(c));
    const rate = (r) => `%${Math.floor((100 * r.chars) / Math.max(1, r.chars + r.errors))} doğru, dakikada ${Math.round(r.chars / 5 / (Math.max(1, r.seconds) / 60))} kelime`;
    fill(box,
      h('h2', {}, 'Klavye dersleri'),
      h('p', { class: 'small muted' }, 'On parmak klavye (çocuğun Klavye sekmesi, bilgisayarda).'),
      h('p', {}, `${TYPING_LESSONS.filter((l) => stats.best[l.id] > 0).length}/${TYPING_LESSONS.length} ders bitti · ${stats.stars} ⭐ · bugün ${stats.today}${typingPerDay(state.student) ? '/' + typingPerDay(state.student) : ''} ders`),
      h('p', {}, `Son ders: ${lesson ? lesson.title : last.lesson}, ${'⭐'.repeat(last.stars) || 'yıldızsız'} (${rate(last)})`),
      week.length ? h('p', { class: 'small' }, `Son 7 günde ${week.length} ders` + (hard.length ? `; en çok zorlandığı tuşlar: ${hard.join(', ')}` : '')) : null);
    box.hidden = false;
  })().catch(() => {});
  return box;
}
