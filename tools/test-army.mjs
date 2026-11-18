// Asker kahramanın kontrolü: node tools/test-army.mjs
// Açık/kapalı varsayılanı, rütbe eşikleri ve adları, sıradaki hedef, kahramanın sözü, kutlanacak haber (100'e ulaşma,
// terfi; ilk açılışta kutlama yok), kahramanın çizimi (numara göğüste, üniforma, şapka, bayrak, rütbe işareti; army
// verilmezse çizim birebir aynı), numaranın veritabanındaki hesabı (hata tekrarı 10'da, öteki doğru 20'de bir) ve uzaylı
// savaşı (cephane, düşman, saklanma yerleri, son söz, çizimler, oturum ve deneme sonuna bağlı); asker olana kadar madalyalar.
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
    + ' armyRankName, armyNext, armyView, armySay, armyNews, HERO_UNIFORM, heroSvg, heroInsignia, ARMY_MEDALS, armyMedals, armyNextMedal, armyMedalSvg, ARMY_PER_NUMBER, armyPointsLeft };',
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

// Madalyalar (asker olana kadar): 5'te ilk madalya, sonra her 10'da bir; 90'da sonuncusu
const M = T.ARMY_MEDALS;
check('10 madalya, numaraları artan ve 100\'den küçük (5, 10, 20 … 90); adları farklı; ilk üçü bronz, dördü gümüş, son üçü altın',
  M.length === 10 && M.map((m) => m.at).join() === '5,10,20,30,40,50,60,70,80,90' && new Set(M.map((m) => m.name)).size === 10
  && M.map((m) => m.metal).join() === 'bronz,bronz,bronz,gumus,gumus,gumus,gumus,altin,altin,altin'
  && M.every((m) => m.ribbon.every((c) => /^#[0-9A-F]{6}$/i.test(c)) && m.say.length > 10));
check('kaç madalya ve sıradaki: 0\'da yok, 5\'te ilki, 9\'da bir, 10\'da iki, 95\'te hepsi; 47\'de sıradaki Yarı Yol Kupası',
  T.armyMedals(0) === 0 && T.armyMedals(5) === 1 && T.armyMedals(9) === 1 && T.armyMedals(10) === 2 && T.armyMedals(95) === 10 && T.armyMedals(500) === 10
  && T.armyNextMedal(47).at === 50 && T.armyNextMedal(0).at === 5 && T.armyNextMedal(95) === null);
check('madalya çizimi: kazanılan metal ve şekilli, kazanılmamış gri ve numaralı; bozuk sayı yok',
  M.every((m) => !/NaN|undefined/.test(T.armyMedalSvg(m)) && !/NaN|undefined/.test(T.armyMedalSvg(m, 'locked')))
  && T.armyMedalSvg(M[3]).includes(M[3].ribbon[0]) && />30<\/text>/.test(T.armyMedalSvg(M[3], 'locked')) && !T.armyMedalSvg(M[3], 'locked').includes(M[3].ribbon[0]));
check('kahramanın sözü madalyayla: kazandığı son madalya ve sıradakine kalan; madalyasızken ilk madalyaya kalan; 90\'dan sonra askerliğe kalan',
  T.armySay({ points: 47 }) === 'Forma numaram 47! 🏅 Aslan Yürek Madalyası benim! Sıradaki madalyaya 3, askerliğe 53 kaldı.'
  && T.armySay({ points: 3 }) === 'Forma numaram 3! İlk madalyaya 2, askerliğe 97 kaldı.'
  && T.armySay({ points: 92 }) === 'Forma numaram 92! 🏅 Kahramanlık Nişanı benim! 100 olunca asker olacağım: 8 kaldı.');
const mNews = T.armyNews({ points: 47 }, { r: -1, ready: false, m: 4 }), oldSeen = T.armyNews({ points: 7 }, { r: -1, ready: false });
check('yeni madalyada bir kez kutlama; madalyalardan önceki kayıtta kazandığı madalya bir kez kutlanır; askerken madalya kutlaması yok',
  mNews.news === 'medal' && mNews.seen.m === 5 && T.armyNews({ points: 48 }, mNews.seen).news === null && oldSeen.news === 'medal'
  && T.armyNews({ points: 3 }, { r: -1, ready: false }).news === null && T.armyNews({ points: 130, corps: 'kara' }, { r: 1, ready: false, m: 2 }).news === null
  && T.armyNews({ points: 47 }, null).news === null && T.armyNews({ points: 47 }, null).seen.m === 5);
const v47 = T.armyView({}, { points: 47 }), vSol = T.armyView({}, { points: 140, corps: 'kara' });
const mLook = { ten: 2, sac: 1, model: 'percem' };
const r47 = T.heroSvg('erkek', 6, mLook, undefined, v47), r0 = T.heroSvg('erkek', 6, mLook, undefined, { ...v47, ribbons: [] });
check('göğüste kazandığı madalyaların kurdeleleri (askerken hepsi); kurdele yoksa çizim aynı; ekran okuyucuya madalya sayısı',
  v47.ribbons.length === 5 && vSol.ribbons.length === 10 && M.slice(0, 5).every((m) => r47.includes(`fill="${m.ribbon[0]}"`))
  && r0 === T.heroSvg('erkek', 6, mLook, undefined, { num: 47, corps: null, rank: -1, country: 'tr' }) && r47.includes(', numara 47, 5 madalya"')
  && !/NaN|undefined/.test(T.heroSvg('kiz', 0, mLook, undefined, T.armyView({}, { points: 99 }))) && !/NaN|undefined/.test(T.heroSvg('erkek', 10, mLook, undefined, vSol)));

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

// Veritabanındaki hesap (metin denetimi): hata tekrarı iki kat, 20 puanda bir; kelime kartı 5'te bir; yayın günü
check('puan: hata tekrarı doğrusu 2, öteki doğru 1, 5 kelime kartı 1 (2026-11-15\'ten önce 8), klavye dersi 1; 20 puan bir numara; 2026-11-13\'ten; puan çocuğa da gelir',
  sql.includes('(2 * r.mistake + r.other + p.paper + floor(w.words / 5.0) + t.lessons)::int') && sql.includes('public.hero_army_raw(sid, since, upto) / 20')
  && sql.includes("'raw', public.hero_army_raw(") && (sql.match(/2026-11-13T00:00:00\+03:00/g) || []).length >= 4);
check('sıradaki numaraya kalan puan: 55 puanda 5, 60\'ta 20 (yeni numara), puan bilinmiyorsa yok',
  T.ARMY_PER_NUMBER === 20 && T.armyPointsLeft({ raw: 55 }) === 5 && T.armyPointsLeft({ raw: 60 }) === 20 && T.armyPointsLeft({ raw: 0 }) === 20
  && T.armyPointsLeft({ raw: 97 }) === 3 && T.armyPointsLeft({ points: 4 }) === null && T.armyPointsLeft(null) === null);

// Uzaylı savaşı (ikinci aşama): cephane, düşman, saklanma yerleri, son söz ve çizimler
const B = new Function([
  pick(app, 'const HERO_LOOK = {', '// Yolculuğun yerleri'),
  pick(src, '/* Uzaylı savaşı: saf kısım */', '/* Uzaylı savaşı: oyun */'),
  'return { battleHard, battleSetup, battlePosts, battleSay, battleTrooper, battleCover, battleRubble, battleVehicle, battleUfo, BATTLE_FIELD, BATTLE_POD,'
    + ' BATTLE_BULLET, BATTLE_GRENADE, BATTLE_SPLAT, BATTLE_HEAD };',
].join('\n'))();
check('zor soru: hata tekrarındaki soru ya da uzun soru (8. sınıfta 2 dk, 4. sınıfa kadar 1,5 dk ve üstü)',
  B.battleHard('mistake', 60, 8) && B.battleHard('topic', 120, 8) && !B.battleHard('topic', 90, 8) && B.battleHard('topic', 90, 4)
  && !B.battleHard('topic', 60, 3) && !B.battleHard('deneme', undefined, 8) && B.battleHard('deneme', 150, 7));
const g1 = B.battleSetup(12, 3, 2, 'session', 4), g2 = B.battleSetup(50, 20, 10, 'session', 8), g3 = B.battleSetup(26, 4, 6, 'exam', 8);
check('cephane: her doğru bir mermi, zor doğru el bombası (oturumda en çok 3); 3 uzaylı + her yanlış bir uzaylı (en çok 10)',
  g1.bullets === 10 && g1.grenades === 2 && g1.aliens === 6 && !g1.exam && !g1.superBomb
  && g2.grenades === 3 && g2.bullets === 30 && g2.aliens === 10 && B.battleSetup(5, 0, 0).aliens === 3);
check('denemede: en çok 5 el bombası, 12 uzaylı, ana gemi 6 can; yüzde 80 ve üstü doğruda süper bomba',
  g3.exam && g3.grenades === 5 && g3.bullets === 21 && g3.aliens === 7 && g3.motherHp === 6 && g3.superBomb
  && !B.battleSetup(23, 7, 0, 'exam').superBomb && B.battleSetup(24, 6, 0, 'exam').superBomb && B.battleSetup(10, 40, 0, 'exam').aliens === 12);
check('küçüklerde uzaylı daha uzun bakar ve tek tek çıkar; bozuk sayılar sıfırlanır, zor sayısı doğruyu aşmaz',
  g1.peekMs > B.battleSetup(1, 1, 0, 'session', 8).peekMs && g1.maxUp === 1 && B.battleSetup(1, 1, 0, 'session', 8).maxUp === 2
  && B.battleSetup(-3, -1, 9).bullets === 0 && B.battleSetup(-3, -1, 9).grenades === 0 && B.battleSetup(2, 0, 9).grenades === 2);
const sizes = (n, exam) => B.battlePosts(n, exam).map((p) => p.aliens.length).join();
check('saklanma yerleri: 4 uzaylıya kadar 3, sonra 4 yer; uzaylılar sırayla dağılır; denemede yerler biraz aşağıda',
  sizes(3) === '1,1,1' && sizes(4) === '2,1,1' && sizes(10) === '3,3,2,2' && B.battlePosts(10).flatMap((p) => p.aliens).sort((a, b) => a - b).join() === '0,1,2,3,4,5,6,7,8,9'
  && B.battlePosts(5, true)[0].y === B.battlePosts(5)[0].y + 6);
check('son söz: hepsi kovalandı (artan mermi ve bomba), ana gemi patladı, mermi bitti (radara kaçanlar), sıkıldılar, atlandı, hiç mermi yok',
  /^🎉 6 uzaylının hepsini kovaladın! Kovaladık, kaçtılar! 4 mermin ve 2 el bomban arttı\.$/.test(B.battleSay({ reason: 'win', chased: 6, aliens: 6, left: 4, leftGrenades: 2 }))
  && /^💥 Ana gemi patladı!/.test(B.battleSay({ reason: 'win', chased: 7, aliens: 7, mother: 'down' }))
  && /geri çekildik! 3 uzaylıyı kovaladın, 7 tanesi radara kaçtı\. Daha çok doğru/.test(B.battleSay({ reason: 'ammo', chased: 3, aliens: 10 }))
  && /ana gemi kaçtı/.test(B.battleSay({ reason: 'ammo', chased: 7, aliens: 7, mother: 'fled' }))
  && /sıkıldı/.test(B.battleSay({ reason: 'time', chased: 2, aliens: 6 })) && /atladın\. 5 uzaylı/.test(B.battleSay({ reason: 'skip', chased: 0, aliens: 5 }))
  && /hiç mermi yok/.test(B.battleSay({ reason: 'empty', aliens: 4 })) && B.battleSay(null) === '');
const fields = ['land', 'sea', 'air', 'space'];
const pics = [...['peek', 'aim', 'hit', 'cheer'].flatMap((m) => [0, 1, 2, 3].map((c) => B.battleTrooper(c, m))),
  ...fields.flatMap((f) => [0, 1].flatMap((i) => [B.battleCover(f, i), B.battleRubble(f, i)])), ...fields.map((f) => B.battleVehicle(f, '#5E6E3B')),
  B.battleUfo(0, true), B.battleUfo(2), B.BATTLE_POD, B.BATTLE_BULLET, B.BATTLE_GRENADE, B.BATTLE_SPLAT, B.BATTLE_HEAD];
check('savaş çizimleri (uzaylılar, saklanma yerleri, araçlar, ana gemi) bozuk sayı taşımıyor; her kolun savaş yeri var',
  pics.every((s) => s.startsWith('<svg') && !/NaN|undefined|Infinity/.test(s)) && corpsIds.every((id) => fields.includes(B.BATTLE_FIELD[id])));
check('savaş bağlı: oturum sonunda (hata tekrarında radardan) ve deneme sonunda, yalnızca asker olan çocukta',
  /battleCard\(stats\.correct, stats\.total - stats\.correct, hard, 'session', track === 'mistake'\)/.test(app) && /saved \? battleCard\([\s\S]{0,200}'exam'\)/.test(app)
  && /target: question\.target_seconds/.test(app) && /if \(!st \|\| !armyCorps\(st\.corps\)\) return;/.test(src));

// Antrenman (asker olana kadar): kum torbası, 70'ten sonra uzaylı partner; üst üste doğrularla büyüyen sahneler (yumruk, kroşe, tekme, kombo), yanlışta düşüş
let lang = 'tr';
const R = new Function([
  "const trEn = (tr, en) => (this.lang() === 'en' ? en : tr);",
  pick(src, '/* Asker: saf kısım', '/* Asker: ekran */'),
  pick(src, '/* Antrenman: saf kısım */', '/* Antrenman: sahne */'),
  'return { TRAIN_ALIEN_AT, trainMove, trainOn, trainSay, trainAlien, TRAIN_BAG, TRAIN_GLOVE, TRAIN_POW, TRAIN_SWOOSH, TRAIN_BOOT, TRAIN_MARK };',
].join('\n')).call({ lang: () => lang });
check('antrenman hareketi: yanlışta düşüş; doğruda sırayla yumruklar, kroşeler, tekme, yumruk tekme, döner tekme; 6 ve üstünde kombolar sırayla',
  R.trainMove(false, 0) === 'fall' && R.trainMove(false, 7) === 'fall'
  && [1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => R.trainMove(true, n)).join() === 'jabs,hooks,kick,mix,spin,super,mix,spin,super,super'
  && R.trainMove(true, 0) === 'jabs' && R.trainMove(true, undefined) === 'jabs' && R.trainMove(true, 40) !== undefined);
check('antrenman asker olana kadar: asker kahraman açıkken var, 100\'e ulaşınca ya da kol seçince yok; 70\'ten sonra uzaylı partner',
  R.trainOn({ grade: 4 }, { points: 50 }) && R.trainOn({ grade: 4 }, null) && R.trainOn({ grade: 4 }, { points: 99 })
  && !R.trainOn({ grade: 4 }, { points: 100 }) && !R.trainOn({ grade: 4 }, { points: 20, corps: 'kara' }) && !R.trainOn({ grade: 8 }, { points: 10 })
  && !R.trainOn({ grade: 4, hero_army: false }, { points: 10 }) && R.TRAIN_ALIEN_AT === 70);
const says = [0, 1, 2, 3, 4, -1, NaN, 2.5].map((n) => R.trainSay('fall', 0, n));
check('antrenman sözü: düşünce "Hadi bir daha deneyelim!" ve sırayla öteki cesaret sözleri; her hareketin sözü, 6 ve üstünde kombo sayısı',
  says[0] === 'Hadi bir daha deneyelim!' && says[1] === 'Düştüm ama kalktım!' && says[4] === says[0] && says.every((s) => typeof s === 'string' && s.length > 5)
  && R.trainSay('super', 6) === 'Kombo ×6!' && R.trainSay('mix', 7) === 'Kombo ×7!' && R.trainSay('spin', 5) === 'Döner tekme!' && R.trainSay('kick', 3) === 'Tekme!'
  && R.trainSay('jabs', 1) === '' && R.trainSay('hooks', 2) === 'Sağ, sol!' && R.trainSay('mix', 4) === 'Yumruk, tekme!' && R.trainSay('başka', 1) === '');
lang = 'en';
check('antrenman sözü İngilizce öğrencide İngilizce (Türkçe harfsiz sözler de)',
  R.trainSay('fall', 0, 0) === 'Let\'s try again!' && R.trainSay('fall', 0, 2) === 'I\'ll get it next time!' && R.trainSay('super', 6) === 'Combo ×6!'
  && R.trainSay('spin', 5) === 'Spinning kick!' && R.trainSay('jabs', 1) === '' && R.trainSay('hooks', 2) === 'Left, right!' && R.trainSay('mix', 4) === 'Punch and kick!');
lang = 'tr';
const trainPics = [...['guard', 'hit', 'cheer', 'push', 'başka'].map((m) => R.trainAlien(m)), R.trainAlien(), R.TRAIN_BAG, R.TRAIN_GLOVE, R.TRAIN_POW, R.TRAIN_SWOOSH, R.TRAIN_BOOT, R.TRAIN_MARK];
check('antrenman çizimleri (uzaylı partnerin dört hâli, kum torbası, eldiven, ayakkabı, torbadaki iz, vuruş yıldızı, tekme izi) bozuk sayı taşımıyor',
  trainPics.every((s) => s.startsWith('<svg') && s.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(s)) && R.trainAlien('xyz') === R.trainAlien('guard'));
check('antrenman bağlı: oturumda cevabın altında; seri ve düşüş sayılır, asker olunca ya da hareket azaltılmışsa yok, hiçbir şey yazmaz',
  /trainSlot\(ss, correct\),/.test(app) && /ss\.streak = correct \? \(ss\.streak \|\| 0\) \+ 1 : 0;/.test(app) && /if \(!correct && !help\) ss\.falls/.test(app)
  && /if \(!st \|\| !trainOn\(p, st\) \|\| !slot\.isConnected\) return;/.test(src) && /if \(!p \|\| !armyOn\(p\) \|\| reduceMotion\(\)\) return slot;/.test(src)
  && !/sb\.from\(/.test(pick(src, 'function trainSlot(', '/* Asker: veli */')));

// Bale (2026-11-18): kız kahramanda kum torbasının yerine balerin; 70'ten sonra uzaylıyla dans ve oturum sonunda dans oyunu
const tsql = readFileSync(join(root, 'supabase', 'train-style.sql'), 'utf8');
const D = new Function([
  "const trEn = (tr, en) => (this.lang() === 'en' ? en : tr);",
  pick(app, 'const HERO_LOOK = {', '// Yolculuğun yerleri'),
  pick(src, '/* Antrenman: saf kısım */', '/* Antrenman: çizimler'),
  pick(src, '/* Bale: saf kısım */', '/* Bale: sahne */'),
  'return { trainStyle, balletMove, balletSay, BALLET_POSES, ballerinaSvg, danceAlien, BALLET_SPARK, BALLET_BARRE, DANCE_MOVES, DANCE_KEYS, danceSetup, danceSeq, danceJudge, danceSay };',
].join('\n')).call({ lang: () => lang });
check('antrenman türü: kahramanı kız olanda balerin, ötekilerde kum torbası; velinin seçimi geçerli',
  D.trainStyle({ avatar: 'kiz' }) === 'balerin' && D.trainStyle({ avatar: 'erkek' }) === 'torba' && D.trainStyle({}) === 'torba' && D.trainStyle(null) === 'torba'
  && D.trainStyle({ avatar: 'kiz', train_style: 'torba' }) === 'torba' && D.trainStyle({ avatar: 'erkek', train_style: 'balerin' }) === 'balerin'
  && D.trainStyle({ avatar: 'kiz', train_style: 'robot' }) === 'balerin');
check('bale hareketi: doğruda piruet, 3 doğru üst üste büyük sıçrama, 5 ve üstü koreografi, yanlışta sendeleyip oturma',
  D.balletMove(false, 4) === 'fall' && D.balletMove(true, 1) === 'spin' && D.balletMove(true, 2) === 'spin' && D.balletMove(true, 3) === 'leap'
  && D.balletMove(true, 4) === 'leap' && D.balletMove(true, 5) === 'combo' && D.balletMove(true, 9) === 'combo');
lang = 'tr';
const trSay = [D.balletSay('fall', 0, 0), D.balletSay('combo', 5), D.balletSay('leap', 3), D.balletSay('spin', 1)];
lang = 'en';
const enSay = [D.balletSay('fall', 0, 0), D.balletSay('combo', 6), D.balletSay('leap', 3)];
lang = 'tr';
check('bale sözleri: düşünce "Hadi bir daha deneyelim!", koreografide "Muhteşem ×5!", sıçramada "Büyük sıçrama!"; İngilizcede İngilizce',
  trSay.join('|') === 'Hadi bir daha deneyelim!|Muhteşem ×5!|Büyük sıçrama!|' && enSay.join('|') === 'Let\'s try again!|Bravo ×6!|Grand jeté!');
const looks = [undefined, {}, { ten: 5, sac: 7, goz: 4, gozluk: 'koseli', cil: true }, { ten: 99, sac: -1, goz: 'x', gozluk: 'yuvarlak' }];
const ballet = [...looks.flatMap((lk) => [...Object.keys(D.BALLET_POSES), 'yok'].map((k) => D.ballerinaSvg(lk, k))),
  ...['idle', 'left', 'right', 'up', 'bow', 'clap', 'giggle', 'help', 'yok'].map((m) => D.danceAlien(m)), D.danceAlien(), D.BALLET_SPARK, D.BALLET_BARRE];
check('bale çizimleri (balerinin sekiz duruşu, her görünüşte; uzaylı dans partneri, pırıltı, bar) bozuk sayı taşımıyor; balerin hep pembe yanaklı',
  ballet.every((s) => s.startsWith('<svg') && s.endsWith('</svg>') && !/NaN|undefined|Infinity/.test(s)) && Object.keys(D.BALLET_POSES).length === 8
  && looks.every((lk) => Object.keys(D.BALLET_POSES).every((k) => D.ballerinaSvg(lk, k).includes('#F79E9E'))) && D.ballerinaSvg({}, 'yok') === D.ballerinaSvg({}, 'stand')
  && D.ballerinaSvg(looks[2], 'stand').includes('#7B4B2E') && D.ballerinaSvg(looks[2], 'stand').includes('stroke="#2D2A32"'));
const s0 = D.danceSetup(0, 5), s1 = D.danceSetup(1, 5), s4 = D.danceSetup(4, 5), s15 = D.danceSetup(15, 7), s99 = D.danceSetup(99, 3);
check('dans oyunu: her 3 doğru bir tur (en çok 5); ilk tur 3 hareket (3. sınıfa kadar 2), her turda bir fazla, en çok 6; turda 3 hak',
  s0.rounds === 0 && s1.rounds === 1 && s1.lens.join() === '3' && s4.lens.join() === '3,4' && s15.lens.join() === '3,4,5,6,6'
  && s99.rounds === 5 && s99.lens.join() === '2,3,4,5,6' && D.danceSetup(NaN, 4).rounds === 0 && s15.tries === 3);
const seqs = [() => 0, () => 0.999, () => 0.5, () => NaN, () => 7, Math.random].map((r) => D.danceSeq(6, r));
const noTriple = (q) => q.every((m, i) => i < 2 || !(m === q[i - 1] && m === q[i - 2]));
check('uzaylının dansı: istenen uzunlukta, yalnızca dört hareket, aynı hareket üst üste en çok iki; dört yön tuşu',
  seqs.every((q) => q.length === 6 && q.every((m) => D.DANCE_MOVES.includes(m)) && noTriple(q)) && D.danceSeq(50).length === 12 && D.danceSeq(-3).length === 0
  && Object.values(D.DANCE_KEYS).sort().join() === 'down,left,right,up');
check('dans oyunu: tuşlar sırayla doğruysa devam, hepsi doğruysa bitti, biri yanlışsa yanlış; son söz',
  D.danceJudge(['left', 'up'], ['left']) === 'next' && D.danceJudge(['left', 'up'], ['left', 'up']) === 'done' && D.danceJudge(['left', 'up'], ['up']) === 'wrong'
  && D.danceJudge(['left', 'up', 'down'], ['left', 'down']) === 'wrong' && /Hepsini yaptın/.test(D.danceSay(3, 3)) && /3 turun 2 tanesini/.test(D.danceSay(2, 3))
  && /atladın/.test(D.danceSay(0, 3, true)));
check('bale bağlı: cevap sahnesi türe göre balerin ya da kum torbası; dans kartı oturum ve deneme sonunda, balerinde 70\'ten sonra; veli seçer, öğrenci değiştiremez',
  /ballet \? balletScene\(balletMove\(correct, streak\)/.test(src) && /danceCard\(stats\.correct\)/.test(app) && /saved \? danceCard\(rows\.length - missed\.length\)/.test(app)
  && /trainStyle\(p\) !== 'balerin'/.test(src) && /st\.points < TRAIN_ALIEN_AT/.test(src) && /upd\.train_style = style\.value/.test(src)
  && /train_style in \('torba', 'balerin'\)/.test(tsql) && /Bu ayarı veli değiştirir/.test(tsql) && !/sb\.from\(/.test(pick(src, '/* Bale: sahne */', '/* Asker: veli */')));

console.log(fails ? `${fails} kontrol başarısız` : '');
process.exit(fails ? 1 : 0);
