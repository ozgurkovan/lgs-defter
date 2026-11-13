/* Asker kahraman (velinin isteği, 2026-11-13: "üzerinde numaralar olabilir, takım numarası gibi, 100'e ulaştı mı asker
   olabilsin. Hangi ülkedense o ülkenin askerlerinden seçebilsin… rütbe almaya başlayacak"). Kahramanın göğsünde bir forma
   numarası var; çalıştıkça artar, hiç azalmaz. 100 olunca çocuk kendi ülkesinin kollarından birini kendisi seçer
   (Türkiye: Kara, Deniz, Hava; ABD: Army, Navy, Air Force, Marines, Space Force), üniforması değişir ve numara arttıkça
   rütbe alır. Numaranın hesabı velinin seçimi: hata tekrarında her 10 doğru +1, öteki sorularda her 20 doğru +1 (8 kelime
   kartı ve yıldızlı her klavye dersi birer doğru); hesap veritabanında (supabase/hero-army.sql, hero_army_state), kol
   seçimi de orada denetlenir (set_hero_corps). Veli çocuk başına açıp kapatır (Ayarlar → Günlük plan; besleme gibi 7.
   sınıfa kadar açık gelir), kolu sıfırlayabilir. Üniformalar bizim çizimimiz (app.js, HERO_UNIFORM): gerçek amblem yok.
   Uzaylılarla savaş (ikinci aşama) henüz yok. */

/* Asker: saf kısım (tools/test-army.mjs bunu dener) */

const ARMY_SOLDIER = 100; // bu numarada asker olur
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
  return { num: st.points, corps, rank: corps ? Math.max(0, armyRank(st.points)) : -1, country: armyUs(p) ? 'us' : 'tr' };
}
// Kahramanın sözü: numara, kol seçme zamanı ya da rütbe ve sıradaki rütbe.
function armySay(st) {
  const c = armyCorps(st.corps);
  if (!c) {
    return st.points < ARMY_SOLDIER ? `Forma numaram ${st.points}! 100 olunca asker olacağım: ${ARMY_SOLDIER - st.points} kaldı.`
      : '100\'e ulaştık! 🎖️ Hangi kolda olacağımızı sen seç.';
  }
  const r = armyRank(st.points), next = armyNext(st.points, st.corps);
  return `${c.name} · ${armyRankName(st.corps, r)}. ` + (next ? `${armyRankName(st.corps, next.rank)} olmama ${next.need} numara kaldı.` : 'En yüksek rütbedeyim! 🎖️');
}
// Kutlanacak haber: seen, çocuğun bu cihazda son gördüğü durum ({ r: rütbe, ready: kol seçmeye hazır }). İlk açılışta
// (seen yok) hiçbir şey kutlanmaz, şimdiki durum kaydedilir. 100'e ulaşınca 'ready'; askerken rütbe artınca 'promoted'.
function armyNews(st, seen) {
  const corps = armyCorps(st.corps) ? st.corps : null;
  const now = { r: corps ? armyRank(st.points) : -1, ready: !corps && st.points >= ARMY_SOLDIER };
  if (!seen || typeof seen !== 'object') return { news: null, seen: now };
  if (now.ready && !seen.ready) return { news: 'ready', seen: now };
  if (corps && seen.r >= 0 && now.r > seen.r) return { news: 'promoted', seen: now };
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
  const plus = today ? ` · bugün +${today}` : '';
  if (!c && st.points >= ARMY_SOLDIER) {
    return h('div', { class: 'army-line spread' }, h('b', {}, '🎖️ 100\'e ulaştın! Kolunu seç.'),
      h('button', { class: 'primary small', onclick: () => go('hero') }, 'Kolunu seç'));
  }
  const next = armyNext(st.points, st.corps);
  return h('p', { class: 'army-line small' }, c
    ? `🎖️ ${armyRankName(st.corps, armyRank(st.points))} · numara ${st.points}${plus}` + (next ? ` · ${armyRankName(st.corps, next.rank)} için ${next.need}` : '')
    : `🎽 Forma numaran ${st.points}${plus} · 100'de asker olursun`);
}

// Kutlama (araç kutlamasıyla aynı görünüş): 100'e ulaştı ('ready'), asker oldu ('soldier'), terfi etti ('promoted').
function armyParty(kind, st, p, level) {
  const c = armyCorps(st.corps), r = armyRank(st.points);
  const overlay = h('div', { class: 'party', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Asker kahraman' });
  const drop = () => overlay.remove();
  const close = () => { overlay.remove(); window.removeEventListener('popstate', drop); };
  window.addEventListener('popstate', drop, { once: true });
  const pic = h('div', { class: 'army-party-hero', 'aria-hidden': 'true' });
  pic.innerHTML = heroSvg(p?.avatar, level, p?.hero_look, undefined, armyView(p, st));
  const badge = kind === 'promoted' ? armyBadge(r, 56) : null;
  const title = kind === 'ready' ? '🎖️ 100\'e ulaştın!' : kind === 'soldier' ? `🎖️ Artık askersin!` : `🎖️ Terfi! ${armyRankName(st.corps, r)} oldun!`;
  const text = kind === 'ready' ? 'Askerlik töreni seni bekliyor: hangi kolda olacağını sen seçeceksin.'
    : kind === 'soldier' ? `${c?.name} · ${armyRankName(st.corps, r)}. Çalıştıkça rütbe alacaksın.`
      : (() => { const next = armyNext(st.points, st.corps); return next ? `Sıradaki rütbe: ${armyRankName(st.corps, next.rank)} (${next.need} numara).` : 'En yüksek rütbeye ulaştın! 🎖️'; })();
  fill(overlay,
    h('div', { class: 'party-confetti', 'aria-hidden': 'true' }, Array.from({ length: 30 }, (_, i) =>
      h('span', { style: `left: ${(i * 37) % 100}%; animation-delay: ${(i % 8) * 0.15}s; font-size: ${18 + (i % 4) * 6}px` }, ['🎖️', '✨', '⭐', '🎊', '🎉'][i % 5]))),
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
  const how = h('p', { class: 'small muted' }, 'Numara nasıl artar? Hata tekrarında her 10 doğru cevap +1, öteki sorularda her 20 doğru cevap +1. '
    + 'Kelime kartları ve klavye dersleri de katkı yapar. Numara hiç azalmaz.' + (today ? ` Bugün +${today}.` : ''));
  const bar = (share) => h('div', { class: 'feed-bar army-bar' }, h('i', { style: `width: ${Math.max(3, Math.round(share * 100))}%` }));
  if (!c && st.points < ARMY_SOLDIER) {
    fill(box, h('p', { class: 'label' }, 'Asker kahraman'),
      h('div', { class: 'spread' }, h('b', {}, `🎽 Forma numaran: ${st.points}`), h('span', { class: 'small muted num' }, `${st.points}/${ARMY_SOLDIER}`)),
      bar(st.points / ARMY_SOLDIER),
      h('p', {}, `100 olunca asker olursun ve kolunu sen seçersin. ${ARMY_SOLDIER - st.points} numara kaldı.`), how);
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
    h('div', { class: 'army-ranks' }, ranks.map((name, i) => h('span', { class: 'chip army-step' + (i < r ? ' done' : i === r ? ' now' : ''), title: `${ARMY_STEPS[i]}` },
      armyBadge(i, 18), `${name} · ${ARMY_STEPS[i]}`))),
    how);
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
