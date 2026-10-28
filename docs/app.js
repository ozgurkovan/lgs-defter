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
const SUBJECT_ORDER = ['turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce'];

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

function studentSwitcher() {
  const me = state.profile;
  if (me.role !== 'parent' || (state.students || []).length < 2) {
    return h('span', { class: 'small muted' }, me.role === 'parent' && state.student
      ? `${me.display_name || ''} · ${state.student.display_name}` : me.display_name || '');
  }
  return h('select', { id: 'student-switch', class: 'switch', 'aria-label': 'Hangi çocuk', onchange: (e) => {
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
  const tabs = state.profile.role === 'parent'
    ? [['report', 'Rapor', 'report'], ['upload', 'Deneme yükle', 'upload'], ['book', 'Kitap ekle', 'topics'], ['settings', 'Ayarlar', 'settings']]
    : [['home', 'Bugün', 'home'], ['upload', 'Deneme yükle', 'upload'], ['topics', 'Konularım', 'topics'], ['settings', 'Ayarlar', 'settings']];
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Menü' },
    h('div', { class: 'inner' }, tabs.map(([id, label, ic]) =>
      h('button', { 'aria-current': state.tab === id ? 'page' : null, onclick: () => go(id) }, icon(ic), label))));
  document.body.append(nav);
}

function go(tab) {
  state.tab = tab;
  state.session = null;
  window.scrollTo(0, 0);
  const views = {
    home: viewHome, upload: () => viewUpload('deneme'), book: () => viewUpload('kitap'),
    topics: viewTopics, settings: viewSettings, report: viewReport, reasons: viewReasons,
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
  if (profile.role === 'student') {
    state.students = [profile];
  } else {
    const links = await q(sb.from('family_links').select('student_id').eq('parent_id', profile.id));
    state.students = links.length
      ? await q(sb.from('profiles').select('*').in('id', links.map((l) => l.student_id)).order('display_name'))
      : [];
  }
  let remembered = null;
  try { remembered = localStorage.getItem('defter.student'); } catch (e) { /* tarayıcı izin vermiyor */ }
  state.student = state.students.find((s) => s.id === remembered) || state.students[0] || null;
  if (!state.student) {
    return render(h('div', { class: 'card' },
      h('h2', {}, 'Bağlı öğrenci yok'),
      h('p', { class: 'muted' }, 'Bu veli hesabına henüz bir öğrenci bağlanmamış. Bunu Claude ile tamamlayın.')));
  }
  go(profile.role === 'parent' ? 'report' : 'home');
}

function viewLogin() {
  const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('p', { class: 'error', hidden: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) { msg.textContent = 'E-posta veya şifre yanlış.'; msg.hidden = false; return; }
    start().catch((err) => render(failBox(err)));
  } },
    h('label', { class: 'field' }, 'E-posta', email),
    h('label', { class: 'field' }, 'Şifre', pass),
    msg,
    h('button', { class: 'primary block', type: 'submit' }, 'Giriş yap'));
  const forgot = h('button', { class: 'ghost small', type: 'button', onclick: async () => {
    const mail = email.value.trim();
    if (!mail) { msg.textContent = 'Önce e-posta adresini yaz.'; msg.hidden = false; return; }
    forgot.disabled = true;
    const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
    msg.hidden = false;
    msg.className = error ? 'error' : 'small';
    msg.textContent = error
      ? 'Gönderilemedi, birkaç dakika sonra tekrar dene.'
      : 'Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. E-postadaki bağlantıya dokun.';
    forgot.disabled = false;
  } }, 'Şifremi unuttum');
  render(
    h('div', { class: 'stack', style: 'padding-top: 12vh' },
      h('p', { class: 'label' }, 'LGS 2027'),
      h('h1', {}, 'Defter'),
      h('p', { class: 'muted' }, 'Yanlışların nereden geldiğini bul, öğrendiğini unutma.')),
    form, forgot);
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
   her birine daha önce hiç görülmemiş bir soru seçilir, süre bütçesine sığdırılır. */
async function buildSession(track) {
  const today = localDate();
  const budgetSec = (track === 'mistake' ? state.student.mistake_minutes : state.student.topic_minutes) * 60;
  const items = await q(sb.from('items').select('*, topics(subject, name)')
    .eq('student_id', sid()).eq('track', track).eq('state', 'active').lte('due_date', today));
  if (!items.length) return { entries: [], shortage: 0, seconds: 0, dueCount: 0 };

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
  let seconds = 0, shortage = 0;
  const basePerItem = track === 'mistake' ? 1 : TOPIC_QUESTIONS_PER_REVIEW;
  for (const it of items) {
    const styles = missedStyles[it.topic_id] || new Set();
    const candidates = shuffle(pool.filter((p) => p.topic_id === it.topic_id && !seen.has(p.id) && !used.has(p.id)))
      .sort((a, b) => overlap(b.styles, styles) - overlap(a.styles, styles));
    if (!candidates.length) { shortage++; continue; }
    // Emin olmadığı maddelere destek soruları eklenir; her yeni soru mümkünse farklı bir tarzda olur.
    const picked = pickVaried(candidates, basePerItem + (it.support || 0));
    const cost = picked.reduce((s, p) => s + maxSeconds(p.subject) + 15, 0);
    if (entries.length && seconds + cost > budgetSec) break;
    picked.forEach((p, i) => { used.add(p.id); entries.push({ item: it, question: p, last: i === picked.length - 1 }); });
    seconds += cost;
  }
  return { entries, shortage, seconds, dueCount: items.length };
}
/* Ek çalışma: günü gelen tekrarlar günlük hedef soru sayısını doldurmuyorsa açığı kapatır.
   Takipteki konulardan en zayıf olanlardan başlar, her konudan sırayla görülmemiş bir soru alır.
   Takvimi bozmaz: sadece yanlış yapılan konunun tekrarı yarına çekilir. */
async function buildExtra(n, exclude) {
  if (n <= 0) return { entries: [], seconds: 0 };
  const today = localDate();
  const items = await q(sb.from('items').select('*, topics(subject, name)')
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
  while (entries.length < n && queues.some((x) => x.cands.length)) {
    for (const x of queues) {
      if (entries.length >= n) break;
      const p = x.cands.shift();
      if (!p) continue;
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

// ---------------------------------------------------------------- öğrenci: bugün

async function viewHome() {
  loading();
  const [mistake, topic, reasons, subs] = await Promise.all([
    buildSession('mistake'),
    buildSession('topic'),
    q(sb.from('exam_questions').select('id').eq('student_id', sid()).neq('outcome', 'dogru')
      .is('student_reason', null).not('diagnosis_cause', 'is', null)),
    q(sb.from('submissions').select('id, kind, status, submitted_at, result_note, exams(name)')
      .eq('student_id', sid()).neq('status', 'draft').order('created_at', { ascending: false }).limit(4)),
  ]);
  const [todayCount, replies] = await Promise.all([
    q(sb.from('reviews').select('id, track, correct').eq('student_id', sid()).eq('voided', false).gte('answered_at', localDate() + 'T00:00:00')),
    q(sb.from('question_feedback').select('id, kind, verdict, response, questions(stem, subject)')
      .eq('student_id', sid()).not('response', 'is', null).eq('response_seen', false).order('checked_at')),
  ]);
  // Günlük hedef: tekrarlar hedefi doldurmuyorsa açık ek çalışmayla kapatılır.
  const dailyTarget = state.student.daily_questions || 40;
  const dueNow = mistake.entries.length + topic.entries.length;
  const extra = await buildExtra(dailyTarget - todayCount.length - dueNow,
    [...mistake.entries, ...topic.entries].map((e) => e.question.id));
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
      s.shortage ? h('p', { class: 'small muted' }, `${s.shortage} konu için yeni soru hazırlanıyor, yarın gelecek.`) : null);
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
  state.session = { track, entries: s.entries, index: 0, results: new Map(), stats: { correct: 0, total: 0 } };
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
  let answered = false, reviewId = null, gradePromise = null, prevItem = null, myResult = null;
  const itemSnapshot = () => ({
    step: item.step, ease: item.ease, consecutive_wrong: item.consecutive_wrong, interval_days: item.interval_days,
    due_date: item.due_date, state: item.state, last_reviewed_at: item.last_reviewed_at, note: item.note,
  });

  const submit = async () => {
    if (answered || !selected || !confidence) return;
    answered = true;
    clearInterval(timerId);
    const duration = Math.round(((chosenAt || Date.now()) - startedAt) / 1000);
    const correct = selected === question.answer;
    const confident = confidence === 100;
    const overTime = duration > target;
    // Süre LGS'deki payı kadar: aşılırsa doğru da olsa "rahat bildi" sayılmaz.
    const strong = correct && confident && !hintUsed && duration <= target;
    confirmRow.hidden = true;
    choiceBtns.forEach((b) => {
      b.disabled = true;
      if (b.dataset.k === question.answer) b.classList.add('right');
      else if (b.dataset.k === selected) b.classList.add('wrong');
    });
    ss.stats.total++; if (correct) ss.stats.correct++;
    const list = ss.results.get(item.id) || [];
    myResult = { correct, strong, confidence };
    list.push(myResult);
    ss.results.set(item.id, list);

    const coachNote = !correct && confidence >= 75
      ? 'Emin olduğun hâlde yanlış: burada bir kavramı farklı biliyor olabilirsin. Çözümü dikkatle oku.'
      : correct && confidence <= 50 ? 'Doğru, ama tahmine yakındı. Bu konuyu farklı sorularla biraz daha göreceğiz.'
      : correct && overTime ? `Doğru, ama ${fmtDuration(duration)} sürdü. LGS'de ${SUBJECTS[subject].name} sorusuna en fazla ${fmtDuration(target)} ayırabilirsin; bu konuyu biraz daha hızlandıracağız.`
      : null;
    fill(feedback,
      h('p', { class: 'verdict ' + (correct ? 'ok' : 'no') }, correct ? 'Doğru' : `Yanlış. Doğru cevap ${question.answer}.`),
      coachNote ? h('p', { class: 'small' }, coachNote) : null,
      question.solution ? h('div', { class: 'note teacher' }, question.solution) : null,
      h('button', { class: 'primary block', onclick: () => { ss.index++; showQuestion(); } },
        ss.index + 1 < ss.entries.length ? 'Sonraki soru' : 'Bitir'));
    feedback.hidden = false;
    feedback.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const rv = await q(sb.from('reviews').insert({
        student_id: sid(), item_id: item.id, question_id: question.id, track: entry.extra ? 'extra' : item.track, answer: selected,
        correct, duration_sec: duration, confident, confidence, hint_used: hintUsed,
      }).select('id').single());
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

  const sendBtn = h('button', { class: 'primary block', disabled: true, onclick: submit }, 'Cevabı gönder');
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
        h('span', { class: 'small muted num' }, `${ss.index + 1} / ${ss.entries.length}`)),
      question.image_path ? lazyImg('questions', question.image_path) : null,
      question.stem ? h('p', { class: 'stem' }, question.stem) : null,
      hintBtn, hintBox),
    h('div', { class: 'choices' }, choiceBtns),
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
  const { stats, track } = state.session;
  state.session = null;
  render(
    h('section', { class: 'card', style: 'margin-top: 10vh; text-align: center' },
      h('p', { class: 'label' }, { mistake: 'Hata tekrarı bitti', topic: 'Konu tekrarı bitti', extra: 'Ek çalışma bitti' }[track]),
      h('p', { class: 'task' }, h('span', { class: 'big num' }, `${stats.correct} / ${stats.total}`)),
      h('p', { class: 'muted' }, stats.correct === stats.total ? 'Hepsi doğru. Bu konular bir süre rahat.' :
        'Yanlış yaptıkların yakında farklı sorularla tekrar gelecek.'),
      h('button', { class: 'primary block', onclick: () => go('home') }, 'Ana sayfa')));
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
  let timeNote = null;

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
    const hasKey = photos.some((p) => p.role === 'cevap_anahtari');
    const missing = [];
    if (!examSel.value) missing.push('hangi deneme olduğunu seç');
    else if (examSel.value === '__new' && !newName.value.trim()) missing.push('denemenin adını yaz');
    if (!hasBook) missing.push('kitapçık sayfalarını ekle');
    sendBtn.disabled = !(examOk && hasBook);
    missingNote.className = missing.length ? 'small muted' : 'small';
    missingNote.textContent = missing.length
      ? 'Göndermek için: ' + missing.join(', ') + '.'
      : hasKey ? '' : 'Cevap anahtarı eklemedin. Yine de gönderebilirsin: anahtar kitapçığın içindeyse onu bulurum, yoksa soruları kendim çözerim. Anahtar olursa sonuç daha güvenilir olur.';
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
      h('p', { class: 'muted' }, 'Kitapçığın tamamı, cevap anahtarı ve varsa optik formun.')),
    h('section', { class: 'card' }, h('label', { class: 'field' }, 'Hangi deneme?', examSel), newBox),
    photoPicker('1. Kitapçık sayfaları', 'Tüm sayfalar, sırayla. Karalamaların görünsün; T ve yuvarlak işaretlerin de.', 'kitapcik', photos, refresh),
    photoPicker('2. Cevap anahtarı', 'Kitapçığın sonundaysa ya da yoksa boş bırakabilirsin.', 'cevap_anahtari', photos, refresh),
    photoPicker('3. Optik form (varsa)', null, 'optik', photos, refresh),
    h('section', { class: 'card' }, h('h3', {}, 'Süre yetti mi?'), h('div', { class: 'chips' }, timeChips)),
    sendBtn, missingNote, status);
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
  const waiting = statuses.filter((s) => s.status === 'not_taught' && byId[s.topic_id]);

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
    h('header', { class: 'stack', style: 'gap: 4px' }, h('p', { class: 'label' }, 'Konularım'), h('h1', {}, 'Ne durumdayım?')),
    gaps.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Tekrar çalışılacak konular'),
      gaps.map((g) => h('div', { class: 'card' },
        h('div', { class: 'row' }, subjTag(byId[g.topic_id].subject), h('b', {}, byId[g.topic_id].name)),
        g.lesson ? h('div', { class: 'note teacher' }, g.lesson) : h('p', { class: 'small muted' }, 'Kısa konu anlatımı hazırlanıyor.'),
        g.youtube_query ? h('a', { class: 'btn block', href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(g.youtube_query), target: '_blank', rel: 'noopener' }, 'YouTube’da konu anlatımı izle') : null))) : null,
    maybe.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Bu konuları okulda işlediniz mi?'),
      h('p', { class: 'small muted' }, 'Denemede çıktı ama hepsi boş ya da yanlış. Henüz işlenmediyse zayıflık saymıyorum.'),
      maybe.map((m) => h('div', { class: 'card' },
        h('div', { class: 'row' }, subjTag(byId[m.topic_id].subject), h('b', {}, byId[m.topic_id].name)),
        h('div', { class: 'row' },
          h('button', { style: 'flex: 1', onclick: () => setStatus(m.topic_id, 'not_taught') }, 'Henüz işlemedik'),
          h('button', { style: 'flex: 1', onclick: () => setStatus(m.topic_id, 'active') }, 'İşledik'))))) : null,
    waiting.length ? h('section', { class: 'stack' },
      h('h2', {}, 'Okulda işlenmesini bekleyenler'),
      h('p', { class: 'small muted' }, 'Bu konuları sormuyorum. Okulda işleyince “İşledik” de.'),
      waiting.map((m) => h('div', { class: 'card', style: 'padding: 12px' },
        h('div', { class: 'spread' },
          h('div', { class: 'row' }, subjTag(byId[m.topic_id].subject), h('span', {}, byId[m.topic_id].name)),
          h('button', { onclick: () => setStatus(m.topic_id, 'active') }, 'İşledik'))))) : null,
    SUBJECT_ORDER.map((s) => {
      const tracked = (t) => st[t.id] && st[t.id].status !== 'not_taught';
      const list = topics.filter((t) => t.subject === s && tracked(t)).sort((a, b) => a.sort - b.sort);
      const upcoming = topics.filter((t) => t.subject === s && !st[t.id]).length;
      if (!list.length) return null;
      return h('section', { class: 'card' },
        h('div', { class: 'spread' }, subjTag(s), h('span', { class: 'small muted' }, `${list.length} konu takipte${upcoming ? ` · ${upcoming} konu sırada` : ''}`)),
        list.map((t) => { const [label, color] = level(t.id); return h('div', { class: 'spread small' }, h('span', {}, t.name), h('span', { class: 'tag ' + color }, label)); }));
    }),
    !topics.length ? h('div', { class: 'card flat' }, h('p', { class: 'muted' }, 'İlk denemeni yükleyince konuların burada görünecek.')) : null);
}

