/* 站点主逻辑：价格口径、购物车、商品卡渲染、各页面初始化。
   价格口径（全站唯一）：售价 = 原站标价 ÷ 2，四舍五入到分（centavos 整数）。 */
(function () {
  const LD = (window.LD = window.LD || {});

  /* ---------------- 价格 ---------------- */
  const CENTS = (peso) => Math.round(Number(peso || 0) * 100);
  const HALF = (cents) => Math.round(cents / 2);
  const money = (cents) => {
    const v = (Math.round(cents) / 100).toFixed(2);
    const [int, dec] = v.split('.');
    return '\u20B1' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
  };
  LD.CENTS = CENTS;
  LD.HALF = HALF;
  LD.money = money;
  LD.pricing = (pricePeso) => {
    const list = CENTS(pricePeso);
    const sale = HALF(list);
    return { list, sale, listText: money(list), saleText: money(sale) };
  };

  /* ---------------- 数据 ---------------- */
  const cache = new Map();
  LD.json = async (url) => {
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url, { credentials: 'same-origin' }).then((r) => {
          if (!r.ok) throw new Error(url + ' -> ' + r.status);
          return r.json();
        })
      );
    }
    return cache.get(url);
  };

  /* ---------------- 购物车 ---------------- */
  const CART_KEY = 'ld_cart';
  const readCart = () => {
    try {
      const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(v) ? v.filter((it) => it && it.id) : [];
    } catch (e) {
      return [];
    }
  };
  const writeCart = (items) => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('ld:cart-changed'));
    syncServerCart(items);
  };
  const syncServerCart = (items) => {
    // 服务端 /api/cart 读这个 cookie（契约 §5.2 的双保险）
    try {
      const compact = items.map((it) => ({ i: it.id, q: it.qty, n: it.name, p: it.price, g: it.img, c: it.cat }));
      document.cookie =
        'ld_cart=' +
        encodeURIComponent(JSON.stringify(compact)) +
        '; path=/; max-age=1209600; SameSite=Lax';
    } catch (e) {}
  };

  LD.cart = readCart;
  LD.cartCount = () => readCart().reduce((n, it) => n + it.qty, 0);
  LD.cartTotal = () => readCart().reduce((n, it) => n + it.price * it.qty, 0);

  LD.addToCart = (product, qty) => {
    const items = readCart();
    const n = Math.max(1, Number(qty) || 1);
    const found = items.find((it) => it.id === product.id);
    if (found) found.qty = Math.min(999, found.qty + n);
    else
      items.push({
        id: product.id,
        name: product.name,
        price: HALF(CENTS(product.price)),
        listPrice: CENTS(product.price),
        img: product.img,
        cat: product.cat,
        qty: n,
      });
    writeCart(items);
    LD.toast('Added to cart · ' + product.name.slice(0, 42));
    try {
      window.LD.pixel && window.LD.pixel.addToCart(product, n);
    } catch (e) {}
  };

  LD.setQty = (id, qty) => {
    const items = readCart();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.qty = Math.max(1, Math.min(999, Number(qty) || 1));
    writeCart(items);
  };

  LD.removeItem = (id) => {
    writeCart(readCart().filter((it) => it.id !== id));
  };

  /* ---------------- UI 小工具 ---------------- */
  LD.toast = (msg) => {
    let t = document.querySelector('.ld-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'ld-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('is-on'), 1900);
  };

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  LD.productHref = (p) => `/product.html?id=${p.id}&cat=${encodeURIComponent(p.cat)}`;

  LD.card = (p) => {
    const pr = LD.pricing(p.price);
    return `
      <article class="ld-card" data-id="${p.id}">
        <a class="ld-card-media" href="${LD.productHref(p)}">
          <span class="ld-badge">-50%</span>
          <img loading="lazy" src="${esc(p.img)}" alt="${esc(p.name)}">
        </a>
        <a class="ld-card-name" href="${LD.productHref(p)}">${esc(p.name)}</a>
        <div class="ld-card-brand">${esc(p.brand || '')}</div>
        <div class="ld-price">
          <span class="ld-price-now">${pr.saleText}</span>
          <span class="ld-price-was">${pr.listText}</span>
          <span class="ld-price-off">-50%</span>
        </div>
        <div class="ld-card-actions">
          <button class="ld-add" data-add="${p.id}">ADD TO CART</button>
        </div>
      </article>`;
  };

  const bindAdd = (root) => {
    root.addEventListener('click', (e) => {
      // 同一事件可能冒泡到多个已绑定容器（body + 轨道容器），只处理一次
      if (e.__ldAdd) return;
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      e.__ldAdd = true;
      e.preventDefault();
      const id = btn.getAttribute('data-add');
      const holder = btn.closest('[data-product-json]');
      let product = null;
      if (holder) product = JSON.parse(holder.getAttribute('data-product-json'));
      if (!product) product = (window.__LD_INDEX__ || {})[id];
      if (!product) return;
      LD.addToCart(product, 1);
    });
  };

  /* ---------------- 首页 ---------------- */
  async function initHome() {
    const [home, cats] = await Promise.all([LD.json('/data/home.json'), LD.json('/data/categories.json')]);

    // 轮播
    const hero = document.getElementById('ld-hero');
    if (hero && home.banners?.length) {
      const track = hero.querySelector('.ld-hero-track');
      const dots = hero.querySelector('.ld-hero-dots');
      track.innerHTML = home.banners
        .map(
          (b, i) =>
            `<a href="/promotions.html"><img src="${esc(b)}" alt="Landers banner ${i + 1}" ${i ? 'loading="lazy"' : ''}></a>`
        )
        .join('');
      dots.innerHTML = home.banners
        .map((_, i) => `<button type="button" data-slide="${i}" class="${i === 0 ? 'is-on' : ''}"></button>`)
        .join('');
      let idx = 0;
      const go = (n) => {
        idx = (n + home.banners.length) % home.banners.length;
        track.style.transform = `translateX(-${idx * 100}%)`;
        dots.querySelectorAll('button').forEach((b, i) => b.classList.toggle('is-on', i === idx));
      };
      dots.addEventListener('click', (e) => {
        const b = e.target.closest('[data-slide]');
        if (b) {
          go(Number(b.getAttribute('data-slide')));
          clearInterval(timer);
        }
      });
      const timer = setInterval(() => go(idx + 1), 5200);
    }

    // 类目瓷片
    const tiles = document.getElementById('ld-tiles');
    if (tiles) {
      tiles.innerHTML = home.tiles
        .map(
          (t) => `<a class="ld-tile" href="/c/${t.slug}.html">
            <img loading="lazy" src="${esc(t.img)}" alt="${esc(t.name)}">
            <div>${esc(t.name)}</div></a>`
        )
        .join('');
    }

    // 商品轨道
    const rails = document.getElementById('ld-rails');
    if (rails) {
      rails.innerHTML = home.rails
        .filter((r) => r.items?.length)
        .map(
          (r) => `
          <section class="ld-section">
            <div class="ld-section-head">
              <h2>${esc(r.title)}</h2>
              ${r.href ? `<a href="${r.href}">See All</a>` : ''}
            </div>
            <div class="ld-rail">${r.items.map(LD.card).join('')}</div>
          </section>`
        )
        .join('');
      window.__LD_INDEX__ = {};
      home.rails.forEach((r) => r.items.forEach((p) => (window.__LD_INDEX__[p.id] = p)));
      bindAdd(rails);
    }

    // 类目捷径
    const shortcut = document.getElementById('ld-shortcuts');
    if (shortcut) {
      shortcut.innerHTML = cats
        .filter((c) => c.slug !== 'uncategorized')
        .slice(0, 12)
        .map((c) => `<a class="ld-tile" href="/c/${c.slug}.html"><div>${esc(c.name)}</div></a>`)
        .join('');
    }
  }

  /* ---------------- 分类页 ---------------- */
  const PAGE_SIZE = 48;
  async function initCategory() {
    const slug = document.body.dataset.cat;
    const data = await LD.json(`/data/cat/${slug}.json`);
    const grid = document.getElementById('ld-grid');
    const count = document.getElementById('ld-count');
    const pager = document.getElementById('ld-pager');
    const sortSel = document.getElementById('ld-sort');
    const params = new URLSearchParams(location.search);
    let page = Math.max(1, Number(params.get('page') || 1));
    let sort = params.get('sort') || 'default';

    document.getElementById('ld-cat-name').textContent = data.name;
    document.title = data.name + ' | Landers Superstore';

    const apply = () => {
      let items = data.items.slice();
      if (sort === 'price-asc') items.sort((a, b) => a.price - b.price);
      else if (sort === 'price-desc') items.sort((a, b) => b.price - a.price);
      else if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
      else items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      page = Math.min(page, pages);
      const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      grid.innerHTML = slice.map(LD.card).join('');
      count.textContent = `${items.length} products · page ${page} / ${pages}`;
      window.__LD_INDEX__ = {};
      slice.forEach((p) => (window.__LD_INDEX__[p.id] = p));

      const nums = [];
      const push = (n) => nums.push(`<button class="${n === page ? 'is-on' : ''}" data-page="${n}">${n}</button>`);
      nums.push(`<button data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Prev</button>`);
      const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
      for (let n = windowStart; n < windowStart + Math.min(5, pages); n++) push(n);
      nums.push(`<button data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button>`);
      pager.innerHTML = nums.join('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    pager.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      page = Number(b.getAttribute('data-page'));
      apply();
    });
    sortSel.addEventListener('change', () => {
      sort = sortSel.value;
      page = 1;
      apply();
    });
    sortSel.value = sort;
    bindAdd(grid);
    apply();
  }

  /* ---------------- 商品页 ---------------- */
  async function initProduct() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('id'));
    let cat = params.get('cat');
    if (!cat) {
      const lookup = await LD.json('/data/lookup.json');
      cat = lookup[id];
    }
    const data = await LD.json(`/data/cat/${cat}.json`);
    const p = data.items.find((x) => x.id === id) || data.items[0];
    if (!p) {
      document.getElementById('ld-product').innerHTML =
        '<div class="ld-empty"><h2>Product not found</h2><p>This item is no longer available.</p></div>';
      return;
    }
    document.title = p.name + ' | Landers Superstore';

    const pr = LD.pricing(p.price);
    const imgs = p.imgs && p.imgs.length ? p.imgs : [p.img];
    const box = document.getElementById('ld-product');
    const crumb = document.getElementById('ld-crumb');
    if (crumb) {
      crumb.innerHTML = `<a href="/">Home</a> / <a href="/c/${p.cat}.html">${esc(data.name)}</a> / ${esc(p.name)}`;
    }

    box.innerHTML = `
      <div class="ld-pv-media"><img id="ld-main-img" src="${esc(imgs[0])}" alt="${esc(p.name)}"></div>
      ${
        imgs.length > 1
          ? `<div class="ld-pv-thumbs">${imgs
              .map(
                (src, i) =>
                  `<img src="${esc(src)}" alt="${esc(p.name)} ${i + 1}" data-thumb="${i}" class="${
                    i === 0 ? 'is-on' : ''
                  }">`
              )
              .join('')}</div>`
          : ''
      }
      <div class="ld-pv-body">
        <h1>${esc(p.name)}</h1>
        <div class="ld-pv-meta">
          ${p.brand ? `Brand: <b>${esc(p.brand)}</b> · ` : ''}SKU: ${esc(p.sku)} · Category:
          <a href="/c/${p.cat}.html">${esc(data.name)}</a>
        </div>
        <div class="ld-pv-price">
          <span class="now">${pr.saleText}</span>
          <span class="was">${pr.listText}</span>
          <span class="off">-50%</span>
        </div>
        <div class="ld-pv-stock">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
          In stock — delivered from your selected Landers branch
        </div>
        <div class="ld-pv-buy">
          <div class="ld-qty">
            <button type="button" data-step="-1" aria-label="Decrease quantity">-</button>
            <input id="ld-qty-input" type="number" value="1" min="1" max="999" inputmode="numeric" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="ld-btn" id="ld-add-main">ADD TO CART</button>
          <a class="ld-btn ld-btn-ghost" href="/cart.html">View Cart</a>
        </div>
        <div class="ld-desc">
          <h3>Product Details</h3>
          ${esc(p.desc || p.name + '\n\nSold by Landers Superstore. Prices shown are 50% off the regular shelf price.')}
        </div>
      </div>`;

    const qty = box.querySelector('#ld-qty-input');
    box.querySelectorAll('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        qty.value = Math.max(1, Math.min(999, Number(qty.value || 1) + Number(b.dataset.step)));
      })
    );
    box.querySelector('#ld-add-main').addEventListener('click', () => LD.addToCart(p, Number(qty.value) || 1));
    box.querySelectorAll('[data-thumb]').forEach((t) =>
      t.addEventListener('click', () => {
        box.querySelector('#ld-main-img').src = imgs[Number(t.dataset.thumb)];
        box.querySelectorAll('[data-thumb]').forEach((x) => x.classList.remove('is-on'));
        t.classList.add('is-on');
      })
    );

    const related = data.items.filter((x) => x.id !== p.id).slice(0, 12);
    const rel = document.getElementById('ld-related');
    if (rel && related.length) {
      rel.innerHTML = related.map(LD.card).join('');
      window.__LD_INDEX__ = {};
      related.forEach((x) => (window.__LD_INDEX__[x.id] = x));
      bindAdd(rel);
    }

    try {
      window.LD.pixel && window.LD.pixel.viewContent(p);
    } catch (e) {}
  }

  /* ---------------- 搜索 ---------------- */
  async function initSearch() {
    const q = (new URLSearchParams(location.search).get('q') || '').trim();
    const input = document.getElementById('ld-search-input');
    const head = document.getElementById('ld-search-head');
    const grid = document.getElementById('ld-grid');
    if (input) input.value = q;
    if (!q) {
      head.textContent = 'Type something to search the Landers catalogue.';
      return;
    }
    const index = await LD.json('/data/search.json');
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = index.filter((p) => {
      const n = p.name.toLowerCase();
      return words.every((w) => n.includes(w));
    });
    head.textContent = `${hits.length} results for “${q}”`;
    window.__LD_SEARCH_HITS__ = hits;
    const slice = hits.slice(0, 120);
    grid.innerHTML = slice.map(LD.card).join('');
    window.__LD_INDEX__ = {};
    slice.forEach((p) => (window.__LD_INDEX__[p.id] = { ...p, price: p.price }));
    bindAdd(grid);
  }

  /* ---------------- 购物车页 ---------------- */
  function initCart() {
    const items = readCart();
    const list = document.getElementById('ld-cart-list');
    const summary = document.getElementById('ld-cart-summary');
    if (!items.length) {
      list.innerHTML = `<div class="ld-empty">
        <h2>Your cart is empty</h2>
        <p>Browse the aisles and add something you love.</p>
        <p style="margin-top:16px"><a class="ld-btn" href="/">START SHOPPING</a></p>
      </div>`;
      summary.innerHTML = '';
      return;
    }
    list.innerHTML = items
      .map(
        (it) => `
        <div class="ld-cart-row" data-row="${it.id}">
          <a href="/product.html?id=${it.id}&cat=${encodeURIComponent(it.cat || '')}">
            <img src="${esc(it.img)}" alt="${esc(it.name)}">
          </a>
          <div class="name">
            <a href="/product.html?id=${it.id}&cat=${encodeURIComponent(it.cat || '')}">${esc(it.name)}</a>
            <div class="unit">${money(it.listPrice)} → <b>${money(it.price)}</b> each</div>
          </div>
          <div class="ld-qty">
            <button type="button" data-step="-1" aria-label="Decrease quantity">-</button>
            <input type="number" min="1" max="999" value="${it.qty}" data-qty="${it.id}" aria-label="Quantity">
            <button type="button" data-step="1" aria-label="Increase quantity">+</button>
          </div>
          <div class="sum">${money(it.price * it.qty)}</div>
          <button class="ld-cart-remove" data-remove="${it.id}" aria-label="Remove">×</button>
        </div>`
      )
      .join('');

    const total = LD.cartTotal();
    const saved = items.reduce((n, it) => n + (it.listPrice - it.price) * it.qty, 0);
    summary.innerHTML = `
      <h3>Order Summary</h3>
      <div class="ld-sum-row"><span>Items</span><span>${items.reduce((n, it) => n + it.qty, 0)}</span></div>
      <div class="ld-sum-row"><span>Regular price</span><span>${money(total + saved)}</span></div>
      <div class="ld-sum-row"><span>You save (50%)</span><span style="color:#dc3545">-${money(saved)}</span></div>
      <div class="ld-sum-row total"><span>Total</span><span>${money(total)}</span></div>
      <p style="margin-top:16px"><a class="ld-btn" style="display:block;text-align:center;line-height:44px" href="/checkout.html">CHECKOUT</a></p>
      <p style="text-align:center;margin-top:10px"><a href="/" style="font-size:13px;color:#83b151">Continue shopping</a></p>`;

    if (!list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', (e) => {
        const step = e.target.closest('[data-step]');
        if (step) {
          const row = step.closest('[data-row]');
          const id = Number(row.dataset.row);
          const input = row.querySelector('[data-qty]');
          LD.setQty(id, Number(input.value) + Number(step.dataset.step));
          initCart();
          return;
        }
        const rm = e.target.closest('[data-remove]');
        if (rm) {
          LD.removeItem(Number(rm.dataset.remove));
          initCart();
        }
      });
      list.addEventListener('change', (e) => {
        const input = e.target.closest('[data-qty]');
        if (!input) return;
        LD.setQty(Number(input.dataset.qty), Number(input.value));
        initCart();
      });
    }
    syncServerCart(items);
  }

  /* ---------------- 成功页 ---------------- */
  function initOrder() {
    const no = decodeURIComponent(location.pathname.replace(/^\/order\/?/, '')) || '—';
    document.getElementById('ld-order-no').textContent = no;

    const paint = (order) => {
      if (!order) return;
      document.getElementById('ld-order-email').textContent = order.email || '—';
      document.getElementById('ld-order-total').textContent = money(order.total || 0);
      document.getElementById('ld-order-lines').innerHTML = (order.items || [])
        .map(
          (it) =>
            `<div class="ld-order-line"><span>${esc(it.name)} × ${it.qty}</span><b>${money(
              it.price * it.qty
            )}</b></div>`
        )
        .join('');
    };

    let order = null;
    try {
      order = JSON.parse(sessionStorage.getItem('ld_last_order') || 'null');
    } catch (e) {}
    paint(order);
    if (order && order.total) return;

    // 兜底：connector 直接跳转时前端没落盘，回读服务端购物车快照（cookie 里还在）
    fetch('/api/cart', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.total) return;
        paint({
          email: order?.email || '',
          total: j.total,
          items: (j.items || []).map((it) => ({ ...it })),
        });
      })
      .catch(() => {});
  }

  /* ---------------- 启动 ---------------- */
  const boot = async () => {
    bindAdd(document.body);
    const page = document.body.dataset.page;
    try {
      if (page === 'home') await initHome();
      else if (page === 'category') await initCategory();
      else if (page === 'product') await initProduct();
      else if (page === 'search') await initSearch();
      else if (page === 'cart') initCart();
      else if (page === 'order') initOrder();
    } catch (err) {
      console.error('[ld]', err);
      const box = document.querySelector('#ld-grid, #ld-product, #ld-rails');
      if (box) box.innerHTML = `<div class="ld-empty"><h2>Loading problem</h2><p>${esc(err.message)}</p></div>`;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
