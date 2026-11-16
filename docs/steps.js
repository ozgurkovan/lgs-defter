/* Çözümler birkaç derinlikte (velinin isteği, 2026-11-16: "birisi kısa çözüm, diğeri daha detaylı hatta şekilli anlatım,
   çocuğa bir bir yavaş yavaş detaylı anlatım"). Kısa çözüm sorunun kendi metnidir (questions.solution). Adımlar
   questions.steps'te: [{ text, fig? }, …] (1–8 adım); saatlik görev yazar, önce çocukların yanlış yaptığı sorulara
   (job/INSTRUCTIONS.md 1h). "Adım adım anlat" deyince adımlar "Sonraki adım" ile tek tek açılır; her adımda sesli okuma ve
   gerekirse bir şekil. Şekiller serbest resim değil, buradaki kalıplardan çizilir (sayı doğrusu, kesir şeridi, uzunluk
   modeli, kareli alan, gruplar, geometrik şekil, tablo, metinde işaretli sözcükler): hep düzgün, sayılar sınırlı, yazılar
   kaçışlı. Adımı olmayan soruda yalnız kısa çözüm görünür. */

/* Adımlar: saf kısım (tools/test-steps.mjs bunu dener) */

const STEP_MAX = 8; // en çok adım
const STEP_TONES = ['#4C8DF6', '#F25C54', '#2EC4B6', '#F4B400', '#7B4DD8', '#F4A261'];
const stepEsc = (v, max = 60) => String(v ?? '').slice(0, max).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stepNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const stepFmt = (n, comma = true) => { const r = Math.round(n * 1000) / 1000; const s = String(r); return comma ? s.replace('.', ',') : s; };
// Veritabanından gelen adımlar: dizi değilse ya da boşsa null; her adımda yazı (en çok 500 harf) ve isteğe bağlı şekil.
function stepsClean(raw) {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .slice(0, STEP_MAX).map((s) => ({ text: s.text.trim().slice(0, 500), fig: s.fig && typeof s.fig === 'object' ? s.fig : null }));
  return out.length ? out : null;
}
const stepSvg = (w, hgt, alt, body) => `<svg class="step-svg" viewBox="0 0 ${w} ${Math.round(hgt)}" role="img" aria-label="${stepEsc(alt, 120)}">${body}</svg>`;
const stepText = (x, y, t, o = {}) => `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" text-anchor="${o.anchor || 'middle'}" font-size="${o.size || 12}"`
  + ` font-weight="${o.weight || 600}" fill="${o.fill || '#1D2A4D'}" font-family="Arial, sans-serif">${stepEsc(t, o.max || 24)}</text>`;

