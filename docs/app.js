/* LGS Defter: öğrenci ve veli uygulaması.
   Veriler Supabase'de; fotoğrafları saatlik görev (Claude) işler.
   Tekrar takvimi bu dosyada hesaplanır (gradeItem). */
'use strict';

// Şifre sıfırlama bağlantısıyla mı gelindi? (İstemci adresteki bilgiyi okuyup sildiği için önce bakılır.)
const cameForRecovery = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);

const sb = window.supabase.createClient(window.CONFIG.url, window.CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ---------------------------------------------------------------- sabitler

// sec: soru başına en fazla süre. LGS'de sözel oturum 50 soru / 75 dk, sayısal oturum 40 soru / 80 dk.
// Oturum süresi derslere bölündü: Türkçe 40 + İnkılap 12,5 + Din 10 + İngilizce 12,5 = 75 dk;
// Matematik 50 + Fen 30 = 80 dk.
const SUBJECTS = {
  turkce: { name: 'Türkçe', coef: 4, sec: 120 },
  matematik: { name: 'Matematik', coef: 4, sec: 150 },
  fen: { name: 'Fen Bilimleri', coef: 4, sec: 90 },
  inkilap: { name: 'İnkılap Tarihi', coef: 1, sec: 75 },
  din: { name: 'Din Kültürü', coef: 1, sec: 60 },
  ingilizce: { name: 'İngilizce', coef: 1, sec: 75 },
  // İlkokul dersleri (LGS'de yok).
  hayat: { name: 'Hayat Bilgisi', coef: 1, sec: 90 },
  sosyal: { name: 'Sosyal Bilgiler', coef: 1, sec: 90 },
};
const maxSeconds = (subject) => SUBJECTS[subject]?.sec || 90;
// LGS kitapçık sırası: sözel oturum Türkçe, İnkılap, Din, İngilizce; sayısal oturum Matematik, Fen.
// İlkokul dersleri sonda (öğretmen ders seçimi gibi genel listeler için).
const SUBJECT_ORDER = ['turkce', 'inkilap', 'din', 'ingilizce', 'matematik', 'fen', 'hayat', 'sosyal'];
const LGS_SUBJECTS = SUBJECT_ORDER.slice(0, 6);

// Sınıfa göre dersler. 8. sınıf LGS'ye hazırlanır; küçük sınıflar sadece pratik yapar.
// extra_grades: veli bir üst sınıfın konularını da açabilir (3. sınıftaki çocuğa 4. sınıf konuları).
const GRADE_SUBJECTS = {
  1: ['turkce', 'matematik', 'hayat', 'ingilizce'],
  2: ['turkce', 'matematik', 'hayat', 'ingilizce'],
  3: ['turkce', 'matematik', 'hayat', 'fen', 'ingilizce'],
  4: ['turkce', 'matematik', 'fen', 'sosyal', 'ingilizce', 'din'],
};
const PRIMARY_ORDER = ['turkce', 'matematik', 'hayat', 'fen', 'sosyal', 'ingilizce', 'din'];
const isLgsStudent = (p) => !p?.grade || p.grade >= 8;
const studentGrades = (p) => [...new Set([p?.grade || 8, ...(p?.extra_grades || [])])];
function studentSubjects(p) {
  if (isLgsStudent(p)) return LGS_SUBJECTS;
  const set = new Set(studentGrades(p).flatMap((g) => GRADE_SUBJECTS[g] || ['turkce', 'matematik', 'fen', 'sosyal', 'ingilizce', 'din']));
  return PRIMARY_ORDER.filter((s) => set.has(s));
}

// Günlük plan: derse göre günde en fazla kaç soru. Veli ayarlamadıysa 8. sınıfta günlük hedef LGS'deki
// soru ağırlığıyla bölünür (40 → Türkçe 9, İnkılap 4, Din 4, İngilizce 4, Matematik 10, Fen 9); küçük
// sınıflarda Türkçe ve Matematik ağır basar. Velinin planında olmayan bir ders (sonradan açılan üst
// sınıf dersi gibi) varsayılan payını alır.
const DEFAULT_PLAN = { turkce: 9, inkilap: 4, din: 4, ingilizce: 4, matematik: 10, fen: 9 };
const PRIMARY_WEIGHT = { turkce: 3, matematik: 3, fen: 2, hayat: 2, sosyal: 2, ingilizce: 1, din: 1 };
function dailyPlan(p) {
  const subjects = studentSubjects(p);
  const total = p?.daily_questions || 40;
  const weights = isLgsStudent(p) ? DEFAULT_PLAN : PRIMARY_WEIGHT;
  const sum = isLgsStudent(p) ? 40 : subjects.reduce((a, s) => a + (weights[s] || 1), 0);
  let plan;
  if (isLgsStudent(p)) {
    plan = Object.fromEntries(subjects.map((s) => [s, Math.round(total * weights[s] / sum)]));
  } else {
    // En büyük kalan yöntemi: paylar toplamı tam hedef olsun, her derse en az 1 soru.
    const raw = subjects.map((s) => [s, total * (weights[s] || 1) / sum]);
    plan = Object.fromEntries(raw.map(([s, x]) => [s, Math.max(1, Math.floor(x))]));
    let left = total - planTotal(plan);
    for (const [s] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) { if (left <= 0) break; plan[s]++; left--; }
  }
  for (const s of subjects) if (p?.daily_by_subject?.[s] !== undefined) plan[s] = Math.max(0, +p.daily_by_subject[s] || 0);
  return plan;
}
const planTotal = (plan) => Object.values(plan).reduce((n, v) => n + (v || 0), 0);

// Hata takibi: 1 → 2 → 4 → 14 → 30 gün. Konu tekrarı: Fibonacci, 55'te sabitlenir.
const MISTAKE_LADDER = [1, 2, 4, 14, 30];
const TOPIC_LADDER = [1, 3, 5, 8, 13, 21, 34, 55];
const TOPIC_QUESTIONS_PER_REVIEW = 5;

const REASONS = [
  ['bilmiyordum', 'Konuyu bilmiyordum'],
  ['iki_sik', 'İki şık arasında kaldım'],
  ['yanlis_okudum', 'Soruyu yanlış okudum'],
  ['islem_hatasi', 'İşlem hatası yaptım'],
  ['sure_yetmedi', 'Süre yetmedi'],
  ['tahmin', 'Tahmin ettim'],
  ['hic_bakmadim', 'Hiç bakmadım'],
];
const REASON_GROUP = {
  bilmiyordum: 'konu', iki_sik: 'konu', tahmin: 'konu',
  yanlis_okudum: 'dikkat', islem_hatasi: 'dikkat',
  sure_yetmedi: 'sure', hic_bakmadim: 'sure',
};
const CAUSE_GROUP = { konu: 'konu', tahmin: 'konu', dikkat: 'dikkat', islem: 'dikkat', okuma: 'dikkat', kodlama: 'dikkat', sure: 'sure' };
const CAUSE_LABEL = {
  konu: 'Konu eksiği', tahmin: 'Bilmeden tahmin', dikkat: 'Dikkat', islem: 'İşlem hatası',
  okuma: 'Soruyu yanlış okuma', kodlama: 'Optiğe yanlış kodlama', sure: 'Süre',
};
const GROUP_LABEL = { konu: 'Konu eksiği', dikkat: 'Dikkat', sure: 'Süre' };
const GROUP_COLOR = { konu: 'var(--red)', dikkat: 'var(--amber)', sure: 'var(--accent)' };
const STYLE_LABEL = {
  grafik: 'Grafik', tablo: 'Tablo', oncullu: 'Öncüllü (I-II-III)', degildir: 'Olumsuz soru kökü',
  paragraf: 'Paragraf', islem: 'İşlem', deney: 'Deney', gorsel: 'Şekil / görsel', kavram: 'Kavram',
};
const CONFIDENCE_LEVELS = [[25, 'Tahmin ettim'], [50, 'Kararsızım'], [75, 'Büyük ölçüde eminim'], [100, 'Tamamen eminim']];
const FEEDBACK_KINDS = [
  ['cevap_yanlis', 'Cevap anahtarı yanlış'],
  ['soru_hatali', 'Soruda hata var'],
  ['anlasilmiyor', 'Soru anlaşılmıyor'],
  ['konu_disi', 'Bu konuyla ilgili değil'],
  ['cok_kolay', 'Çok kolay'],
  ['cok_zor', 'Çok zor'],
  ['diger', 'Başka bir şey'],
];
// Bu bildirimlerde soru sayılmaz ve havuzdan çekilir.
const DISPUTE_KINDS = new Set(['cevap_yanlis', 'soru_hatali', 'anlasilmiyor', 'konu_disi']);
const EXAM_KINDS =[['tam', 'Tam deneme'], ['brans', 'Branş denemesi'], ['okul', 'Okul sınavı']];
const TIME_NOTES = ['Süre yetti', 'Sözelde sıkıştım', 'Sayısalda sıkıştım', 'İkisinde de sıkıştım'];

// ---------------------------------------------------------------- yardımcılar

const app = document.getElementById('app');
// inRecovery: yeni şifre kaydedilene kadar uygulamanın başka hiçbir ekranı açılmaz.
const state = { user: null, profile: null, tab: 'home', session: null, inRecovery: cameForRecovery };

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function localDate(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function parseDay(day) {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
function daysBetween(a, b) {
  const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}
function fmtDate(day) {
  if (!day) return '';
  return parseDay(day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
/* Giriş hatalarını ayırt eder: internet kopunca ekranda "şifre yanlış" yazmasın.
   Bağlantı hatası supabase-js'te AuthRetryableFetchError olarak gelir (status 0; sunucu hatasında 5xx). */
function isNetworkError(error) {
  return !navigator.onLine || error?.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(error?.message || '');
}
function authErrorText(error, wrongText = 'Bilgiler hatalı.') {
  if (isNetworkError(error)) {
    return !navigator.onLine || !error?.status
      ? 'İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.'
      : 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.';
  }
  if (error?.status === 429) return 'Çok fazla deneme oldu. Birkaç dakika bekleyip tekrar dene.';
  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')) return wrongText;
  return 'Giriş yapılamadı, biraz sonra tekrar dene.';
}

// Türkçe eklerde son ünlü: ince (e, i, ö, ü) mi, kalın mı; yuvarlak mı.
const lastVowel = (s) => [...s.toLocaleLowerCase('tr')].filter((ch) => 'aeıioöuü'.includes(ch)).pop() || 'e';
// Sevgi hitabı: Mert → Mertçiğim, Can → Cancığım, Ayla → Aylacığım, Umut → Umutçuğum.
function endearing(name) {
  const last = name.toLocaleLowerCase('tr').slice(-1);
  const c = 'çfhkpsşt'.includes(last) ? 'ç' : 'c';
  return name + c + { a: 'ığım', ı: 'ığım', e: 'iğim', i: 'iğim', o: 'uğum', u: 'uğum', ö: 'üğüm', ü: 'üğüm' }[lastVowel(name)];
}
// Yönelme eki: Mert'e, Can'a, Ayla'ya.
function toName(name) {
  const endsVowel = 'aeıioöuü'.includes(name.toLocaleLowerCase('tr').slice(-1));
  return `${name}'${endsVowel ? 'y' : ''}${'eiöü'.includes(lastVowel(name)) ? 'e' : 'a'}`;
}
// Ana sayfada bazen (aşağı yukarı üç girişte bir) saate göre selam yerine şakacı bir selam.
function playfulGreeting(name) {
  const n = (name || '').split(' ')[0];
  if (!n || Math.random() > 0.35) return null;
  const list = [`${endearing(n)}, napıyon?`, `Selam ${n}! Bugün de döktürüyoruz.`, 'Hoş geldin şampiyon!',
    `${endearing(n)}, hazır mısın?`, `Merhaba ${n}, beyin ısındı mı?`];
  return list[Math.floor(Math.random() * list.length)];
}

function youtubeSearch(topic) {
  const grade = state.student?.grade || 8;
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${grade >= 8 ? 'LGS ' : ''}${grade}. sınıf ${topic || ''} konu anlatımı`);
}
function subjTag(subject, text) {
  return h('span', { class: 'tag', style: `--subj: var(--c-${subject})` }, text || SUBJECTS[subject]?.name || subject);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}
// replaceChildren boş değerleri "null" yazısı olarak basar; bu yardımcı onları atlar.
function fill(el, ...nodes) {
  el.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
}

function render(...nodes) {
  // Soru çözerken dikkat dağılmasın diye üst çubuk ve menü gizlenir.
  // "← Geri" ilk sayfa dışında her sayfada; tarayıcının geri tuşuyla aynı işi yapar.
  const canBack = navDepth() > 0 || state.tab !== rootTab();
  const bar = state.profile && !state.session && !state.exam
    ? h('div', { class: 'topbar' },
        canBack ? h('button', { class: 'ghost small back', onclick: goBack }, '← Geri') : null,
        studentSwitcher(),
        h('button', { class: 'ghost small', onclick: signOut }, 'Çıkış yap'))
    : null;
  fill(app, bar, ...nodes);
  renderTabs();
}
// Seçili öğrenci: öğrencinin kendisi ya da velinin baktığı çocuk.
const sid = () => state.student?.id;
// Seçili öğrencide görülebilen dersler (öğretmen için kısıtlı olabilir; veritabanı da aynı kısıtı uygular).
const visibleSubjects = () => {
  const allowed = state.profile?.role === 'teacher' ? state.subjectsFor?.[sid()] : null;
  const mine = studentSubjects(state.student);
  return allowed ? mine.filter((s) => allowed.includes(s)) : mine;
};

function studentSwitcher() {
  const me = state.profile;
  if (me.role === 'student' || (state.students || []).length < 2) {
    return h('span', { class: 'small muted' }, me.role !== 'student' && state.student
      ? `${me.display_name || ''} · ${state.student.display_name}` : me.display_name || '');
  }
  return h('select', { id: 'student-switch', class: 'switch', 'aria-label': 'Hangi çocuk', onchange: (e) => {
    if (!confirmLeave()) { e.target.value = sid(); return; }
    state.student = state.students.find((s) => s.id === e.target.value);
    try { localStorage.setItem('defter.student', state.student.id); } catch (err) { /* önemli değil */ }
    go(state.tab);
  } }, state.students.map((s) => h('option', { value: s.id, selected: s.id === sid() }, `${s.display_name} · ${s.grade}. sınıf`)));
}

function loading(msg = 'Yükleniyor…') {
  render(h('p', { class: 'boot' }, msg));
}
function failBox(err) {
  console.error(err);
  return h('div', { class: 'card' },
    h('p', { class: 'error' }, 'Bir şey ters gitti.'),
    h('p', { class: 'small muted' }, (err && err.message) || String(err)),
    h('button', { onclick: () => go(state.tab) }, 'Tekrar dene'));
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

const urlCache = new Map();
async function signedUrl(bucket, path) {
  const key = bucket + '/' + path;
  if (urlCache.has(key)) return urlCache.get(key);
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(key, data.signedUrl);
  return data.signedUrl;
}
function lazyImg(bucket, path, alt) {
  const img = h('img', { class: 'qimg', alt: alt || 'Soru görseli' });
  signedUrl(bucket, path).then((u) => { if (u) img.src = u; });
  return img;
}

// ---------------------------------------------------------------- menü

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  upload: 'M12 16V4m0 0-5 5m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  exam: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-12v4l2.5 2.5M10 2h4M19 6l1.5-1.5',
  topics: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  words: 'M8 3h10a2 2 0 0 1 2 2v10M4 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM7.5 11.5h5M7.5 15h3',
  report: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  questions: 'M9 6h11M9 12h11M9 18h11M4.5 6l1 1 2-2M4.5 12l1 1 2-2M4.5 18l1 1 2-2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}
function renderTabs() {
  document.querySelector('nav.tabs')?.remove();
  if (!state.profile || state.session || state.exam) return;
  const role = state.profile.role;
  const tabs = role === 'parent'
    ? (state.student
      ? [['report', 'Rapor', 'report'], ['questions', 'Sorular', 'questions'], ['topics', 'Konular', 'topics'], ['upload', 'Deneme', 'upload'], ['settings', 'Ayarlar', 'settings']]
      : [['settings', 'Ayarlar', 'settings']])
    : role === 'teacher'
      ? [['report', 'Rapor', 'report'], ['questions', 'Sorular', 'questions'], ['topics', 'Konular', 'topics'], ['settings', 'Ayarlar', 'settings']]
      : [['home', 'Bugün', 'home'], wordsPerDay(state.student) > 0 ? ['words', 'Kelime', 'words'] : null, ['upload', 'Deneme', 'exam'],
          ['send', 'Yükle', 'upload'], ['topics', 'Konularım', 'topics'], ['settings', 'Ayarlar', 'settings']].filter(Boolean);
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Menü' },
    h('div', { class: 'inner' }, tabs.map(([id, label, ic]) =>
      h('button', { 'aria-current': state.tab === id ? 'page' : null, onclick: () => go(id) }, icon(ic), label))));
  document.body.append(nav);
}

/* Gönderilmemiş fotoğraf varken sayfadan çıkmadan önce sorar (yanlışlıkla başka düğmeye basınca
   çekilen fotoğraflar kaybolmasın). leaveGuard o anki sayfanın "kaybolacak bir şey var mı?" kontrolüdür. */
let leaveGuard = null;
function confirmLeave() {
  if (leaveGuard?.() && !confirm('Çektiğin fotoğraflar henüz gönderilmedi. Çıkarsan kaybolacak. Çıkmak istediğinden emin misin?')) return false;
  leaveGuard = null;
  return true;
}
window.addEventListener('beforeunload', (e) => {
  if (leaveGuard?.()) { e.preventDefault(); e.returnValue = ''; }
});

/* Kendini güncelleme: yeni sürüm yayınlanınca Ctrl+F5 gerekmesin. Uygulama version.json'u ara ara okur;
   daha yeni bir sürüm varsa, kaybolacak bir şey yokken (soru çözerken, fotoğraf gönderilmemişken,
   şifre yenilerken değil) sayfayı yeni sürüm adresiyle yeniden açar. Adresteki ?v= önbelleği atlatır.
   Sürüm, index.html'deki app.js?v= numarasıdır; ikisini tools/bump-version.mjs birlikte artırır. */
const APP_VERSION = +new URL(document.currentScript?.src || location.href).searchParams.get('v') || 0;
async function checkForUpdate() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { v } = await res.json();
    if (+v > APP_VERSION) state.updateReady = +v;
  } catch (e) { /* çevrimdışı ya da dosya yok: sonra tekrar bakılır */ }
}
function applyUpdate(nextTab) {
  const v = state.updateReady;
  if (!v || state.session || state.exam || state.inRecovery || leaveGuard?.()) return false;
  // Aynı sürüm için bir kez dener: önbellek yine eskiyi verirse döngüye girmesin.
  try {
    if (sessionStorage.getItem('defter.updateTried') === String(v)) return false;
    sessionStorage.setItem('defter.updateTried', String(v));
    if (nextTab) sessionStorage.setItem('defter.resumeTab', nextTab);
    sessionStorage.setItem('defter.resumeDepth', String(navDepth()));
  } catch (e) { return false; }
  location.replace(`${location.pathname}?v=${v}`);
  return true;
}
// Uygulamaya geri dönünce, salt okunur bir sayfadaysa hemen yenilenir; diğer sayfalarda bir sonraki geçişte.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  await checkForUpdate();
  if (['home', 'report', 'questions', 'together', 'topics', 'send'].includes(state.tab)) applyUpdate(state.tab);
});
setInterval(checkForUpdate, 5 * 60 * 1000);

/* Geri: üst çubuktaki "← Geri" ile tarayıcının geri tuşu aynı işi yapar, bir önceki sayfaya döner (eskiden tarayıcı
   tuşu doğrudan önceki siteye gidiyordu). Her sayfa geçişi geçmişe bir kayıt ekler: { tab, depth: uygulama içinde
   kaçıncı sayfa, overlay?: 'session' | 'exam' }. Soru çözme ve deneme, açıldıkları sayfanın üstünde ayrı bir kayıttır;
   orada geri tuşu önce sorar. Aynı sayfayı yeniden çizmek (çocuk değiştirmek, "Tekrar dene") kayıt eklemez. */
let pendingTab = null; // oturumdan ya da denemeden düğmeyle çıkarken: oturum kaydı geri alınınca açılacak sayfa
const navDepth = () => history.state?.depth ?? 0;
const rootTab = () => (state.profile?.role === 'student' ? 'home' : state.student ? 'report' : 'settings');
// Rolün açabildiği sayfalar: aynı sekmede başka biri giriş yapınca geçmişteki eski sayfalar buna göre süzülür.
const allowedTabs = () => (state.profile?.role === 'student'
  ? ['home', 'words', 'upload', 'send', 'paper', 'ask', 'topics', 'settings', 'reasons', 'together']
  : ['report', 'questions', 'topics', 'upload', 'book', 'settings', 'together']);
function goBack() {
  if (navDepth() > 0) history.back();
  else go(rootTab(), 'replace');
}
function pushOverlay(kind) {
  history.pushState({ tab: state.tab, depth: navDepth() + 1, overlay: kind }, '');
}
window.addEventListener('popstate', (e) => {
  if (!state.profile || state.inRecovery) return;
  const s = e.state || {};
  if (pendingTab) {
    const tab = pendingTab;
    pendingTab = null;
    history.replaceState({ tab, depth: s.depth ?? 0 }, '');
    go(tab, 'history');
    return;
  }
  if (state.session || state.exam) {
    const exam = !!state.exam;
    if (!confirm(exam ? 'Denemeden çıkılsın mı? Cevapların kayıtlı; süre işlemeye devam eder, Deneme sayfasından kaldığın yere dönebilirsin.'
      : 'Çalışmaya ara verilsin mi? Cevapladığın sorular kaydedildi.')) { pushOverlay(exam ? 'exam' : 'session'); return; }
    state.leaveOverlay?.();
  }
  // Bitmiş bir oturumun kaydına ileri tuşuyla gelinirse düz sayfa kaydına çevrilir.
  const tab = allowedTabs().includes(s.tab) ? s.tab : rootTab();
  if (s.overlay) history.replaceState({ tab, depth: s.depth ?? 0 }, '');
  // Gönderilmemiş fotoğraf varken vazgeçerse sayfanın kaydı geri konur.
  if (!go(tab, 'history')) history.pushState({ tab: state.tab, depth: (s.depth ?? 0) + 1 }, '');
});

// how: 'push' yeni sayfa; 'replace' bu kaydın yerine (ilk açılış, kendiliğinden yönlendirme); 'history' geri/ileri
// tuşundan geldi, geçmişe dokunulmaz. Sayfa değiştiyse true döner.
function go(tab, how = 'push') {
  if (!confirmLeave()) return false;
  // Oturum ya da deneme kaydının üstündeyken: önce o kayıt geri alınır, sayfa popstate'te açılır (geri tuşunda
  // aynı sayfa iki kez durmasın).
  if (how === 'push' && history.state?.overlay) { pendingTab = tab; history.back(); return true; }
  if (how !== 'history') {
    const entry = { tab, depth: navDepth() };
    if (how === 'push' && history.state?.tab !== tab) { entry.depth++; history.pushState(entry, ''); }
    else history.replaceState(entry, '');
  }
  if (applyUpdate(tab)) return true;
  state.tab = tab;
  state.session = null;
  state.leaveOverlay = null;
  // Denemeden çıkılınca sayaç durur; deneme telefonda kayıtlı, Deneme sayfasından devam edilir.
  clearInterval(state.examTimer);
  state.exam = null;
  window.scrollTo(0, 0);
  const views = {
    // Öğrencinin Deneme sekmesi uygulama içi denemeleri açar; Yükle sekmesi kâğıt deneme ("paper") ve tek tek
    // soru gönderme ("ask": yapamadığı ya da beğendiği sorular).
    home: viewHome, upload: () => (state.profile?.role === 'student' ? viewExamHub() : viewUpload('deneme')),
    send: viewSend, paper: () => viewUpload('deneme'), ask: () => viewUpload('soru'), book: () => viewUpload('kitap'),
    topics: viewTopics, settings: viewSettings, report: viewReport, reasons: viewReasons, questions: viewQuestions,
    together: viewTogether, words: viewWords,
  };
  Promise.resolve((views[tab] || viewHome)()).catch((e) => render(failBox(e)));
  return true;
}

// ---------------------------------------------------------------- giriş

async function start() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return viewLogin();
  state.user = data.session.user;
  if (state.inRecovery) return viewNewPassword();
  const profile = await q(sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle());
  if (!profile) {
    return render(h('div', { class: 'card' },
      h('h2', {}, 'Bu hesap henüz tanımlı değil'),
      h('p', { class: 'muted' }, 'Hesap açıldı ama aileye eklenmemiş. Bunu veli tarafında Claude ile tamamlayın.'),
      h('button', { onclick: signOut }, 'Çıkış yap')));
  }
  state.profile = profile;
  // Öğrenci kendi verisiyle çalışır; veli bağlı olduğu bütün çocukları görür ve aralarında geçiş yapar.
  // Öğretmen, sadece velilerin kendisine açtığı çocukları görür (salt okunur).
  await loadStudents();
  if (!state.student) {
    if (profile.role === 'parent') return go('settings', 'replace'); // ilk çocuğu Aile bölümünden ekler
    return render(h('div', { class: 'card' },
      h('h2', {}, 'Henüz bağlı öğrenci yok'),
      h('p', { class: 'muted' }, profile.role === 'teacher'
        ? 'Bir veli size çocuğunu açtığında burada görünecek.'
        : 'Hesabınız henüz bir öğrenciye bağlanmamış.'),
      h('button', { onclick: signOut }, 'Çıkış yap')));
  }
  // Kendini güncellemeden sonra kullanıcının gitmek istediği sayfaya, yenileyince de bulunduğu sayfaya devam edilir
  // (geçmiş kaydı korunur; geri tuşu yine önceki sayfaya döner).
  let resume = null, resumeDepth = null;
  try {
    resume = sessionStorage.getItem('defter.resumeTab'); resumeDepth = sessionStorage.getItem('defter.resumeDepth');
    sessionStorage.removeItem('defter.resumeTab'); sessionStorage.removeItem('defter.resumeDepth');
  } catch (e) { /* önemli değil */ }
  if (resume && resumeDepth !== null) history.replaceState({ tab: resume, depth: +resumeDepth || 0 }, '');
  const allowed = allowedTabs();
  const here = history.state?.tab;
  go(allowed.includes(resume) ? resume : allowed.includes(here) ? here : profile.role === 'student' ? 'home' : 'report', 'replace');
}

async function loadStudents() {
  const profile = state.profile;
  if (profile.role === 'student') {
    state.students = [profile];
  } else {
    const links = await q(sb.from('family_links').select('student_id, subjects')
      .eq('parent_id', profile.id).eq('relation', profile.role === 'teacher' ? 'teacher' : 'parent'));
    // Öğretmenin her çocuk için görebildiği dersler (null = hepsi).
    state.subjectsFor = Object.fromEntries(links.map((l) => [l.student_id, l.subjects]));
    state.students = links.length
      ? await q(sb.from('profiles').select('*').in('id', links.map((l) => l.student_id)).order('display_name'))
      : [];
  }
  let remembered = null;
  try { remembered = localStorage.getItem('defter.student'); } catch (e) { /* tarayıcı izin vermiyor */ }
  state.student = state.students.find((s) => s.id === (state.student?.id || remembered)) || state.students[0] || null;
}

function viewLogin() {
  // Çıkıştan sonra bu sekmede giriş yapan, önceki kişinin kaldığı sayfadan değil kendi ilk sayfasından başlar.
  history.replaceState(null, '');
  const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('p', { class: 'error', hidden: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) { msg.className = 'error'; msg.textContent = authErrorText(error, 'E-posta veya şifre yanlış.'); msg.hidden = false; return; }
    start().catch((err) => render(failBox(err)));
  } },
    h('label', { class: 'field' }, 'E-posta', email),
    h('label', { class: 'field' }, 'Şifre', pass),
    msg,
    h('button', { class: 'primary block', type: 'submit' }, 'Giriş yap'),
    h('button', { class: 'block', type: 'button', onclick: async (e) => {
      const forgot = e.currentTarget;
      const mail = email.value.trim();
      msg.hidden = false;
      if (!mail) { msg.className = 'error'; msg.textContent = 'Önce yukarıya e-posta adresini yaz.'; return; }
      forgot.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
      msg.className = error ? 'error' : 'small';
      msg.textContent = error && isNetworkError(error) ? authErrorText(error)
        : error ? 'Şu an gönderilemedi (saatte en fazla 2 sıfırlama e-postası gidebiliyor). Biraz sonra tekrar dene ya da velinden yardım iste.'
        : 'Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. E-postadaki bağlantıya dokun.';
      forgot.disabled = false;
    } }, 'Şifremi unuttum'));
  render(
    h('div', { class: 'stack', style: 'padding-top: 12vh' },
      h('p', { class: 'label' }, 'LGS 2027'),
      h('h1', {}, 'Defter'),
      h('p', { class: 'muted' }, 'Yanlışların nereden geldiğini bul, öğrendiğini unutma.')),
    form);
}

function newPasswordForm(onDone) {
  const p1 = h('input', { id: 'new-password', type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const p2 = h('input', { id: 'new-password-2', type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const msg = h('p', { class: 'error', hidden: true });
  return h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    msg.hidden = true;
    if (p1.value.length < 6) { msg.textContent = 'Şifre en az 6 karakter olmalı.'; msg.hidden = false; return; }
    if (p1.value !== p2.value) { msg.textContent = 'İki şifre aynı değil.'; msg.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: p1.value });
    if (error) { msg.textContent = isNetworkError(error) ? authErrorText(error) : 'Şifre değiştirilemedi: ' + error.message; msg.hidden = false; return; }
    p1.value = ''; p2.value = '';
    toast('Şifren değişti.');
    onDone();
  } },
    h('label', { class: 'field' }, 'Yeni şifre', p1),
    h('label', { class: 'field' }, 'Yeni şifre (tekrar)', p2),
    msg,
    h('button', { class: 'primary block', type: 'submit' }, 'Şifreyi kaydet'));
}

function viewNewPassword() {
  history.replaceState(null, '', location.pathname);
  render(
    h('div', { class: 'stack', style: 'padding-top: 10vh' },
      h('p', { class: 'label' }, 'Şifre sıfırlama'),
      h('h1', {}, 'Yeni şifreni belirle'),
      h('p', { class: 'muted' }, state.user?.email || '')),
    newPasswordForm(() => {
      state.inRecovery = false;
      start().catch((err) => render(failBox(err)));
    }));
}

async function signOut() {
  if (!confirmLeave()) return;
  // Sunucu oturumu bulamazsa kütüphane yerel kaydı silmiyor; ortak telefonda hesap açık kalmasın diye
  // önce normal çıkış, sonra yerel çıkış, en son kayıt anahtarı elle silinir.
  try { await sb.auth.signOut(); } catch (e) { /* aşağıda yerelden temizlenir */ }
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* aşağıda elle temizlenir */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* tarayıcı depolamaya izin vermiyor */ }
  state.user = null; state.profile = null; state.student = null; state.students = [];
  viewLogin();
}

// ---------------------------------------------------------------- tekrar takvimi

/* Bir maddenin (yanlış soru ya da konu) bir sonraki tekrar gününü hesaplar.
   results: o madde için bu oturumda çözülen soruların sonuçları {correct, strong, confidence}.
   confidence: öğrencinin emin olma ölçeği (25, 50, 75, 100).
   support: bir sonraki tekrarda eklenecek, farklı tarzda destek sorusu sayısı. */
function gradeItem(item, results, lgsDate, rareFactor = 1) {
  const today = localDate();
  const ladder = item.track === 'mistake' ? MISTAKE_LADDER : TOPIC_LADDER;
  const allCorrect = results.every((r) => r.correct);
  const allStrong = results.every((r) => r.strong);
  const minConfidence = Math.min(...results.map((r) => r.confidence ?? (r.strong ? 100 : 75)));
  const confidentlyWrong = results.some((r) => !r.correct && (r.confidence ?? 0) >= 75);
  let { step, ease, consecutive_wrong } = item;
  let note, support;
  let st = 'active';

  if (allCorrect && allStrong) {
    // Katsayı ancak uzun bir aralıktan sonra hatırladığında ve küçük adımlarla artar.
    if (step >= 3) ease = Math.min(1.3, ease * 1.03);
    step += 1;
    consecutive_wrong = 0;
    support = 0;
    note = 'Rahat ve emin bildi, aralık uzadı.';
  } else if (allCorrect && minConfidence >= 75) {
    consecutive_wrong = 0;
    support = 1;
    note = 'Doğru ama tam emin değil, yavaş ya da ipucuyla; aralık aynı, sonraki tekrarda 1 destek sorusu.';
  } else if (allCorrect) {
    // Doğru ama tahmine yakın: bilgi oturmamış sayılır.
    consecutive_wrong = 0;
    step = Math.max(0, step - 1);
    support = 2;
    note = 'Doğru ama tahmine yakın; aralık kısaldı, sonraki tekrarda 2 destek sorusu.';
  } else {
    consecutive_wrong += 1;
    if (step >= 2) ease = Math.max(0.6, ease * 0.85);
    step = item.track === 'mistake' ? 0 : Math.max(0, step - 2);
    support = 2;
    note = confidentlyWrong
      ? 'Emin olduğu hâlde yanlış: kavram yanılgısı olabilir. Aralık kısaldı, farklı sorularla desteklenecek.'
      : 'Yanlış yaptı, aralık kısaldı, farklı sorularla desteklenecek.';
  }

  if (item.track === 'mistake' && step >= ladder.length) {
    st = 'done';
    note = 'Hata takibi bitti, konu tekrarına geçti.';
  }
  let interval = step === 0 ? 1 : Math.max(1, Math.round(ladder[Math.min(step, ladder.length - 1)] * ease));
  // LGS'de her yıl 2 ve daha fazla soru gelen konu (topics.lgs_avg) 21 günden uzun aralığa düşmez.
  const lgsAvg = item.topics?.lgs_avg;
  if (item.track === 'topic' && (lgsAvg ?? 0) >= 2 && interval > 21) {
    interval = 21;
    note += ' LGS\'de sık çıkan konu, en geç 3 haftada bir tekrar.';
  }
  // Seyrek çıkan konuda (yılda yarım sorudan az) aralık velinin seçtiği kat kadar açılır.
  if (item.track === 'topic' && lgsAvg != null && +lgsAvg < 0.5 && rareFactor > 1 && step > 0) {
    interval = Math.round(interval * rareFactor);
    note += ` LGS'de seyrek konu, aralık ${String(rareFactor).replace('.', ',')} kat.`;
  }
  let due = addDays(today, interval);
  // Sınavdan önceki son haftalarda her konu bir kez daha görülsün.
  const finalReview = addDays(lgsDate, -10);
  if (due > addDays(lgsDate, -7) && today < finalReview) {
    due = finalReview;
    interval = daysBetween(today, due);
    note += ' Sınav öncesi son tekrara çekildi.';
  }
  return {
    step, ease: Math.round(ease * 1000) / 1000, consecutive_wrong, interval_days: interval,
    due_date: due, state: st, last_reviewed_at: new Date().toISOString(), note, support,
  };
}

/* Bugünün oturumunu kurar: günü gelmiş maddeler, katsayı ve gecikmeye göre sıralanır,
   her birine daha önce hiç görülmemiş bir soru seçilir. remaining derse göre bugün kalan soru
   hakkıdır ve azaltılır; hakkı biten dersin maddeleri ertesi güne kalır (deferred). */
async function buildSession(track, remaining) {
  const today = localDate();
  const items = await q(sb.from('items').select('*, topics(subject, name, sort, lgs_avg)')
    .eq('student_id', sid()).eq('track', track).eq('state', 'active').lte('due_date', today));
  if (!items.length) return { entries: [], shortage: 0, seconds: 0, dueCount: 0, deferred: 0 };

  const topicIds = [...new Set(items.map((i) => i.topic_id))];
  const [pool, seenRows, missRows, reserved] = await Promise.all([
    q(sb.from('questions').select('id, topic_id, subject, styles, target_seconds, stem, image_path, choices, answer, hint, solution, variant_of, variant_of_exam')
      .in('topic_id', topicIds).eq('active', true).eq('exam_only', false)), // gerçek LGS soruları denemeye saklı
    q(sb.from('reviews').select('question_id').eq('student_id', sid())),
    q(sb.from('exam_questions').select('topic_id, styles').eq('student_id', sid()).neq('outcome', 'dogru').in('topic_id', topicIds)),
    reservedVariants(),
  ]);
  const seen = new Set(seenRows.map((r) => r.question_id));
  const missedStyles = {};
  for (const r of missRows) {
    const set = (missedStyles[r.topic_id] ||= new Set());
    (r.styles || []).forEach((s) => set.add(s));
  }

  for (const it of items) {
    const coef = SUBJECTS[it.topics?.subject]?.coef || 1;
    // LGS'de sık çıkan konu öne geçer (yılda 3+ soru 1,5 kat, hiç çıkmayan yarı ağırlık); ağırlığı olmayan konu 1.
    const w = it.topics?.lgs_avg;
    const weight = w == null ? 1 : 0.5 + Math.min(+w, 3) / 3;
    it._priority = coef * (1 + Math.max(0, daysBetween(it.due_date, today))) * weight + Math.random() * 0.5;
  }
  items.sort((a, b) => b._priority - a._priority);

  const used = new Set();
  const entries = [];
  let seconds = 0, shortage = 0, deferred = 0;
  const basePerItem = track === 'mistake' ? 1 : TOPIC_QUESTIONS_PER_REVIEW;
  const started = new Set(); // bu oturumda en az bir maddesi alınan dersler
  for (const it of items) {
    // Emin olmadığı maddelere destek soruları eklenir; her yeni soru mümkünse farklı bir tarzda olur.
    const want = basePerItem + (it.support || 0);
    // Tekrar yarım kalmasın: maddenin soruları dersin kalan hakkına sığmıyorsa madde ertesi güne kalır.
    // Ama dersin hakkı bir konu tekrarından küçükse (ilkokulda Hayat Bilgisi'ne günde 4 soru gibi) o dersin
    // günün ilk tekrarı yine tam yapılır; yoksa o dersten hiç tekrar gelmezdi.
    const subject = it.topics?.subject;
    const room = remaining[subject] || 0;
    if (room < want && !(room > 0 && !started.has(subject))) { deferred += want; continue; }
    const styles = missedStyles[it.topic_id] || new Set();
    const fresh = shuffle(pool.filter((p) => p.topic_id === it.topic_id && !seen.has(p.id) && !used.has(p.id)));
    // Hata maddesi önce yanlış yaptığı sorunun benzerlerini alır; başka hata maddelerine ayrılmış benzerlere
    // (konu tekrarında da) dokunulmaz. Benzer yoksa konudan, kaçırdığı tarzlara yakın bir soru gelir.
    const own = { q: new Set([it.question_id].filter(Boolean)), e: new Set([it.exam_question_id].filter(Boolean)) };
    const variants = fresh.filter((p) => isVariantOf(p, own));
    const candidates = fresh.filter((p) => !isVariantOf(p, reserved))
      .sort((a, b) => overlap(b.styles, styles) - overlap(a.styles, styles));
    if (!variants.length && !candidates.length) { shortage++; continue; }
    let picked = pickVaried(variants, want);
    if (picked.length < want) picked = [...picked, ...pickVaried(candidates, want - picked.length)];
    remaining[subject] -= picked.length;
    started.add(subject);
    picked.forEach((p, i) => { used.add(p.id); entries.push({ item: it, question: p, last: i === picked.length - 1 }); });
    seconds += picked.reduce((s, p) => s + maxSeconds(p.subject) + 15, 0);
  }
  return { entries, shortage, seconds, dueCount: items.length, deferred };
}
/* Ek çalışma: günü gelen tekrarlar bir dersin günlük sayısını doldurmuyorsa açığı kapatır.
   Takipteki konulardan en zayıf olanlardan başlar, her konudan sırayla görülmemiş bir soru alır.
   Takvimi bozmaz: sadece yanlış yapılan konunun tekrarı yarına çekilir. */
async function buildExtra(remaining, exclude) {
  if (!Object.keys(remaining).some((s) => remaining[s] > 0)) return { entries: [], seconds: 0 };
  const today = localDate();
  const items = await q(sb.from('items').select('*, topics(subject, name, sort, lgs_avg)')
    .eq('student_id', sid()).eq('track', 'topic').eq('state', 'active').gt('due_date', today));
  if (!items.length) return { entries: [], seconds: 0 };
  const [pool, seenRows, reserved] = await Promise.all([
    q(sb.from('questions').select('id, topic_id, subject, styles, stem, image_path, choices, answer, hint, solution, variant_of, variant_of_exam')
      .in('topic_id', [...new Set(items.map((i) => i.topic_id))]).eq('active', true).eq('exam_only', false)),
    q(sb.from('reviews').select('question_id').eq('student_id', sid())),
    reservedVariants(),
  ]);
  const seen = new Set([...seenRows.map((r) => r.question_id), ...exclude]);
  items.sort((a, b) => (b.consecutive_wrong - a.consecutive_wrong) || (a.step - b.step) || (a.due_date < b.due_date ? -1 : 1));
  const queues = items.map((it) => ({ it, cands: shuffle(pool.filter((p) => p.topic_id === it.topic_id && !seen.has(p.id) && !isVariantOf(p, reserved))) }));
  const entries = [];
  let seconds = 0;
  const open = (x) => x.cands.length && remaining[x.it.topics?.subject] > 0;
  while (queues.some(open)) {
    for (const x of queues) {
      if (!open(x)) continue;
      const p = x.cands.shift();
      remaining[x.it.topics.subject]--;
      entries.push({ item: x.it, question: p, last: false, extra: true });
      seconds += maxSeconds(p.subject) + 15;
    }
  }
  return { entries, seconds };
}

function overlap(a, set) { return (a || []).filter((s) => set.has(s)).length; }
// Açık hata maddelerinin kaynak soruları: bunların benzerleri o maddeye ayrılmıştır.
async function reservedVariants() {
  const rows = await q(sb.from('items').select('question_id, exam_question_id')
    .eq('student_id', sid()).eq('track', 'mistake').eq('state', 'active'));
  return { q: new Set(rows.map((r) => r.question_id).filter(Boolean)), e: new Set(rows.map((r) => r.exam_question_id).filter(Boolean)) };
}
const isVariantOf = (p, src) => (!!p.variant_of && src.q.has(p.variant_of)) || (!!p.variant_of_exam && src.e.has(p.variant_of_exam));
function pickVaried(candidates, n) {
  const picked = [], shown = new Set(), rest = [...candidates];
  while (picked.length < n && rest.length) {
    let best = 0, bestNew = -1;
    rest.forEach((c, i) => {
      const fresh = (c.styles || []).filter((s) => !shown.has(s)).length;
      if (fresh > bestNew) { best = i; bestNew = fresh; }
    });
    const [c] = rest.splice(best, 1);
    (c.styles || []).forEach((s) => shown.add(s));
    picked.push(c);
  }
  return picked;
}

/* Sorular sınavdaki gibi derslere göre gruplanır (LGS kitapçık sırası), ders içinde
   müfredat sırasıyla gelir. Aynı maddenin destek soruları yan yana kalır (sort kararlı). */
function examOrder(entries, order = SUBJECT_ORDER) {
  const rank = (e) => {
    const i = order.indexOf(e.question.subject || e.item.topics?.subject);
    return i < 0 ? order.length : i;
  };
  return [...entries].sort((a, b) => (rank(a) - rank(b)) || ((a.item.topics?.sort ?? 0) - (b.item.topics?.sort ?? 0)));
}

// ---------------------------------------------------------------- öğrenci: bugün

async function viewHome() {
  loading();
  const [todayCount, reasons, replies, togetherRows, messages, poemLog] = await Promise.all([
    q(sb.from('reviews').select('id, track, correct, questions(subject)').eq('student_id', sid()).eq('voided', false).gte('answered_at', localDate() + 'T00:00:00')),
    q(sb.from('exam_questions').select('id').eq('student_id', sid()).neq('outcome', 'dogru')
      .is('student_reason', null).not('diagnosis_cause', 'is', null)),
    q(sb.from('question_feedback').select('id, kind, verdict, response, questions(stem, subject)')
      .eq('student_id', sid()).not('response', 'is', null).eq('response_seen', false).order('checked_at')),
    loadTogether(),
    // Veliden gelen, henüz okunmamış mesajlar (tatlı bir söz ya da şaka).
    q(sb.from('family_messages').select('id, body, signature, created_at').eq('student_id', sid()).is('seen_at', null).order('created_at')),
    // Tamamladığı şiirler (aynı şiir sık sorulmasın); okunamazsa ana sayfa yine açılır.
    sb.from('poem_lines').select('poem_key, created_at').eq('student_id', sid()).order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => data || [], () => []),
  ]);
  state.poemLog = poemLog;
  // Günlük plan derse göre soru sayısıdır. Önce hata tekrarları, sonra konu tekrarları hakkı kullanır;
  // kalan hak ek çalışmayla dolar.
  const plan = dailyPlan(state.student);
  const dailyTarget = planTotal(plan);
  const remaining = { ...plan };
  todayCount.forEach((r) => { const s = r.questions?.subject; if (s in remaining) remaining[s]--; });
  const mistake = await buildSession('mistake', remaining);
  const topic = await buildSession('topic', remaining);
  const dueNow = mistake.entries.length + topic.entries.length;
  const extra = await buildExtra(remaining, [...mistake.entries, ...topic.entries].map((e) => e.question.id));
  state.cache = { mistake, topic, extra };

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const name = state.profile.display_name || '';

  // Ana sayfa sade: selam, bir mesaj ya da şaka, sonra yalnızca hata tekrarı ve konu tekrarı. Yanlışların nedenini
  // seçme ve birlikte bakılacaklar hata tekrarı kartında, ek çalışma konu tekrarı kartında, son yüklemeler Deneme
  // sekmesinde. lead: ana düğmeden önce gelen iş (öncelikli), tail: kartın altındaki ek bölüm.
  const sessionCard = (track, title, s, { lead = null, tail = null } = {}) => {
    const n = s.entries.length;
    const doneToday = todayCount.filter((r) => r.track === track).length;
    return h('section', { class: 'card task' + (n || lead || tail ? '' : ' done') },
      h('div', { class: 'spread' }, h('p', { class: 'label' }, title),
        doneToday ? h('span', { class: 'tag green' }, `Bugün ${doneToday} soru çözdün`) : null),
      lead,
      n
        ? [h('div', { class: 'row' }, h('span', { class: 'big num' }, n), h('span', { class: 'muted' }, `soru · yaklaşık ${Math.max(1, Math.round(s.seconds / 60))} dakika`)),
           h('button', { class: lead ? 'block' : 'primary block', onclick: () => runSession(track, s) }, 'Başla')]
        : h('p', { class: 'muted' }, doneToday ? 'Bugünlük bu kadar. Aferin.' : 'Bugün tekrar edilecek soru yok.'),
      s.shortage ? h('p', { class: 'small muted' }, `${s.shortage} konu için yeni soru hazırlanıyor, yarın gelecek.`) : null,
      s.deferred ? h('p', { class: 'small muted' }, `${s.deferred} soru günlük sınıra takıldı, yarın gelecek. Velin sınırı Ayarlar'dan artırabilir.`) : null,
      tail);
  };
  const reasonsLead = reasons.length ? h('div', { class: 'note small stack', style: 'gap: 8px; border-left: 4px solid var(--red); margin: 8px 0' },
    h('p', {}, h('b', { style: 'color: var(--red)' }, 'Önce bu: '), `${reasons.length} yanlışın nedenini seç. Her soruya bir dokunuş; sonra benim yorumumu da görebilirsin.`),
    h('button', { class: 'primary block', onclick: () => go('reasons') }, 'Nedenleri seç')) : null;
  const togetherTail = togetherRows.length ? h('div', { class: 'subtask spread' },
    h('span', { class: 'small' }, `Birlikte bakılacak ${togetherRows.length} soru var.`),
    h('button', { class: 'ghost small', onclick: () => go('together') }, 'Listeyi aç')) : null;
  const extraTail = extra.entries.length ? h('div', { class: 'subtask stack', style: 'gap: 8px' },
    h('div', { class: 'spread' }, h('b', {}, 'Ek çalışma'),
      h('span', { class: 'small muted num' }, `${extra.entries.length} soru · yaklaşık ${Math.max(1, Math.round(extra.seconds / 60))} dakika`)),
    h('p', { class: 'small muted' }, `Günlük hedef ${dailyTarget} soru, bugün ${todayCount.length}. Tekrarlardan sonra hedefi tamamlamak için; en zayıf konularından başlıyor.`),
    h('button', { class: dueNow ? 'block' : 'primary block', onclick: () => runSession('extra', extra) }, 'Ek çalışmaya başla')) : null;

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, playfulGreeting(name) || (name ? `${hello}, ${name}` : hello)),
      isLgsStudent(state.student) ? h('p', { class: 'muted' }, `LGS'ye ${daysBetween(localDate(), state.student.lgs_date)} gün var.`) : null),
    // Mesaj yoksa ara sıra (üç girişte bir kadar) bir fıkra, bilmece ya da şiir; gün yorucu geçmesin.
    !messages.length && !replies.length && Math.random() < 0.3 ? jokeCard() : null,
    messages.map((m) => {
      const card = h('section', { class: 'card msg-card' },
        h('p', { class: 'label' }, m.signature ? `${m.signature} yazdı` : 'Sana bir mesaj var'),
        h('p', { class: 'msg' }, m.body),
        h('button', { class: 'ghost small', onclick: async () => {
          card.remove();
          await sb.from('family_messages').update({ seen_at: new Date().toISOString() }).eq('id', m.id);
        } }, 'Okudum ❤'));
      return card;
    }),
    // "Soruda sorun var" bildirimlerine gelen cevaplar da birer mesaj gibi; "Okudum" deyince kapanır.
    replies.map((r) => {
      const card = h('section', { class: 'card msg-card' },
        h('div', { class: 'spread' }, h('p', { class: 'label' }, 'Bildirdiğin soruya baktım'),
          h('span', { class: 'tag ' + (r.verdict === 'soru_hatali' ? 'green' : '') }, r.verdict === 'soru_hatali' ? 'Haklıydın' : 'Kontrol ettim')),
        r.questions?.stem ? h('p', { class: 'small muted' }, r.questions.subject ? [subjTag(r.questions.subject), ' '] : null,
          r.questions.stem.slice(0, 120) + (r.questions.stem.length > 120 ? '…' : '')) : null,
        h('div', { class: 'note teacher' }, r.response),
        h('button', { class: 'ghost small', onclick: async () => {
          await sb.from('question_feedback').update({ response_seen: true }).eq('id', r.id);
          card.remove();
        } }, 'Okudum'));
      return card;
    }),
    sessionCard('mistake', 'Hata tekrarı', mistake, { lead: reasonsLead, tail: togetherTail }),
    sessionCard('topic', 'Konu tekrarı', topic, { tail: extraTail }),
  );
}

