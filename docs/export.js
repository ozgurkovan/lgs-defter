/* Yapamadığı soruların çıktısı (velinin isteği, 2026-11-21: "bilemediği soruların print'ini alabilir miyiz? okulda
   öğretmenine sormak istiyor, excel butonu lazım… hangi derste yanlışlar hangi konulardan gelmiş, grafikli"). Öğrenci, veli
   ve öğretmen açar ('cikti' sayfası): son 7 / 30 / 90 günde yanlış yaptığı, boş bıraktığı ve tahmin ettiği sorular (tekrarlar
   ve denemeler birlikte, aynı soru bir kez). "Yazdır" tarayıcının yazdırma penceresini açar (kâğıt ya da PDF); "Excel'e
   aktar" gerçek bir .xlsx dosyası indirir (Sorular ve Konu özeti sayfaları). Üstte derse ve konuya göre yanlış grafiği;
   aynı grafik raporun Zayıf konular sekmesinde de durur. Hiçbir şey kaydetmez. */

/* Çıktı: saf kısım (tools/test-export.mjs bunu dener) */

const EXPORT_PRINT_MAX = 60; // kâğıda en çok bu kadar soru (en yeniler); Excel'de hepsi
const EXPORT_KINDS = ['yanlis', 'bos', 'tahmin']; // yanlış, boş, tahminle doğru

// Derse ve konuya göre sayım. rows: [{ subject, topicId, topic, kind }]; order: derslerin sırası.
// → [{ subject, n, yanlis, bos, tahmin, topics: [{ id, name, n, yanlis, bos, tahmin }] }]; ders sırayla, konular çoktan aza.
function missMap(rows, order = []) {
  const bySubject = new Map();
  for (const r of rows || []) {
    if (!r || !r.subject || !EXPORT_KINDS.includes(r.kind)) continue;
    let s = bySubject.get(r.subject);
    if (!s) { s = { subject: r.subject, n: 0, yanlis: 0, bos: 0, tahmin: 0, topics: new Map() }; bySubject.set(r.subject, s); }
    const id = r.topicId || '?';
    let t = s.topics.get(id);
    if (!t) { t = { id, name: r.topic || '', n: 0, yanlis: 0, bos: 0, tahmin: 0 }; s.topics.set(id, t); }
    if (!t.name && r.topic) t.name = r.topic;
    s.n++; s[r.kind]++; t.n++; t[r.kind]++;
  }
  const rank = (x) => { const i = order.indexOf(x); return i < 0 ? 999 : i; };
  return [...bySubject.values()]
    .map((s) => ({ ...s, topics: [...s.topics.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)) }))
    .sort((a, b) => rank(a.subject) - rank(b.subject) || b.n - a.n);
}

// Konunun anahtarı (ders + konu): konusu belirsiz sorular dersin "?" konusunda toplanır.
const missTopicKey = (subject, topicId) => `${subject}|${topicId || '?'}`;
// Kâğıttaki sıra: ders ders, ders içinde en çok sorusu olan konudan başlayarak; konu içinde önce hâlâ zorlandıkları, sonra
// henüz sınanmayanlar, kısmen oturanlar, en sonda sonradan anladıkları (eşitlerde liste sırası: en yeni üstte).
// → [{ key, subject, name, rows }]
function missGroups(list, order = []) {
  const out = [];
  for (const g of missMap(list, order)) for (const t of g.topics) {
    const key = missTopicKey(g.subject, t.id);
    const rank = (x) => { const i = VERDICT_ORDER.indexOf(x.verdict); return i < 0 ? 1 : i; };
    out.push({ key, subject: g.subject, name: t.name, rows: list.filter((x) => missTopicKey(x.subject, x.topicId) === key)
      .map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([x]) => x) });
  }
  return out;
}
/* Sonradan anladı mı (velinin isteği, 2026-11-21: "yapamadıklarının içinde daha sonra anlayıp yaptıkları var mı? hangileri
   daha çok soru işareti, onları alabilsek"): raporun Gün gün çalışmasındaki kural. later: o sorudan sonra aynı konudan
   verdiği cevaplar [{ correct, confidence }]. Tahminle ya da kararsız (%50 ve altı) doğru sayılmaz; "anlamadım" ya da
   "birlikte bakalım" dediyse tek doğru yetmez. → 'zor' (sonrakilerin hiçbiri sağlam değil), 'belirsiz' (o konudan henüz
   yeni soru çözmedi), 'kismen', 'anladi'. İlk üçü "hâlâ soru işareti"dir. */