// ---------------------------------------------------------------- ayarlar

function viewSettings() {
  // Çalışma ayarları öğrencinindir; veli seçili çocuğun ayarlarını değiştirir.
  const p = state.student;
  const isParent = state.profile.role === 'parent';
  const mm = h('input', { id: 'mistake-min', type: 'number', min: 5, max: 120, step: 5, value: p.mistake_minutes, inputmode: 'numeric' });
  const tm = h('input', { id: 'topic-min', type: 'number', min: 5, max: 180, step: 5, value: p.topic_minutes, inputmode: 'numeric' });
  const lgs = h('input', { id: 'lgs-date', type: 'date', value: p.lgs_date });
  const daily = h('input', { id: 'daily-questions', type: 'number', min: 5, max: 200, step: 5, value: p.daily_questions || 40, inputmode: 'numeric' });
  const grade = h('select', { id: 'grade' }, [5, 6, 7, 8].map((g) => h('option', { value: g, selected: g === p.grade }, `${g}. sınıf`)));
  render(
    h('header', {}, h('h1', {}, isParent ? `Ayarlar · ${p.display_name}` : 'Ayarlar')),
    h('section', { class: 'card' },
      isParent ? h('label', { class: 'field' }, 'Sınıfı', grade) : null,
      h('label', { class: 'field' }, 'Günlük hedef soru sayısı', daily),
      h('p', { class: 'small muted' }, 'Tekrarlar bu sayıya ulaşmazsa açık, en zayıf konulardan ek çalışmayla tamamlanır.'),
      h('label', { class: 'field' }, 'Hata tekrarı için günlük süre (dakika)', mm),
      h('label', { class: 'field' }, 'Konu tekrarı için günlük üst sınır (dakika)', tm),
      h('label', { class: 'field' }, 'LGS tarihi', lgs),
      h('button', { class: 'primary block', onclick: async () => {
        const upd = {
          mistake_minutes: +mm.value || 30, topic_minutes: +tm.value || 60, lgs_date: lgs.value || p.lgs_date,
          daily_questions: Math.min(200, Math.max(5, +daily.value || 40)),
        };
        if (isParent) upd.grade = +grade.value;
        // Süreler öğrencinin profilinde tutulur; veli de oradan değiştirir.
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
    q(sb.from('reviews').select('track, correct, duration_sec, confident, confidence, hint_used, answered_at, questions(subject, topic_id)').eq('student_id', s).eq('voided', false).gte('answered_at', addDays(localDate(), -30))),
    q(sb.from('submissions').select('id, kind, status, submitted_at, processed_at, result_note, exams(name)').or(`student_id.eq.${s},student_id.is.null`).neq('status', 'draft').order('created_at', { ascending: false }).limit(6)),
    q(sb.from('job_runs').select('*').order('started_at', { ascending: false }).limit(1)),
  ]);
  const feedbackRows = await q(sb.from('question_feedback').select('kind, verdict, status').eq('student_id', s));
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
  const reviewedToday = reviews.filter((r) => r.answered_at.slice(0, 10) === today).length;

  const tiles = h('div', { class: 'tiles' },
    tile('Son deneme neti', last ? net(lastRes).toFixed(2).replace('.', ',') : '–', last ? last.name : 'Henüz deneme yok'),
    tile('Son denemede yanlış + boş', last ? lastRes.reduce((s, r) => s + r.wrong + r.blank, 0) : '–', 'Hedef: 0'),
    tile('Eksik konu', gaps.length, gaps.length ? 'Aşağıda özel ders notları var' : 'Şu an yok'),
    tile('Bugün çözülen tekrar', reviewedToday, `${settled} konu oturdu`));

  // Denemeler tablosu
  const examTable = exams.length ? h('div', { class: 'scroll-x' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Deneme'), SUBJECT_ORDER.map((s) => h('th', {}, SUBJECTS[s].name.split(' ')[0])), h('th', {}, 'Net'))),
    h('tbody', {}, [...exams].reverse().map((e) => {
      const rs = results.filter((r) => r.exam_id === e.id);
      return h('tr', {},
        h('td', {}, h('div', {}, e.name), h('div', { class: 'small muted' }, fmtDate(e.exam_date) + (e.time_note ? ' · ' + e.time_note : ''))),
        SUBJECT_ORDER.map((s) => { const r = rs.find((x) => x.subject === s); return h('td', {}, r ? `${r.wrong}Y ${r.blank}B` : '–'); }),
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
  const youtube = (name) => 'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(`LGS ${state.student.grade}. sınıf ${name} konu anlatımı`);
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
      h('p', { class: 'label' }, 'Veli raporu'), h('h1', {}, studentName ? `${studentName} nasıl gidiyor?` : 'Nasıl gidiyor?'),
      h('p', { class: 'muted' }, `LGS'ye ${daysBetween(today, (state.student || state.profile).lgs_date)} gün var.`)),
    tiles, h('section', { class: 'card' }, h('h2', {}, 'Denemeler'), examTable),
    gapCards, weakCards, causes, subjects, styles, misconceptions, perf, load, job);
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

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') viewLogin();
  if (event === 'PASSWORD_RECOVERY') {
    state.inRecovery = true;
    state.user = session?.user || state.user;
    viewNewPassword();
  }
});
start().catch((e) => render(failBox(e)));
