async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không tải được ${url}: ${res.status}`);
  return await res.text();
}

function injectDeckStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --deck-w: 1366;
      --deck-h: 768;
      --ui-bg: rgba(0,0,0,.55);
      --ui-fg: #fff;
      --ui-accent: #ffe54d;
      --deck-safe-top: 24;
      --deck-safe-bottom: 70;
      --deck-safe-side: 24;
    }

    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #000;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
    }

    #app {
      width: 100vw !important;
      height: 100vh !important;
      margin: 0;
      position: relative;
      overflow: hidden;
      background: #000;
    }

    #deck-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
      user-select: none;
      touch-action: manipulation;
    }

    .deck-stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #000;
    }

    .deck-slide {
      position: absolute;
      left: 50%;
      top: 50%;
      width: calc(var(--deck-w) * 1px) !important;
      min-height: calc(var(--deck-h) * 1px) !important;
      height: auto !important;
      margin: 0 !important;
      border: 0 !important;
      overflow: visible !important;
      transform-origin: center center;
      display: none;
      background: #000;
      box-sizing: border-box;
      will-change: transform;
    }

    .deck-slide.is-active {
      display: block;
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
      pointer-events: none;
      z-index: 20;
      font: 700 16px/1.2 Arial, Helvetica, sans-serif;
      color: var(--ui-fg);
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
      max-width: calc(100vw - 160px);
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

    .deck-error {
      color: #fff;
      background: #111;
      border: 1px solid rgba(255,255,255,.16);
      padding: 16px 18px;
      border-radius: 12px;
      max-width: 900px;
      margin: 24px auto;
      font: 600 18px/1.5 Arial, Helvetica, sans-serif;
    }

    /* ép media không phá layout */
    .deck-slide img,
    .deck-slide svg,
    .deck-slide canvas {
      max-width: 100%;
      height: auto;
    }

    /* tránh table tự co hẹp quá mức */
    .deck-slide table {
      table-layout: fixed;
      width: 100%;
      border-collapse: collapse;
    }

    /* mobile nhỏ thì ẩn help cho đỡ che */
    @media (max-width: 900px) {
      .deck-help {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function buildDeck() {
  const root = document.getElementById('deck-root');
  const rawSlides = Array.from(root.querySelectorAll('section.slide'));

  if (!rawSlides.length) {
    throw new Error('Không tìm thấy slide nào trong HTML đã render.');
  }

  rawSlides.forEach((el) => el.classList.add('deck-slide'));

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
  let rafId = null;

  function getSafeViewport() {
    const styles = getComputedStyle(document.documentElement);

    const safeTop = Number(styles.getPropertyValue('--deck-safe-top')) || 24;
    const safeBottom = Number(styles.getPropertyValue('--deck-safe-bottom')) || 70;
    const safeSide = Number(styles.getPropertyValue('--deck-safe-side')) || 24;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    return {
      vw,
      vh,
      usableWidth: Math.max(100, vw - safeSide * 2),
      usableHeight: Math.max(100, vh - safeTop - safeBottom),
    };
  }

  function measureSlide(slide) {
    const wasActive = slide.classList.contains('is-active');
    const prevDisplay = slide.style.display;
    const prevVisibility = slide.style.visibility;
    const prevPointer = slide.style.pointerEvents;

    slide.style.display = 'block';
    slide.style.visibility = 'hidden';
    slide.style.pointerEvents = 'none';
    slide.classList.add('is-active');

    // reset trước khi đo
    slide.style.width = `calc(var(--deck-w) * 1px)`;
    slide.style.minHeight = `calc(var(--deck-h) * 1px)`;
    slide.style.height = 'auto';
    slide.style.transform = 'translate(-50%, -50%) scale(1)';

    const rect = slide.getBoundingClientRect();
    const scrollW = slide.scrollWidth || 0;
    const scrollH = slide.scrollHeight || 0;

    const contentWidth = Math.max(1366, Math.ceil(scrollW), Math.ceil(rect.width));
    const contentHeight = Math.max(768, Math.ceil(scrollH), Math.ceil(scrollH));

    if (!wasActive) {
      slide.classList.remove('is-active');
    }
    slide.style.display = prevDisplay;
    slide.style.visibility = prevVisibility;
    slide.style.pointerEvents = prevPointer;

    return {
      width: contentWidth,
      height: contentHeight,
    };
  }

  function fitSlide(slide) {
    const { usableWidth, usableHeight } = getSafeViewport();
    const measured = measureSlide(slide);

    slide.style.width = `${measured.width}px`;
    slide.style.minHeight = `${measured.height}px`;
    slide.style.height = `${measured.height}px`;

    const scaleX = usableWidth / measured.width;
    const scaleY = usableHeight / measured.height;
    const scale = Math.min(scaleX, scaleY);

    slide.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function fitSlides() {
    rawSlides.forEach((slide) => {
      fitSlide(slide);
    });
  }

  function updateUi() {
    const counter = document.getElementById('deckCounter');
    const bar = document.getElementById('deckProgressBar');

    if (counter) counter.textContent = `${index + 1} / ${rawSlides.length}`;
    if (bar) bar.style.width = `${((index + 1) / rawSlides.length) * 100}%`;
  }

  function render() {
    rawSlides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
    });

    fitSlides();
    updateUi();
    location.hash = `slide-${index + 1}`;
  }

  function renderSoon() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      render();
    });
  }

  function goTo(nextIndex) {
    const safe = Math.max(0, Math.min(rawSlides.length - 1, nextIndex));
    if (safe === index) return;
    index = safe;
    renderSoon();
  }

  function next() {
    goTo(index + 1);
  }

  function prev() {
    goTo(index - 1);
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
    if (!m) return;

    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= rawSlides.length) {
      index = n - 1;
    }
  }

  window.addEventListener(
    'resize',
    () => {
      renderSoon();
    },
    { passive: true }
  );

  window.addEventListener('orientationchange', () => {
    renderSoon();
  });

  document.addEventListener('fullscreenchange', () => {
    renderSoon();
  });

  window.addEventListener('hashchange', () => {
    initFromHash();
    renderSoon();
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key;

    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(key)) {
      e.preventDefault();
      next();
      return;
    }

    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(key)) {
      e.preventDefault();
      prev();
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
      return;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.button === 0) next();
  });

  let touchX = null;

  document.addEventListener(
    'touchstart',
    (e) => {
      touchX = e.changedTouches?.[0]?.clientX ?? null;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (e) => {
      const endX = e.changedTouches?.[0]?.clientX ?? null;
      if (touchX == null || endX == null) return;

      const delta = endX - touchX;
      if (Math.abs(delta) < 40) return;

      if (delta < 0) next();
      else prev();
    },
    { passive: true }
  );

  initFromHash();

  // chờ layout ổn rồi mới fit
  requestAnimationFrame(() => {
    render();
    setTimeout(renderSoon, 60);
    setTimeout(renderSoon, 180);
    setTimeout(renderSoon, 400);
  });
}

async function loadDeck() {
  const app = document.getElementById('app');

  try {
    const [rauHtml, ingredientHtml, menuHtml] = await Promise.all([
      fetchText('./rau.html'),
      fetchText('./ingredient.html'),
      fetchText('./menu.html'),
    ]);

    injectDeckStyles();

    app.innerHTML = `
      <div id="deck-root">
        ${rauHtml}
        ${ingredientHtml}
        ${menuHtml}
      </div>
    `;

    buildDeck();
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="deck-error">
        Lỗi tải dữ liệu bảng LED.<br />
        ${String(err?.message || err)}
      </div>
    `;
  }
}

loadDeck();
