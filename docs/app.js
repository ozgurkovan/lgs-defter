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
};
const maxSeconds = (subject) => SUBJECTS[subject]?.sec || 90;
// LGS kitapçık sırası: sözel oturum Türkçe, İnkılap, Din, İngilizce; sayısal oturum Matematik, Fen.
const SUBJECT_ORDER = ['turkce', 'inkilap', 'din', 'ingilizce', 'matematik', 'fen'];

// Günlük plan: derse göre günde en fazla kaç soru. Veli ayarlamadıysa günlük hedef LGS'deki
// soru ağırlığıyla bölünür (40 → Türkçe 9, İnkılap 4, Din 4, İngilizce 4, Matematik 10, Fen 9).
const DEFAULT_PLAN = { turkce: 9, inkilap: 4, din: 4, ingilizce: 4, matematik: 10, fen: 9 };
function dailyPlan(p) {
  if (p?.daily_by_subject) return Object.fromEntries(SUBJECT_ORDER.map((s) => [s, Math.max(0, +p.daily_by_subject[s] || 0)]));
  const k = (p?.daily_questions || 40) / 40;
  return Object.fromEntries(SUBJECT_ORDER.map((s) => [s, Math.round(DEFAULT_PLAN[s] * k)]));
}
const planTotal = (plan) => SUBJECT_ORDER.reduce((n, s) => n + (plan[s] || 0), 0);

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
function youtubeSearch(topic) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`LGS ${state.student?.grade || 8}. sınıf ${topic || ''} konu anlatımı`);
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
  const bar = state.profile && !state.session
    ? h('div', { class: 'topbar' }, studentSwitcher(),
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
  return allowed ? SUBJECT_ORDER.filter((s) => allowed.includes(s)) : SUBJECT_ORDER;
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
  topics: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
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
  if (!state.profile || state.session) return;
  const role = state.profile.role;
  const tabs = role === 'parent'
    ? (state.student
      ? [['report', 'Rapor', 'report'], ['questions', 'Sorular', 'questions'], ['topics', 'Konular', 'topics'], ['upload', 'Deneme', 'upload'], ['settings', 'Ayarlar', 'settings']]
      : [['settings', 'Ayarlar', 'settings']])
    : role === 'teacher'
      ? [['report', 'Rapor', 'report'], ['questions', 'Sorular', 'questions'], ['topics', 'Konular', 'topics'], ['settings', 'Ayarlar', 'settings']]
      : [['home', 'Bugün', 'home'], ['upload', 'Deneme yükle', 'upload'], ['topics', 'Konularım', 'topics'], ['settings', 'Ayarlar', 'settings']];
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

function go(tab) {
  if (!confirmLeave()) return;
  state.tab = tab;
  state.session = null;
  window.scrollTo(0, 0);
  const views = {
    home: viewHome, upload: () => viewUpload('deneme'), book: () => viewUpload('kitap'),
    topics: viewTopics, settings: viewSettings, report: viewReport, reasons: viewReasons, questions: viewQuestions,
    together: viewTogether,
  };
  Promise.resolve((views[tab] || viewHome)()).catch((e) => render(failBox(e)));
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
    if (profile.role === 'parent') return go('settings'); // ilk çocuğu Aile bölümünden ekler
    return render(h('div', { class: 'card' },
      h('h2', {}, 'Henüz bağlı öğrenci yok'),
      h('p', { class: 'muted' }, profile.role === 'teacher'
        ? 'Bir veli size çocuğunu açtığında burada görünecek.'
        : 'Hesabınız henüz bir öğrenciye bağlanmamış.'),
      h('button', { onclick: signOut }, 'Çıkış yap')));
  }
  go(profile.role === 'student' ? 'home' : 'report');
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
  const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('p', { class: 'error', hidden: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) { msg.className = 'error'; msg.textContent = 'E-posta veya şifre yanlış.'; msg.hidden = false; return; }
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
      msg.textContent = error
        ? 'Şu an gönderilemedi (saatte en fazla 2 sıfırlama e-postası gidebiliyor). Biraz sonra tekrar dene ya da velinden yardım iste.'
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
    if (error) { msg.textContent = 'Şifre değiştirilemedi: ' + error.message; msg.hidden = false; return; }
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
function gradeItem(item, results, lgsDate) {
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
  const items = await q(sb.from('items').select('*, topics(subject, name, sort)')
    .eq('student_id', sid()).eq('track', track).eq('state', 'active').lte('due_date', today));
  if (!items.length) return { entries: [], shortage: 0, seconds: 0, dueCount: 0, deferred: 0 };

  const topicIds = [...new Set(items.map((i) => i.topic_id))];
  const [pool, seenRows, missRows] = await Promise.all([
    q(sb.from('questions').select('id, topic_id, subject, styles, target_seconds, stem, image_path, choices, answer, hint, solution')
      .in('topic_id', topicIds).eq('active', true)),
    q(sb.from('reviews').select('question_id').eq('student_id', sid())),
    q(sb.from('exam_questions').select('topic_id, styles').eq('student_id', sid()).neq('outcome', 'dogru').in('topic_id', topicIds)),
  ]);
  const seen = new Set(seenRows.map((r) => r.question_id));
  const missedStyles = {};
  for (const r of missRows) {
    const set = (missedStyles[r.topic_id] ||= new Set());
    (r.styles || []).forEach((s) => set.add(s));
  }

  for (const it of items) {
    const coef = SUBJECTS[it.topics?.subject]?.coef || 1;
    it._priority = coef * (1 + Math.max(0, daysBetween(it.due_date, today))) + Math.random() * 0.5;
  }
  items.sort((a, b) => b._priority - a._priority);

  const used = new Set();
  const entries = [];
  let seconds = 0, shortage = 0, deferred = 0;
  const basePerItem = track === 'mistake' ? 1 : TOPIC_QUESTIONS_PER_REVIEW;
  for (const it of items) {
    // Emin olmadığı maddelere destek soruları eklenir; her yeni soru mümkünse farklı bir tarzda olur.
    const want = basePerItem + (it.support || 0);
    // Tekrar yarım kalmasın: maddenin soruları dersin kalan hakkına sığmıyorsa madde ertesi güne kalır.
    const room = remaining[it.topics?.subject] || 0;
    if (room < want) { deferred += want; continue; }
    const styles = missedStyles[it.topic_id] || new Set();
    const candidates = shuffle(pool.filter((p) => p.topic_id === it.topic_id && !seen.has(p.id) && !used.has(p.id)))
      .sort((a, b) => overlap(b.styles, styles) - overlap(a.styles, styles));
    if (!candidates.length) { shortage++; continue; }
    const picked = pickVaried(candidates, want);
    remaining[it.topics.subject] -= picked.length;
    picked.forEach((p, i) => { used.add(p.id); entries.push({ item: it, question: p, last: i === picked.length - 1 }); });
    seconds += picked.reduce((s, p) => s + maxSeconds(p.subject) + 15, 0);
  }
  return { entries, shortage, seconds, dueCount: items.length, deferred };
}
/* Ek çalışma: günü gelen tekrarlar bir dersin günlük sayısını doldurmuyorsa açığı kapatır.
   Takipteki konulardan en zayıf olanlardan başlar, her konudan sırayla görülmemiş bir soru alır.
   Takvimi bozmaz: sadece yanlış yapılan konunun tekrarı yarına çekilir. */
async function buildExtra(remaining, exclude) {
  if (!SUBJECT_ORDER.some((s) => remaining[s] > 0)) return { entries: [], seconds: 0 };
  const today = localDate();
  const items = await q(sb.from('items').select('*, topics(subject, name, sort)')
    .eq('student_id', sid()).eq('track', 'topic').eq('state', 'active').gt('due_date', today));
  if (!items.length) return { entries: [], seconds: 0 };
  const [pool, seenRows] = await Promise.all([
    q(sb.from('questions').select('id, topic_id, subject, styles, stem, image_path, choices, answer, hint, solution')
      .in('topic_id', [...new Set(items.map((i) => i.topic_id))]).eq('active', true)),
    q(sb.from('reviews').select('question_id').eq('student_id', sid())),
  ]);
  const seen = new Set([...seenRows.map((r) => r.question_id), ...exclude]);
  items.sort((a, b) => (b.consecutive_wrong - a.consecutive_wrong) || (a.step - b.step) || (a.due_date < b.due_date ? -1 : 1));
  const queues = items.map((it) => ({ it, cands: shuffle(pool.filter((p) => p.topic_id === it.topic_id && !seen.has(p.id))) }));
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
function examOrder(entries) {
  const rank = (e) => {
    const i = SUBJECT_ORDER.indexOf(e.question.subject || e.item.topics?.subject);
    return i < 0 ? SUBJECT_ORDER.length : i;
  };
  return [...entries].sort((a, b) => (rank(a) - rank(b)) || ((a.item.topics?.sort ?? 0) - (b.item.topics?.sort ?? 0)));
}

// ---------------------------------------------------------------- öğrenci: bugün

async function viewHome() {
  loading();
  const [todayCount, reasons, subs, replies, togetherRows] = await Promise.all([
    q(sb.from('reviews').select('id, track, correct, questions(subject)').eq('student_id', sid()).eq('voided', false).gte('answered_at', localDate() + 'T00:00:00')),
    q(sb.from('exam_questions').select('id').eq('student_id', sid()).neq('outcome', 'dogru')
      .is('student_reason', null).not('diagnosis_cause', 'is', null)),
    q(sb.from('submissions').select('id, kind, status, submitted_at, result_note, exams(name)')
      .eq('student_id', sid()).neq('status', 'draft').order('created_at', { ascending: false }).limit(4)),
    q(sb.from('question_feedback').select('id, kind, verdict, response, questions(stem, subject)')
      .eq('student_id', sid()).not('response', 'is', null).eq('response_seen', false).order('checked_at')),
    loadTogether(),
  ]);
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

  const sessionCard = (track, title, s) => {
    const n = s.entries.length;
    const doneToday = todayCount.filter((r) => r.track === track).length;
    return h('section', { class: 'card task' + (n ? '' : ' done') },
      h('div', { class: 'spread' }, h('p', { class: 'label' }, title),
        doneToday ? h('span', { class: 'tag green' }, `Bugün ${doneToday} soru çözdün`) : null),
      n
        ? [h('div', { class: 'row' }, h('span', { class: 'big num' }, n), h('span', { class: 'muted' }, `soru · yaklaşık ${Math.max(1, Math.round(s.seconds / 60))} dakika`)),
           h('button', { class: 'primary block', onclick: () => runSession(track, s) }, 'Başla')]
        : h('p', { class: 'muted' }, doneToday ? 'Bugünlük bu kadar. Aferin.' : 'Bugün tekrar edilecek soru yok.'),
      s.shortage ? h('p', { class: 'small muted' }, `${s.shortage} konu için yeni soru hazırlanıyor, yarın gelecek.`) : null,
      s.deferred ? h('p', { class: 'small muted' }, `${s.deferred} soru günlük sınıra takıldı, yarın gelecek. Velin sınırı Ayarlar'dan artırabilir.`) : null);
  };

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', {}, name ? `${hello}, ${name}` : hello),
      h('p', { class: 'muted' }, `LGS'ye ${daysBetween(localDate(), state.student.lgs_date)} gün var.`)),
    reasons.length
      ? h('section', { class: 'card', style: 'border-color: var(--red)' },
          h('p', { class: 'label', style: 'color: var(--red)' }, 'Önce bu'),
          h('h2', {}, `${reasons.length} yanlışın nedenini seç`),
          h('p', { class: 'muted small' }, 'Her soruya bir dokunuş. Sonra benim yorumumu da görebilirsin.'),
          h('button', { class: 'primary block', onclick: () => go('reasons') }, 'Nedenleri seç'))
      : null,
    sessionCard('mistake', 'Hata tekrarı', mistake),
    sessionCard('topic', 'Konu tekrarı', topic),
    extra.entries.length ? h('section', { class: 'card task' },
      h('div', { class: 'spread' }, h('p', { class: 'label' }, 'Ek çalışma'),
        h('span', { class: 'small muted num' }, `Günlük hedef ${dailyTarget} soru · bugün ${todayCount.length}`)),
      h('div', { class: 'row' }, h('span', { class: 'big num' }, extra.entries.length),
        h('span', { class: 'muted' }, `soru · yaklaşık ${Math.max(1, Math.round(extra.seconds / 60))} dakika`)),
      h('p', { class: 'small muted' }, 'Tekrarlardan sonra hedefi tamamlamak için. En zayıf konularından başlıyor.'),
      h('button', { class: dueNow ? 'block' : 'primary block', onclick: () => runSession('extra', extra) }, 'Başla')) : null,
    togetherBox(togetherRows),
    replies.length ? h('section', { class: 'stack' },
      h('p', { class: 'label' }, 'Bildirdiğin sorular'),
      replies.map((r) => {
        const card = h('div', { class: 'card' },
          h('div', { class: 'row' },
            r.questions?.subject ? subjTag(r.questions.subject) : null,
            h('span', { class: 'tag ' + (r.verdict === 'soru_hatali' ? 'green' : '') }, r.verdict === 'soru_hatali' ? 'Haklıydın' : 'Kontrol ettim')),
          r.questions?.stem ? h('p', { class: 'small muted' }, r.questions.stem.slice(0, 120) + (r.questions.stem.length > 120 ? '…' : '')) : null,
          h('div', { class: 'note teacher' }, r.response),
          h('button', { class: 'ghost small', onclick: async () => {
            await sb.from('question_feedback').update({ response_seen: true }).eq('id', r.id);
            card.remove();
          } }, 'Okudum'));
        return card;
      })) : null,
    subs.length ? h('section', { class: 'stack' },
      h('p', { class: 'label' }, 'Son yüklemeler'),
      subs.map((s) => h('div', { class: 'card flat', style: 'padding: 12px' },
        h('div', { class: 'spread' },
          h('span', {}, s.exams?.name || (s.kind === 'kitap' ? 'Kitap sayfaları' : 'Yükleme')),
          statusTag(s.status)),
        s.result_note && s.status !== 'submitted' ? h('p', { class: 'small muted' }, s.result_note) : null))) : null,
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
  state.session = { track, entries: examOrder(s.entries), index: 0, results: new Map(), stats: { correct: 0, total: 0 }, together: [] };
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
  let answered = false, reviewId = null, reviewSaved = null, gradePromise = null, prevItem = null, myResult = null;
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
      : correct && overTime ? `Doğru, ama ${fmtDuration(duration)} sürdü. LGS'de ${SUBJECTS[subject].name} sorusuna en fazla ${fmtDuration(target)} ayırabilirsin; bu konuyu biraz daha hızlandıracağız.`
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
  const reportNote = h('textarea', { id: 'report-note', rows: 2, placeholder: 'İstersen kısaca açıkla (isteğe bağlı)' });
  const reportSend = h('button', { class: 'primary', disabled: true, onclick: () => sendReport() }, 'Gönder');
  const reportChips = FEEDBACK_KINDS.map(([k, label]) => h('button', { class: 'chip', 'aria-pressed': 'false', onclick: (e) => {
    reportKind = k;
    reportChips.forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
    reportSend.disabled = false;
  } }, label));
  report.append(
    h('h3', {}, 'Bu soruda ne sorun var?'),
    h('div', { class: 'chips' }, reportChips),
    reportNote,
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
        h('div', { class: 'row' }, subjTag(subject), h('span', { class: 'small muted' }, item.topics?.name || '')),
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
  const upd = gradeItem(item, results, state.student.lgs_date);
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
    together.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Birlikte bakılacaklar'),
      h('p', { class: 'small muted' }, 'Anlamadığın ya da tahmin ettiğin sorular. Velin ya da öğretmeninle birlikte üstünden geçin; onların raporunda da görünüyor.'),
      together.map((t) => togetherCard(t.question, t))) : null);
}

/* Birlikte bakılacaklar: "Bunu birlikte bakalım" deyip boş geçtiği, tahmin ettiği (%25) ve yanlıştan sonra
   "anlamadım" dediği sorular. Veli birlikte baktıktan sonra işaretler (together_at); öğretmen sadece görür. */
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

// Rapordaki ve öğrenci ana sayfasındaki özet kartı; liste ayrı sayfada açılır.
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
  const canMark = state.profile.role === 'parent';
  const name = state.student?.display_name || 'Öğrenci';
  const trackName = { mistake: 'Hata tekrarı', topic: 'Konu tekrarı', extra: 'Ek çalışma' };
  render(
    h('header', { class: 'stack', style: 'gap: 6px' },
      h('button', { class: 'ghost small', style: 'align-self: flex-start', onclick: () => go(isParentView() ? 'report' : 'home') }, '← Geri'),
      h('h1', {}, 'Birlikte bakılacaklar'),
      h('p', { class: 'muted' }, isParentView()
        ? `${name} bu soruları anlamadığını söyledi ya da tahmin etti. Yanına oturup birlikte çözün, iyice anladığından emin olun.` +
          (canMark ? ' Baktığınız soruyu "Birlikte baktık" ile listeden çıkarın.' : ' Veli birlikte baktıktan sonra listeden çıkarır.')
        : 'Anlamadığın ya da tahmin ettiğin sorular. Velin ya da öğretmeninle birlikte üstünden geçin.')),
    rows.length ? rows.map((r) => {
      const when = h('p', { class: 'small muted' }, [trackName[r.track],
        new Date(r.answered_at).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '));
      const card = togetherCard(r.questions || {}, { answer: r.answer, correct: r.correct, kind: togetherKind(r), topic: r.questions?.topics?.name }, when);
      if (canMark) {
        const btn = h('button', { class: 'block', onclick: async () => {
          btn.disabled = true;
          try { await q(sb.from('reviews').update({ together_at: new Date().toISOString() }).eq('id', r.id)); }
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
    .select('*, topics(name), exams(name)')
    .eq('student_id', sid()).neq('outcome', 'dogru').is('student_reason', null).not('diagnosis_cause', 'is', null)
    .order('exam_id').order('subject').order('q_no'));
  if (!rows.length) return go('home');
  let i = 0;

  const show = () => {
    if (i >= rows.length) { toast('Hepsi tamam.'); return go('home'); }
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
      h('div', { class: 'spread' },
        h('button', { class: 'ghost', onclick: () => go('home') }, '← Geri'),
        h('span', { class: 'small muted num' }, `${i + 1} / ${rows.length}`)),
      h('section', { class: 'card' },
        h('div', { class: 'row' }, subjTag(r.subject), h('span', { class: 'small muted' }, `${r.exams?.name || ''} · ${r.q_no}. soru`)),
        r.image_path ? lazyImg('photos', r.image_path) : null,
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
  const noteInput = h('textarea', { id: 'book-note', rows: 2, placeholder: 'Hangi kitap, hangi konu? (isteğe bağlı)' });

  const status = h('p', { class: 'small muted', hidden: true });
  const sendBtn = h('button', { class: 'primary block', disabled: true, onclick: send }, 'Gönder');
  // Gönder neden kapalı ya da neye dikkat edilmeli: düğmenin hemen altında söylenir.
  const missingNote = h('p', { class: 'small muted' });

  function refresh() {
    if (kind === 'kitap') {
      sendBtn.disabled = !photos.length;
      missingNote.textContent = photos.length ? '' : 'Göndermek için en az bir sayfa ekle.';
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
      // Deneme öğrenciye aittir; kitap sayfaları herkesin kullandığı ortak havuza gider.
      const sub = await q(sb.from('submissions').insert({
        kind, exam_id: examId, student_id: kind === 'deneme' ? sid() : null, uploaded_by: state.user.id,
        note: kind === 'kitap' ? noteInput.value.trim() || null : null,
      }).select().single());
      const folder = kind === 'deneme' ? `${sid()}/${sub.id}` : `books/${sub.id}`;
      const order = { kitapcik: 0, cevap_anahtari: 1, optik: 2, kitap_sayfa: 0 };
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
          : 'Bir saat içinde işleyeceğim. Yanlışlarının nedenini seçme görevi ana sayfaya düşecek, ilk tekrarları yarın gelecek.'),
        h('button', { class: 'primary block', onclick: () => go(state.profile.role === 'parent' ? 'report' : 'home') }, 'Tamam')));
    } catch (e) {
      console.error(e);
      status.innerHTML = '';
      status.append(h('span', { class: 'error' }, 'Yükleme yarım kaldı: ' + (e.message || e) + '. İnternetini kontrol edip tekrar gönder.'));
      sendBtn.disabled = false;
    }
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

// ---------------------------------------------------------------- öğrenci: konular

async function viewTopics() {
  loading();
  const [topics, statuses, items] = await Promise.all([
    q(sb.from('topics').select('*').eq('grade', state.student.grade)),
    q(sb.from('topic_status').select('*').eq('student_id', sid())),
    q(sb.from('items').select('topic_id, track, step, state, due_date').eq('student_id', sid())),
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
    visibleSubjects().map((s) => {
      const list = topics.filter((t) => t.subject === s).sort((a, b) => a.sort - b.sort);
      if (!list.length) return null;
      const covered = (t) => st[t.id] && st[t.id].status !== 'not_taught';
      const count = h('span', { class: 'small muted' }, `${list.filter(covered).length} / ${list.length} işlendi`);
      return h('section', { class: 'card' },
        h('div', { class: 'spread' }, subjTag(s), count),
        list.map((t) => {
          const tag = h('span', { class: 'tag' });
          const paint = () => {
            if (!covered(t)) {
              tag.className = 'tag';
              tag.textContent = st[t.id]?.status === 'not_taught' ? 'Bekliyor'
                : t.planned_start ? `Plan: ${fmtDate(t.planned_start)}` : '';
              return;
            }
            const [label, color] = level(t.id);
            tag.className = 'tag ' + color;
            tag.textContent = label;
          };
          paint();
          const box = h('input', { type: 'checkbox', id: 'topic-' + t.id, checked: covered(t) || null, disabled: isTeacherView() || null, onchange: async () => {
            box.disabled = true;
            try {
              await setCovered(t.id, box.checked);
              st[t.id] = { ...(st[t.id] || {}), status: box.checked ? 'active' : 'not_taught' };
              if (box.checked && !items.some((i) => i.topic_id === t.id && i.track === 'topic')) items.push({ topic_id: t.id, track: 'topic', step: 0, state: 'active' });
              paint();
              count.textContent = `${list.filter(covered).length} / ${list.length} işlendi`;
            } catch (e) {
              box.checked = !box.checked;
              toast('Kaydedilemedi, tekrar dene.');
            }
            box.disabled = false;
          } });
          return h('label', { class: 'topic-row', for: 'topic-' + t.id }, box, h('span', { class: 'name' }, t.name), tag);
        }));
    }),
    !topics.length ? h('div', { class: 'card flat' }, h('p', { class: 'muted' }, 'Bu sınıfın konu listesi henüz yüklenmedi.')) : null);
}

function isParentView() { return state.profile?.role !== 'student'; }
function isTeacherView() { return state.profile?.role === 'teacher'; }

/* Konuyu "okulda işlendi" (takibe al) ya da "işlenmedi" (beklet) yapar.
   İlk kez işaretlenen konunun ilk tekrarı yarın gelir. */
async function setCovered(topicId, covered) {
  const now = new Date().toISOString();
  if (!covered) {
    await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: topicId, status: 'not_taught', updated_at: now }));
    await q(sb.from('items').update({ state: 'paused' }).eq('student_id', sid()).eq('topic_id', topicId).eq('state', 'active'));
    return;
  }
  await q(sb.from('topic_status').upsert({ student_id: sid(), topic_id: topicId, status: 'active', first_seen: localDate(), updated_at: now }));
  const existing = await q(sb.from('items').select('id').eq('student_id', sid()).eq('topic_id', topicId).eq('track', 'topic'));
  if (existing.length) {
    await q(sb.from('items').update({ state: 'active' }).eq('student_id', sid()).eq('topic_id', topicId).eq('state', 'paused'));
  } else {
    await q(sb.from('items').insert({ student_id: sid(), track: 'topic', topic_id: topicId, step: 0, interval_days: 1, due_date: addDays(localDate(), 1) }));
  }
}

// ---------------------------------------------------------------- ayarlar

function viewSettings() {
  // Çalışma ayarları öğrencinindir; veli seçili çocuğun ayarlarını değiştirir. Öğretmen sadece kendi şifresini.
  const p = state.student;
  const role = state.profile.role;
  const isParent = role === 'parent';
  const showStudent = p && role !== 'teacher';
  const lgs = p && h('input', { id: 'lgs-date', type: 'date', value: p.lgs_date });
  const grade = p && h('select', { id: 'grade' }, [5, 6, 7, 8].map((g) => h('option', { value: g, selected: g === p.grade }, `${g}. sınıf`)));
  const plan = p && dailyPlan(p);
  render(
    h('header', {}, h('h1', {}, isParent && p ? `Ayarlar · ${p.display_name}` : 'Ayarlar')),
    isParent && p ? planSection(p) : null,
    isParent ? familySection() : null,
    showStudent && h('section', { class: 'card' },
      isParent ? h('label', { class: 'field' }, 'Sınıfı', grade) : null,
      h('label', { class: 'field' }, 'LGS tarihi', lgs),
      // Günlük plan veli ayarıdır; öğrenci sadece görür (veritabanı da öğrencinin değiştirmesine izin vermez).
      !isParent ? h('div', { class: 'stack', style: 'gap: 4px' },
        h('p', { class: 'label' }, `Günlük plan · ${planTotal(plan)} soru`),
        h('p', { class: 'small muted' }, SUBJECT_ORDER.filter((s) => plan[s]).map((s) => `${SUBJECTS[s].name} ${plan[s]}`).join(' · ')),
        h('p', { class: 'small muted' }, 'Bu sayıları velin ayarlıyor.')) : null,
      h('button', { class: 'primary block', onclick: async () => {
        const upd = { lgs_date: lgs.value || p.lgs_date };
        if (isParent) upd.grade = +grade.value;
        await q(sb.from('profiles').update(upd).eq('id', p.id));
        Object.assign(p, upd);
        toast('Kaydedildi.');
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
  const plan = dailyPlan(p);
  const box = h('section', { class: 'card stack' }, h('p', { class: 'label' }, 'Günlük plan'), h('p', { class: 'small muted' }, 'Yükleniyor…'));
  (async () => {
    const today = localDate();
    const [rows, due] = await Promise.all([
      q(sb.from('reviews').select('duration_sec, answered_at, questions(subject)').eq('student_id', p.id).eq('voided', false)
        .gte('answered_at', addDays(today, -6) + 'T00:00:00')),
      q(sb.from('items').select('support, topics(subject)').eq('student_id', p.id).eq('track', 'mistake').eq('state', 'active').lte('due_date', today)),
    ]);
    const stat = Object.fromEntries(SUBJECT_ORDER.map((s) => [s, { n: 0, sec: 0, week: 0, due: 0 }]));
    for (const r of rows) {
      const st = stat[r.questions?.subject];
      if (!st) continue;
      st.week += r.duration_sec || 0;
      if (localDate(new Date(r.answered_at)) === today) { st.n++; st.sec += r.duration_sec || 0; }
    }
    for (const it of due) { const st = stat[it.topics?.subject]; if (st) st.due += 1 + (it.support || 0); }
    const sum = (k) => SUBJECT_ORDER.reduce((a, s) => a + stat[s][k], 0);
    const days = new Set(rows.map((r) => localDate(new Date(r.answered_at)))).size;

    const inputs = {}, checks = [];
    const totalLine = h('p', { class: 'small muted num' });
    const update = () => {
      checks.forEach((c) => c());
      const total = SUBJECT_ORDER.reduce((a, s) => a + (+inputs[s].value || 0), 0);
      const maxSec = SUBJECT_ORDER.reduce((a, s) => a + (+inputs[s].value || 0) * maxSeconds(s), 0);
      totalLine.textContent = `Toplam günde ${total} soru · LGS süreleriyle en fazla ${fmtMinutes(maxSec)}`;
    };
    const rowsEl = SUBJECT_ORDER.map((s) => {
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
    const save = h('button', { class: 'primary block', onclick: async () => {
      const by = Object.fromEntries(SUBJECT_ORDER.map((s) => [s, Math.min(60, Math.max(0, Math.round(+inputs[s].value || 0)))]));
      if (!planTotal(by)) return toast('En az bir derse soru ver.');
      const upd = { daily_by_subject: by, daily_questions: planTotal(by) };
      save.disabled = true;
      try { await q(sb.from('profiles').update(upd).eq('id', p.id)); } catch (e) { save.disabled = false; return toast('Kaydedilemedi, tekrar dene.'); }
      save.disabled = false;
      Object.assign(p, upd);
      SUBJECT_ORDER.forEach((s) => { inputs[s].value = by[s]; });
      update();
      toast('Kaydedildi. Yeni sayılar bugünden geçerli.');
    } }, 'Kaydet');
    update();
    fill(box,
      h('p', { class: 'label' }, 'Günlük plan'),
      h('p', {}, `Bugün ${sum('n')} soru çözdü, ${fmtMinutes(sum('sec'))}. Son 7 günde ${fmtMinutes(sum('week'))}`
        + (days ? `, çalıştığı ${days} günde ortalama ${fmtMinutes(sum('week') / days)}.` : '.')),
      h('p', { class: 'small muted' }, 'Her dersten günde en fazla kaç soru gelsin? Önce hata tekrarları, sonra konu tekrarları gelir; kalan sayı en zayıf konulardan ek çalışmayla dolar. Süre, soruyu açtığı andan şıkkı seçtiği ana kadar ölçülür.'),
      rowsEl, totalLine, save);
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
      const grade = h('select', { id: `${kind}-grade` }, [5, 6, 7, 8].map((g) => h('option', { value: g, selected: g === 8 }, `${g}. sınıf`)));
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
    q(sb.from('exam_questions').select('*, exams(name, exam_date), topics(name)').eq('student_id', s)
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
    r.image_path ? lazyImg('photos', r.image_path) : null,
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
        { mistake: 'Hata tekrarı', topic: 'Konu tekrarı', extra: 'Ek çalışma' }[r.track] || '',
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
    q(sb.from('topics').select('*').eq('grade', state.student.grade)),
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
    SUBJECT_ORDER.filter((s) => bySubject[s]).map((s) => bar(SUBJECTS[s].name, bySubject[s], maxSubj, `var(--c-${s})`)),
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
        : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`LGS ${state.student.grade}. sınıf ${topicName[g.topic_id]?.name || ''} konu anlatımı`),
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
        h('tbody', {}, SUBJECT_ORDER.filter((s) => bySub[s]).map((s) => h('tr', {},
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
      h('div', { class: 'spread' }, h('span', {}, s.exams?.name || (s.kind === 'kitap' ? 'Kitap sayfaları' : 'Yükleme')), statusTag(s.status)),
      s.result_note ? h('p', { class: 'small muted' }, s.result_note) : null)) : h('p', { class: 'muted' }, 'Henüz yükleme yok.'),
    feedbackRows.length ? h('p', { class: 'small muted' },
      `Soru bildirimi: ${feedbackRows.length}. Kontrol edilen ${feedbackRows.filter((f) => f.status === 'checked').length}, ` +
      `hatalı bulunan ${feedbackRows.filter((f) => f.verdict === 'soru_hatali').length}.`) : null,
    runs[0] ? h('p', { class: 'small muted' }, `Saatlik görev en son ${new Date(runs[0].started_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })} çalıştı.`) : null);

  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('p', { class: 'label' }, isTeacherView() ? 'Öğretmen görünümü' : 'Veli raporu'), h('h1', {}, studentName ? `${studentName} nasıl gidiyor?` : 'Nasıl gidiyor?'),
      h('p', { class: 'muted' }, `LGS'ye ${daysBetween(today, (state.student || state.profile).lgs_date)} gün var.`)),
    tiles, togetherBox(togetherRows), dayReport(reviews30, items, topicName),
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
  const trackName = { mistake: 'hata tekrarı', topic: 'konu tekrarı', extra: 'ek çalışma' };
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
      (SUBJECT_ORDER.indexOf(a[1].subject) - SUBJECT_ORDER.indexOf(b[1].subject)) || ((topicName[a[0]]?.sort ?? 0) - (topicName[b[0]]?.sort ?? 0)));

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
