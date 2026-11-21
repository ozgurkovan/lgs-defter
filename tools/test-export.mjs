// Yazdırma ve Excel'in kontrolü: node tools/test-export.mjs
// Derse ve konuya göre sayım (sıra, türler, konusu belirsiz), tekrar cevabının türü, sütun adları, XML kaçışı, sayfa adı,
// .xlsx dosyasının zip yapısı (her parça yerinde, sağlama toplamı bağımsız hesapla aynı, Türkçe harfler UTF-8).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs', 'export.js'), 'utf8');
const pure = src.slice(src.indexOf('/* Çıktı: saf kısım'), src.indexOf('/* Çıktı: ekran */'));
const T = new Function(pure + '\nreturn { missMap, reviewMissKind, xmlEsc, xlsxCol, xlsxSheet, xlsxSheetName, xlsxBook, zipStore, crc32, EXPORT_PRINT_MAX };')();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };

const rows = [
  { subject: 'fen', topicId: 'f1', topic: 'Basınç', kind: 'yanlis' },
  { subject: 'matematik', topicId: 'm1', topic: 'Üslü ifadeler', kind: 'yanlis' },
  { subject: 'matematik', topicId: 'm1', topic: 'Üslü ifadeler', kind: 'bos' },
  { subject: 'matematik', topicId: 'm2', topic: 'Kareköklü ifadeler', kind: 'tahmin' },
  { subject: 'matematik', topicId: 'm1', topic: 'Üslü ifadeler', kind: 'yanlis' },
  { subject: 'turkce', topicId: null, topic: '', kind: 'yanlis' },
  { subject: 'turkce', topicId: 't1', topic: 'Paragraf', kind: null }, // düz doğru: sayılmaz
  { subject: null, topicId: 'x', kind: 'yanlis' },
];
const map = T.missMap(rows, ['turkce', 'matematik', 'fen']);
check('sayım: dersler verilen sırayla, konular çoktan aza; düz doğru ve dersi olmayan satır sayılmaz',
  map.map((g) => g.subject).join() === 'turkce,matematik,fen' && map[1].topics.map((t) => t.id).join() === 'm1,m2' && map[0].n === 1,
  JSON.stringify(map.map((g) => [g.subject, g.n])));
check('sayım: yanlış, boş ve tahmin ayrı; dersin toplamı konuların toplamı',
  map[1].n === 4 && map[1].yanlis === 2 && map[1].bos === 1 && map[1].tahmin === 1 && map[1].topics[0].yanlis === 2 && map[1].topics[0].bos === 1
  && map.every((g) => g.n === g.topics.reduce((n, t) => n + t.n, 0)));
check('sayım: konusu olmayan soru "?" altında toplanır; sırada olmayan ders sona gider; boş girdi boş liste',
  map[0].topics[0].id === '?' && T.missMap(rows, ['fen']).map((g) => g.subject)[0] === 'fen' && T.missMap(null).length === 0 && T.missMap([]).length === 0);
check('tekrar cevabının türü: boş geçti, yanlış, tahminle doğru; düz doğru yok',
  T.reviewMissKind({ needs_help: true, correct: false }) === 'bos' && T.reviewMissKind({ correct: false, confidence: 100 }) === 'yanlis'
  && T.reviewMissKind({ correct: true, confidence: 25 }) === 'tahmin' && T.reviewMissKind({ correct: true, confidence: 75 }) === null);
check('sütun adları: A, Z, AA, AZ, BA', [0, 25, 26, 51, 52].map(T.xlsxCol).join() === 'A,Z,AA,AZ,BA');
check('XML kaçışı: & < > " kaçar, denetim karakteri atılır, satır sonu kalır, uzun yazı kısalır',
  T.xmlEsc('a<b & "c">\u0001\u000B\nd') === 'a&lt;b &amp; &quot;c&quot;&gt;\nd' && T.xmlEsc('x'.repeat(40000)).length === 32000 && T.xmlEsc(null) === '');
