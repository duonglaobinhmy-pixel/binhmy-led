async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không tải được ${url}: ${res.status}`);
  return await res.text();
}

function getRunDateVN() {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })
  );

  now.setDate(now.getDate() + 1);

  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);

  return `${dd}-${mm}-${yy}`;
}

function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(v) {
  return cleanText(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

function splitSlidesFromHtml(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;

  const styles = Array.from(wrap.querySelectorAll('style'))
    .map((s) => s.outerHTML)
    .join('\n');

  return Array.from(wrap.querySelectorAll('section.slide, div.slide')).map((slide) => {
    const clone = slide.cloneNode(true);

    // nếu ingredient đang là div.slide thì đổi thành section.slide
    if (clone.tagName.toLowerCase() !== 'section') {
      const section = document.createElement('section');
      section.className = clone.className;
      section.innerHTML = clone.innerHTML;
      slide = section;
    } else {
      slide = clone;
    }

    if (styles && !slide.querySelector('style')) {
      slide.insertAdjacentHTML('afterbegin', styles);
    }

    return slide.outerHTML;
  });
}

function extractTextFromSlideHtml(slideHtml) {
  const wrap = document.createElement('div');
  wrap.innerHTML = slideHtml;

  const clone = wrap.firstElementChild?.cloneNode(true);
  if (!clone) return '';

  clone.querySelectorAll('style, script').forEach((el) => el.remove());
  return normalizeText(clone.textContent || '');
}

function classifySlide(slideHtml) {
  const wrap = document.createElement('div');
  wrap.innerHTML = slideHtml;

  const slide = wrap.querySelector('section.slide, div.slide');
    if (!slide) return 'unknown';

  const text = normalizeText(slide.textContent || '');

  const titleNode =
    slide.querySelector('.menu-title') ||
    slide.querySelector('.main-title') ||
    slide.querySelector('.xao-title') ||
    slide.querySelector('.title-left') ||
    slide.querySelector('h1') ||
    slide.querySelector('h2');

  const title = normalizeText(titleNode?.textContent || '');
  const leftHead = normalizeText(slide.querySelector('.left-head')?.textContent || '');

  const has = (...parts) => parts.every((p) => text.includes(normalizeText(p)));
  const hasAny = (...parts) => parts.some((p) => text.includes(normalizeText(p)));

  const hasMenuGrid = !!slide.querySelector('table.menu-grid');
  const hasXaoGrid = !!slide.querySelector('table.xao-grid');
  const hasRauGrid = !!slide.querySelector('table.grid');
  const isMainIngredientSlide = slide.classList.contains('slide-main');
  const isTableIngredientSlide = slide.classList.contains('slide-xay');

  // 1) RAU
  if (hasRauGrid && (title === 'RAU' || hasAny('RAU'))) {
    return 'rau';
  }

  // 2) MENU
  if (hasMenuGrid) {
    if (has('BANG KHAU PHAN AN SANG CUM GO VAP')) return 'menu_sang_govap';
    if (has('BANG KHAU PHAN AN SANG CUM BINH MY')) return 'menu_sang_binhmy';

    if (has('BANG KHAU PHAN AN TRUA CUM GO VAP')) return 'menu_trua_govap';
    if (has('BANG KHAU PHAN AN TRUA CUM BINH MY')) return 'menu_trua_binhmy';

    if (has('BANG KHAU PHAN AN CHIEU CUM GO VAP')) return 'menu_chieu_govap';
    if (has('BANG KHAU PHAN AN CHIEU CUM BINH MY')) return 'menu_chieu_binhmy';

    return 'unknown_menu';
  }

  // 3) XÀO CHÍNH / XÀO XAY
  if (hasXaoGrid) {
    const isXaoMain =
      hasAny(
        'BANG NGUYEN LIEU THUC AN XAO MAU XANH',
        'BANG NGUYEN LIEU CHO MON THUC AN XAO MAU XANH',
        'THUC AN XAO MAU XANH',
        'XAO MAU XANH'
      ) &&
      hasAny('NVL') &&
      hasAny('DVT') &&
      hasAny('TRUA') &&
      hasAny('CHIEU');

    if (isXaoMain) return 'xao_trua';

    const isXayLike = hasAny(
      'BANG NGUYEN LIEU CHO MON THUC AN XAY',
      'THUC AN XAY',
      'COM XAY',
      'DO ONG',
      'MON XAY'
    );

    if (isXayLike) {
      const isTruaXay =
        (
          text.includes(normalizeText('TRUA CUM GO VAP + XE GO VAP')) ||
          (text.includes(normalizeText('TRUA')) && text.includes(normalizeText('XE GO VAP')))
        ) &&
        !text.includes(normalizeText('XE BINH MY')) &&
        !text.includes(normalizeText('XE BM'));

      const isChieuXay =
        text.includes(normalizeText('CHIEU')) &&
        (
          text.includes(normalizeText('XE BINH MY')) ||
          text.includes(normalizeText('XE BM')) ||
          text.includes(normalizeText('BINH MY + XE BINH MY')) ||
          text.includes(normalizeText('CUM BINH MY + XE BINH MY')) ||
          text.includes(normalizeText('CUM GO VAP CUM BINH MY + XE BINH MY'))
        );

      if (isTruaXay) return 'ingredient_trua_xay';
      if (isChieuXay) return 'ingredient_chieu_xay';

      return 'unknown_slide_xay';
    }

    return 'unknown_xao_table';
  }

  // 4) INGREDIENT MAIN / SÁNG
  if (isMainIngredientSlide) {
    if (
      title.includes(normalizeText('BANG NGUYEN LIEU BUA SANG')) ||
      hasAny('BANG NGUYEN LIEU BUA SANG', 'BUA SANG')
    ) {
      return 'ingredient_sang';
    }

    const isMainMeal =
      title.includes(normalizeText('BANG NGUYEN LIEU CHO MON COM, CANH, XAO, MAN')) ||
      (
        hasAny('BANG NGUYEN LIEU CHO MON COM') &&
        hasAny('CANH') &&
        hasAny('XAO') &&
        hasAny('MAN')
      );

    if (isMainMeal) {
      if (leftHead === 'TRUA') return 'ingredient_trua_main';
      if (leftHead === 'CHIEU') return 'ingredient_chieu_main';

      if (hasAny(
        'BANG NGUYEN LIEU CHO MON COM, CANH, XAO, MAN TRUA',
        'MON COM, CANH, XAO, MAN TRUA'
      )) {
        return 'ingredient_trua_main';
      }

      if (hasAny(
        'BANG NGUYEN LIEU CHO MON COM, CANH, XAO, MAN CHIEU',
        'MON COM, CANH, XAO, MAN CHIEU'
      )) {
        return 'ingredient_chieu_main';
      }

      return 'ingredient_main_other';
    }

    return 'unknown_main';
  }

  // 5) INGREDIENT XAY DẠNG KHÁC
  if (isTableIngredientSlide) {
    const isXayLike = hasAny(
      'BANG NGUYEN LIEU CHO MON THUC AN XAY',
      'THUC AN XAY',
      'COM XAY',
      'DO ONG',
      'MON XAY'
    );

    if (isXayLike) {
      if (hasAny('TRUA', 'GO VAP + XE GO VAP')) return 'ingredient_trua_xay';
      if (hasAny('CHIEU', 'GO VAP + XE BM', 'XE BINH MY')) return 'ingredient_chieu_xay';
      return 'unknown_slide_xay';
    }

    return 'unknown_slide_xay';
  }

  return 'unknown';
}

function orderSlides(allSlides) {
  const classified = allSlides.map((slideHtml, index) => ({
    slideHtml,
    index,
    type: classifySlide(slideHtml),
    preview: extractTextFromSlideHtml(slideHtml).slice(0, 220)
  }));

  // fallback cho unknown xay
  const unknownXay = classified
    .filter((item) => item.type === 'unknown_slide_xay')
    .sort((a, b) => a.index - b.index);

  if (unknownXay[0]) unknownXay[0].type = 'ingredient_trua_xay';
  if (unknownXay[1]) unknownXay[1].type = 'ingredient_chieu_xay';

  // vá case classifier nhận nhầm slide chiều xay thành trưa xay
  const truaXaySlides = classified
    .filter((item) => item.type === 'ingredient_trua_xay')
    .sort((a, b) => a.index - b.index);

  if (truaXaySlides.length >= 2) {
    const second = truaXaySlides[1];
    const secondText = extractTextFromSlideHtml(second.slideHtml);

    const looksLikeChieu =
      secondText.includes(normalizeText('CHIEU')) &&
      (
        secondText.includes(normalizeText('XE BINH MY')) ||
        secondText.includes(normalizeText('XE BM')) ||
        secondText.includes(normalizeText('BINH MY + XE BINH MY')) ||
        secondText.includes(normalizeText('CUM BINH MY + XE BINH MY'))
      );

    if (looksLikeChieu) {
      second.type = 'ingredient_chieu_xay';
    }
  }

  const buckets = new Map();
  classified.forEach((item) => {
    if (!buckets.has(item.type)) buckets.set(item.type, []);
    buckets.get(item.type).push(item);
  });

  const takeFirst = (key) => {
    const arr = buckets.get(key) || [];
    return arr.length ? arr.shift().slideHtml : null;
  };

  const ordered = [
    takeFirst('rau'),
    takeFirst('ingredient_sang'),
    takeFirst('menu_sang_govap'),
    takeFirst('menu_sang_binhmy'),
    takeFirst('xao_trua'),
    takeFirst('ingredient_trua_xay'),
    takeFirst('ingredient_trua_main'),
    takeFirst('menu_trua_govap'),
    takeFirst('menu_trua_binhmy'),
    takeFirst('ingredient_chieu_xay'),
    takeFirst('ingredient_chieu_main'),
    takeFirst('menu_chieu_govap'),
    takeFirst('menu_chieu_binhmy')
  ].filter(Boolean);

  const leftovers = [];
  for (const [type, arr] of buckets.entries()) {
    for (const item of arr) leftovers.push(item);
  }

  console.log('CLASSIFIED SLIDES:', classified.map((x) => ({
    index: x.index,
    type: x.type,
    preview: x.preview
  })));

  console.log('LEFTOVER SLIDES:', leftovers.map((x) => ({
    index: x.index,
    type: x.type,
    preview: x.preview
  })));

  return [...ordered, ...leftovers.map((x) => x.slideHtml)];
}

function injectDeckStyles() {
  const old = document.getElementById('deck-runtime-style');
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = 'deck-runtime-style';
  style.textContent = `
    :root {
  --deck-w: 1920;
  --deck-h: 1080;
      --ui-bg: rgba(0,0,0,.55);
      --ui-fg: #fff;
      --deck-scale: 1;
    }

    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
    }

    #app {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      position: relative;
      background: #000;
    }

    #deck-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }

    .deck-stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #000;
    }

    /* reset nhẹ, KHÔNG đụng transform */
    section.slide {
      margin: 0 !important;
    }