function statusTag(status) {
  const map = {
    submitted: ['Sırada, bir saat içinde işlenecek', 'amber'],
    processing: ['İşleniyor', 'amber'],
    done: ['İşlendi', 'green'],
    error: ['Sorun var', 'red'],
  };
  const [t, c] = map[status] || [status, ''];
  return h('span', { class: 'tag ' + c }, t);
}

// ---------------------------------------------------------------- öğrenci: soru oturumu

function runSession(track, s) {
  state.session = { track, entries: examOrder(s.entries, studentSubjects(state.student)), index: 0, results: new Map(), stats: { correct: 0, total: 0 }, together: [] };
  pushOverlay('session'); // geri tuşu önce sorsun; oturum bitince tek geri ana sayfaya döner
  showQuestion();
}

function showQuestion() {
  const ss = state.session;
  if (ss.index >= ss.entries.length) return showSessionEnd();
  const entry = ss.entries[ss.index];
  const { item, question } = entry;
  const subject = question.subject;
  const target = maxSeconds(subject);
  const startedAt = Date.now();
  // Ders bölümünde kaçıncı soru: "Matematik 3 / 8".
  const sameSubject = ss.entries.filter((en) => en.question.subject === subject);
  const sectionNo = sameSubject.indexOf(entry) + 1, sectionLen = sameSubject.length;
  // Süre şık seçildiği anda durur; emin olma ölçeğini işaretlemek süreye eklenmez.
  let selected = null, chosenAt = null, hintUsed = false, confidence = null, timerId;

  const timer = h('span', { class: 'timer num' }, '0:00');
  const tick = () => {
    const sec = Math.round(((chosenAt || Date.now()) - startedAt) / 1000);
    timer.textContent = `${fmtDuration(sec)} / ${fmtDuration(target)}`;
    timer.classList.toggle('over', sec > target);
  };
  tick();
  timerId = setInterval(tick, 1000);
  state.leaveOverlay = () => clearInterval(timerId); // geri tuşuyla ara verilirse sayaç durur

  const choiceBtns = ['A', 'B', 'C', 'D'].filter((k) => question.choices?.[k] !== undefined).map((k) =>
    h('button', { class: 'choice', 'aria-pressed': 'false', onclick: () => {
      selected = k;
      chosenAt = Date.now();
      clearInterval(timerId);
      tick();
      choiceBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
      confirmRow.hidden = false;
    }, 'data-k': k }, h('b', {}, k), h('span', {}, question.choices[k])));

  // Okulda henüz işlenmemiş konu: soru sayılmaz, konu işlenene kadar bekletilir.
  const notTaughtBtn = h('button', { class: 'ghost small muted', onclick: async () => {
    clearInterval(timerId);
    notTaughtBtn.disabled = true;
    try {
      await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: item.topic_id, status: 'not_taught', updated_at: new Date().toISOString() }));
      await q(sb.from('items').update({ state: 'paused' }).eq('student_id', sid()).eq('topic_id', item.topic_id).neq('state', 'done'));
    } catch (e) { notTaughtBtn.disabled = false; return toast('Kaydedilemedi, tekrar dene.'); }
    const rest = ss.entries.slice(ss.index + 1).filter((en) => en.item.topic_id !== item.topic_id);
    ss.entries = [...ss.entries.slice(0, ss.index), ...rest];
    toast('Tamam, bu konu işlenene kadar sormayacağım.');
    showQuestion();
  } }, 'Bu konuyu okulda henüz işlemedik');

  const hintBox = h('div', { class: 'note', hidden: true }, question.hint || '');
  const hintBtn = question.hint ? h('button', { class: 'ghost small', onclick: () => {
    hintUsed = true; hintBox.hidden = false; hintBtn.remove();
  } }, 'İpucu göster') : null;

  // Geri bildirim için: bu sorunun kaydı ve takvim değişmeden önceki hali.
  let answered = false, reviewId = null, reviewSaved = null, gradePromise = null, prevItem = null, myResult = null, mistakeItemId = null;
  const itemSnapshot = () => ({
    step: item.step, ease: item.ease, consecutive_wrong: item.consecutive_wrong, interval_days: item.interval_days,
    due_date: item.due_date, state: item.state, last_reviewed_at: item.last_reviewed_at, note: item.note,
  });

  // help: "Bunu birlikte bakalım" ile boş geçti. Bilinmeyen sayılır (yanlış gibi takvime işler),
  // oturum sonunda ve raporda birlikte bakılacaklar listesine girer.
  const submit = async (help = false) => {
    if (answered || (!help && (!selected || !confidence))) return;
    answered = true;
    clearInterval(timerId);
    if (help) { selected = null; confidence = null; }
    const duration = Math.round(((help ? Date.now() : chosenAt || Date.now()) - startedAt) / 1000);
    const correct = !help && selected === question.answer;
    const confident = confidence === 100;
    const overTime = duration > target;
    // Süre LGS'deki payı kadar: aşılırsa doğru da olsa "rahat bildi" sayılmaz.
    const strong = correct && confident && !hintUsed && duration <= target;
    confirmRow.hidden = true;
    helpBtn.disabled = true;
    choiceBtns.forEach((b) => {
      b.disabled = true;
      b.setAttribute('aria-pressed', String(b.dataset.k === selected));
      if (b.dataset.k === question.answer) b.classList.add('right');
      else if (b.dataset.k === selected) b.classList.add('wrong');
    });
    ss.stats.total++; if (correct) ss.stats.correct++;
    const list = ss.results.get(item.id) || [];
    myResult = { correct, strong, confidence };
    list.push(myResult);
    ss.results.set(item.id, list);
    // Birlikte bakılacaklar: boş geçtiği ya da tahmin ettiği soru (yanlıştan sonra "anlamadım" da eklenir).
    const together = help || confidence === 25 ? { question, answer: selected, correct, kind: help ? 'help' : 'guess', topic: item.topics?.name } : null;
    if (together) ss.together.push(together);

    const coachNote = !correct && confidence >= 75
      ? 'Emin olduğun hâlde yanlış: burada bir kavramı farklı biliyor olabilirsin. Çözümü dikkatle oku.'
      : correct && confidence <= 50 ? 'Doğru, ama tahmine yakındı. Bu konuyu farklı sorularla biraz daha göreceğiz.'
      : correct && overTime ? `Doğru, ama ${fmtDuration(duration)} sürdü. ${isLgsStudent(state.student) ? `LGS'de ${SUBJECTS[subject].name} sorusuna` : 'Böyle bir soruya'} en fazla ${fmtDuration(target)} ayırabilirsin; bu konuyu biraz daha hızlandıracağız.`
      : null;
    // Yanlışta kendi beyanı istenir (isteğe bağlı): veli raporunda "yanlışı anladı mı?" sorusunu cevaplar.
    // "Anlamadım" derse konu anlatımı bağlantısı açılır.
    let understoodRow = null;
    const yt = h('a', { class: 'btn', hidden: !help || null, href: youtubeSearch(item.topics?.name || SUBJECTS[subject]?.name), target: '_blank', rel: 'noopener' }, 'YouTube’da konu anlatımı');
    if (!correct && !help) {
      const btns = [[true, 'Anladım'], [false, 'Anlamadım']].map(([v, label]) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: async (e) => {
        btns.forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        yt.hidden = v;
        // "Anlamadım" dediği yanlış da birlikte bakılacaklara girer.
        const mine = ss.together.find((t) => t.question === question);
        if (!v && !mine) ss.together.push({ question, answer: selected, correct, kind: 'notUnderstood', topic: item.topics?.name });
        if (v && mine?.kind === 'notUnderstood') ss.together.splice(ss.together.indexOf(mine), 1);
        try {
          await reviewSaved;
          await q(sb.from('reviews').update({ understood: v }).eq('id', reviewId));
        } catch (err) { toast('Kaydedilemedi, tekrar dene.'); }
      } }, label));
      understoodRow = h('div', { class: 'stack', style: 'gap: 6px' }, h('p', { class: 'small muted' }, 'Çözümü anladın mı?'), h('div', { class: 'chips' }, btns), yt);
    }
    fill(feedback, help
      ? [h('p', { class: 'verdict' }, 'Tamam, bu soruyu ayırdım.'),
         h('p', { class: 'small' }, `Bunu sonra velin ya da öğretmeninle birlikte çözeceksiniz. Doğru cevap ${question.answer}.`),
         question.solution ? h('details', {}, h('summary', { class: 'small' }, 'Çözüme şimdi bakmak istersen'),
           h('div', { class: 'note teacher', style: 'margin-top: 6px' }, question.solution)) : null,
         yt]
      : [h('p', { class: 'verdict ' + (correct ? 'ok' : 'no') }, correct ? 'Doğru' : `Yanlış. Doğru cevap ${question.answer}.`),
         coachNote ? h('p', { class: 'small' }, coachNote) : null,
         question.solution ? h('div', { class: 'note teacher' }, question.solution) : null,
         confidence === 25 ? h('p', { class: 'small muted' }, 'Tahmin ettiğin için bu soruyu birlikte bakılacaklara ekledim.') : null],
      understoodRow,
      h('button', { class: 'primary block', onclick: () => { ss.index++; showQuestion(); } },
        ss.index + 1 < ss.entries.length ? 'Sonraki soru' : 'Bitir'));
    feedback.hidden = false;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      reviewSaved = q(sb.from('reviews').insert({
        student_id: sid(), item_id: item.id, question_id: question.id, track: entry.extra ? 'extra' : item.track, answer: selected,
        correct, duration_sec: duration, confident, confidence, hint_used: hintUsed, needs_help: help,
      }).select('id').single());
      const rv = await reviewSaved;
      reviewId = rv.id;
      // Konu tekrarında ya da ek çalışmada yanlış (ya da "birlikte bakalım"): o soru hata tekrarına girer.
      // Yarın o sorunun değiştirilmiş hâli ya da benzeri gelir (saatlik görev yazar), sonra 2, 4, 14, 30 gün.
      if (!correct && (entry.extra || item.track === 'topic')) {
        const mi = await q(sb.from('items').insert({
          student_id: sid(), track: 'mistake', topic_id: item.topic_id, question_id: question.id,
          step: 0, interval_days: 1, due_date: addDays(localDate(), 1),
          note: help ? 'Birlikte bakalım dedi' : entry.extra ? 'Ek çalışmada yanlış' : 'Konu tekrarında yanlış',
        }).select('id').single());
        mistakeItemId = mi.id;
      }
      if (entry.extra) {
        // Ek çalışmada yanlış: konunun tekrarı yarına çekilir ve destek sorusu eklenir.
        if (!correct || confidence <= 50) {
          const tomorrow = addDays(localDate(), 1);
          const upd = { support: Math.max(item.support || 0, 1), note: 'Ek çalışmada zorlandı, tekrar yarına çekildi.' };
          if (item.due_date > tomorrow) upd.due_date = tomorrow;
          await q(sb.from('items').update(upd).eq('id', item.id));
          Object.assign(item, upd);
        }
      } else if (entry.last) {
        prevItem = itemSnapshot();
        gradePromise = saveItemGrade(item, list);
        await gradePromise;
      }
    } catch (e) {
      console.error(e);
      toast('Kaydedilemedi, internet bağlantını kontrol et.');
    }
  };

  // "Soruda sorun var": soru hatalıysa sonuç sayılmaz, takvim eski haline döner, soru havuzdan çekilir.
  const report = h('div', { class: 'card', hidden: true });
  const reportLink = h('button', { class: 'ghost small muted', onclick: () => { report.hidden = !report.hidden; if (!report.hidden) report.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 'Soruda sorun var');
  let reportKind = null;
  // "Soru yanlış" türü bildirimlerde nerede sorun olduğunu yazması istenir: kontrol eden de veli de neyi
  // kastettiğini anlasın. Diğer bildirimlerde açıklama isteğe bağlı.
  const NOTE_ASK = {
    cevap_yanlis: 'Hangi şık doğru olmalı, neden? Örn: "B de doğru, çünkü…"',
    soru_hatali: 'Nerede hata var? Örn: "Tablodaki sayı metindekiyle aynı değil."',
    anlasilmiyor: 'Hangi kısmı anlaşılmıyor?',
  };
  const reportNote = h('textarea', { id: 'report-note', rows: 3, maxlength: 500, placeholder: 'İstersen kısaca açıkla (isteğe bağlı)' });
  const reportSend = h('button', { class: 'primary', disabled: true, onclick: () => sendReport() }, 'Gönder');
  const reportNeed = h('p', { class: 'small muted', hidden: true }, 'Göndermek için nerede sorun olduğunu kısaca yaz.');
  const reportReady = () => {
    const needsNote = !!NOTE_ASK[reportKind];
    const ok = !!reportKind && (!needsNote || reportNote.value.trim().length >= 5);
    reportSend.disabled = !ok;
    reportNeed.hidden = ok || !needsNote;
  };
  reportNote.addEventListener('input', reportReady);
  const reportChips = FEEDBACK_KINDS.map(([k, label]) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
    reportKind = k;
    reportChips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
    reportNote.placeholder = NOTE_ASK[k] || 'İstersen kısaca açıkla (isteğe bağlı)';
    reportReady();
    if (NOTE_ASK[k]) reportNote.focus();
  } }, label));
  report.append(
    h('h3', {}, 'Bu soruda ne sorun var?'),
    h('div', { class: 'chips' }, reportChips),
    reportNote,
    reportNeed,
    h('div', { class: 'row' }, reportSend, h('button', { class: 'ghost', onclick: () => { report.hidden = true; } }, 'Vazgeç')));

  async function sendReport() {
    reportSend.disabled = true;
    const dispute = DISPUTE_KINDS.has(reportKind);
    const skipped = !answered;
    const list = ss.results.get(item.id) || [];
    try {
      if (skipped) {
        // Cevaplamadan bildirdi: soru görüldü sayılır ama sonucu yok.
        answered = true;
        clearInterval(timerId);
        const rv = await q(sb.from('reviews').insert({
          student_id: sid(), item_id: item.id, question_id: question.id, track: entry.extra ? 'extra' : item.track, answer: null, correct: false,
          duration_sec: Math.round((Date.now() - startedAt) / 1000), hint_used: hintUsed, voided: true,
        }).select('id').single());
        reviewId = rv.id;
      } else if (dispute && reviewId) {
        await q(sb.from('reviews').update({ voided: true }).eq('id', reviewId));
        // Soru hatalıysa yanlışı sayılmaz: bu yanlıştan açılan hata tekrarı da kapanır.
        if (mistakeItemId) await q(sb.from('items').update({ state: 'done', note: 'Soru hatalı bildirildi' }).eq('id', mistakeItemId));
        const i = list.indexOf(myResult);
        if (i >= 0) list.splice(i, 1);
        ss.stats.total--; if (myResult?.correct) ss.stats.correct--;
        if (gradePromise) {
          await gradePromise.catch(() => {});
          const madeGap = item.consecutive_wrong >= 3 && prevItem.consecutive_wrong < 3;
          await q(sb.from('items').update(prevItem).eq('id', item.id));
          Object.assign(item, prevItem);
          if (madeGap) await q(sb.from('topic_status').update({ status: 'active', gap_since: null }).eq('student_id', sid()).eq('topic_id', item.topic_id).eq('gap_since', localDate()));
          if (list.length) await saveItemGrade(item, list);
        }
      }
      if (dispute) await q(sb.rpc('retire_reported_question', { qid: question.id }));
      await q(sb.from('question_feedback').insert({ student_id: sid(), question_id: question.id, review_id: reviewId, kind: reportKind, note: reportNote.value.trim() || null }));
      if (skipped && entry.last && list.length) await saveItemGrade(item, list);
    } catch (e) {
      console.error(e);
      reportSend.disabled = false;
      return toast('Gönderilemedi, tekrar dene.');
    }
    toast(dispute ? 'Teşekkürler. Kontrol edip cevap yazacağım; bu soru sana sayılmadı.' : 'Teşekkürler, not aldım.');
    report.hidden = true;
    reportLink.remove();
    if (skipped) { ss.index++; showQuestion(); }
  }

  const sendBtn = h('button', { class: 'primary block', disabled: true, onclick: () => submit() }, 'Cevabı gönder');
  // Beşinci seçenek: anlamadığı soruyu boş geçer. Adı yargılamasın diye "birlikte bakalım".
  const helpBtn = h('button', { class: 'choice help', onclick: () => submit(true) }, h('b', {}, '?'), h('span', {}, 'Bunu birlikte bakalım'));
  const confBtns = CONFIDENCE_LEVELS.map(([v, label]) =>
    h('button', { class: 'conf', role: 'radio', 'aria-checked': 'false', onclick: (e) => {
      confidence = v;
      confBtns.forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      sendBtn.disabled = false;
    } }, h('b', { class: 'num' }, `%${v}`), h('span', {}, label)));
  const confirmRow = h('div', { class: 'stack', hidden: true },
    h('p', { class: 'small muted' }, 'Bu cevaptan ne kadar eminsin?'),
    h('div', { class: 'scale', role: 'radiogroup', 'aria-label': 'Emin olma ölçeği' }, confBtns),
    sendBtn);
  const feedback = h('div', { class: 'stack', hidden: true });

  render(
    h('div', { class: 'qhead stack', style: 'gap: 8px' },
      h('div', { class: 'spread' },
        h('button', { class: 'ghost', onclick: () => { clearInterval(timerId); go('home'); } }, '← Ara ver'),
        timer),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': ss.entries.length, 'aria-valuenow': ss.index },
        h('i', { style: `width: ${(ss.index / ss.entries.length) * 100}%` }))),
    h('section', { class: 'card' },
      h('div', { class: 'spread' },
        h('div', { class: 'row' }, subjTag(subject), h('span', { class: 'small muted' }, item.topics?.name || ''),
          // Hata tekrarında, daha önce yanlış yaptığı sorunun değiştirilmiş hâli ya da benzeri.
          item.track === 'mistake' && (question.variant_of || question.variant_of_exam) ? h('span', { class: 'tag amber' }, 'Benzer soru') : null),
        h('span', { class: 'small muted num', style: 'white-space: nowrap', title: 'Bu dersteki sıra · toplam sıra' },
          `${sectionNo}/${sectionLen} · ${ss.index + 1}/${ss.entries.length}`)),
      question.image_path ? lazyImg('questions', question.image_path) : null,
      question.stem ? h('p', { class: 'stem' }, question.stem) : null,
      hintBtn, hintBox),
    h('div', { class: 'choices' }, choiceBtns, helpBtn),
    confirmRow,
    feedback,
    h('div', { class: 'row', style: 'justify-content: space-between' },
      reportLink,
      entry.item.track === 'topic' ? notTaughtBtn : null),
    report);
}

