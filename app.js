async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không tải được ${url}: ${res.status}`);
  return await res.text();
}

function injectDeckStyles() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --ui-bg: rgba(0,0,0,.55);
      --ui-fg: #fff;
      --safe-top: 18;
      --safe-right: 18;
      --safe-bottom: 64;
      --safe-left: 18;
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
      width: 100vw !important;
      height: 100vh !important;
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
      inset: 0;
      display: none;
      overflow: hidden;
      background: #000;
    }

    .deck-slide.is-active {
      display: block;
    }

    .deck-slide-viewport {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #000;
    }

    .deck-slide-inner {
      position: absolute;
      left: 50%;
      top: 50%;
      transform-origin: center center;
      background: #000;
      will-change: transform;
    }

    .deck-slide-inner > *:first-child {
      margin-top: 0 !important;
    }

    .deck-slide table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
    }

    .deck-slide img,
    .deck-slide svg,
    .deck-slide canvas {
      max-width: 100%;
      height: auto;
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

  rawSlides.forEach((slide) => {
    slide.classList.add('deck-slide');

    const viewport = document.createElement('div');
    viewport.className = 'deck-slide-viewport';

    const inner = document.createElement('div');
    inner.className = 'deck-slide-inner';

    while (slide.firstChild) inner.appendChild(slide.firstChild);

    viewport.appendChild(inner);
    slide.appendChild(viewport);
  });

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

  function safeViewport() {
    const cs = getComputedStyle(document.documentElement);
    const top = Number(cs.getPropertyValue('--safe-top')) || 18;
    const right = Number(cs.getPropertyValue('--safe-right')) || 18;
    const bottom = Number(cs.getPropertyValue('--safe-bottom')) || 64;
    const left = Number(cs.getPropertyValue('--safe-left')) || 18;

    return {
      width: Math.max(100, window.innerWidth - left - right),
      height: Math.max(100, window.innerHeight - top - bottom),
    };
  }

  function measureInner(inner) {
    const prevVisibility = inner.style.visibility;
    const prevTransform = inner.style.transform;
    const prevLeft = inner.style.left;
    const prevTop = inner.style.top;

    inner.style.visibility = 'hidden';
    inner.style.left = '0';
    inner.style.top = '0';
    inner.style.transform = 'none';

    const width = Math.max(
      Math.ceil(inner.scrollWidth || 0),
      Math.ceil(inner.getBoundingClientRect().width || 0),
      1
    );

    const height = Math.max(
      Math.ceil(inner.scrollHeight || 0),
      Math.ceil(inner.getBoundingClientRect().height || 0),
      1
    );

    inner.style.visibility = prevVisibility;
    inner.style.transform = prevTransform;
    inner.style.left = prevLeft;
    inner.style.top = prevTop;

    return { width, height };
  }

  function fitOneSlide(slide) {
    const inner = slide.querySelector('.deck-slide-inner');
    if (!inner) return;

    const vp = safeViewport();
    const size = measureInner(inner);

    const scaleX = vp.width / size.width;
    const scaleY = vp.height / size.height;
    const scale = Math.min(scaleX, scaleY);

    inner.style.width = `${size.width}px`;
    inner.style.height = `${size.height}px`;
    inner.style.left = '50%';
    inner.style.top = '50%';
    inner.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function fitSlides() {
    rawSlides.forEach(fitOneSlide);
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
    rafId = requestAnimationFrame(render);
  }

  function goTo(nextIndex) {
    const safe = Math.max(0, Math.min(rawSlides.length - 1, nextIndex));
    if (safe === index) return;
    index = safe;
    renderSoon();
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
    const m = String(location.hash || '').match(/slide-(\\d+)/i);
    if (!m) return;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= rawSlides.length) {
      index = n - 1;
    }
  }

  window.addEventListener('resize', renderSoon, { passive: true });
  window.addEventListener('orientationchange', renderSoon);
  document.addEventListener('fullscreenchange', renderSoon);

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

  requestAnimationFrame(() => {
    render();
    setTimeout(renderSoon, 80);
    setTimeout(renderSoon, 220);
    setTimeout(renderSoon, 500);
  });
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
      <div class="deck-error">
        Lỗi tải dữ liệu bảng LED.<br />
        ${String(err?.message || err)}
      </div>
    `;
  }
}

loadDeck();
