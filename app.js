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

    .deck-slide {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 1366px !important;
      min-height: 768px !important;
      margin: 0 !important;
      border: 0 !important;
      background: #000;
      display: none;
      transform-origin: center center;
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

  rawSlides.forEach((slide) => slide.classList.add('deck-slide'));

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
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    rawSlides.forEach((slide) => {
      const prevDisplay = slide.style.display;
      const prevVisibility = slide.style.visibility;

      slide.style.display = 'block';
      slide.style.visibility = 'hidden';
      slide.classList.add('is-active');

      const rect = slide.getBoundingClientRect();
      const contentWidth = Math.max(1366, Math.ceil(rect.width), Math.ceil(slide.scrollWidth || 0));
      const contentHeight = Math.max(768, Math.ceil(slide.scrollHeight || 0));

      const scale = Math.min(vw / contentWidth, vh / contentHeight);

      slide.style.transform = `translate(-50%, -50%) scale(${scale})`;

      slide.classList.remove('is-active');
      slide.style.display = prevDisplay;
      slide.style.visibility = prevVisibility;
    });

    rawSlides.forEach((slide, i) => {
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
    if (!m) return;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= rawSlides.length) {
      index = n - 1;
    }
  }

  window.addEventListener('resize', render, { passive: true });
  document.addEventListener('fullscreenchange', render);

  window.addEventListener('hashchange', () => {
    initFromHash();
    render();
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
    if (delta < 0) next();
    else prev();
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
      fetchText('./xao.html'),
    ]);

    injectDeckStyles();

    app.innerHTML = `
      <div id="deck-root">
        ${rauHtml}
        ${ingredientHtml}
        ${menuHtml}
        ${xaoHtml}
      </div>
    `;

    buildDeck();
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