async function saveItemGrade(item, results) {
  const upd = gradeItem(item, results, state.student.lgs_date, +(state.student.rare_factor ?? 2));
  await q(sb.from('items').update(upd).eq('id', item.id));
  Object.assign(item, upd);
  if (upd.state === 'done') {
    // Hata takibi bitti: konu tekrarı yoksa başlat.
    const existing = await q(sb.from('items').select('id').eq('student_id', sid()).eq('track', 'topic').eq('topic_id', item.topic_id));
    if (!existing.length) {
      await q(sb.from('items').insert({ student_id: sid(), track: 'topic', topic_id: item.topic_id, step: 1, interval_days: 3, due_date: addDays(localDate(), 3) }));
    }
  }
  if (upd.consecutive_wrong >= 3) {
    await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: item.topic_id, status: 'gap', gap_since: localDate(), updated_at: new Date().toISOString() }));
  }
}

function showSessionEnd() {
  const { stats, track, together } = state.session;
  state.session = null;
  render(
    h('section', { class: 'card', style: `margin-top: ${together.length ? 16 : 80}px; text-align: center` },
      h('p', { class: 'label' }, { mistake: 'Hata tekrarı bitti', topic: 'Konu tekrarı bitti', extra: 'Ek çalışma bitti' }[track]),
      h('p', { class: 'task' }, h('span', { class: 'big num' }, `${stats.correct} / ${stats.total}`)),
      h('p', { class: 'muted' }, stats.correct === stats.total ? 'Hepsi doğru. Bu konular bir süre rahat.' :
        'Yanlış yaptıkların yakında farklı sorularla tekrar gelecek.'),
      h('button', { class: 'primary block', onclick: () => go('home') }, 'Ana sayfa')),
    // Oturum bitince çoğu zaman ödül gibi bir fıkra, bilmece ya da şiir.
    Math.random() < 0.6 ? jokeCard('Mola') : null,
    together.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Birlikte bakılacaklar'),
      h('p', { class: 'small muted' }, 'Anlamadığın ya da tahmin ettiğin sorular. Velin ya da öğretmeninle birlikte üstünden geçin; onların raporunda da görünüyor.'),
      together.map((t) => togetherCard(t.question, t))) : null);
}

/* Birlikte bakılacaklar: "Bunu birlikte bakalım" deyip boş geçtiği, tahmin ettiği (%25) ve yanlıştan sonra
   "anlamadım" dediği sorular. Veli ya da o dersin öğretmeni birlikte baktıktan sonra işaretler
   (rpc mark_together → together_at, together_by). */
const TOGETHER_KIND = {
  help: ['Birlikte bakalım dedi', 'red'],
  notUnderstood: ['Yanlış, anlamadım dedi', 'red'],
  guess: ['Tahmin etti', 'amber'],
};
const togetherKind = (r) => (r.needs_help ? 'help' : r.understood === false ? 'notUnderstood' : 'guess');

function togetherCard(qn, t, ...extra) {
  const [label, color] = TOGETHER_KIND[t.kind];
  return h('article', { class: 'card stack', style: 'gap: 8px' },
    h('div', { class: 'spread' },
      h('div', { class: 'row' }, subjTag(qn.subject), h('span', { class: 'small muted' }, t.topic || '')),
      h('span', { class: 'tag ' + color }, t.kind === 'guess' ? `${label}, ${t.correct ? 'doğru' : 'yanlış'}` : label)),
    qn.image_path ? lazyImg('questions', qn.image_path) : null,
    qn.stem ? h('p', { class: 'stem small' }, qn.stem) : null,
    h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => qn.choices?.[k] !== undefined).map((k) =>
      h('div', { class: 'opt small' + (k === qn.answer ? ' right' : k === t.answer ? ' wrong' : '') },
        h('b', {}, k), h('span', {}, qn.choices[k]), k === t.answer ? h('span', { class: 'muted' }, ' ← seçimi') : null))),
    qn.solution ? h('details', {}, h('summary', { class: 'small' }, 'Çözüm'), h('div', { class: 'note small', style: 'margin-top: 6px' }, qn.solution)) : null,
    extra);
}

function loadTogether() {
  return q(sb.from('reviews').select('id, answer, correct, needs_help, understood, confidence, track, answered_at, questions(subject, stem, choices, answer, solution, image_path, topics(name))')
    .eq('student_id', sid()).eq('voided', false).is('together_at', null)
    .or('needs_help.eq.true,understood.eq.false,confidence.eq.25')
    .gte('answered_at', addDays(localDate(), -60))
    .order('answered_at', { ascending: false }).limit(60));
}

/* Veliden çocuğa mesaj: çocuk uygulamayı açınca ana sayfasında görür, "Okudum" deyince kapanır.
   Akla gelmezse tek dokunuşla tatlı bir söz ya da şaka önerilir (değiştirilebilir). */
const SWEET_LINES = ['Seninle çok gurur duyuyorum!', 'Bugün de harikasın, kolay gelsin.', 'Akşam dondurma benden, söz!',
  'Yanlış yapmaktan korkma, öyle öğreniyoruz.', 'Seni çok seviyorum.'];
// Çocuklara göre şakalar, bilmeceler ve hafif bulmacalar: soru görünür, cevap dokununca açılır. Velinin mesaj
// önerilerinde de kullanılır. [soru, cevap, tür, seviye]; tür: saka | bilmece | bulmaca; seviye: 'kucuk' (1–4. sınıf),
// 'buyuk' (5–8. sınıf) ya da boş (herkes). Bulmacalar bilerek az işlemli: ders zaten var, burası mola.
const JOKES = [
  ['Sıfır sekize ne demiş?', '"Kemerin çok yakışmış!"', 'saka'],
  ['Kalem silgiye ne demiş?', '"Sen olmasan hatalarımla ne yapardım!"', 'saka'],
  ['Matematik kitabı neden üzgünmüş?', 'Çünkü çok problemi varmış.', 'saka'],
  ['Temel neden merdivenle okula gitmiş?', 'Sınıf atlamak için!', 'saka'],
  ['Bilgisayar neden üşümüş?', 'Pencereleri açık kalmış!', 'saka'],
  ['Ödev neden kaçmış?', 'Yapılmak istememiş… ama sen onu yakaladın!', 'saka'],
  ['Kediler bilgisayarı neden sevmez?', 'Fare yüzünden!', 'saka'],
  ['En tembel sayı hangisi?', 'Sekiz: yan yatınca sonsuza kadar uyuyor.', 'saka'],
  ['Atom neden gülümsemiş?', 'Bir elektron kaybetmiş, pozitif olmuş!', 'saka', 'buyuk'],
  ['Işık neden ders çalışmamış?', 'Zaten çok parlakmış!', 'saka'],
  ['Kitap neden üşümüş?', 'Kapağı açık kalmış!', 'saka'],
  ['Silgi neden çok yorgunmuş?', 'Bütün gün başkalarının hatalarını temizlemiş!', 'saka'],
  ['Hangi ayda insanlar en az konuşur?', 'Şubat. En kısa ay o!', 'bilmece'],
  ['Ne kadar çok alırsan o kadar büyür?', 'Çukur!', 'bilmece'],
  ['Hangi soruya asla "evet" diyemezsin?', '"Uyuyor musun?"', 'bilmece'],
  ['Islandıkça kuruyan şey nedir?', 'Havlu!', 'bilmece'],
  ['Her yere gider ama yerinden hiç kıpırdamaz. Nedir?', 'Yol!', 'bilmece'],
  ['Dişleri vardır ama hiç ısırmaz. Nedir?', 'Tarak!', 'bilmece'],
  ['Ayakları vardır ama hiç yürümez. Nedir?', 'Masa!', 'bilmece'],
  ['Hep önündedir ama onu göremezsin. Nedir?', 'Gelecek!', 'bilmece'],
  ['Çarşıdan aldım bir tane, eve geldim bin tane. Nedir?', 'Nar!', 'bilmece'],
  ['Dışı yeşil, içi kırmızı, çekirdeği kara. Nedir?', 'Karpuz!', 'bilmece'],
  ['İki kardeş yan yana durur ama birbirini hiç göremez. Nedir?', 'Gözlerimiz!', 'bilmece'],
  ['Akrebi var ama hiç sokmaz. Nedir?', 'Saat!', 'bilmece'],
  ['Kırılmadan kullanılmaz. Nedir?', 'Yumurta!', 'bilmece'],
  ['Yazın giyinir, kışın soyunur. Nedir?', 'Ağaç!', 'bilmece'],
  ['Suya girer ama hiç ıslanmaz. Nedir?', 'Gölge!', 'bilmece'],
  ['Senin ama başkaları senden çok kullanır. Nedir?', 'Adın!', 'bilmece'],
  ['Sen gülersen o da güler, sen kızarsan o da kızar. Nedir?', 'Ayna!', 'bilmece'],
  ['Ne kadar çok olursa o kadar az görürsün. Nedir?', 'Karanlık!', 'bilmece'],
  ['Boynu var başı yok, kolları var eli yok. Nedir?', 'Gömlek!', 'bilmece'],
  ['Ağzı var dili yok, konuşur ama sesi yok. Nedir?', 'Mektup!', 'bilmece'],
  ['Gözü var ama hiç göremez. Nedir?', 'İğne!', 'bilmece'],
  ['Bir yılda kaç ayın 28 günü vardır?', 'Hepsinin! On iki ayın da 28. günü var.', 'bulmaca'],
  ['Bir kilo pamuk mu ağırdır, bir kilo demir mi?', 'İkisi de bir kilo!', 'bulmaca'],
  ['Bir yarışta ikinciyi geçtin. Kaçıncı oldun?', 'İkinci!', 'bulmaca'],
  ['Üç elmadan ikisini alırsan senin kaç elman olur?', 'İki: aldıkların!', 'bulmaca'],
  ['Ayşe\'nin üç erkek kardeşi var. Her erkek kardeşinin bir kız kardeşi var. Ailede kaç çocuk var?', 'Dört! Kız kardeş Ayşe\'nin kendisi.', 'bulmaca'],
  ['Elif sırada baştan 4., sondan 6. Sırada kaç kişi var?', 'Dokuz!', 'bulmaca', 'kucuk'],
  ['Aklımdan bir sayı tuttum, iki katı 18. Tuttuğum sayı kaç?', 'Dokuz!', 'bulmaca', 'kucuk'],
  ['2, 4, 8, 16… sıradaki sayı kaç?', '32: her sayı bir öncekinin iki katı.', 'bulmaca', 'buyuk'],
  ['1, 1, 2, 3, 5, 8… sıradaki sayı kaç?', '13: her sayı önceki ikisinin toplamı.', 'bulmaca', 'buyuk'],
  ['Saat tam 3\'te akrep ile yelkovan arasındaki açı kaç derece?', '90 derece, dik açı!', 'bulmaca', 'buyuk'],
];
const JOKE_LABEL = { saka: 'Bir şaka', bilmece: 'Bir bilmece', bulmaca: 'Bir bulmaca' };
const jokesFor = (p) => { const small = (p?.grade ?? 8) <= 4; return JOKES.filter((j) => !j[3] || (j[3] === 'kucuk') === small); };
// Fıkralar (Nasreddin Hoca, Temel): halk fıkraları, kısa anlatımla; sonu dokununca açılır.
const FIKRALAR = [
  ['Nasreddin Hoca komşusundan bir kazan ödünç alır. Geri verirken içine küçük bir tencere koyar: "Kazanın doğurdu!" Komşu sevinir. Bir süre sonra Hoca kazanı yine ödünç alır ama geri getirmez. Komşu sorunca Hoca "Kazanın öldü" der. Komşu şaşırır: "Kazan ölür mü hiç?"',
    'Hoca: "Doğurduğuna inandın da öldüğüne neden inanmıyorsun?"'],
  ['Nasreddin Hoca göl kenarında oturmuş, göle yoğurt mayası çalıyormuş. Görenler sormuş: "Hocam, ne yapıyorsun?" "Göle maya çalıyorum." "Göl hiç yoğurt olur mu?"',
    'Hoca: "Ya tutarsa!"'],
  ['Nasreddin Hoca bir düğüne eski elbiseleriyle gider; kimse yüzüne bakmaz. Eve dönüp kürkünü giyer, geri gelir. Bu sefer herkes ona yer açar, en güzel yemekleri önüne koyar. Hoca kürkünün yenini çorbaya batırır.',
    '"Ye kürküm ye! Bu ikram sana."'],
  ['Çocuklar, pazara giden Nasreddin Hoca\'dan düdük getirmesini ister. İçlerinden sadece biri Hoca\'ya para verir. Hoca dönüşte yalnızca o çocuğa düdük getirir. Ötekiler "Bize neden yok?" diye sorar.',
    'Hoca: "Parayı veren düdüğü çalar."'],
  ['Nasreddin Hoca kadılık yaparken davacıyı dinler: "Haklısın" der. Sonra öbür tarafı dinler: "Sen de haklısın" der. Hanımı itiraz eder: "Efendi, ikisi birden haklı olur mu?"',
    'Hoca: "Hanım, sen de haklısın!"'],
  ['Birisi Nasreddin Hoca\'ya sorar: "Hocam, dünyanın ortası neresi?" Hoca eşeğinin sol ön ayağının bastığı yeri gösterir: "Tam burası." "Nereden bildin?"',
    'Hoca: "İnanmıyorsan ölç!"'],
  ['Nasreddin Hoca eşeğine ters binmiş, öğrencileri de arkasından yürüyormuş. Görenler sormuş: "Hocam, eşeğe neden ters bindin?"',
    'Hoca: "Önünüzden gitsem size arkamı dönmüş olurum, arkanızdan gitsem siz bana arkanızı dönersiniz. Böyle karşı karşıya gidiyoruz!"'],
  ['Öğretmen Temel\'e sorar: "Temel, bir elinde 3 elma, öbür elinde 4 portakal olsa ne olur?"',
    'Temel: "Çok büyük ellerim olur, öğretmenim!"'],
  ['Öğretmen, Temel\'in ödevine bakıp sorar: "Temel, bu ödevi baban mı yaptı?"',
    'Temel: "Hayır öğretmenim, babam çok yorgundu; annem yaptı!"'],
  ['Nasreddin Hoca evde kaybettiği yüzüğünü sokakta arıyormuş. Komşusu sormuş: "Hocam, yüzüğü evde kaybetmedin mi? Neden sokakta arıyorsun?"',
    'Hoca: "Ev karanlık, sokak aydınlık!"'],
  ['Nasreddin Hoca\'nın eşeği kaybolmuş. Hoca ellerini açmış, şükrediyormuş. "Hocam, eşeğin kayboldu, neden şükrediyorsun?" diye sormuşlar.',
    'Hoca: "İyi ki üstünde değilmişim, yoksa ben de kaybolurdum!"'],
  ['Birisi Nasreddin Hoca\'ya sormuş: "Hocam, ay mı daha faydalı, güneş mi?"',
    'Hoca: "Tabii ki ay! Güneş zaten ortalık aydınlıkken çıkıyor; ay ise karanlıkta yolumuzu aydınlatıyor."'],
  ['Nasreddin Hoca\'ya yaşını sormuşlar: "Kırk." On yıl sonra yine sormuşlar: "Kırk." "Hocam, on yıl önce de kırk demiştin!"',
    'Hoca: "Ben sözümden dönmem!"'],
];
// Kart sırası: üçte biri "şiiri sen tamamla" (bütün şiirleri tamamladıysa daha seyrek), dörtte biri fıkra, kalanı
// kısa şaka, bilmece ya da bulmaca; her çocuk kendi seviyesindekileri görür. Aynı şey art arda sorulmasın diye bu
// cihazda yakın zamanda gösterilenler sıranın sonuna atılır; hiçbir kart kalıcı olarak elenmez.
function jokeCard(prefix) {
  const r = Math.random();
  const poemShare = poemsOpen().length ? 0.33 : 0.15;
  if (r < poemShare) return poemCard(prefix);
  const fikra = r < poemShare + 0.25;
  const list = fikra ? FIKRALAR : jokesFor(state.student);
  const pick = pickFresh(list, (x) => (fikra ? 'f:' : 'j:') + x[0].slice(0, 40));
  const [question, answer] = pick;
  const kind = fikra ? 'Bir fıkra' : JOKE_LABEL[pick[2]] || 'Bir şaka';
  const punch = h('p', { class: 'msg', hidden: true }, answer);
  const reveal = h('button', { class: 'ghost small', onclick: () => { punch.hidden = false; reveal.remove(); } }, fikra ? 'Sonunu gör' : 'Cevabı gör');
  return h('section', { class: 'card msg-card' }, h('p', { class: 'label' }, prefix ? `${prefix}: ${kind.toLocaleLowerCase('tr')}` : kind),
    h('p', { class: 'msg' }, question), punch, reveal);
}

