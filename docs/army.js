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
  if (!p || !armyOn(p)) return null;
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
  if (!p || !armyOn(p) || correct + wrong <= 0) return box;
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
   çocukta oturumda cevaptan sonra kısa bir sahne (1 saniye kadar): doğruda yumruk, 3 doğru üst üste döner tekme, 5 ve
   üstünde kombo; yanlışta kahraman komik biçimde düşer, kalkar, "Hadi bir daha deneyelim!". 70 numaradan sonra kum torbası
   yerine eldivenli sevimli uzaylı antrenman partneri (düşman değil: vurulunca sendeler, gülümseyip eldivenlerini kaldırır;
   yanlışta kahramanı hafifçe iter, kıkırdar). Kimse yaralanmaz. Denemede yok; hareket azaltılmışsa yok. */

/* Antrenman: saf kısım */

const TRAIN_ALIEN_AT = 70; // bu numaradan sonra kum torbası yerine uzaylı partner
// Hareket: doğruda üst üste doğru sayısına göre yumruk, döner tekme (3), kombo (5 ve üstü); yanlışta düşüş.
const trainMove = (correct, streak) => (!correct ? 'fall' : streak >= 5 ? 'combo' : streak >= 3 ? 'kick' : 'punch');
// Antrenman açık mı: asker kahraman açık ve henüz asker değil (numara bilinmiyorsa da açık; kol seçildiyse kapalı).
const trainOn = (p, st) => armyOn(p) && !(st && (armyCorps(st.corps) || st.points >= ARMY_SOLDIER));
// Kahramanın sözü: düşünce cesaret, kombo ve tekmede sevinç (n: kaçıncı sahne; sözler sırayla döner).
// İki dilde yazılır (trEn): bazılarında Türkçe harf yok, İngilizce katmanı onları Türkçe sanmaz.
const TRAIN_FALL_SAYS = [['Hadi bir daha deneyelim!', 'Let\'s try again!'], ['Düştüm ama kalktım!', 'I fell, but I got up!'],
  ['Bir dahakine olacak!', 'I\'ll get it next time!'], ['Hata yapmak öğrenmektir!', 'Mistakes help us learn!']];
function trainSay(move, streak, n = 0) {
  if (move === 'fall') return trEn(...TRAIN_FALL_SAYS[(Math.abs(Math.trunc(n)) || 0) % TRAIN_FALL_SAYS.length]);
  if (move === 'combo') return trEn(`Kombo ×${streak}!`, `Combo ×${streak}!`);
  if (move === 'kick') return trEn('Döner tekme!', 'Spinning kick!');
  return '';
}

/* Antrenman: çizimler (sabit SVG; kullanıcı metni yok) */

// Kum torbası: tavandan zincirle asılı, kırmızı, beyaz şeritli.
const TRAIN_BAG = '<svg viewBox="0 0 60 120" aria-hidden="true"><path d="M30 0 V22" stroke="#8A93A3" stroke-width="3" stroke-dasharray="4 3"/>'
  + '<path d="M18 22 H42 L44 30 H16 Z" fill="#5E6672"/><rect x="12" y="30" width="36" height="80" rx="16" fill="#E63946" stroke="#B02A35" stroke-width="2"/>'
  + '<rect x="12" y="52" width="36" height="7" fill="#fff" opacity=".9"/><rect x="12" y="86" width="36" height="7" fill="#fff" opacity=".9"/>'
  + '<path d="M19 38 Q17 70 20 102" stroke="#fff" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/></svg>';
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
// Vuruş yıldızı ("POF").
const TRAIN_POW = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 1 L24 12 L35 7 L29 17 L39 20 L29 23 L35 33 L24 28 L20 39 L16 28 L5 33 L11 23 L1 20 L11 17 L5 7 L16 12 Z" fill="#FFD23F" stroke="#FF8C1A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
// Döner tekmenin izi.
const TRAIN_SWOOSH = '<svg viewBox="0 0 80 50" aria-hidden="true"><path d="M6 40 Q40 -14 74 22" stroke="#4FB3E6" stroke-width="6" fill="none" stroke-linecap="round" opacity=".55"/>'
  + '<path d="M14 42 Q42 2 70 30" stroke="#BDE8FF" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/></svg>';

