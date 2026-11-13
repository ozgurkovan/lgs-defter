/* Kahramanı besleme (velinin isteği, 2026-11-09). Çocuk çalışmazsa kahraman acıkır; çalıştıkça bronz kazanır, bronzla
   yandaki raftan yemek alıp kahramana kendi eliyle yedirir. Kahraman tok kaldıkça mutlu olur, kasları diri kalır;
   acıkınca pazıları söner, halsiz görünür ama hep sevimli kalır. Seviye, araçlar ve alınan eşyalar hiç kaybolmaz.
   Bronz altından ayrı paradır: altın araçlara ve eşyalara, bronz yalnızca yemeğe gider. Kahraman ana sayfada çocuğu
   çalışmaya çağırır: yardım ister, suçlamaz. Veli çocuk başına açıp kapatır (Ayarlar → Günlük plan; 7. sınıfa kadar açık
   gelir, 8. sınıftan sonra kapalı: büyük çocuğa çocukça gelebilir), hastalıkta ve tatilde açlığı dondurur.
   Veritabanı: supabase/hero-feed.sql (hero_meals, hero_feed_stats, profiles.hero_feed / hero_feed_at / hero_pauses). */

/* Besleme: saf kısım (tools/test-feed.mjs bunu dener) */

// Beslemenin başladığı an: bronz ve tokluk bundan önceki çalışmadan sayılmaz (kimse ilk gün yığınla bronzla başlamasın).
// Veli sonradan açarsa o çocuk için açtığı an (profiles.hero_feed_at).
const FEED_START = '2026-11-09T00:00:00+03:00';
const FEED_DECAY = 50; // günde düşen tokluk: tam tok kahraman iki günde acıkır
const FEED_WORDS_PER = 4; // ilk denemede doğru dört kelime kartı 1 bronz
const FEED_GAME_CHARS = 40; // Kelime roketinde yazılan her 40 harf 1 bronz (günlük sınıra kadar)
// Yemekler. k: fiyatın günlük plana oranı (fiyat çocuğun planına göre: günde 105 soru çözenle 35 soru çözen aynı emekle
// doyursun); value: doyurduğu kadar (tokluk 0–100). treat: keyif yiyeceği, doyurduğuna göre pahalı.
const FEED_FOODS = [
  { id: 'elma', name: 'Elma', emoji: '🍎', k: 0.07, value: 6 },
  { id: 'sut', name: 'Süt', emoji: '🥛', k: 0.12, value: 10 },
  { id: 'kahvalti', name: 'Kahvaltı', emoji: '🍳', k: 0.25, value: 22 },
  { id: 'yemek', name: 'Yemek', emoji: '🍲', k: 0.4, value: 36 },
  { id: 'hamburger', name: 'Hamburger', emoji: '🍔', k: 0.4, value: 30, treat: true },
  { id: 'pasta', name: 'Pasta', emoji: '🍰', k: 0.3, value: 18, treat: true },
];
// Besleme açık mı: veli seçtiyse o; seçmediyse 7. sınıfa kadar açık.
const feedOn = (p) => p?.hero_feed ?? ((p?.grade || 8) <= 7);
const feedStart = (p) => (p?.hero_feed_at && new Date(p.hero_feed_at) > new Date(FEED_START) ? p.hero_feed_at : FEED_START);
const feedPaused = (p) => Array.isArray(p?.hero_pauses) && p.hero_pauses.some((x) => Array.isArray(x) && x[0] && !x[1]);
const feedPrice = (food, unit) => Math.max(1, Math.round(food.k * unit));
// Kazanılan bronz, gün gün sayılardan (hero_feed_stats). unit: günlük plandaki soru sayısı. Her doğru cevap 1 bronz;
// planın yarısını ve tamamını çözdüğü gün ikramiye (doğru sayısından bağımsız: zorlanan çocuğun kahramanı aç kalmasın);
// ilk denemede doğru dört kelime kartı 1; günün klavye dersleri (yıldızlı, günlük ders sayısına kadar) ve Kelime roketi
// (günlük sınıra kadar: oyun soru çözmenin yerini almasın).
function feedEarned(days, unit, typingGoal) {
  const half = Math.max(1, Math.round(unit * 0.1)), lesson = Math.max(1, Math.round(unit * 0.05)), gameCap = Math.max(2, Math.round(unit * 0.1));
  const sum = { correct: 0, bonus: 0, words: 0, typing: 0, game: 0 };
  for (const d of days || []) {
    sum.correct += d.correct || 0;
    if ((d.answered || 0) >= Math.ceil(unit / 2)) sum.bonus += half;
    if ((d.answered || 0) >= unit) sum.bonus += half;
    sum.words += d.words || 0;
    sum.typing += Math.min(d.lessons || 0, typingGoal || 0) * lesson;
    sum.game += Math.min(gameCap, Math.floor((d.game_chars || 0) / FEED_GAME_CHARS));
  }
  sum.words = Math.floor(sum.words / FEED_WORDS_PER);
  return { ...sum, total: sum.correct + sum.bonus + sum.words + sum.typing + sum.game, half, lesson, gameCap };
}
// from ile to arasında açlığın işlediği süre (ms): dondurulan aralıklar düşülür.
function feedActiveMs(from, to, pauses) {
  let ms = to - from;
  for (const x of Array.isArray(pauses) ? pauses : []) {
    if (!Array.isArray(x) || !x[0]) continue;
    const a = Math.max(from, +new Date(x[0])), b = Math.min(to, x[1] ? +new Date(x[1]) : to);
    if (b > a) ms -= b - a;
  }
  return Math.max(0, ms);
}
// Şimdiki tokluk (0–100): son yemekten sonraki tokluktan, geçen süre kadar düşer. Hiç yemediyse beslemenin başında tam
// toktu. last: { after, at } ya da null.
function feedSatiety(last, since, now, pauses) {
  const base = last ? last.after : 100, from = +new Date(last ? last.at : since);
  return Math.min(100, Math.max(0, base - (FEED_DECAY * feedActiveMs(from, now, pauses)) / 86400000));
}
// Kahramanın hali: mutlu (tok, kasları diri), iyi, ac, cokac (halsiz). form: pazıların dolgunluğu (0,2–1).
function feedMood(sat) {
  const key = sat >= 70 ? 'mutlu' : sat >= 40 ? 'iyi' : sat >= 15 ? 'ac' : 'cokac';
  return { key, form: Math.min(1, Math.max(0.2, 0.2 + (0.8 * sat) / 70)) };
}
const FEED_MOOD_NAME = { mutlu: 'Tok ve mutlu', iyi: 'İyi', ac: 'Acıktı', cokac: 'Çok aç' };
// Parasının yettiği en doyurucu yemek (önce asıl yemekler, yoksa keyif yiyeceği); hiçbirine yetmiyorsa null.
function feedPick(balance, unit) {
  const can = FEED_FOODS.filter((f) => feedPrice(f, unit) <= balance).sort((a, b) => !!a.treat - !!b.treat || b.value - a.value);
  return can[0] || null;
}
// Kahramanın sözü: yardım ister, suçlamaz (velinin isteği). Parası yetiyorsa yemek ister; yetmiyorsa en ucuz yemeğe kaç
// doğru cevap kaldığını söyler.
function feedSay(fs) {
  const mood = feedMood(fs.sat).key, low = (t) => t.toLocaleLowerCase('tr');
  if (fs.paused) return 'Dinleniyorum. 🌴 Döndüğünde birlikte çalışırız!';
  if (mood === 'mutlu') return 'Karnım tok, kaslarım dipdiri! 💪 Teşekkür ederim.';
  const pick = feedPick(fs.balance, fs.unit);
  if (pick) return `${mood === 'iyi' ? '' : 'Acıktım! '}🥉 ${fs.balance} bronzun var. Bana ${low(pick.name)} alır mısın?`;
  const cheap = FEED_FOODS.reduce((a, b) => (feedPrice(b, fs.unit) < feedPrice(a, fs.unit) ? b : a));
  const need = feedPrice(cheap, fs.unit) - fs.balance;
  if (mood === 'cokac') return `Karnım çok acıktı 🥺 Bana yardım eder misin? ${need} doğru cevapla ${low(cheap.name)} alabiliriz.`;
  if (mood === 'ac') return `Biraz acıktım. ${need} doğru cevapla ${low(cheap.name)} alabiliriz. Birlikte çalışalım mı?`;
  return 'Bugün de birlikte çalışalım mı? Doğru cevapların bana yemek oluyor.';
}