// Şiiri sen tamamla: son dize gizli; çocuk kendi dizesini yazar ya da sesli söyler, sonra aslını görür. Ardından
// kafiyeyi ve anlamı anlatan bir not, bir de sesli okuma (hitabet) ipucu çıkar. Bu dosya herkese açık depoda
// durduğu için telifli modern çocuk şiirleri giremez: halk ürünleri, Yunus Emre, Âkif, Rıza Tevfik ve Defter için
// yazılmış şiirler var. pair: gizli dizenin kafiyelendiği dize sonları; yoksa (nakaratlı şiirler) kafiye ölçülmez.
const POEMS = [
  { id: 'dandini', show: ['Dandini dandini dastana,', 'Danalar girmiş bostana,', 'Kov bostancı danayı,'], hide: ['Yemesin lahanayı.'],
    pair: ['danayı'], rhyme: 'dastana – bostana, danayı – lahanayı', by: 'Ninni (anonim)',
    note: 'Ninnileri anneler bebeklerini uyuturken söyler; kimin yazdığı bilinmez, yüzyıllardır dilden dile gelir. Dize sonları ikişer ikişer aynı seslerle bittiği için beşik sallanır gibi tatlı bir ritim oluşuyor. Bir de düşün: koca danalar bostana dalmış, lahanaları yiyor… Ninni bile komik!' },
  { id: 'masal', show: ['Bir varmış, bir yokmuş;', 'Evvel zaman içinde,', 'Kalbur saman içinde;', 'Develer tellal iken,'], hide: ['Pireler berber iken…'],
    pair: ['tellal iken'], rhyme: 'içinde – içinde, tellal iken – berber iken', by: 'Masal tekerlemesi (anonim)',
    ask: 'Masalcı nasıl devam ediyor? Sen de "iken" ile biten komik bir dize uydur!',
    note: 'Masalcılar masala böyle başlar. "İçinde, içinde… iken, iken…" tekrarları sözü davul gibi ritimli yapıyor. Deve tellal (eskiden sokakta bağırarak duyuru yapan kişi), pire berber olur mu hiç? Olmaz! Masalcı daha ilk cümlede "Şimdi hayal dünyasına giriyoruz" diye göz kırpıyor.' },
  { id: 'su-kose', show: ['Şu köşe yaz köşesi,', 'Şu köşe kış köşesi,'], hide: ['Ortada su şişesi!'],
    pair: ['köşesi'], rhyme: 'köşesi – köşesi – şişesi', by: 'Tekerleme (anonim)',
    ask: 'Üçüncü dizeyi sen uydur: sonu "köşesi" gibi "-şesi" ile bitsin!',
    tip: 'Şimdi üç kere söyle, her seferinde biraz daha hızlı. Dilin dolaşmazsa diksiyonun süper!',
    note: 'Tekerlemeler, hızlı söyleyince dil dolaştıran sözlerdir. Burada dize sonları hep "-şesi" ile bitiyor ve içlerinde bolca "ş" sesi var; dil bu yüzden sürçüyor. Spikerler ve hitabet ustaları da diksiyon çalışırken tekerleme söyler!' },
  { id: 'istiklal-1', show: ['Korkma, sönmez bu şafaklarda yüzen al sancak;', 'Sönmeden yurdumun üstünde tüten en son ocak.', 'O benim milletimin yıldızıdır, parlayacak;'],
    hide: ['O benimdir, o benim milletimindir ancak.'],
    pair: ['sancak', 'ocak', 'parlayacak'], rhyme: 'sancak – ocak – parlayacak – ancak', by: 'Mehmet Âkif Ersoy, İstiklâl Marşı',
    ask: 'Bunu biliyorsun! Son dizeyi hatırla; yaz ya da ayağa kalkıp gür bir sesle söyle.',
    note: 'Dört dizenin dördü de "-ak" sesiyle bitiyor; bu güçlü ses marşı gür ve kararlı yapıyor. Anlamı: Korkma! Bu yurtta tek bir ocak bile tütüyorsa bayrağımız sönmeyecek; o, milletimin yıldızıdır ve hep parlayacak. Âkif bunu Kurtuluş Savaşı sürerken yazdı; Meclis 12 Mart 1921\'de millî marşımız olarak kabul etti.' },
  { id: 'istiklal-2', show: ['Çatma, kurban olayım, çehreni ey nazlı hilâl!', 'Kahraman ırkıma bir gül! Ne bu şiddet, bu celâl?', 'Sana olmaz dökülen kanlarımız sonra helâl…'],
    hide: ['Hakkıdır, Hakk\'a tapan milletimin istiklâl!'],
    pair: ['hilâl', 'celâl', 'helâl'], rhyme: 'hilâl – celâl – helâl – istiklâl', by: 'Mehmet Âkif Ersoy, İstiklâl Marşı',
    ask: 'İkinci kıtanın son dizesini hatırlıyor musun? Yaz ya da sesli söyle.',
    note: 'Âkif bayrakla konuşuyor: "Kaşlarını çatma ey nazlı hilal, kahraman milletime bir gülümse!" (Çehre: yüz, celâl: öfke.) Bayrağa insan gibi seslenmeye kişileştirme denir; şiire sıcaklık katar. Dizelerin hepsi uzun "-âl" sesiyle bitiyor; marşı söylerken sesimiz bu yüzden yükselip uzuyor. Son dize: Allah\'a inanan milletimin bağımsızlığı (istiklâl) onun hakkıdır.' },
  { id: 'yunus-tanis', show: ['Gelin tanış olalım,', 'İşi kolay kılalım,', 'Sevelim, sevilelim,'], hide: ['Dünya kimseye kalmaz.'],
    rhyme: 'olalım – kılalım – sevilelim', by: 'Yunus Emre',
    ask: 'Son dize, şiirin her dörtlüğünün sonunda tekrarlanan bir söz. Sence Yunus ne demiş olabilir?',
    note: 'İlk üç dize "-lım, -lim" sesleriyle kafiyeli; dördüncüsü her dörtlüğün sonunda tekrarlanan bir nakarat. Anlamı: Gelin tanışalım, işleri birbirimize kolaylaştıralım, sevelim ve sevilelim; dünya kimseye kalmaz, kavgaya değmez. Yunus bunu 700 yıl kadar önce yazdı ve hâlâ aynı tatlılıkla okunuyor: sade sözle büyük bir şey anlatmak işte böyle olur.' },
  { id: 'yunus-soz', show: ['Söz ola kese savaşı,', 'Söz ola kestire başı,', 'Söz ola ağulu aşı'], hide: ['Bal ile yağ ede bir söz.'],
    rhyme: 'savaşı – başı – aşı', by: 'Yunus Emre', level: 'buyuk',
    ask: 'Yunus sözün gücünü anlatıyor. Bir söz, zehirli yemeği (ağulu aş) neye çevirir? Son dizeyi sen tamamla.',
    note: 'Hitabetin özü bu dörtlükte: Bir söz savaşı bitirir, bir söz baş kestirir; bir söz de zehirli yemeği bal ile yağa çevirir. Yani söz çok güçlüdür; ne söylediğin kadar nasıl söylediğin de önemli. "Savaşı – başı – aşı" kafiyesi dizeleri zincir gibi bağlıyor; her dizenin başındaki "Söz ola" tekrarı da çekiç gibi vuruyor.' },
  { id: 'yunus-dolap', show: ['Dolap niçin inilersin?', 'Derdim vardır inilerim,', 'Ben Mevlâ\'ya âşık oldum,'], hide: ['Anın için inilerim.'],
    pair: ['inilerim'], rhyme: 'inilerim – inilerim (aynı sözün tekrarı: redif)', by: 'Yunus Emre', level: 'buyuk',
    ask: 'Yunus su dolabına "Neden inliyorsun?" diye soruyor, dolap da cevap veriyor. Dolabın son sözünü sen söyle!',
    note: 'Su dolabı, eskiden dereden su çeken büyük tahta çarktır; dönerken inler gibi gıcırdar. Yunus onu konuşturuyor: "Derdim var, Allah\'ı (Mevlâ) çok sevdim, onun için (anın için) inliyorum." Cansız bir varlığı insan gibi konuşturmaya kişileştirme ve konuşturma denir; Türkçe sorularında sık çıkar! "İnilerim" tekrarı, dolabın gıcırtısı gibi kulakta yankılanıyor.' },
  { id: 'ucun-kuslar', show: ['Uçun kuşlar, uçun, doğduğum yere;', 'Şimdi dağlarında mor sümbül vardır.', 'Ormanlar koynunda bir gizli dere,'],
    hide: ['Dikenler içinde sarı gül vardır.'],
    pair: ['mor sümbül vardır'], rhyme: 'yere – dere, sümbül vardır – sarı gül vardır', by: 'Rıza Tevfik Bölükbaşı, Uçun Kuşlar', level: 'buyuk',
    note: 'Şair uzaklarda; doğduğu yerlere kuşlarla selam gönderiyor, özlemini kuşların kanadına yüklemiş. "Yere – dere" ve "sümbül – gül" kafiyeleri dizelere şarkı gibi bir akış veriyor; her seferinde tekrarlanan "vardır" sözüne redif denir. Dikenler arasında açan sarı gül de ayrı bir güzellik: zor yerde bile güzellik var.' },
  { id: 'akif-canakkale', show: ['Ey şehid oğlu şehid, isteme benden makber,'], hide: ['Sana âgûşunu açmış duruyor Peygamber.'],
    pair: ['makber'], rhyme: 'makber – Peygamber', by: 'Mehmet Âkif Ersoy, Çanakkale Şehitlerine', level: 'buyuk',
    ask: 'Âkif şehide "Benden mezar (makber) isteme" diyor. Neden? İkinci dizeyi sen tamamla; sonu "-ber" ile bitsin.',
    note: 'Âkif, Çanakkale\'de şehit düşen askere "Senin için bir mezar yapamam, çünkü Peygamber sana kucağını (âgûş) açmış bekliyor" diyor: hiçbir mezar o şerefe yetmez. "Makber – Peygamber" kafiyesi iki dizeyi bir anıt gibi birbirine kenetliyor. Çanakkale İnkılap Tarihi\'nde de var; bu beyit orada da işine yarar.' },
  { id: 'kitap-kapisi', show: ['Her kitapta bir kapı var,', 'Ardında yaz, ardında kar;', 'Bir sayfada sıcak bir çöl,'], hide: ['Bir sayfada deniz, rüzgâr.'],
    pair: ['kapı var', 'kar'], rhyme: 'var – kar – rüzgâr', by: 'Defter için yazıldı',
    note: 'Şiir kitabı bir kapıya benzetiyor (benzetme): açınca yazına da kışına da, çölüne de denizine de gidiyorsun. "Var – kar – rüzgâr" aynı "-ar" sesiyle bitiyor, dizeler birbirine tıkır tıkır oturuyor. Okudukça dünyan büyür!' },
  { id: 'iki-kanat', show: ['İki kardeş, iki kanat,', 'Birlikte uçmak ne rahat!', 'Biri düşse öbürü var,'], hide: ['Onunla güzel bu hayat.'],
    pair: ['kanat', 'rahat'], rhyme: 'kanat – rahat – hayat', by: 'Defter için yazıldı',
    note: 'Şiir kardeşleri bir kuşun iki kanadına benzetiyor: kuş tek kanatla uçamaz! Biri düşerse öbürü tutar. "Kanat – rahat – hayat" aynı "-at" sesiyle bitiyor; kısa ve sevimli bir şarkı gibi.' },
  { id: 'yanlisim', show: ['Bir yanlışım oldu bugün,', 'Ne kızgınım ne de üzgün;', 'Yanlış bana yol gösterdi,'], hide: ['Doğruyu buldum öbür gün.'],
    pair: ['bugün', 'üzgün'], rhyme: 'bugün – üzgün – gün', by: 'Defter için yazıldı',
    note: 'Yanlışlar da öğretmendir: yanlışını gören, ertesi gün doğruyu bulur. Bu defterin sırrı da tam olarak bu! "Bugün – üzgün – gün" aynı "-ün" sesiyle bitiyor; şiir kısa ama dediği büyük.' },
  { id: 'son-yaprak', show: ['Dalda kalmış son bir yaprak,', 'Rüzgâr esti: "Haydi, bırak!"', 'Yaprak süzüldü korkmadan,'], hide: ['Toprağa yorgan olacak.'],
    pair: ['yaprak', 'bırak'], rhyme: 'yaprak – bırak – olacak', by: 'Defter için yazıldı',
    note: 'Yaprak korkmadan düşüyor, çünkü bir görevi var: kışın toprağı örten bir yorgan olacak. Şair yaprağa insan gibi cesaret vermiş (kişileştirme). Fen bilgisi de haklı çıkarıyor: dökülen yapraklar toprağı korur, çürüyünce de besler. "Yaprak – bırak – olacak" hep "-ak" ile bitiyor.' },
  { id: 'miyav', show: ['Miyav dedi minik kedi,', 'Sabahtan beri bekledi;', 'Mama kabı boş kalınca,'], hide: ['Bana bakıp: "Hani?" dedi.'],
    pair: ['kedi', 'bekledi'], rhyme: 'kedi – bekledi – dedi', by: 'Defter için yazıldı', level: 'kucuk',
    note: 'Kedi tek bir kelimeyle derdini anlatıyor: "Hani?" Kısa ve net bir söz bazen uzun bir konuşmadan güçlüdür; buna "az ve öz" denir. "Kedi – bekledi – dedi" kafiyesi şiire zıplayan bir ritim veriyor.' },
  { id: 'yagmur', show: ['Bir yağmur yağdı geçen gün,', 'Çiçeklere oldu düğün;', 'Papatyalar içti suyu,'], hide: ['Gökkuşağı çıktı o gün.'],
    pair: ['geçen gün', 'düğün'], rhyme: 'gün – düğün – gün', by: 'Defter için yazıldı', level: 'kucuk',
    note: 'Şiir yağmuru çiçeklerin düğünü gibi anlatıyor: susamış çiçekler için yağmur bir bayram! Yağmurdan sonra güneş açınca damlalar ışığı renklere ayırır ve gökkuşağı çıkar. "Gün – düğün – gün" aynı "-ün" sesiyle bitiyor.' },
  { id: 'damla', show: ['Damla damla dolar göller,', 'Adım adım biter yollar;', 'Her gün biraz çalışırsan,'], hide: ['Yaza açar bütün güller.'],
    pair: ['göller', 'yollar'], rhyme: 'göller – yollar – güller', by: 'Defter için yazıldı', level: 'buyuk',
    note: 'Damla damla göl olur, adım adım yol biter: büyük işler küçük ama her gün yapılan emeklerle olur. "Yaza" sözcüğüne dikkat: LGS haziranda! Her gün biraz çalışan, yazın emeğinin güllerini toplar. "Göller – yollar – güller" kafiyesi de dizeleri birbirine bağlıyor.' },
];
const POEM_TIPS = [
  'Şimdi bütün şiiri sesli ve duygulu oku: virgülde kısa, noktada biraz daha uzun dur.',
  'Kafiyeli kelimeleri hafifçe vurgulayarak oku; şiirin müziğini duyacaksın.',
  'Bir de birine oku: annene, babana ya da kardeşine, gözlerine bakarak!',
  'Önce fısıldayarak, sonra gür bir sesle oku. Hangisi bu şiire daha çok yakıştı?',
];
const poemsFor = (p) => { const small = (p?.grade ?? 8) <= 4; return POEMS.filter((x) => !x.level || (x.level === 'kucuk') === small); };
// Küçük harf, şapkasız, noktalamasız; iki dizenin ortak sonu en az iki harfse kafiye sayılır.
const poemNorm = (s) => s.toLocaleLowerCase('tr').replace(/[âîû]/g, (c) => ({ â: 'a', î: 'i', û: 'u' })[c])
  .replace(/[^a-zçğıöşü ]/g, '').replace(/\s+/g, ' ').trim();
function sharedEnd(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return a.slice(a.length - i).trim();
}
// Sonuç (aynen, kafiyeli, kafiyesiz, serbest) raporda da görünür; serbest: nakaratlı şiir, kafiye ölçülmez.
function poemCheck(poem, said) {
  const mine = poemNorm(said);
  const real = poemNorm(poem.hide.join(' '));
  if (mine === real || (mine.length >= 8 && real.includes(mine))) return { result: 'aynen', text: 'Aslını aynen bildin! 🌟' };
  if (!poem.pair) return { result: 'serbest', text: 'Kendi dizeni yazdın, bravo! Şimdi aslıyla karşılaştır: hangisi sana daha güzel geldi?' };
  const shared = poem.pair.map((p) => sharedEnd(mine, poemNorm(p))).sort((a, b) => b.length - a.length)[0];
  return shared.replace(/ /g, '').length >= 2
    ? { result: 'kafiyeli', text: `Senin dizen de “…${shared}” sesiyle bitiyor: kafiyeli! Tam bir şair gibi düşünmüşsün 👏` }
    : { result: 'kafiyesiz', text: 'Güzel deneme! Kafiye için son sesleri öncekilere benzetmeyi dene. Bak, şair nasıl yapmış:' };
}

// Bu cihazda son gösterilen kartlar, öğrenciye göre (eskiden yeniye). Taze kart kalmadıysa en uzun zamandır
// gösterilmeyen yarıdan seçilir.
function pickFresh(list, keyOf) {
  const store = 'defter.recentCards.' + sid();
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(store) || '[]'); } catch (e) { /* tarayıcı izin vermiyor */ }
  const age = (x) => recent.indexOf(keyOf(x));
  const fresh = list.filter((x) => age(x) < 0);
  const pool = fresh.length ? fresh : [...list].sort((a, b) => age(a) - age(b)).slice(0, Math.ceil(list.length / 2));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(store, JSON.stringify([...recent.filter((k) => k !== keyOf(pick)), keyOf(pick)].slice(-30))); } catch (e) { /* önemli değil */ }
  return pick;
}
// Çocuğun dize yazarak tamamladığı şiirler ana sayfa açılırken state.poemLog'a yüklenir (yeniden eskiye).
const poemsOpen = () => { const done = new Set((state.poemLog || []).map((l) => l.poem_key)); return poemsFor(state.student).filter((p) => !done.has(p.id)); };
function poemCard(prefix) {
  // Önce hiç tamamlamadığı şiirler; hepsini tamamladıysa en uzun zamandır yazmadıkları.
  const log = state.poemLog || [];
  const lastWritten = (id) => { const i = log.findIndex((l) => l.poem_key === id); return i < 0 ? Infinity : i; };
  const open = poemsOpen();
  const all = poemsFor(state.student);
  const poem = pickFresh(open.length ? open
    : [...all].sort((a, b) => lastWritten(b.id) - lastWritten(a.id)).slice(0, Math.ceil(all.length / 2)), (p) => 'p:' + p.id);
  const gap = h('span', { class: 'poem-gap' }, '……………… ?');
  const mine = h('input', { type: 'text', maxlength: 120, autocomplete: 'off', placeholder: 'Senin dizen (yaz ya da sesli söyle)',
    onkeydown: (e) => { if (e.key === 'Enter') reveal.click(); } });
  const ask = h('p', { class: 'small' }, poem.ask || 'Son dizeyi sen uydur: öncekilerle aynı sesle bitsin. Sonra sesli oku!');
  const after = h('div', { class: 'stack', style: 'gap: 8px', hidden: true });
  const reveal = h('button', { class: 'ghost small', onclick: () => {
    const said = mine.value.trim();
    const check = said ? poemCheck(poem, said) : null;
    gap.replaceWith(h('strong', { class: 'poem-new' }, poem.hide.join('\n')));
    ask.remove(); mine.remove(); reveal.remove();
    // Yazdığı dize kaydedilir: veli raporda görür, bu şiir de sıranın sonuna geçer.
    if (check && state.profile?.role === 'student') {
      (state.poemLog ||= []).unshift({ poem_key: poem.id, created_at: new Date().toISOString() });
      sb.from('poem_lines').insert({ student_id: sid(), poem_key: poem.id, line: said.slice(0, 200), result: check.result })
        .then(({ error }) => { if (error) console.warn('Şiir dizesi kaydedilemedi:', error.message); });
    }
    fill(after, check ? h('p', { class: 'note small' }, `Senin dizen: “${said}”\n${check.text}`) : null,
      h('p', { class: 'small' }, h('strong', {}, 'Kafiye: '), poem.rhyme),
      h('p', { class: 'small' }, poem.note),
      h('p', { class: 'small muted' }, '🎤 ' + (poem.tip || POEM_TIPS[Math.floor(Math.random() * POEM_TIPS.length)])));
    after.hidden = false;
  } }, 'Devamını gör');
  return h('section', { class: 'card msg-card' },
    h('p', { class: 'label' }, prefix ? `${prefix}: şiiri sen tamamla` : 'Şiiri sen tamamla'),
    h('p', { class: 'msg poem' }, poem.show.join('\n') + '\n', gap),
    h('p', { class: 'small muted poem-by' }, '— ' + poem.by),
    ask, mine, reveal, after);
}
function messageBox() {
  const kid = state.student;
  const others = (state.students || []).filter((s) => s.id !== kid.id);
  let sig = '';
  try { sig = localStorage.getItem('defter.signature') || ''; } catch (e) { /* önemli değil */ }
  const body = h('textarea', { id: 'msg-body', rows: 3, maxlength: 500, placeholder: `${kid.display_name} uygulamayı açınca görecek. Tatlı bir söz ya da bir şaka…` });
  const signature = h('input', { id: 'msg-sign', maxlength: 40, value: sig, placeholder: 'Ör. Baban, Annen' });
  const all = others.length ? h('input', { type: 'checkbox', id: 'msg-all' }) : null;
  const list = h('div', { class: 'stack', style: 'gap: 6px' });
  const idea = (arr) => { body.value = arr[Math.floor(Math.random() * arr.length)]; body.focus(); };

  const loadList = async () => {
    const rows = await q(sb.from('family_messages').select('id, body, signature, created_at, seen_at, from_id')
      .eq('student_id', kid.id).order('created_at', { ascending: false }).limit(5));
    fill(list, rows.length ? h('p', { class: 'label', style: 'margin-top: 6px' }, 'Son mesajlar') : null, rows.map((m) => h('div', { class: 'note small' },
      h('div', { class: 'spread' },
        h('span', { class: 'muted' }, new Date(m.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          + (m.signature ? ` · ${m.signature}` : '')),
        h('span', { class: 'tag ' + (m.seen_at ? 'green' : '') }, m.seen_at ? 'Okudu' : 'Henüz okumadı')),
      h('p', { style: 'margin-top: 4px; white-space: pre-wrap' }, m.body),
      !m.seen_at && m.from_id === state.profile.id ? h('button', { class: 'ghost small', onclick: async () => {
        try { await q(sb.from('family_messages').delete().eq('id', m.id)); } catch (e) { return toast('Geri alınamadı.'); }
        loadList();
      } }, 'Geri al') : null)));
  };

  const send = h('button', { class: 'primary block', onclick: async () => {
    const text = body.value.trim();
    if (!text) return toast('Önce bir mesaj yaz.');
    const targets = all?.checked ? [kid, ...others] : [kid];
    send.disabled = true;
    try {
      await q(sb.from('family_messages').insert(targets.map((s) => ({ student_id: s.id, from_id: state.profile.id, signature: signature.value.trim(), body: text }))));
    } catch (e) { send.disabled = false; return toast('Gönderilemedi, tekrar dene.'); }
    try { localStorage.setItem('defter.signature', signature.value.trim()); } catch (e) { /* önemli değil */ }
    send.disabled = false;
    body.value = '';
    toast(targets.length > 1 ? 'Hepsine gönderildi.' : 'Gönderildi.');
    loadList();
  } }, 'Gönder');

  loadList().catch(() => {});
  return h('section', { class: 'card stack', style: 'gap: 8px' },
    h('h2', {}, `${toName(kid.display_name)} mesaj bırak`),
    h('p', { class: 'small muted' }, 'Uygulamayı açınca ana sayfasında görür; "Okudum" deyince kapanır.'),
    body,
    h('div', { class: 'chips' },
      h('button', { class: 'chip', onclick: () => idea(SWEET_LINES) }, 'Tatlı bir söz'),
      h('button', { class: 'chip', onclick: () => idea(JOKES.map(([j, a]) => `${j} ${a}`)) }, 'Bir şaka')),
    h('label', { class: 'field' }, 'İmza', signature),
    all ? h('label', { class: 'row small', for: 'msg-all' }, all, 'Bütün çocuklara gönder') : null,
    send, list);
}

/* Öğrencinin "Soruda sorun var" bildirimleri: hangi soru, ne dedi (kendi açıklaması), kontrol sonucu.
   Bildirim yoksa kart görünmez. */
function reportedBox() {
  const box = h('section', { class: 'card stack', style: 'gap: 8px', hidden: true });
  (async () => {
    const rows = await q(sb.from('question_feedback').select('kind, note, status, verdict, response, created_at, questions(subject, stem, topics(name))')
      .eq('student_id', sid()).order('created_at', { ascending: false }).limit(10));
    if (!rows.length) return;
    const kindLabel = Object.fromEntries(FEEDBACK_KINDS);
    const verdictTag = (r) => r.status !== 'checked' ? h('span', { class: 'tag amber' }, 'Kontrol ediliyor')
      : r.verdict === 'soru_hatali' ? h('span', { class: 'tag green' }, 'Haklı çıktı')
      : r.verdict === 'soru_dogru' ? h('span', { class: 'tag' }, 'Soru doğruymuş') : h('span', { class: 'tag' }, 'Not alındı');
    fill(box,
      h('h2', {}, 'Bildirdiği sorular'),
      h('p', { class: 'small muted' }, '"Soruda sorun var" dediği sorular ve kendi açıklaması. Hatalı bulunan soru havuzdan çıkar ve ona sayılmaz.'),
      rows.map((r) => h('div', { class: 'stack', style: 'gap: 4px; padding: 8px 0; border-top: 1px solid var(--rule)' },
        h('div', { class: 'spread' },
          h('div', { class: 'row' }, r.questions?.subject ? subjTag(r.questions.subject) : null, h('span', { class: 'small' }, kindLabel[r.kind] || r.kind)),
          verdictTag(r)),
        r.questions?.stem ? h('p', { class: 'small muted' }, r.questions.stem.slice(0, 140) + (r.questions.stem.length > 140 ? '…' : '')) : null,
        r.note ? h('p', { class: 'small' }, h('b', {}, 'Açıklaması: '), r.note) : h('p', { class: 'small muted' }, 'Açıklama yazmamış.'),
        r.response ? h('div', { class: 'note teacher small' }, r.response) : null)));
    box.hidden = false;
  })().catch(() => {});
  return box;
}

/* "Şiiri sen tamamla" kartlarında çocuğun yazdığı son dizeler, altında şiirin aslı. Veli ve Türkçe öğretmeni
   görür (veritabanı da öyle izin verir). Hiç yoksa kart görünmez. */
function poemBox() {
  const box = h('section', { class: 'card stack', style: 'gap: 8px', hidden: true });
  (async () => {
    const rows = await q(sb.from('poem_lines').select('poem_key, line, result, created_at')
      .eq('student_id', sid()).order('created_at', { ascending: false }).limit(10));
    if (!rows.length) return;
    const byId = Object.fromEntries(POEMS.map((p) => [p.id, p]));
    const tag = { aynen: ['Aslını bildi', 'green'], kafiyeli: ['Kafiyeli', 'green'], kafiyesiz: ['Kafiyesiz', ''], serbest: ['Kendi sözü', ''] };
    fill(box,
      h('h2', {}, 'Tamamladığı şiirler'),
      h('p', { class: 'small muted' }, 'Son dizesi gizli şiirlere kendi yazdığı dizeler; altında şiirin aslı.'),
      rows.map((r) => {
        const p = byId[r.poem_key];
        const [label, color] = tag[r.result] || [r.result, ''];
        return h('div', { class: 'stack', style: 'gap: 4px; padding: 8px 0; border-top: 1px solid var(--rule)' },
          h('div', { class: 'spread' },
            h('span', { class: 'small muted' }, new Date(r.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
              + (p ? ` · ${p.by}` : '')),
            h('span', { class: 'tag ' + color }, label)),
          p ? h('p', { class: 'small muted', style: 'white-space: pre-line; font-style: italic' }, p.show.join('\n')) : null,
          h('p', {}, h('b', {}, 'Onun dizesi: '), r.line),
          p ? h('p', { class: 'small' }, h('b', {}, 'Aslı: '), p.hide.join(' ')) : null);
      }));
    box.hidden = false;
  })().catch(() => {});
  return box;
}

// Rapordaki özet kartı (öğrenci ana sayfasında hata tekrarı kartının altında tek satır); liste ayrı sayfada açılır.
function togetherBox(rows) {
  if (!rows.length) return null;
  const n = (k) => rows.filter((r) => togetherKind(r) === k).length;
  const parts = [
    n('help') ? `${n('help')} soruyu "birlikte bakalım" deyip boş geçti` : null,
    n('notUnderstood') ? `${n('notUnderstood')} yanlıştan sonra "anlamadım" dedi` : null,
    n('guess') ? `${n('guess')} soruyu tahmin etti` : null,
  ].filter(Boolean).join(', ');
  return h('section', { class: 'card', style: 'border-color: var(--amber)' },
    h('h2', {}, `Birlikte bakılacak ${rows.length} soru`),
    isParentView()
      ? [h('p', {}, parts + '.'), h('p', { class: 'small muted' }, 'Bu sorulara biriyle birlikte bakması, iyice anlaması gerekiyor.')]
      : h('p', { class: 'small muted' }, 'Anlamadığın ya da tahmin ettiğin sorular. Velin ya da öğretmeninle birlikte üstünden geçin.'),
    h('button', { class: 'primary block', onclick: () => go('together') }, 'Soruları aç'));
}

async function viewTogether() {
  loading();
  const rows = await loadTogether();
  // Veli ve öğretmen işaretler (öğretmen sadece kendi derslerini görür ve işaretler); öğrenci işaretlemez.
  const canMark = state.profile.role !== 'student';
  const name = state.student?.display_name || 'Öğrenci';
  const trackName = { mistake: 'Hata tekrarı', topic: 'Konu tekrarı', extra: 'Ek çalışma' };
  render(
    h('header', { class: 'stack', style: 'gap: 6px' },
      h('h1', {}, 'Birlikte bakılacaklar'),
      h('p', { class: 'muted' }, isParentView()
        ? `${name} bu soruları anlamadığını söyledi ya da tahmin etti. Yanına oturup birlikte çözün, iyice anladığından emin olun.` +
          ' Baktığınız soruyu "Birlikte baktık" ile listeden çıkarın.'
        : 'Anlamadığın ya da tahmin ettiğin sorular. Velin ya da öğretmeninle birlikte üstünden geçin.')),
    rows.length ? rows.map((r) => {
      const when = h('p', { class: 'small muted' }, [trackName[r.track],
        new Date(r.answered_at).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '));
      const card = togetherCard(r.questions || {}, { answer: r.answer, correct: r.correct, kind: togetherKind(r), topic: r.questions?.topics?.name }, when);
      if (canMark) {
        const btn = h('button', { class: 'block', onclick: async () => {
          btn.disabled = true;
          try { await q(sb.rpc('mark_together', { rid: r.id })); }
          catch (e) { btn.disabled = false; return toast('Kaydedilemedi, tekrar dene.'); }
          card.remove();
          toast('Listeden çıkarıldı.');
        } }, 'Birlikte baktık');
        card.append(btn);
      }
      return card;
    }) : h('div', { class: 'card flat' }, h('p', { class: 'muted' }, 'Şu an birlikte bakılacak soru yok.')));
}

// ---------------------------------------------------------------- öğrenci: nedenler

async function viewReasons() {
  loading();
  const rows = await q(sb.from('exam_questions')
    .select('*, topics(name), exams(name), questions!exam_questions_question_id_fkey(stem, choices, image_path)')
    .eq('student_id', sid()).neq('outcome', 'dogru').is('student_reason', null).not('diagnosis_cause', 'is', null)
    .order('exam_id').order('subject').order('q_no'));
  // Bitince açıldığı sayfaya geri dönülür (geri tuşunda bu sayfa tekrar açılıp kendini kapatmasın).
  if (!rows.length) return goBack();
  let i = 0;

  const show = () => {
    if (i >= rows.length) { toast('Hepsi tamam.'); return goBack(); }
    const r = rows[i];
    let reason = null, confident = null;
    const saveBtn = h('button', { class: 'primary block', disabled: true, onclick: save }, 'Kaydet ve yorumu gör');
    const update = () => { saveBtn.disabled = !reason || (r.outcome === 'yanlis' && confident === null); };
    const reasonChips = REASONS
      .filter(([k]) => r.outcome === 'yanlis' ? k !== 'hic_bakmadim' : true)
      .map(([k, label]) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
        reason = k;
        reasonChips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
        update();
      } }, label));
    const confChips = [[true, 'Evet, emindim'], [false, 'Hayır']].map(([v, label]) =>
      h('button', { class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
        confident = v;
        confChips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
        update();
      } }, label));
    const reveal = h('div', { class: 'stack', hidden: true });

    async function save() {
      saveBtn.disabled = true;
      try {
        await q(sb.from('exam_questions').update({
          student_reason: reason, student_confident: confident, reason_at: new Date().toISOString(),
        }).eq('id', r.id));
      } catch (e) { saveBtn.disabled = false; return toast('Kaydedilemedi, tekrar dene.'); }
      saveBtn.remove();
      const same = REASON_GROUP[reason] === CAUSE_GROUP[r.diagnosis_cause];
      fill(reveal,
        h('p', { class: 'label' }, 'Benim yorumum'),
        h('div', { class: 'note teacher' },
          h('p', {}, h('b', {}, CAUSE_LABEL[r.diagnosis_cause] || r.diagnosis_cause), same ? ' · Senin seçiminle aynı.' : ' · Senin seçiminden farklı.'),
          r.diagnosis_text ? h('p', { style: 'margin-top: 8px' }, r.diagnosis_text) : null,
          r.misconception ? h('p', { style: 'margin-top: 8px' }, h('b', {}, 'Dikkat: '), r.misconception) : null),
        r.solution ? h('details', {}, h('summary', {}, 'Çözümü göster'), h('div', { class: 'note', style: 'margin-top: 8px' }, r.solution)) : null,
        h('button', { class: 'primary block', onclick: () => { i++; show(); } }, i + 1 < rows.length ? 'Sonraki' : 'Bitir'));
      reveal.hidden = false;
    }

    render(
      h('p', { class: 'small muted num', style: 'text-align: right' }, `${i + 1} / ${rows.length}`),
      h('section', { class: 'card' },
        h('div', { class: 'row' }, subjTag(r.subject), h('span', { class: 'small muted' }, `${r.exams?.name || ''} · ${r.q_no}. soru`)),
        examQuestionContent(r),
        h('p', { class: 'small' }, r.outcome === 'bos' ? 'Bu soruyu boş bıraktın.' :
          `Senin cevabın ${r.student_answer || '?'}, doğrusu ${r.correct_answer || '?'}.`),
        r.topics?.name ? h('p', { class: 'small muted' }, 'Konu: ' + r.topics.name) : null),
      h('section', { class: 'stack' },
        h('h2', {}, r.outcome === 'bos' ? 'Neden boş bıraktın?' : 'Neden yanlış oldu?'),
        h('div', { class: 'chips' }, reasonChips)),
      r.outcome === 'yanlis' ? h('section', { class: 'stack' },
        h('h3', {}, 'İşaretlerken emin miydin?'),
        h('div', { class: 'chips' }, confChips)) : null,
      saveBtn,
      reveal);
  };
  show();
}

// ---------------------------------------------------------------- yükleme (deneme / kitap)

