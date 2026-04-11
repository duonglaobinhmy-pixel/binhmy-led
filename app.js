async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Không tải được ${url}: ${res.status}`);
    }
    return await res.text();
  }
  
  async function loadDeck() {
    const app = document.getElementById('app');
  
    try {
      const [rauHtml, ingredientHtml, menuHtml] = await Promise.all([
        fetchText('./rau.html'),
        fetchText('./ingredient.html'),
        fetchText('./menu.html'),
      ]);
  
      app.innerHTML = `
        <div id="deck-root">
          ${rauHtml}
          ${ingredientHtml}
          ${menuHtml}
        </div>
      `;
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