/* Besleme: ekran */

// Çocuğun besleme durumu: bronz (kazanılan − harcanan), tokluk, son yemekler; withHero: kahramanın çizimi için güç ve
// eşyalar (yalnızca seçili öğrencide). Besleme kapalıysa ya da sayım okunamıyorsa null.
async function loadFeed(p = state.student, withHero = true) {
  if (!p || !feedOn(p)) return null;
  const since = new Date(feedStart(p)).toISOString();
  const [stats, meals, hero] = await Promise.all([
    q(sb.rpc('hero_feed_stats', { sid: p.id, since })),
    q(sb.from('hero_meals').select('food, price, value, after, fed_at').eq('student_id', p.id).gte('fed_at', since)
      .order('fed_at', { ascending: false }).limit(12)),
    withHero ? typingHero() : null,
  ]);
  if (!stats) return null;
  const unit = Math.max(1, planTotal(dailyPlan(p)));
  const parts = feedEarned(stats.days, unit, typingPerDay(p));
  const sat = feedSatiety(meals[0] ? { after: meals[0].after, at: meals[0].fed_at } : null, since, Date.now(), p.hero_pauses);
  return { p, unit, parts, spent: stats.spent, balance: Math.max(0, parts.total - stats.spent), sat, meals, hero, paused: feedPaused(p),
    today: (stats.days || []).find((d) => d.day === localDate()) || null };
}