async function compressImage(file, maxSide = 2000, quality = 0.82) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const src = bitmap || await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
  const w = src.width, hgt = src.height;
  const scale = Math.min(1, maxSide / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

function photoPicker(title, hint, role, list, onChange) {
  const grid = h('div', { class: 'thumbs' });
  const draw = () => {
    grid.replaceChildren(...list.filter((p) => p.role === role).map((p, idx) =>
      h('div', { class: 'thumb' },
        h('img', { src: p.preview, alt: `${title} ${idx + 1}` }),
        h('span', { class: 'n' }, idx + 1),
        h('button', { 'aria-label': 'Kaldır', onclick: () => { list.splice(list.indexOf(p), 1); draw(); onChange(); } }, '✕'))));
  };
  const add = (files) => {
    for (const f of files) list.push({ role, file: f, preview: URL.createObjectURL(f) });
    draw(); onChange();
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', onchange: (e) => { add(e.target.files); e.target.value = ''; } });
  const lib = h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => { add(e.target.files); e.target.value = ''; } });
  // Panodan yapıştırma: düğmeyle (iPhone'da Safari "Yapıştır" onayı ister) ya da bilgisayarda Ctrl+V ile.
  const paste = async () => {
    activePicker = add;
    try {
      const files = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) files.push(new File([await item.getType(type)], `pano-${Date.now()}.${type.split('/')[1]}`, { type }));
      }
      if (files.length) { add(files); toast(`${files.length} resim yapıştırıldı.`); }
      else toast('Panoda resim yok. Önce bir resmi kopyala.');
    } catch (e) {
      toast('Tarayıcı panoya izin vermedi. Bilgisayarda Ctrl+V ile yapıştırabilirsin.');
    }
  };
  draw();
  const card = h('section', { class: 'card', onfocusin: () => { activePicker = add; }, onclick: () => { activePicker = add; } },
    h('h3', {}, title),
    hint ? h('p', { class: 'small muted' }, hint) : null,
    grid,
    h('div', { class: 'row' },
      h('button', { style: 'flex: 1', onclick: () => cam.click() }, 'Fotoğraf çek'),
      h('button', { style: 'flex: 1', onclick: () => lib.click() }, 'Galeriden seç'),
      h('button', { style: 'flex: 1', onclick: paste }, 'Yapıştır')),
    cam, lib);
  if (!activePicker) activePicker = add;
  return card;
}

// Ctrl+V ile yapıştırılan resimler en son dokunulan fotoğraf bölümüne eklenir.
let activePicker = null;
document.addEventListener('paste', (e) => {
  if (!activePicker || !document.querySelector('.thumbs')) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  activePicker(files);
  toast(`${files.length} resim yapıştırıldı.`);
});

async function viewUpload(kind) {
  loading();
  activePicker = null;
  const exams = kind === 'deneme' ? await q(sb.from('exams').select('*').eq('student_id', sid()).order('exam_date', { ascending: false })) : [];
  const photos = [];
  let timeNote = null, sent = false;
  leaveGuard = () => photos.length > 0 && !sent;

  const examSel = h('select', { id: 'exam' },
    h('option', { value: '' }, exams.length ? 'Deneme seç' : 'Henüz deneme yok'),
    exams.map((e) => h('option', { value: e.id }, `${e.name} · ${fmtDate(e.exam_date)}`)),
    h('option', { value: '__new' }, '+ Yeni deneme ekle'));
  const newName = h('input', { id: 'exam-name', placeholder: 'Örn. Hız Yayınları 3. Deneme' });
  const newDate = h('input', { id: 'exam-date', type: 'date', value: localDate() });
  const newKind = h('select', { id: 'exam-kind' }, EXAM_KINDS.map(([v, l]) => h('option', { value: v }, l)));
  const newBox = h('div', { class: 'stack', hidden: true },
    h('label', { class: 'field' }, 'Denemenin adı', newName),
    h('div', { class: 'row' },
      h('label', { class: 'field', style: 'flex: 1' }, 'Tarih', newDate),
      h('label', { class: 'field', style: 'flex: 1' }, 'Tür', newKind)));
  examSel.addEventListener('change', () => { newBox.hidden = examSel.value !== '__new'; refresh(); });
  newName.addEventListener('input', refresh);

  const timeChips = TIME_NOTES.map((t) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
    timeNote = t;
    timeChips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
  } }, t));
  const noteInput = h('textarea', { id: 'book-note', rows: 2, placeholder: kind === 'soru'
    ? 'Örn. 1. soru: B ile C arasında kaldım, B\'yi işaretledim. Hangi test ya da kitap? (isteğe bağlı)' : 'Hangi kitap, hangi konu? (isteğe bağlı)' });

  const status = h('p', { class: 'small muted', hidden: true });
  const sendBtn = h('button', { class: 'primary block', disabled: true, onclick: send }, 'Gönder');
  // Gönder neden kapalı ya da neye dikkat edilmeli: düğmenin hemen altında söylenir.
  const missingNote = h('p', { class: 'small muted' });

  function refresh() {
    if (kind !== 'deneme') {
      sendBtn.disabled = !photos.length;
      missingNote.textContent = photos.length ? '' : kind === 'soru' ? 'Göndermek için en az bir soru fotoğrafı ekle.' : 'Göndermek için en az bir sayfa ekle.';
      return;
    }
    const examOk = examSel.value && (examSel.value !== '__new' || newName.value.trim());
    const hasBook = photos.some((p) => p.role === 'kitapcik');
    const missing = [];
    if (!examSel.value) missing.push('hangi deneme olduğunu seç');
    else if (examSel.value === '__new' && !newName.value.trim()) missing.push('denemenin adını yaz');
    if (!hasBook) missing.push('kitapçık sayfalarını ekle');
    sendBtn.disabled = !(examOk && hasBook);
    missingNote.className = missing.length ? 'small muted' : 'small';
    missingNote.textContent = missing.length ? 'Göndermek için: ' + missing.join(', ') + '.' : '';
  }

  async function send() {
    sendBtn.disabled = true;
    status.hidden = false;
    try {
      let examId = null;
      if (kind === 'deneme') {
        examId = examSel.value;
        if (examId === '__new') {
          const ex = await q(sb.from('exams').insert({ student_id: sid(), name: newName.value.trim(), exam_date: newDate.value, kind: newKind.value, time_note: timeNote }).select().single());
          examId = ex.id;
        } else if (timeNote) {
          await q(sb.from('exams').update({ time_note: timeNote }).eq('id', examId));
        }
      }
      // Deneme ve gönderilen sorular öğrenciye aittir; kitap sayfaları herkesin kullandığı ortak havuza gider.
      const own = kind !== 'kitap';
      const sub = await q(sb.from('submissions').insert({
        kind, exam_id: examId, student_id: own ? sid() : null, uploaded_by: state.user.id,
        note: kind !== 'deneme' ? noteInput.value.trim() || null : null,
      }).select().single());
      const folder = own ? `${sid()}/${sub.id}` : `books/${sub.id}`;
      const order = { kitapcik: 0, cevap_anahtari: 1, optik: 2, kitap_sayfa: 0, yapamadim: 0, begendim: 1 };
      const sorted = [...photos].sort((a, b) => order[a.role] - order[b.role]);
      let n = 0;
      for (const p of sorted) {
        n++;
        status.textContent = `Fotoğraflar yükleniyor: ${n} / ${sorted.length}`;
        const blob = await compressImage(p.file);
        const path = `${folder}/${String(n).padStart(3, '0')}-${p.role}.jpg`;
        const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        await q(sb.from('submission_photos').insert({ submission_id: sub.id, storage_path: path, photo_role: p.role, sort: n }));
      }
      await q(sb.from('submissions').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', sub.id));
      sent = true;
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      render(h('section', { class: 'card', style: 'margin-top: 10vh; text-align: center' },
        h('h2', {}, kind === 'kitap' ? 'Sayfaları aldım' : 'Sorularını aldım'),
        h('p', { class: 'muted' }, kind === 'kitap'
          ? 'Bir saat içinde soruları ayırıp soru havuzuna ekleyeceğim.'
          : kind === 'soru'
            ? 'Bir saat içinde çözümlerini yazacağım; Yükle sekmesinde "Gönderdiğin sorular" altında göreceksin. Yapamadıkların yarından itibaren benzerleriyle hata tekrarında gelecek.'
            : 'Bir saat içinde işleyeceğim. Yanlışlarının nedenini seçme görevi ana sayfaya düşecek, ilk tekrarları yarın gelecek.'),
        // Açıldığı sayfaya döner (öğrenci Yükle sekmesine, veli rapora ya da Deneme'ye).
        h('button', { class: 'primary block', onclick: goBack }, 'Tamam')));
    } catch (e) {
      console.error(e);
      status.innerHTML = '';
      status.append(h('span', { class: 'error' }, 'Yükleme yarım kaldı: ' + (e.message || e) + '. İnternetini kontrol edip tekrar gönder.'));
      sendBtn.disabled = false;
    }
  }

  if (kind === 'soru') {
    render(
      h('header', { class: 'stack', style: 'gap: 4px' },
        h('p', { class: 'label' }, 'Soru ekle'), h('h1', {}, 'Soru gönder'),
        h('p', { class: 'muted' }, 'Her fotoğrafta bir soru olsun; şıkları ve kâğıda yazdıkların da görünsün. İstersen yapamadıklarını ve beğendiklerini birlikte gönder.')),
      // Takıldığı yer, arasında kaldığı şıklar ve işaretlediği şık kâğıtta kalemle ya da Not kısmında numarasıyla gelir;
      // saatlik görev okur (INSTRUCTIONS 1e). Her soruya ayrı alan yok: 10 soru gönderirken zorlanmasın.
      h('p', { class: 'note', style: 'border-left: 4px solid var(--amber)' },
        '✏️ Yapamadığın her soruda nerede takıldığını, hangi şıklar arasında kaldığını ve hangisini işaretlediğini yaz: ' +
        'fotoğrafı çekmeden önce kâğıdın üstüne kalemle ya da aşağıdaki Not kısmına numarasıyla (1. soru: …).'),
      photoPicker('Yapamadığım sorular', 'Çözümünü takıldığın yerden anlatırım; benzerleri hata tekrarında gelir.', 'yapamadim', photos, refresh),
      photoPicker('Beğendiğim sorular', 'Bu tarzda yeni sorular yazarım.', 'begendim', photos, refresh),
      h('section', { class: 'card' }, h('label', { class: 'field' }, 'Not', noteInput)),
      sendBtn, missingNote, status);
    refresh();
    return;
  }
  if (kind === 'kitap') {
    render(
      h('header', { class: 'stack', style: 'gap: 4px' },
        h('p', { class: 'label' }, 'Soru havuzu'), h('h1', {}, 'Kitap sayfası ekle'),
        h('p', { class: 'muted' }, 'Soru bankasından sayfa fotoğrafları. Cevap anahtarı ayrı sayfadaysa onu da çek.')),
      photoPicker('Sayfalar', 'Her sayfa düz ve net olsun, gölge düşmesin.', 'kitap_sayfa', photos, refresh),
      h('section', { class: 'card' }, h('label', { class: 'field' }, 'Not', noteInput)),
      sendBtn, missingNote, status);
    refresh();
    return;
  }

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Deneme yükle'),
      h('h1', {}, state.profile.role === 'parent' ? `${state.student.display_name} için deneme gönder` : 'Denemeni gönder'),
      h('p', { class: 'muted' }, 'Kitapçığın tamamı ve varsa optik formun. Cevap anahtarı gerekmiyor, soruları ben çözüyorum.')),
    h('section', { class: 'card' }, h('label', { class: 'field' }, 'Hangi deneme?', examSel), newBox),
    photoPicker('1. Kitapçık sayfaları', 'Tüm sayfalar, sırayla. Karalamaların görünsün; T ve yuvarlak işaretlerin de.', 'kitapcik', photos, refresh),
    photoPicker('2. Optik form (varsa)', null, 'optik', photos, refresh),
    h('section', { class: 'card' }, h('h3', {}, 'Süre yetti mi?'), h('div', { class: 'chips' }, timeChips)),
    sendBtn, missingNote, status,
    state.profile.role === 'parent' ? h('div', { class: 'card flat' },
      h('p', { class: 'small muted' }, 'Soru bankasından sayfa eklemek ister misiniz? Bu sayfalar bütün çocukların ortak soru havuzuna gider.'),
      h('button', { class: 'block', onclick: () => go('book') }, 'Kitap sayfası ekle')) : null);
  refresh();
}

// ---------------------------------------------------------------- öğrenci: uygulama içi deneme

/* Uygulamada süreli deneme. Gerçek LGS kitapçıkları (MEB, exam_only, orijinal sırasıyla) ya da havuzdan,
   LGS'deki konu dağılımına göre karma deneme. Süre LGS'deki gibi (soru başına SUBJECTS.sec: sözel 50 soru
   75 dk, sayısal 40 soru 80 dk). Doğru/yanlış deneme bitince görünür. Sonuç kâğıt denemeler gibi exams /
   exam_results / exam_questions'a yazılır; yanlış ve boşlar hata tekrarına girer, çözülen sorular bir
   daha günlük tekrarda gelmez. Yarım kalan deneme telefonda saklanır; süre kapalıyken de işler. */
const SECTION_SUBJECTS = { sozel: ['turkce', 'inkilap', 'din', 'ingilizce'], sayisal: ['matematik', 'fen'] };
const SECTION_COUNTS = { turkce: 20, inkilap: 10, din: 10, ingilizce: 10, matematik: 20, fen: 20 };
const SECTION_NAMES = { sozel: 'Sözel', sayisal: 'Sayısal' };
const BOOKLETS = [
  ['lgs-2026-sozel-a', 'LGS 2026 · Sözel', 'sozel', 50], ['lgs-2026-sayisal-a', 'LGS 2026 · Sayısal', 'sayisal', 40],
  ['lgs-2025-sozel-a', 'LGS 2025 · Sözel', 'sozel', 50], ['lgs-2025-sayisal-a', 'LGS 2025 · Sayısal', 'sayisal', 40],
  ['lgs-2024-sozel', 'LGS 2024 · Sözel', 'sozel', 50], ['lgs-2024-sayisal', 'LGS 2024 · Sayısal', 'sayisal', 40],
];
const examKey = () => `defter.exam.${sid()}`;
function savedExam() {
  try { const e = JSON.parse(localStorage.getItem(examKey()) || 'null'); return e && e.studentId === sid() ? e : null; } catch (err) { return null; }
}
function storeExam(e) { try { localStorage.setItem(examKey(), JSON.stringify(e)); } catch (err) { /* depolama kapalı: deneme yine sürer */ } }
function dropExam() { try { localStorage.removeItem(examKey()); } catch (err) { /* önemli değil */ } }
const fmtNet = (n) => n.toFixed(2).replace('.', ',');
// Deneme sorusunun içeriği: kâğıt denemede kırpılmış fotoğraf, uygulama içi denemede havuzdaki soru (şıklar işaretli).
function examQuestionContent(r) {
  if (r.image_path) return lazyImg('photos', r.image_path);
  const qn = r.questions;
  if (!qn) return null;
  return [qn.image_path ? lazyImg('questions', qn.image_path) : null,
    qn.stem ? h('p', { class: 'stem small' }, qn.stem) : null,
    h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => qn.choices?.[k] !== undefined).map((k) =>
      h('div', { class: 'opt small' + (k === r.correct_answer ? ' right' : k === r.student_answer ? ' wrong' : '') },
        h('b', {}, k), h('span', {}, qn.choices[k]))))];
}
const examNet = (rs) => rs.reduce((s, r) => s + r.correct - r.wrong / 3, 0);

async function viewExamHub() {
  loading();
  const lgs = isLgsStudent(state.student);
  const [bookletRows, openTopics, past] = await Promise.all([
    lgs ? q(sb.from('questions').select('booklet, topic_id').in('booklet', BOOKLETS.map((b) => b[0])).eq('active', true)) : [],
    lgs ? q(sb.from('topic_status').select('topic_id').eq('student_id', sid()).in('status', ['active', 'gap'])) : [],
    q(sb.from('exams').select('id, name, booklet, exam_date, time_note, exam_results(correct, wrong, blank)')
      .eq('student_id', sid()).eq('kind', 'uygulama').order('created_at', { ascending: false }).limit(12)),
  ]);
  // Gerçek LGS bütün yılın konularını kapsar: kitapçık, bütün soruları gelip hepsinin konusu işlenince açılır.
  const open = new Set(openTopics.map((t) => t.topic_id));
  const count = {}, untaught = {};
  bookletRows.forEach((r) => {
    count[r.booklet] = (count[r.booklet] || 0) + 1;
    if (r.topic_id && !open.has(r.topic_id)) untaught[r.booklet] = (untaught[r.booklet] || 0) + 1;
  });
  const booklets = BOOKLETS.filter(([id, , , n]) => (count[id] || 0) >= n && !untaught[id]);
  const resume = savedExam();
  const minutes = (subjects, n) => Math.round(subjects.reduce((s, x) => s + SECTION_COUNTS[x] * maxSeconds(x), 0) / 60);

  const bookletCard = ([id, title, section, n]) => {
    const last = past.find((p) => p.booklet === id);
    return h('div', { class: 'card stack', style: 'gap: 6px' },
      h('div', { class: 'spread' }, h('b', {}, title),
        h('span', { class: 'small muted num' }, `${n} soru · ${minutes(SECTION_SUBJECTS[section])} dk`)),
      last ? h('p', { class: 'small muted' }, `Daha önce çözdün: net ${fmtNet(examNet(last.exam_results || []))} (${fmtDate(last.exam_date)})`) : null,
      h('button', { class: last ? 'block' : 'primary block', onclick: () => startBookletExam(id, title, section) }, last ? 'Yeniden çöz' : 'Başla'));
  };

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Deneme'),
      h('h1', {}, 'Deneme çöz'),
      h('p', { class: 'muted' }, lgs ? 'Gerçek sınav gibi: süre işler, doğru cevaplar sonunda görünür.' : 'Süreli bir deneme: doğru cevaplar sonunda görünür.')),
    resume ? h('section', { class: 'card', style: 'border-color: var(--amber)' },
      h('p', { class: 'label' }, 'Yarım kalan deneme'),
      h('h2', {}, resume.title),
      h('p', { class: 'small muted' }, resume.endsAt > Date.now()
        ? `Kalan süre ${fmtDuration(Math.round((resume.endsAt - Date.now()) / 1000))} · ${Object.keys(resume.answers).length}/${resume.questions.length} cevaplandı`
        : 'Süresi doldu; açınca sonuç hesaplanır.'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', style: 'flex: 1', onclick: () => showExam(resume) }, resume.endsAt > Date.now() ? 'Devam et' : 'Sonucu gör'),
        h('button', { class: 'ghost', onclick: () => { if (confirm('Bu deneme silinsin mi? Cevapların kaydedilmez.')) { dropExam(); viewExamHub(); } } }, 'Bırak'))) : null,
    booklets.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Gerçek LGS soruları'),
      h('p', { class: 'small muted' }, 'Son üç yılın LGS soruları, sınavdaki sırasıyla ve süresiyle. Bu sorular günlük tekrarda hiç gelmez.'),
      booklets.map(bookletCard),
      booklets.length < BOOKLETS.length ? h('p', { class: 'small muted' }, 'Diğer kitapçıklar, konuları okulda işlenince burada açılır.') : null) : null,
    h('section', { class: 'stack' },
      h('h2', {}, 'Karma deneme'),
      h('p', { class: 'small muted' }, lgs
        ? 'İşlediğin konulardan, daha önce görmediğin sorularla; her başlayışta yeni bir deneme. Konular LGS\'de çıkma sıklığına göre seçilir.'
        : 'İşlediğin konulardan, daha önce görmediğin 30 soru.'),
      lgs ? ['sozel', 'sayisal'].map((section) => h('div', { class: 'card stack', style: 'gap: 6px' },
        h('div', { class: 'spread' }, h('b', {}, `Karma · ${SECTION_NAMES[section]}`),
          h('span', { class: 'small muted num' }, `${SECTION_SUBJECTS[section].reduce((s, x) => s + SECTION_COUNTS[x], 0)} soru · ${minutes(SECTION_SUBJECTS[section])} dk`)),
        h('button', { class: 'block', onclick: () => startMixedExam(section) }, 'Başla')))
        : h('div', { class: 'card stack', style: 'gap: 6px' },
          h('div', { class: 'spread' }, h('b', {}, 'Karma deneme'), h('span', { class: 'small muted num' }, '30 soru')),
          h('button', { class: 'block', onclick: () => startMixedExam(null) }, 'Başla')),
      lgs && !booklets.length ? h('p', { class: 'small muted' }, 'Gerçek LGS soruları bütün yılın konularını kapsadığı için konular okulda işlenince açılacak.') : null),
    past.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Çözdüğün denemeler'),
      past.map((p) => h('div', { class: 'card flat spread', style: 'padding: 12px' },
        h('div', {}, h('div', {}, p.name), h('div', { class: 'small muted' }, `${fmtDate(p.exam_date)}${p.time_note ? ' · ' + p.time_note : ''}`)),
        h('b', { class: 'num' }, `net ${fmtNet(examNet(p.exam_results || []))}`)))) : null,
    // Kâğıt deneme yükleme Yükle sekmesinde; buradan da bir dokunuşla gidilir.
    h('p', { class: 'small muted', style: 'text-align: center' }, 'Kâğıt üzerinde bir deneme mi çözdün? ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); go('send'); } }, 'Yükle sekmesinden gönder.')));
}

// Yüklemenin listede görünen adı.
const subLabel = (s) => s.exams?.name || { kitap: 'Kitap sayfaları', soru: 'Gönderilen sorular' }[s.kind] || 'Yükleme';

/* Öğrencinin Yükle sekmesi: tek tek soru gönderme (testte yapamadığı ya da beğendiği sorular) ve kâğıt deneme.
   Altta gönderdiği soruların çözümleri (görev işledikten sonra) ve son yüklemelerin durumu. */
async function viewSend() {
  loading();
  const subs = await q(sb.from('submissions').select('id, kind, status, submitted_at, result_note, exams(name)')
    .eq('student_id', sid()).neq('status', 'draft').order('created_at', { ascending: false }).limit(8));
  const done = subs.filter((s) => s.kind === 'soru' && s.status === 'done').map((s) => s.id);
  const added = done.length ? await q(sb.from('questions')
    .select('id, subject, stem, image_path, choices, answer, hint, solution, source_note, submission_id, topics(name)')
    .in('submission_id', done).order('created_at', { ascending: false }).limit(12)) : [];

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Yükle'),
      h('h1', {}, 'Fotoğrafla gönder'),
      h('p', { class: 'muted' }, 'Tek tek sorular ya da kâğıt üzerinde çözdüğün bir deneme.')),
    h('section', { class: 'card stack', style: 'gap: 8px' },
      h('h2', {}, 'Soru ekle'),
      h('p', { class: 'small muted' }, 'Testte yapamadığın ya da çok beğendiğin bir soru mu var? Fotoğrafını çek, gönder. ' +
        'Bir saat içinde çözümünü yazarım; yapamadıkların benzerleriyle hata tekrarına girer, beğendiklerinin benzerleri de gelir.'),
      h('button', { class: 'primary block', onclick: () => go('ask') }, 'Soru ekle')),
    h('section', { class: 'card stack', style: 'gap: 8px' },
      h('h2', {}, 'Kâğıt deneme'),
      h('p', { class: 'small muted' }, 'Kâğıt üzerinde bir deneme mi çözdün? Fotoğraflarını gönder, ben notlandırayım.'),
      h('button', { class: 'block', onclick: () => go('paper') }, 'Kâğıt denemeyi yükle')),
    added.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Gönderdiğin sorular'),
      added.map((x) => h('div', { class: 'card stack', style: 'gap: 8px' },
        h('div', { class: 'row' }, subjTag(x.subject), h('span', { class: 'small muted' }, x.topics?.name || ''),
          /beğen/i.test(x.source_note || '') ? h('span', { class: 'tag green' }, 'Beğendin') : h('span', { class: 'tag amber' }, 'Yapamamıştın')),
        x.image_path ? lazyImg('questions', x.image_path) : null,
        x.stem ? h('p', { class: 'stem small' }, x.stem) : null,
        h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => x.choices?.[k] !== undefined).map((k) =>
          h('div', { class: 'opt small' }, h('b', {}, k), h('span', {}, x.choices[k])))),
        h('details', {}, h('summary', {}, 'Çözümü gör'),
          h('div', { class: 'note', style: 'margin-top: 8px' },
            h('p', {}, h('b', {}, `Doğru cevap: ${x.answer}`)),
            x.hint ? h('p', { class: 'small', style: 'margin-top: 6px' }, h('b', {}, 'İpucu: '), x.hint) : null,
            x.solution ? h('p', { style: 'margin-top: 6px' }, x.solution) : null))))) : null,
    subs.length ? h('section', { class: 'card flat stack', style: 'gap: 6px' },
      h('p', { class: 'label' }, 'Son yüklemeler'),
      subs.map((s) => h('div', { class: 'stack', style: 'gap: 2px; padding-top: 6px; border-top: 1px solid var(--rule)' },
        h('div', { class: 'spread' }, h('span', {}, subLabel(s)), statusTag(s.status)),
        s.result_note && s.status !== 'submitted' ? h('p', { class: 'small muted' }, s.result_note) : null))) : null);
}

async function startBookletExam(id, title, section) {
  if (savedExam() && !confirm('Yarım kalan bir denemen var; yenisine başlarsan o silinir. Başlansın mı?')) return;
  const qs = await q(sb.from('questions').select('id, subject, topic_id, styles, stem, image_path, choices, answer, hint, solution, booklet_no')
    .eq('booklet', id).eq('active', true).order('booklet_no'));
  beginExam({ id, booklet: id, title, section, questions: qs });
}

// Karma deneme: LGS bölümünün ders ve soru sayıları (ilkokulda 30 soru, günlük plan ağırlığıyla); her derste
// konular LGS sıklığına göre ağırlıklı seçilir, aynı konudan art arda gelme ihtimali azalır.
async function startMixedExam(section) {
  if (savedExam() && !confirm('Yarım kalan bir denemen var; yenisine başlarsan o silinir. Başlansın mı?')) return;
  loading('Deneme hazırlanıyor…');
  const counts = section ? SECTION_COUNTS : dailyPlan({ ...state.student, daily_questions: 30, daily_by_subject: null });
  const subjects = section ? SECTION_SUBJECTS[section] : studentSubjects(state.student);
  const statuses = await q(sb.from('topic_status').select('topic_id').eq('student_id', sid()).in('status', ['active', 'gap']));
  const topicIds = statuses.map((s) => s.topic_id);
  const [topics, pool, seenRows, reserved] = await Promise.all([
    q(sb.from('topics').select('id, subject, sort, lgs_avg').in('id', topicIds.length ? topicIds : ['-'])),
    q(sb.from('questions').select('id, subject, topic_id, styles, stem, image_path, choices, answer, hint, solution, variant_of, variant_of_exam')
      .in('topic_id', topicIds.length ? topicIds : ['-']).eq('active', true).eq('exam_only', false)),
    q(sb.from('reviews').select('question_id').eq('student_id', sid())),
    reservedVariants(),
  ]);
  const seen = new Set(seenRows.map((r) => r.question_id));
  const byTopic = Object.fromEntries(topics.map((t) => [t.id, t]));
  const pickWeighted = (list) => {
    let r = Math.random() * list.reduce((s, x) => s + x.w, 0);
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
  };
  const chosen = [];
  for (const subject of subjects) {
    const buckets = topics.filter((t) => t.subject === subject).map((t) => ({
      t, w: Math.max(0.2, t.lgs_avg == null ? 1 : +t.lgs_avg),
      cands: shuffle(pool.filter((p) => p.topic_id === t.id && !seen.has(p.id) && !isVariantOf(p, reserved))),
    }));
    for (let i = 0; i < (counts[subject] || 0); i++) {
      const open = buckets.filter((b) => b.cands.length);
      if (!open.length) break;
      const b = pickWeighted(open);
      chosen.push(b.cands.shift());
      b.w *= 0.6;
    }
  }
  if (chosen.length < 10) { toast('Bu deneme için henüz yeterli soru yok; biraz sonra tekrar dene.'); return viewExamHub(); }
  const order = section ? SECTION_SUBJECTS[section] : subjects;
  chosen.sort((a, b) => (order.indexOf(a.subject) - order.indexOf(b.subject)) || ((byTopic[a.topic_id]?.sort ?? 0) - (byTopic[b.topic_id]?.sort ?? 0)));
  const title = section ? `Karma deneme · ${SECTION_NAMES[section]}` : 'Karma deneme';
  beginExam({ id: section ? `karma-${section}` : 'karma', booklet: null, title, section, questions: chosen });
}

function beginExam({ id, booklet, title, section, questions }) {
  if (!questions.length) { toast('Bu deneme için soru bulunamadı.'); return viewExamHub(); }
  const seconds = questions.reduce((s, x) => s + maxSeconds(x.subject), 0);
  const exam = { id, booklet, title, section, questions, answers: {}, marks: {}, times: {}, current: 0,
    startedAt: Date.now(), endsAt: Date.now() + seconds * 1000, studentId: sid() };
  storeExam(exam);
  showExam(exam);
}