/* Antrenman: sahne */

// Antrenman sahnesi: move ('punch' | 'kick' | 'combo' | 'fall'), streak, p (görünüş), level, opts.army (armyView),
// opts.partner ('bag' ya da 'alien'), opts.n (söz sırası). Kutu döner; play() oynatır. Hareket azaltılmışsa durağan.
function trainScene(move, streak, p, level, opts = {}) {
  const partner = opts.partner === 'alien' ? 'alien' : 'bag';
  const box = h('div', { class: `train train-${partner}`, 'aria-hidden': 'true' });
  const hero = h('div', { class: 'train-hero' });
  hero.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, opts.army);
  const foe = h('div', { class: 'train-foe' });
  const draw = (mood) => { foe.innerHTML = partner === 'alien' ? trainAlien(mood) : TRAIN_BAG; };
  draw('guard');
  const fx = h('div', { class: 'train-fx' });
  const bubble = h('span', { class: 'train-say' });
  fill(box, hero, foe, fx, bubble);
  const anim = (el, frames, ms, o = {}) => (el.animate ? el.animate(frames, { duration: ms, easing: o.easing || 'ease-out', fill: 'forwards', delay: o.delay || 0 }).finished.catch(() => {}) : Promise.resolve());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (t, who = 'hero') => { if (!t) return; bubble.textContent = t; bubble.className = `train-say on ${who}`; };
  const pow = (word) => {
    const el = h('span', { class: 'train-pow' }, word ? h('b', {}, word) : null);
    el.insertAdjacentHTML('afterbegin', TRAIN_POW);
    fx.append(el);
    anim(el, [{ scale: '0.3', opacity: 1 }, { scale: '1.15', opacity: 1, offset: 0.4 }, { scale: '1.3', opacity: 0 }], 520).then(() => el.remove());
  };
  const hitFoe = async (big = false) => {
    pow(big ? 'BAM!' : 'POF!');
    if (partner === 'bag') return anim(foe, [{ rotate: '0deg' }, { rotate: big ? '26deg' : '16deg', offset: 0.3 }, { rotate: big ? '-12deg' : '-7deg', offset: 0.65 }, { rotate: '0deg' }], 760, { easing: 'ease-in-out' });
    draw('hit');
    await anim(foe, [{ translate: '0 0', rotate: '0deg' }, { translate: big ? '14px -4px' : '8px 0', rotate: big ? '14deg' : '8deg', offset: 0.35 }, { translate: '0 0', rotate: '0deg' }], 620);
    draw('cheer');
  };
  // Yumruk: eldiven partnere uzanır; değdiği anda (onHit) partner sarsılır.
  const punch = async (high = false, onHit = null) => {
    const g = h('span', { class: 'train-glove' + (high ? ' high' : '') });
    g.innerHTML = TRAIN_GLOVE;
    fx.append(g);
    const reach = `${Math.max(24, Math.round(foe.getBoundingClientRect().left - g.getBoundingClientRect().right + 10))}px 0`;
    anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '10px 0', rotate: '5deg', offset: 0.4 }, { translate: '0 0', rotate: '0deg' }], 360);
    if (onHit) setTimeout(onHit, 170);
    await anim(g, [{ translate: '0 0', scale: '0.6', opacity: 0.9 }, { translate: reach, scale: '1', opacity: 1, offset: 0.5 }, { translate: '0 0', scale: '0.6', opacity: 0 }], 360, { easing: 'ease-in-out' });
    g.remove();
  };
  const kick = async (onHit = null) => {
    if (onHit) setTimeout(onHit, 300);
    const sw = h('span', { class: 'train-swoosh' });
    sw.innerHTML = TRAIN_SWOOSH;
    fx.append(sw);
    anim(sw, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1', offset: 0.5 }, { opacity: 0, scale: '1.1' }], 520).then(() => sw.remove());
    await anim(hero, [{ translate: '0 0', rotate: '0deg' }, { translate: '12px -16px', rotate: '200deg', offset: 0.5 }, { translate: '14px -6px', rotate: '330deg', offset: 0.8 }, { translate: '0 0', rotate: '360deg' }], 560, { easing: 'ease-in-out' });
  };
  const fall = async () => {
    if (partner === 'alien') {
      draw('push');
      anim(foe, [{ translate: '0 0' }, { translate: '-18px 0', offset: 0.5 }, { translate: '0 0' }], 420);
      await wait(180);
    }
    await anim(hero, [{ rotate: '0deg', translate: '0 0' }, { rotate: '-12deg', translate: '-4px 0', offset: 0.25 }, { rotate: '-82deg', translate: '-10px 6px' }], 380, { easing: 'ease-in' });
    const st = h('span', { class: 'train-stars' });
    st.innerHTML = BATTLE_DIZZY;
    hero.append(st);
    if (partner === 'alien') { draw('cheer'); say('Hihi!', 'foe'); }
    await wait(520);
    st.remove();
    await anim(hero, [{ rotate: '-82deg', translate: '-10px 6px' }, { rotate: '8deg', translate: '0 -6px', offset: 0.7 }, { rotate: '0deg', translate: '0 0' }], 420, { easing: 'ease-out' });
    if (partner === 'alien') draw('guard');
  };
  let busy = false;
  box.play = async () => {
    if (busy || reduceMotion() || !box.isConnected) { if (move === 'fall') say(trainSay(move, streak, opts.n)); return; }
    busy = true;
    bubble.className = 'train-say';
    if (move === 'punch') { await punch(false, () => hitFoe()); await wait(450); }
    else if (move === 'kick') { say(trainSay(move, streak, opts.n)); await kick(() => hitFoe(true)); await wait(450); }
    else if (move === 'combo') { say(trainSay(move, streak, opts.n)); await punch(false, () => hitFoe()); await punch(true, () => hitFoe()); await kick(() => hitFoe(true)); await wait(450); }
    else { await fall(); say(trainSay(move, streak, opts.n)); }
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
  if (!p || !armyOn(p) || reduceMotion()) return slot;
  ss.train ??= Promise.all([loadArmy(p), armyHeroLevel(p)]).catch(() => [null, 1]);
  const streak = ss.streak || 0, n = correct ? 0 : Math.max(0, (ss.falls || 1) - 1);
  ss.train.then(([st, level]) => {
    if (!st || !trainOn(p, st) || !slot.isConnected) return;
    const sc = trainScene(trainMove(correct, streak), streak, p, level, { partner: st.points >= TRAIN_ALIEN_AT ? 'alien' : 'bag', army: armyView(p, st), n });
    fill(slot, sc);
    sc.play();
  }).catch(() => {});
  return slot;
}

/* Asker: veli */

// Günlük plandaki satır: "Asker kahraman" (çocuk başına açık ya da kapalı) ve seçtiyse "kolunu yeniden seçsin".
// value(): kaydedilecek değişiklikler; show(): kaydedilen profili yeniden gösterir. Altında numarası, kolu ve rütbesi.
function armySetting(p) {
  const on = h('input', { type: 'checkbox', checked: armyOn(p) || null, 'aria-label': 'Asker kahraman açık' });
  const reset = h('input', { type: 'checkbox', 'aria-label': 'Kolunu yeniden seçsin' });
  const resetRow = h('label', { class: 'row small' }, reset, h('span'));
  const status = h('p', { class: 'small muted num' });
  const paint = () => {
    const c = armyCorps(p.hero_corps);
    on.checked = armyOn(p);
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
    h('label', { class: 'row' }, on, h('b', {}, 'Asker kahraman')),
    h('p', { class: 'small muted' }, 'Kahramanın göğsünde bir forma numarası olur: hata tekrarında her 10 doğru +1, öteki sorularda her 20 doğru +1. '
      + '100 olunca çocuk kendi ülkesinin kollarından birini seçer, üniforması değişir, numara arttıkça rütbe alır. Numara hiç azalmaz; '
      + 'kapatıp açınca da kaybolmaz. 7. sınıfa kadar açık gelir.'),
    resetRow, status);
  row.value = () => {
    const upd = {};
    if (on.checked !== armyOn(p)) upd.hero_army = on.checked;
    if (reset.checked && p.hero_corps) upd.hero_corps = null;
    return upd;
  };
  row.show = paint;
  return row;
}