// Tokluk çubuğu: yeşil (tok), sarı (acıktı), kırmızı (çok aç).
function feedBar(sat) {
  const mood = feedMood(sat).key;
  return h('div', { class: 'feed-bar ' + mood, role: 'img', 'aria-label': `Tokluk yüzde ${Math.round(sat)}: ${FEED_MOOD_NAME[mood]}` },
    h('i', { style: `width: ${Math.max(4, Math.round(sat))}%` }));
}

// Kahramanın kartı: küçük kahraman, sözü, tokluk, bronz ve besleme düğmesi. Ana sayfada (selamın altında) ve oturum
// sonlarında durur. Asker kahraman açıksa (army.js) kahraman numarasıyla ya da üniformasıyla çizilir, altında numara ya
// da rütbe satırı olur; 100'e ulaşınca ya da terfi edince kutlama açılır. Besleme kapalı, asker kahraman açıksa kart
// yalnızca kahramanı ve asker satırını gösterir. İkisi de kapalıysa ya da okunamazsa görünmez.
function feedHomeCard() {
  const box = h('section', { class: 'card feed-home', hidden: true });
  const feeding = feedOn(state.student), army = armyOn(state.student);
  if (!feeding && !army) return box;
  Promise.all([feeding ? loadFeed() : null, army ? loadArmy().catch(() => null) : null, !feeding ? typingHero() : null]).then(([fs, st, solo]) => {
    if (!fs && !st) return;
    const level = fs ? fs.hero.level : solo.level;
    const pic = h('div', { class: 'feed-face', 'aria-hidden': 'true' });
    pic.innerHTML = heroSvg(state.student.avatar, level, state.student.hero_look, fs ? feedMood(fs.sat) : undefined, armyView(state.student, st));
    const can = fs && fs.sat < 70 && !!feedPick(fs.balance, fs.unit); // tokken düğme öne çıkmaz
    fill(box, pic, h('div', { class: 'stack feed-side' },
      h('p', { class: 'feed-say' }, fs ? feedSay(fs) : armySay(st)),
      fs ? feedBar(fs.sat) : null,
      st ? armyLine(st) : null,
      h('div', { class: 'spread' }, fs ? h('b', { class: 'num small' }, `🥉 ${fs.balance}`) : h('span'),
        h('button', { class: can ? 'primary small' : 'small', onclick: () => go('hero') }, can ? 'Kahramanı besle' : 'Kahramana git'))));
    box.hidden = false;
    armyCheck(st, state.student, level);
  }).catch(() => {});
  return box;
}

// İngilizce ve Klavye sayfalarındaki kahraman kartının altı: tokluk, bronz, "Besle".
function feedStrip(fs) {
  if (!fs) return null;
  return h('div', { class: 'feed-strip' }, feedBar(fs.sat), h('b', { class: 'num small' }, `🥉 ${fs.balance}`),
    h('button', { class: 'small', onclick: () => go('hero') }, 'Besle'));
}

// Yemek raftan kahramanın ağzına uçar.
function feedFly(emoji, from, to) {
  if (reduceMotion() || !from?.animate) return Promise.resolve();
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const el = h('span', { class: 'feed-fly', 'aria-hidden': 'true' }, emoji);
  document.body.append(el);
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height * 0.36;
  const at = (x, y, s) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
  const done = () => el.remove();
  const flight = el.animate([{ transform: at(x0, y0, 1) }, { transform: at((x0 + x1) / 2, Math.min(y0, y1) - 50, 1.3), offset: 0.55 },
    { transform: at(x1, y1, 0.35), opacity: 0.3 }], { duration: 650, easing: 'ease-in-out' });
  // Sayfa arka plandaysa çizim bitmez; yemek yine de yenir (zamanlayıcı bekletmez).
  return Promise.race([flight.finished, new Promise((r) => setTimeout(r, 900))]).then(done, done);
}