.deck-slide {
  position: absolute !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  border: 0 !important;
  background: #000 !important;
  display: none !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  transform: none !important;
}
    .deck-slide.is-active {
      display: block !important;
    }

    .deck-ui {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      z-index: 20;
      pointer-events: none;
      color: var(--ui-fg);
      font: 700 16px/1.2 Arial, Helvetica, sans-serif;
    }

    .deck-badge,
    .deck-help {
      background: var(--ui-bg);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      padding: 8px 12px;
      backdrop-filter: blur(4px);
      white-space: nowrap;
    }

    .deck-help {
      opacity: .88;
      max-width: calc(100vw - 180px);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .deck-ui.is-hidden {
      display: none;
    }

    .deck-progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 4px;
      background: rgba(255,255,255,.12);
      z-index: 21;
    }

    .deck-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #ffe54d, #ff4ddd);
      transition: width .18s ease;
    }
      .deck-slide table,
.deck-slide th,
.deck-slide td {
  border-width: 2px !important;
}

    .deck-blackout {
      position: absolute;
      inset: 0;
      background: #000;
      z-index: 30;
      display: none;
    }

    .deck-blackout.is-on {
      display: block;
    }

    .deck-slide.tight-1 .menu-title {
  font-size: 52px !important;
}

.deck-slide.tight-1 .date-head {
  font-size: 40px !important;
  height: 64px !important;
}