const VERDICT_ORDER = ['zor', 'belirsiz', 'kismen', 'anladi'];
function missVerdict(saidNo, later) {
  const n = (later || []).length;
  const ok = (later || []).filter((r) => r.correct && !(r.confidence && r.confidence <= 50)).length;
  const key = !n ? 'belirsiz' : ok === n && !(saidNo && ok < 2) ? 'anladi' : ok ? 'kismen' : 'zor';
  return { key, n, ok };
}
const missOpen = (x) => x.verdict !== 'anladi';
// Tekrar cevabının türü: boş geçtiyse 'bos', yanlışsa 'yanlis', tahminle (%25) doğruysa 'tahmin'; düz doğru null.
const reviewMissKind = (r) => (r.needs_help ? 'bos' : !r.correct ? 'yanlis' : r.confidence === 25 ? 'tahmin' : null);

// XML'e girecek yazı: geçersiz denetim karakterleri atılır, Excel'in hücre sınırına (32767) kısaltılır.
const xmlEsc = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').slice(0, 32000)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Sütun adı: 0 → A, 25 → Z, 26 → AA.
function xlsxCol(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
// Bir sayfa: rows[0] başlık (kalın, dondurulmuş), ötekiler satır; sayı olan hücre sayı, gerisi yazı. widths: sütun genişlikleri.
function xlsxSheet(rows, widths = []) {
  const cell = (v, r, c, style) => {
    const ref = xlsxCol(c) + (r + 1);
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const cols = widths.length ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + cols + '<sheetData>'
    + rows.map((row, r) => `<row r="${r + 1}">` + row.map((v, c) => cell(v, r, c, r === 0 ? 1 : 2)).join('') + '</row>').join('')
    + '</sheetData></worksheet>';
}
const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE3E9F7"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
  + '</styleSheet>';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// Sıkıştırmasız zip (xlsx bir zip dosyasıdır). files: [{ name, data: Uint8Array }] → Uint8Array.
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const head = (sig, f, extra) => {
    const b = new Uint8Array(extra);
    const v = new DataView(b.buffer);
    v.setUint32(0, sig, true);
    return [b, v];
  };
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const [lh, lv] = head(0x04034b50, f, 30);
    lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); // saat 00:00, tarih 1980-01-01 (dosyanın tarihi önemsiz)
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    parts.push(lh, name, f.data);
    const [ch, cv] = head(0x02014b50, f, 46);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const [eh, ev] = head(0x06054b50, null, 22);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eh];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) { out.set(b, at); at += b.length; }
  return out;
}
// Excel sayfa adı: en çok 31 harf, : \ / ? * [ ] olmaz.
const xlsxSheetName = (s, i) => (String(s || '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`);
// Çalışma kitabı. sheets: [{ name, rows, widths }] → Uint8Array (.xlsx).
function xlsxBook(sheets) {
  const enc = new TextEncoder();
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView/></bookViews><sheets>'
      + sheets.map((s, i) => `<sheet name="${xmlEsc(xlsxSheetName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', XLSX_STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, xlsxSheet(s.rows, s.widths)]),
  ];
  return zipStore(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
}

/* Çıktı: ekran */

// Çıktı sayfası açılırken hangi seçimle gelsin (Birlikte bakılacaklar sayfasından gelindiyse yalnızca onlar).
let exportPreset = null;
function openExport(preset) {
  exportPreset = preset || null;
  go('cikti');
}
// Listelerdeki düğme: çıktı sayfasını açar.
function exportButton(preset, label) {
  return h('button', { class: 'block export-open', onclick: () => openExport(preset) }, label || '🖨️ Yazdır ya da Excel\'e aktar');
}

const MISS_COLOR = { yanlis: 'var(--red)', bos: 'var(--amber)', tahmin: 'var(--accent)' };
const MISS_LABEL = { yanlis: 'Yanlış', bos: 'Boş', tahmin: 'Tahminle doğru' };
const VERDICT_LABEL = { zor: 'Hâlâ zorlanıyor', belirsiz: 'Henüz sınanmadı', kismen: 'Kısmen oturdu', anladi: 'Sonradan anlamış görünüyor' };
const VERDICT_COLOR = { zor: 'red', belirsiz: 'amber', kismen: 'amber', anladi: 'green' };
const MISS_TOPICS_MAX = 8; // ekranda ders başına en çok bu kadar konu; kalanı tek satırda toplanır (kâğıtta hepsi)

/* Derse ve konuya göre yanlış grafiği: her ders için toplam çubuğu, altında konuları (çoktan aza). Çubuk yanlış, boş ve
   tahminle doğru diye üç renge bölünür; uzunluk en çok yanlışı olan konuya göredir. */
function missChart(groups, note, onPick) {
  const total = groups.reduce((n, g) => n + g.n, 0);
  // onPick verilirse konu satırı düğmedir: dokununca yalnızca o konu seçilir (çıktı sayfası).
  const topicRow = (g, t) => {
    const kids = [h('span', {}, t.name || 'Konusu belirsiz'), track(t, maxTopic), h('span', { class: 'num' }, t.n)];
    return onPick ? h('button', { class: 'miss-row miss-pick', 'data-topic': missTopicKey(g.subject, t.id), 'aria-label': `${t.name || 'Konusu belirsiz'}: yalnızca bu konu`,
      onclick: () => onPick(missTopicKey(g.subject, t.id)) }, kids) : h('div', { class: 'miss-row' }, kids);
  };
  const maxTopic = Math.max(1, ...groups.flatMap((g) => g.topics.map((t) => t.n)));
  const maxSubj = Math.max(1, ...groups.map((g) => g.n));
  const track = (x, max) => h('span', { class: 'miss-track' }, EXPORT_KINDS.map((k) =>
    x[k] ? h('i', { style: `width: ${(x[k] / max) * 100}%; background: ${MISS_COLOR[k]}`, title: `${MISS_LABEL[k]}: ${x[k]}` }) : null));
  const used = EXPORT_KINDS.filter((k) => groups.some((g) => g[k]));
  return h('section', { class: 'card stack miss-chart', style: 'gap: 10px' },
    h('h2', {}, 'Yanlışlar hangi konulardan geliyor?'),
    note ? h('p', { class: 'small muted' }, note) : null,
    !total ? h('p', { class: 'muted small' }, 'Bu seçimde yanlış, boş ya da tahmin edilen soru yok.') : [
      h('div', { class: 'legend' }, used.map((k) => h('span', { style: `--c: ${MISS_COLOR[k]}` }, MISS_LABEL[k]))),
      groups.map((g) => {
        const shown = onPick ? g.topics : g.topics.slice(0, MISS_TOPICS_MAX); // çıktı sayfasında her konu seçilebilsin diye hepsi
        const rest = g.topics.slice(shown.length);
        return h('div', { class: 'stack miss-subject', style: 'gap: 4px', 'data-subject': g.subject },
          h('div', { class: 'miss-row miss-head' },
            h('b', {}, SUBJECTS[g.subject]?.name || g.subject), track(g, maxSubj), h('b', { class: 'num' }, g.n)),
          shown.map((t) => topicRow(g, t)),
          rest.length ? h('p', { class: 'small muted' }, `ve ${rest.length} konu daha: ${rest.reduce((n, t) => n + t.n, 0)} soru`) : null);
      })]);
}

// Rapordaki grafik: son 30 günün tekrarları (uygulamadaki denemenin cevapları denemelerle sayılır) ve bütün denemeler.
function reportMissChart(reviews30, eqs, topicName) {
  const rows = [
    ...reviews30.filter((r) => r.track !== 'deneme' && r.questions?.subject).map((r) => ({
      subject: r.questions.subject, topicId: r.questions.topic_id, topic: topicName[r.questions.topic_id]?.name, kind: reviewMissKind(r) })),
    ...eqs.filter((e) => e.outcome !== 'dogru').map((e) => ({
      subject: e.subject, topicId: e.topic_id, topic: topicName[e.topic_id]?.name, kind: e.outcome === 'bos' ? 'bos' : 'yanlis' })),
  ];
  const box = missChart(missMap(rows, visibleSubjects()), 'Son 30 günün tekrarları ve bütün denemeler. Çubuk ne kadar uzunsa o konuda o kadar çok soru kaçmış.');
  if (rows.some((r) => r.kind)) box.append(exportButton(null, '🖨️ Bu soruları yazdır ya da Excel\'e aktar'));
  return box;
}

// Seçilen dönemin soruları: tekrarlar ve denemeler tek listede, en yeni üstte, aynı soru bir kez (denemedeki kayıt öncelikli).
async function loadExportRows(days) {
  const s = sid();
  const from = addDays(localDate(), -days);
  const [revs, exs, allRevs] = await Promise.all([
    q(sb.from('reviews').select('id, question_id, answer, correct, needs_help, understood, confidence, track, answered_at, together_at, questions(subject, topic_id, stem, choices, answer, solution, image_path, topics(name))')
      .eq('student_id', s).eq('voided', false).gte('answered_at', from)
      .or('correct.eq.false,needs_help.eq.true,confidence.eq.25').order('answered_at', { ascending: false })),
    q(sb.from('exam_questions').select('id, q_no, subject, topic_id, outcome, student_answer, correct_answer, image_path, solution, question_id, created_at, exams(name, exam_date), topics(name), questions!exam_questions_question_id_fkey(stem, choices, image_path)')
      .eq('student_id', s).neq('outcome', 'dogru').order('created_at', { ascending: false })),
    // Dönemin bütün cevapları (yalnızca konu ve sonuç): "sonradan anladı mı" bunlardan çıkar.
    q(sb.from('reviews').select('question_id, correct, confidence, track, answered_at, questions(topic_id)')
      .eq('student_id', s).eq('voided', false).gte('answered_at', from)),
  ]);
  const byTopic = {};
  for (const r of allRevs) { const id = r.questions?.topic_id; if (id) (byTopic[id] ||= []).push(r); }
  // at: sorunun kaçırıldığı an. Denemede cevaplar deneme bitince topluca yazılır; aynı denemenin öteki soruları "sonra"
  // sayılmasın diye deneme kaydından 10 dakika sonrası alınır.
  const judge = (topicId, at, saidNo, qid) => {
    const v = missVerdict(saidNo, (byTopic[topicId] || []).filter((r) => r.answered_at > at && r.question_id !== qid));
    return { verdict: v.key, after: v.n ? `Sonra bu konudan ${v.n} soru çözdü: ${v.ok} sağlam doğru.` : topicId ? 'Bu konudan henüz yeni soru çözmedi.' : '' };
  };
  const trackName = { mistake: 'Hata tekrarı', topic: 'Konu tekrarı', extra: 'Ek çalışma', practice: 'Konu çalışması', deneme: 'Deneme', book: 'Kitap soruları', check: 'Veli/öğretmen denemesi' };
  const out = [];
  const seen = new Set();
  for (const e of exs) {
    const date = e.exams?.exam_date || localDate(new Date(e.created_at));
    if (date < from) continue;
    if (e.question_id) seen.add(e.question_id);
    const qn = e.questions || {};
    out.push({
      key: 'e' + e.id, date, subject: e.subject, topicId: e.topic_id, topic: e.topics?.name || '', kind: e.outcome === 'bos' ? 'bos' : 'yanlis',
      source: `${e.exams?.name || 'Deneme'} · ${e.q_no}. soru`, stem: qn.stem || '', choices: qn.choices || null,
      chosen: e.student_answer || null, answer: e.correct_answer || null, solution: e.solution || '',
      img: e.image_path ? ['photos', e.image_path] : qn.image_path ? ['questions', qn.image_path] : null, together: false,
      ...judge(e.topic_id, new Date(new Date(e.created_at).getTime() + 10 * 60000).toISOString(), false, e.question_id),
    });
  }
  for (const r of revs) {
    const qn = r.questions;
    const kind = reviewMissKind(r);
    if (!qn || !kind || seen.has(r.question_id)) continue;
    seen.add(r.question_id);
    out.push({
      key: 'r' + r.id, date: localDate(new Date(r.answered_at)), subject: qn.subject, topicId: qn.topic_id, topic: qn.topics?.name || '', kind,
      source: trackName[r.track] || '', stem: qn.stem || '', choices: qn.choices || null,
      chosen: r.answer || null, answer: qn.answer || null, solution: qn.solution || '',
      img: qn.image_path ? ['questions', qn.image_path] : null,
      together: !r.together_at && (!!r.needs_help || r.understood === false || r.confidence === 25),
      ...judge(qn.topic_id, r.answered_at, !!r.needs_help || r.understood === false, r.question_id),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Excel dosyası: "Sorular" (her soru bir satır) ve "Konu özeti" (derse ve konuya göre sayılar). Yazılar ekran diliyle.
function exportWorkbook(list, withKey) {
  const T = (s) => (typeof t === 'function' ? t(s) : s);
  const keys = ['A', 'B', 'C', 'D'];
  const head = ['No', 'Tarih', 'Ders', 'Konu', 'Nereden', 'Durum', 'Sonra', 'Soru', ...keys, 'İşaretlediği',
    ...(withKey ? ['Doğru cevap', 'Çözüm'] : []), 'Öğretmenin notu'].map(T);
  const rows = missGroups(list, visibleSubjects()).flatMap((g) => g.rows).map((x, i) => [ // kâğıttaki sırayla: konu konu
    i + 1, fmtDate(x.date), T(SUBJECTS[x.subject]?.name || x.subject), x.topic, T(x.source), T(MISS_LABEL[x.kind]), [T(VERDICT_LABEL[x.verdict] || ''), T(x.after || '')].filter(Boolean).join('\n'),
    [x.stem, x.img ? T('(Görselli soru: görsel çıktıda ve uygulamada)') : ''].filter(Boolean).join('\n'),
    ...keys.map((k) => x.choices?.[k] ?? ''), x.chosen || T('Boş'),
    ...(withKey ? [x.answer || '', x.solution || ''] : []), '']);
  const sum = [['Ders', 'Konu', 'Yanlış', 'Boş', 'Tahminle doğru', 'Toplam'].map(T)];
  for (const g of missMap(list, visibleSubjects())) {
    const name = T(SUBJECTS[g.subject]?.name || g.subject);
    sum.push([name, T('Bütün konular'), g.yanlis, g.bos, g.tahmin, g.n]);
    for (const tp of g.topics) sum.push([name, tp.name || T('Konusu belirsiz'), tp.yanlis, tp.bos, tp.tahmin, tp.n]);
  }
  return xlsxBook([
    { name: T('Sorular'), rows: [head, ...rows], widths: [5, 12, 16, 30, 26, 14, 30, 70, 24, 24, 24, 24, 12, ...(withKey ? [12, 70] : []), 30] },
    { name: T('Konu özeti'), rows: sum, widths: [18, 44, 10, 10, 16, 10] },
  ]);
}
function saveFile(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

async function viewExport() {
  const preset = exportPreset;
  exportPreset = null;
  // Açılışta yalnızca hâlâ soru işareti olanlar; hiç yoksa bütün yanlışlara düşer (velinin isteği: "eğer yoksa o zaman yanlış
  // yaptıkları olabilir"). Veli süzmeyi kendi seçtikten sonra kendiliğinden değişmez.
  const filter = { days: 30, kind: preset === 'together' ? 'together' : 'open', subject: 'all', topic: 'all' };
  let autoKind = preset !== 'together';
  const kindOk = (x) => (filter.kind === 'all' ? true : filter.kind === 'together' ? x.together : missOpen(x));
  let withKey = false;
  let withChart = true;
  const cache = {};
  const subjects = visibleSubjects();
  const name = state.student?.display_name || '';
  const sheet = h('div', { class: 'stack print-sheet' });
  const count = h('p', { class: 'small muted no-print', 'aria-live': 'polite' });
  const note = h('p', { class: 'small muted no-print export-fallback', hidden: true }, 'Hâlâ soru işareti olan soru yok: sonradan hepsini anlamış görünüyor. Bütün yanlış ve boşlar gösteriliyor.');
  let current = [];
  let images = [];

  const chipGroup = (key, options) => {
    const btns = options.map(([v, label]) => h('button', { class: 'chip', 'aria-pressed': String(filter[key] === v), 'data-v': String(v), onclick: () => {
      filter[key] = v;
      if (key === 'kind') autoKind = false;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === v)));
      draw();
    } }, label));
    return h('div', { class: 'chips', 'data-filter': key }, btns);
  };
  const printBtn = h('button', { class: 'primary', onclick: async () => {
    printBtn.disabled = true;
    // Görseller inmeden yazdırılırsa kâğıtta boş çerçeve çıkar; en çok 8 saniye beklenir.
    await Promise.race([Promise.all(images), new Promise((res) => setTimeout(res, 8000))]);
    printBtn.disabled = false;
    window.print();
  } }, '🖨️ Yazdır');
  const excelBtn = h('button', { class: 'export-excel', onclick: () => {
    try {
      saveFile(exportWorkbook(current, withKey), `telafio-${LANG === 'en' ? 'questions' : 'sorular'}-${localDate()}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast('Excel dosyası indirildi.');
    } catch (e) { console.error(e); toast('Excel dosyası hazırlanamadı, tekrar dene.'); }
  } }, '📊 Excel\'e aktar');
  const keyBox = h('input', { type: 'checkbox', id: 'export-key', onchange: (e) => { withKey = e.target.checked; draw(); } });
  const chartBox = h('input', { type: 'checkbox', id: 'export-chart', checked: true, onchange: (e) => { withChart = e.target.checked; draw(); } });
  // Konu konu yazdırma (velinin isteği, 2026-11-21: "hepsi değil de konu konu yazdırsak? çok fazla çıktı"): konu buradan ya da
  // grafikteki konu satırına dokunarak seçilir; kâğıda ve Excel'e yalnızca o konunun soruları girer.
  const topicSel = h('select', { id: 'export-topic', 'aria-label': 'Hangi konu', onchange: (e) => { filter.topic = e.target.value; draw(); } });

  const questionCard = (x, i) => h('article', { class: 'card stack print-q', style: 'gap: 6px' },
    h('div', { class: 'spread' },
      h('div', { class: 'row' }, h('b', { class: 'num' }, `${i + 1}.`), subjTag(x.subject), h('span', { class: 'small muted' }, x.topic || '')),
      h('span', { class: 'row', style: 'gap: 4px' }, h('span', { class: 'tag ' + (x.kind === 'yanlis' ? 'red' : 'amber') }, MISS_LABEL[x.kind]),
        VERDICT_LABEL[x.verdict] ? h('span', { class: 'tag miss-verdict ' + VERDICT_COLOR[x.verdict], 'data-verdict': x.verdict }, VERDICT_LABEL[x.verdict]) : null)),
    x.img ? (() => {
      const img = h('img', { class: 'qimg', alt: 'Soru görseli' });
      images.push(signedUrl(...x.img).then((u) => (u ? new Promise((res) => { img.onload = img.onerror = res; img.src = u; }) : null)));
      return img;
    })() : null,
    x.stem ? h('p', { class: 'stem small' }, x.stem) : null,
    x.choices ? h('div', { class: 'stack', style: 'gap: 4px' }, ['A', 'B', 'C', 'D'].filter((k) => x.choices[k] !== undefined).map((k) =>
      h('div', { class: 'opt small' + (withKey && k === x.answer ? ' right' : k === x.chosen ? ' wrong' : '') },
        h('b', {}, k), h('span', {}, x.choices[k]), k === x.chosen ? h('span', { class: 'muted' }, ' ← işaretlediği') : null))) : null,
    h('p', { class: 'small muted' }, [x.source, fmtDate(x.date),
      !x.choices && x.chosen ? `işaretlediği ${x.chosen}` : null, !x.chosen ? 'boş bıraktı' : null,
      withKey && x.answer ? `doğru cevap ${x.answer}` : null].filter(Boolean).join(' · ')),
    x.after ? h('p', { class: 'small muted' }, x.after) : null,
    withKey && x.solution ? h('div', { class: 'note small' }, h('b', {}, 'Çözüm: '), x.solution) : null);

  async function draw() {
    if (!cache[filter.days]) {
      fill(sheet, h('p', { class: 'boot' }, 'Sorular yükleniyor…'));
      printBtn.disabled = excelBtn.disabled = true;
      try { cache[filter.days] = await loadExportRows(filter.days); }
      catch (e) { console.error(e); return fill(sheet, h('div', { class: 'card' }, h('p', { class: 'error' }, 'Sorular yüklenemedi, tekrar dene.'))); }
    }
    const inSubject = cache[filter.days].filter((x) => subjects.includes(x.subject) && (filter.subject === 'all' || x.subject === filter.subject));
    let fellBack = false;
    if (autoKind && filter.kind === 'open' && inSubject.length && !inSubject.some(missOpen)) {
      filter.kind = 'all'; fellBack = true;
      document.querySelectorAll('#app [data-filter="kind"] .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'all')));
    }
    const base = inSubject.filter(kindOk);
    const topics = missGroups(base, subjects);
    if (!topics.some((g) => g.key === filter.topic)) filter.topic = 'all'; // dönem ya da ders değişince o konu kalmadıysa
    fill(topicSel, h('option', { value: 'all' }, `Bütün konular (${base.length} soru)`),
      subjects.filter((s) => topics.some((g) => g.subject === s)).map((s) => h('optgroup', { label: t(SUBJECTS[s]?.name || s) },
        topics.filter((g) => g.subject === s).map((g) => h('option', { value: g.key }, `${g.name || 'Konusu belirsiz'} (${g.rows.length})`)))));
    topicSel.value = filter.topic;
    topicSel.disabled = !base.length;
    current = filter.topic === 'all' ? base : topics.find((g) => g.key === filter.topic).rows;
    images = [];
    const shown = current.slice(0, EXPORT_PRINT_MAX);
    printBtn.disabled = excelBtn.disabled = !current.length;
    count.textContent = current.length > shown.length
      ? `${current.length} soru. Kâğıda en yeni ${shown.length} soru çıkar; Excel'de hepsi var.` : `${current.length} soru`;
    note.hidden = !fellBack;
    const period = `${fmtDate(addDays(localDate(), -filter.days))} – ${fmtDate(localDate())}`;
    fill(sheet,
      h('header', { class: 'print-only stack', style: 'gap: 2px' },
        h('h1', {}, name ? `${name} · ${state.student.grade}. sınıf` : 'Sorular'),
        h('p', { class: 'small' }, `Yanlış, boş ve tahmin edilen sorular · ${period}`)),
      (() => {
        const chart = missChart(missMap(current, subjects),
          `${period} · ${current.length} soru` + (filter.topic === 'all' && current.length ? '. Bir konuya dokununca yalnızca o konunun soruları kalır.' : ''),
          filter.topic === 'all' ? (key) => { filter.topic = key; draw(); } : null);
        if (!withChart) chart.classList.add('no-print');
        return chart;
      })(),
      // Sorular konu konu: her konunun başlığı, altında soruları (numaralar baştan sona sürer).
      h('div', { class: 'print-questions' }, (() => {
        let no = 0;
        return missGroups(shown, subjects).map((g) => [
          h('h3', { class: 'print-topic' }, `${SUBJECTS[g.subject]?.name || g.subject} · ${g.name || 'Konusu belirsiz'} · ${g.rows.length} soru`),
          g.rows.map((x) => questionCard(x, no++))]);
      })()),
      !current.length ? h('div', { class: 'card flat' }, h('p', { class: 'muted small' }, 'Bu seçimde soru yok.')) : null);
  }

  render(
    h('header', { class: 'stack no-print', style: 'gap: 4px' },
      h('p', { class: 'label' }, 'Yazdır · Excel'),
      h('h1', {}, 'Öğretmene sorulacak sorular'),
      h('p', { class: 'muted' }, isParentView()
        ? 'Yanlış yaptığı, boş bıraktığı ve tahmin ettiği sorular. Önce hâlâ soru işareti olanlar gelir: o konudan sonra çözdüğü sorularda henüz oturmamış olanlar. Yazdırıp okula götürebilir ya da Excel dosyası olarak öğretmenine gönderebilirsiniz.'
        : 'Yanlış yaptığın, boş bıraktığın ve tahmin ettiğin sorular. Önce hâlâ soru işareti olanlar gelir. Yazdırıp okula götürebilir, öğretmenine sorabilirsin.')),
    h('section', { class: 'stack no-print export-controls', style: 'gap: 8px' },
      chipGroup('days', [[7, 'Son 7 gün'], [30, 'Son 30 gün'], [90, 'Son 90 gün']]),
      chipGroup('kind', [['open', 'Hâlâ soru işareti olanlar'], ['all', 'Bütün yanlış ve boşlar'], ['together', 'Yalnızca birlikte bakılacaklar']]),
      subjects.length > 1 ? chipGroup('subject', [['all', 'Bütün dersler'], ...subjects.map((x) => [x, SUBJECTS[x].name])]) : null,
      topicSel,
      h('label', { class: 'row small', for: 'export-key' }, keyBox, h('span', {}, 'Doğru cevapları ve çözümleri de ekle')),
      h('label', { class: 'row small', for: 'export-chart' }, chartBox, h('span', {}, 'Konu grafiğini de yazdır')),
      h('div', { class: 'row export-actions' }, printBtn, excelBtn),
      count, note),
    sheet);
  await draw();
}
