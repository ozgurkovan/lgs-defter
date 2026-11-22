/* Asker kahraman (velinin isteği, 2026-11-13: "üzerinde numaralar olabilir, takım numarası gibi, 100'e ulaştı mı asker
   olabilsin. Hangi ülkedense o ülkenin askerlerinden seçebilsin… rütbe almaya başlayacak"). Kahramanın göğsünde bir forma
   numarası var; çalıştıkça artar, hiç azalmaz (her 20 puan bir numara; çocuk sıradaki numaraya kalan puanı görür).
   100 olunca çocuk kendi ülkesinin kollarından birini kendisi seçer
   (Türkiye: Kara, Deniz, Hava; ABD: Army, Navy, Air Force, Marines, Space Force), üniforması değişir ve numara arttıkça
   rütbe alır. Numaranın hesabı velinin seçimi: hata tekrarında her 10 doğru +1, öteki sorularda her 20 doğru +1 (5 kelime
   kartı, 2026-11-15'e kadar 8, ve yıldızlı her klavye dersi birer doğru); hesap veritabanında (supabase/hero-army.sql,
   hero_army_state), kol
   seçimi de orada denetlenir (set_hero_corps). Veli çocuk başına açıp kapatır (Ayarlar → Günlük plan; besleme gibi 7.
   sınıfa kadar açık gelir), kolu sıfırlayabilir. Üniformalar bizim çizimimiz (app.js, HERO_UNIFORM): gerçek amblem yok.
   İkinci aşama: asker olan çocukta oturum ve deneme sonunda uzaylılarla kısa bir savaş oyunu (aşağıda, battleCard). */

/* Asker: saf kısım (tools/test-army.mjs bunu dener) */