// Sayı doğrusu: from, to, step; marks: noktalar ([sayı] ya da [{ at, label }]); jumps: atlamalar [{ from, to, label }].
function figNumberline(f, comma) {
  const from = stepNum(f.from, -10000, 10000, 0), to = stepNum(f.to, from + 0.001, from + 10000, from + 10);
  let step = stepNum(f.step, 0.001, 10000, 1);
  if ((to - from) / step > 40) step = (to - from) / 40;
  const every = Math.ceil((to - from) / step / 12); // en çok ~12 sayı yazısı
  const W = 320, H = 96, x0 = 20, x1 = 300, y = 62, X = (v) => x0 + ((v - from) / (to - from)) * (x1 - x0);
  let s = `<line x1="${x0 - 8}" y1="${y}" x2="${x1 + 10}" y2="${y}" stroke="#1D2A4D" stroke-width="2"/><path d="M${x1 + 12} ${y} l-7 -4 v8 Z" fill="#1D2A4D"/>`;
  for (let k = 0, v = from; v <= to + step / 1000 && k <= 40; k++, v = from + k * step) {
    s += `<line x1="${X(v).toFixed(1)}" y1="${y - 5}" x2="${X(v).toFixed(1)}" y2="${y + 5}" stroke="#1D2A4D" stroke-width="1.5"/>`;
    if (k % every === 0) s += stepText(X(v), y + 20, stepFmt(v, comma), { size: 11, weight: 500 });
  }
  (Array.isArray(f.jumps) ? f.jumps.slice(0, 8) : []).forEach((j, i) => {
    const a = stepNum(j?.from, from, to, from), b = stepNum(j?.to, from, to, to), xa = X(a), xb = X(b), hgt = Math.min(34, 10 + Math.abs(xb - xa) * 0.25);
    const c = STEP_TONES[i % STEP_TONES.length];
    s += `<path d="M${xa.toFixed(1)} ${y - 6} Q${((xa + xb) / 2).toFixed(1)} ${(y - 6 - hgt * 2).toFixed(1)} ${xb.toFixed(1)} ${y - 6}" fill="none" stroke="${c}" stroke-width="2"/>`
      + `<path d="M${xb.toFixed(1)} ${y - 6} l${xb >= xa ? -7 : 7} -4 l${xb >= xa ? 1 : -1} 6 Z" fill="${c}"/>`;
    if (j?.label != null) s += stepText((xa + xb) / 2, y - 10 - hgt, j.label, { size: 11, fill: c, max: 12 });
  });
  (Array.isArray(f.marks) ? f.marks.slice(0, 8) : []).forEach((m, i) => {
    const at = stepNum(typeof m === 'object' && m ? m.at : m, from, to, null);
    if (at == null) return;
    s += `<circle cx="${X(at).toFixed(1)}" cy="${y}" r="5.5" fill="${STEP_TONES[(i + 1) % STEP_TONES.length]}" stroke="#fff" stroke-width="1.5"/>`;
    if (typeof m === 'object' && m?.label != null) s += stepText(X(at), y - 12, m.label, { size: 11, max: 12 });
  });
  return stepSvg(W, H, f.alt || 'Sayı doğrusu', s);
}
// Kesir şeritleri: bars [{ parts (1–24), filled, label }] (en çok 4) ya da tek şerit (parts, filled, label).
function figFraction(f) {
  const bars = (Array.isArray(f.bars) ? f.bars : [f]).slice(0, 4);
  const W = 320, rowH = 34, H = bars.length * rowH + 8;
  let s = '';
  bars.forEach((b, i) => {
    const parts = Math.round(stepNum(b?.parts, 1, 24, 4)), filled = Math.round(stepNum(b?.filled, 0, parts, 0)), w = 240 / parts, y = 6 + i * rowH;
    for (let k = 0; k < parts; k++) {
      s += `<rect x="${(6 + k * w).toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="24" fill="${k < filled ? STEP_TONES[i % STEP_TONES.length] : '#fff'}" stroke="#1D2A4D" stroke-width="1.2"/>`;
    }
    s += stepText(258, y + 17, b?.label ?? `${filled}/${parts}`, { anchor: 'start', size: 13, max: 10 });
  });
  return stepSvg(W, H, f.alt || 'Kesir şeritleri', s);
}
// Uzunluk modeli (bant): rows [{ label, parts: [{ size, text, tone }] }] (en çok 4 sıra, sırada 8 parça); uzunluklar
// sıralar arasında aynı ölçekle.
function figBars(f) {
  const rows = (Array.isArray(f.rows) ? f.rows : []).slice(0, 4).map((r) => ({ label: r?.label, parts: (Array.isArray(r?.parts) ? r.parts : []).slice(0, 8)
    .map((p, i) => ({ size: stepNum(p?.size, 0.01, 100000, 1), text: p?.text, tone: Math.round(stepNum(p?.tone, 0, 5, i % 6)) })) })).filter((r) => r.parts.length);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.parts.reduce((n, p) => n + p.size, 0))), W = 320, x0 = 86, scale = (W - x0 - 8) / max, rowH = 36;
  let s = '';
  rows.forEach((r, i) => {
    const y = 6 + i * rowH;
    if (r.label != null) s += stepText(x0 - 8, y + 18, r.label, { anchor: 'end', size: 12, max: 12 });
    let x = x0;
    for (const p of r.parts) {
      const w = p.size * scale;
      s += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="26" rx="3" fill="${STEP_TONES[p.tone]}" fill-opacity=".85" stroke="#1D2A4D" stroke-width="1.2"/>`;
      if (p.text != null && w > 16) s += stepText(x + w / 2, y + 18, p.text, { size: 12, fill: '#fff', max: Math.max(2, Math.floor(w / 7)) });
      x += w;
    }
  });
  return stepSvg(W, rows.length * rowH + 8, f.alt || 'Uzunluk modeli', s);
}
// Kareli alan: rows ve cols (1–12), filled kadar kare (satır satır) boyalı; label altta.
function figGrid(f) {
  const rows = Math.round(stepNum(f.rows, 1, 12, 3)), cols = Math.round(stepNum(f.cols, 1, 12, 4)), filled = Math.round(stepNum(f.filled, 0, rows * cols, rows * cols));
  const cell = Math.min(24, 300 / cols, 180 / rows), W = 320, x0 = (W - cell * cols) / 2;
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      s += `<rect x="${(x0 + c * cell).toFixed(1)}" y="${(6 + r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${r * cols + c < filled ? STEP_TONES[0] : '#fff'}" fill-opacity=".8" stroke="#1D2A4D" stroke-width="1"/>`;
    }
  }
  const H = 6 + rows * cell + (f.label != null ? 24 : 8);
  if (f.label != null) s += stepText(W / 2, 6 + rows * cell + 17, f.label, { size: 12, max: 30 });
  return stepSvg(W, H, f.alt || 'Kareli alan', s);
}
// Gruplar: groups (1–10) halka, her birinde each (0–12) nokta; extra: dışarıda kalan noktalar (kalan); label altta.
function figGroups(f) {
  const groups = Math.round(stepNum(f.groups, 1, 10, 3)), each = Math.round(stepNum(f.each, 0, 12, 4)), extra = Math.round(stepNum(f.extra, 0, 12, 0));
  const per = 5, W = 320, R = 26, gap = 60, rowsN = Math.ceil(groups / per);
  let s = '';
  for (let g = 0; g < groups; g++) {
    const cx = 34 + (g % per) * gap, cy = 34 + Math.floor(g / per) * gap;
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#EEF4FF" stroke="${STEP_TONES[0]}" stroke-width="2"/>`;
    const cols = Math.ceil(Math.sqrt(each)) || 1, d = Math.min(9, 34 / cols);
    for (let k = 0; k < each; k++) {
      const x = cx + ((k % cols) - (cols - 1) / 2) * d, y = cy + (Math.floor(k / cols) - (Math.ceil(each / cols) - 1) / 2) * d;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.min(3.4, d / 2.4).toFixed(1)}" fill="${STEP_TONES[1]}"/>`;
    }
  }
  let H = 34 + (rowsN - 1) * gap + R + 8;
  if (extra) {
    for (let k = 0; k < extra; k++) s += `<circle cx="${(30 + k * 12).toFixed(1)}" cy="${(H + 8).toFixed(1)}" r="4" fill="${STEP_TONES[3]}"/>`;
    H += 22;
  }
  if (f.label != null) { s += stepText(W / 2, H + 14, f.label, { size: 12, max: 30 }); H += 22; }
  return stepSvg(W, H, f.alt || 'Gruplar', s);
}
// Geometrik şekil: kind rect | square | triangle | circle; labels: kenar yazıları (rect/square: top, right, bottom, left;
// triangle: left, right, bottom, height; circle: r, d, center).
function figShape(f) {
  const kind = ['rect', 'square', 'triangle', 'circle'].includes(f.kind) ? f.kind : 'rect', L = f.labels && typeof f.labels === 'object' ? f.labels : {};
  const W = 320, H = 170, fill = '#E8F1FF', line = `stroke="${STEP_TONES[0]}" stroke-width="2.5"`;
  let s = '';
  if (kind === 'circle') {
    s += `<circle cx="160" cy="85" r="62" fill="${fill}" ${line}/><circle cx="160" cy="85" r="3" fill="#1D2A4D"/>`;
    if (L.r != null) s += `<line x1="160" y1="85" x2="222" y2="85" stroke="${STEP_TONES[1]}" stroke-width="2"/>` + stepText(191, 79, L.r, { size: 12, max: 12 });
    if (L.d != null) s += `<line x1="98" y1="110" x2="222" y2="110" stroke="${STEP_TONES[2]}" stroke-width="2" stroke-dasharray="4 3"/>` + stepText(160, 126, L.d, { size: 12, max: 12 });
    if (L.center != null) s += stepText(160, 100, L.center, { size: 11, max: 10 });
  } else if (kind === 'triangle') {
    s += `<path d="M60 145 L260 145 L170 25 Z" fill="${fill}" ${line} stroke-linejoin="round"/>`;
    if (L.bottom != null) s += stepText(160, 163, L.bottom, { size: 12, max: 14 });
    if (L.left != null) s += stepText(98, 82, L.left, { size: 12, anchor: 'end', max: 14 });
    if (L.right != null) s += stepText(222, 82, L.right, { size: 12, anchor: 'start', max: 14 });
    if (L.height != null) s += `<line x1="170" y1="25" x2="170" y2="145" stroke="${STEP_TONES[1]}" stroke-width="1.8" stroke-dasharray="4 3"/>` + stepText(176, 98, L.height, { size: 12, anchor: 'start', max: 12 });
  } else {
    const w = kind === 'square' ? 120 : 190, hgt = 120, x = (W - w) / 2, y = 22;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" fill="${fill}" ${line} rx="2"/>`;
    if (L.top != null) s += stepText(W / 2, y - 6, L.top, { size: 12, max: 14 });
    if (L.bottom != null) s += stepText(W / 2, y + hgt + 18, L.bottom, { size: 12, max: 14 });
    if (L.left != null) s += stepText(x - 8, y + hgt / 2 + 4, L.left, { size: 12, anchor: 'end', max: 12 });
    if (L.right != null) s += stepText(x + w + 8, y + hgt / 2 + 4, L.right, { size: 12, anchor: 'start', max: 12 });
  }
  return stepSvg(W, H, f.alt || 'Şekil', s);
}
// Tablo: head (en çok 6 sütun) ve rows (en çok 8 satır).
function figTable(f) {
  const head = (Array.isArray(f.head) ? f.head : []).slice(0, 6), rows = (Array.isArray(f.rows) ? f.rows : []).slice(0, 8).filter(Array.isArray);
  if (!head.length && !rows.length) return '';
  const cell = (v, tag) => `<${tag}>${stepEsc(v, 40)}</${tag}>`;
  return `<table class="step-table">${head.length ? `<thead><tr>${head.map((x) => cell(x, 'th')).join('')}</tr></thead>` : ''}`
    + `<tbody>${rows.map((r) => `<tr>${r.slice(0, 6).map((x) => cell(x, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
}
// Metinde işaretli sözcükler (paragraf soruları): text (en çok 500 harf) içinde marks (en çok 8 parça) işaretlenir.
function figMark(f) {
  const text = String(f.text ?? '').slice(0, 500);
  if (!text) return '';
  const marks = (Array.isArray(f.marks) ? f.marks : []).map((m) => String(m ?? '').slice(0, 80)).filter(Boolean).slice(0, 8);
  const spans = [];
  for (const m of marks) { const i = text.indexOf(m); if (i >= 0 && !spans.some(([a, b]) => i < b && i + m.length > a)) spans.push([i, i + m.length]); }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [a, b] of spans) { out += stepEsc(text.slice(at, a), 500) + `<mark>${stepEsc(text.slice(a, b), 80)}</mark>`; at = b; }
  return `<p class="step-mark">${out + stepEsc(text.slice(at), 500)}</p>`;
}
// Adımın şekli (HTML ya da SVG yazısı); bilinmeyen ya da bozuk şekil boş.
function stepFigure(fig, comma = true) {
  if (!fig || typeof fig !== 'object') return '';
  try {
    switch (fig.type) {
      case 'numberline': return figNumberline(fig, comma);
      case 'fraction': return figFraction(fig);
      case 'bars': return figBars(fig);
      case 'grid': return figGrid(fig);
      case 'groups': return figGroups(fig);
      case 'shape': return figShape(fig);
      case 'table': return figTable(fig);
      case 'mark': return figMark(fig);
      default: return '';
    }
  } catch (e) { return ''; }
}

/* Adımlar: ekran */

// Sorunun adımları (yoksa null). Aynı anda istenenler tek sorguda toplanır (listelerde çok çözüm olabilir); sonuç bu
// oturumda saklanır. Sütun yoksa ya da okunamazsa adım yok sayılır.
const stepsCache = new Map();
let stepsQueue = null;
function stepsLoad(qid) {
  if (!qid) return Promise.resolve(null);
  if (stepsCache.has(qid)) return stepsCache.get(qid);
  const p = new Promise((resolve) => {
    if (!stepsQueue) { stepsQueue = new Map(); setTimeout(stepsFlush, 40); }
    stepsQueue.set(qid, resolve);
  });
  stepsCache.set(qid, p);
  return p;
}
async function stepsFlush() {
  const batch = stepsQueue;
  stepsQueue = null;
  const ids = [...batch.keys()], found = new Map();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await sb.from('questions').select('id, steps').in('id', ids.slice(i, i + 100));
      if (error) break;
      for (const r of data || []) found.set(r.id, stepsClean(r.steps));
    }
  } catch (e) { /* adım yok sayılır */ }
  for (const [id, resolve] of batch) resolve(found.get(id) || null);
}
// Çözüm kutusu: kısa çözüm ve (adımları yazılmışsa) "Adım adım anlat". opts: cls (notun sınıfı), style, steps (verilirse
// sorgu yapılmaz).
function solutionBox(text, qid, opts = {}) {
  const { cls = 'note small', style = '', steps } = opts;
  const box = h('div', { class: 'stack solution-box', style: `gap: 6px${style ? `; ${style}` : ''}` });
  if (text) box.append(h('div', { class: cls }, text));
  const add = (st) => { if (st?.length) box.append(h('button', { class: 'small steps-open', onclick: (e) => e.currentTarget.replaceWith(stepsView(st)) }, '🪜 Adım adım anlat')); };
  if (Array.isArray(steps)) add(stepsClean(steps));
  else if (qid) stepsLoad(qid).then(add);
  return box;
}
// Sesli okuma: Türkçede tr-TR, İngilizcede en-US; biraz yavaş.
function stepSpeak(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') return;
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}]/gu, ''));
  u.lang = typeof LANG === 'string' && LANG === 'en' ? 'en-US' : 'tr-TR';
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
// Adım adım anlatım: adımlar tek tek açılır (öncekiler üstte kalır), her adımda sesli okuma ve şekil.
function stepsView(steps) {
  let shown = 1;
  const box = h('div', { class: 'steps-box stack', role: 'region', 'aria-label': 'Adım adım anlatım' });
  const comma = !(typeof LANG === 'string' && LANG === 'en');
  const canSay = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  const paint = () => {
    const more = shown < steps.length;
    fill(box,
      h('div', { class: 'spread' }, h('b', { class: 'small' }, '🪜 Adım adım'), h('span', { class: 'small muted num' }, `Adım ${shown} / ${steps.length}`)),
      h('ol', { class: 'steps-list' }, steps.slice(0, shown).map((st, i) => {
        const figHtml = stepFigure(st.fig, comma), fig = figHtml ? h('div', { class: 'step-fig' }) : null;
        if (fig) fig.innerHTML = figHtml;
        return h('li', { class: 'step' + (i === shown - 1 ? ' now' : '') },
          h('div', { class: 'step-row' }, h('p', {}, st.text),
            canSay ? h('button', { class: 'ghost small step-say', 'aria-label': 'Sesli oku', onclick: () => stepSpeak(st.text) }, '🔊') : null),
          fig);
      })),
      h('div', { class: 'row' },
        shown > 1 ? h('button', { class: 'ghost small', onclick: () => { shown--; paint(); } }, '‹ Önceki adım') : null,
        more ? h('button', { class: 'primary small', onclick: () => { shown++; paint(); box.querySelector('.step.now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, 'Sonraki adım ›')
          : h('button', { class: 'small', onclick: () => { shown = 1; paint(); } }, 'Baştan anlat')));
  };
  paint();
  return box;
}