function showExam(exam) {
  state.exam = exam;
  clearInterval(state.examTimer);
  if (history.state?.overlay !== 'exam') pushOverlay('exam'); // geri tuşu önce sorar; sonuçtan tek geri Deneme'ye
  if (Date.now() >= exam.endsAt) return finishExam(exam, 'Süre doldu');
  const total = exam.questions.length;
  let shownAt = Date.now();
  const spend = () => {
    const qid = exam.questions[exam.current].id;
    exam.times[qid] = (exam.times[qid] || 0) + (Date.now() - shownAt) / 1000;
    shownAt = Date.now();
  };
  // Geri tuşuyla çıkılırsa "Ara ver" düğmesi gibi: o sorunun süresi yazılır, deneme telefonda saklanır.
  state.leaveOverlay = () => { spend(); storeExam(exam); };
  const timer = h('span', { class: 'timer num' });
  const tick = () => {
    const left = Math.round((exam.endsAt - Date.now()) / 1000);
    if (left <= 0) { spend(); return finishExam(exam, 'Süre doldu'); }
    timer.textContent = fmtDuration(left);
    timer.classList.toggle('over', left < 300);
  };
  const go2 = (i) => { spend(); exam.current = Math.max(0, Math.min(total - 1, i)); storeExam(exam); draw(); };

  const body = h('div', { class: 'stack' });
  const draw = () => {
    const qn = exam.questions[exam.current];
    const ans = exam.answers[qn.id];
    const inSubject = exam.questions.filter((x) => x.subject === qn.subject);
    const choiceBtns = ['A', 'B', 'C', 'D'].filter((k) => qn.choices?.[k] !== undefined).map((k) =>
      h('button', { class: 'choice', 'aria-pressed': String(ans === k), onclick: () => {
        if (exam.answers[qn.id] === k) delete exam.answers[qn.id]; else exam.answers[qn.id] = k;
        storeExam(exam); draw();
      } }, h('b', {}, k), h('span', {}, qn.choices[k])));
    const grid = h('div', { class: 'exam-grid' }, exam.questions.map((x, i) =>
      h('button', { class: 'exam-cell' + (exam.answers[x.id] ? ' done' : '') + (exam.marks[x.id] ? ' marked' : '') + (i === exam.current ? ' now' : ''),
        'aria-label': `${i + 1}. soru`, onclick: () => go2(i) }, i + 1)));
    fill(body,
      h('section', { class: 'card' },
        h('div', { class: 'spread' },
          h('div', { class: 'row' }, subjTag(qn.subject), h('span', { class: 'small muted' }, `${inSubject.indexOf(qn) + 1}. soru`)),
          h('span', { class: 'small muted num' }, `${exam.current + 1}/${total}`)),
        qn.image_path ? lazyImg('questions', qn.image_path) : null,
        qn.stem ? h('p', { class: 'stem' }, qn.stem) : null),
      h('div', { class: 'choices' }, choiceBtns),
      h('div', { class: 'row', style: 'justify-content: space-between' },
        h('button', { class: 'chip', 'aria-pressed': String(!!exam.marks[qn.id]), onclick: () => {
          exam.marks[qn.id] = !exam.marks[qn.id]; storeExam(exam); draw();
        } }, 'T (tahmin)'),
        h('div', { class: 'row' },
          h('button', { class: 'ghost', disabled: exam.current === 0 || null, onclick: () => go2(exam.current - 1) }, '‹ Önceki'),
          h('button', { class: exam.current === total - 1 ? 'ghost' : 'primary', disabled: exam.current === total - 1 || null, onclick: () => go2(exam.current + 1) }, 'Sonraki ›'))),
      h('details', {}, h('summary', { class: 'small' }, `Soru haritası · ${Object.keys(exam.answers).length}/${total} cevaplandı`), grid));
  };

  render(
    h('div', { class: 'qhead stack', style: 'gap: 8px' },
      h('div', { class: 'spread' },
        h('button', { class: 'ghost', onclick: () => {
          if (!confirm('Denemeden çıkarsan süre işlemeye devam eder; Deneme sayfasından kaldığın yere dönebilirsin. Çıkılsın mı?')) return;
          spend(); storeExam(exam); clearInterval(state.examTimer); state.exam = null; go('upload');
        } }, '← Ara ver'),
        timer,
        h('button', { class: 'ghost', onclick: () => {
          const empty = total - Object.keys(exam.answers).length;
          if (!confirm(empty ? `${empty} soru boş. Denemeyi bitirmek istediğine emin misin?` : 'Denemeyi bitirmek istediğine emin misin?')) return;
          spend(); finishExam(exam, 'Bitirdi');
        } }, 'Bitir')),
      h('p', { class: 'small muted' }, exam.title)),
    body);
  draw();
  tick();
  state.examTimer = setInterval(tick, 1000);
}

// Denemeyi bitirir: sonucu hesaplar, kaydeder (kâğıt denemeler gibi), yanlış/boşları hata tekrarına açar.
async function finishExam(exam, reason) {
  clearInterval(state.examTimer);
  if (exam.saving) return;
  exam.saving = true;
  loading('Sonuç hesaplanıyor…');
  const order = exam.section ? SECTION_SUBJECTS[exam.section] : [...new Set(exam.questions.map((x) => x.subject))];
  const rows = exam.questions.map((x) => {
    const ans = exam.answers[x.id] || null;
    return { qn: x, ans, outcome: !ans ? 'bos' : ans === x.answer ? 'dogru' : 'yanlis', time: Math.round(exam.times[x.id] || 0), guess: !!exam.marks[x.id] };
  });
  const per = {};
  for (const r of rows) {
    const p = (per[r.qn.subject] ||= { subject: r.qn.subject, correct: 0, wrong: 0, blank: 0 });
    if (r.outcome === 'dogru') p.correct++; else if (r.outcome === 'yanlis') p.wrong++; else p.blank++;
  }
  const results = order.filter((s) => per[s]).map((s) => per[s]);
  let saved = false;
  try {
    const today = localDate();
    const ex = await q(sb.from('exams').insert({ student_id: sid(), name: exam.booklet ? exam.title : `${exam.title} · ${fmtDate(today)}`,
      kind: 'uygulama', exam_date: today, booklet: exam.booklet, time_note: reason }).select('id').single());
    await q(sb.from('exam_results').insert(results.map((r) => ({ ...r, exam_id: ex.id, student_id: sid() }))));
    const qNo = {};
    const eqs = await q(sb.from('exam_questions').insert(rows.map((r) => ({
      exam_id: ex.id, student_id: sid(), subject: r.qn.subject, q_no: (qNo[r.qn.subject] = (qNo[r.qn.subject] || 0) + 1),
      topic_id: r.qn.topic_id, styles: r.qn.styles || [], student_answer: r.ans, correct_answer: r.qn.answer, outcome: r.outcome,
      marked_guess: r.guess, question_id: r.qn.id, time_sec: r.time, hint: r.qn.hint, solution: r.qn.solution,
    }))).select('id, question_id'));
    const eqId = Object.fromEntries(eqs.map((e) => [e.question_id, e.id]));
    // Görülen sorular bir daha günlük tekrarda gelmesin. Boş bırakılanlar istatistiğe girmesin (voided).
    await q(sb.from('reviews').insert(rows.map((r) => ({
      student_id: sid(), question_id: r.qn.id, track: 'deneme', answer: r.ans, correct: r.outcome === 'dogru',
      duration_sec: r.time, confident: r.guess ? false : null, confidence: r.guess ? 25 : null, voided: !r.ans,
    }))));
    // Yanlış ve boşların hepsi hata tekrarına, konusu henüz işlenmemiş olsa da: yarın o sorunun benzeri,
    // sonra 2, 4, 14, 30 gün.
    const misses = rows.filter((r) => r.outcome !== 'dogru' && r.qn.topic_id);
    if (misses.length) {
      await q(sb.from('items').insert(misses.map((r) => ({
        student_id: sid(), track: 'mistake', topic_id: r.qn.topic_id, question_id: r.qn.id, exam_question_id: eqId[r.qn.id],
        step: 0, interval_days: 1, due_date: addDays(today, 1), note: r.outcome === 'bos' ? 'Denemede boş' : 'Denemede yanlış',
      }))));
    }
    saved = true;
    dropExam();
  } catch (e) {
    console.error(e);
    exam.saving = false;
    exam.endsAt = Math.min(exam.endsAt, Date.now()); // süre bitti sayılır; kayıt tekrar denenebilir
    storeExam(exam);
  }
  state.exam = null;
  showExamResult(exam, rows, results, reason, saved);
}

function showExamResult(exam, rows, results, reason, saved) {
  const total = examNet(results);
  const weighted = results.reduce((s, r) => s + (SUBJECTS[r.subject]?.coef || 1) * (r.correct - r.wrong / 3), 0);
  const missed = rows.filter((r) => r.outcome !== 'dogru');
  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, reason === 'Süre doldu' ? 'Süre doldu' : 'Deneme bitti'),
      h('h1', {}, exam.title)),
    !saved ? h('section', { class: 'card', style: 'border-color: var(--red)' },
      h('p', {}, 'Sonuç kaydedilemedi (internet?). Cevapların telefonda duruyor.'),
      h('button', { class: 'primary block', onclick: () => finishExam(exam, reason) }, 'Tekrar kaydet')) : null,
    h('section', { class: 'card', style: 'text-align: center' },
      h('p', { class: 'label' }, 'Net'),
      h('p', { class: 'task' }, h('span', { class: 'big num' }, fmtNet(total))),
      isLgsStudent(state.student) ? h('p', { class: 'small muted' }, `Katsayılı net ${fmtNet(weighted)} (Türkçe, Matematik, Fen ×4). 3 yanlış 1 doğruyu götürür.`) : null),
    h('div', { class: 'scroll-x' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Ders'), h('th', {}, 'D'), h('th', {}, 'Y'), h('th', {}, 'B'), h('th', {}, 'Net'))),
      h('tbody', {}, results.map((r) => h('tr', {},
        h('td', {}, SUBJECTS[r.subject]?.name || r.subject), h('td', {}, r.correct), h('td', {}, r.wrong), h('td', {}, r.blank),
        h('td', { class: 'num' }, fmtNet(r.correct - r.wrong / 3))))))),
    saved && missed.length ? h('p', { class: 'small muted' }, 'Yanlış ve boşların hata tekrarına girdi: yarın benzerleri gelecek. Bir saat içinde yanlışlarının nedenini seçme görevi de ana sayfana düşer.') : null,
    missed.length ? h('section', { class: 'stack' },
      h('h2', {}, `Yanlış ve boşların (${missed.length})`),
      missed.map((r) => h('article', { class: 'card stack', style: 'gap: 8px' },
        h('div', { class: 'spread' },
          h('div', { class: 'row' }, subjTag(r.qn.subject), h('span', { class: 'small muted' }, `${exam.questions.filter((x) => x.subject === r.qn.subject).indexOf(r.qn) + 1}. soru`)),
          h('span', { class: 'tag ' + (r.outcome === 'bos' ? 'amber' : 'red') }, r.outcome === 'bos' ? 'Boş' : 'Yanlış')),
        r.qn.image_path ? lazyImg('questions', r.qn.image_path) : null,
        r.qn.stem ? h('p', { class: 'stem small' }, r.qn.stem) : null,
        h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => r.qn.choices?.[k] !== undefined).map((k) =>
          h('div', { class: 'opt small' + (k === r.qn.answer ? ' right' : k === r.ans ? ' wrong' : '') },
            h('b', {}, k), h('span', {}, r.qn.choices[k]), k === r.ans ? h('span', { class: 'muted' }, ' ← seçimin') : null))),
        r.qn.solution ? h('details', {}, h('summary', { class: 'small' }, 'Çözüm'), h('div', { class: 'note small', style: 'margin-top: 6px' }, r.qn.solution)) : null))) : null,
    h('button', { class: 'primary block', onclick: () => go('upload') }, 'Deneme sayfası'));
}

// ---------------------------------------------------------------- öğrenci: konular

async function viewTopics() {
  loading();
  const [topics, statuses, items] = await Promise.all([
    q(sb.from('topics').select('*').in('grade', studentGrades(state.student))),
    q(sb.from('topic_status').select('*').eq('student_id', sid())),
    q(sb.from('items').select('topic_id, track, step, state, due_date, note').eq('student_id', sid())),
  ]);
  const st = Object.fromEntries(statuses.map((s) => [s.topic_id, s]));
  const byId = Object.fromEntries(topics.map((t) => [t.id, t]));
  const gaps = statuses.filter((s) => s.status === 'gap' && byId[s.topic_id]);
  const maybe = statuses.filter((s) => s.status === 'maybe_not_taught' && byId[s.topic_id]);

  const setStatus = async (topicId, status) => {
    await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: topicId, status, updated_at: new Date().toISOString() }));
    await q(sb.from('items').update({ state: status === 'not_taught' ? 'paused' : 'active' }).eq('student_id', sid()).eq('topic_id', topicId).neq('state', 'done'));
    toast(status === 'not_taught' ? 'Tamam, konu işlenene kadar bekletiyorum.' : 'Tamam, takibe aldım.');
    viewTopics();
  };

  const level = (topicId) => {
    const t = items.find((i) => i.topic_id === topicId && i.track === 'topic');
    const openMistakes = items.filter((i) => i.topic_id === topicId && i.track === 'mistake' && i.state === 'active').length;
    if (st[topicId]?.status === 'gap') return ['Eksik', 'red'];
    if (openMistakes) return [`${openMistakes} yanlış takipte`, 'amber'];
    if (t && t.state === 'paused' && isRare(byId[topicId])) return ['Tekrar kapalı', ''];
    if (t && t.step >= 4) return ['Oturdu', 'green'];
    if (t) return ['Tekrarda', ''];
    return ['Yeni', ''];
  };

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, isParentView() ? `Konular · ${state.student.display_name}` : 'Konularım'),
      h('h1', {}, isParentView() ? 'Konular' : 'Ne durumdayım?')),
    gaps.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Tekrar çalışılacak konular'),
      gaps.map((g) => h('div', { class: 'card' },
        h('div', { class: 'row' }, subjTag(byId[g.topic_id].subject), h('b', {}, byId[g.topic_id].name)),
        g.lesson ? h('div', { class: 'note teacher' }, g.lesson) : h('p', { class: 'small muted' }, 'Kısa konu anlatımı hazırlanıyor.'),
        g.youtube_query ? h('a', { class: 'btn block', href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(g.youtube_query), target: '_blank', rel: 'noopener' }, 'YouTube’da konu anlatımı izle') : null))) : null,
    maybe.length && !isTeacherView() ? h('section', { class: 'stack' },
      h('h2', {}, 'Bu konuları okulda işlediniz mi?'),
      h('p', { class: 'small muted' }, 'Denemede çıktı ama hepsi boş ya da yanlış. Henüz işlenmediyse zayıflık saymıyorum.'),
      maybe.map((m) => h('div', { class: 'card' },
        h('div', { class: 'row' }, subjTag(byId[m.topic_id].subject), h('b', {}, byId[m.topic_id].name)),
        h('div', { class: 'row' },
          h('button', { style: 'flex: 1', onclick: () => setStatus(m.topic_id, 'not_taught') }, 'Henüz işlemedik'),
          h('button', { style: 'flex: 1', onclick: () => setStatus(m.topic_id, 'active') }, 'İşledik'))))) : null,
    h('section', { class: 'stack', style: 'gap: 4px' },
      h('h2', {}, 'Okulda işlenen konular'),
      h('p', { class: 'small muted' }, isTeacherView()
        ? 'İşaretli konular okulda işlenmiş ve tekrar takviminde. Konu işaretlerini öğrenci ve veli değiştirir.'
        : isParentView()
        ? 'İşlenen konuları işaretleyin; işaretli konular tekrar takvimine girer. İşaretsizler, yıllık plandaki haftası gelince kendiliğinden açılır.'
        : 'İşlediğin konuları işaretle; işaretli konular tekrar takvimine girer. İşlemediğin bir konunun işaretini kaldırırsan o konudan soru gelmez.')),
    subjectCards(topics.filter((t) => t.grade === state.student.grade), false),
    // Üst sınıf konuları (veli açtıysa): yıllık plana göre kendiliğinden açılmaz, işaretlenince takibe girer.
    studentGrades(state.student).filter((g) => g !== state.student.grade).map((g) => [
      h('section', { class: 'stack', style: 'gap: 4px; margin-top: 8px' },
        h('h2', {}, `${g}. sınıf konuları`),
        h('p', { class: 'small muted' }, isTeacherView()
          ? 'Üst sınıfın konuları. İşaretli olanlar tekrar takviminde.'
          : 'Bir üst sınıfın konuları. Bunlar kendiliğinden açılmaz; çalışmak istediğiniz konuyu işaretleyin, o konudan sorular gelmeye başlar.')),
      subjectCards(topics.filter((t) => t.grade === g), true)]),
    !topics.length ? h('div', { class: 'card flat' }, h('p', { class: 'muted' }, 'Bu sınıfın konu listesi henüz yüklenmedi.')) : null);

  function subjectCards(gradeTopics, extra) {
    return visibleSubjects().map((s) => {
      const list = gradeTopics.filter((t) => t.subject === s).sort((a, b) => a.sort - b.sort);
      if (!list.length) return null;
      const covered = (t) => st[t.id] && st[t.id].status !== 'not_taught';
      const countText = () => `${list.filter(covered).length} / ${list.length} ${extra ? 'açık' : 'işlendi'}`;
      const count = h('span', { class: 'small muted' }, countText());
      return h('section', { class: 'card' },
        h('div', { class: 'spread' }, subjTag(s), count),
        list.map((t) => {
          const tag = h('span', { class: 'tag' });
          const paint = () => {
            if (!covered(t)) {
              tag.className = 'tag';
              tag.textContent = st[t.id]?.status === 'not_taught' ? 'Bekliyor'
                : !extra && t.planned_start ? `Plan: ${fmtDate(t.planned_start)}` : '';
              tag.hidden = !tag.textContent; // boş etiket gri bir çizgi gibi görünmesin
              return;
            }
            tag.hidden = false;
            const [label, color] = level(t.id);
            tag.className = 'tag ' + color;
            tag.textContent = label;
          };
          paint();
          const box = h('input', { type: 'checkbox', id: 'topic-' + t.id, checked: covered(t) || null, disabled: isTeacherView() || null, onchange: async () => {
            box.disabled = true;
            try {
              await setCovered(t.id, box.checked, isRare(t) && rareOff());
              st[t.id] = { ...(st[t.id] || {}), status: box.checked ? 'active' : 'not_taught' };
              if (box.checked && !items.some((i) => i.topic_id === t.id && i.track === 'topic')) items.push({ topic_id: t.id, track: 'topic', step: 0, state: isRare(t) && rareOff() ? 'paused' : 'active' });
              paint();
              count.textContent = countText();
            } catch (e) {
              box.checked = !box.checked;
              toast('Kaydedilemedi, tekrar dene.');
            }
            box.disabled = false;
          } });
          // 8. sınıfta konunun LGS'de yılda kaç soru getirdiği; nadir konunun tekrarı açılıp kapanabilir.
          const lgsInfo = t.lgs_avg == null ? null : h('span', { class: 'small muted', style: 'display: block' },
            isRare(t) ? `LGS'de nadir çıkıyor${rareOff() ? '' : ` · tekrar aralığı ${String(+(state.student.rare_factor ?? 2)).replace('.', ',')} kat`}`
              : `LGS'de yılda ~${String(+t.lgs_avg).replace('.', ',')} soru`);
          const topicItem = () => items.find((i) => i.topic_id === t.id && i.track === 'topic');
          const rareBtn = isRare(t) && !isTeacherView() ? h('button', { class: 'ghost small', style: 'padding: 2px 0; min-height: 0; display: block', onclick: async (e) => {
            e.preventDefault();
            const it = topicItem();
            if (!it) return toast('Önce konuyu işlendi olarak işaretle.');
            const on = it.state !== 'active';
            try {
              await q(sb.from('items').update(on ? { state: 'active', note: 'Konu tekrarı elle açıldı.' }
                : { state: 'paused', note: 'LGS\'de nadir çıkıyor; konu tekrarı kapalı (Konular\'dan açılabilir).' })
                .eq('student_id', sid()).eq('topic_id', t.id).eq('track', 'topic'));
            } catch (err) { return toast('Kaydedilemedi, tekrar dene.'); }
            it.state = on ? 'active' : 'paused';
            rareBtn.textContent = on ? 'Tekrarı kapat' : 'Tekrarı aç';
            paint();
            toast(on ? 'Tamam, bu konu da tekrar edilecek.' : 'Tamam, bu konunun tekrarı kapandı.');
          } }, topicItem()?.state === 'active' ? 'Tekrarı kapat' : 'Tekrarı aç') : null;
          return h('label', { class: 'topic-row', for: 'topic-' + t.id }, box,
            h('span', { class: 'name' }, t.name, lgsInfo, rareBtn), tag);
        }));
    });
  }
}

function isParentView() { return state.profile?.role !== 'student'; }
function isTeacherView() { return state.profile?.role === 'teacher'; }

/* Konuyu "okulda işlendi" (takibe al) ya da "işlenmedi" (beklet) yapar.
   İlk kez işaretlenen konunun ilk tekrarı yarın gelir. */
// LGS'de yılda ortalama yarım sorudan az gelen konu (8. sınıf). Tekrar aralığı velinin seçtiği kat kadar
// açılır (profiles.rare_factor); "tekrar etme" (0) seçildiyse bu konuların tekrarı kapalı başlar.
const isRare = (t) => t?.lgs_avg != null && +t.lgs_avg < 0.5;
const rareOff = () => +(state.student?.rare_factor ?? 2) === 0;

async function setCovered(topicId, covered, rare = false) {
  const now = new Date().toISOString();
  if (!covered) {
    await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: topicId, status: 'not_taught', updated_at: now }));
    await q(sb.from('items').update({ state: 'paused' }).eq('student_id', sid()).eq('topic_id', topicId).eq('state', 'active'));
    return;
  }
  await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: topicId, status: 'active', first_seen: localDate(), updated_at: now }));
  const existing = await q(sb.from('items').select('id').eq('student_id', sid()).eq('topic_id', topicId).eq('track', 'topic'));
  if (existing.length) {
    // Nadir konunun tekrarı işaretle açılmaz; açmak için Konular'daki "Tekrarı aç" düğmesi var.
    if (!rare) await q(sb.from('items').update({ state: 'active' }).eq('student_id', sid()).eq('topic_id', topicId).eq('state', 'paused'));
  } else {
    await q(sb.from('items').insert({ student_id: sid(), track: 'topic', topic_id: topicId, step: 0, interval_days: 1, due_date: addDays(localDate(), 1),
      ...(rare ? { state: 'paused', note: 'LGS\'de nadir çıkıyor; konu tekrarı kapalı (Konular\'dan açılabilir).' } : {}) }));
  }
}

// ---------------------------------------------------------------- kelime kartları

/* Kelime kartları: okuldaki İngilizce dersinden ayrı, ilkokul için İngilizce kelime çalışması; ayrı sekmede,
   günlük plandaki derslere sayılmaz. Kelimeler docs/words.json'da, kolaydan zora gruplar hâlinde. Kartta İngilizce
   kelime çıkar, çocuk dört Türkçe anlamdan birini seçer; iyice bildiği kelimelerde bazen tersi sorulur.
   Bilemediği kelime oturumun sonunda bir kez daha, ertesi gün yine gelir; bildikçe kutusu ilerler, kelime
   seyrekleşir (WORD_LADDER). İlk görüşte bildiği kelime 3 gün sonraya atlar. Günde kaç kart: veli ayarı
   (profiles.daily_words); boşsa 1–4. sınıfa 10, diğerlerine kapalı. */
const WORD_LADDER = [0, 1, 3, 7, 14, 30, 60]; // kutu → kaç gün sonra
const WORD_LEARNED = 4; // iki haftalık aralığa ulaşan kelime öğrenilmiş sayılır
const wordsPerDay = (p) => (p?.daily_words ?? (p?.grade && p.grade <= 4 ? 10 : 0));
const WORD_PRAISE = ['Aferin! 🎉', 'Süper! ⭐', 'Harika! 👏', 'Doğru! 🙌', 'Bravo! 🌟'];
let wordList = null;
async function loadWords() {
  if (!wordList) {
    const res = await fetch(`words.json?v=${APP_VERSION}`);
    if (!res.ok) throw new Error('Kelime listesi yüklenemedi');
    const { groups } = await res.json();
    wordList = groups.flatMap((g, group) => g.words.map(([en, tr, emoji]) => ({ en, tr, emoji, group })));
  }
  return wordList;
}
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
function speak(text) {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// Bugünün kartları: önce günü gelen tekrarlar (en eskisi önce), kalan yer listedeki sıradaki yeni kelimelerle dolar.
function wordQueue(list, progress, answeredToday, n) {
  const today = localDate();
  const byWord = new Map(list.map((w) => [w.en, w]));
  const due = progress.filter((p) => p.due_date <= today && !answeredToday.has(p.word) && byWord.has(p.word))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.box - b.box));
  const picks = due.slice(0, n).map((p) => byWord.get(p.word));
  const started = new Set(progress.map((p) => p.word));
  for (const w of list) {
    if (picks.length >= n) break;
    if (!started.has(w.en) && !answeredToday.has(w.en)) picks.push(w);
  }
  return picks;
}

async function viewWords() {
  loading();
  const goal = wordsPerDay(state.student);
  const [list, progress, todayRows] = await Promise.all([
    loadWords(),
    q(sb.from('word_progress').select('word, box, due_date, right_count, wrong_count').eq('student_id', sid())),
    q(sb.from('word_answers').select('word').eq('student_id', sid()).gte('answered_at', dayStart())),
  ]);
  const answered = new Set(todayRows.map((r) => r.word));
  const learned = progress.filter((p) => p.box >= WORD_LEARNED).length;
  const queue = wordQueue(list, progress, answered, Math.max(0, goal - answered.size));
  const extra = queue.length ? [] : wordQueue(list, progress, answered, 5);
  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Kelime'), h('h1', {}, 'Kelime kartları'),
      h('p', { class: 'muted' }, 'İngilizce kelimeler, kolaydan zora. Bilemediğin kelime yakında yine gelir; bildikçe daha seyrek gelir.')),
    h('section', { class: 'card stack', style: 'gap: 10px' },
      h('div', { class: 'spread' }, h('b', { class: 'num' }, `Bugün ${answered.size}/${goal}`),
        h('span', { class: 'small muted' }, `Öğrendiğin kelime: ${learned}`)),
      h('div', { class: 'progress' }, h('i', { style: `width: ${Math.min(100, (answered.size / Math.max(1, goal)) * 100)}%` })),
      !goal ? h('p', { class: 'muted' }, 'Kelime kartları kapalı; velin Ayarlar\'dan açabilir.')
        : queue.length ? h('button', { class: 'primary block', onclick: () => runWords(queue, list, progress) }, answered.size ? 'Devam et' : 'Başla')
          : h('p', {}, 'Bugünlük bu kadar, aferin! 🎉 Yarın yeni kelimeler gelecek.'),
      goal && extra.length ? h('button', { class: 'block', onclick: () => runWords(extra, list, progress) }, `${extra.length} kelime daha`) : null),
    h('p', { class: 'small muted', style: 'text-align: center' }, `${list.length} kelimenin ${progress.length} tanesini gördün.`));
}

// Kart oyunu, soru çözme oturumu gibi açılır: alt menü gizlenir, geri tuşu önce sorar (state.session).
function runWords(queue, list, progress) {
  const run = { track: 'words', cards: queue.map((w) => ({ w, again: false })), index: 0, right: 0, firstTries: queue.length };
  state.session = run;
  pushOverlay('session');
  showWordCard(run, list, new Map(progress.map((p) => [p.word, p])));
}