check('sayfa adı: yasak karakterler atılır, 31 harfle sınırlı, boşsa yedek ad',
  T.xlsxSheetName('Konu: özeti/2', 0) === 'Konu  özeti 2' && T.xlsxSheetName('x'.repeat(50), 0).length === 31 && T.xlsxSheetName('', 1) === 'Sheet2');
const sheet = T.xlsxSheet([['No', 'Soru'], [1, '3 < 5 & "evet"'], [2, null]], [5, 40]);
check('sayfa: başlık kalın biçimde (s=1), sayı hücresi sayı, yazı kaçışlı, boş hücre boş, sütun genişlikleri ve dondurulmuş başlık',
  sheet.includes('<c r="A1" s="1" t="inlineStr">') && sheet.includes('<c r="A2" s="2"><v>1</v></c>') && sheet.includes('3 &lt; 5 &amp; &quot;evet&quot;')
  && sheet.includes('<c r="B3" s="2"/>') && sheet.includes('<col min="2" max="2" width="40" customWidth="1"/>') && sheet.includes('state="frozen"'));

// Dosyanın kendisi: zip dizinini oku, her parçayı bağımsız bir sağlama toplamıyla karşılaştır.
const slowCrc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
const book = T.xlsxBook([{ name: 'Sorular', rows: [['Ders', 'Soru'], ['Türkçe', 'Çığ düşünce ne olur? ğüşiöçİ']], widths: [10, 40] },
  { name: 'Konu özeti', rows: [['Ders', 'Toplam'], ['Fen', 3]] }]);
const dv = new DataView(book.buffer, book.byteOffset, book.byteLength);
const eocd = book.length - 22;
const n = dv.getUint16(eocd + 10, true);
let at = dv.getUint32(eocd + 16, true);
const dec = new TextDecoder();
const entries = {};
let good = dv.getUint32(eocd, true) === 0x06054b50 && dv.getUint32(0, true) === 0x04034b50;
for (let i = 0; i < n; i++) {
  if (dv.getUint32(at, true) !== 0x02014b50) { good = false; break; }
  const crc = dv.getUint32(at + 16, true), size = dv.getUint32(at + 20, true), nameLen = dv.getUint16(at + 28, true), off = dv.getUint32(at + 42, true);
  const name = dec.decode(book.subarray(at + 46, at + 46 + nameLen));
  const localName = dv.getUint16(off + 26, true);
  const data = book.subarray(off + 30 + localName, off + 30 + localName + size);
  if (dv.getUint32(off, true) !== 0x04034b50 || dv.getUint16(off + 8, true) !== 0 || slowCrc(data) !== crc || dv.getUint32(off + 14, true) !== crc) good = false;
  entries[name] = dec.decode(data);
  at += 46 + nameLen;
}
check('xlsx: zip yapısı sağlam, parçalar sıkıştırmasız, sağlama toplamları bağımsız hesapla aynı', good && at === eocd, `${n} parça`);
check('xlsx: gereken parçalar var (içerik türleri, ilişkiler, kitap, biçimler, iki sayfa)',
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].every((k) => entries[k]?.startsWith('<?xml')),
  Object.keys(entries).join(' '));
check('xlsx: sayfa adları kitapta, Türkçe harfler bozulmadan, her sayfa kendi ilişkisiyle',
  entries['xl/workbook.xml']?.includes('name="Sorular"') && entries['xl/workbook.xml']?.includes('name="Konu özeti"')
  && entries['xl/worksheets/sheet1.xml']?.includes('Çığ düşünce ne olur? ğüşiöçİ') && entries['xl/_rels/workbook.xml.rels']?.includes('worksheets/sheet2.xml')
  && entries['[Content_Types].xml']?.includes('/xl/worksheets/sheet2.xml'));
check('sağlama toplamı bilinen değerle aynı ("123456789" → CBF43926); kâğıda en çok 60 soru',
  T.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926 && T.EXPORT_PRINT_MAX === 60);

process.exit(fails ? 1 : 0);