.deck-slide.tight-1 .meal-head {
  font-size: 38px !important;
}

.deck-slide.tight-1 .menu-head,
.deck-slide.tight-1 .total-head {
  font-size: 28px !important;
}

.deck-slide.tight-1 .dish {
  font-size: 24px !important;
}

.deck-slide.tight-1 .total-col {
  font-size: 24px !important;
}

.deck-slide.tight-1 .site-sl,
.deck-slide.tight-1 .site-kg {
  height: 48px !important;
  font-size: 21px !important;
}

.deck-slide.tight-1 .sl {
  font-size: 22px !important;
}

.deck-slide.tight-1 .noi {
  font-size: 18px !important;
}
   .deck-slide.tight-2 .menu-title {
  font-size: 46px !important;
}

.deck-slide.tight-2 .date-head {
  font-size: 36px !important;
  height: 56px !important;
}

.deck-slide.tight-2 .meal-head {
  font-size: 34px !important;
}

.deck-slide.tight-2 .menu-head,
.deck-slide.tight-2 .total-head {
  font-size: 25px !important;
}

.deck-slide.tight-2 .dish {
  font-size: 21px !important;
}

.deck-slide.tight-2 .total-col {
  font-size: 21px !important;
}

.deck-slide.tight-2 .site-sl,
.deck-slide.tight-2 .site-kg {
  height: 42px !important;
  font-size: 18px !important;
}