/* Kahramanın sayfası (çocuk): ortada kahraman ve sözü, yanda yemek rafı, altında tokluk ve bronz. Rafta bir yemeğe
   dokununca bronzu yetiyorsa alınır ve kahramana yedirilir; karnı toksa yemez. */
// Asker kahraman açıksa (army.js) yemek kartının altında asker kartı durur; besleme kapalıysa sayfa yalnızca kahramanı
// ve asker kartını gösterir (viewArmyHero).
async function viewHero() {
  loading();
  const [fs, army] = await Promise.all([loadFeed(), loadArmy().catch(() => null)]);
  if (!fs && army) return viewArmyHero(army);
  if (!fs) {
    return render(h('header', {}, h('h1', {}, 'Kahramanın')),
      h('p', { class: 'card' }, 'Kahramanı besleme kapalı; velin Ayarlar\'dan açabilir.'),
      h('button', { class: 'block', onclick: () => go('home') }, 'Ana sayfa'));
  }
  const stage = h('div', { class: 'feed-hero' }), shelf = h('div', { class: 'feed-shelf' }), status = h('div', { class: 'stack', style: 'gap: 8px' });
  let said = null, busy = false;
  const feed = async (food, tile) => {
    if (busy) return;
    const price = feedPrice(food, fs.unit);
    if (fs.balance < price) return toast(`${food.emoji} ${food.name} için ${price - fs.balance} bronz daha gerek.`);
    if (fs.sat >= 95) return toast('Karnım tok, şimdi yiyemem. 😊');
    busy = true;
    const after = Math.round(Math.min(100, fs.sat + food.value));
    try { await q(sb.from('hero_meals').insert({ student_id: sid(), food: food.id, price, value: food.value, after })); }
    catch (e) { busy = false; return toast('Yedirilemedi; internetini kontrol et.'); }
    await feedFly(food.emoji, tile, stage);
    fs.spent += price;
    fs.balance -= price;
    fs.sat = after;
    fs.meals.unshift({ food: food.id, price, value: food.value, after, fed_at: new Date().toISOString() });
    said = food.treat ? `Bayıldım! ${food.emoji} Çok teşekkür ederim.` : `Nam nam! ${food.emoji} Teşekkür ederim.`;
    busy = false;
    paint(true);
  };
  const paint = (yum = false) => {
    const mood = feedMood(fs.sat);
    const scene = heroScene(fs.p, fs.hero.level, fs.hero.owned, mood);
    if (yum) { scene.classList.add('yum'); scene.append(h('span', { class: 'feed-heart', 'aria-hidden': 'true' }, '❤️')); }
    fill(stage, h('p', { class: 'feed-say bubble' }, said || feedSay(fs)), scene);
    fill(shelf, h('p', { class: 'label' }, 'Yemekler'), FEED_FOODS.map((food) => {
      const price = feedPrice(food, fs.unit), short = fs.balance < price;
      const tile = h('button', { class: 'feed-food' + (short ? ' short' : ''), 'aria-label': `${food.name}, ${price} bronz${short ? ', bronzun yetmiyor' : ''}`,
        onclick: () => feed(food, tile) }, h('span', { class: 'emoji' }, food.emoji), h('span', { class: 'small' }, food.name), h('b', { class: 'num small' }, `🥉 ${price}`));
      return tile;
    }));
    const today = fs.meals.filter((m) => localDate(new Date(m.fed_at)) === localDate());
    fill(status,
      h('div', { class: 'spread' }, h('b', {}, `Tokluk: ${FEED_MOOD_NAME[mood.key]}`), h('b', { class: 'num' }, `🥉 ${fs.balance} bronz`)),
      feedBar(fs.sat),
      fs.paused ? h('p', { class: 'small muted' }, 'Velin açlığı dondurdu: kahraman şimdilik acıkmıyor.') : null,
      today.length ? h('p', { class: 'small muted' }, 'Bugün yedikleri: ', today.map((m) => FEED_FOODS.find((f) => f.id === m.food)?.emoji || '🍽️').reverse().join(' ')) : null);
  };
  paint();
  const p = fs.parts, typing = typingPerDay(fs.p) > 0;
  const armyBox = h('div');
  const paintArmy = () => { fill(armyBox, army ? armyCard(army, fs.p, fs.hero.level, () => { paint(); paintArmy(); }) : null); };
  paintArmy();
  render(
    h('header', { class: 'stack', style: 'gap: 4px' },
      h('h1', {}, 'Kahramanın'),
      h('p', { class: 'muted' }, 'Doğru cevapların bronz kazandırır. Bronzla raftan yemek al, kahramanına yedir: tok kahramanın kasları diri kalır.')),
    h('section', { class: 'card stack', style: 'gap: 12px' }, h('div', { class: 'feed-stage' }, stage, shelf), status),
    armyBox,
    h('section', { class: 'card stack', style: 'gap: 6px' },
      h('p', { class: 'label' }, 'Bronz nasıl kazanılır?'),
      h('p', { class: 'small' }, `Her doğru cevap 1 bronz. Günlük planının yarısını çözünce ${p.half}, tamamını çözünce ${p.half} bronz daha.`
        + (wordsPerDay(fs.p) > 0 ? ` İlk denemede doğru bildiğin her ${FEED_WORDS_PER} kelime kartı 1 bronz.` : '')
        + (typing ? ` Günün her klavye dersi ${p.lesson} bronz; Kelime roketi de kazandırır (günde en çok ${p.gameCap}).` : '')),
      h('p', { class: 'small muted' }, `Bugün: ${fs.today?.correct || 0} doğru cevap. Kahraman çalışmadığın günlerde acıkır; seviyesi, araçları ve eşyaları hiç kaybolmaz.`)),
    h('button', { class: 'block', onclick: () => go('home') }, 'Ana sayfa'));
  armyCheck(army, fs.p, fs.hero.level);
}

