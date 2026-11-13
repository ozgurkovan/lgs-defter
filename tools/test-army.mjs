// Asker kahramanın kontrolü: node tools/test-army.mjs
// Açık/kapalı varsayılanı, rütbe eşikleri ve adları, sıradaki hedef, kahramanın sözü, kutlanacak haber (100'e ulaşma,
// terfi; ilk açılışta kutlama yok), kahramanın çizimi (numara göğüste, üniforma, şapka, bayrak, rütbe işareti; army
// verilmezse çizim birebir aynı) ve numaranın veritabanındaki hesabı (hata tekrarı 10'da, öteki doğru 20'de bir).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'docs', 'app.js'), 'utf8');
const src = readFileSync(join(root, 'docs', 'army.js'), 'utf8');
const sql = readFileSync(join(root, 'supabase', 'hero-army.sql'), 'utf8');
const pick = (text, from, to) => {
  const a = text.indexOf(from), b = text.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`bölüm bulunamadı: ${from}`);
  return text.slice(a, b);
};
const T = new Function([
  pick(src, '/* Asker: saf kısım', '/* Asker: ekran */'),
  pick(app, 'const HERO_LOOK = {', '// Yolculuğun yerleri'),
  'return { ARMY_SOLDIER, ARMY_STEPS, ARMY_CORPS, ARMY_CORPS_EN, ARMY_RANKS, ARMY_RANKS_EN, armyOn, armyUs, armyCorpsList, armyCorps, armyRank,'
    + ' armyRankName, armyNext, armyView, armySay, armyNews, HERO_UNIFORM, heroSvg, heroInsignia };',
].join('\n'))();