const ARMY_SOLDIER = 100; // bu numarada asker olur
const ARMY_PER_NUMBER = 20; // bir numara bu kadar puan (hata tekrarı doğrusu 2, öteki doğru 1, 5 kelime kartı 1)
// Sıradaki numaraya kalan puan (st.raw: veritabanının puanı); puan bilinmiyorsa null.
const armyPointsLeft = (st) => (Number.isFinite(st?.raw) ? ARMY_PER_NUMBER - (Math.max(0, st.raw) % ARMY_PER_NUMBER) : null);
// Rütbelerin numaraları: Er 100'de; ilk terfiler sık, sonrakiler seyrek (günde 2 numarayla ilkleri 1–2 haftada bir,
// en yüksek rütbe okul yılını aşan uzun bir hedef).
const ARMY_STEPS = [100, 115, 135, 160, 190, 225, 265, 310, 360, 415, 475, 540, 620];
// Kollar. ride: kolun aracı (seçim kartında); about: kısa tanıtım.
const ARMY_CORPS = [
  { id: 'kara', name: 'Kara Kuvvetleri', who: 'Karacı', ride: '🪖', about: 'Karada, tankla ve zırhlı araçla.' },
  { id: 'deniz', name: 'Deniz Kuvvetleri', who: 'Denizci', ride: '🚢', about: 'Denizde, gemiyle ve denizaltıyla.' },
  { id: 'hava', name: 'Hava Kuvvetleri', who: 'Havacı', ride: '✈️', about: 'Gökyüzünde, jetle ve helikopterle.' },
];
const ARMY_CORPS_EN = [
  { id: 'army', name: 'Army', who: 'Soldier', ride: '🪖', about: 'On land, with tanks and trucks.' },
  { id: 'navy', name: 'Navy', who: 'Sailor', ride: '🚢', about: 'At sea, with ships and submarines.' },
  { id: 'airforce', name: 'Air Force', who: 'Airman', ride: '✈️', about: 'In the sky, with jets.' },
  { id: 'marines', name: 'Marines', who: 'Marine', ride: '🚁', about: 'On land and sea, first to arrive.' },
  { id: 'spaceforce', name: 'Space Force', who: 'Guardian', ride: '🛰️', about: 'In space, guarding satellites.' },
];
// Rütbeler (ARMY_STEPS sırasıyla): 0–4 er ve astsubay, 5–8 subay, 9–11 üst subay, 12 en yüksek.
const ARMY_RANKS_TR = ['Er', 'Onbaşı', 'Çavuş', 'Üstçavuş', 'Astsubay', 'Asteğmen', 'Teğmen', 'Üsteğmen', 'Yüzbaşı', 'Binbaşı', 'Yarbay', 'Albay', 'General'];
const ARMY_RANKS = { kara: ARMY_RANKS_TR, hava: ARMY_RANKS_TR, deniz: [...ARMY_RANKS_TR.slice(0, 12), 'Amiral'] };
const ARMY_RANKS_EN = {
  army: ['Private', 'Private First Class', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
    'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'General'],
  marines: ['Private', 'Private First Class', 'Lance Corporal', 'Corporal', 'Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
    'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'General'],
  navy: ['Seaman Recruit', 'Seaman Apprentice', 'Seaman', 'Petty Officer Third Class', 'Petty Officer Second Class', 'Ensign', 'Lieutenant Junior Grade',
    'Lieutenant', 'Lieutenant Commander', 'Commander', 'Captain', 'Rear Admiral', 'Admiral'],
  airforce: ['Airman Basic', 'Airman', 'Airman First Class', 'Senior Airman', 'Staff Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
    'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'General'],
  spaceforce: ['Specialist 1', 'Specialist 2', 'Specialist 3', 'Specialist 4', 'Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
    'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'General'],
};
// Madalyalar (velinin isteği, 2026-11-14: "asker olana kadar sürekli gaz alsınlar"): 100'e giden yolda kahramanlık
// madalyaları. at: numara; say: kutlamadaki övgü; ribbon: kurdele [zemin, orta şerit] (göğüste de görünür, heroSvg'nin
// army.ribbons'u); icon: madalyanın ortasındaki şekil; metal: ilk üçü bronz, sonraki dördü gümüş, son üçü altın.
const ARMY_MEDALS = [
  { at: 5, name: 'İlk Adım Rozeti', say: 'Kahramanlık yolculuğun başladı! İlk adımı attın.', ribbon: ['#2EC4B6', '#FFFFFF'], icon: 'star', metal: 'bronz' },
  { at: 10, name: 'Cesaret Madalyası', say: 'Zor sorulardan kaçmadın. İşte gerçek cesaret!', ribbon: ['#E63946', '#FFD166'], icon: 'shield', metal: 'bronz' },
  { at: 20, name: 'Azim Yıldızı', say: 'Her gün biraz daha! Azmin göz kamaştırıyor.', ribbon: ['#2F80ED', '#FFFFFF'], icon: 'star', metal: 'bronz' },
  { at: 30, name: 'Şimşek Rozeti', say: 'Şimşek gibisin! Sorular senden kaçamıyor.', ribbon: ['#FFC531', '#264653'], icon: 'bolt', metal: 'gumus' },
  { at: 40, name: 'Aslan Yürek Madalyası', say: 'Yüreğin aslan gibi! Hiç vazgeçmiyorsun.', ribbon: ['#F25C54', '#FFFFFF'], icon: 'heart', metal: 'gumus' },
  { at: 50, name: 'Yarı Yol Kupası', say: 'Yolun yarısı geride! Artık seni kimse durduramaz.', ribbon: ['#7B4DD8', '#FFD166'], icon: 'cup', metal: 'gumus' },
  { at: 60, name: 'Bilgelik Nişanı', say: 'Öğrendikçe büyüyorsun, bilge kahraman!', ribbon: ['#1D3557', '#A8DADC'], icon: 'book', metal: 'gumus' },
  { at: 70, name: 'Kartal Gözü Rozeti', say: 'Dikkatin kartal gibi keskin!', ribbon: ['#8D6E63', '#FFE082'], icon: 'eye', metal: 'altin' },
  { at: 80, name: 'Zirve Madalyası', say: 'Zirveye çok yaklaştın! Herkes seninle gurur duyuyor.', ribbon: ['#2E7D32', '#FFFFFF'], icon: 'mountain', metal: 'altin' },
  { at: 90, name: 'Kahramanlık Nişanı', say: 'Sen gerçek bir kahramansın! Askerliğe çok az kaldı.', ribbon: ['#E63946', '#2F80ED'], icon: 'crown', metal: 'altin' },
];
// Kaç madalya kazandı; sıradaki madalya (hepsini aldıysa null).
const armyMedals = (points) => ARMY_MEDALS.filter((m) => points >= m.at).length;
const armyNextMedal = (points) => ARMY_MEDALS.find((m) => points < m.at) || null;
// Madalyanın çizimi (40x52): kurdele, metal madalya, ortada şekli. state: 'earned' (kazandı) ya da kazanılmamış (gri;
// ortada numarası).
const ARMY_METALS = { bronz: ['#E3A36F', '#A8662F', '#F5CDA6'], gumus: ['#DCE1E8', '#8E98A8', '#F7F9FB'], altin: ['#F4C430', '#C99A1C', '#FFE58A'] };
const ARMY_ICONS = {
  star: '<path d="M10 1.5 L12.6 7.2 L18.8 7.6 L14 11.6 L15.5 17.7 L10 14.4 L4.5 17.7 L6 11.6 L1.2 7.6 L7.4 7.2 Z"/>',
  shield: '<path d="M10 2 L17 5 V10 C17 14.5 14 17 10 18.5 C6 17 3 14.5 3 10 V5 Z"/>',
  bolt: '<path d="M11.5 1.5 L4 11 H9 L7.5 18.5 L16 8.5 H11 Z"/>',
  heart: '<path d="M10 17.5 C4 13 1.5 10 1.5 6.8 C1.5 4.2 3.5 2.5 5.8 2.5 C7.6 2.5 9 3.6 10 5 C11 3.6 12.4 2.5 14.2 2.5 C16.5 2.5 18.5 4.2 18.5 6.8 C18.5 10 16 13 10 17.5 Z"/>',
  cup: '<path d="M5 2.5 H15 V7 C15 10.5 12.8 12.5 10 12.5 C7.2 12.5 5 10.5 5 7 Z M8.6 12.3 H11.4 V15 H14 V17.5 H6 V15 H8.6 Z"/><path d="M5 4.2 H2.6 C2.6 7.6 3.8 8.8 5.6 9 M15 4.2 H17.4 C17.4 7.6 16.2 8.8 14.4 9" fill="none" stroke-width="1.5"/>',
  book: '<path d="M2 4 C5 3 8 3.5 10 5 C12 3.5 15 3 18 4 V16 C15 15 12 15.5 10 17 C8 15.5 5 15 2 16 Z"/>',
  eye: '<path d="M1.5 10 C4.5 4.5 15.5 4.5 18.5 10 C15.5 15.5 4.5 15.5 1.5 10 Z"/><circle cx="10" cy="10" r="3.2" fill="#fff"/><circle cx="10" cy="10" r="1.6"/>',
  mountain: '<path d="M1 17 L7.5 5.5 L11 11 L13.5 7.5 L19 17 Z"/><path d="M7.5 5.5 L9.6 9 L7.6 8.2 L5.6 9 Z" fill="#fff"/>',
  crown: '<path d="M2 15.5 L3.5 5 L7.5 9.5 L10 3.5 L12.5 9.5 L16.5 5 L18 15.5 Z"/>',
};
function armyMedalSvg(m, state = 'earned') {
  const on = state === 'earned', [face, edge, shine] = on ? ARMY_METALS[m.metal] || ARMY_METALS.altin : ['#D5D9DF', '#A5ACB7', '#EEF0F3'];
  const [rib, stripe] = on ? m.ribbon : ['#C9CED6', '#E8EBEF'];
  return '<svg viewBox="0 0 40 52" aria-hidden="true">'
    + `<path d="M11 0 H29 L25 21 H15 Z" fill="${rib}"/><path d="M18 0 H22 L21.2 21 H18.8 Z" fill="${stripe}"/>`
    + `<circle cx="20" cy="35" r="15" fill="${face}" stroke="${edge}" stroke-width="2"/><circle cx="20" cy="35" r="11" fill="none" stroke="${shine}" stroke-width="1.4"/>`
    + (on ? `<g transform="translate(11 26) scale(0.9)" fill="${edge}" stroke="${edge}">${ARMY_ICONS[m.icon] || ARMY_ICONS.star}</g>`
      : `<text x="20" y="39.5" text-anchor="middle" font-size="12" font-weight="800" font-family="Arial, sans-serif" fill="#8A93A3">${m.at}</text>`)
    + '</svg>';
}
// Açık mı: veli seçtiyse o; seçmediyse 7. sınıfa kadar açık (besleme gibi).
const armyOn = (p) => p?.hero_army ?? ((p?.grade || 8) <= 7);
// Çocuğun ekranında açık mı: velinin ayarı ve plan (bedava planda kapalı; plan.js). Velinin ayar satırı armyOn'a bakar.
const armyOpen = (p) => armyOn(p) && (typeof planHas !== 'function' || planHas('army', p));
const armyUs = (p) => /^us/.test(p?.curriculum || '');
const armyCorpsList = (p) => (armyUs(p) ? ARMY_CORPS_EN : ARMY_CORPS);
const armyCorps = (id) => [...ARMY_CORPS, ...ARMY_CORPS_EN].find((c) => c.id === id) || null;
// Rütbe sırası: 100'den önce -1, sonra 0–12.
const armyRank = (points) => ARMY_STEPS.filter((n) => points >= n).length - 1;
const armyRankName = (corps, r) => (ARMY_RANKS[corps] || ARMY_RANKS_EN[corps] || [])[r] || '';
// Sıradaki hedef: asker değilken 100, askerken bir sonraki rütbe (en yüksekteyse null).
function armyNext(points, corps) {
  const at = !corps ? (points < ARMY_SOLDIER ? ARMY_SOLDIER : null) : ARMY_STEPS[armyRank(points) + 1] ?? null;
  return at == null ? null : { at, need: at - points, rank: corps ? armyRank(points) + 1 : 0 };
}
// Kahramanın çizimi için (heroSvg'nin army'si): numara, kol (geçerliyse), rütbe, ülke.
function armyView(p, st) {
  if (!st) return undefined;
  const corps = armyCorps(st.corps) ? st.corps : null;
  return { num: st.points, corps, rank: corps ? Math.max(0, armyRank(st.points)) : -1, country: armyUs(p) ? 'us' : 'tr',
    ribbons: ARMY_MEDALS.slice(0, armyMedals(st.points)).map((m) => m.ribbon) };
}
// Kahramanın sözü: numara, kol seçme zamanı ya da rütbe ve sıradaki rütbe.
function armySay(st) {
  const c = armyCorps(st.corps);
  if (!c) {
    if (st.points >= ARMY_SOLDIER) return '100\'e ulaştık! 🎖️ Hangi kolda olacağımızı sen seç.';
    // Her durum tek kalıp: İngilizce katman bütün cümleyi bir kerede eşleştirir.
    const n = st.points, left = ARMY_SOLDIER - n, last = ARMY_MEDALS[armyMedals(n) - 1], next = armyNextMedal(n);
    if (!last) return `Forma numaram ${n}! İlk madalyaya ${next.at - n}, askerliğe ${left} kaldı.`;
    return next ? `Forma numaram ${n}! 🏅 ${last.name} benim! Sıradaki madalyaya ${next.at - n}, askerliğe ${left} kaldı.`
      : `Forma numaram ${n}! 🏅 ${last.name} benim! 100 olunca asker olacağım: ${left} kaldı.`;
  }
  const r = armyRank(st.points), next = armyNext(st.points, st.corps);
  return `${c.name} · ${armyRankName(st.corps, r)}. ` + (next ? `${armyRankName(st.corps, next.rank)} olmama ${next.need} numara kaldı.` : 'En yüksek rütbedeyim! 🎖️');
}
// Kutlanacak haber: seen, çocuğun bu cihazda son gördüğü durum ({ r: rütbe, ready: kol seçmeye hazır, m: madalya sayısı }).
// İlk açılışta (seen yok) hiçbir şey kutlanmaz, şimdiki durum kaydedilir. 100'e ulaşınca 'ready'; askerken rütbe artınca
// 'promoted'; asker değilken yeni madalya kazanınca 'medal' (madalyalardan önceki kayıtta m yok: kazandığı son madalya bir
// kez kutlanır).
function armyNews(st, seen) {
  const corps = armyCorps(st.corps) ? st.corps : null;
  const now = { r: corps ? armyRank(st.points) : -1, ready: !corps && st.points >= ARMY_SOLDIER, m: armyMedals(st.points) };
  if (!seen || typeof seen !== 'object') return { news: null, seen: now };
  if (now.ready && !seen.ready) return { news: 'ready', seen: now };
  if (corps && seen.r >= 0 && now.r > seen.r) return { news: 'promoted', seen: now };
  if (!corps && st.points < ARMY_SOLDIER && now.m > (Number.isInteger(seen.m) ? seen.m : 0)) return { news: 'medal', seen: now };
  return { news: null, seen: now };
}

/* Asker: ekran */

// Son okunan numaralar (öğrenci kimliğine göre): kahramanın çizimi (heroScene) bunu okur.
const armyCache = new Map();
// Çocuğun numarası ve kolu ({ points, before, corps }); asker kahraman kapalıysa ya da okunamazsa null.
async function loadArmy(p = state.student) {
  if (!p || !armyOpen(p)) return null;
  const st = await q(sb.rpc('hero_army_state', { sid: p.id }));
  if (!st) return null;
  armyCache.set(p.id, st);
  return st;
}
const armyFor = (p) => (p && armyOn(p) && armyCache.has(p.id) ? armyView(p, armyCache.get(p.id)) : undefined);

// Kahramanın kartındaki satır (ana sayfa, oturum sonu): numara ya da rütbe, bugün kaç arttığı; kol seçme zamanıysa düğme.
function armyLine(st) {
  const c = armyCorps(st.corps), today = Math.max(0, st.points - (st.before || 0));
  if (!c && st.points >= ARMY_SOLDIER) {
    return h('div', { class: 'army-line spread' }, h('b', {}, '🎖️ 100\'e ulaştın! Kolunu seç.'),
      h('button', { class: 'primary small', onclick: () => go('hero') }, 'Kolunu seç'));
  }
  // Satır iki dilde kurulur (trEn): parçalı yazıyı İngilizce katman parça parça eşleştirince karıştırıyordu ("numara 47"
  // Türkçe harf taşımadığı için hiç çevrilmiyordu). Bugün artmadıysa o parça yok.
  const next = armyNext(st.points, st.corps), medals = armyMedals(st.points), n = st.points, left = armyPointsLeft(st);
  const rank = c ? armyRankName(st.corps, armyRank(n)) : '', nextRank = next && c ? armyRankName(st.corps, next.rank) : '';
  const tr = c ? [`🎖️ ${rank}`, `numara ${n}`, today ? `bugün +${today}` : '', next ? `${nextRank} için ${next.need}` : '']
    : [`🎽 Forma numaran ${n}`, today ? `bugün +${today}` : '', medals ? `🏅 ${medals} madalya` : '',
      left != null ? `sıradaki numaraya ${left} puan` : '100\'e ulaşınca asker olursun'];
  const en = c ? [`🎖️ ${rank}`, `number ${n}`, today ? `today +${today}` : '', next ? `${next.need} to ${nextRank}` : '']
    : [`🎽 Jersey number ${n}`, today ? `today +${today}` : '', medals ? `🏅 ${medals} medal${medals === 1 ? '' : 's'}` : '',
      left != null ? `${left} point${left === 1 ? '' : 's'} to the next number` : 'at 100 you become a soldier'];
  return h('p', { class: 'army-line small' }, trEn(tr.filter(Boolean).join(' · '), en.filter(Boolean).join(' · ')));
}

// Kutlama (araç kutlamasıyla aynı görünüş): 100'e ulaştı ('ready'), asker oldu ('soldier'), terfi etti ('promoted'),
// madalya kazandı ('medal': kazandığı son madalya, övgüsü ve sıradaki madalya).
function armyParty(kind, st, p, level) {
  const c = armyCorps(st.corps), r = armyRank(st.points);
  const overlay = h('div', { class: 'party', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Asker kahraman' });
  const drop = () => overlay.remove();
  const close = () => { overlay.remove(); window.removeEventListener('popstate', drop); };
  window.addEventListener('popstate', drop, { once: true });
  const pic = h('div', { class: 'army-party-hero', 'aria-hidden': 'true' });
  pic.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, armyView(p, st));
  const medal = kind === 'medal' ? ARMY_MEDALS[armyMedals(st.points) - 1] || null : null, nextMedal = armyNextMedal(st.points);
  const badge = kind === 'promoted' ? armyBadge(r, 56) : medal ? armyMedalEl(medal, 64) : null;
  const title = medal ? `🏅 ${medal.name}!` : kind === 'ready' ? '🎖️ 100\'e ulaştın!' : kind === 'soldier' ? `🎖️ Artık askersin!` : `🎖️ Terfi! ${armyRankName(st.corps, r)} oldun!`;
  const text = medal ? medal.say + (nextMedal ? ` Sıradaki madalya: ${nextMedal.name} (${nextMedal.at}).` : ' Sıradaki durak: askerlik (100)!')
    : kind === 'ready' ? 'Askerlik töreni seni bekliyor: hangi kolda olacağını sen seçeceksin.'
    : kind === 'soldier' ? `${c?.name} · ${armyRankName(st.corps, r)}. Çalıştıkça rütbe alacaksın.`
      : (() => { const next = armyNext(st.points, st.corps); return next ? `Sıradaki rütbe: ${armyRankName(st.corps, next.rank)} (${next.need} numara).` : 'En yüksek rütbeye ulaştın! 🎖️'; })();
  fill(overlay,
    h('div', { class: 'party-confetti', 'aria-hidden': 'true' }, Array.from({ length: 30 }, (_, i) =>
      h('span', { style: `left: ${(i * 37) % 100}%; animation-delay: ${(i % 8) * 0.15}s; font-size: ${18 + (i % 4) * 6}px` }, (medal ? ['🏅', '✨', '⭐', '🎉', '🌟'] : ['🎖️', '✨', '⭐', '🎊', '🎉'])[i % 5]))),
    h('div', { class: 'party-card stack' }, pic, badge, h('h2', {}, title), h('p', {}, text),
      h('button', { class: 'primary block', onclick: () => { close(); if (kind === 'ready') go('hero'); } }, kind === 'ready' ? 'Kolunu seç' : 'Harika!')));
  document.body.append(overlay);
  overlay.querySelector('button').focus();
}

// Bu cihazda görülmemiş bir haber varsa kutlar (100'e ulaşma, terfi). İlk açılışta sessizce kaydeder.
function armyCheck(st, p, level) {
  if (!st || !p) return;
  const key = `defter.army.${p.id}`;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { seen = null; }
  const { news, seen: now } = armyNews(st, seen);
  try { localStorage.setItem(key, JSON.stringify(now)); } catch (e) { /* gizli pencere: kutlama her seferinde olmaz, sorun değil */ }
  if (news && !document.querySelector('.party')) armyParty(news, st, p, level);
}

// Madalya (çizimi armyMedalSvg): state 'earned', 'next' ya da 'locked'.
function armyMedalEl(m, size = 40, state = 'earned') {
  const el = h('span', { class: 'army-medal', style: `width: ${size}px; height: ${Math.round(size * 1.3)}px`, 'aria-hidden': 'true' });
  el.innerHTML = armyMedalSvg(m, state);
  return el;
}

// Madalya rafı (kahramanın sayfasındaki asker kartı): kazanılanlar renkli, sıradaki işaretli, kalanlar gri ve numaralı.
function armyMedalBox(st) {
  const got = armyMedals(st.points), next = armyNextMedal(st.points);
  return h('div', { class: 'stack', style: 'gap: 6px' },
    h('div', { class: 'spread' }, h('b', {}, `🏅 Madalyaların: ${got}/${ARMY_MEDALS.length}`),
      next ? h('span', { class: 'small muted' }, `Sıradaki: ${next.name} · ${next.at - st.points} numara kaldı`) : null),
    h('div', { class: 'army-medals' }, ARMY_MEDALS.map((md, i) => {
      const state = i < got ? 'earned' : md === next ? 'next' : 'locked';
      return h('div', { class: `army-medal-tile ${state}`, title: md.say, role: 'img', 'aria-label': `${md.name}, ${md.at}${i < got ? ', kazandın' : ''}` },
        armyMedalEl(md, 34, state), h('span', { class: 'small' }, md.name), h('span', { class: 'small muted num' }, String(md.at)));
    })));
}

// Rütbe rozeti: rütbe işareti koyu bir kalkanın üstünde (er rütbesinde yıldızsız kalkan).
function armyBadge(r, size = 40) {
  const el = h('span', { class: 'army-badge', style: `width: ${size}px; height: ${size}px`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 40 40"><path d="M20 3 L35 9 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V9 Z" fill="#26324F" stroke="#F4C430" stroke-width="1.6"/>`
    + (r >= 1 ? heroInsignia(r, 20, 20, 2.1) : '<circle cx="20" cy="20" r="3.4" fill="#F4C430"/>') + '</svg>';
  return el;
}

// Kahramanın sayfasındaki asker kartı: numara ve 100'e kalan; 100 olunca kol seçimi (askerlik töreni); askerken rütbe,
// sıradaki rütbe ve bütün rütbeler. onChange: kol seçilince sayfayı yeniden çizer.
function armyCard(st, p, level, onChange) {
  const box = h('section', { class: 'card stack army-card', style: 'gap: 10px' });
  const c = armyCorps(st.corps), today = Math.max(0, st.points - (st.before || 0));
  const how = h('p', { class: 'small muted' }, 'Numara nasıl artar? Hata tekrarında her doğru cevap 2 puan, öteki sorularda her doğru cevap 1 puan, '
    + 'her 5 kelime kartı ve yıldızlı her klavye dersi 1 puan. 20 puan bir numara. Numara hiç azalmaz.' + (today ? ` Bugün +${today}.` : ''));
  // Sıradaki numaraya kalan puan (velinin isteği, 2026-11-15): her doğruda ilerlediğini görsün.
  const left = armyPointsLeft(st);
  const nextNum = left == null ? null : h('div', { class: 'stack', style: 'gap: 4px' },
    h('div', { class: 'spread' }, h('span', { class: 'small' }, `Sıradaki numara: ${st.points + 1}`), h('span', { class: 'small muted num' }, `${left} puan kaldı`)),
    h('div', { class: 'feed-bar army-bar army-next' }, h('i', { style: `width: ${Math.max(3, Math.round(((ARMY_PER_NUMBER - left) / ARMY_PER_NUMBER) * 100))}%` })));
  const bar = (share) => h('div', { class: 'feed-bar army-bar' }, h('i', { style: `width: ${Math.max(3, Math.round(share * 100))}%` }));
  if (!c && st.points < ARMY_SOLDIER) {
    fill(box, h('p', { class: 'label' }, 'Asker kahraman'),
      h('div', { class: 'spread' }, h('b', {}, `🎽 Forma numaran: ${st.points}`), h('span', { class: 'small muted num' }, `${st.points}/${ARMY_SOLDIER}`)),
      bar(st.points / ARMY_SOLDIER),
      h('p', {}, `100 olunca asker olursun ve kolunu sen seçersin. ${ARMY_SOLDIER - st.points} numara kaldı.`), nextNum, armyMedalBox(st), how);
    return box;
  }
  if (!c) {
    // Askerlik töreni: kollar, her birinde kahraman o kolun üniformasıyla.
    let busy = false;
    const choose = async (corps) => {
      if (busy) return;
      const ok = await askDialog({ title: `${corps.name}`, text: `${corps.who} olmak istiyor musun? Kolunu bir kez seçersin; değiştirmek istersen velin sıfırlayabilir.`,
        actions: [{ label: 'Evet, seçiyorum', value: true, cls: 'primary block' }, { label: 'Vazgeç', value: false }], cancel: false });
      if (!ok) return;
      busy = true;
      try { await q(sb.rpc('set_hero_corps', { corps: corps.id })); } catch (e) { busy = false; return toast('Seçilemedi; internetini kontrol et.'); }
      st.corps = corps.id;
      p.hero_corps = corps.id;
      if (state.student?.id === p.id) state.student.hero_corps = corps.id;
      armyCache.set(p.id, st);
      try { localStorage.setItem(`defter.army.${p.id}`, JSON.stringify(armyNews(st, null).seen)); } catch (e) { /* önemli değil */ }
      armyParty('soldier', st, p, level);
      onChange?.();
    };
    fill(box, h('p', { class: 'label' }, 'Askerlik töreni'),
      h('h2', {}, '🎖️ 100\'e ulaştın!'),
      h('p', {}, 'Hangi kolda olmak istersin? Seçtiğin kolun üniformasını giyeceksin ve çalıştıkça rütbe alacaksın.'),
      h('div', { class: 'army-corps' }, armyCorpsList(p).map((corps) => {
        const pic = h('span', { class: 'army-corps-hero', 'aria-hidden': 'true' });
        pic.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, { num: st.points, corps: corps.id, rank: 0, country: armyUs(p) ? 'us' : 'tr' });
        return h('button', { class: 'army-corps-tile', onclick: () => choose(corps), 'aria-label': `${corps.name}: ${corps.about}` },
          pic, h('b', {}, `${corps.ride} ${corps.name}`), h('span', { class: 'small muted' }, corps.about));
      })), how);
    return box;
  }
  const r = armyRank(st.points), next = armyNext(st.points, st.corps), ranks = ARMY_RANKS[st.corps] || ARMY_RANKS_EN[st.corps] || [];
  const from = ARMY_STEPS[r];
  fill(box, h('p', { class: 'label' }, `${c.ride} ${c.name}`),
    h('div', { class: 'row', style: 'gap: 12px; align-items: center' }, armyBadge(r, 48),
      h('div', { class: 'stack', style: 'gap: 2px' }, h('b', { class: 'army-rank' }, armyRankName(st.corps, r)), h('span', { class: 'small muted num' }, `Numara ${st.points}`))),
    next ? [bar((st.points - from) / (next.at - from)), h('p', {}, `${armyRankName(st.corps, next.rank)} rütbesine ${next.need} numara kaldı.`)]
      : h('p', {}, 'En yüksek rütbedesin! 🎖️ Numaran artmaya devam eder.'),
    nextNum,
    h('div', { class: 'army-ranks' }, ranks.map((name, i) => h('span', { class: 'chip army-step' + (i < r ? ' done' : i === r ? ' now' : ''), title: `${ARMY_STEPS[i]}` },
      armyBadge(i, 18), `${name} · ${ARMY_STEPS[i]}`))),
    armyMedalBox(st), how);
  return box;
}

// Besleme kapalı, asker kahraman açıkken kahramanın sayfası: kahraman ve asker kartı (yemek rafı yok).
async function viewArmyHero(st) {
  const hero = await typingHero();
  const paint = () => render(
    h('header', { class: 'stack', style: 'gap: 4px' }, h('h1', {}, 'Kahramanın'),
      h('p', { class: 'muted' }, 'Çalıştıkça forma numaran artar; 100 olunca asker olursun.')),
    h('section', { class: 'card stack', style: 'gap: 12px' }, heroScene(state.student, hero.level, hero.owned), h('p', { class: 'feed-say bubble' }, armySay(st))),
    armyCard(st, state.student, hero.level, paint),
    h('button', { class: 'block', onclick: () => go('home') }, 'Ana sayfa'));
  paint();
  armyCheck(st, state.student, hero.level);
}

/* Uzaylı savaşı (ikinci aşama, velinin isteği 2026-11-13/14): asker olan çocukta oturum ve deneme sonunda kısa bir oyun.
   Düşman sevimli-komik uzaylılar: insan ya da ülke değil (aileler şiddet görmesin). Doğru cevaplar mermi, zor sorular el
   bombası olur; her yanlış bir uzaylı daha getirir. Uzaylılar sandık, kaya, buzdağı, bulut ya da asteroit arkasına saklanır,
   başını çıkarıp jöle atar. Başını çıkarmışken dokunulursa vurulur ve kaçış kapsülüyle kaçar ("kovaladık, kaçtılar"); el
   bombası saklandığı yeri patlatır, arkasındakilerin hepsi kaçar. Mermi biterse kahraman geri çekilir, kalan uzaylılar radara
   kaçar; uzun süre dokunulmazsa uzaylılar sıkılıp kaçar. Denemede ana gemi: küçük uzaylılar bitince kalkanı iner; yüzde 80 ve
   üstü doğruda süper bomba. Kahraman ölmez, yaralanmaz, kan yok: jöle yiyince bir an sersemler. */

/* Uzaylı savaşı: saf kısım */

const BATTLE_WIN = 0.8; // denemede süper bombayı getiren doğru oranı
// Kolun savaş yeri ve aracı: kara (tank), deniz (gemi), hava (jet), uzay (uzay gemisi).
const BATTLE_FIELD = { kara: 'land', army: 'land', marines: 'land', deniz: 'sea', navy: 'sea', hava: 'air', airforce: 'air', spaceforce: 'space' };
// Uzaylıların renkleri: [gövde, kenar, üst bant].
const BATTLE_COLORS = [['#9B8CFF', '#6E5BD9', '#C9C0FF'], ['#4FD1C5', '#2C9C92', '#A6EDE6'], ['#FF8FB1', '#D9577F', '#FFC8D8'], ['#FFB454', '#D9862B', '#FFDCA8']];
// Zor soru (doğruysa el bombası): hata tekrarındaki soru (önce yanlış yapmıştı) ya da uzun soru (hedef süresi 2 dakika ve
// üstü; 4. sınıfa kadar 1,5 dakika ve üstü, küçüklerin soruları daha kısa).
function battleHard(track, targetSeconds, grade = 8) {
  return track === 'mistake' || (Number(targetSeconds) || 0) >= ((Number(grade) || 8) <= 4 ? 90 : 120);
}
// Savaşın cephanesi ve düşmanı: correct doğru, wrong yanlış (boş dahil), hard doğruların kaçı zor; kind 'session' (oturum)
// ya da 'exam' (deneme, ana gemiyle). Her doğru bir mermi, zor doğru el bombası (oturumda en çok 3, denemede 5); 3 uzaylı ve
// her yanlış için bir uzaylı daha. Küçüklerde uzaylı daha uzun bakar ve aynı anda tek uzaylı çıkar.
function battleSetup(correct, wrong, hard = 0, kind = 'session', grade = 8) {
  correct = Math.max(0, correct | 0);
  wrong = Math.max(0, wrong | 0);
  hard = Math.min(correct, Math.max(0, hard | 0));
  const exam = kind === 'exam', g = Number(grade) || 8, grenades = Math.min(exam ? 5 : 3, hard);
  return {
    exam,
    bullets: Math.min(exam ? 40 : 30, correct - grenades),
    grenades,
    aliens: Math.min(exam ? 12 : 10, 3 + wrong),
    superBomb: exam && correct + wrong > 0 && correct / (correct + wrong) >= BATTLE_WIN,
    motherHp: exam ? 6 : 0,
    peekMs: g <= 4 ? 1800 : g <= 6 ? 1500 : 1250,
    maxUp: g <= 4 ? 1 : 2,
    timeMs: exam ? 100000 : 60000,
    fireChance: g <= 4 ? 0.45 : 0.55, // başını çıkaran uzaylının jöle atma olasılığı
  };
}
// Saklanma yerleri: n uzaylı 3 (en çok 4 uzaylıda) ya da 4 yere sırayla dağılır. x, y: yerin alt ortası (kutunun yüzdesi;
// denemede biraz aşağıda, üstte ana gemi durur); aliens: oradaki uzaylıların sıra numaraları (renk için).
function battlePosts(n, exam = false) {
  const spots = n <= 4 ? [[30, 58], [56, 50], [82, 57]] : [[25, 58], [46, 50], [67, 57], [88, 50]];
  const posts = spots.map(([x, y]) => ({ x, y: y + (exam ? 6 : 0), aliens: [] }));
  for (let i = 0; i < n; i++) posts[i % posts.length].aliens.push(i);
  return posts;
}
// Savaşın sonundaki söz. res: { reason: 'win' | 'ammo' | 'time' | 'skip' | 'empty', chased, aliens, left (kalan mermi),
// leftGrenades (kalan el bombası), mother: 'down' | 'fled' | null }.
function battleSay(res) {
  if (!res) return '';
  const { chased = 0, aliens = 0, left = 0, leftGrenades: lg = 0 } = res, rest = Math.max(0, aliens - chased);
  if (res.reason === 'skip') return `Savaşı atladın. ${rest} uzaylı radarda bekliyor.`;
  if (res.reason === 'empty') return `Bu sefer hiç mermi yok: ${aliens} uzaylı radara kaçtı. Doğru cevaplar mermi olur!`;
  if (res.reason === 'win') {
    return (res.mother === 'down' ? '💥 Ana gemi patladı! Bütün uzaylılar kapsüllerle kaçtı.' : `🎉 ${chased} uzaylının hepsini kovaladın! Kovaladık, kaçtılar!`)
      + (left && lg ? ` ${left} mermin ve ${lg} el bomban arttı.` : left ? ` ${left} mermin arttı.` : lg ? ` ${lg} el bomban arttı.` : '');
  }
  if (res.reason === 'time') return `Uzaylılar sıkıldı, kaçtı! ${chased} tanesini kovaladın.`;
  return (res.mother === 'fled' && !rest ? `Mermi bitti, ana gemi kaçtı! ${chased} uzaylıyı kovaladın.`
    : `Mermi bitti, geri çekildik! ${chased} uzaylıyı kovaladın, ${rest} tanesi radara kaçtı.`) + ' Daha çok doğru, daha çok mermi!';
}

/* Uzaylı savaşı: çizimler (sabit SVG; kullanıcı metni yok) */

// Uzaylı gemisi: yeşil, tek gözlü, gülümseyen uzaylı camın içinde; altında renkli tabak ve ışıklar. big: ana gemi.
function battleUfo(color = 0, big = false) {
  const [body, edge, band] = BATTLE_COLORS[color % BATTLE_COLORS.length];
  const dot = (x, y, r, i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? '#FF8FB1' : '#FFE066'}"/>`;
  if (big) {
    // Ana gemi: geniş kubbede üç uzaylı, iki kat tabak, çok ışık.
    return '<svg viewBox="0 0 140 76" aria-hidden="true">'
      + '<path d="M36 40 C36 8 104 8 104 40 Z" fill="#CFF1FF" stroke="#8FCDE8" stroke-width="1.4"/>'
      + [[52, 31], [70, 26], [88, 31]].map(([x, y]) => battleAlien(x, y, 0.9)).join('')
      + `<ellipse cx="70" cy="48" rx="66" ry="13" fill="${body}" stroke="${edge}" stroke-width="2"/><ellipse cx="70" cy="43" rx="44" ry="5" fill="${band}"/>`
      + [12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 130].map((x, i) => dot(x, 50, 3, i)).join('')
      + `<ellipse cx="70" cy="62" rx="30" ry="7" fill="${edge}"/>` + [52, 64, 76, 88].map((x, i) => dot(x, 63, 2.2, i + 1)).join('')
      + `<path d="M58 69 L52 75 M70 69 L70 76 M82 69 L88 75" stroke="${edge}" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  return '<svg viewBox="0 0 64 48" aria-hidden="true"><ellipse cx="32" cy="20" rx="14" ry="13" fill="#CFF1FF" stroke="#8FCDE8" stroke-width="1.2"/>'
    + battleAlien(32, 21, 1)
    + `<ellipse cx="32" cy="32" rx="29" ry="9" fill="${body}" stroke="${edge}" stroke-width="1.6"/><ellipse cx="32" cy="29" rx="19" ry="3.6" fill="${band}"/>`
    + [12, 22, 32, 42, 52].map((x, i) => dot(x, 33, 2.2, i)).join('') + `<ellipse cx="32" cy="40" rx="10" ry="2.8" fill="${edge}"/></svg>`;
}
// Uzaylı başı: yeşil yuvarlak kafa, iki anten, kocaman tek göz, gülüş (s: büyüklük). scared: kapsülde şaşkın "o" ağız.
function battleAlien(x, y, s = 1, scared = false) {
  const r = 7.6 * s;
  return `<path d="M${x - 3 * s} ${y - r + 1} L${x - 6 * s} ${y - r - 6 * s} M${x + 3 * s} ${y - r + 1} L${x + 6 * s} ${y - r - 6 * s}" stroke="#4CAF50" stroke-width="${1.4 * s}" stroke-linecap="round"/>`
    + `<circle cx="${x - 6 * s}" cy="${y - r - 6 * s}" r="${1.7 * s}" fill="#FFE066"/><circle cx="${x + 6 * s}" cy="${y - r - 6 * s}" r="${1.7 * s}" fill="#FFE066"/>`
    + `<circle cx="${x}" cy="${y}" r="${r}" fill="#7ED957" stroke="#4CAF50" stroke-width="${1 * s}"/>`
    + `<circle cx="${x}" cy="${y - 1.4 * s}" r="${3.6 * s}" fill="#fff"/><circle cx="${x + 0.6 * s}" cy="${y - 1.2 * s}" r="${1.9 * s}" fill="#23262B"/><circle cx="${x + 1.4 * s}" cy="${y - 2.2 * s}" r="${0.7 * s}" fill="#fff"/>`
    + `<circle cx="${x - 4.6 * s}" cy="${y + 2.4 * s}" r="${1.3 * s}" fill="#FF9EB5" opacity=".7"/><circle cx="${x + 4.6 * s}" cy="${y + 2.4 * s}" r="${1.3 * s}" fill="#FF9EB5" opacity=".7"/>`
    + (scared ? `<ellipse cx="${x}" cy="${y + 4 * s}" rx="${1.3 * s}" ry="${1.6 * s}" fill="#2E5E1F"/>`
      : `<path d="M${x - 2.6 * s} ${y + 3.2 * s} Q${x} ${y + 5.6 * s} ${x + 2.6 * s} ${y + 3.2 * s}" stroke="#2E5E1F" stroke-width="${1.1 * s}" fill="none" stroke-linecap="round"/>`);
}
// Saklanan uzaylı (sola, kahramana bakar; elinde jöle tabancası). mood: 'peek' (bakar), 'aim' (gözünü kısıp nişan alır),
// 'hit' (vuruldu: gözü fırıldak, dili dışarıda, antenleri düşük), 'cheer' (sevinir, kollar yukarıda).
function battleTrooper(c = 0, mood = 'peek') {
  const [suit, edge] = BATTLE_COLORS[c % BATTLE_COLORS.length];
  const hit = mood === 'hit', cheer = mood === 'cheer', aim = mood === 'aim';
  const G = '#7ED957', GE = '#4CAF50', INK = '#23262B', MOUTH = '#2E5E1F';
  const ant = hit
    ? `<path d="M16 9 Q11 5 8 9.5 M24 9 Q29 5 32 9.5" stroke="${GE}" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8" cy="10" r="2.2" fill="#FFE066"/><circle cx="32" cy="10" r="2.2" fill="#FFE066"/>`
    : `<path d="M16 9 L12 2.4 M24 9 L28 2.4" stroke="${GE}" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="2.4" r="2.2" fill="#FFE066"/><circle cx="28" cy="2.4" r="2.2" fill="#FFE066"/>`;
  const body = `<rect x="11" y="27" width="18" height="19" rx="7" fill="${suit}" stroke="${edge}" stroke-width="1.4"/><rect x="11.7" y="37" width="16.6" height="3" fill="${edge}"/><circle cx="20" cy="32" r="1.6" fill="#FFE066"/>`;
  const head = `<circle cx="20" cy="17" r="10.5" fill="${G}" stroke="${GE}" stroke-width="1.2"/>`;
  const eye = hit
    ? `<circle cx="19.5" cy="15" r="5.2" fill="#fff"/><path d="M19.5 14.9 a1 1 0 1 1 -1 1 a2.2 2.2 0 1 1 2.6 -2.6 a3.4 3.4 0 1 1 -4.6 3.6" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
    : `<circle cx="19.5" cy="15" r="5.2" fill="#fff"/><circle cx="${cheer ? 19.5 : 17.3}" cy="${cheer ? 14.5 : 16.2}" r="2.7" fill="${INK}"/><circle cx="${cheer ? 20.5 : 18.3}" cy="${cheer ? 13.4 : 15.1}" r="0.9" fill="#fff"/>`
      + (aim ? `<path d="M13.8 12.8 Q19.5 9.4 25.4 12.8 L25.4 9 L13.8 9 Z" fill="${G}"/><path d="M13.8 12.8 Q19.5 10.6 25.4 12.8" stroke="${GE}" stroke-width="1.2" fill="none"/>` : '');
  const cheeks = `<circle cx="13.2" cy="20.4" r="1.5" fill="#FF9EB5" opacity=".75"/><circle cx="25.8" cy="20.4" r="1.5" fill="#FF9EB5" opacity=".75"/>`;
  const mouth = cheer ? `<path d="M15.6 21 Q20 27.5 24.2 21 Z" fill="${MOUTH}"/><path d="M17.6 24.3 Q20 26.4 22.3 24.3 Z" fill="#FF8FB1"/>`
    : hit ? `<path d="M15.2 22.8 q1.6 -1.6 3.2 0 t3.2 0 t3.2 0" stroke="${MOUTH}" stroke-width="1.1" fill="none" stroke-linecap="round"/><ellipse cx="21.6" cy="24.6" rx="1.5" ry="1.9" fill="#FF8FB1"/>`
    : aim ? `<path d="M16.5 22.6 H23" stroke="${MOUTH}" stroke-width="1.2" stroke-linecap="round"/>`
    : `<path d="M16 21.6 Q19.5 24 23.2 21" stroke="${MOUTH}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const gun = (x, y, rot) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 13}" y="${y - 3}" width="14" height="6" rx="3" fill="#FFB454" stroke="#D9862B" stroke-width="1"/><circle cx="${x - 12.5}" cy="${y}" r="2.6" fill="${G}" stroke="${GE}" stroke-width=".8"/></g>`;
  const arms = cheer
    ? `<path d="M12.5 31 L6 21 M27.5 31 L34 21" stroke="${suit}" stroke-width="4" stroke-linecap="round"/><circle cx="6" cy="20.5" r="2.6" fill="${G}"/><circle cx="34" cy="20.5" r="2.6" fill="${G}"/>`
    : hit ? gun(15, 41, -35) + `<circle cx="14" cy="36" r="2.8" fill="${G}" stroke="${GE}" stroke-width=".8"/>`
    : gun(15, 33, aim ? -8 : 0) + `<circle cx="14.5" cy="34" r="3" fill="${G}" stroke="${GE}" stroke-width=".8"/>`;
  return `<svg viewBox="0 0 40 48" aria-hidden="true">${ant}${body}${arms}${head}${eye}${cheeks}${mouth}</svg>`;
}
// Saklanma yeri: karada sandık ya da kaya, denizde buzdağı, havada bulut, uzayda asteroit (üst kenarı düz; arkadaki uzaylının
// yalnızca antenleri görünür).
function battleCover(field, i = 0) {
  const v = '<svg viewBox="0 0 60 46" aria-hidden="true">';
  if (field === 'sea') {
    return v + '<path d="M2 41 L8 13 L19 6 L30 2 L42 6 L52 13 L58 41 Z" fill="#F4FBFF" stroke="#8FCDE8" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M30 4 L26 40 M15 12 L19 40 M44 9 L41 40" stroke="#D6F1FF" stroke-width="3"/><path d="M0 40 Q7.5 36 15 40 T30 40 T45 40 T60 40 V46 H0 Z" fill="#4FB3E6"/></svg>';
  }
  if (field === 'air') {
    return v + '<g fill="#fff"><circle cx="14" cy="20" r="13"/><circle cx="30" cy="15" r="14"/><circle cx="46" cy="20" r="13"/><rect x="3" y="20" width="54" height="24" rx="12"/></g>'
      + '<path d="M10 40 Q30 46 50 40" stroke="#D3E6F7" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  }
  if (field === 'space') {
    return v + '<path d="M3 30 Q1 8 18 5 Q30 1 44 5 Q59 9 57 30 Q55 46 32 46 Q8 46 3 30 Z" fill="#8E7F9E" stroke="#5E5170" stroke-width="2"/>'
      + '<circle cx="19" cy="20" r="5" fill="#76688A"/><circle cx="40" cy="30" r="6" fill="#76688A"/><circle cx="38" cy="13" r="3" fill="#76688A"/><circle cx="22" cy="36" r="2.5" fill="#76688A"/></svg>';
  }
  if (i % 2) {
    return v + '<path d="M2 46 Q0 14 14 7 Q30 0 46 6 Q60 12 58 46 Z" fill="#A3AAB5" stroke="#6B717B" stroke-width="2"/>'
      + '<path d="M14 30 Q20 26 26 30 M36 20 Q42 18 47 24" stroke="#8A93A3" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M5 46 L7 39 L9 46 M51 46 L53 38 L55 46" stroke="#5E9E45" stroke-width="2" fill="none"/></svg>';
  }
  return v + '<rect x="4" y="5" width="52" height="40" rx="3" fill="#D39A5B" stroke="#8A5A2B" stroke-width="2"/><path d="M4 18.5 H56 M4 31.5 H56" stroke="#8A5A2B" stroke-width="1.6"/>'
    + '<path d="M9 10 L51 40 M51 10 L9 40" stroke="#A86F37" stroke-width="3"/>' + [[8, 9], [52, 9], [8, 41], [52, 41]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#5C3A1A"/>`).join('') + '</svg>';
}
// El bombasından sonra saklanma yerinden kalanlar.
function battleRubble(field, i = 0) {
  const v = '<svg viewBox="0 0 60 46" aria-hidden="true">';
  if (field === 'air') return v + '<g fill="#fff" opacity=".7"><circle cx="14" cy="38" r="5"/><circle cx="30" cy="40" r="6"/><circle cx="46" cy="38" r="4"/></g></svg>';
  const [f, s] = field === 'sea' ? ['#F4FBFF', '#8FCDE8'] : field === 'space' ? ['#8E7F9E', '#5E5170'] : i % 2 ? ['#A3AAB5', '#6B717B'] : ['#D39A5B', '#8A5A2B'];
  return v + `<g fill="${f}" stroke="${s}" stroke-width="1.6" stroke-linejoin="round"><path d="M6 46 L12 37 L20 46 Z"/><path d="M22 46 L30 33 L38 46 Z"/><path d="M40 46 L47 39 L54 46 Z"/></g>`
    + (field === 'sea' ? '<path d="M0 42 Q7.5 39 15 42 T30 42 T45 42 T60 42 V46 H0 Z" fill="#4FB3E6"/>' : '') + '</svg>';
}
// Kaçış kapsülü: içinde şaşkın uzaylı, altında alev.
const BATTLE_POD = '<svg viewBox="0 0 34 46" aria-hidden="true"><path d="M12 33 Q17 46 22 33 Z" fill="#FF9F1C"/><path d="M14 33 Q17 41 20 33 Z" fill="#FFE066"/>'
  + '<rect x="6" y="5" width="22" height="29" rx="11" fill="#F4F6FA" stroke="#9AA3B2" stroke-width="1.4"/><circle cx="17" cy="16" r="8" fill="#CFF1FF" stroke="#8FCDE8"/>'
  + battleAlien(17, 18, 0.62, true) + '<rect x="11" y="27" width="12" height="3" rx="1.5" fill="#FF8FB1"/></svg>';
// Patlama: sarı-turuncu yıldız (ateş ya da kan yok).
const BATTLE_BOOM = '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 2 L36 18 L52 10 L44 25 L58 30 L44 35 L52 50 L36 42 L30 58 L24 42 L8 50 L16 35 L2 30 L16 25 L8 10 L24 18 Z" fill="#FFD23F" stroke="#FF8C1A" stroke-width="2" stroke-linejoin="round"/>'
  + '<path d="M30 14 L34 24 L44 22 L37 30 L44 38 L34 36 L30 46 L26 36 L16 38 L23 30 L16 22 L26 24 Z" fill="#FFF6C2"/></svg>';
// Süper bomba (denemede): sağa bakan füze, döndürülerek hedefe uçar.
const BATTLE_MISSILE = '<svg viewBox="0 0 44 16" aria-hidden="true"><path d="M2 8 L9 4 L9 12 Z" fill="#FF9F1C"/><rect x="8" y="4" width="26" height="8" rx="4" fill="#F4F6FA" stroke="#8A93A3" stroke-width="1"/>'
  + '<path d="M34 4 Q43 8 34 12 Z" fill="#E63946"/><path d="M12 4 L8 0 L16 4 Z M12 12 L8 16 L16 12 Z" fill="#E63946"/></svg>';
// Mermi: sarı kapsül (sağa bakar).
const BATTLE_BULLET = '<svg viewBox="0 0 18 8" aria-hidden="true"><rect x="1" y="1" width="12" height="6" rx="3" fill="#FFD23F" stroke="#D99A00" stroke-width="1"/><path d="M12 1.2 Q18 4 12 6.8 Z" fill="#FF8C1A"/></svg>';
// El bombası: yeşil, pimli.
const BATTLE_GRENADE = '<svg viewBox="0 0 20 22" aria-hidden="true"><circle cx="10" cy="13.5" r="7.5" fill="#6BBF59" stroke="#3E8E41" stroke-width="1.4"/><path d="M4 13.5 H16 M10 6.5 V20.5" stroke="#3E8E41" stroke-width="1" opacity=".6"/>'
  + '<rect x="7" y="3" width="6" height="4" rx="1" fill="#8A93A3" stroke="#5E6672" stroke-width=".8"/><path d="M13 4 Q17 3 16 8" stroke="#5E6672" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
  + '<circle cx="15.5" cy="2.8" r="2.2" fill="none" stroke="#F4C430" stroke-width="1.2"/><circle cx="8" cy="11" r="1.6" fill="#E9FFD9"/></svg>';
// Uzaylının attığı şey: yeşil jöle damlası; kahramana çarpınca yüzüne yapışır (yalnızca sersemletir).
const BATTLE_GOO = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="#7ED957" stroke="#4CAF50" stroke-width="1.4"/><circle cx="7.6" cy="7.6" r="2" fill="#E9FFD9"/></svg>';
const BATTLE_SPLAT = '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M8 10 Q4 2 12 4 Q16 0 22 4 Q30 0 32 8 Q40 10 34 16 Q38 24 30 22 Q28 30 22 25 Q14 30 12 22 Q2 22 8 16 Q2 12 8 10 Z" fill="#7ED957" stroke="#4CAF50" stroke-width="1.4" opacity=".92"/>'
  + '<circle cx="15" cy="10" r="2.5" fill="#E9FFD9"/></svg>';
// Merminin saklanma yerine çarpması: küçük kıvılcım.
const BATTLE_SPARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#FFF6C2" stroke="#FFD23F" stroke-width="1"/></svg>';
// Sayaçtaki uzaylı başı.
const BATTLE_HEAD = '<svg viewBox="0 0 24 24" aria-hidden="true">' + battleAlien(12, 15, 0.95) + '</svg>';
// Kolun aracı (sağa ve yukarı nişanlı): tank, gemi, jet, uzay gemisi. c: kolun üniforma rengi.
function battleVehicle(field, c = '#5E6E3B') {
  const d = darken(c, 0.75);
  if (field === 'sea') {
    return `<svg viewBox="0 0 140 70" aria-hidden="true"><path d="M8 40 H132 L118 62 Q70 68 22 62 Z" fill="${c}" stroke="${d}" stroke-width="2"/>`
      + `<rect x="10" y="46" width="120" height="4" fill="#fff" opacity=".85"/><rect x="40" y="24" width="38" height="16" rx="4" fill="#E9EEF5" stroke="#9AA3B2"/>`
      + `<circle cx="50" cy="32" r="3" fill="#8FCDE8"/><circle cx="60" cy="32" r="3" fill="#8FCDE8"/><circle cx="70" cy="32" r="3" fill="#8FCDE8"/>`
      + `<rect x="54" y="12" width="5" height="12" fill="#9AA3B2"/><path d="M59 12 L72 16 L59 20 Z" fill="#E63946"/>`
      + `<circle cx="104" cy="36" r="7" fill="${d}"/><line x1="104" y1="36" x2="124" y2="20" stroke="${d}" stroke-width="5" stroke-linecap="round"/></svg>`;
  }
  if (field === 'air') {
    return `<svg viewBox="0 0 140 70" aria-hidden="true"><path d="M10 44 Q8 36 18 34 L104 26 Q132 26 136 34 Q132 42 104 44 Z" fill="${c}" stroke="${d}" stroke-width="2"/>`
      + `<path d="M98 28 Q110 18 122 28 Z" fill="#CFF1FF" stroke="#8FCDE8"/><path d="M50 36 L30 60 L48 60 L74 38 Z" fill="${d}"/><path d="M22 34 L12 16 L24 16 L40 32 Z" fill="${d}"/>`
      + `<path d="M8 38 L0 33 L0 45 Z" fill="#FF9F1C"/><circle cx="60" cy="38" r="3" fill="#F4C430"/><circle cx="76" cy="37" r="3" fill="#F4C430"/></svg>`;
  }
  if (field === 'space') {
    return `<svg viewBox="0 0 140 70" aria-hidden="true"><path d="M30 26 L100 18 Q130 22 132 34 Q130 46 100 50 L30 42 Z" fill="#F4F6FA" stroke="#8A93A3" stroke-width="2"/>`
      + `<path d="M100 18 Q130 22 132 34 L106 34 Z" fill="${c}"/><circle cx="74" cy="34" r="6" fill="#8FCDE8" stroke="#5E8FB0" stroke-width="1.5"/><circle cx="56" cy="34" r="5" fill="#8FCDE8" stroke="#5E8FB0" stroke-width="1.5"/>`
      + `<path d="M40 24 L26 6 L48 22 Z M40 44 L26 62 L48 46 Z" fill="${c}"/><path d="M30 28 L10 34 L30 40 Z" fill="#FF9F1C"/><path d="M30 31 L18 34 L30 37 Z" fill="#FFE066"/></svg>`;
  }
  return `<svg viewBox="0 0 140 70" aria-hidden="true"><rect x="10" y="44" width="104" height="20" rx="10" fill="#3B3F45"/>`
    + [22, 40, 58, 76, 94].map((x) => `<circle cx="${x + 2}" cy="54" r="6" fill="#6B717B" stroke="#2A2D31" stroke-width="1.5"/>`).join('')
    + `<rect x="14" y="30" width="96" height="18" rx="8" fill="${c}" stroke="${d}" stroke-width="2"/><path d="M38 31 Q40 14 62 14 Q84 14 86 31 Z" fill="${c}" stroke="${d}" stroke-width="2"/>`
    + `<line x1="78" y1="22" x2="122" y2="6" stroke="${d}" stroke-width="6" stroke-linecap="round"/><circle cx="62" cy="10" r="3" fill="#F4C430"/>`
    + `<circle cx="30" cy="39" r="3" fill="${d}"/><circle cx="96" cy="39" r="3" fill="${d}"/></svg>`;
}
// Aracın namlusunun ucu (aracın kutusuna göre oran): mermi ve bombalar buradan çıkar.
const BATTLE_TIP = { land: [0.88, 0.1], sea: [0.88, 0.3], air: [0.97, 0.48], space: [0.95, 0.48] };
// Radar: yeşil ekran, dönen çizgi.
const BATTLE_RADAR = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#103B2A" stroke="#7ED957" stroke-width="2"/>'
  + '<circle cx="24" cy="24" r="14" fill="none" stroke="#7ED957" stroke-width="1" opacity=".5"/><circle cx="24" cy="24" r="6" fill="none" stroke="#7ED957" stroke-width="1" opacity=".5"/>'
  + '<g class="battle-sweep"><path d="M24 24 L24 3 A21 21 0 0 1 41 13 Z" fill="#7ED957" opacity=".35"/><line x1="24" y1="24" x2="24" y2="3" stroke="#B8FF9E" stroke-width="1.5"/></g></svg>';
const BATTLE_DIZZY = '<svg viewBox="0 0 60 60" aria-hidden="true">' + [0, 120, 240].map((a) => {
  const r = (a * Math.PI) / 180;
  return `<text x="${(30 + 22 * Math.cos(r)).toFixed(1)}" y="${(34 + 22 * Math.sin(r)).toFixed(1)}" text-anchor="middle" font-size="14" fill="#FFD23F" stroke="#D99A00" stroke-width=".6">★</text>`;
}).join('') + '</svg>';

/* Uzaylı savaşı: oyun */

// Kaçan uzaylıların sözleri ve vuruş sesleri (yazı olarak).
const BATTLE_SAYS = ['Kaçııın!', 'Eyvah!', 'Anneee!', 'Pardon!', 'Görüşürüz!', 'Çok hızlı!'];
const BATTLE_POFS = ['POF!', 'BAM!', 'ZONK!'];
const BATTLE_RISE = 32; // uzaylının başını çıkarınca yükseldiği piksel

// Savaş oyunu. cfg: battleSetup; p: çocuğun profili (kol, görünüş); level: kahramanın gücü; opts.army: kahramanın çizimi için
// armyView; opts.radar: radardaki gemi sayısı (gösterilir); opts.fromRadar: hata tekrarı (uzaylılar radardan gelmiş);
// opts.onEnd(res): oyun bitince (battleSay'in res'i). Önce başlangıç kartı görünür; start() başlatır, skip() atlar.
// Uzaylı başını çıkarınca ona dokunmak mermi atar; el bombası düğmesinden sonra bir saklanma yerine dokunmak onu patlatır.
function battleGame(cfg, p, level, opts = {}) {
  const field = BATTLE_FIELD[p?.hero_corps] || 'land', uni = HERO_UNIFORM[p?.hero_corps] || HERO_UNIFORM.kara;
  const svgIn = (cls, svg, ...kids) => {
    const el = h('span', { class: cls, 'aria-hidden': 'true' }, ...kids);
    el.insertAdjacentHTML('afterbegin', svg);
    return el;
  };
  const box = h('div', { class: `battle game f-${field}${cfg.exam ? ' exam' : ''}` });
  const layer = h('div', { class: 'battle-layer', 'aria-hidden': 'true' });
  let bullets = cfg.bullets, grenades = cfg.grenades, superLeft = cfg.superBomb ? 1 : 0, chased = 0, gooHits = 0;
  let playing = false, ending = false, over = false, grenadeMode = false, inFlight = 0, lastShot = 0, stunUntil = 0, lastTouch = 0, lastPost = null, run = 0;

  // Üst şerit: mermi, el bombası (düğme), süper bomba (denemede, kalkan inince), kalan uzaylı.
  const ammoN = h('b', {}), grenN = h('b', {}), alienN = h('b', {});
  const ammoPill = h('span', { class: 'battle-pill', title: 'Mermi: her doğru cevap' }, svgIn('ico', BATTLE_BULLET), ammoN);
  const grenBtn = h('button', { type: 'button', class: 'battle-pill', 'aria-pressed': 'false', 'aria-label': 'El bombası', title: 'El bombası: zor soruyu doğru çözünce', onclick: () => setGrenade(!grenadeMode) },
    svgIn('ico', BATTLE_GRENADE), grenN);
  const superBtn = h('button', { type: 'button', class: 'battle-pill super', hidden: true, onclick: () => fireSuper() }, svgIn('ico', BATTLE_MISSILE), 'Süper bomba');
  const alienPill = h('span', { class: 'battle-pill', title: 'Kalan uzaylı' }, svgIn('ico', BATTLE_HEAD), alienN);
  const hud = h('div', { class: 'battle-hud' }, ammoPill, grenBtn, superBtn, h('span', { class: 'grow' }), alienPill);
  const hint = h('p', { class: 'battle-hint', 'aria-live': 'polite' });
  const banner = h('p', { class: 'battle-banner', 'aria-live': 'polite' });

  const radarN = h('b', {}, String(Math.max(0, opts.radar ?? 0))), radar = h('div', { class: 'battle-radar', 'aria-hidden': 'true' }, radarN);
  radar.insertAdjacentHTML('afterbegin', BATTLE_RADAR);
  if (opts.radar == null) radarN.hidden = true;
  const heroEl = h('div', { class: 'battle-hero', 'aria-hidden': 'true' });
  heroEl.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, opts.army);
  const car = h('div', { class: 'battle-car', 'aria-hidden': 'true' });
  car.innerHTML = battleVehicle(field, uni.shirt);
  const deco = field === 'space' ? h('span', { class: 'battle-planet', 'aria-hidden': 'true' })
    : field === 'air' ? null : [h('span', { class: 'battle-cloud c1', 'aria-hidden': 'true' }), h('span', { class: 'battle-cloud c2', 'aria-hidden': 'true' })];

  // Saklanma yerleri ve arkalarındaki uzaylılar (antenleri görünür). state: hidden, up, ducking, hit (vuruldu), gone.
  const posts = battlePosts(cfg.aliens, cfg.exam).map((pt, pi) => {
    const el = h('div', { class: 'battle-post', style: `left: ${pt.x}%; top: ${pt.y}%`, 'aria-hidden': 'true' });
    const post = { el, pi, broken: false, cover: svgIn('battle-cover', battleCover(field, pi)) };
    post.list = pt.aliens.map((i, k) => {
      const a = { i, post, state: 'hidden', anim: null, el: h('span', { class: 'battle-trooper', style: `margin-left: ${-19 + (k - (pt.aliens.length - 1) / 2) * 11}px` }) };
      a.el.innerHTML = battleTrooper(i, 'peek');
      return a;
    });
    fill(el, post.list.map((a) => a.el), post.cover);
    return post;
  });
  const aliens = posts.flatMap((pt) => pt.list);
  const alive = (a) => a.state !== 'hit' && a.state !== 'gone';

  // Denemede ana gemi: önce kalkanlı (küçük uzaylılar bitince iner), sonra sağa sola gezer, jöle atar; canı çubukta.
  let mother = null, motherState = null, motherHp = cfg.motherHp;
  const hpBar = h('i', {});
  if (cfg.exam) {
    mother = h('div', { class: 'battle-mother shield', 'aria-hidden': 'true' }, h('span', { class: 'battle-hp' }, hpBar));
    mother.insertAdjacentHTML('afterbegin', `<span class="battle-sway">${battleUfo(0, true)}</span>`);
    motherState = 'shield';
  }
  const motherBody = () => mother?.firstElementChild;

  const startBtn = h('button', { type: 'button', class: 'primary', onclick: () => start() },
    cfg.bullets || cfg.grenades || cfg.superBomb ? 'Savaşa başla!' : 'Tamam');
  const startCard = h('div', { class: 'battle-start' }, h('div', {},
    h('p', { class: 'battle-title' }, opts.fromRadar ? 'Radardaki uzaylılar geldi!' : 'Uzaylılar geldi!'),
    // "10 mermi" Türkçe harf taşımadığı için İngilizce katman tanımaz: satır iki dilde kurulur.
    h('p', { class: 'battle-ammo' }, trEn(
      [`${cfg.bullets} mermi`, cfg.grenades ? `${cfg.grenades} el bombası` : '', cfg.superBomb ? 'süper bomba' : '', `${cfg.aliens} uzaylı`].filter(Boolean).join(' · '),
      [`${cfg.bullets} bullet${cfg.bullets === 1 ? '' : 's'}`, cfg.grenades ? `${cfg.grenades} grenade${cfg.grenades === 1 ? '' : 's'}` : '', cfg.superBomb ? 'super bomb' : '',
        `${cfg.aliens} aliens`].filter(Boolean).join(' · '))),
    h('p', { class: 'small' }, 'Her doğru bir mermi, zor soru el bombası, her yanlış bir uzaylı.'),
    h('p', { class: 'small' }, 'Başını çıkaran uzaylıya dokun!', cfg.exam ? ' Sonra ana gemi gelir.' : ''),
    startBtn));
  fill(box, deco, h('div', { class: 'battle-floor', 'aria-hidden': 'true' }), posts.map((pt) => pt.el), mother, car, heroEl, layer, radar, hud, hint, banner, startCard);
  const skipBtn = h('button', { type: 'button', class: 'ghost small', onclick: () => skip() }, 'Atla');
  const wrap = h('div', { class: 'battle-wrap' }, box, h('div', { class: 'battle-under' }, skipBtn));

  // Yardımcılar: zamanlayıcılar oyun bitince ya da kutu sayfadan çıkınca durur.
  const timers = new Set();
  const later = (ms, fn) => {
    const r = run, id = setTimeout(() => { timers.delete(id); if (r === run && box.isConnected) fn(); }, ms);
    timers.add(id);
  };
  const gone = () => over || !box.isConnected;
  const rel = (el) => {
    const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    return { l: a.left - b.left, t: a.top - b.top, r: a.right - b.left, b: a.bottom - b.top, w: a.width, h: a.height };
  };
  const mid = (el) => { const r = rel(el); return [r.l + r.w / 2, r.t + r.h / 2]; };
  const at = (x, y, rot = 0, s = 1) => `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${s})`;
  const put = (cls, svg, x, y, ...kids) => {
    const el = svgIn(cls, svg, ...kids);
    el.style.transform = at(x, y);
    layer.append(el);
    return el;
  };
  const anim = (el, frames, ms, easing = 'ease-in-out') => (el.animate ? el.animate(frames, { duration: ms, easing, fill: 'forwards' }).finished.catch(() => {}) : Promise.resolve());
  const tip = () => { const r = rel(car), [fx, fy] = BATTLE_TIP[field]; return [r.l + r.w * fx, r.t + r.h * fy]; };
  let sayT = 0;
  const say = (t, ms = 1200) => {
    hint.textContent = t;
    hint.classList.add('on');
    clearTimeout(sayT);
    sayT = setTimeout(() => hint.classList.remove('on'), ms);
  };
  const show = () => {
    ammoN.textContent = String(bullets);
    grenN.textContent = String(grenades);
    grenBtn.hidden = !cfg.grenades;
    grenBtn.disabled = !grenades || !playing;
    alienN.textContent = String(aliens.filter(alive).length);
  };
  const setMood = (a, m) => { if (a.el.isConnected) a.el.innerHTML = battleTrooper(a.i, m); };
  const pof = (x, y, word, s = 1) => {
    const el = put('battle-pof', BATTLE_BOOM, x, y, h('b', {}, word));
    anim(el, [{ transform: at(x, y, -10, 0.3 * s), opacity: 1 }, { transform: at(x, y, 6, 1.1 * s), opacity: 1, offset: 0.35 }, { transform: at(x, y, 0, 1.2 * s), opacity: 0 }], 700).then(() => el.remove());
  };
  // Kaçış kapsülü (x, y)'den yukarı ve yana uçar; talk: üstünde "Kaçııın!" gibi bir söz.
  const pod = (x, y, dx = 1, talk = true) => {
    const el = put('battle-pod', BATTLE_POD, x, y, talk ? h('span', { class: 'battle-say' }, BATTLE_SAYS[Math.floor(Math.random() * BATTLE_SAYS.length)]) : null);
    const ex = x + dx * (70 + Math.random() * 80);
    anim(el, [{ transform: at(x, y, 0, 0.7) }, { transform: at(x + dx * 10, y - 26, dx * 8, 1), offset: 0.25 }, { transform: at(ex, -80, dx * 30, 0.9) }], 1500, 'ease-in').then(() => el.remove());
  };
  const spark = (x, y) => {
    const el = put('battle-spark', BATTLE_SPARK, x, y);
    anim(el, [{ transform: at(x, y, 0, 0.4), opacity: 1 }, { transform: at(x, y, 40, 1.1), opacity: 0 }], 320).then(() => el.remove());
  };

  // Uzaylı başını çıkarır, bir süre bakar, ortasında jöle atar, sonra saklanır.
  const peek = (a) => {
    a.state = 'up';
    a.anim = a.el.animate?.([{ translate: '0 0' }, { translate: `0 -${BATTLE_RISE}px` }], { duration: 170, easing: 'ease-out', fill: 'forwards' });
    if (Math.random() < (cfg.fireChance ?? 0.5)) later(cfg.peekMs * 0.55, () => { if (a.state === 'up' && playing) goo(a); });
    later(cfg.peekMs, () => {
      if (a.state !== 'up') return;
      a.state = 'ducking';
      a.anim = a.el.animate?.([{ translate: `0 -${BATTLE_RISE}px` }, { translate: '0 0' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      later(210, () => { if (a.state === 'ducking') { a.state = 'hidden'; setMood(a, 'peek'); } });
    });
  };
  const tick = () => {
    if (!playing) return;
    const busy = aliens.filter((a) => a.state === 'up' || a.state === 'ducking').length;
    if (busy < cfg.maxUp) {
      const free = posts.filter((pt) => !pt.broken && pt.list.some((a) => a.state === 'hidden') && !pt.list.some((a) => a.state === 'up' || a.state === 'ducking'));
      const pick = free.length > 1 ? free.filter((pt) => pt !== lastPost) : free;
      if (pick.length) {
        const pt = pick[Math.floor(Math.random() * pick.length)], hid = pt.list.filter((a) => a.state === 'hidden');
        lastPost = pt;
        peek(hid[Math.floor(Math.random() * hid.length)]);
      }
    }
    later((cfg.maxUp > 1 ? 350 : 500) + Math.random() * 500, tick);
  };
  // Jöle: uzaylının (ya da ana geminin) tabancasından kahramana kavisle uçar; çoğu zaman çarpar, kahraman bir an sersemler.
  const goo = (a) => {
    let x0, y0;
    if (a) {
      setMood(a, 'aim');
      const r = rel(a.el);
      [x0, y0] = [r.l + 3, r.t + r.h * 0.69];
    } else {
      const r = rel(motherBody());
      [x0, y0] = [r.l + r.w / 2, r.b - 6];
    }
    const [hx, hy] = mid(heroEl), miss = Math.random() < 0.35;
    const tx = miss ? hx + 50 + Math.random() * 40 : hx, ty = miss ? hy + 34 : hy - 12;
    const g = put('battle-goo', BATTLE_GOO, x0, y0);
    anim(g, [{ transform: at(x0, y0, 0, 0.8) }, { transform: at((x0 + tx) / 2, Math.min(y0, ty) - 46, 180, 1), offset: 0.5 }, { transform: at(tx, ty, 360, 1.1) }], 700, 'linear').then(() => {
      g.remove();
      if (gone()) return;
      if (miss) {
        const s = put('battle-splat ground', BATTLE_SPLAT, tx, ty + 6);
        anim(s, [{ opacity: 1 }, { opacity: 0 }], 900, 'ease-in').then(() => s.remove());
      } else stun();
    });
  };
  const stun = () => {
    gooHits++;
    stunUntil = Date.now() + 650;
    heroEl.querySelector('svg')?.animate?.([{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '7deg' }, { rotate: '0deg' }], { duration: 400, iterations: 2 });
    heroEl.querySelectorAll('.battle-stars, .battle-splat').forEach((el) => el.remove());
    const st = svgIn('battle-stars', BATTLE_DIZZY), sp = svgIn('battle-splat', BATTLE_SPLAT);
    heroEl.append(st, sp);
    setTimeout(() => { st.remove(); sp.remove(); }, 900);
  };

  // Dokunulan yerde başını çıkarmış uzaylı (görünen kısmı, biraz payla) ya da saklanma yeri ya da ana gemi var mı.
  const alienAt = (x, y) => {
    let best = null, bd = Infinity;
    for (const a of aliens) {
      if (a.state !== 'up' && a.state !== 'ducking') continue;
      const r = rel(a.el), top = rel(a.post.cover).t + 6;
      if (x < r.l - 10 || x > r.r + 10 || y < r.t - 10 || y > Math.min(r.b, top) + 4) continue;
      const d = Math.abs(x - (r.l + r.w / 2)) + Math.abs(y - (r.t + r.h / 3));
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  };
  const coverAt = (x, y) => posts.find((pt) => {
    if (pt.broken) return false;
    const r = rel(pt.cover);
    return x >= r.l - 4 && x <= r.r + 4 && y >= r.t - 4 && y <= r.b + 4;
  });
  const motherAt = (x, y) => {
    if (motherState !== 'shield' && motherState !== 'open') return false;
    const r = rel(motherBody());
    return x >= r.l && x <= r.r && y >= r.t && y <= r.b;
  };

  const shoot = (x, y) => {
    lastTouch = Date.now();
    if (Date.now() < stunUntil) return say('Jöle! Bir saniye…', 700);
    if (grenadeMode) return throwGrenade(x, y);
    if (Date.now() - lastShot < 250) return;
    if (!bullets) {
      ammoPill.animate?.([{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], 300);
      return say(grenades ? 'Mermi bitti, el bombası at!' : superLeft && motherState === 'open' ? 'Süper bombaya bas!' : 'Mermi bitti!', 1000);
    }
    const target = alienAt(x, y), atMother = !target && motherAt(x, y);
    if (atMother && motherState === 'shield') return say('Önce küçük uzaylıları kovala!', 1100);
    lastShot = Date.now();
    bullets--;
    if (target) { target.state = 'hit'; target.anim?.pause(); }
    show();
    const [x0, y0] = tip(), rot = (Math.atan2(y - y0, x - x0) * 180) / Math.PI;
    const b = put('battle-bullet', BATTLE_BULLET, x0, y0);
    inFlight++;
    anim(b, [{ transform: at(x0, y0, rot, 0.9) }, { transform: at(x, y, rot, 1.1) }], 170, 'linear').then(() => {
      b.remove();
      inFlight--;
      if (gone()) return;
      if (target) chase(target);
      else if (atMother) hitMother(1, x, y);
      else if (coverAt(x, y)) spark(x, y);
      checkEnd();
    });
  };
  // Vurulan uzaylı: "POF!", gözü fırıldak olur, sonra kaçış kapsülüyle uçar gider.
  const chase = (a) => {
    setMood(a, 'hit');
    const [x, y] = mid(a.el);
    pof(x, y - 8, BATTLE_POFS[chased % BATTLE_POFS.length]);
    chased++;
    show();
    setTimeout(() => {
      if (!box.isConnected || !a.el.isConnected) return;
      const [px, py] = mid(a.el);
      a.el.remove();
      a.state = 'gone';
      pod(px, py - 8, px > box.clientWidth * 0.6 ? 1 : -1);
    }, 380);
  };

  // El bombası: düğmeye basınca nişan modu; dokunulan yere en yakın saklanma yerine (90 piksel içinde) kavisle uçar.
  const setGrenade = (on) => {
    grenadeMode = !!on && grenades > 0 && playing;
    grenBtn.setAttribute('aria-pressed', String(grenadeMode));
    box.classList.toggle('aiming', grenadeMode);
    if (grenadeMode) say('Bir saklanma yerine dokun!', 1600);
  };
  const throwGrenade = (x, y) => {
    let target = null, bd = 90;
    for (const pt of posts) {
      if (pt.broken) continue;
      const [cx, cy] = mid(pt.cover), d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; target = pt; }
    }
    const atMother = !target && motherAt(x, y);
    if (atMother && motherState === 'shield') { setGrenade(false); return say('Önce küçük uzaylıları kovala!', 1100); }
    grenades--;
    setGrenade(false);
    hint.classList.remove('on');
    lastShot = Date.now();
    if (target) target.broken = true; // uçarken arkasından kimse çıkmasın
    show();
    const [tx, ty] = target ? mid(target.cover) : [x, y], [x0, y0] = tip();
    const g = put('battle-grenade', BATTLE_GRENADE, x0, y0);
    inFlight++;
    anim(g, [{ transform: at(x0, y0, 0, 0.9) }, { transform: at((x0 + tx) / 2, Math.min(y0, ty) - 70, 300, 1.15), offset: 0.5 }, { transform: at(tx, ty, 620, 1) }], 650, 'linear').then(() => {
      g.remove();
      inFlight--;
      if (gone()) return;
      pof(tx, ty, 'BUM!', 1.7);
      if (target) blowPost(target);
      else if (atMother) hitMother(3, tx, ty);
      checkEnd();
    });
  };
  // Saklanma yeri patlar (geriye küçük parçalar kalır); arkasındaki bütün uzaylılar havaya fırlar, kapsüllerle kaçar.
  const blowPost = (pt) => {
    anim(pt.cover, [{ scale: '1', rotate: '0deg', opacity: 1 }, { scale: '1.35', rotate: '8deg', opacity: 0 }], 350, 'ease-out').then(() => {
      pt.cover.getAnimations?.().forEach((x) => x.cancel());
      pt.cover.innerHTML = battleRubble(field, pt.pi);
      pt.cover.classList.add('rubble');
    });
    const out = pt.list.filter(alive);
    out.forEach((a, k) => {
      const from = a.state === 'up' || a.state === 'ducking' ? -BATTLE_RISE : 0;
      a.state = 'hit';
      a.anim?.cancel();
      chased++;
      setMood(a, 'hit');
      a.el.animate?.([{ translate: `0 ${from}px` }, { translate: `${(k - (out.length - 1) / 2) * 20}px -52px` }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => {
        if (!box.isConnected || !a.el.isConnected) return;
        const [px, py] = mid(a.el);
        a.el.remove();
        a.state = 'gone';
        pod(px, py, k % 2 ? 1 : -1, k === 0);
      }, 440 + k * 130);
    });
    show();
  };

  // Ana gemi: kalkan iner, sağa sola gezer, ara ara jöle atar. Mermi 1, el bombası 3 can götürür; süper bomba hepsini.
  const openMother = () => {
    motherState = 'open';
    mother.classList.replace('shield', 'open');
    superBtn.hidden = !superLeft;
    say(superLeft ? 'Kalkan indi! Süper bomban hazır!' : 'Kalkan indi! Ana gemiye ateş!', 1800);
    const back = () => { if (motherState === 'open' && playing) { goo(null); later(2300, back); } };
    later(1600, back);
  };
  const hitMother = (dmg, x, y) => {
    if (motherState !== 'open') return;
    motherHp = Math.max(0, motherHp - dmg);
    hpBar.style.width = `${(100 * motherHp) / cfg.motherHp}%`;
    pof(x, y, dmg > 1 ? 'BUM!' : BATTLE_POFS[motherHp % BATTLE_POFS.length], dmg > 1 ? 1.4 : 0.8);
    motherBody().animate?.([{ rotate: '0deg' }, { rotate: '5deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], 260);
    if (!motherHp) downMother();
  };
  const downMother = () => {
    motherState = 'down';
    superBtn.hidden = true;
    hint.classList.remove('on');
    const [mx, my] = mid(motherBody());
    pof(mx, my, 'KABUM!', 2.6);
    mother.style.visibility = 'hidden';
    for (let k = 0; k < 6; k++) pod(mx + (k - 2.5) * 14, my, k < 3 ? -1 : 1, k === 2);
  };
  const fireSuper = () => {
    if (!superLeft || motherState !== 'open' || !playing) return;
    superLeft = 0;
    superBtn.hidden = true;
    lastTouch = Date.now();
    const [x0, y0] = tip(), [mx, my] = mid(motherBody()), rot = (Math.atan2(my - y0, mx - x0) * 180) / Math.PI;
    const m = put('battle-missile big', BATTLE_MISSILE, x0, y0);
    inFlight++;
    anim(m, [{ transform: at(x0, y0, rot, 1) }, { transform: at(mx, my, rot, 1.7) }], 600, 'ease-in').then(() => {
      m.remove();
      inFlight--;
      if (gone()) return;
      motherHp = 0;
      hpBar.style.width = '0%';
      downMother();
      checkEnd();
    });
  };

  // Bitiş: hepsi kovalandıysa kazandı; cephane bittiyse (uçan mermi yoksa) geri çekilir.
  const endSoon = (reason, ms) => {
    if (ending || over) return;
    ending = true;
    playing = false;
    setGrenade(false);
    show();
    later(ms, () => finish(reason));
  };
  const checkEnd = () => {
    if (ending || over || !playing) return;
    const left = aliens.filter(alive).length;
    if (!left && motherState === 'shield') openMother();
    if (!left && (!mother || motherState === 'down')) return endSoon('win', 1300);
    if (!inFlight && !bullets && !grenades && !(superLeft && motherState === 'open')) endSoon('ammo', 600);
  };
  const retreat = () => {
    const [cx, cy] = mid(car), say2 = h('span', { class: 'battle-say hero' }, 'Geri çekiliiin!');
    heroEl.append(say2);
    [car, heroEl].forEach((el) => el.animate?.([{ translate: '0 0', rotate: '0deg' }, { translate: '10px 0', rotate: '2deg', offset: 0.15 }, { translate: '-300px 0', rotate: '-4deg' }],
      { duration: 1100, easing: 'ease-in', fill: 'forwards' }));
    for (let k = 0; k < 3; k++) {
      const d = put('battle-dust', '', cx + 30 + k * 14, cy + 20);
      anim(d, [{ transform: at(cx + 30 + k * 14, cy + 20, 0, 0.4), opacity: 0.9 }, { transform: at(cx + 50 + k * 18, cy + 8, 0, 1.6), opacity: 0 }], 900 + k * 120, 'ease-out').then(() => d.remove());
    }
  };
  const finish = async (reason) => {
    if (over) return;
    over = true;
    playing = false;
    ending = true;
    run++;
    timers.forEach(clearTimeout);
    timers.clear();
    grenadeMode = false;
    box.classList.remove('aiming');
    hud.classList.add('off');
    startCard.remove();
    show();
    const rest = aliens.filter(alive), motherAlive = motherState === 'shield' || motherState === 'open';
    const res = { reason, chased, aliens: cfg.aliens, left: bullets, leftGrenades: grenades, mother: mother ? (motherState === 'down' ? 'down' : 'fled') : null, gooHits };
    const step = (ms) => new Promise((ok) => setTimeout(ok, ms));
    if (reason !== 'skip') {
      if (rest.length) {
        // Kalan uzaylılar başını çıkarır; mermi bitince sevinip zıplar.
        const cheer = reason === 'ammo' || reason === 'empty';
        rest.forEach((a) => {
          a.anim?.cancel();
          setMood(a, cheer ? 'cheer' : 'peek');
          a.anim = a.el.animate?.([{ translate: '0 0' }, { translate: `0 -${BATTLE_RISE}px` }], { duration: 200, fill: 'forwards' });
        });
        await step(350);
        if (cheer) {
          rest.forEach((a, k) => a.el.animate?.([{ translate: `0 -${BATTLE_RISE}px` }, { translate: `0 -${BATTLE_RISE + 12}px` }, { translate: `0 -${BATTLE_RISE}px` }],
            { duration: 320, iterations: 3, delay: k * 60, composite: 'replace' }));
          if (reason === 'ammo') retreat();
          await step(1100);
        }
        // Sonra hepsi kapsüllerle radara kaçar (sıkılınca biri "Sıkıldııık!" der).
        if (!box.isConnected) return;
        const [rx, ry] = mid(radar);
        rest.forEach((a, k) => setTimeout(() => {
          if (!box.isConnected || !a.el.isConnected) return;
          const [px, py] = mid(a.el);
          a.el.remove();
          a.state = 'gone';
          const el = put('battle-pod', BATTLE_POD, px, py, k === 0 ? h('span', { class: 'battle-say' }, reason === 'time' ? 'Sıkıldııık!' : 'Radara!') : null);
          anim(el, [{ transform: at(px, py, 0, 0.8) }, { transform: at(px, py - 30, -10, 1), offset: 0.3 }, { transform: at(rx, ry, 20, 0.2) }], 1100, 'ease-in').then(() => {
            el.remove();
            radarN.animate?.([{ scale: '1' }, { scale: '1.5' }, { scale: '1' }], 300);
          });
        }, k * 110));
        await step(rest.length * 110 + 1000);
      }
      if (motherAlive && mother && box.isConnected) {
        await anim(motherBody(), [{ translate: '0 0', rotate: '0deg' }, { translate: '-8px 0', rotate: '-5deg', offset: 0.2 }, { translate: '8px 0', rotate: '5deg', offset: 0.4 },
          { translate: '240px -220px', rotate: '14deg' }], 1400, 'ease-in');
      }
      if (reason === 'win') heroEl.querySelector('svg')?.animate?.([{ translate: '0 0' }, { translate: '0 -16px' }, { translate: '0 0' }, { translate: '0 -10px' }, { translate: '0 0' }], { duration: 900 });
    }
    banner.textContent = battleSay(res);
    banner.classList.add('on');
    skipBtn.hidden = true;
    opts.onEnd?.(res);
  };

  const start = () => {
    if (playing || over || ending) return;
    startCard.remove();
    if (!cfg.bullets && !cfg.grenades && !cfg.superBomb) return finish('empty');
    playing = true;
    lastTouch = Date.now();
    show();
    say('Başla!', 900);
    later(600, tick);
    later(cfg.timeMs, () => endSoon('time', 0));
    // 20 saniye hiç dokunmazsa uzaylılar sıkılıp kaçar.
    const idle = () => { if (!playing) return; if (Date.now() - lastTouch > 20000) return endSoon('time', 0); later(2000, idle); };
    later(2000, idle);
  };
  const skip = () => { if (!over) finish('skip'); };
  box.addEventListener('pointerdown', (e) => {
    if (!playing || e.target.closest('button')) return;
    e.preventDefault();
    const b = box.getBoundingClientRect();
    shoot(e.clientX - b.left, e.clientY - b.top);
  });
  show();
  wrap.start = start;
  wrap.skip = skip;
  // Test ve önizleme için durum.
  wrap.peekState = () => ({ playing, over, bullets, grenades, superLeft, chased, gooHits, aliens: aliens.map((a) => a.state), mother: motherState, motherHp });
  return wrap;
}

// Kahramanın seviyesi (çizim için): besleme açıksa beslemenin kahramanı, değilse kelime ve klavye kahramanı; okunamazsa 1.
const armyHeroLevel = (p) => (feedOn(p) ? loadFeed(p).then((fs) => fs.hero.level) : typingHero().then((t) => t.level)).catch(() => 1);

// Oturum ya da deneme sonundaki savaş kartı, yalnızca asker olmuş (kolunu seçmiş) çocukta: correct doğru, wrong yanlış (boş
// dahil), hard doğruların kaçı zor; kind 'session' ya da 'exam'; fromRadar: hata tekrarı oturumu. Radarda hata tekrarında
// bekleyen soru sayısı görünür. Asker değilse, cevap yoksa ya da numara okunamazsa kart gizli kalır; hiçbir şey yazmaz.
function battleCard(correct, wrong, hard, kind = 'session', fromRadar = false) {
  const box = h('section', { class: 'card stack battle-card', hidden: true, style: 'gap: 8px' });
  const p = state.student;
  if (!p || !armyOpen(p) || !heroGamesOn(p) || correct + wrong <= 0) return box; // oyunları veli kapatabilir (plan.js)
  loadArmy(p).then(async (st) => {
    if (!st || !armyCorps(st.corps)) return;
    const [level, radar] = await Promise.all([
      armyHeroLevel(p),
      sb.from('items').select('id', { count: 'exact', head: true }).eq('student_id', p.id).eq('track', 'mistake').eq('state', 'active')
        .then((r) => (r.error ? null : r.count), () => null),
    ]);
    const kid = { ...p, hero_corps: st.corps };
    const game = battleGame(battleSetup(correct, wrong, hard, kind, p.grade), kid, level, { army: armyView(kid, st), radar, fromRadar });
    fill(box, h('p', { class: 'label' }, '👾 Uzaylı savaşı'), game);
    box.hidden = false;
  }).catch(() => {});
  return box;
}

/* Antrenman (velinin isteği, 2026-11-16: "sorular çözdükçe kahraman kum torbasını yumruklayabilir mi? döner tekme atsın üst üste
   doğrular gelince, yanlış cevapta düşsün komik şekilde sonra gülümsesin, hadi bir daha deneyelim desin… asker olana kadar";
   "kum torbası başlangıçta, 70 puandan sonra komik alien karakter ile dövüş"). Asker kahraman açık, henüz asker olmamış
   çocukta oturumda cevaptan sonra bir sahne (2-4 saniye): üst üste doğrularla büyüyen yumruk, kroşe, tekme ve kombolar
   (trainMove); yanlışta torba geri gelip kahramanı devirir, kahraman kalkar, "Hadi bir daha deneyelim!". 70 numaradan sonra kum torbası
   yerine eldivenli sevimli uzaylı antrenman partneri (düşman değil: vurulunca sendeler, gülümseyip eldivenlerini kaldırır;
   yanlışta kahramanı hafifçe iter, kıkırdar). Kimse yaralanmaz. Denemede yok; hareket azaltılmışsa yok. */

/* Antrenman: saf kısım */

const TRAIN_ALIEN_AT = 70; // bu numaradan sonra kum torbası yerine uzaylı partner
// Hareket (velinin isteği, 2026-11-17): üst üste doğru sayısına göre sahne büyür. 1: birkaç yumruk, torba uzağa gider, kahraman
// tutar ('jabs'); 2: sağdan soldan kroşe, torbada el izi ('hooks'); 3: tekme ('kick'); 4: yumruk tekme ('mix'); 5: döner tekme
// ('spin'); 6 ve üstü: büyük kombo ile öncekiler sırayla ('super', 'mix', 'spin'). Yanlışta 'fall' ve seri baştan başlar.
// Kombolar (velinin isteği, 2026-11-18: "tekme ve yumruk kombolarını kickboks, taekwondo vb. sporlardan alabilirsin, kombolar
// hep aynı olunca sıkıcı oluyor"): her basamakta birkaç kombo var, oturumda her basamak kendi sırasıyla döner (k; başlangıcı
// oturuma göre değişir, trainSlot). Basamaklar büyümeyi korur: önce yumruklar, sonra diz ve ön tekme, tekmeler, kombolar,
// havada dönen tekmeler. Eski beş hareket her basamağın ilki olarak duruyor.
const TRAIN_TIERS = [
  ['jabs', 'onetwo', 'uppercut'], // 1: yumruklar, bir-iki, aparkat (boks)
  ['hooks', 'knee', 'front'], // 2: kroşeler (boks), diz (muay thai), ön tekme ve ters yumruk (karate)
  ['kick', 'axe', 'back'], // 3: tekme (kickboks), balta tekmesi (taekwondo), geri tekme (karate)
  ['mix', 'lowkick', 'double'], // 4: yumruk tekme, bir-iki alçak tekme (kickboks), havada çift tekme (taekwondo)
  ['spin', 'tornado', 'flying'], // 5: döner tekme, tornado tekme, uçan tekme (taekwondo)
  ['super', 'tornado', 'lowkick', 'flying', 'mix', 'double', 'spin', 'axe'], // 6 ve üstü: büyük kombo ve öncekiler
];
const TRAIN_MOVES = [...new Set(TRAIN_TIERS.flat())];
const trainTier = (streak) => Math.min(TRAIN_TIERS.length, Math.max(1, Math.trunc(streak) || 1)) - 1;
const trainMove = (correct, streak, k = 0) => {
  if (!correct) return 'fall';
  const pool = TRAIN_TIERS[trainTier(streak)];
  return pool[(Math.abs(Math.trunc(k)) || 0) % pool.length];
};
// Kombonun sporu: sahnenin salonu (arka plan, zemin, ring ipleri) ve köşedeki adı.
const TRAIN_SPORT = { jabs: 'boks', onetwo: 'boks', uppercut: 'boks', hooks: 'boks', knee: 'muaythai', front: 'karate', back: 'karate',
  kick: 'kickboks', mix: 'kickboks', lowkick: 'kickboks', axe: 'taekwondo', double: 'taekwondo', spin: 'taekwondo', tornado: 'taekwondo',
  flying: 'taekwondo', super: 'kombo' };
const trainSport = (move) => TRAIN_SPORT[move] || null;
function trainSportName(sport) {
  if (sport === 'boks') return trEn('🥊 Boks', '🥊 Boxing');
  if (sport === 'kickboks') return trEn('🥊 Kickboks', '🥊 Kickboxing');
  if (sport === 'muaythai') return trEn('🥊 Muay Thai', '🥊 Muay Thai');
  if (sport === 'taekwondo') return trEn('🥋 Taekwondo', '🥋 Taekwondo');
  if (sport === 'karate') return trEn('🥋 Karate', '🥋 Karate');
  if (sport === 'kombo') return trEn('⭐ Süper kombo', '⭐ Super combo');
  return '';
}
// Torbanın eskimesi (velinin isteği, 2026-11-18: "kum torbasına vurdukça kum torbası iyice eskisin, çalışmanın sonuna
// yaklaşılıyorsa kum da dökülmeye başlayabilir"): n oturumdaki kaçıncı torba sahnesi, progress oturumun ne kadarı bitti
// (0-1). stage 0 yeni, 1 sürtük, 2 yamalı, 3 bantlı; spill 0 yok, 1 yırtıktan kum sızıyor, 2 kum dökülüyor. Her oturum yeni
// torbayla başlar; kum dökülürken torba en az yamalıdır.
const bagWear = (n, progress) => {
  const p = Math.min(1, Math.max(0, Number(progress) || 0)), k = Math.max(0, Number(n) || 0);
  const spill = p >= 0.85 ? 2 : p >= 0.7 ? 1 : 0;
  return { stage: Math.min(3, Math.max(Math.floor(Math.max((k - 1) / 2, p * 3.4)), spill ? spill + 1 : 0)), spill };
};
// Antrenman açık mı: asker kahraman açık ve henüz asker değil (numara bilinmiyorsa da açık; kol seçildiyse kapalı).
const trainOn = (p, st) => armyOn(p) && !(st && (armyCorps(st.corps) || st.points >= ARMY_SOLDIER));
// Kahramanın sözü: düşünce cesaret, kombo ve tekmede sevinç (n: kaçıncı sahne; sözler sırayla döner).
// İki dilde yazılır (trEn): bazılarında Türkçe harf yok, İngilizce katmanı onları Türkçe sanmaz.
const TRAIN_FALL_SAYS = [['Hadi bir daha deneyelim!', 'Let\'s try again!'], ['Düştüm ama kalktım!', 'I fell, but I got up!'],
  ['Bir dahakine olacak!', 'I\'ll get it next time!'], ['Hata yapmak öğrenmektir!', 'Mistakes help us learn!']];
function trainSay(move, streak, n = 0) {
  if (move === 'fall') return trEn(...TRAIN_FALL_SAYS[(Math.abs(Math.trunc(n)) || 0) % TRAIN_FALL_SAYS.length]);
  if (streak >= 6) return trEn(`Kombo ×${streak}!`, `Combo ×${streak}!`);
  // 'jabs': söz yok (velinin isteği, 2026-11-17: "Tuttum demesin onun yerine zıplayıp sevinsin").
  if (move === 'hooks') return trEn('Sağ, sol!', 'Left, right!');
  if (move === 'kick') return trEn('Tekme!', 'Kick!');
  if (move === 'mix') return trEn('Yumruk, tekme!', 'Punch and kick!');
  if (move === 'spin') return trEn('Döner tekme!', 'Spinning kick!');
  if (move === 'onetwo') return trEn('Bir-iki!', 'One-two!');
  if (move === 'uppercut') return trEn('Aparkat!', 'Uppercut!');
  if (move === 'knee') return trEn('Diz, diz!', 'Knee, knee!');
  if (move === 'front') return trEn('Ön tekme, yumruk!', 'Front kick, punch!');
  if (move === 'axe') return trEn('Balta tekmesi!', 'Axe kick!');
  if (move === 'back') return trEn('Geri tekme!', 'Back kick!');
  if (move === 'lowkick') return trEn('Alçak tekme!', 'Low kick!');
  if (move === 'double') return trEn('Çift tekme!', 'Double kick!');
  if (move === 'tornado') return trEn('Tornado tekme!', 'Tornado kick!');
  if (move === 'flying') return trEn('Uçan tekme!', 'Flying kick!');
  return '';
}
// Kum ilk dökülmeye başladığında kahramanın sözü.
const trainSandSay = () => trEn('Eyvah, kum dökülüyor!', 'Uh-oh, the sand is spilling!');

/* Antrenman: çizimler (sabit SVG; kullanıcı metni yok) */

// Kum torbası: tavandan zincirle asılı, kırmızı, beyaz şeritli. Oturumda eskir (bagWear): stage 1 sürtük ve çizik, 2 rengi
// solmuş, turuncu yama dikilmiş, 3 gri bantla çarpı yapıştırılmış, dikişi atmış, şeridi kalkmış; spill 1 sağ altta küçük
// yırtık (içinde kum), 2 büyük yırtık.
function trainBag(stage = 0, spill = 0) {
  const s = Math.min(3, Math.max(0, Math.trunc(stage) || 0)), sp = Math.min(2, Math.max(0, Math.trunc(spill) || 0));
  const [body, edge] = [['#E63946', '#B02A35'], ['#E0434F', '#AE2D38'], ['#D24E58', '#A2333D'], ['#C25A62', '#933A42']][s];
  const stripe = ['.9', '.82', '.7', '.58'][s];
  let out = '<svg viewBox="0 0 60 120" aria-hidden="true"><path d="M30 0 V22" stroke="#8A93A3" stroke-width="3" stroke-dasharray="4 3"/>'
    + `<path d="M18 22 H42 L44 30 H16 Z" fill="#5E6672"/><rect x="12" y="30" width="36" height="80" rx="16" fill="${body}" stroke="${edge}" stroke-width="2"/>`
    + `<rect x="12" y="52" width="36" height="7" fill="#fff" opacity="${stripe}"/><rect x="12" y="86" width="36" height="7" fill="#fff" opacity="${stripe}"/>`
    + '<path d="M19 38 Q17 70 20 102" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/>';
  if (s >= 1) {
    out += '<g fill="#6E1A22" opacity=".28"><ellipse cx="27" cy="44" rx="5" ry="3.2"/><ellipse cx="37" cy="73" rx="4.2" ry="3"/><ellipse cx="24" cy="100" rx="4" ry="2.4"/></g>'
      + '<path d="M33 39 l5 3 M30 79 l6 2 M36 98 l4 -2" stroke="#fff" stroke-width="1" opacity=".45" stroke-linecap="round"/>';
  }
  if (s >= 2) {
    out += '<g fill="#6E1A22" opacity=".25"><ellipse cx="39" cy="47" rx="3.4" ry="2.4"/><ellipse cx="20" cy="66" rx="3" ry="4"/></g>'
      + '<g transform="rotate(-8 31 70)"><rect x="25" y="64" width="13" height="12" rx="2" fill="#F4A261" stroke="#C77A3A" stroke-width="1"/>'
      + '<rect x="26.6" y="65.6" width="9.8" height="8.8" rx="1.2" fill="none" stroke="#6B3E14" stroke-width=".8" stroke-dasharray="1.6 1.4"/></g>';
  }
  if (s >= 3) {
    out += '<g transform="rotate(32 30 42)"><rect x="17" y="39" width="26" height="6" rx="1" fill="#B8BEC8"/><path d="M19 41 H41" stroke="#fff" stroke-width=".8" opacity=".6"/></g>'
      + '<g transform="rotate(-32 30 42)"><rect x="17" y="39" width="26" height="6" rx="1" fill="#C9CED6"/><path d="M19 43 H41" stroke="#8A93A3" stroke-width=".7" opacity=".6"/></g>'
      + `<path d="M15 95 l3 2.4 l3 -2.4 l3 2.4" stroke="#4A161B" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M42 86 H48 V93 Z" fill="${body}"/>`;
  }
  if (sp === 1) out += '<path d="M38 100 l2 -3 l2 3 l2 -2 l1 4 l-3 3 l-3 -1 Z" fill="#4A161B"/><circle cx="41.4" cy="101.6" r="1.5" fill="#E3C27A"/>';
  if (sp === 2) {
    out += '<path d="M35 99 l3 -4 l2 3 l3 -4 l2 4 l2 -1 v6 l-4 4 l-5 -1 l-3 -3 Z" fill="#4A161B"/>'
      + '<path d="M37 102 q3 3 7 1" stroke="#E3C27A" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="21" cy="106" r="1.6" fill="#4A161B"/>';
  }
  return out + '</svg>';
}
const TRAIN_BAG = trainBag(0, 0);
// Yerde biriken kum yığını.
const TRAIN_PILE = '<svg viewBox="0 0 46 14" aria-hidden="true"><path d="M1 14 Q10 4 23 2 Q36 4 45 14 Z" fill="#E3C27A"/>'
  + '<path d="M9 12 Q16 6 23 5" stroke="#F6E2AE" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  + '<g fill="#C9A45C"><circle cx="18" cy="10" r=".9"/><circle cx="27" cy="8" r=".9"/><circle cx="33" cy="11" r=".9"/></g></svg>';
// Diz (muay thai): uyluk ve kırmızı dizlik.
const TRAIN_KNEE = '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M3 27 Q14 22 25 11" stroke="#3D5A99" stroke-width="10" stroke-linecap="round" fill="none"/>'
  + '<circle cx="27" cy="10" r="7.5" fill="#E63946" stroke="#B02A35" stroke-width="1.4"/><path d="M23 7 q4 -2.5 7.5 .5" stroke="#fff" stroke-width="1.5" fill="none" opacity=".6" stroke-linecap="round"/></svg>';
// Tornado tekmede kahramanın çevresinde dönen hava.
const TRAIN_SWIRL = '<svg viewBox="0 0 100 60" aria-hidden="true"><ellipse cx="50" cy="34" rx="46" ry="16" stroke="#4FB3E6" stroke-width="4" fill="none" stroke-dasharray="60 30" stroke-linecap="round" opacity=".6"/>'
  + '<ellipse cx="50" cy="30" rx="36" ry="11" stroke="#BDE8FF" stroke-width="3" fill="none" stroke-dasharray="40 26" stroke-linecap="round" opacity=".85"/></svg>';
// Uçan tekmede hız çizgileri.
const TRAIN_SPEED = '<svg viewBox="0 0 44 30" aria-hidden="true"><path d="M2 6 H30 M8 15 H42 M4 24 H28" stroke="#9AA7BF" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></svg>';
// Eski torbadan çıkan toz.
const TRAIN_DUST = '<svg viewBox="0 0 40 30" aria-hidden="true"><g fill="#C9B79A"><circle cx="10" cy="18" r="7" opacity=".5"/><circle cx="22" cy="12" r="9" opacity=".45"/>'
  + '<circle cx="31" cy="20" r="6" opacity=".5"/></g></svg>';
// Boks eldiveni (sağa bakar): yumrukta kahramanın elinden torbaya uzanır.
const TRAIN_GLOVE = '<svg viewBox="0 0 40 30" aria-hidden="true"><rect x="2" y="8" width="10" height="14" rx="3" fill="#fff" stroke="#C9CED6"/>'
  + '<path d="M10 6 Q30 0 37 12 Q40 24 26 27 Q14 28 10 22 Z" fill="#E63946" stroke="#B02A35" stroke-width="1.5"/>'
  + '<path d="M16 8 Q24 6 26 12" stroke="#B02A35" stroke-width="1.4" fill="none"/><circle cx="28" cy="10" r="2.4" fill="#fff" opacity=".5"/></svg>';
// Uzaylı antrenman partneri (sola, kahramana bakar): yeşil, tek gözlü, kafa bandı, kırmızı boks eldivenleri. mood: 'guard'
// (eldivenler önde), 'hit' (gözü fırıldak, eldivenler aşağıda), 'cheer' (eldivenler yukarıda, gülüyor), 'push' (bir eldiven önde).
function trainAlien(mood = 'guard') {
  const G = '#7ED957', GE = '#4CAF50', INK = '#23262B', M = '#2E5E1F', hit = mood === 'hit', cheer = mood === 'cheer', push = mood === 'push';
  const glove = (x, y, s = 1, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><path d="M-8 -6 Q4 -10 8 -2 Q10 7 1 8 Q-6 9 -8 4 Z" fill="#E63946" stroke="#B02A35" stroke-width="1.2"/>`
    + `<rect x="-11" y="-4" width="5" height="9" rx="2" fill="#fff" stroke="#C9CED6" stroke-width=".8"/></g>`;
  const ant = hit ? `<path d="M23 12 Q16 8 13 13 M37 12 Q44 8 47 13" stroke="${GE}" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="13" cy="13.5" r="2.6" fill="#FFE066"/><circle cx="47" cy="13.5" r="2.6" fill="#FFE066"/>`
    : `<path d="M24 12 L19 3 M36 12 L41 3" stroke="${GE}" stroke-width="2" stroke-linecap="round"/><circle cx="19" cy="3" r="2.6" fill="#FFE066"/><circle cx="41" cy="3" r="2.6" fill="#FFE066"/>`;
  const body = `<rect x="18" y="38" width="24" height="30" rx="10" fill="#9B8CFF" stroke="#6E5BD9" stroke-width="1.6"/><rect x="18.8" y="54" width="22.4" height="4" fill="#6E5BD9"/>`
    + `<path d="M22 68 V82 M38 68 V82" stroke="${G}" stroke-width="6" stroke-linecap="round"/><ellipse cx="21" cy="84" rx="6" ry="3" fill="#4C8DF6"/><ellipse cx="39" cy="84" rx="6" ry="3" fill="#4C8DF6"/>`;
  const head = `<circle cx="30" cy="24" r="14" fill="${G}" stroke="${GE}" stroke-width="1.4"/><path d="M16.5 19 Q30 13 43.5 19" stroke="#F25C54" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const eye = hit ? `<circle cx="28" cy="25" r="6.4" fill="#fff"/><path d="M28 25 a1.2 1.2 0 1 1 -1.2 1.2 a2.6 2.6 0 1 1 3 -3 a4 4 0 1 1 -5.4 4.2" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="28" cy="25" r="6.4" fill="#fff"/><circle cx="${cheer ? 28 : 25.6}" cy="${cheer ? 24 : 25.8}" r="3.2" fill="${INK}"/><circle cx="${cheer ? 29.2 : 26.8}" cy="${cheer ? 22.8 : 24.6}" r="1.1" fill="#fff"/>`;
  const cheeks = `<circle cx="19.5" cy="30" r="2" fill="#FF9EB5" opacity=".75"/><circle cx="38.5" cy="30" r="2" fill="#FF9EB5" opacity=".75"/>`;
  const mouth = cheer ? `<path d="M24 31 Q29 38 34 31 Z" fill="${M}"/>` : hit ? `<path d="M23.5 33 q2 -2 4 0 t4 0 t4 0" stroke="${M}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
    : `<path d="M24 32 Q28.5 35 33 31.5" stroke="${M}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  const arms = cheer ? `<path d="M19 42 L9 30 M41 42 L51 30" stroke="#9B8CFF" stroke-width="5" stroke-linecap="round"/>` + glove(8, 26, 1, true) + glove(52, 26, 1)
    : hit ? glove(14, 62, 1, true) + glove(44, 64, 1)
    : push ? glove(10, 44, 1.1, true) + glove(40, 48, 1)
    : glove(14, 44, 1.05, true) + glove(26, 48, 1.05, true);
  return `<svg viewBox="0 0 60 90" aria-hidden="true">${ant}${body}${head}${eye}${cheeks}${mouth}${arms}</svg>`;
}
// Spor ayakkabı (sağa bakar): tekmede kahramanın ayağı.
const TRAIN_BOOT = '<svg viewBox="0 0 44 26" aria-hidden="true"><rect x="1" y="7" width="14" height="10" rx="4" fill="#3D5A99"/>'
  + '<path d="M12 4 H24 Q27 10 38 12 Q43 14 42 20 H12 Z" fill="#fff" stroke="#C9CED6" stroke-width="1.4" stroke-linejoin="round"/>'
  + '<path d="M12 20 H42 V23 H12 Z" fill="#E63946"/><path d="M22 9 L26 13 M26 8 L30 12" stroke="#4C8DF6" stroke-width="1.6" stroke-linecap="round"/></svg>';
// Torbada kalan eldiven izi (çukur).
const TRAIN_MARK = '<svg viewBox="0 0 30 24" aria-hidden="true"><path d="M4 6 Q18 0 26 9 Q29 19 18 21 Q8 22 4 16 Z" fill="#8E1F2B" opacity=".55"/>'
  + '<path d="M8 8 Q17 4 23 10" stroke="#FF8A93" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></svg>';
// Vuruş yıldızı ("POF").
const TRAIN_POW = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1 L24 12 L35 7 L29 17 L39 20 L29 23 L35 33 L24 28 L20 39 L16 28 L5 33 L11 23 L1 20 L11 17 L5 7 L16 12 Z" fill="#FFD23F" stroke="#FF8C1A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
// Döner tekmenin izi.
const TRAIN_SWOOSH = '<svg viewBox="0 0 80 50" aria-hidden="true"><path d="M6 40 Q40 -14 74 22" stroke="#4FB3E6" stroke-width="6" fill="none" stroke-linecap="round" opacity=".55"/>'
  + '<path d="M14 42 Q42 2 70 30" stroke="#BDE8FF" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/></svg>';

/* Antrenman: sahne */

// Antrenman sahnesi: move (trainMove), streak, p (görünüş), level, opts.army (armyView), opts.partner ('bag' ya da 'alien'),
// opts.n (söz sırası), opts.wear (bagWear: torbanın eskiliği ve kum), opts.sand (oturumda kaçıncı kumlu sahne). Kutu döner;
// play() oynatır. Hareket azaltılmışsa durağan. Sahneler 2-4 saniye sürer (velinin isteği, 2026-11-17: "çok hızlı geçti");
// torbada yumruk izleri sahne boyunca kalır, uzaylıda iz yoktur (kimse yaralanmaz). Kombo kendi sporunun salonunda oynar
// (sınıf s-<spor>; köşede sporun adı), iki ve daha çok vuruşta vuruş sayısı görünür. Eski torbada vuruşta toz çıkar; kum
// dökülürken yırtıktan kum akar (torba sallanırken akış gizlenir), vuruşta kum saçılır, yerdeki yığın büyür.
function trainScene(move, streak, p, level, opts = {}) {
  const partner = opts.partner === 'alien' ? 'alien' : 'bag', bag = partner === 'bag';
  const sport = trainSport(move);
  const wear = bag ? { stage: opts.wear?.stage || 0, spill: opts.wear?.spill || 0 } : { stage: 0, spill: 0 };
  const box = h('div', { class: `train train-${partner}${sport ? ` s-${sport}` : ''}`, 'aria-hidden': 'true' });
  const hero = h('div', { class: 'train-hero' });
  hero.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, opts.army);
  const foe = h('div', { class: 'train-foe' });
  const pic = h('div', { class: 'train-pic' });
  foe.append(pic);
  const draw = (mood) => { pic.innerHTML = bag ? trainBag(wear.stage, wear.spill) : trainAlien(mood); };
  draw('guard');
  const fx = h('div', { class: 'train-fx' });
  const bubble = h('span', { class: 'train-say' });
  const chip = sport ? h('span', { class: 'train-sport' }, trainSportName(sport)) : null;
  const counter = h('span', { class: 'train-count' });
  // Kum: yırtıktan akan kum (sızarken seyrek, dökülürken sürekli) ve yerdeki yığın.
  const sand = wear.spill ? h('span', { class: 'train-sand' + (wear.spill > 1 ? ' pour' : '') }, Array.from({ length: wear.spill > 1 ? 6 : 3 }, () => h('i'))) : null;
  const pile = wear.spill ? h('span', { class: 'train-pile' }) : null;
  if (pile) pile.innerHTML = TRAIN_PILE;
  let pileSize = Math.min(1, 0.32 + 0.17 * Math.max(0, (opts.sand || 1) - 1));
  if (pile) pile.style.scale = String(pileSize);
  fill(box, pile, hero, foe, sand, fx, bubble, chip, counter);
  const anim = (el, frames, ms, o = {}) => (el.animate ? el.animate(frames, { duration: ms, easing: o.easing || 'ease-out', fill: 'forwards', delay: o.delay || 0 }).finished.catch(() => {}) : Promise.resolve());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (t, who = 'hero') => { if (!t) return; bubble.textContent = t; bubble.className = `train-say on ${who}`; };
  const line = () => say(trainSay(move, streak, opts.n));
  let reach = 50; // eldivenin ve ayağın partnere kadar gideceği yol (play başında ölçülür)
  let hits = 0;
  // Vuruş yıldızı; at: 'up' (yukarıda), 'low' (aşağıda), 'top' (torbanın tepesinde). Doğru sahnelerde vuruşlar sayılır.
  const pow = (word, at = '') => {
    const el = h('span', { class: 'train-pow' + (at ? ' ' + at : '') }, word ? h('b', {}, word) : null);
    el.insertAdjacentHTML('afterbegin', TRAIN_POW);
    fx.append(el);
    anim(el, [{ scale: '0.3', opacity: 1 }, { scale: '1.15', opacity: 1, offset: 0.4 }, { scale: '1.3', opacity: 0 }], 620).then(() => el.remove());
    if (move === 'fall') return;
    hits++;
    if (hits < 2) return;
    counter.textContent = `×${hits}`;
    anim(counter, [{ scale: '1.6' }, { scale: '1' }], 260);
  };
  // Güçlü vuruşta halka.
  const ring = (at = '') => {
    const el = h('span', { class: 'train-ring' + (at ? ' ' + at : '') });
    fx.append(el);
    anim(el, [{ scale: '0.3', opacity: 0.9 }, { scale: '1.7', opacity: 0 }], 520).then(() => el.remove());
  };
  // Torbada eldiven izi (y: torbanın üstünden yüzde); sahne bitene kadar kalır.
  const mark = (y) => {
    if (!bag) return;
    const m = h('span', { class: 'train-mark' });
    m.style.top = y + '%';
    m.innerHTML = TRAIN_MARK;
    foe.append(m);
    anim(m, [{ opacity: 0, scale: '1.5' }, { opacity: 1, scale: '1' }], 220);
  };
  // Eski torbadan toz; kum dökülürken yırtıktan kum saçılır ve yığın büyür.
  const dust = () => {
    if (!bag || wear.stage < 2) return;
    const d = h('span', { class: 'train-dust' });
    d.innerHTML = TRAIN_DUST;
    fx.append(d);
    anim(d, [{ scale: '0.5', opacity: 0.9, translate: '0 0' }, { scale: '1.3', opacity: 0, translate: '10px -10px' }], 700).then(() => d.remove());
  };
  const spill = (count) => {
    if (!bag || !wear.spill) return;
    for (let i = 0; i < count; i++) {
      const g = h('i', { class: 'train-grain' });
      fx.append(g);
      const dx = 4 + ((i * 7) % 17);
      anim(g, [{ translate: '0 0', opacity: 1 }, { translate: `${Math.round(dx * 0.6)}px ${-3 - (i % 3) * 3}px`, opacity: 1, offset: 0.3 },
        { translate: `${dx}px ${24 + (i % 3) * 2}px`, opacity: 0.8 }], 520 + i * 45, { easing: 'ease-in' }).then(() => g.remove());
    }
    pileSize = Math.min(1.15, pileSize + 0.03 * count);
    setTimeout(() => { if (pile) pile.style.scale = String(pileSize); }, 520);
  };
  // Torba sallanırken yırtıktan akan kum gizlenir (kum torbayla birlikte dönmesin).
  let swings = 0;
  const foeMove = (frames, ms, o) => {
    swings++;
    box.classList.add('swing');
    return anim(foe, frames, ms, o).then(() => { swings = Math.max(0, swings - 1); if (!swings) box.classList.remove('swing'); });
  };
  // Torba sallanır (eksi açı: kahramandan uzağa); uzaylı sendeler, sonra gülümser.
  const rot = (degs, ms, easing = 'ease-in-out') => foeMove(degs.map((d) => ({ rotate: `${d}deg` })), ms, { easing });
  const stumble = async (dx, deg, ms) => {
    draw('hit');
    await anim(foe, [{ translate: '0 0', rotate: '0deg' }, { translate: `${dx}px ${dx > 20 ? -6 : 0}px`, rotate: `${deg}deg`, offset: 0.4 }, { translate: '0 0', rotate: '0deg' }], ms);
    draw('cheer');
  };
  // kind: 'jolt' (hafif), 'big' (güçlü), 'loop' (torba tavanın üstünden tam tur atar; uzaylı takla atar), 'up' (aparkat ve
  // diz: torba havaya kalkar), 'down' (balta tekmesi: torba yukarıdan ezilir), 'low' (alçak tekme: torbanın altı savrulur).
  const hitFoe = (kind = 'jolt', markY = null) => {
    pow(kind === 'jolt' ? (hits % 2 ? trEn('PAT!', 'PAT!') : 'POF!') : kind === 'down' ? trEn('GÜM!', 'BOOM!') : kind === 'low' ? trEn('ŞAK!', 'WHACK!') : 'BAM!',
      kind === 'up' ? 'up' : kind === 'low' ? 'low' : kind === 'down' ? 'top' : '');
    if (kind !== 'jolt') ring(kind === 'low' ? 'low' : kind === 'down' ? 'top' : '');
    if (markY != null) mark(markY);
    if (kind !== 'jolt') dust();
    spill(kind === 'jolt' ? 3 : 6);
    if (!bag) {
      if (kind === 'loop') {
        draw('hit');
        return anim(foe, [{ rotate: '0deg', translate: '0 0' }, { rotate: '180deg', translate: '18px -30px', offset: 0.5 }, { rotate: '360deg', translate: '0 0' }], 1000, { easing: 'ease-in-out' }).then(() => draw('cheer'));
      }
      if (kind === 'up' || kind === 'low') {
        draw('hit');
        return anim(foe, [{ translate: '0 0', rotate: '0deg' }, { translate: '6px -16px', rotate: kind === 'up' ? '-10deg' : '12deg', offset: 0.4 }, { translate: '0 0', rotate: '0deg' }], 760).then(() => draw('cheer'));
      }
      if (kind === 'down') {
        draw('hit');
        return anim(foe, [{ scale: '1 1' }, { scale: '1.14 0.84', offset: 0.3 }, { scale: '0.95 1.05', offset: 0.6 }, { scale: '1 1' }], 760).then(() => draw('cheer'));
      }
      return kind === 'big' ? stumble(18, 14, 900) : stumble(8, 8, 620);
    }
    if (kind === 'loop') return rot([0, -360], 1000).then(() => rot([0, -22, 10, -4, 0], 900));
    if (kind === 'up') return foeMove([{ translate: '0 0', rotate: '0deg' }, { translate: '0 -14px', rotate: '-10deg', offset: 0.35 }, { translate: '0 2px', rotate: '4deg', offset: 0.7 }, { translate: '0 0', rotate: '0deg' }], 820);
    if (kind === 'down') return foeMove([{ scale: '1 1' }, { scale: '1.12 0.9', offset: 0.3 }, { scale: '0.97 1.03', offset: 0.6 }, { scale: '1 1' }], 760);
    if (kind === 'low') return rot([0, -34, 16, -6, 0], 1000, 'ease-out');
    return kind === 'big' ? rot([0, -52, 24, -11, 4, 0], 1400) : rot([0, -15, 7, -3, 0], 700);
  };
  const glove = (high) => {
    const g = h('span', { class: 'train-glove' + (high === 'low' ? ' low' : high ? ' high' : '') });
    g.innerHTML = TRAIN_GLOVE;
    fx.append(g);
    return g;
  };
  const lean = (ms, deg = 5, dx = 10) => anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: `${dx}px 0`, rotate: `${deg}deg`, offset: 0.45 }, { translate: '0 0', rotate: '0deg' }], ms);
  // Düz yumruk: eldiven partnere uzanır; değdiği anda (onHit) partner sarsılır.
  const jab = async (high = false, onHit = null, ms = 460) => {
    const g = glove(high);
    lean(ms);
    if (onHit) setTimeout(onHit, ms * 0.48);
    await anim(g, [{ translate: '0 0', scale: '0.6', opacity: 0.9 }, { translate: `${reach}px 0`, scale: '1', opacity: 1, offset: 0.5 }, { translate: '0 0', scale: '0.6', opacity: 0 }], ms, { easing: 'ease-in-out' });
    g.remove();
  };
  // Kroşe: eldiven yay çizerek gelir (dir 1: üstten, -1: alttan).
  const hook = async (dir = 1, onHit = null, ms = 520) => {
    const g = glove(dir > 0);
    lean(ms, 7 * dir, 8);
    if (onHit) setTimeout(onHit, ms * 0.5);
    await anim(g, [{ translate: '0 0', rotate: `${-40 * dir}deg`, scale: '0.6', opacity: 0.9 }, { translate: `${reach * 0.45}px ${-24 * dir}px`, rotate: `${-10 * dir}deg`, scale: '1', opacity: 1, offset: 0.3 },
      { translate: `${reach}px 0`, rotate: `${25 * dir}deg`, scale: '1.1', opacity: 1, offset: 0.52 }, { translate: '0 0', rotate: '0deg', scale: '0.6', opacity: 0 }], ms, { easing: 'ease-in-out' });
    g.remove();
  };
  // Tekme: kahraman önce gerilir (dizini çeker), geriye yaslanır, ayağı partnere uzanır, bir an orada kalır, sonra toplar.
  // Velinin isteği, 2026-11-17: "Tekmeyi biraz daha güzel atamaz mı, çok hızlı oldu": süre 640'tan 1150 ms'ye, gerilme ve
  // vuruşta duruş eklendi.
  const kick = async (onHit = null, ms = 1150) => {
    const b = h('span', { class: 'train-boot' });
    b.innerHTML = TRAIN_BOOT;
    fx.append(b);
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '-6px 3px', rotate: '-6deg', offset: 0.26 }, { translate: '8px -8px', rotate: '-22deg', offset: 0.5 },
      { translate: '8px -8px', rotate: '-22deg', offset: 0.7 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.5);
    await anim(b, [{ translate: '0 0', rotate: '30deg', scale: '0.5', opacity: 0 }, { translate: '-8px -4px', rotate: '46deg', scale: '0.7', opacity: 1, offset: 0.26 },
      { translate: `${reach}px -10px`, rotate: '-12deg', scale: '1.15', opacity: 1, offset: 0.5 }, { translate: `${reach}px -10px`, rotate: '-12deg', scale: '1.15', opacity: 1, offset: 0.7 },
      { translate: '0 0', rotate: '20deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' });
    b.remove();
  };
  // Döner tekme: kahraman havada tam tur döner, arkasında iz.
  const spinKick = async (onHit = null, ms = 1050) => { // 820'den yavaşlatıldı (velinin isteği, 2026-11-17: tekme çok hızlı)
    if (onHit) setTimeout(onHit, ms * 0.55);
    const sw = h('span', { class: 'train-swoosh' });
    sw.innerHTML = TRAIN_SWOOSH;
    fx.append(sw);
    anim(sw, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1', offset: 0.5 }, { opacity: 0, scale: '1.1' }], ms).then(() => sw.remove());
    // Gövdesinin ortasında döner (2026-11-18: ayaklarının çevresinde dönünce başı bir an yere giriyordu).
    await anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '0 4px', rotate: '0deg', offset: 0.12 }, { translate: '14px -22px', rotate: '200deg', offset: 0.55 }, { translate: '16px -8px', rotate: '330deg', offset: 0.82 }, { translate: '0 0', rotate: '360deg' }]
      .map((f) => ({ ...f, transformOrigin: '50% 50%' })), ms, { easing: 'ease-in-out' });
  };
  // Kombolar için yeni hareketler (2026-11-18). Ayak ve eldiven, öteki hareketlerdeki gibi kahramanın yanından partnere uzanır.
  const boot = (cls = '') => {
    const b = h('span', { class: 'train-boot' + (cls ? ' ' + cls : '') });
    b.innerHTML = TRAIN_BOOT;
    fx.append(b);
    return b;
  };
  // Arka elle güçlü düz yumruk (boks, "iki"): gövde daha çok döner, eldiven büyür.
  const cross = async (onHit = null, ms = 560) => {
    const g = glove(true);
    lean(ms, 10, 18);
    if (onHit) setTimeout(onHit, ms * 0.48);
    await anim(g, [{ translate: '0 0', rotate: '0deg', scale: '0.6', opacity: 0.9 }, { translate: `${reach}px -2px`, rotate: '-6deg', scale: '1.2', opacity: 1, offset: 0.5 },
      { translate: '0 0', rotate: '0deg', scale: '0.6', opacity: 0 }], ms, { easing: 'ease-in-out' });
    g.remove();
  };
  // Aparkat (boks): kahraman çömelir, eldiven aşağıdan yukarı yay çizer.
  const upper = async (onHit = null, ms = 720) => {
    const g = glove('low');
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '2px 6px', rotate: '5deg', offset: 0.3 }, { translate: '10px -12px', rotate: '-6deg', offset: 0.55 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.52);
    await anim(g, [{ translate: '0 6px', rotate: '50deg', scale: '0.6', opacity: 0.9 }, { translate: `${Math.round(reach * 0.6)}px 8px`, rotate: '30deg', scale: '0.9', opacity: 1, offset: 0.3 },
      { translate: `${reach}px -34px`, rotate: '-55deg', scale: '1.15', opacity: 1, offset: 0.52 }, { translate: `${reach}px -34px`, rotate: '-55deg', scale: '1.15', opacity: 1, offset: 0.62 },
      { translate: '0 0', rotate: '0deg', scale: '0.6', opacity: 0 }], ms, { easing: 'ease-in-out' });
    g.remove();
  };
  // Diz (muay thai): kahraman öne atılıp dizini kaldırır.
  const kneeUp = async (onHit = null, ms = 760) => {
    const k = h('span', { class: 'train-knee' });
    k.innerHTML = TRAIN_KNEE;
    fx.append(k);
    const fwd = Math.round(reach * 0.35);
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: `${fwd}px -12px`, rotate: '9deg', offset: 0.45 }, { translate: `${fwd}px -12px`, rotate: '9deg', offset: 0.6 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.45);
    await anim(k, [{ translate: '0 10px', rotate: '20deg', scale: '0.6', opacity: 0 }, { translate: `${reach + 6}px -14px`, rotate: '-8deg', scale: '1.1', opacity: 1, offset: 0.45 },
      { translate: `${reach + 6}px -14px`, rotate: '-8deg', scale: '1.1', opacity: 1, offset: 0.6 }, { translate: '0 10px', rotate: '20deg', scale: '0.6', opacity: 0 }], ms, { easing: 'ease-in-out' });
    k.remove();
  };
  // Ön tekme (karate, mae geri): diz önce göğse çekilir, ayak düz bir çizgide ileri itilir.
  const frontKick = async (onHit = null, ms = 900) => {
    const b = boot();
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '-2px -4px', rotate: '-4deg', offset: 0.3 }, { translate: '4px -2px', rotate: '-12deg', offset: 0.5 },
      { translate: '4px -2px', rotate: '-12deg', offset: 0.66 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.5);
    await anim(b, [{ translate: '0 6px', rotate: '0deg', scale: '0.5', opacity: 0 }, { translate: `${Math.round(reach * 0.25)}px -16px`, rotate: '-30deg', scale: '0.75', opacity: 1, offset: 0.3 },
      { translate: `${reach}px -4px`, rotate: '0deg', scale: '1.1', opacity: 1, offset: 0.5 }, { translate: `${reach}px -4px`, rotate: '0deg', scale: '1.1', opacity: 1, offset: 0.66 },
      { translate: '0 6px', rotate: '0deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' });
    b.remove();
  };
  // Balta tekmesi (taekwondo, naeryo chagi): ayak düz bacakla tepeye kalkar, torbanın üstüne iner.
  const axeKick = async (onHit = null, ms = 1150) => {
    const b = boot();
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '-4px -2px', rotate: '-10deg', offset: 0.3 }, { translate: '-4px -6px', rotate: '-20deg', offset: 0.5 },
      { translate: '8px 2px', rotate: '6deg', offset: 0.66 }, { translate: '8px 2px', rotate: '6deg', offset: 0.76 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.66);
    await anim(b, [{ translate: '0 0', rotate: '20deg', scale: '0.5', opacity: 0 }, { translate: `${Math.round(reach * 0.3)}px -38px`, rotate: '-60deg', scale: '0.85', opacity: 1, offset: 0.3 },
      { translate: `${Math.round(reach * 0.75)}px -66px`, rotate: '-90deg', scale: '1', opacity: 1, offset: 0.5 }, { translate: `${reach}px -30px`, rotate: '50deg', scale: '1.15', opacity: 1, offset: 0.66 },
      { translate: `${reach}px -30px`, rotate: '50deg', scale: '1.15', opacity: 1, offset: 0.76 }, { translate: '0 0', rotate: '20deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' });
    b.remove();
  };
  // Geri tekme (karate, ushiro geri): kahraman arkasını döner, tabanını düz bir çizgide geriye, torbaya iter, yeniden döner.
  const backKick = async (onHit = null, ms = 1150) => {
    const b = boot();
    anim(hero, [{ translate: '0 0', rotate: '0deg', scale: '1 1' }, { translate: '-2px 0', rotate: '0deg', scale: '-1 1', offset: 0.3 }, { translate: '6px -4px', rotate: '14deg', scale: '-1 1', offset: 0.52 },
      { translate: '6px -4px', rotate: '14deg', scale: '-1 1', offset: 0.68 }, { translate: '0 0', rotate: '0deg', scale: '1 1' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.52);
    await anim(b, [{ translate: '0 0', rotate: '-90deg', scale: '0.5', opacity: 0 }, { translate: '0 -4px', rotate: '-90deg', scale: '0.6', opacity: 0, offset: 0.3 },
      { translate: `${reach}px -6px`, rotate: '-80deg', scale: '1.15', opacity: 1, offset: 0.52 }, { translate: `${reach}px -6px`, rotate: '-80deg', scale: '1.15', opacity: 1, offset: 0.68 },
      { translate: '0 0', rotate: '-90deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' });
    b.remove();
  };
  // Alçak tekme (kickboks): ayak yerden torbanın altına süpürür.
  const lowKick = async (onHit = null, ms = 900) => {
    const b = boot('low');
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '-4px 2px', rotate: '-6deg', offset: 0.28 }, { translate: '6px -2px', rotate: '-16deg', offset: 0.5 },
      { translate: '6px -2px', rotate: '-16deg', offset: 0.64 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit) setTimeout(onHit, ms * 0.5);
    await anim(b, [{ translate: '0 0', rotate: '40deg', scale: '0.5', opacity: 0 }, { translate: '-6px -2px', rotate: '30deg', scale: '0.7', opacity: 1, offset: 0.28 },
      { translate: `${reach}px 0`, rotate: '0deg', scale: '1.1', opacity: 1, offset: 0.5 }, { translate: `${reach}px 0`, rotate: '0deg', scale: '1.1', opacity: 1, offset: 0.64 },
      { translate: '0 0', rotate: '20deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' });
    b.remove();
  };
  // Havada çift tekme (taekwondo, dubal dollyo chagi): kahraman zıplar, havadayken iki ayakla art arda vurur.
  const doubleKick = async (onHit1 = null, onHit2 = null, ms = 1200) => {
    const b1 = boot(), b2 = boot();
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '0 4px', rotate: '0deg', offset: 0.1 }, { translate: '6px -20px', rotate: '-12deg', offset: 0.32 },
      { translate: '10px -26px', rotate: '-20deg', offset: 0.62 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
    if (onHit1) setTimeout(onHit1, ms * 0.32);
    if (onHit2) setTimeout(onHit2, ms * 0.62);
    await Promise.all([
      anim(b1, [{ translate: '0 0', rotate: '30deg', scale: '0.5', opacity: 0 }, { translate: `${reach}px -14px`, rotate: '-10deg', scale: '1.1', opacity: 1, offset: 0.32 },
        { translate: '0 -10px', rotate: '20deg', scale: '0.5', opacity: 0, offset: 0.5 }, { translate: '0 -10px', rotate: '20deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' }),
      anim(b2, [{ translate: '0 -10px', rotate: '30deg', scale: '0.5', opacity: 0 }, { translate: '0 -16px', rotate: '30deg', scale: '0.5', opacity: 0, offset: 0.36 },
        { translate: `${reach}px -34px`, rotate: '-16deg', scale: '1.15', opacity: 1, offset: 0.62 }, { translate: `${reach}px -34px`, rotate: '-16deg', scale: '1.15', opacity: 1, offset: 0.72 },
        { translate: '0 0', rotate: '20deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' }),
    ]);
    b1.remove(); b2.remove();
  };
  // Tornado tekme (taekwondo): kahraman yükseğe zıplayıp havada iki tur döner, çevresinde hava döner; dönüşün sonunda ayak torbada.
  const tornadoKick = async (onHit = null, ms = 1400) => {
    const sw = h('span', { class: 'train-swirl' });
    sw.innerHTML = TRAIN_SWIRL;
    fx.append(sw);
    anim(sw, [{ opacity: 0, translate: '0 0', scale: '0.6' }, { opacity: 1, translate: '10px -26px', scale: '1', offset: 0.45 }, { opacity: 0, translate: '14px -12px', scale: '1.1' }], ms).then(() => sw.remove());
    const b = boot();
    if (onHit) setTimeout(onHit, ms * 0.74);
    anim(b, [{ translate: '0 -20px', rotate: '0deg', scale: '0.5', opacity: 0 }, { translate: '10px -26px', rotate: '0deg', scale: '0.6', opacity: 0, offset: 0.62 },
      { translate: `${reach}px -24px`, rotate: '-14deg', scale: '1.2', opacity: 1, offset: 0.74 }, { translate: `${reach}px -24px`, rotate: '-14deg', scale: '1.2', opacity: 1, offset: 0.82 },
      { translate: '0 0', rotate: '0deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' }).then(() => b.remove());
    // Gövdesinin ortasında döner (ayaklarının çevresinde dönünce başı yere giriyordu).
    await anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '0 5px', rotate: '0deg', offset: 0.1 }, { translate: '10px -30px', rotate: '300deg', offset: 0.45 },
      { translate: '16px -22px', rotate: '600deg', offset: 0.74 }, { translate: '0 0', rotate: '720deg' }].map((f) => ({ ...f, transformOrigin: '50% 50%' })), ms, { easing: 'ease-in-out' });
  };
  // Uçan tekme (taekwondo, twimyo yeop chagi): kahraman geri çekilip atılır, havada uçarak yan tekme atar; arkasında hız çizgileri.
  const flyingKick = async (onHit = null, ms = 1400) => {
    const fwd = Math.round(reach * 0.55);
    const sp = h('span', { class: 'train-speed' });
    sp.innerHTML = TRAIN_SPEED;
    fx.append(sp);
    anim(sp, [{ translate: '0 0', opacity: 0 }, { translate: '-12px 0', opacity: 0, offset: 0.22 }, { translate: `${fwd}px -26px`, opacity: 1, offset: 0.55 },
      { translate: `${fwd}px -26px`, opacity: 1, offset: 0.64 }, { translate: '0 0', opacity: 0 }], ms, { easing: 'ease-in-out' }).then(() => sp.remove());
    const b = boot();
    if (onHit) setTimeout(onHit, ms * 0.55);
    anim(b, [{ translate: '0 0', rotate: '0deg', scale: '0.5', opacity: 0 }, { translate: '-12px 0', rotate: '0deg', scale: '0.5', opacity: 0, offset: 0.22 },
      { translate: `${reach}px -30px`, rotate: '-6deg', scale: '1.25', opacity: 1, offset: 0.55 }, { translate: `${reach}px -30px`, rotate: '-6deg', scale: '1.25', opacity: 1, offset: 0.64 },
      { translate: '0 0', rotate: '0deg', scale: '0.5', opacity: 0 }], ms, { easing: 'ease-in-out' }).then(() => b.remove());
    await anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '-12px 0', rotate: '4deg', offset: 0.22 }, { translate: `${fwd}px -26px`, rotate: '-28deg', offset: 0.55 },
      { translate: `${fwd}px -26px`, rotate: '-28deg', offset: 0.64 }, { translate: '0 0', rotate: '0deg' }], ms, { easing: 'ease-in-out' });
  };
  const hop =(times = 2, high = 12) => anim(hero, Array.from({ length: times * 2 + 1 }, (_, i) => ({ rotate: '0deg', translate: `0 ${i % 2 ? -high : 0}px` })), times * 300, { easing: 'ease-in-out' });
  // Son yumrukla torba çok uzağa savrulur; geri gelirken kahraman eliyle tutar. Uzaylı geriye kayar, gülerek döner.
  // Tutunca söz yok; kahraman zıplayıp sevinir (seq.jabs; velinin isteği, 2026-11-17).
  const farAndCatch = async () => {
    pow('BAM!');
    if (!bag) { await stumble(46, 22, 1300); return; }
    dust();
    spill(6);
    await rot([0, -86], 560, 'ease-out');
    await wait(280);
    const g = glove(false);
    anim(g, [{ translate: '0 0', scale: '0.6', opacity: 0.9 }, { translate: `${reach - 6}px 0`, scale: '1.1', opacity: 1 }], 420);
    await rot([-86, 8], 560, 'ease-in');
    await rot([8, -3, 0], 420);
    await wait(250);
    await anim(g, [{ translate: `${reach - 6}px 0`, scale: '1.1', opacity: 1 }, { translate: '0 0', scale: '0.6', opacity: 0 }], 280);
    g.remove();
  };
  // Yanlış: kahraman vurur, torba geri gelip kahramanı devirir; uzaylı hafifçe iter. Kahraman yıldızları sayar, kalkar.
  const fall = async () => {
    if (bag) {
      jab(false, () => { pow('POF!'); spill(3); }, 460);
      await wait(220);
      await rot([0, -46], 480, 'ease-out');
      await rot([-46, 44], 520, 'ease-in');
      pow('HOP!');
      rot([44, -16, 8, -3, 0], 1500);
    } else {
      draw('push');
      anim(foe, [{ translate: '0 0' }, { translate: '-22px 0', offset: 0.5 }, { translate: '0 0' }], 560);
      await wait(260);
    }
    await anim(hero, [{ rotate: '0deg', translate: '0 0' }, { rotate: '-14deg', translate: '-6px -4px', offset: 0.3 }, { rotate: '-82deg', translate: '-12px 6px' }], 520, { easing: 'ease-in' });
    const st = h('span', { class: 'train-stars' });
    st.innerHTML = BATTLE_DIZZY;
    hero.append(st);
    if (!bag) { draw('cheer'); say('Hihi!', 'foe'); }
    await wait(1100);
    st.remove();
    await anim(hero, [{ rotate: '-82deg', translate: '-12px 6px' }, { rotate: '8deg', translate: '0 -8px', offset: 0.7 }, { rotate: '0deg', translate: '0 0' }], 560, { easing: 'ease-out' });
    if (!bag) draw('guard');
  };
  const seq = {
    // 1. doğru: birkaç yumruk, sonuncusunda torba uzaklara gider, kahraman tutar, sonra zıplayıp sevinir.
    jabs: async () => {
      let far;
      await jab(false, () => hitFoe('jolt'));
      await jab(true, () => hitFoe('jolt'));
      await wait(120);
      await jab(false, () => { far = farAndCatch(); }, 520);
      await far;
      await hop(3, 20);
    },
    // 2. doğru: sağdan soldan kroşeler; torbada el izleri kalır.
    hooks: async () => {
      let last;
      line();
      await hook(1, () => hitFoe('jolt', 34));
      await hook(-1, () => hitFoe('jolt', 58));
      await hook(1, () => hitFoe('jolt', 22));
      await hook(-1, () => { last = hitFoe('big', 46); });
      await last;
    },
    // 3. doğru: tekme.
    kick: async () => { let last; line(); await kick(() => { last = hitFoe('big'); }); await last; await hop(1); },
    // 4. doğru: yumruk tekme kombosu.
    mix: async () => {
      let last;
      line();
      await jab(false, () => hitFoe('jolt', 30));
      await jab(true, () => hitFoe('jolt', 50));
      await kick(() => { last = hitFoe('big'); });
      await last;
      await hop(1);
    },
    // 5. doğru: kroşe ve döner tekme; torba tam tur atar.
    spin: async () => { let last; line(); await hook(1, () => hitFoe('jolt', 36)); await spinKick(() => { last = hitFoe('loop'); }); await last; await hop(2); },
    // 6 ve üstü: seri yumruklar, tekme, döner tekme.
    super: async () => {
      let last;
      line();
      for (let i = 0; i < 5; i++) await jab(i % 2 === 1, () => hitFoe('jolt', 22 + i * 9), 260);
      await kick(() => hitFoe('big'), 900);
      await spinKick(() => { last = hitFoe('loop'); });
      await last;
      await hop(3);
    },
    // Kombolar (2026-11-18; TRAIN_TIERS). Bir-iki (boks): düz yumruk ve arka elle güçlü yumruk.
    onetwo: async () => { let last; line(); await jab(false, () => hitFoe('jolt', 40)); await cross(() => { last = hitFoe('big', 30); }); await last; await hop(2, 16); },
    // Aparkat (boks): düz yumruk, sonra aşağıdan yukarı aparkat; torba havaya kalkar.
    uppercut: async () => { let last; line(); await jab(false, () => hitFoe('jolt', 44)); await wait(80); await upper(() => { last = hitFoe('up', 26); }); await last; await hop(2, 16); },
    // Diz (muay thai): iki diz art arda.
    knee: async () => { let last; line(); await kneeUp(() => hitFoe('up', 62)); await wait(120); await kneeUp(() => { last = hitFoe('up', 56); }); await last; await hop(1); },
    // Ön tekme ve ters yumruk (karate, mae geri ve gyaku zuki).
    front: async () => { let last; line(); await frontKick(() => hitFoe('big')); await wait(100); await cross(() => { last = hitFoe('jolt', 36); }); await last; await hop(2); },
    // Düz yumruk ve balta tekmesi (taekwondo): ayak tepeden torbaya iner.
    axe: async () => { let last; line(); await jab(false, () => hitFoe('jolt', 46)); await axeKick(() => { last = hitFoe('down'); }); await last; await hop(1); },
    // Düz yumruk ve geri tekme (karate): kahraman arkasını dönüp tabanıyla vurur.
    back: async () => { let last; line(); await jab(true, () => hitFoe('jolt', 30)); await backKick(() => { last = hitFoe('big'); }); await last; await hop(1); },
    // Bir-iki ve alçak tekme (kickboks): torbanın altı savrulur.
    lowkick: async () => {
      let last;
      line();
      await jab(false, () => hitFoe('jolt', 40));
      await cross(() => hitFoe('jolt', 28));
      await lowKick(() => { last = hitFoe('low'); });
      await last;
      await hop(2);
    },
    // Havada çift tekme (taekwondo).
    double: async () => { let last; line(); await doubleKick(() => hitFoe('jolt', 56), () => { last = hitFoe('big'); }); await last; await hop(1); },
    // Düz yumruk ve tornado tekme (taekwondo); torba tam tur atar.
    tornado: async () => { let last; line(); await jab(false, () => hitFoe('jolt', 40)); await tornadoKick(() => { last = hitFoe('loop'); }); await last; await hop(2); },
    // İki yumruk ve uçan tekme (taekwondo); torba tam tur atar.
    flying: async () => {
      let last;
      line();
      await jab(false, () => hitFoe('jolt', 44));
      await jab(true, () => hitFoe('jolt', 30));
      await flyingKick(() => { last = hitFoe('loop'); });
      await last;
      await hop(3);
    },
  };
  let busy = false;
  box.play = async () => {
    if (busy || reduceMotion() || !box.isConnected) { if (move === 'fall') line(); return; }
    busy = true;
    bubble.className = 'train-say';
    reach = Math.max(24, foe.offsetLeft - hero.offsetLeft - 82);
    if (move === 'fall') { await fall(); line(); }
    else {
      await (seq[move] || seq.jabs)();
      // Kum ilk kez döküldüğü sahnenin sonunda kahraman şaşırır.
      if (wear.spill && opts.sand === 1) say(trainSandSay());
      await wait(300);
    }
    busy = false;
  };
  return box;
}

// Oturumdaki cevabın altındaki antrenman yeri: ss oturum (üst üste doğru sayısı ss.streak, düşüş sırası ss.falls), correct.
// Numara ve kahramanın seviyesi oturumda bir kez okunur; asker kahraman kapalıysa, çocuk asker olduysa, numara okunamazsa ya
// da hareket azaltılmışsa yer boş kalır. Hiçbir şey yazmaz.
function trainSlot(ss, correct) {
  const slot = h('div', { class: 'train-slot' });
  const p = state.student;
  if (!p || !armyOpen(p) || reduceMotion()) return slot;
  // Balerinde kahramanın seviyesi gerekmez (çizimi seviyesiz); kum torbasında okunur.
  const ballet = trainStyle(p) === 'balerin';
  ss.train ??= Promise.all([loadArmy(p), ballet ? 1 : armyHeroLevel(p)]).catch(() => [null, 1]);
  const streak = ss.streak || 0, n = correct ? 0 : Math.max(0, (ss.falls || 1) - 1);
  // Kombo sırası: oturumda her basamak kendi sırasıyla döner, başlangıcı her oturumda değişir (2026-11-18).
  ss.trainSeed ??= Math.floor(Math.random() * 24);
  ss.trainSeen ??= {};
  const tier = trainTier(streak);
  const k = correct ? ss.trainSeed + (ss.trainSeen[tier] = (ss.trainSeen[tier] ?? -1) + 1) : 0;
  // Torbanın eskimesi: oturumdaki sahne sayısı ve oturumun ne kadarının bittiği; kumlu sahneler sayılır (yığın büyür).
  ss.bagN = (ss.bagN || 0) + 1;
  const wear = bagWear(ss.bagN, ss.entries?.length ? (ss.index + 1) / ss.entries.length : 0);
  if (wear.spill) ss.sandN = (ss.sandN || 0) + 1;
  const sand = ss.sandN || 0;
  ss.train.then(([st, level]) => {
    if (!st || !trainOn(p, st) || !slot.isConnected) return;
    const alien = st.points >= TRAIN_ALIEN_AT;
    const sc = ballet ? balletScene(balletMove(correct, streak), streak, p, { partner: alien ? 'alien' : 'solo', n })
      : trainScene(trainMove(correct, streak, k), streak, p, level, { partner: alien ? 'alien' : 'bag', army: armyView(p, st), n, wear, sand });
    fill(slot, sc);
    sc.play();
  }).catch(() => {});
  return slot;
}

/* Bale (velinin isteği, 2026-11-18: "kızlar için de yapabilir miyiz? sevimli küçük bir balerin kız güzel bir şekilde
   dönecek, balerinlerin yaptığı koreografileri yapacak; aynı mantıkla 70'ten sonra uzaylı ile dans; uzaylı hareketi yapar,
   biz yön tuşlarıyla taklit ederiz, doğru basarsak bizim balerin hareketi bitirir ve selam verir"). Kum torbasının yerine
   balerin: kahramanı kız olan çocukta varsayılan, veli her çocuk için değiştirebilir (profiles.train_style). Cevaptan sonra
   doğruda piruet, 3 doğru üst üste büyük sıçrama, 5 ve üstü koreografi; yanlışta sendeleyip pıt diye oturur, kalkar,
   "Hadi bir daha deneyelim!". 70 numaradan sonra eteklikli sevimli uzaylı dans partneri; oturum sonunda uzaylıyla dans
   oyunu (uzaylı gösterir, çocuk yön tuşlarıyla ya da ekrandaki oklarla aynı sırayla tekrarlar). Hiçbir şey yazmaz. */

/* Bale: saf kısım */

// Antrenmanın türü: veli seçtiyse o ('torba' ya da 'balerin'), seçmediyse kahramanı kız olan çocukta balerin.
const trainStyle = (p) => (p?.train_style === 'balerin' || p?.train_style === 'torba' ? p.train_style : p?.avatar === 'kiz' ? 'balerin' : 'torba');
// Bale hareketi: doğruda piruet, 3 doğru üst üste büyük sıçrama, 5 ve üstü koreografi; yanlışta sendeleyip oturma.
const balletMove = (correct, streak) => (!correct ? 'fall' : streak >= 5 ? 'combo' : streak >= 3 ? 'leap' : 'spin');
function balletSay(move, streak, n = 0) {
  if (move === 'fall') return trainSay('fall', 0, n);
  if (move === 'combo') return trEn(`Muhteşem ×${streak}!`, `Bravo ×${streak}!`);
  if (move === 'leap') return trEn('Büyük sıçrama!', 'Grand jeté!');
  return '';
}

/* Bale: çizimler (sabit SVG; kullanıcı metni yok) */

// Balerinin duruşları. Açılar derece: 0 aşağı, 90 sağa (izleyicinin sağı), -90 sola, ±180 yukarı. la/ra: sol ve sağ kol
// [üst kol, ön kol]; ll/rl: sol ve sağ bacak [uyluk, baldır]; lift: gövdenin dikey kayması (eksi yukarı); tilt: eğilme;
// toe: parmak ucunda (relevé); face: 'smile' | 'happy' (gözler kapalı gülüş) | 'oops' (şaşkın "o").
const BALLET_POSES = {
  stand: { la: [-22, 34], ra: [22, -34], ll: [-2, -2], rl: [2, 2] },
  up: { la: [-142, 165], ra: [142, -165], ll: [-1, -1], rl: [1, 1], lift: -3, toe: true },
  passe: { la: [-142, 165], ra: [142, -165], ll: [0, 0], rl: [72, -78], lift: -3, toe: true },
  arabesque: { la: [-102, -112], ra: [100, 112], ll: [4, 4], rl: [96, 96], tilt: -8, toe: true, face: 'happy' },
  leap: { la: [-128, -142], ra: [128, 142], ll: [-82, -98], rl: [82, 98], lift: -16, face: 'happy' },
  bow: { la: [-52, -24], ra: [52, 24], ll: [-6, -2], rl: [-16, 26], lift: 3, tilt: 4, head: 9, face: 'happy' },
  wobble: { la: [-150, -118], ra: [128, 172], ll: [-6, -6], rl: [38, 8], tilt: 15, face: 'oops' },
  sit: { la: [-38, -12], ra: [38, 12], ll: [-80, -96], rl: [80, 96], lift: 30, face: 'oops' },
};
// Küçük balerin: kahramanın ten, saç ve göz rengi, gözlüğü ve çilleri; saç topuz, pembe mayo ve tütü, parmak ucu
// ayakkabıları. look: profiles.hero_look; pose: BALLET_POSES anahtarı. Hep sevimli: yuvarlak yüz, pembe yanak, gülüş.
function ballerinaSvg(look, pose = 'stand') {
  const P = BALLET_POSES[pose] || BALLET_POSES.stand;
  const lk = look && typeof look === 'object' ? look : {};
  const skin = HERO_LOOK.ten[lk.ten] || '#F5CBA7', hair = HERO_LOOK.sac[lk.sac] || '#6B3E26', eye = HERO_LOOK.goz[lk.goz] || HERO_LOOK.goz[0];
  const PINK = '#FF8FB8', PINKD = '#E0628F', TIGHT = '#FFD6E5', TUTU = '#FFC4DC';
  const lift = P.lift || 0, rad = (a) => (a * Math.PI) / 180, r1 = (v) => Math.round(v * 10) / 10;
  const limb = ([x, y], [a1, a2], l1, l2) => {
    const e = [x + l1 * Math.sin(rad(a1)), y + l1 * Math.cos(rad(a1))];
    return [e, [e[0] + l2 * Math.sin(rad(a2)), e[1] + l2 * Math.cos(rad(a2))]];
  };
  const line = (a, b, w, c) => `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const s = [`<ellipse cx="50" cy="123" rx="${pose === 'leap' ? 16 : 22}" ry="3.6" fill="rgba(0,0,0,.12)"/>`];
  const g = [];
  // Bacaklar (tütünün altında): uyluk, baldır, parmak ucu ayakkabısı ve kurdelesi
  for (const [hx, ang] of [[46.5, P.ll], [53.5, P.rl]]) {
    const hip = [hx, 66 + lift], [knee, foot] = limb(hip, ang, 22, 22);
    g.push(line(hip, knee, 7, TIGHT), line(knee, foot, 6, TIGHT));
    const dir = rad(ang[1]), fx = foot[0] + 3.2 * Math.sin(dir), fy = foot[1] + 3.2 * Math.cos(dir);
    g.push(`<ellipse cx="${r1(fx)}" cy="${r1(fy)}" rx="3.4" ry="${P.toe || pose === 'leap' ? 5 : 4.2}" transform="rotate(${r1(-ang[1])} ${r1(fx)} ${r1(fy)})" fill="${PINK}" stroke="${PINKD}" stroke-width=".8"/>`);
    g.push(`<path d="M${r1(foot[0] - 3)} ${r1(foot[1] - 4)} l3 2 l3 -2" stroke="${PINKD}" stroke-width=".9" fill="none"/>`);
  }
  // Gövde: mayo, kalp, tütü (üç kat, dalgalı kenar)
  g.push(`<path d="M41.5 ${46 + lift} Q50 ${43 + lift} 58.5 ${46 + lift} L56.5 ${64 + lift} L43.5 ${64 + lift} Z" fill="${PINK}" stroke="${PINKD}" stroke-width="1"/>`);
  g.push(`<path d="M50 ${55.6 + lift} c-1.4 -1.6 -3.6 -.6 -2.9 1.1 c.4 1 2.9 2.6 2.9 2.6 s2.5 -1.6 2.9 -2.6 c.7 -1.7 -1.5 -2.7 -2.9 -1.1 Z" fill="#fff" opacity=".85"/>`);
  const tw = pose === 'sit' ? 27 : 24;
  g.push(`<ellipse cx="50" cy="${66 + lift}" rx="${tw}" ry="6.5" fill="${TUTU}" opacity=".95"/>`);
  g.push(`<path d="M${50 - tw} ${66 + lift} ${Array.from({ length: 8 }, (_, i) => `q${tw / 8} ${i % 2 ? -4 : 4} ${tw / 4} 0`).join(' ')}" fill="${TUTU}" stroke="#F7A1C4" stroke-width=".9"/>`);
  g.push(`<ellipse cx="50" cy="${63.5 + lift}" rx="${tw - 6}" ry="4" fill="#FFE3EF"/>`);
  // Kollar (omuzdan): ten rengi, küçük eller
  for (const [sx, ang] of [[42, P.la], [58, P.ra]]) {
    const sh = [sx, 47 + lift], [el, hand] = limb(sh, ang, 15, 14);
    g.push(line(sh, el, 5, skin), line(el, hand, 4.5, skin), `<circle cx="${r1(hand[0])}" cy="${r1(hand[1])}" r="2.7" fill="${skin}"/>`);
  }
  g.push(`<path d="M41 ${45.5 + lift} Q42 ${43 + lift} 45 ${43.4 + lift} M59 ${45.5 + lift} Q58 ${43 + lift} 55 ${43.4 + lift}" stroke="${PINKD}" stroke-width="1.2" fill="none"/>`);
  // Baş: boyun, topuz (saç rengi, pembe kurdele), yüz, saçın önü, yüz çizgileri, gözlük
  const hy = 27 + lift, h = [];
  h.push(`<rect x="47" y="${hy + 9}" width="6" height="7" rx="2.5" fill="${darken(skin, 0.9)}"/>`);
  h.push(`<circle cx="50" cy="${hy - 14}" r="6.4" fill="${hair}"/><path d="M45.6 ${hy - 9.6} Q50 ${hy - 7.4} 54.4 ${hy - 9.6}" stroke="${PINK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  h.push(`<circle cx="50" cy="${hy}" r="12.6" fill="${skin}"/>`);
  h.push(`<path d="M37.6 ${hy + 1} C36 ${hy - 13} 46 ${hy - 15.4} 50.5 ${hy - 13.2} C57 ${hy - 15} 65 ${hy - 11} 62.4 ${hy + 1} C61 ${hy - 6} 57 ${hy - 8.6} 51 ${hy - 8.4} C45 ${hy - 8.2} 40 ${hy - 6} 37.6 ${hy + 1} Z" fill="${hair}"/>`);
  for (const x of [45, 55]) {
    if (P.face === 'happy') h.push(`<path d="M${x - 2.4} ${hy + 1.6} q2.4 -2.6 4.8 0" stroke="#2D2A32" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
    else h.push(`<ellipse cx="${x}" cy="${hy + 1.2}" rx="2.1" ry="2.6" fill="${eye}"/><circle cx="${x + 0.8}" cy="${hy + 0.2}" r=".9" fill="#fff"/>`);
  }
  for (const x of [41.6, 58.4]) h.push(`<circle cx="${x}" cy="${hy + 5.4}" r="2.6" fill="#F79E9E" opacity=".6"/>`);
  if (lk.cil) for (const [x, y] of [[41, 3.2], [43, 4.6], [40.6, 5.6], [59, 3.2], [57, 4.6], [59.4, 5.6]]) h.push(`<circle cx="${x}" cy="${hy + y}" r=".55" fill="${darken(skin, 0.62)}"/>`);
  if (P.face === 'oops') h.push(`<ellipse cx="50" cy="${hy + 7}" rx="1.8" ry="2.2" fill="#9A4A3C"/>`);
  else h.push(`<path d="M46 ${hy + 5.8} Q50 ${hy + (P.face === 'happy' ? 10.4 : 9.2)} 54 ${hy + 5.8}" stroke="#9A4A3C" stroke-width="1.6" fill="${P.face === 'happy' ? '#C9656B' : 'none'}" stroke-linecap="round"/>`);
  if (lk.gozluk === 'yuvarlak' || lk.gozluk === 'koseli') {
    const lens = (x) => (lk.gozluk === 'yuvarlak' ? `<circle cx="${x}" cy="${hy + 1.2}" r="3.9"` : `<rect x="${x - 4.2}" y="${hy - 2.2}" width="8.4" height="6.8" rx="1.8"`) + ' fill="rgba(255,255,255,.18)" stroke="#2D2A32" stroke-width="1.1"/>';
    h.push(lens(45) + lens(55) + `<path d="M48.9 ${hy + 0.8} Q50 ${hy - 0.4} 51.1 ${hy + 0.8}" stroke="#2D2A32" stroke-width="1.1" fill="none"/>`);
  }
  const head = P.head ? `<g transform="rotate(${P.head} 50 ${hy + 10})">${h.join('')}</g>` : h.join('');
  const body = g.join('') + head;
  s.push(P.tilt ? `<g transform="rotate(${P.tilt} 50 ${100 + lift})">${body}</g>` : body);
  return `<svg viewBox="0 -12 100 142" aria-hidden="true">${s.join('')}</svg>`;
}
// Uzaylı dans partneri: kum torbası uzaylısının kardeşi, eldiven yerine eller, mor tütü ve pembe papyon. mood: 'idle',
// 'left' / 'right' (o yana döner), 'up' (zıplar, kollar yukarıda), 'bow' (reverans), 'clap' (alkış), 'giggle' (kıkırdar),
// 'help' (el uzatır).
function danceAlien(mood = 'idle') {
  const G = '#7ED957', GE = '#4CAF50', INK = '#23262B', M = '#2E5E1F', happy = ['clap', 'bow', 'giggle'].includes(mood);
  const A = { idle: [[-35, -10], [35, 10]], left: [[-95, -110], [-40, -95]], right: [[40, 95], [95, 110]], up: [[-155, -170], [155, 170]],
    bow: [[-55, -30], [55, 30]], clap: [[-40, 60], [40, -60]], giggle: [[-30, -10], [25, -160]], help: [[-35, -10], [-70, -80]] }[mood] || [[-35, -10], [35, 10]];
  const rad = (a) => (a * Math.PI) / 180, r1 = (v) => Math.round(v * 10) / 10;
  const arm = (sx, [a1, a2]) => {
    const e = [sx + 11 * Math.sin(rad(a1)), 44 + 11 * Math.cos(rad(a1))], hd = [e[0] + 10 * Math.sin(rad(a2)), e[1] + 10 * Math.cos(rad(a2))];
    return `<path d="M${sx} 44 L${r1(e[0])} ${r1(e[1])} L${r1(hd[0])} ${r1(hd[1])}" stroke="${G}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${r1(hd[0])}" cy="${r1(hd[1])}" r="3" fill="${G}"/>`;
  };
  const tilt = mood === 'left' ? -10 : mood === 'right' ? 10 : mood === 'bow' ? 9 : 0;
  const s = [`<ellipse cx="30" cy="87" rx="16" ry="2.6" fill="rgba(0,0,0,.12)"/>`];
  const b = [];
  b.push(`<path d="M24 66 V80 M36 66 V80" stroke="${G}" stroke-width="5.5" stroke-linecap="round"/><ellipse cx="23" cy="82" rx="5" ry="2.6" fill="#B79CFF"/><ellipse cx="37" cy="82" rx="5" ry="2.6" fill="#B79CFF"/>`);
  b.push(`<rect x="19" y="38" width="22" height="28" rx="10" fill="#9B8CFF" stroke="#6E5BD9" stroke-width="1.5"/>`);
  b.push(`<ellipse cx="30" cy="62" rx="17" ry="4.6" fill="#C9B8FF" opacity=".95"/><path d="M13 62 q2.1 3.4 4.25 0 t4.25 0 t4.25 0 t4.25 0 t4.25 0 t4.25 0 t4.25 0 t4.25 0" fill="#C9B8FF" stroke="#A88FF2" stroke-width=".8"/>`);
  b.push(arm(20, A[0]), arm(40, A[1]));
  b.push(`<path d="M25 39 L30 42 L25 45 Z M35 39 L30 42 L35 45 Z" fill="#FF6FA8"/><circle cx="30" cy="42" r="1.6" fill="#E84D8A"/>`);
  b.push(`<path d="M24 13 L19 4 M36 13 L41 4" stroke="${GE}" stroke-width="2" stroke-linecap="round"/><circle cx="19" cy="4" r="2.6" fill="#FFE066"/><circle cx="41" cy="4" r="2.6" fill="#FFE066"/>`);
  b.push(`<circle cx="30" cy="25" r="14" fill="${G}" stroke="${GE}" stroke-width="1.4"/>`);
  b.push(happy ? `<path d="M23.5 25.5 q4.5 -5 9 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`
    : `<circle cx="28" cy="25" r="6.2" fill="#fff"/><circle cx="${mood === 'left' ? 25.6 : mood === 'right' ? 30.4 : 28}" cy="${mood === 'up' ? 23.6 : 25.4}" r="3.1" fill="${INK}"/><circle cx="${mood === 'left' ? 26.8 : mood === 'right' ? 31.6 : 29.2}" cy="${mood === 'up' ? 22.4 : 24.2}" r="1.1" fill="#fff"/>`);
  b.push(`<circle cx="19.5" cy="31" r="2" fill="#FF9EB5" opacity=".75"/><circle cx="38.5" cy="31" r="2" fill="#FF9EB5" opacity=".75"/>`);
  b.push(happy || mood === 'up' ? `<path d="M24 31.5 Q29 38.5 34 31.5 Z" fill="${M}"/>` : `<path d="M24 32.5 Q28.5 35.5 33 32" stroke="${M}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  s.push(tilt ? `<g transform="rotate(${tilt} 30 82)">${b.join('')}</g>` : b.join(''));
  return `<svg viewBox="0 0 60 90" aria-hidden="true">${s.join('')}</svg>`;
}
// Bale barı (yalnızken sahnenin sağında): iki ayak, ahşap tutamak.
const BALLET_BARRE = '<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M14 22 V68 M106 22 V68" stroke="#9AA3B2" stroke-width="4" stroke-linecap="round"/>'
  + '<path d="M6 68 H22 M98 68 H114" stroke="#9AA3B2" stroke-width="4" stroke-linecap="round"/><rect x="4" y="17" width="112" height="8" rx="4" fill="#D49A6A" stroke="#B37A4C" stroke-width="1.2"/>'
  + '<path d="M10 19.5 H110" stroke="#fff" stroke-width="1.4" opacity=".35" stroke-linecap="round"/></svg>';
// Piruetin pırıltısı.
const BALLET_SPARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 L12.2 7.8 L20 10 L12.2 12.2 L10 20 L7.8 12.2 L0 10 L7.8 7.8 Z" fill="#FFD23F" stroke="#FF9EC4" stroke-width=".8" stroke-linejoin="round"/></svg>';

/* Bale: dans oyunu, saf kısım */

const DANCE_MOVES = ['left', 'up', 'down', 'right'];
const DANCE_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const DANCE_ARROW = { left: '←', right: '→', up: '↑', down: '↓' };
// Kaç tur ve her turda kaç hareket: her 3 doğru bir tur (en çok 5); ilk tur 3 hareket (3. sınıfa kadar 2), her turda bir
// fazla, en çok 6. Her turda 3 deneme hakkı.
function danceSetup(correct, grade) {
  const rounds = Math.min(5, Math.ceil(Math.max(0, Math.floor(+correct || 0)) / 3));
  const first = (grade || 8) <= 3 ? 2 : 3;
  return { rounds, lens: Array.from({ length: rounds }, (_, i) => Math.min(6, first + i)), tries: 3 };
}
// Uzaylının dansı: len hareket, aynı hareket üst üste en çok iki kez. rnd: 0–1 arası sayı veren işlev (denemede sabit).
function danceSeq(len, rnd = Math.random) {
  const out = [];
  for (let i = 0; i < Math.min(12, Math.max(0, len | 0)); i++) {
    let k = Math.floor(Math.min(0.999, Math.max(0, +rnd() || 0)) * 4);
    if (i >= 2 && out[i - 1] === DANCE_MOVES[k] && out[i - 2] === DANCE_MOVES[k]) k = (k + 1) % 4;
    out.push(DANCE_MOVES[k]);
  }
  return out;
}
// Çocuğun bastıkları: 'wrong' (bir tuş yanlış), 'done' (hepsi doğru), 'next' (doğru, devam).
const danceJudge = (seq, input) => (input.some((m, i) => m !== seq[i]) ? 'wrong' : input.length >= seq.length ? 'done' : 'next');
// Oyunun son sözü.
function danceSay(won, rounds, skipped = false) {
  if (skipped) return 'Dansı atladın.';
  if (won >= rounds) return 'Hepsini yaptın! Muhteşem bir dans! 🩰';
  return `Dans bitti! ${rounds} turun ${won} tanesini yaptın. 🩰`;
}

/* Bale: sahne */

// Bale sahnesi (cevaptan sonra, kum torbasının yerine): move ('spin' | 'leap' | 'combo' | 'fall'), streak, p (görünüş),
// opts.partner ('solo' ya da 'alien'), opts.n (söz sırası). Kutu döner; play() oynatır. Sıra zamanlayıcıyla yürür:
// animasyon görünmese de (gizli sekme) sahne sonuna varır. Hareket azaltılmışsa durağan.
function balletScene(move, streak, p, opts = {}) {
  const alien = opts.partner === 'alien';
  const box = h('div', { class: 'train train-ballet' + (alien ? ' train-alien' : ''), 'aria-hidden': 'true' });
  const hero = h('div', { class: 'ballet-hero' }), foe = h('div', { class: alien ? 'train-foe' : 'ballet-barre' });
  const fx = h('div', { class: 'train-fx' }), bubble = h('span', { class: 'train-say' });
  fill(box, hero, foe, fx, bubble);
  const ctl = balletKit({ hero, foe, fx, bubble, look: p?.hero_look, alien });
  ctl.pose('stand');
  if (alien) ctl.mood('idle'); else foe.innerHTML = BALLET_BARRE;
  let busy = false;
  box.play = async () => {
    if (busy || reduceMotion() || !box.isConnected) { if (move === 'fall') ctl.say(balletSay(move, streak, opts.n)); return; }
    busy = true;
    bubble.className = 'train-say';
    if (move === 'spin') { await ctl.dance('right', 740); if (alien) ctl.mood('clap'); }
    else if (move === 'leap') { ctl.say(balletSay(move, streak, opts.n)); await ctl.dance('up', 640); if (alien) ctl.mood('clap'); }
    else if (move === 'combo') {
      ctl.say(balletSay(move, streak, opts.n));
      await ctl.dance('right', 640);
      await ctl.dance('up', 600);
      ctl.pose('arabesque'); ctl.sparkle(3); if (alien) ctl.mood('right');
      await ctl.wait(520);
      ctl.pose('bow'); if (alien) ctl.mood('bow');
      await ctl.wait(620);
      ctl.pose('stand'); if (alien) ctl.mood('clap');
    } else { await ctl.fall(); ctl.say(balletSay(move, streak, opts.n)); }
    busy = false;
  };
  return box;
}
// Sahnenin ortak hareketleri (cevap sahnesi ve dans oyunu): pose, mood, say, sparkle, dance(m, ms) (balerin; m 'left' |
// 'right' piruet, 'up' büyük sıçrama, 'down' reverans), alienDance(m, ms), fall(). speed: bekleme çarpanı (deneme için).
function balletKit({ hero, foe, fx, bubble, look, alien, speed = 1 }) {
  const still = () => reduceMotion();
  const anim = (el, frames, ms, easing = 'ease-in-out') => { if (!still() && el.animate) try { el.animate(frames, { duration: ms * speed, easing }); } catch (e) { /* eski tarayıcı */ } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));
  const pose = (k) => { hero.innerHTML = ballerinaSvg(look, k); };
  const mood = (m) => { if (alien) foe.innerHTML = danceAlien(m); };
  const say = (t, who = 'hero') => { if (!t) return; bubble.textContent = t; bubble.className = `train-say on ${who}`; };
  const sparkle = (n = 3) => {
    if (still()) return;
    for (let i = 0; i < n; i++) {
      const el = h('span', { class: 'ballet-spark', style: `left: ${6 + Math.round(Math.random() * 34)}%; top: ${8 + Math.round(Math.random() * 50)}%` });
      el.innerHTML = BALLET_SPARK;
      fx.append(el);
      anim(el, [{ scale: '0.2', opacity: 0 }, { scale: '1', opacity: 1, offset: 0.4 }, { scale: '0.6', opacity: 0 }], 700, 'ease-out');
      setTimeout(() => el.remove(), 720 * speed);
    }
  };
  let token = 0;
  const dance = async (m, ms = 600) => {
    const my = ++token;
    if (m === 'up') {
      pose('leap');
      anim(hero, [{ translate: '0 0' }, { translate: '14px -24px', offset: 0.5 }, { translate: '0 0' }], ms, 'ease-out');
      sparkle(4);
    } else if (m === 'down') {
      pose('bow');
      anim(hero, [{ translate: '0 0' }, { translate: '0 4px', offset: 0.5 }, { translate: '0 0' }], ms);
    } else {
      const d = m === 'left' ? -1 : 1;
      pose('passe');
      anim(hero, [{ scale: '1 1', translate: '0 0' }, { scale: '-1 1', translate: `${d * 5}px -4px`, offset: 0.25 }, { scale: '1 1', translate: `${d * 9}px -4px`, offset: 0.5 },
        { scale: '-1 1', translate: `${d * 5}px -4px`, offset: 0.75 }, { scale: '1 1', translate: '0 0' }], ms);
      sparkle(3);
    }
    if (alien) alienDance(m, ms);
    await wait(ms);
    if (my === token) pose('stand');
  };
  const alienDance = async (m, ms = 600) => {
    mood(m === 'down' ? 'bow' : m);
    if (m === 'up') anim(foe, [{ translate: '0 0' }, { translate: '0 -20px', offset: 0.5 }, { translate: '0 0' }], ms, 'ease-out');
    else if (m === 'left' || m === 'right') anim(foe, [{ scale: '1 1', translate: '0 0' }, { scale: '-1 1', translate: `${m === 'left' ? -6 : 6}px 0`, offset: 0.5 }, { scale: '1 1', translate: '0 0' }], ms);
    await wait(ms);
  };
  const fall = async () => {
    token++;
    pose('wobble');
    anim(hero, [{ rotate: '0deg' }, { rotate: '8deg', offset: 0.3 }, { rotate: '-6deg', offset: 0.65 }, { rotate: '0deg' }], 420);
    await wait(440);
    pose('sit');
    anim(hero, [{ translate: '0 -8px' }, { translate: '0 2px', offset: 0.6 }, { translate: '0 0' }], 260, 'ease-in');
    const st = h('span', { class: 'train-stars ballet-stars' });
    st.innerHTML = BATTLE_DIZZY;
    hero.append(st);
    if (alien) { mood('giggle'); say('Hihi!', 'foe'); }
    await wait(720);
    if (alien) { mood('help'); await wait(320); }
    pose('stand');
    anim(hero, [{ translate: '0 10px' }, { translate: '0 -4px', offset: 0.6 }, { translate: '0 0' }], 360, 'ease-out');
    await wait(380);
    if (alien) mood('clap');
  };
  return { pose, mood, say, sparkle, dance, alienDance, fall, wait, anim };
}

/* Bale: dans oyunu */

// Uzaylıyla dans (oturum sonunda, balerin çocukta 70 numaradan sonra): uzaylı bir dans gösterir (oklar sırayla yanar),
// sonra çocuk aynı sırayla yön tuşlarına ya da ekrandaki oklara basar. Her doğru tuşta balerin o hareketi yapar; hepsi
// doğruysa dansın tamamını baştan sona yapar ve reverans eder, uzaylı alkışlar. Yanlışta sendeler, "Hadi bir daha
// deneyelim!", uzaylı yeniden gösterir (turda 3 hak). cfg: danceSetup; opts.speed (bekleme çarpanı), opts.rnd (deneme için).
// Hiçbir şey yazmaz. start(), skip(), press(m) ve durum için peekState().
function danceGame(cfg, p, opts = {}) {
  const wrap = h('div', { class: 'stack dance-wrap', style: 'gap: 8px' });
  const stage = h('div', { class: 'train train-ballet train-alien dance-stage' });
  const hero = h('div', { class: 'ballet-hero' }), foe = h('div', { class: 'train-foe' });
  const fx = h('div', { class: 'train-fx' }), bubble = h('span', { class: 'train-say' }), slots = h('div', { class: 'dance-slots' });
  fill(stage, hero, foe, fx, bubble, slots);
  const ctl = balletKit({ hero, foe, fx, bubble, look: p?.hero_look, alien: true, speed: opts.speed || 1 });
  const banner = h('p', { class: 'dance-banner', 'aria-live': 'polite' });
  const names = { left: 'Sola dön', right: 'Sağa dön', up: 'Zıpla', down: 'Reverans' };
  const pads = DANCE_MOVES.map((m) => h('button', { class: 'dance-pad', disabled: true, 'data-m': m, 'aria-label': names[m], onclick: () => press(m) }, DANCE_ARROW[m]));
  const startBtn = h('button', { class: 'primary small', onclick: () => start() }, 'Dansa başla!');
  const skipBtn = h('button', { class: 'ghost small', onclick: () => skip() }, 'Atla');
  fill(wrap, stage, banner, h('div', { class: 'dance-pads' }, pads), h('div', { class: 'row dance-under' }, startBtn, skipBtn));
  let phase = 'start', round = 0, won = 0, seq = [], input = [], tries = 0, over = false;
  ctl.pose('stand');
  ctl.mood('idle');
  banner.textContent = `Uzaylı dans eder, sen aynı sırayla oklara bas! ${cfg.rounds} tur var.`;
  const setPads = (on) => pads.forEach((b) => { b.disabled = !on; });
  // Oklar: gösterirken sırası gelen yanar; çocuğun sırasında basılanlar yeşil, yanlışı kırmızı, kalanlar boş.
  const paint = (now = -1, hide = false) => {
    fill(slots, seq.map((m, i) => {
      const got = input[i], bad = got && got !== m;
      return h('span', { class: 'dance-slot' + (i === now ? ' now' : '') + (got ? (bad ? ' bad' : ' ok') : '') }, got ? DANCE_ARROW[got] : hide ? '·' : DANCE_ARROW[m]);
    }));
  };
  const onKey = (e) => {
    if (!wrap.isConnected || over) { document.removeEventListener('keydown', onKey); return; }
    const m = DANCE_KEYS[e.key];
    if (!m) return;
    e.preventDefault();
    press(m);
  };
  const demo = async () => {
    phase = 'demo';
    input = [];
    setPads(false);
    banner.textContent = `Tur ${round + 1}/${cfg.rounds} · İzle!`;
    paint();
    await ctl.wait(450);
    for (let i = 0; i < seq.length; i++) {
      if (over) return;
      paint(i);
      await ctl.alienDance(seq[i], 620);
      ctl.mood('idle');
      await ctl.wait(140);
    }
    if (over) return;
    phase = 'play';
    paint(-1, true);
    banner.textContent = 'Sıra sende!';
    setPads(true);
  };
  const nextRound = async () => {
    if (over) return;
    if (round >= cfg.rounds) return finish(false);
    seq = danceSeq(cfg.lens[round], opts.rnd);
    tries = 0;
    await demo();
  };
  const press = async (m) => {
    if (phase !== 'play' || over || !DANCE_ARROW[m]) return;
    input.push(m);
    const r = danceJudge(seq, input);
    paint(-1, true);
    if (r === 'wrong') {
      phase = 'oops';
      setPads(false);
      tries++;
      ctl.pose('wobble');
      ctl.mood('giggle');
      ctl.say(trainSay('fall', 0, 0));
      await ctl.wait(950);
      if (over) return;
      ctl.pose('stand');
      bubble.className = 'train-say';
      if (tries >= cfg.tries) {
        banner.textContent = trEn('Bir dahaki tura!', 'On to the next round!');
        await ctl.wait(800);
        round++;
        return nextRound();
      }
      return demo();
    }
    if (r === 'next') { ctl.dance(m, 460); return; }
    // Hepsi doğru: dansın tamamı baştan sona, sonra reverans ve alkış.
    phase = 'win';
    setPads(false);
    await ctl.dance(m, 460);
    for (const mv of seq) { if (over) return; await ctl.dance(mv, 420); }
    if (over) return;
    ctl.pose('bow');
    ctl.mood('clap');
    ctl.say('Bravo!', 'foe');
    won++;
    round++;
    await ctl.wait(1100);
    if (over) return;
    bubble.className = 'train-say';
    ctl.pose('stand');
    nextRound();
  };
  const finish = (skipped) => {
    if (over) return;
    over = true;
    phase = 'over';
    setPads(false);
    document.removeEventListener('keydown', onKey);
    banner.textContent = danceSay(won, cfg.rounds, skipped);
    ctl.pose('bow');
    ctl.mood('bow');
    startBtn.hidden = true;
    skipBtn.hidden = true;
  };
  const start = () => {
    if (phase !== 'start' || over) return;
    startBtn.hidden = true;
    document.addEventListener('keydown', onKey);
    nextRound();
  };
  const skip = () => finish(true);
  wrap.start = start;
  wrap.skip = skip;
  wrap.press = press;
  wrap.peekState = () => ({ phase, round, won, tries, over, seq: [...seq], input: [...input] });
  return wrap;
}
// Oturum ya da deneme sonundaki dans kartı: balerin çocukta, 70 numaradan sonra, asker olana kadar; correct doğru sayısı.
// Değilse, doğru yoksa ya da numara okunamazsa kart gizli kalır. Hiçbir şey yazmaz.
function danceCard(correct) {
  const box = h('section', { class: 'card stack dance-card', hidden: true, style: 'gap: 8px' });
  const p = state.student;
  if (!p || !armyOpen(p) || !heroGamesOn(p) || trainStyle(p) !== 'balerin' || !(correct > 0)) return box;
  loadArmy(p).then((st) => {
    if (!st || !trainOn(p, st) || st.points < TRAIN_ALIEN_AT) return;
    const cfg = danceSetup(correct, p.grade);
    if (!cfg.rounds) return;
    fill(box, h('p', { class: 'label' }, '🩰 Uzaylıyla dans'), danceGame(cfg, p));
    box.hidden = false;
  }).catch(() => {});
  return box;
}

/* Asker: veli */

// Kahramanın türü (velinin ayarı): 'kapali', 'asker' (kum torbası) ya da 'balerin'. Veritabanında iki alan: hero_army
// (açık mı) ve train_style ('torba' | 'balerin'); seçilmediyse 7. sınıfa kadar açık, kahramanı kız olanda balerin.
const heroKind = (p) => (!armyOn(p) ? 'kapali' : trainStyle(p) === 'balerin' ? 'balerin' : 'asker');
// Seçilen türün açıklaması (velinin isteği, 2026-11-18: "hangisi seçildiyse onun açıklaması").
const HERO_KIND_TEXT = {
  kapali: 'Kahramanın forma numarası, cevaptan sonraki antrenmanı ve dansı görünmez. Numarası silinmez; yeniden açınca kaldığı yerden sürer.',
  asker: 'Kahramanın göğsünde bir forma numarası olur: hata tekrarında her 10 doğru +1, öteki sorularda her 20 doğru +1. '
    + 'Her cevaptan sonra kum torbasında kısa bir antrenman yapar (yumruk, tekme, kombo); 70\'ten sonra torbanın yerine uzaylı partner gelir. '
    + '100 olunca çocuk kendi ülkesinin kollarından birini seçer, üniforması değişir, numara arttıkça rütbe alır. Numara hiç azalmaz. '
    + '7. sınıfa kadar açık gelir.',
  balerin: 'Her cevaptan sonra küçük bir balerin dans eder: doğruda piruet, üst üste doğrularda büyük sıçrama ve koreografi. '
    + 'Forma numarası askerdeki gibi artar (hata tekrarında her 10 doğru +1, öteki sorularda her 20 doğru +1, hiç azalmaz); '
    + '70\'ten sonra uzaylı dans partneri gelir ve oturum sonunda uzaylıyla dans oyunu açılır. '
    + '100 olunca çocuk kolunu seçip asker olur, bale biter. Kahramanı kız olan çocukta balerin seçili gelir.',
};
// Günlük plandaki satır (velinin isteği, 2026-11-18: "Asker kahramanın altından balerin ayarı yapılması doğru değil, üstte
// kahraman olacak, içinde dropdownlarla balerin ya da asker seçilecek"): "Kahraman" başlığı, yanında Kapalı / Asker /
// Balerin seçimi, altında seçilenin açıklaması; kol seçildiyse "kolunu yeniden seçsin".
// value(): kaydedilecek değişiklikler; show(): kaydedilen profili yeniden gösterir. Altında numarası, kolu ve rütbesi.
function armySetting(p) {
  const kind = h('select', { 'aria-label': 'Kahraman' },
    [['kapali', 'Kapalı'], ['asker', 'Asker'], ['balerin', 'Balerin']].map(([v, l]) => h('option', { value: v }, l)));
  const about = h('p', { class: 'small muted' });
  const describe = () => { about.textContent = HERO_KIND_TEXT[kind.value] || ''; };
  kind.addEventListener('change', describe);
  const reset = h('input', { type: 'checkbox', 'aria-label': 'Kolunu yeniden seçsin' });
  const resetRow = h('label', { class: 'row small' }, reset, h('span'));
  const status = h('p', { class: 'small muted num' });
  const paint = () => {
    const c = armyCorps(p.hero_corps);
    kind.value = heroKind(p);
    describe();
    resetRow.hidden = !c;
    reset.checked = false;
    resetRow.lastChild.textContent = c ? `Kolunu yeniden seçsin (şimdi: ${c.name}); numarası ve rütbesi kaybolmaz` : '';
    status.textContent = '';
    if (!armyOn(p)) return;
    loadArmy(p).then((st) => {
      if (!st) return;
      const sc = armyCorps(st.corps);
      status.textContent = sc ? `Şimdi: ${sc.name} · ${armyRankName(st.corps, armyRank(st.points))} · numara ${st.points}`
        : `Şimdi: forma numarası ${st.points}` + (st.points >= ARMY_SOLDIER ? ' · kolunu seçmeye hazır' : ` · 100'de asker olur`);
    }).catch(() => {});
  };
  paint();
  const row = h('div', { class: 'stack', style: 'gap: 4px; padding: 10px 0 4px; border-top: 1px solid var(--rule)' },
    h('label', { class: 'row' }, h('b', {}, 'Kahraman'), kind),
    about, resetRow, status);
  row.value = () => {
    const upd = {};
    if (kind.value === heroKind(p)) { if (reset.checked && p.hero_corps) upd.hero_corps = null; return upd; }
    const on = kind.value !== 'kapali', style = kind.value === 'balerin' ? 'balerin' : 'torba';
    if (on !== armyOn(p)) upd.hero_army = on;
    if (on && style !== trainStyle(p)) upd.train_style = style; // kapatırken tür olduğu gibi kalır
    if (reset.checked && p.hero_corps) upd.hero_corps = null;
    return upd;
  };
  row.show = paint;
  return row;
}