function showWordCard(run, list, byWord) {
  if (run.index >= run.cards.length) return endWords(run);
  const { w, again } = run.cards[run.index];
  const p = byWord.get(w.en);
  // İyice bildiği kelimede bazen tersi: Türkçe çıkar, İngilizcesini seçer.
  const reverse = !again && (p?.box || 0) >= 3 && Math.random() < 0.5;
  const label = (x) => (reverse ? x.en : x.tr);
  // Yanlış şıklar aynı gruptan (renkler, hayvanlar…); grupta yeterli yoksa komşu gruplardan.
  const same = list.filter((x) => x.group === w.group && x.en !== w.en);
  const pool = same.length >= 3 ? same : list.filter((x) => x.en !== w.en && Math.abs(x.group - w.group) <= 1);
  const distract = [];
  for (const x of shuffle([...pool])) {
    if (distract.length === 3) break;
    if (label(x) !== label(w) && !distract.some((d) => label(d) === label(x))) distract.push(x);
  }
  const options = shuffle([w, ...distract]);
  // Doğru cevapta kart kendiliğinden geçer; çocuk o arada "Sonraki kelime"ye basarsa ikinci geçiş olmasın
  // (yoksa bir sonraki kart görünmeden atlanır).
  let done = false, advanced = false, timer = null;
  const next = () => {
    if (advanced) return;
    advanced = true;
    clearTimeout(timer);
    run.index++;
    showWordCard(run, list, byWord);
  };
  const feedback = h('div', { class: 'stack', hidden: true });
  const btns = options.map((o) => h('button', { class: 'word-opt', onclick: () => pick(o) }, label(o)));
  async function pick(o) {
    if (done) return;
    done = true;
    const ok = o === w;
    btns.forEach((b) => { b.disabled = true; });
    btns[options.indexOf(w)].classList.add('right');
    if (!ok) btns[options.indexOf(o)].classList.add('wrong');
    if (ok && !again) run.right++;
    if (!ok && !again) run.cards.push({ w, again: true }); // bilemediği kelime oturumun sonunda bir kez daha
    fill(feedback,
      h('p', { class: 'verdict ' + (ok ? 'ok' : 'no') }, ok ? WORD_PRAISE[Math.floor(Math.random() * WORD_PRAISE.length)] : 'Olmadı'),
      h('p', { class: 'word-meaning' }, w.emoji ? `${w.emoji} ` : '', h('b', { lang: 'en' }, w.en), ` = ${w.tr}`,
        canSpeak() ? h('button', { class: 'ghost small', 'aria-label': 'Dinle', onclick: () => speak(w.en) }, '🔊') : null),
      !ok && !again ? h('p', { class: 'small muted' }, 'Bu kelime birazdan bir kez daha, yarın da yine gelecek.') : null,
      h('button', { class: 'primary block', onclick: next }, run.index + 1 < run.cards.length ? 'Sonraki kelime' : 'Bitir'));
    feedback.hidden = false;
    await saveWord(w, ok, reverse, again, byWord);
    if (ok) timer = setTimeout(() => { if (state.session === run) next(); }, 1200);
  }
  state.leaveOverlay = () => clearTimeout(timer);
  render(
    h('div', { class: 'qhead stack', style: 'gap: 8px' },
      h('div', { class: 'spread' },
        h('button', { class: 'ghost', onclick: () => { clearTimeout(timer); go('words'); } }, '← Ara ver'),
        h('span', { class: 'small muted num' }, `${run.index + 1}/${run.cards.length}`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': run.cards.length, 'aria-valuenow': run.index },
        h('i', { style: `width: ${(run.index / run.cards.length) * 100}%` }))),
    h('section', { class: 'card word-card' },
      again ? h('span', { class: 'tag amber' }, 'Bir daha') : null,
      h('p', { class: 'word-big', lang: reverse ? 'tr' : 'en' }, reverse ? w.tr : w.en),
      // Ters soruda dinlemek cevabı söyler; dinleme cevaptan sonra.
      !reverse && canSpeak() ? h('button', { class: 'ghost', 'aria-label': 'Dinle', onclick: () => speak(w.en) }, '🔊 Dinle') : null,
      h('p', { class: 'small muted' }, reverse ? 'İngilizcesi hangisi?' : 'Türkçesi hangisi?')),
    h('div', { class: 'word-opts' }, btns),
    feedback);
}

// Cevap kaydı ve kutu: bilirse bir sonraki kutu (yeni kelime 2. kutudan başlar), bilemezse 1. kutu, yarın yine.
// Oturumun sonunda tekrar sorulan kelimenin kutusu ilk cevapla belirlenmiştir; sadece cevap kaydedilir.
async function saveWord(w, ok, reverse, again, byWord) {
  const p = byWord.get(w.en);
  try {
    await q(sb.from('word_answers').insert({ student_id: sid(), word: w.en, correct: ok, reverse }));
    if (again) return;
    const box = ok ? (p ? Math.min(WORD_LADDER.length - 1, p.box + 1) : 2) : 1;
    const row = { student_id: sid(), word: w.en, box, due_date: addDays(localDate(), WORD_LADDER[box]),
      right_count: (p?.right_count || 0) + (ok ? 1 : 0), wrong_count: (p?.wrong_count || 0) + (ok ? 0 : 1),
      updated_at: new Date().toISOString() };
    await q(sb.from('word_progress').upsert(row));
    byWord.set(w.en, row);
  } catch (e) {
    toast('Kaydedilemedi; internetini kontrol et.');
  }
}

function endWords(run) {
  const missed = [...new Set(run.cards.filter((c) => c.again).map((c) => c.w.en))];
  state.session = null; // sonuç ekranında geri tuşu sormadan Kelime sayfasına döner
  render(
    h('section', { class: 'card stack', style: 'margin-top: 6vh; text-align: center' },
      h('h2', {}, run.right === run.firstTries ? 'Hepsini bildin! 🎉' : `${run.firstTries} kelimeden ${run.right} tanesini bildin`),
      missed.length ? h('p', { class: 'muted' }, `Yarın yine gelecekler: ${missed.join(', ')}`) : null,
      h('button', { class: 'primary block', onclick: () => go('words') }, 'Tamam')),
    Math.random() < 0.5 ? jokeCard('Mola') : null);
}

/* Rapordaki kelime kartları özeti (veli ve İngilizce öğretmeni): bugün, son 7 gün, öğrendiği ve zorlandığı
   kelimeler. Okuldaki İngilizce dersinden ayrıdır. Hiç kart çözmediyse görünmez. */
function wordBox() {
  const box = h('section', { class: 'card stack', style: 'gap: 8px', hidden: true });
  (async () => {
    const [progress, answers, list] = await Promise.all([
      q(sb.from('word_progress').select('word, box, wrong_count').eq('student_id', sid())),
      q(sb.from('word_answers').select('word, correct, answered_at').eq('student_id', sid()).gte('answered_at', addDays(localDate(), -6) + 'T00:00:00')),
      loadWords(),
    ]);
    if (!progress.length && !answers.length) return;
    const tr = Object.fromEntries(list.map((w) => [w.en, w.tr]));
    const today = localDate();
    const todayN = new Set(answers.filter((a) => localDate(new Date(a.answered_at)) === today).map((a) => a.word)).size;
    const right = answers.filter((a) => a.correct).length;
    const hard = progress.filter((p) => p.wrong_count > 0).sort((a, b) => b.wrong_count - a.wrong_count).slice(0, 6);
    fill(box,
      h('h2', {}, 'Kelime kartları'),
      h('p', { class: 'small muted' }, 'Okuldaki İngilizce dersinden ayrı kelime çalışması (Kelime sekmesi).'),
      h('p', {}, `Bugün ${todayN}/${wordsPerDay(state.student)} kart. Son 7 günde ${answers.length} cevap, `
        + `%${answers.length ? Math.round((right / answers.length) * 100) : 0} doğru.`),
      h('p', {}, `Öğrendiği: ${progress.filter((p) => p.box >= WORD_LEARNED).length} kelime · gördüğü: ${progress.length} / ${list.length}`),
      hard.length ? h('p', { class: 'small' }, h('b', {}, 'Zorlandıkları: '), hard.map((p) => `${p.word} (${tr[p.word] || '?'})`).join(', ')) : null);
    box.hidden = false;
  })().catch(() => {});
  return box;
}

// ---------------------------------------------------------------- ayarlar

function viewSettings() {
  // Çalışma ayarları öğrencinindir; veli seçili çocuğun ayarlarını değiştirir. Öğretmen sadece kendi şifresini.
  const p = state.student;
  const role = state.profile.role;
  const isParent = role === 'parent';
  const showStudent = p && role !== 'teacher';
  const lgs = p && h('input', { id: 'lgs-date', type: 'date', value: p.lgs_date });
  const grade = p && h('select', { id: 'grade' }, [1, 2, 3, 4, 5, 6, 7, 8].map((g) => h('option', { value: g, selected: g === p.grade }, `${g}. sınıf`)));
  const plan = p && dailyPlan(p);
  // LGS'de seyrek çıkan konuların tekrar aralığı (sadece veli, 8. sınıf).
  const rareSel = p && h('select', { id: 'rare-factor' }, [[1, 'Normal aralıkla'], [1.5, 'Aralık 1,5 kat'], [2, 'Aralık 2 kat (önerilen)'], [3, 'Aralık 3 kat'], [0, 'Tekrar etme']]
    .map(([v, l]) => h('option', { value: v, selected: v === +(p.rare_factor ?? 2) || null }, l)));
  // İleri müfredat: küçük sınıftaki çocuğa bir üst sınıfın konuları da açılabilir (sadece veli).
  const nextUp = p && h('input', { type: 'checkbox', id: 'next-grade', checked: (p.extra_grades || []).length > 0 || null });
  const nextUpText = h('span', {});
  const nextUpRow = p && h('label', { class: 'row small', for: 'next-grade' }, nextUp, nextUpText);
  const paintNextUp = () => {
    const g = +grade.value;
    nextUpRow.hidden = g >= 8;
    nextUpText.textContent = `${g + 1}. sınıfın konularını da göster (Konular sayfasında işaretleyerek açılır)`;
  };
  if (p) { paintNextUp(); grade.addEventListener('change', paintNextUp); }
  render(
    h('header', {}, h('h1', {}, isParent && p ? `Ayarlar · ${p.display_name}` : 'Ayarlar')),
    isParent && p ? planSection(p) : null,
    isParent ? familySection() : null,
    showStudent && h('section', { class: 'card' },
      isParent ? h('label', { class: 'field' }, 'Sınıfı', grade) : null,
      isParent ? nextUpRow : null,
      isLgsStudent(p) ? h('label', { class: 'field' }, 'LGS tarihi', lgs) : null,
      isParent && isLgsStudent(p) ? h('label', { class: 'field' }, 'LGS\'de seyrek çıkan konuların tekrarı', rareSel) : null,
      isParent && isLgsStudent(p) ? h('p', { class: 'small muted' }, 'Yılda ortalama yarım sorudan az gelen konular (fiilimsiler gibi). Bildiği konunun aralığı zaten açılıyor; bu ayar seyrek konularda aralığı ayrıca genişletir.') : null,
      // Günlük plan veli ayarıdır; öğrenci sadece görür (veritabanı da öğrencinin değiştirmesine izin vermez).
      !isParent ? h('div', { class: 'stack', style: 'gap: 4px' },
        h('p', { class: 'label' }, `Günlük plan · ${planTotal(plan)} soru`),
        h('p', { class: 'small muted' }, studentSubjects(p).filter((s) => plan[s]).map((s) => `${SUBJECTS[s].name} ${plan[s]}`).join(' · ')),
        wordsPerDay(p) ? h('p', { class: 'small muted' }, `Kelime kartları: günde ${wordsPerDay(p)} kart`) : null,
        h('p', { class: 'small muted' }, 'Bu sayıları velin ayarlıyor.')) : null,
      h('button', { class: 'primary block', onclick: async () => {
        const upd = { lgs_date: lgs.value || p.lgs_date };
        const wasOff = +(p.rare_factor ?? 2) === 0;
        if (isParent) {
          upd.grade = +grade.value;
          upd.extra_grades = nextUp.checked && upd.grade < 8 ? [upd.grade + 1] : [];
          if (isLgsStudent(p)) upd.rare_factor = +rareSel.value;
        }
        try {
          await q(sb.from('profiles').update(upd).eq('id', p.id));
          // "Tekrar etme" seçilince seyrek konuların açık tekrarları kapanır; geri açılınca yeniden başlar.
          const nowOff = upd.rare_factor === 0;
          if (upd.rare_factor !== undefined && nowOff !== wasOff) {
            const rareIds = (await q(sb.from('topics').select('id').eq('grade', 8).lt('lgs_avg', 0.5))).map((t) => t.id);
            if (nowOff) {
              await q(sb.from('items').update({ state: 'paused', note: 'LGS\'de nadir çıkıyor; konu tekrarı kapalı (Konular\'dan açılabilir).' })
                .eq('student_id', p.id).eq('track', 'topic').eq('state', 'active').in('topic_id', rareIds));
            } else {
              await q(sb.from('items').update({ state: 'active', note: 'LGS\'de nadir çıkıyor; tekrar aralığı geniş.' })
                .eq('student_id', p.id).eq('track', 'topic').eq('state', 'paused').in('topic_id', rareIds).like('note', 'LGS\'de nadir%'));
            }
          }
        } catch (e) { return toast('Kaydedilemedi, tekrar dene.'); }
        Object.assign(p, upd);
        toast('Kaydedildi.');
        if (isParent) viewSettings(); // sınıf değişince dersler ve günlük plan da değişir
      } }, 'Kaydet')),
    h('section', { class: 'stack' },
      h('h2', {}, 'Şifreyi değiştir'),
      h('p', { class: 'small muted' }, `${state.user?.email || ''} hesabının şifresi`),
      newPasswordForm(() => {})),
    h('section', { class: 'card' },
      h('p', { class: 'small muted' }, 'Ana ekrana eklemek için: Safari’de paylaş düğmesi → “Ana Ekrana Ekle”.'),
      h('button', { class: 'block', onclick: signOut }, 'Çıkış yap')));
}

// Süreyi "52 dk" ya da "4 sa 10 dk" yazar.
function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (!m && sec > 0) return '1 dk’dan az';
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa${m % 60 ? ` ${m % 60} dk` : ''}`;
}

/* Velinin günlük plan kartı: derse göre günlük soru sayısı, öğrencinin harcadığı süre (bugün ve son 7 gün)
   ve bugün biriken hata tekrarları. Bir dersin hata tekrarı sayısı sınırı aşarsa uyarır: aşan kısım
   ertesi güne kalır, sınır en az o kadar olmalı. */
function planSection(p) {
  const subjects = studentSubjects(p);
  const plan = dailyPlan(p);
  const box = h('section', { class: 'card stack' }, h('p', { class: 'label' }, 'Günlük plan'), h('p', { class: 'small muted' }, 'Yükleniyor…'));
  (async () => {
    const today = localDate();
    const [rows, due, wordRows] = await Promise.all([
      q(sb.from('reviews').select('duration_sec, answered_at, questions(subject)').eq('student_id', p.id).eq('voided', false)
        .gte('answered_at', addDays(today, -6) + 'T00:00:00')),
      q(sb.from('items').select('support, topics(subject)').eq('student_id', p.id).eq('track', 'mistake').eq('state', 'active').lte('due_date', today)),
      q(sb.from('word_answers').select('word').eq('student_id', p.id).gte('answered_at', dayStart())),
    ]);
    const stat = Object.fromEntries(subjects.map((s) => [s, { n: 0, sec: 0, week: 0, due: 0 }]));
    for (const r of rows) {
      const st = stat[r.questions?.subject];
      if (!st) continue;
      st.week += r.duration_sec || 0;
      if (localDate(new Date(r.answered_at)) === today) { st.n++; st.sec += r.duration_sec || 0; }
    }
    for (const it of due) { const st = stat[it.topics?.subject]; if (st) st.due += 1 + (it.support || 0); }
    const sum = (k) => subjects.reduce((a, s) => a + stat[s][k], 0);
    const days = new Set(rows.map((r) => localDate(new Date(r.answered_at)))).size;

    const inputs = {}, checks = [];
    const totalLine = h('p', { class: 'small muted num' });
    const update = () => {
      checks.forEach((c) => c());
      const total = subjects.reduce((a, s) => a + (+inputs[s].value || 0), 0);
      const maxSec = subjects.reduce((a, s) => a + (+inputs[s].value || 0) * maxSeconds(s), 0);
      totalLine.textContent = `Toplam günde ${total} soru · soru sürelerine göre en fazla ${fmtMinutes(maxSec)}`;
    };
    const rowsEl = subjects.map((s) => {
      const st = stat[s];
      const input = inputs[s] = h('input', { type: 'number', min: 0, max: 60, value: plan[s], inputmode: 'numeric',
        'aria-label': `${SUBJECTS[s].name} günlük soru sayısı`, style: 'width: 76px' });
      input.addEventListener('input', update);
      const warn = h('p', { class: 'small', style: 'color: var(--red)' });
      checks.push(() => {
        const limit = +input.value || 0;
        warn.hidden = st.due <= limit;
        fill(warn, st.due > limit ? [`Bugün ${st.due} hata tekrarı sorusu birikti, sınır ${limit}. Fazlası yarına kalır. `,
          h('button', { class: 'ghost small', onclick: () => { input.value = st.due; update(); } }, `${st.due} yap`)] : null);
      });
      return h('div', { class: 'stack', style: 'gap: 4px; padding: 8px 0; border-top: 1px solid var(--rule)' },
        h('div', { class: 'spread' }, subjTag(s), input),
        h('p', { class: 'small muted num' }, `Bugün ${st.n} soru · ${fmtMinutes(st.sec)} · son 7 gün ${fmtMinutes(st.week)}`
          + (st.due ? ` · bugün ${st.due} hata tekrarı` : '')),
        warn);
    });
    // Kelime kartları ders dışıdır: okuldaki İngilizce'nin sayısından ayrı, Kelime sekmesinde. 0 sekmeyi kapatır.
    const wordsInput = h('input', { type: 'number', min: 0, max: 50, value: wordsPerDay(p), inputmode: 'numeric',
      'aria-label': 'Günlük kelime kartı sayısı', style: 'width: 76px' });
    const wordsRow = h('div', { class: 'stack', style: 'gap: 4px; padding: 10px 0 4px; border-top: 2px solid var(--rule)' },
      h('div', { class: 'spread' }, h('b', {}, 'Kelime kartları'), wordsInput),
      h('p', { class: 'small muted' }, 'Okuldaki İngilizce dersinden ayrı: Kelime sekmesinde İngilizce kelime kartları, kolaydan zora. '
        + `Günde kaç kart gelsin? 0 yazarsan sekme kapanır. Bugün ${new Set(wordRows.map((r) => r.word)).size} kart çözdü.`));
    const save = h('button', { class: 'primary block', onclick: async () => {
      const by = Object.fromEntries(subjects.map((s) => [s, Math.min(60, Math.max(0, Math.round(+inputs[s].value || 0)))]));
      if (!planTotal(by)) return toast('En az bir derse soru ver.');
      const upd = { daily_by_subject: by, daily_questions: planTotal(by), daily_words: Math.min(50, Math.max(0, Math.round(+wordsInput.value || 0))) };
      save.disabled = true;
      try { await q(sb.from('profiles').update(upd).eq('id', p.id)); } catch (e) { save.disabled = false; return toast('Kaydedilemedi, tekrar dene.'); }
      save.disabled = false;
      Object.assign(p, upd);
      subjects.forEach((s) => { inputs[s].value = by[s]; });
      wordsInput.value = upd.daily_words;
      update();
      toast('Kaydedildi. Yeni sayılar bugünden geçerli.');
    } }, 'Kaydet');
    update();
    fill(box,
      h('p', { class: 'label' }, 'Günlük plan'),
      h('p', {}, `Bugün ${sum('n')} soru çözdü, ${fmtMinutes(sum('sec'))}. Son 7 günde ${fmtMinutes(sum('week'))}`
        + (days ? `, çalıştığı ${days} günde ortalama ${fmtMinutes(sum('week') / days)}.` : '.')),
      h('p', { class: 'small muted' }, 'Her dersten günde en fazla kaç soru gelsin? Önce hata tekrarları, sonra konu tekrarları gelir; kalan sayı en zayıf konulardan ek çalışmayla dolar. Süre, soruyu açtığı andan şıkkı seçtiği ana kadar ölçülür.'),
      rowsEl, totalLine, wordsRow, save);
  })().catch(() => fill(box, h('p', { class: 'label' }, 'Günlük plan'), h('p', { class: 'small muted' }, 'Yüklenemedi, sayfayı yenile.')));
  return box;
}

// ---------------------------------------------------------------- aile yönetimi (veli)

// Ders onay kutuları: current null ise hepsi işaretli. selected() seçili ders anahtarlarını döner.
function subjectChecklist(current) {
  const inputs = SUBJECT_ORDER.map((s) => h('input', { type: 'checkbox', value: s, checked: (!current || current.includes(s)) || null }));
  const el = h('div', { class: 'row' }, SUBJECT_ORDER.map((s, i) => h('label', { class: 'row small' }, inputs[i], SUBJECTS[s].name)));
  return { el, selected: () => inputs.filter((i) => i.checked).map((i) => i.value) };
}

async function familyCall(body) {
  const { data, error } = await sb.functions.invoke('family', { body });
  if (error) {
    let message = 'İşlem yapılamadı.';
    try { message = (await error.context.json()).error || message; } catch (e) { /* yanıt okunamadı */ }
    throw new Error(message);
  }
  return data;
}

/* Veli: çocuk ekler/siler, ikinci veliyi (eşini) ve öğretmenleri ekler; öğretmenin hangi
   çocukları göreceğini seçer. Hesap açma/silme sunucudaki "family" fonksiyonunda yapılır. */
function familySection() {
  const box = h('section', { class: 'stack' }, h('h2', {}, 'Aile'), h('p', { class: 'small muted' }, 'Yükleniyor…'));
  const reload = async () => {
    await loadStudents();
    if (state.tab === 'settings') viewSettings();
  };
  familyCall({ action: 'list' }).then(({ members, me }) => {
    const kids = members.filter((m) => m.role === 'student').sort((a, b) => a.display_name.localeCompare(b.display_name, 'tr'));
    const parents = members.filter((m) => m.role === 'parent');
    const teachers = members.filter((m) => m.role === 'teacher');
    const kidName = (id) => kids.find((k) => k.id === id)?.display_name || '';

    const person = (m, extra) => h('div', { class: 'member' },
      h('div', { class: 'stack', style: 'gap: 0; min-width: 0' },
        h('b', {}, m.display_name + (m.id === me ? ' (sen)' : '') + (m.grade ? ` · ${m.grade}. sınıf` : '') +
          (m.role === 'teacher' ? ` · ${m.subjects ? m.subjects.map((s) => SUBJECTS[s]?.name).join(', ') : 'bütün dersler'}` : '')),
        h('span', { class: 'small muted', style: 'overflow-wrap: anywhere' }, m.email)),
      extra || null);

    // Çocuk silme: adını yazarak onaylanır.
    const deleteControl = (kid) => {
      const confirmBox = h('div', { class: 'stack', hidden: true },
        h('p', { class: 'small error' }, `${kid.display_name} ve bütün verisi (denemeler, cevaplar, fotoğraflar) kalıcı olarak silinecek. Geri alınamaz.`));
      const input = h('input', { id: 'confirm-' + kid.id, placeholder: `Onay için “${kid.display_name}” yaz` });
      const go = h('button', { class: 'danger', disabled: true, onclick: async () => {
        go.disabled = true;
        try {
          await familyCall({ action: 'delete_child', student_id: kid.id });
          toast(`${kid.display_name} silindi.`);
          if (state.student?.id === kid.id) state.student = null;
          await reload();
        } catch (e) { toast(e.message); go.disabled = false; }
      } }, 'Kalıcı olarak sil');
      input.addEventListener('input', () => { go.disabled = input.value.trim() !== kid.display_name; });
      confirmBox.append(input, go);
      return [h('button', { class: 'ghost small danger', onclick: () => { confirmBox.hidden = !confirmBox.hidden; } }, 'Sil'), confirmBox];
    };

    // Öğretmenin gördüğü çocuklar: onay kutularıyla.
    const teacherControl = (t) => {
      const boxes = kids.map((k) => h('label', { class: 'row small' },
        h('input', { type: 'checkbox', value: k.id, checked: t.student_ids?.includes(k.id) || null }), k.display_name));
      const subjectBoxes = subjectChecklist(t.subjects);
      const save = h('button', { class: 'small', onclick: async () => {
        save.disabled = true;
        const ids = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
        try {
          await familyCall({ action: 'set_teacher_students', teacher_id: t.id, student_ids: ids, subjects: subjectBoxes.selected() });
          toast(ids.length ? 'Öğretmenin erişimi güncellendi.' : 'Öğretmenin erişimi kaldırıldı.');
          viewSettings();
        } catch (e) { toast(e.message); save.disabled = false; }
      } }, 'Kaydet');
      return h('div', { class: 'stack', style: 'gap: 6px' },
        h('span', { class: 'small muted' }, 'Görebildiği çocuklar:'), h('div', { class: 'row' }, boxes),
        h('span', { class: 'small muted' }, 'Görebildiği dersler:'), subjectBoxes.el, save);
    };

    const addForm = (kind) => {
      const name = h('input', { id: `${kind}-name`, placeholder: 'Adı' });
      const email = h('input', { id: `${kind}-email`, type: 'email', inputmode: 'email', placeholder: 'Giriş e-postası' });
      const password = h('input', { id: `${kind}-password`, type: 'text', autocomplete: 'off', placeholder: 'Şifre (en az 6 karakter)' });
      const grade = h('select', { id: `${kind}-grade` }, [1, 2, 3, 4, 5, 6, 7, 8].map((g) => h('option', { value: g, selected: g === 8 }, `${g}. sınıf`)));
      const kidBoxes = kids.map((k) => h('label', { class: 'row small' }, h('input', { type: 'checkbox', value: k.id }), k.display_name));
      const subjectBoxes = subjectChecklist(null);
      const msg = h('p', { class: 'small', hidden: true });
      const submit = h('button', { class: 'primary block', onclick: async () => {
        submit.disabled = true;
        msg.hidden = true;
        const body = { action: { child: 'add_child', parent: 'add_parent', teacher: 'add_teacher' }[kind],
          name: name.value, email: email.value, password: password.value };
        if (kind === 'child') body.grade = +grade.value;
        if (kind === 'teacher') {
          body.student_ids = kidBoxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
          body.subjects = subjectBoxes.selected();
        }
        try {
          const res = await familyCall(body);
          toast(kind === 'teacher' && res.existing ? 'Öğretmenin mevcut hesabı bağlandı.' : 'Eklendi. Giriş bilgilerini kendisine iletin.');
          await reload();
        } catch (e) {
          msg.className = 'small error'; msg.textContent = e.message; msg.hidden = false; submit.disabled = false;
        }
      } }, { child: 'Çocuğu ekle', parent: 'Veliyi ekle', teacher: 'Öğretmeni ekle' }[kind]);
      return h('details', { class: 'card' },
        h('summary', {}, h('b', {}, { child: '+ Çocuk ekle', parent: '+ Veli ekle (eş)', teacher: '+ Öğretmen ekle' }[kind])),
        h('div', { class: 'stack', style: 'margin-top: 12px' },
          kind === 'child' ? h('p', { class: 'small muted' }, 'Çocuğun e-postası yoksa kendi adresinize + ekleyerek bir giriş adresi yazabilirsiniz, örneğin ad+cocuk@hotmail.com. E-postalar size gelir.') : null,
          kind === 'teacher' ? h('p', { class: 'small muted' }, 'Öğretmen sadece seçtiğiniz çocukları ve dersleri görür, hiçbir şeyi değiştiremez. Öğretmenin bu uygulamada hesabı varsa şifre boş kalabilir.') : null,
          h('label', { class: 'field' }, 'Ad', name),
          h('label', { class: 'field' }, 'E-posta', email),
          h('label', { class: 'field' }, 'Şifre', password),
          kind === 'child' ? h('label', { class: 'field' }, 'Sınıfı', grade) : null,
          kind === 'teacher' ? h('div', { class: 'stack', style: 'gap: 6px' }, h('span', { class: 'small' }, 'Görebileceği çocuklar'), h('div', { class: 'row' }, kidBoxes)) : null,
          kind === 'teacher' ? h('div', { class: 'stack', style: 'gap: 6px' }, h('span', { class: 'small' }, 'Görebileceği dersler'), subjectBoxes.el) : null,
          msg, submit));
    };

    fill(box,
      h('h2', {}, 'Aile'),
      h('div', { class: 'card' },
        h('p', { class: 'label' }, 'Çocuklar'),
        kids.length ? kids.map((k) => {
          const [delBtn, delBox] = deleteControl(k);
          return h('div', { class: 'stack', style: 'gap: 6px' }, person(k, delBtn), delBox);
        }) : h('p', { class: 'small muted' }, 'Henüz çocuk eklenmedi.'),
        h('p', { class: 'label', style: 'margin-top: 8px' }, 'Veliler'),
        parents.map((m) => person(m)),
        teachers.length ? [h('p', { class: 'label', style: 'margin-top: 8px' }, 'Öğretmenler'),
          teachers.map((t) => h('div', { class: 'stack', style: 'gap: 6px' }, person(t), teacherControl(t)))] : null),
      addForm('child'),
      kids.length ? addForm('parent') : null,
      kids.length ? addForm('teacher') : null);
  }).catch((e) => fill(box, h('h2', {}, 'Aile'), h('p', { class: 'error small' }, e.message)));
  return box;
}

// ---------------------------------------------------------------- sorular (veli ve öğretmen)

/* Öğrencinin çözdüğü her soru: denemelerdeki sorular (görsel, cevabı, teşhis, kendi gerekçesi)
   ve tekrar soruları (metin, şıklar, seçimi, emin olma, süre). Öğretmen sadece kendi derslerini görür. */
async function viewQuestions() {
  loading('Sorular yükleniyor…');
  const s = sid();
  const [examRows, reviewRows] = await Promise.all([
    q(sb.from('exam_questions').select('*, exams(name, exam_date), topics(name), questions!exam_questions_question_id_fkey(stem, choices, image_path)').eq('student_id', s)
      .order('created_at', { ascending: false }).limit(300)),
    q(sb.from('reviews').select('answer, correct, confidence, needs_help, understood, duration_sec, hint_used, answered_at, track, questions(subject, stem, choices, answer, solution, image_path, topics(name))')
      .eq('student_id', s).eq('voided', false).order('answered_at', { ascending: false }).limit(300)),
  ]);
  const subjects = visibleSubjects();
  const filter = { source: 'exam', outcome: 'missed', subject: 'all' };
  let shown = 20;
  const list = h('div', { class: 'stack' });

  const chipGroup = (key, options) => {
    const btns = options.map(([v, label]) => h('button', { class: 'chip', 'aria-pressed': String(filter[key] === v), onclick: () => {
      filter[key] = v; shown = 20;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === v)));
      draw();
    } }, label));
    return h('div', { class: 'chips' }, btns);
  };

  const outcomeTag = (outcome) => ({
    yanlis: h('span', { class: 'tag red' }, 'Yanlış'),
    bos: h('span', { class: 'tag amber' }, 'Boş'),
    dogru: h('span', { class: 'tag green' }, 'Doğru'),
  })[outcome];

  const examCard = (r) => h('article', { class: 'card' },
    h('div', { class: 'spread' },
      h('div', { class: 'row' }, subjTag(r.subject), h('span', { class: 'small muted' }, `${r.exams?.name || 'Deneme'} · ${r.q_no}. soru`)),
      outcomeTag(r.outcome)),
    examQuestionContent(r),
    h('p', { class: 'small' }, r.outcome === 'bos' ? `Boş bıraktı. Doğru cevap ${r.correct_answer || '?'}.`
      : `Cevabı ${r.student_answer || '?'} · doğrusu ${r.correct_answer || '?'}`
        + (r.marked_guess ? ' · tahmin (T) işaretlemiş' : '') + (r.coding_error ? ' · optiğe yanlış kodlamış' : '')),
    h('p', { class: 'small muted' }, [r.topics?.name, fmtDate(r.exams?.exam_date)].filter(Boolean).join(' · ')),
    r.outcome !== 'dogru' && (r.diagnosis_cause || r.student_reason) ? h('div', { class: 'note teacher small' },
      r.diagnosis_cause ? h('p', {}, h('b', {}, 'Teşhis: '), CAUSE_LABEL[r.diagnosis_cause] || r.diagnosis_cause, r.diagnosis_text ? ` — ${r.diagnosis_text}` : '') : null,
      r.student_reason ? h('p', { style: 'margin-top: 6px' }, h('b', {}, 'Kendi gerekçesi: '),
        (REASONS.find(([k]) => k === r.student_reason) || [, r.student_reason])[1],
        r.student_confident === true ? ' (emin olarak işaretlemiş)' : r.student_confident === false ? ' (emin değilmiş)' : '') : null,
      r.misconception ? h('p', { style: 'margin-top: 6px' }, h('b', {}, 'Kavram yanılgısı: '), r.misconception) : null,
      r.scratch_note ? h('p', { style: 'margin-top: 6px' }, h('b', {}, 'Karalamasında: '), r.scratch_note) : null) : null,
    r.solution ? h('details', {}, h('summary', { class: 'small' }, 'Çözüm'), h('div', { class: 'note small', style: 'margin-top: 6px' }, r.solution)) : null);

  const reviewCard = (r) => {
    const qn = r.questions || {};
    const max = maxSeconds(qn.subject);
    return h('article', { class: 'card' },
      h('div', { class: 'spread' },
        h('div', { class: 'row' }, subjTag(qn.subject), h('span', { class: 'small muted' }, qn.topics?.name || '')),
        r.needs_help ? h('span', { class: 'tag amber' }, 'Boş: birlikte bakalım') : outcomeTag(r.correct ? 'dogru' : 'yanlis')),
      qn.image_path ? lazyImg('questions', qn.image_path) : null,
      qn.stem ? h('p', { class: 'stem small' }, qn.stem) : null,
      h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => qn.choices?.[k] !== undefined).map((k) =>
        h('div', { class: 'opt small' + (k === qn.answer ? ' right' : k === r.answer ? ' wrong' : '') },
          h('b', {}, k), h('span', {}, qn.choices[k]),
          k === r.answer ? h('span', { class: 'muted' }, ' ← seçimi') : null))),
      h('p', { class: 'small muted' }, [
        { mistake: 'Hata tekrarı', topic: 'Konu tekrarı', extra: 'Ek çalışma', deneme: 'Deneme' }[r.track] || '',
        new Date(r.answered_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        r.confidence ? `emin %${r.confidence}` : null,
        `süre ${fmtDuration(r.duration_sec)} / ${fmtDuration(max)}${r.duration_sec > max ? ' (aştı)' : ''}`,
        r.hint_used ? 'ipucu kullandı' : null,
      ].filter(Boolean).join(' · ')),
      !r.correct && r.confidence >= 75 ? h('p', { class: 'small error' }, 'Emin olduğu hâlde yanlış: kavram yanılgısı olabilir.') : null,
      qn.solution ? h('details', {}, h('summary', { class: 'small' }, 'Çözüm'), h('div', { class: 'note small', style: 'margin-top: 6px' }, qn.solution)) : null);
  };

  function draw() {
    const subjOk = (subj) => filter.subject === 'all' || subj === filter.subject;
    const outcomeOk = (correct) => filter.outcome === 'all' || (filter.outcome === 'missed' ? !correct : correct);
    const rows = filter.source === 'exam'
      ? examRows.filter((r) => subjOk(r.subject) && outcomeOk(r.outcome === 'dogru'))
      : reviewRows.filter((r) => subjOk(r.questions?.subject) && outcomeOk(r.correct));
    fill(list,
      h('p', { class: 'small muted' }, `${rows.length} soru`),
      rows.slice(0, shown).map(filter.source === 'exam' ? examCard : reviewCard),
      rows.length > shown ? h('button', { class: 'block', onclick: () => { shown += 20; draw(); } }, 'Daha fazla göster') : null,
      !rows.length ? h('div', { class: 'card flat' }, h('p', { class: 'muted small' }, 'Bu seçimde soru yok.')) : null);
  }

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, `Sorular · ${state.student.display_name}`),
      h('h1', {}, 'Hangi soruları yaptı, hangilerini kaçırdı?')),
    h('section', { class: 'stack', style: 'gap: 8px' },
      chipGroup('source', [['exam', 'Denemeler'], ['review', 'Tekrarlar']]),
      chipGroup('outcome', [['missed', 'Kaçırdıkları'], ['correct', 'Doğruları'], ['all', 'Hepsi']]),
      subjects.length > 1 ? chipGroup('subject', [['all', 'Bütün dersler'], ...subjects.map((x) => [x, SUBJECTS[x].name])]) : null),
    list);
  draw();
}

// ---------------------------------------------------------------- veli raporu

async function viewReport() {
  loading('Rapor hazırlanıyor…');
  const s = sid();
  const [exams, results, eqs, topics, statuses, items, reviews30, subs, runs] = await Promise.all([
    q(sb.from('exams').select('*').eq('student_id', s).order('exam_date')),
    q(sb.from('exam_results').select('*').eq('student_id', s)),
    q(sb.from('exam_questions').select('exam_id, subject, topic_id, styles, outcome, marked_guess, coding_error, diagnosis_cause, student_reason, misconception').eq('student_id', s)),
    q(sb.from('topics').select('*').in('grade', studentGrades(state.student))),
    q(sb.from('topic_status').select('*').eq('student_id', s)),
    q(sb.from('items').select('*').eq('student_id', s)),
    q(sb.from('reviews').select('id, item_id, question_id, track, answer, correct, understood, needs_help, together_at, duration_sec, confident, confidence, hint_used, answered_at, questions(subject, topic_id)')
      .eq('student_id', s).eq('voided', false).gte('answered_at', addDays(localDate(), -30))),
    q(sb.from('submissions').select('id, kind, status, submitted_at, processed_at, result_note, exams(name)').or(`student_id.eq.${s},student_id.is.null`).neq('status', 'draft').order('created_at', { ascending: false }).limit(6)),
    q(sb.from('job_runs').select('*').order('started_at', { ascending: false }).limit(1)),
  ]);
  const [feedbackRows, togetherRows] = await Promise.all([
    q(sb.from('question_feedback').select('kind, verdict, status').eq('student_id', s)),
    loadTogether(),
  ]);
  const reviews = reviews30.filter((r) => r.answered_at >= addDays(localDate(), -14));
  const topicName = Object.fromEntries(topics.map((t) => [t.id, t]));
  const missed = eqs.filter((e) => e.outcome !== 'dogru');
  const studentName = state.student?.display_name || '';
  const who = studentName ? `${studentName}’nın` : 'Öğrencinin';

  // Özet kutuları
  const last = exams[exams.length - 1];
  const lastRes = last ? results.filter((r) => r.exam_id === last.id) : [];
  const net = (rs) => rs.reduce((s, r) => s + r.correct - r.wrong / 3, 0);
  const gaps = statuses.filter((s) => s.status === 'gap');
  const settled = items.filter((i) => i.track === 'topic' && i.step >= 4).length;
  const today = localDate();
  const reviewedToday = reviews.filter((r) => localDate(new Date(r.answered_at)) === today).length;

  const tiles = h('div', { class: 'tiles' },
    tile('Son deneme neti', last ? net(lastRes).toFixed(2).replace('.', ',') : '–', last ? last.name : 'Henüz deneme yok'),
    tile('Son denemede yanlış + boş', last ? lastRes.reduce((s, r) => s + r.wrong + r.blank, 0) : '–', 'Hedef: 0'),
    tile('Eksik konu', gaps.length, gaps.length ? 'Aşağıda özel ders notları var' : 'Şu an yok'),
    tile('Bugün çözülen tekrar', reviewedToday, `${settled} konu oturdu`));

  // Denemeler tablosu
  const examTable = exams.length ? h('div', { class: 'scroll-x' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Deneme'), visibleSubjects().map((s) => h('th', {}, SUBJECTS[s].name.split(' ')[0])), h('th', {}, 'Net'))),
    h('tbody', {}, [...exams].reverse().map((e) => {
      const rs = results.filter((r) => r.exam_id === e.id);
      return h('tr', {},
        h('td', {}, h('div', {}, e.name), h('div', { class: 'small muted' }, fmtDate(e.exam_date) + (e.time_note ? ' · ' + e.time_note : ''))),
        visibleSubjects().map((s) => { const r = rs.find((x) => x.subject === s); return h('td', {}, r ? `${r.wrong}Y ${r.blank}B` : '–'); }),
        h('td', {}, rs.length ? net(rs).toFixed(2).replace('.', ',') : '–'));
    })))) : h('p', { class: 'muted' }, 'İlk deneme işlendiğinde burada görünecek.');

  // Hata nedenleri: öğrenci ne dedi, Claude ne gördü
  const answered = missed.filter((m) => m.student_reason && m.diagnosis_cause);
  const countBy = (arr, f) => arr.reduce((acc, x) => { const k = f(x); if (k) acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const studentSplit = countBy(answered, (m) => REASON_GROUP[m.student_reason]);
  const claudeSplit = countBy(missed.filter((m) => m.diagnosis_cause), (m) => CAUSE_GROUP[m.diagnosis_cause]);
  const agree = answered.filter((m) => REASON_GROUP[m.student_reason] === CAUSE_GROUP[m.diagnosis_cause]).length;
  const coding = missed.filter((m) => m.coding_error).length;

  const causes = h('section', { class: 'card' },
    h('h2', {}, 'Yanlışlar nereden geliyor?'),
    splitBar('Claude’un teşhisi', claudeSplit),
    splitBar(`${who} kendi seçimi`, studentSplit),
    h('div', { class: 'legend' }, Object.entries(GROUP_LABEL).map(([k, l]) => h('span', { style: `--c: ${GROUP_COLOR[k]}` }, l))),
    answered.length ? h('p', { class: 'small' }, `Öğrencinin seçimi ile teşhis ${answered.length} sorunun ${agree} tanesinde aynı (%${Math.round((agree / answered.length) * 100)}).` +
      (answered.length - agree ? ' Farklı olanlar, eksiğinin farkında olmadığı yerleri gösterir.' : '')) : null,
    coding ? h('p', { class: 'small' }, h('b', {}, `${coding} soruda `), 'kitapçıkta doğru çözüp optiğe yanlış kodlamış.') : null);

  // Derse ve konuya göre
  const bySubject = countBy(missed, (m) => m.subject);
  const maxSubj = Math.max(1, ...Object.values(bySubject));
  const byTopic = Object.entries(countBy(missed.filter((m) => m.topic_id), (m) => m.topic_id)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const subjects = h('section', { class: 'card' },
    h('h2', {}, 'Derslere göre yanlış ve boş'),
    studentSubjects(state.student).filter((s) => bySubject[s]).map((s) => bar(SUBJECTS[s].name, bySubject[s], maxSubj, `var(--c-${s})`)),
    byTopic.length ? [h('h3', { style: 'margin-top: 8px' }, 'En çok tekrar eden konular'),
      byTopic.map(([t, n]) => h('div', { class: 'spread small' }, h('span', {}, topicName[t]?.name || t), h('b', { class: 'num' }, n)))] : null,
    !missed.length ? h('p', { class: 'muted' }, 'Henüz veri yok.') : null);

  // Soru tipine göre
  const styleStats = {};
  for (const e of eqs) for (const s of e.styles || []) {
    styleStats[s] ||= { total: 0, miss: 0 };
    styleStats[s].total++;
    if (e.outcome !== 'dogru') styleStats[s].miss++;
  }
  const styleRows = Object.entries(styleStats).filter(([, v]) => v.total >= 3).sort((a, b) => b[1].miss / b[1].total - a[1].miss / a[1].total);
  const styles = styleRows.length ? h('section', { class: 'card' },
    h('h2', {}, 'Soru tipine göre kaçırma oranı'),
    h('p', { class: 'small muted' }, 'En az 3 soru görülen tipler.'),
    styleRows.map(([s, v]) => bar(STYLE_LABEL[s] || s, Math.round((v.miss / v.total) * 100), 100, 'var(--amber)', '%'))) : null;

  // Kavram yanılgıları
  const misc = missed.filter((m) => m.misconception).slice(-6).reverse();
  const misconceptions = misc.length ? h('section', { class: 'card' },
    h('h2', {}, 'Son görülen kavram yanılgıları'),
    misc.map((m) => h('div', { class: 'note teacher small' }, h('b', {}, (topicName[m.topic_id]?.name || SUBJECTS[m.subject]?.name) + ': '), m.misconception))) : null;

  // Eksik konular ve özel ders notları
  const gapCards = gaps.length ? h('section', { class: 'stack' },
    h('h2', {}, 'Özel derste çalışılacaklar'),
    gaps.map((g) => h('div', { class: 'card' },
      h('div', { class: 'row' }, subjTag(topicName[g.topic_id]?.subject), h('b', {}, topicName[g.topic_id]?.name || g.topic_id)),
      h('p', { class: 'small muted' }, `${fmtDate(g.gap_since)} tarihinden beri: aynı konuda 3 kez üst üste kaçırdı.`),
      g.tutor_note ? h('div', { class: 'note teacher' }, g.tutor_note) : h('p', { class: 'small muted' }, 'Not bir sonraki saatlik çalışmada hazırlanacak.'),
      g.lesson ? h('details', {}, h('summary', {}, 'Öğrenciye yazılan konu anlatımı'), h('div', { class: 'note small', style: 'margin-top: 8px' }, g.lesson)) : null,
      h('a', { class: 'btn', href: g.youtube_query ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(g.youtube_query)
        : youtubeSearch(topicName[g.topic_id]?.name),
        target: '_blank', rel: 'noopener' }, 'YouTube’da konu anlatımı')))) : null;

  // Zayıf konular: son 30 günün tekrarları ve bütün denemeler birlikte; her konuya YouTube konu anlatımı.
  const topicStats = {};
  const ts = (id) => (topicStats[id] ||= { n: 0, ok: 0, sureWrong: 0, lucky: 0, examMiss: 0, misconceptions: [] });
  for (const r of reviews30) {
    const id = r.questions?.topic_id; if (!id) continue;
    const t = ts(id);
    t.n++; if (r.correct) t.ok++;
    if (!r.correct && r.confidence >= 75) t.sureWrong++;
    if (r.correct && r.confidence && r.confidence <= 50) t.lucky++;
  }
  for (const e of eqs) {
    if (!e.topic_id) continue;
    const t = ts(e.topic_id);
    t.n++; if (e.outcome === 'dogru') t.ok++; else t.examMiss++;
    if (e.misconception) t.misconceptions.push(e.misconception);
  }
  const gapIds = new Set(gaps.map((g) => g.topic_id));
  const weak = Object.entries(topicStats)
    .filter(([id, t]) => topicName[id] && !gapIds.has(id) && t.n >= 3 && (t.ok / t.n < 0.75 || t.sureWrong > 0))
    .sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
    .slice(0, 10);
  const youtube = youtubeSearch;
  const weakCards = h('section', { class: 'stack' },
    h('h2', {}, 'Zayıf konular'),
    h('p', { class: 'small muted' }, 'Son 30 günün tekrarları ve denemeler. Başarısı %75’in altında olan ya da emin olduğu hâlde yanlış yaptığı konular.'),
    weak.length ? weak.map(([id, t]) => h('div', { class: 'card' },
      h('div', { class: 'spread' },
        h('div', { class: 'row' }, subjTag(topicName[id].subject), h('b', {}, topicName[id].name)),
        h('span', { class: 'tag ' + (t.ok / t.n < 0.5 ? 'red' : 'amber') }, `%${Math.round((t.ok / t.n) * 100)}`)),
      h('p', { class: 'small' }, `${t.n} sorunun ${t.ok} tanesi doğru` +
        (t.examMiss ? ` · denemelerde ${t.examMiss} yanlış/boş` : '') +
        (t.sureWrong ? ` · ${t.sureWrong} kez emin ama yanlış` : '') +
        (t.lucky ? ` · ${t.lucky} kez tahminle doğru` : '')),
      t.misconceptions.length ? h('div', { class: 'note teacher small' }, h('b', {}, 'Görülen yanılgı: '), t.misconceptions[t.misconceptions.length - 1]) : null,
      topicName[id].kazanim ? h('p', { class: 'small muted' }, 'Kapsam: ' + topicName[id].kazanim) : null,
      h('a', { class: 'btn', href: youtube(topicName[id].name), target: '_blank', rel: 'noopener' }, 'YouTube’da konu anlatımı')))
      : h('div', { class: 'card flat' }, h('p', { class: 'muted small' },
          Object.keys(topicStats).length ? 'Şu an zayıf görünen konu yok.' : `${studentName || 'Öğrenci'} soru çözdükçe burada konu konu başarı görünecek.`)));

  // Son 14 günün tekrar performansı
  const perf = reviews.length ? (() => {
    const bySub = {};
    for (const r of reviews) {
      const s = r.questions?.subject; if (!s) continue;
      bySub[s] ||= { n: 0, ok: 0, slow: 0, sureWrong: 0, luckyRight: 0 };
      bySub[s].n++; if (r.correct) bySub[s].ok++;
      if (r.duration_sec > maxSeconds(s)) bySub[s].slow++;
      if (!r.correct && r.confidence >= 75) bySub[s].sureWrong++;
      if (r.correct && r.confidence && r.confidence <= 50) bySub[s].luckyRight++;
    }
    const days = new Set(reviews.map((r) => r.answered_at.slice(0, 10))).size;
    const sureWrong = Object.values(bySub).reduce((a, b) => a + b.sureWrong, 0);
    return h('section', { class: 'card' },
      h('h2', {}, 'Son 14 gün tekrarlar'),
      h('p', { class: 'small muted' }, `${reviews.length} soru, ${days} farklı günde.`),
      h('div', { class: 'scroll-x' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Ders'), h('th', {}, 'Soru'), h('th', {}, 'Doğru'), h('th', {}, 'Süreyi aşan'), h('th', {}, 'Emin ama yanlış'), h('th', {}, 'Tahminle doğru'))),
        h('tbody', {}, studentSubjects(state.student).filter((s) => bySub[s]).map((s) => h('tr', {},
          h('td', {}, SUBJECTS[s].name), h('td', {}, bySub[s].n),
          h('td', {}, `%${Math.round((bySub[s].ok / bySub[s].n) * 100)}`),
          h('td', {}, `%${Math.round((bySub[s].slow / bySub[s].n) * 100)}`),
          h('td', {}, bySub[s].sureWrong),
          h('td', {}, bySub[s].luckyRight)))))),
      sureWrong ? h('p', { class: 'small' }, h('b', {}, 'Emin ama yanlış'), ' cevaplar en önemli sinyal: genelde yanlış öğrenilmiş bir kavramı gösterir. Özel derste öncelik bunlara verilmeli.') : null);
  })() : null;

  // Yaklaşan yük
  const upcoming = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const day = addDays(today, d);
    return { day, n: items.filter((i) => i.state === 'active' && (d === 0 ? i.due_date <= day : i.due_date === day)).length };
  });
  const maxUp = Math.max(1, ...upcoming.map((u) => u.n));
  const load = h('section', { class: 'card' },
    h('h2', {}, 'Önümüzdeki 7 gün'),
    h('p', { class: 'small muted' }, 'Günü gelen tekrar maddesi sayısı (hata + konu).'),
    upcoming.map((u, i) => bar(i === 0 ? 'Bugün' : parseDay(u.day).toLocaleDateString('tr-TR', { weekday: 'long' }), u.n, maxUp, 'var(--accent)')));

  // İşleme durumu
  const job = h('section', { class: 'card' },
    h('h2', {}, 'Yüklemeler'),
    subs.length ? subs.map((s) => h('div', { class: 'stack', style: 'gap: 4px' },
      h('div', { class: 'spread' }, h('span', {}, subLabel(s)), statusTag(s.status)),
      s.result_note ? h('p', { class: 'small muted' }, s.result_note) : null)) : h('p', { class: 'muted' }, 'Henüz yükleme yok.'),
    feedbackRows.length ? h('p', { class: 'small muted' },
      `Soru bildirimi: ${feedbackRows.length}. Kontrol edilen ${feedbackRows.filter((f) => f.status === 'checked').length}, ` +
      `hatalı bulunan ${feedbackRows.filter((f) => f.verdict === 'soru_hatali').length}.`) : null,
    runs[0] ? h('p', { class: 'small muted' }, `Saatlik görev en son ${new Date(runs[0].started_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} çalıştı.`) : null);

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, isTeacherView() ? 'Öğretmen görünümü' : 'Veli raporu'), h('h1', {}, studentName ? `${studentName} nasıl gidiyor?` : 'Nasıl gidiyor?'),
      isLgsStudent(state.student) ? h('p', { class: 'muted' }, `LGS'ye ${daysBetween(today, (state.student || state.profile).lgs_date)} gün var.`)
        : h('p', { class: 'muted' }, `${state.student.grade}. sınıf · pratik`)),
    tiles, state.profile.role === 'parent' ? messageBox() : null, togetherBox(togetherRows), dayReport(reviews30, items, topicName),
    reportedBox(), poemBox(), wordBox(),
    h('section', { class: 'card' }, h('h2', {}, 'Denemeler'), examTable),
    gapCards, weakCards, causes, subjects, styles, misconceptions, perf, load, job);
}

