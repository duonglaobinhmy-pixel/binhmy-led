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
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }

    #app {
      width: 100vw !important;
      height: 100vh;
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
      height: calc(var(--deck-h) * 1px) !important;
      min-height: calc(var(--deck-h) * 1px) !important;
      margin: 0 !important;
      border: 0 !important;
      overflow: hidden;
      transform-origin: center center;
      display: none;
      background: #000;
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

    .deck-badge, .deck-help {
      background: var(--ui-bg);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      padding: 8px 12px;
      backdrop-filter: blur(4px);
    }

    .deck-help { opacity: .85; }
    .deck-ui.is-hidden { display: none; }

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

    .deck-blackout.is-on { display: block; }
  `;
  document.head.appendChild(style);
}

function buildDeck() {
  const root = document.getElementById('deck-root');
  const rawSlides = Array.from(root.querySelectorAll('section.slide'));
  if (!rawSlides.length) throw new Error('Không tìm thấy slide nào trong HTML đã render.');

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
  progress.innerHTML = '<div class="deck-progress-bar" id="deckProgressBar"></div>';

  const blackout = document.createElement('div');
  blackout.className = 'deck-blackout';

  root.innerHTML = '';
  root.append(stage, ui, progress, blackout);

  let index = 0;
  let blackoutOn = false;

  function fitSlides() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / 1366, vh / 768);
    rawSlides.forEach((slide) => {
      slide.style.transform = `translate(-50%, -50%) scale(${scale})`;
    });
  }

  function render() {
    rawSlides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
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

  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }
  function first() { goTo(0); }
  function last() { goTo(rawSlides.length - 1); }

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
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1 && n <= rawSlides.length) index = n - 1;
    }
  }

  window.addEventListener('resize', fitSlides, { passive: true });
  window.addEventListener('hashchange', initFromHash);

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
    }
  });

  document.addEventListener('click', (e) => {
    if (e.button === 0) next();
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
    if (delta < 0) next(); else prev();
  }, { passive: true });

  initFromHash();
  fitSlides();
  render();
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
      <div class="error">
        Lỗi tải dữ liệu bảng LED.<br />
        ${String(err.message || err)}
      </div>
    `;
  }
}

loadDeck();