.deck-slide.tight-2 .sl {
  font-size: 19px !important;
}

.deck-slide.tight-2 .noi {
  font-size: 16px !important;
}

    .deck-slide.tight-3 .menu-title {
  font-size: 40px !important;
}

.deck-slide.tight-3 .date-head {
  font-size: 32px !important;
  height: 50px !important;
}

.deck-slide.tight-3 .meal-head {
  font-size: 30px !important;
}

.deck-slide.tight-3 .menu-head,
.deck-slide.tight-3 .total-head {
  font-size: 22px !important;
}

.deck-slide.tight-3 .dish {
  font-size: 18px !important;
}

.deck-slide.tight-3 .total-col {
  font-size: 18px !important;
}

.deck-slide.tight-3 .site-sl,
.deck-slide.tight-3 .site-kg {
  height: 36px !important;
  font-size: 16px !important;
}

.deck-slide.tight-3 .sl {
  font-size: 17px !important;
}

.deck-slide.tight-3 .noi {
  font-size: 14px !important;
}

    @media (max-width: 900px) {
      .deck-help {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function fillMissingDates(slides) {
  const today = getRunDateVN();

  slides.forEach((slide) => {
    slide.querySelectorAll('.date-head, .date-cell, .main-date').forEach((el) => {
      const txt = String(el.textContent || '').trim();
      if (!txt) {
        el.textContent = today;
      }
    });
  });
}

function isMenuSlide(slide) {
  return !!slide.querySelector('table.menu-grid');
}

function measureOverflow(slide) {
  const prevDisplay = slide.style.display;
  const prevVisibility = slide.style.visibility;

  slide.style.display = 'block';
  slide.style.visibility = 'hidden';
  slide.classList.add('is-active');

  const overflowX = slide.scrollWidth - slide.clientWidth;
  const overflowY = slide.scrollHeight - slide.clientHeight;

  slide.classList.remove('is-active');
  slide.style.display = prevDisplay;
  slide.style.visibility = prevVisibility;

  return {
    overflowX,
    overflowY,
    hasOverflow: overflowX > 2 || overflowY > 2
  };
}

function autoTightSlides(slides) {
  slides.forEach((slide) => {
    slide.classList.remove('tight-1', 'tight-2', 'tight-3');

    if (!isMenuSlide(slide)) return;

    let m = measureOverflow(slide);
    if (!m.hasOverflow) return;

    slide.classList.add('tight-1');
    m = measureOverflow(slide);
    if (!m.hasOverflow) return;

    slide.classList.remove('tight-1');
    slide.classList.add('tight-2');
    m = measureOverflow(slide);
    if (!m.hasOverflow) return;

    slide.classList.remove('tight-2');
    slide.classList.add('tight-3');
  });
}

function buildDeck() {
  const root = document.getElementById('deck-root');
  const rawSlides = Array.from(root.querySelectorAll('section.slide'));

  if (!rawSlides.length) {
    throw new Error('Không tìm thấy slide nào trong HTML đã render.');
  }

  rawSlides.forEach((slide) => slide.classList.add('deck-slide'));

  fillMissingDates(rawSlides);
  autoTightSlides(rawSlides);

  const stage = document.createElement('div');
  stage.className = 'deck-stage';
  rawSlides.forEach((slide) => stage.appendChild(slide));

  const ui = document.createElement('div');
  ui.className = 'deck-ui';
  ui.innerHTML = `
    <div class="deck-badge"><span id="deckCounter">1 / ${rawSlides.length}</span></div>
    <div class="deck-help">← → / PageUp PageDown / Space / Enter · F fullscreen · B màn đen · H ẩn hiện thanh</div>
  `;

  const progress = document.createElement('div');
  progress.className = 'deck-progress';
  progress.innerHTML = `<div class="deck-progress-bar" id="deckProgressBar"></div>`;

  const blackout = document.createElement('div');
  blackout.className = 'deck-blackout';

  root.innerHTML = '';
  root.append(stage, ui, progress, blackout);

  let index = 0;
  let blackoutOn = false;

  function fitSlides() {
    rawSlides.forEach((slide, i) => {
      slide.style.transform = 'none';
      slide.classList.toggle('is-active', i === index);
    });
  }

  function render() {
    rawSlides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
    });

    fitSlides();

    const counter = document.getElementById('deckCounter');
    const bar = document.getElementById('deckProgressBar');

    if (counter) counter.textContent = `${index + 1} / ${rawSlides.length}`;
    if (bar) bar.style.width = `${((index + 1) / rawSlides.length) * 100}%`;

    location.hash = `slide-${index + 1}`;
  }

  function goTo(nextIndex) {
    const safe = Math.max(0, Math.min(rawSlides.length - 1, nextIndex));
    if (safe === index) return;
    index = safe;
    render();
  }

  function first() {
    goTo(0);
  }

  function last() {
    goTo(rawSlides.length - 1);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function toggleBlackout() {
    blackoutOn = !blackoutOn;
    blackout.classList.toggle('is-on', blackoutOn);
  }

  function initFromHash() {
    const m = String(location.hash || '').match(/slide-(\d+)/i);
    if (!m) {
      index = 0;
      return;
    }

    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= rawSlides.length) {
      index = n - 1;
    } else {
      index = 0;
    }
  }

  window.addEventListener('resize', () => {
    autoTightSlides(rawSlides);
    render();
  }, { passive: true });

  document.addEventListener('fullscreenchange', () => {
    autoTightSlides(rawSlides);
    render();
  });

  window.addEventListener('hashchange', () => {
    initFromHash();
    render();
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key;

    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(key)) {
      e.preventDefault();
      goTo(index + 1);
      return;
    }

    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) {
      e.preventDefault();
      goTo(index - 1);
      return;
    }

    if (key === 'Home') {
      e.preventDefault();
      first();
      return;
    }

    if (key === 'End') {
      e.preventDefault();
      last();
      return;
    }

    if (key === 'f' || key === 'F') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }

    if (key === 'b' || key === 'B' || key === '.') {
      e.preventDefault();
      toggleBlackout();
      return;
    }

    if (key === 'h' || key === 'H') {
      e.preventDefault();
      ui.classList.toggle('is-hidden');
      progress.style.display = progress.style.display === 'none' ? '' : 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (e.button === 0) goTo(index + 1);
  });

  let touchX = null;
  document.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches?.[0]?.clientX ?? null;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const endX = e.changedTouches?.[0]?.clientX ?? null;
    if (touchX == null || endX == null) return;

    const delta = endX - touchX;
    if (Math.abs(delta) < 40) return;

    if (delta < 0) goTo(index + 1);
    else goTo(index - 1);
  }, { passive: true });

  initFromHash();
  render();
}