/* Besleme: veli */

// Günlük plandaki satır: "Kahramanı besleme" (çocuk başına açık ya da kapalı) ve "Açlığı dondur" (hastalık, tatil).
// value(): kaydedilecek değişiklikler (değişmediyse boş); show(): kaydedilen profili yeniden gösterir. Altında
// kahramanın şimdiki hali.
function feedSetting(p) {
  const on = h('input', { type: 'checkbox', checked: feedOn(p) || null, 'aria-label': 'Kahramanı besleme açık' });
  const pause = h('input', { type: 'checkbox', checked: feedPaused(p) || null, disabled: !feedOn(p) || null, 'aria-label': 'Açlığı dondur' });
  on.addEventListener('change', () => { pause.disabled = !on.checked; });
  const status = h('p', { class: 'small muted num' });
  const paintStatus = () => {
    status.textContent = '';
    if (!feedOn(p)) return;
    loadFeed(p, false).then((fs) => {
      if (!fs) return;
      const today = fs.meals.filter((m) => localDate(new Date(m.fed_at)) === localDate()).map((m) => FEED_FOODS.find((f) => f.id === m.food)?.emoji || '🍽️').reverse();
      status.textContent = `Kahramanı şimdi: ${FEED_MOOD_NAME[feedMood(fs.sat).key].toLocaleLowerCase('tr')} (tokluk %${Math.round(fs.sat)}) · 🥉 ${fs.balance} bronz`
        + (today.length ? ` · bugün yedikleri: ${today.join(' ')}` : '') + (fs.paused ? ' · açlık donduruldu' : '');
    }).catch(() => {});
  };
  paintStatus();
  const row = h('div', { class: 'stack', style: 'gap: 4px; padding: 10px 0 4px; border-top: 1px solid var(--rule)' },
    h('label', { class: 'row' }, on, h('b', {}, 'Kahramanı besleme')),
    h('p', { class: 'small muted' }, 'Çocuk çalışmazsa kahramanı acıkır; doğru cevaplarla bronz kazanıp ona yemek yedirir, kahraman ana sayfada '
      + 'yardım ister. Seviye, araçlar ve eşyalar kaybolmaz. 7. sınıfa kadar açık gelir; büyük çocuğa çocukça gelebilir, isterseniz açın. '
      + 'Kapatıp yeniden açınca bronz sıfırdan başlar.'),
    h('label', { class: 'row small' }, pause, 'Açlığı dondur (hastalık, tatil): kahraman acıkmaz'),
    status);
  row.value = () => {
    const upd = {}, now = new Date().toISOString();
    if (on.checked !== feedOn(p)) { upd.hero_feed = on.checked; if (on.checked) upd.hero_feed_at = now; }
    if (on.checked && pause.checked !== feedPaused(p)) {
      const list = (Array.isArray(p.hero_pauses) ? p.hero_pauses : []).filter((x) => Array.isArray(x) && x[0]);
      upd.hero_pauses = (pause.checked ? [...list, [now, null]] : list.map((x) => (x[1] ? x : [x[0], now]))).slice(-10);
    }
    return upd;
  };
  row.show = () => { on.checked = feedOn(p); pause.checked = feedPaused(p); pause.disabled = !feedOn(p); paintStatus(); };
  return row;
}