let fails = 0;
const check = (label, cond, info) => { if (!cond) fails++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${info !== undefined ? '  ' + info : ''}`); };

check('asker kahraman 7. sınıfa kadar açık gelir, 8. sınıftan sonra kapalı; velinin seçimi her sınıfta geçerli',
  T.armyOn({ grade: 3 }) && T.armyOn({ grade: 7 }) && !T.armyOn({ grade: 8 }) && !T.armyOn({}) && T.armyOn({ grade: 8, hero_army: true })
  && !T.armyOn({ grade: 4, hero_army: false }));
check('Türkiye üç kol (Kara, Deniz, Hava), ABD beş kol (Army, Navy, Air Force, Marines, Space Force)',
  T.armyCorpsList({ curriculum: 'tr' }).map((c) => c.id).join() === 'kara,deniz,hava'
  && T.armyCorpsList({ curriculum: 'us-pa' }).map((c) => c.id).join() === 'army,navy,airforce,marines,spaceforce' && T.armyCorpsList({}).length === 3);
const corpsIds = [...T.ARMY_CORPS, ...T.ARMY_CORPS_EN].map((c) => c.id);
check('her kolun 13 rütbesi, üniforması var; veritabanı da aynı kolları kabul ediyor',
  corpsIds.every((id) => (T.ARMY_RANKS[id] || T.ARMY_RANKS_EN[id])?.length === T.ARMY_STEPS.length && T.HERO_UNIFORM[id])
  && corpsIds.every((id) => sql.includes(`'${id}'`)) && T.ARMY_STEPS.length === 13);
check('rütbe eşikleri artan, ilk eşik 100 (asker olma)', T.ARMY_STEPS[0] === T.ARMY_SOLDIER && T.ARMY_STEPS.every((n, i) => !i || n > T.ARMY_STEPS[i - 1]));
check('rütbe sırası: 100\'den önce -1, 100\'de Er, 115\'te Onbaşı, 620\'de en yüksek; daha fazlası en yüksekte kalır',
  T.armyRank(0) === -1 && T.armyRank(99) === -1 && T.armyRank(100) === 0 && T.armyRank(114) === 0 && T.armyRank(115) === 1
  && T.armyRank(620) === 12 && T.armyRank(5000) === 12);
check('rütbe adları: Kara Er/Onbaşı/General, Deniz Amiral, ABD Army Private, Navy Admiral',
  T.armyRankName('kara', 0) === 'Er' && T.armyRankName('kara', 1) === 'Onbaşı' && T.armyRankName('kara', 12) === 'General'
  && T.armyRankName('deniz', 12) === 'Amiral' && T.armyRankName('army', 0) === 'Private' && T.armyRankName('navy', 12) === 'Admiral'
  && T.armyRankName('yok', 0) === '');
const n1 = T.armyNext(37, null), n2 = T.armyNext(120, null), n3 = T.armyNext(120, 'kara'), n4 = T.armyNext(700, 'kara');
check('sıradaki hedef: asker değilken 100, kolu seçmeden 100\'ü geçince yok, askerken sıradaki rütbe, en yüksekte yok',
  n1.at === 100 && n1.need === 63 && n2 === null && n3.at === 135 && n3.need === 15 && n3.rank === 2 && n4 === null);
check('kahramanın sözü: kalan numara, kol seçme zamanı, rütbe ve sıradaki rütbe',
  /Forma numaram 37! .*63 kaldı/.test(T.armySay({ points: 37 })) && /Hangi kolda/.test(T.armySay({ points: 104 }))
  && /^Kara Kuvvetleri · Onbaşı\. Çavuş olmama 15 numara kaldı\.$/.test(T.armySay({ points: 120, corps: 'kara' }))
  && /En yüksek rütbe/.test(T.armySay({ points: 999, corps: 'hava' })));
const v = T.armyView({ curriculum: 'us-pa' }, { points: 140, corps: 'navy' }), v0 = T.armyView({}, { points: 140, corps: 'uydurma' });
check('çizim bilgisi: numara, geçerli kol, rütbe, ülke; geçersiz kol asker sayılmaz; numara yoksa çizim bilgisi yok',
  v.num === 140 && v.corps === 'navy' && v.rank === 2 && v.country === 'us' && v0.corps === null && v0.rank === -1 && v0.country === 'tr'
  && T.armyView({}, null) === undefined);

// Kutlanacak haber
const first = T.armyNews({ points: 130, corps: 'kara' }, null);
check('ilk açılışta kutlama yok, şimdiki durum kaydedilir', first.news === null && first.seen.r === 1 && first.seen.ready === false);
const ready = T.armyNews({ points: 101 }, { r: -1, ready: false });
check('100\'e ulaşınca bir kez "hazır" kutlaması, sonra tekrar yok',
  ready.news === 'ready' && ready.seen.ready && T.armyNews({ points: 103 }, ready.seen).news === null);
const promo = T.armyNews({ points: 116, corps: 'kara' }, { r: 0, ready: false });
check('askerken rütbe artınca terfi kutlaması, aynı rütbede tekrar yok; kol başka cihazda seçildiyse sessizce kaydedilir',
  promo.news === 'promoted' && promo.seen.r === 1 && T.armyNews({ points: 120, corps: 'kara' }, promo.seen).news === null
  && T.armyNews({ points: 116, corps: 'kara' }, { r: -1, ready: true }).news === null);
check('kol sıfırlanınca (veli) yeniden "hazır" kutlaması', T.armyNews({ points: 200 }, { r: 3, ready: false }).news === 'ready');

// Çizim
const look = { ten: 2, sac: 1, model: 'percem' };
const levels = [0, 2, 4, 6, 8, 10];
// Eski çizimle (v118) birebir aynılık 2026-11-13'te 5610 çizimle (her seviye, görünüş, hal) ayrıca denendi.
check('army verilmezse (yok ya da null) çizim aynı (her seviye, aç ve tok)', levels.every((L) =>
  T.heroSvg('erkek', L, look) === T.heroSvg('erkek', L, look, undefined, undefined)
  && T.heroSvg('kiz', L, null, { key: 'ac', form: 0.5 }) === T.heroSvg('kiz', L, null, { key: 'ac', form: 0.5 }, null)));
const pre = levels.map((L) => T.heroSvg('erkek', L, look, undefined, { num: 37, corps: null, rank: -1, country: 'tr' }));
check('asker değilken her seviyede göğüste numara, eski "10" ve yıldız yerine; pelerin ve taç yerinde',
  pre.every((s) => />37<\/text>/.test(s)) && !/>10<\/text>/.test(pre[3]) && !pre[1].includes('font-size="16" fill="#fff">★')
  && pre[5].includes('#2F80ED') && pre[5].includes('M80 31 L84 14'));
check('pelerinli seviyelerde amblem ve madalya sola kayar, numara sağda (üst üste binmez)',
  /<circle cx="(\d+(\.\d+)?)" cy="122" r="8"/.test(pre[4]) && +pre[4].match(/<circle cx="([\d.]+)" cy="122" r="8"/)[1] < 100
  && /cy="116" r="7"/.test(pre[5]));
const soldiers = corpsIds.flatMap((corps) => [0, 3, 5, 9, 12].map((rank) => [corps, rank, T.heroSvg('kiz', 10, { model: 'uzun' }, undefined, { num: 321, corps, rank, country: ['army', 'navy', 'airforce', 'marines', 'spaceforce'].includes(corps) ? 'us' : 'tr' })]));
check('her kol ve rütbede üniformalı çizim bozuk sayı taşımıyor, numara künyede', soldiers.every(([, , s]) => !/NaN|undefined|Infinity/.test(s) && />321<\/text>/.test(s)));
const kara0 = T.heroSvg('erkek', 10, look, undefined, { num: 120, corps: 'kara', rank: 0, country: 'tr' });
const kara6 = T.heroSvg('erkek', 10, look, undefined, { num: 270, corps: 'kara', rank: 6, country: 'tr' });
check('askerken: kolunun gömleği ve kamuflajı, pantolon, bot, Türk bayrağı; pelerin ve taç yok, madalya var',
  kara0.includes(T.HERO_UNIFORM.kara.shirt) && kara0.includes(T.HERO_UNIFORM.kara.camo[0]) && kara0.includes(T.HERO_UNIFORM.kara.boot)
  && kara0.includes('#E30A17') && !kara0.includes('M80 31 L84 14') && !kara0.includes('#2F80ED"/>') && kara0.includes('fill="#F4C430" stroke="#D4A017"'));
check('er ve çavuşta kolun şapkası (Kara bere), subayda siperlikli şapka',
  kara0.includes('C62 27 90 17 117 21') && !kara0.includes('M64 36 Q100 12 136 36') && kara6.includes('M64 36 Q100 12 136 36'));
const navy = T.heroSvg('erkek', 4, look, undefined, { num: 101, corps: 'navy', rank: 0, country: 'us' });
check('denizcide yaka ve denizci şapkası, ABD\'de ABD bayrağı', navy.includes('stroke="#fff" stroke-width="2.4"') && navy.includes('C68 9 132 9 131 39') && navy.includes('#2B3F87'));
check('rütbe işareti: erde yok, onbaşıda bir şerit, çavuşta iki, subayda yıldız, en yüksekte çelenk',
  T.heroInsignia(0, 0, 0) === '' && (T.heroInsignia(1, 50, 50).match(/<path/g) || []).length === 1 && (T.heroInsignia(2, 50, 50).match(/<path/g) || []).length === 2
  && (T.heroInsignia(7, 50, 50).match(/★/g) || []).length === 2 && (T.heroInsignia(11, 50, 50).match(/★/g) || []).length === 3
  && T.heroInsignia(12, 50, 50).includes('Q'));
check('kahraman askerken de sevimli: yanaklar ve gülüş aynı', ['<circle cx="82" cy="69" r="5" fill="#F79E9E"', 'stroke="#9A4A3C"'].every((x) => kara6.includes(x)));
check('ekran okuyucu için numara ve askerlik çizimin adında', pre[0].includes('aria-label="Kelime kahramanı, güç 0, numara 37"') && kara0.includes(', asker, numara 120"'));

// Veritabanındaki hesap (metin denetimi): hata tekrarı iki kat, 20'de bir; kelime kartı 8'de bir; yayın günü
check('numaranın hesabı: (2 × hata tekrarı doğrusu + öteki doğrular + kelime kartı / 8 + klavye dersi) / 20, 2026-11-13\'ten',
  sql.includes('floor((2 * r.mistake + r.other + p.paper + floor(w.words / 8.0) + t.lessons) / 20.0)') && (sql.match(/2026-11-13T00:00:00\+03:00/g) || []).length >= 3);

console.log(fails ? `${fails} kontrol başarısız` : '');
process.exit(fails ? 1 : 0);