async function loadDeck() {
  const app = document.getElementById('app');

  try {
    const [rauHtml, ingredientHtml, menuHtml, xaoHtml] = await Promise.all([
      fetchText('./rau.html'),
      fetchText('./ingredient.html'),
      fetchText('./menu.html'),
      fetchText('./xao.html')
    ]);

    injectDeckStyles();

    const allSlides = [
      ...splitSlidesFromHtml(rauHtml),
      ...splitSlidesFromHtml(ingredientHtml),
      ...splitSlidesFromHtml(menuHtml),
      ...splitSlidesFromHtml(xaoHtml)
    ];

    const orderedSlides = orderSlides(allSlides);

    app.innerHTML = `
      <div id="deck-root">
        ${orderedSlides.join('\n')}
      </div>
    `;

    buildDeck();

    console.log('Slides loaded:', {
      total: allSlides.length,
      ordered: orderedSlides.length,
      types: allSlides.map((s) => classifySlide(s)),
      orderedTypes: orderedSlides.map((s) => classifySlide(s)),
      requiredOrder: [
        'rau',
        'ingredient_sang',
        'menu_sang_govap',
        'menu_sang_binhmy',
        'xao_trua',
        'ingredient_trua_xay',
        'ingredient_trua_main',
        'menu_trua_govap',
        'menu_trua_binhmy',
        'ingredient_chieu_xay',
        'ingredient_chieu_main',
        'menu_chieu_govap',
        'menu_chieu_binhmy'
      ]
    });

    console.log('FINAL ORDER PREVIEW:', orderedSlides.map((s, i) => ({
      pos: i + 1,
      type: classifySlide(s),
      preview: extractTextFromSlideHtml(s).slice(0, 120)
    })));
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div style="color:#fff;padding:20px;font:16px Arial">
        Lỗi tải dữ liệu bảng LED.<br>
        ${String(err?.message || err)}
      </div>
    `;
  }
}

loadDeck();