/* Gün gün çalışma (son 30 gün): seçili günde konu konu kaç soru, kaçı doğru, kaçı yanlış, ne kadar sürdü.
   Her yanlış için "anladı mı?": kendi beyanı ve aynı konudan sonra çözdüğü sorulardaki sonuç.
   Tahminle (emin değilken) doğru cevap anlamış sayılmaz. */
function dayReport(reviews, items, topicName) {
  const box = h('section', { class: 'card stack' });
  const today = localDate();
  const dayOf = (r) => localDate(new Date(r.answered_at));
  const byTime = (a, b) => (a.answered_at < b.answered_at ? -1 : 1);
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const solid = (r) => r.correct && !(r.confidence && r.confidence <= 50);
  const trackName = { mistake: 'hata tekrarı', topic: 'konu tekrarı', extra: 'ek çalışma', deneme: 'deneme' };
  let day = today;

  // "Anlamadım" ya da "birlikte bakalım" dediyse tek doğru yetmez: çözümü yeni okumuş olabilir.
  const verdictFor = (r) => {
    const later = reviews.filter((x) => x.questions?.topic_id === r.questions?.topic_id && x.answered_at > r.answered_at);
    const ok = later.filter(solid).length;
    const saidNo = r.understood === false || r.needs_help;
    if (!later.length) return saidNo ? [r.needs_help ? 'Birlikte bakılacak' : 'Anlamadım dedi', 'red', 'Bu konudan henüz yeni soru çözmedi.']
      : [r.understood ? 'Anladım dedi, henüz sınanmadı' : 'Henüz belli değil', 'amber', 'Bu konudan henüz yeni soru çözmedi.'];
    const detail = `Sonra bu konudan ${later.length} soru çözdü: ${ok} doğru` + (later.length - ok ? `, ${later.length - ok} yanlış ya da tahmin.` : '.');
    if (ok === later.length && !(saidNo && ok < 2)) return ['Anlamış görünüyor', 'green', detail];
    return ok ? ['Kısmen oturdu', 'amber', detail] : ['Hâlâ zorlanıyor', 'red', detail];
  };

  // Soru metni sadece açılınca yüklenir.
  const questionDetails = (r) => {
    const body = h('div', { class: 'stack', style: 'gap: 4px; margin-top: 6px' }, h('p', { class: 'small muted' }, 'Yükleniyor…'));
    const d = h('details', {}, h('summary', { class: 'small' }, 'Soruyu göster'), body);
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = '1';
      try {
        const qn = await q(sb.from('questions').select('stem, choices, answer, solution, image_path').eq('id', r.question_id).single());
        fill(body,
          qn.image_path ? lazyImg('questions', qn.image_path) : null,
          qn.stem ? h('p', { class: 'stem small' }, qn.stem) : null,
          ['A', 'B', 'C', 'D'].filter((k) => qn.choices?.[k] !== undefined).map((k) =>
            h('div', { class: 'opt small' + (k === qn.answer ? ' right' : k === r.answer ? ' wrong' : '') },
              h('b', {}, k), h('span', {}, qn.choices[k]), k === r.answer ? h('span', { class: 'muted' }, ' ← seçimi') : null)),
          qn.solution ? h('div', { class: 'note small' }, qn.solution) : null);
      } catch (e) {
        delete d.dataset.loaded;
        fill(body, h('p', { class: 'small muted' }, 'Soru yüklenemedi.'));
      }
    });
    return d;
  };

  const draw = () => {
    const rows = reviews.filter((r) => dayOf(r) === day).sort(byTime);
    const days = [...new Set(reviews.map(dayOf))].sort();
    const prev = days.filter((d) => d < day).pop();
    const next = days.find((d) => d > day) || today;
    const label = day === today ? 'Bugün' : day === addDays(today, -1) ? 'Dün'
      : parseDay(day).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    const nav = h('div', { class: 'spread' },
      h('button', { class: 'ghost small', disabled: !prev || null, onclick: () => { day = prev; draw(); } }, '‹ Önceki'),
      h('b', {}, label),
      h('button', { class: 'ghost small', disabled: day === today || null, onclick: () => { day = next; draw(); } }, 'Sonraki ›'));
    if (!rows.length) {
      return fill(box, h('h2', {}, 'Gün gün çalışma'), nav,
        h('p', { class: 'muted small' }, day === today ? 'Bugün henüz soru çözmedi.' : 'Bu gün soru çözmemiş.'));
    }

    const ok = rows.filter((r) => r.correct).length;
    const blank = rows.filter((r) => r.needs_help).length;
    const sec = rows.reduce((a, r) => a + (r.duration_sec || 0), 0);
    const tracks = {};
    rows.forEach((r) => { tracks[r.track] = (tracks[r.track] || 0) + 1; });
    const oldMistakes = rows.filter((r) => r.track === 'mistake');

    const byTopic = {};
    for (const r of rows) {
      const t = byTopic[r.questions?.topic_id || '?'] ||= { subject: r.questions?.subject, n: 0, ok: 0, sec: 0 };
      t.n++; if (r.correct) t.ok++; t.sec += r.duration_sec || 0;
      if (r.needs_help) t.blank = (t.blank || 0) + 1;
    }
    const topicRows = Object.entries(byTopic).sort((a, b) =>
      (studentSubjects(state.student).indexOf(a[1].subject) - studentSubjects(state.student).indexOf(b[1].subject)) || ((topicName[a[0]]?.sort ?? 0) - (topicName[b[0]]?.sort ?? 0)));

    const wrongs = rows.filter((r) => !r.correct).map((r) => ({ r, v: verdictFor(r) }));
    const tally = {};
    wrongs.forEach(({ v }) => { tally[v[1]] = (tally[v[1]] || 0) + 1; });

    fill(box,
      h('h2', {}, 'Gün gün çalışma'),
      nav,
      h('p', {}, `${rows.length} soru · ${ok} doğru · ${rows.length - ok - blank} yanlış` + (blank ? ` · ${blank} boş` : '') + ` · ${fmtMinutes(sec)}`),
      h('p', { class: 'small muted' }, Object.keys(trackName).filter((k) => tracks[k]).map((k) => `${tracks[k]} ${trackName[k]}`).join(' · ')
        + (oldMistakes.length ? `. Eski yanlışlarından gelen ${oldMistakes.length} sorunun ${oldMistakes.filter(solid).length} tanesini emin olarak doğru yaptı.` : '')),
      h('div', { class: 'scroll-x' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Konu'), h('th', {}, 'Soru'), h('th', {}, 'Doğru'), h('th', {}, 'Yanlış'), h('th', {}, 'Süre'))),
        h('tbody', {}, topicRows.map(([id, t]) => h('tr', {},
          h('td', {}, h('div', {}, topicName[id]?.name || '—'), h('div', { class: 'small muted' }, SUBJECTS[t.subject]?.name || '')),
          h('td', {}, t.n), h('td', {}, t.ok),
          h('td', { style: t.n - t.ok ? 'color: var(--red); font-weight: 600' : null }, t.n - t.ok - (t.blank || 0) + (t.blank ? ` +${t.blank} boş` : '')),
          h('td', { class: 'num' }, fmtMinutes(t.sec))))))),
      wrongs.length ? [
        h('h3', { style: 'margin-top: 8px' }, 'Yanlışlarını anladı mı?'),
        h('p', { class: 'small muted' }, [
          tally.green ? `${tally.green} tanesinde sonra doğru yaptı` : null,
          tally.amber ? `${tally.amber} tanesi henüz belli değil ya da kısmen oturdu` : null,
          tally.red ? `${tally.red} tanesinde hâlâ zorlanıyor` : null,
        ].filter(Boolean).join(', ') + '. Kendi "anladım / anlamadım" cevabı ve aynı konudan sonraki sorulara bakılır.'),
        wrongs.map(({ r, v }) => {
          const it = itemById[r.item_id];
          const conf = CONFIDENCE_LEVELS.find(([c]) => c === r.confidence)?.[1];
          return h('div', { class: 'stack', style: 'gap: 4px; padding: 10px 0; border-top: 1px solid var(--rule)' },
            h('div', { class: 'spread' },
              h('div', { class: 'row' }, subjTag(r.questions?.subject), h('span', { class: 'small' }, topicName[r.questions?.topic_id]?.name || '')),
              h('span', { class: 'tag ' + v[1] }, v[0])),
            h('p', { class: 'small muted' }, [
              new Date(r.answered_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              trackName[r.track], conf, fmtDuration(r.duration_sec || 0) + (r.hint_used ? ', ipucuyla' : ''),
            ].filter(Boolean).join(' · ')),
            h('p', { class: 'small' }, (r.needs_help ? 'Boş geçti, "birlikte bakalım" dedi. ' : '') + v[2]
              + (r.understood === true ? ' Kendisi "anladım" dedi.' : r.understood === false ? ' Kendisi "anlamadım" dedi.' : '')
              + (r.confidence >= 75 ? ' Emin olduğu hâlde yanlış: kavram yanılgısı olabilir.' : '')
              + (r.together_at ? ` Birlikte baktınız (${fmtDate(localDate(new Date(r.together_at)))}).` : '')),
            it && it.state === 'active' && it.due_date > day ? h('p', { class: 'small muted' }, `Bu konu tekrar soruları ${fmtDate(it.due_date)} günü gelecek.`) : null,
            questionDetails(r));
        })] : h('p', { class: 'small', style: 'color: var(--green)' }, 'Bu gün hiç yanlışı yok.'));
  };
  draw();
  return box;
}

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('span', { class: 'label' }, label), h('span', { class: 'v' }, value), sub ? h('span', { class: 'small muted' }, sub) : null);
}
function bar(label, value, max, color, unit = '') {
  return h('div', { class: 'bar' },
    h('span', {}, label),
    h('span', { class: 'track' }, h('i', { style: `width: ${(value / max) * 100}%; --subj: ${color}` })),
    h('b', { class: 'num', style: 'text-align: right' }, value + unit));
}
function splitBar(label, counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return h('div', { class: 'stack', style: 'gap: 6px' },
    h('div', { class: 'spread small' }, h('span', {}, label), h('span', { class: 'muted num' }, total ? `${total} soru` : 'veri yok')),
    h('div', { class: 'split' }, total ? Object.keys(GROUP_LABEL).map((k) =>
      counts[k] ? h('i', { style: `width: ${(counts[k] / total) * 100}%; background: ${GROUP_COLOR[k]}`, title: `${GROUP_LABEL[k]}: ${counts[k]}` }) : null) : null),
    total ? h('div', { class: 'small muted' }, Object.keys(GROUP_LABEL).filter((k) => counts[k]).map((k) => `${GROUP_LABEL[k]} %${Math.round((counts[k] / total) * 100)}`).join(' · ')) : null);
}

// ---------------------------------------------------------------- başlat

// Kendini güncellemeden gelinmişse adresteki ?v= temizlenir (giriş bağlantılarının #... kısmına dokunulmaz).
if (/[?&]v=\d+/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash);
checkForUpdate();

// Süresi dolmuş ya da kullanılmış bir giriş/sıfırlama bağlantısı açılırsa adres hatayla gelir.
const linkError = new URLSearchParams(location.hash.slice(1)).get('error_code');
if (linkError) {
  history.replaceState(null, '', location.pathname);
  setTimeout(() => toast(linkError === 'otp_expired'
    ? 'Bu bağlantının süresi dolmuş ya da daha önce kullanılmış. Şifrenle giriş yap ya da yeni bağlantı iste.'
    : 'Bağlantı açılamadı. Şifrenle giriş yap ya da yeni bağlantı iste.'), 600);
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') viewLogin();
  if (event === 'PASSWORD_RECOVERY') {
    state.inRecovery = true;
    state.user = session?.user || state.user;
    viewNewPassword();
  }
});
start().catch((e) => render(failBox(e)));
