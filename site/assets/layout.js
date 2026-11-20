/* 页头 / 侧边栏 / 页脚 / 进场弹窗 —— 每个页面注入同一份结构。
   数据依赖：/data/categories.json、/assets/config.js（弹窗文案） */
(function () {
  const LANDERS_LOGO = '/assets/logo-dark.png';
  const CFG = (window.LD_CONFIG = window.LD_CONFIG || {});

  const TOPBAR = [
    ['Download the App', '/app'],
    ['About Landers', '/about'],
    ['The Landers Experience', '/experience'],
    ['Delivery Areas', '/delivery-areas'],
    ['Track Orders', '/track'],
  ];

  const FOOTER = [
    {
      title: 'Customer Service',
      links: [
        ['Help Center', '/help'],
        ['Contact Us', '/help#contact'],
        ['How to Shop Online', '/how-to-shop'],
        ['How to Apply Membership', '/membership'],
        ['Track and Trace', '/track'],
      ],
    },
    {
      title: 'About Landers',
      links: [
        ['About Landers', '/about'],
        ['The Landers Experience', '/experience'],
        ['Delivery Areas', '/delivery-areas'],
        ['Store Locator', '/store'],
        ['Careers at Landers', '/careers'],
        ['Landers for Business', '/business'],
      ],
    },
    {
      title: 'Policies',
      links: [
        ['Terms and Conditions', '/terms-and-conditions'],
        ['Security & Privacy Policy', '/privacy'],
        ['BIR Registration', '/bir-registration'],
        ['How to Use Voucher', '/help#voucher'],
        ['How to Save Credit Card', '/help#save-card'],
      ],
    },
    {
      title: 'Membership',
      links: [
        ['Apply Membership', '/membership'],
        ['Renew Membership', '/membership#renew'],
        ['Membership Benefits', '/membership#benefits'],
        ['Digital Membership Card', '/membership#digital'],
        ['Rewards Hub', '/membership#rewards'],
      ],
    },
  ];

  const HOURS = [
    'Manila Stores: 9am - 9pm',
    'Cebu Store: 9am - 9pm',
    'Naga Store: 9am - 9pm',
    'Bacolod Store: 9am - 9pm',
    'Davao Store: 9am - 9pm',
    'Online Customer Service: 7am - 9pm',
    'Monday to Sunday',
    '*excluding Holidays',
  ];

  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const cartCount = () => {
    try {
      const c = JSON.parse(localStorage.getItem('ld_cart') || '[]');
      return c.reduce((n, it) => n + (it.qty || 0), 0);
    } catch (e) {
      return 0;
    }
  };

  function paintBadge() {
    const badge = document.getElementById('ld-cart-count');
    if (badge) badge.textContent = String(cartCount());
  }

  const ICON = {
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4H5L4 6H2v2h2l3.6 7.6L6.2 18H19v-2H8.4l1.1-2H16a2 2 0 0 0 1.8-1.1L21 6H6.2L5.3 4H7z"/><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/></svg>',
    menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>',
  };

  function buildHeader(mount) {
    const head = el(`
      <div>
        <div class="ld-topbar">
          <div class="ld-wrap">
            ${TOPBAR.map(([t, h]) => `<a href="${h}">${t}</a>`).join('')}
          </div>
        </div>
        <header class="ld-header">
          <div class="ld-wrap">
            <button class="ld-burger" id="ld-burger" type="button" aria-label="Open categories">${ICON.menu}<span>Categories</span></button>
            <a class="ld-logo" href="/" aria-label="Landers Superstore">
              <img src="${LANDERS_LOGO}" alt="Landers Superstore" width="140" height="40">
            </a>
            <form class="ld-search" role="search" action="/search" method="get">
              <input type="search" name="q" placeholder="Search for products, brands and more" aria-label="Search">
              <button type="submit" aria-label="Search">${ICON.search}<span>SEARCH</span></button>
            </form>
            <div class="ld-head-actions">
              <a class="ld-loc" href="/delivery-areas" title="Delivery location">
                ${ICON.pin}<span>Enter Your Delivery Location</span>
              </a>
              <a class="ld-head-link" href="/membership">Sign Up</a>
              <a class="ld-head-link" href="/membership#login">Login</a>
              <a class="ld-cart-btn" href="/cart">
                ${ICON.cart}
                <span>Cart</span>
                <span class="ld-cart-count" id="ld-cart-count">0</span>
              </a>
            </div>
          </div>
        </header>
      </div>
    `);
    mount.replaceWith(head);
    paintBadge();
    fillSidebar();
    bindBurger();
  }

  /* ---------- 左侧分类栏（原站是侧边栏，不是顶栏） ---------- */
  async function fillSidebar() {
    const side = document.getElementById('ld-side');
    if (!side) return;

    let cats = [];
    try {
      cats = await (await fetch('/data/categories.json')).json();
    } catch (e) {
      cats = [];
    }
    const here = location.pathname.replace(/\/+$/, '') || '/';
    const rows = [
      `<a class="ld-side-item ld-side-new" href="/promotions"><span>NEW!</span> Selection by Landers</a>`,
      `<a class="ld-side-item" href="/new-trending">New &amp; Trending</a>`,
      `<a class="ld-side-item" href="/promotions">Promotions</a>`,
      `<div class="ld-side-sep"></div>`,
      ...cats
        .filter((c) => c.slug !== 'uncategorized')
        .map(
          (c) =>
            `<a class="ld-side-item${here === `/c/${c.slug}` ? ' is-active' : ''}" href="/c/${c.slug}">
               <span class="ld-side-name">${c.name}</span>
               <span class="ld-side-count">${c.count}</span>
             </a>`
        ),
    ];

    side.innerHTML = `
      <div class="ld-side-head">All Categories</div>
      <nav class="ld-side-list" aria-label="Product categories">${rows.join('')}</nav>
    `;
    side.dataset.ready = '1';
  }

  function bindBurger() {
    const btn = document.getElementById('ld-burger');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const side = document.getElementById('ld-side');
      if (side) side.classList.toggle('is-open');
      document.body.classList.toggle('ld-side-open');
    });
  }

  function buildFooter(mount) {
    const cols = FOOTER.map(
      (col) => `
        <div>
          <h4>${col.title}</h4>
          <ul>${col.links.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul>
        </div>`
    ).join('');

    const foot = el(`
      <footer class="ld-footer">
        <div class="ld-wrap">
          <div class="ld-footer-main">
            ${cols}
            <div>
              <h4>Store Business Hours</h4>
              <div class="ld-footer-hours">${HOURS.join('<br>')}</div>
              <h4 style="margin-top:16px">Follow Us</h4>
              <div class="ld-social">
                <a href="https://www.facebook.com/LandersPH/" target="_blank" rel="noopener"><img src="https://assets.landers.ph/FB2.png" alt="Facebook"></a>
                <a href="https://www.instagram.com/landersph/" target="_blank" rel="noopener"><img src="https://assets.landers.ph/IG.png" alt="Instagram"></a>
                <a href="https://www.youtube.com/channel/UC-35-er6ht5owbxt_uStfsw" target="_blank" rel="noopener"><img src="https://assets.landers.ph/YT.png" alt="YouTube"></a>
              </div>
            </div>
          </div>
          <div class="ld-footer-bottom">
            <div>© ${new Date().getFullYear()} Landers Superstore — clone build for internal review.</div>
            <div class="ld-apps">
              <a href="/app"><img src="/assets/app-store.png" alt="App Store"></a>
              <a href="/app"><img src="/assets/google-play.png" alt="Google Play"></a>
            </div>
          </div>
        </div>
      </footer>
    `);
    mount.replaceWith(foot);
  }

  /* ---------- 进场弹窗（预告活动，文案在 /assets/config.js） ---------- */
  function buildPromoModal() {
    const m = CFG.promoModal || {};
    if (!m.enabled) return;
    const page = document.body.dataset.page || '';
    if (Array.isArray(m.pages) && m.pages.length && !m.pages.includes(page)) return;

    const key = 'ld_promo_' + (m.title || 'default').replace(/\s+/g, '-').slice(0, 40);
    const ttl = Number(m.ttlHours || 0) * 3600 * 1000;
    if (ttl > 0) {
      try {
        const seen = Number(localStorage.getItem(key) || 0);
        if (seen && Date.now() - seen < ttl) return;
      } catch (e) {}
    }

    const pop = el(`
      <div class="ld-modal" id="ld-modal" role="dialog" aria-modal="true" aria-labelledby="ld-modal-title">
        <div class="ld-modal-backdrop" data-close="1"></div>
        <div class="ld-modal-card">
          <button class="ld-modal-x" type="button" data-close="1" aria-label="Close">&times;</button>
          <div class="ld-modal-media${m.image ? ' has-img' : ''}"${m.image ? ` style="background-image:url('${m.image}')"` : ''}>
            ${m.badge ? `<span class="ld-modal-badge">${m.badge}</span>` : ''}
            ${
              m.image
                ? ''
                : `<div class="ld-modal-hero">
                     <strong>${m.mediaTitle || '50% OFF'}</strong>
                     <em>${m.mediaSubtitle || 'STORE WIDE'}</em>
                   </div>`
            }
          </div>
          <div class="ld-modal-body">
            <h3 id="ld-modal-title">${m.title || ''}</h3>
            ${m.subtitle ? `<p class="ld-modal-sub">${m.subtitle}</p>` : ''}
            ${m.body ? `<p class="ld-modal-text">${m.body}</p>` : ''}
            ${
              Array.isArray(m.bullets) && m.bullets.length
                ? `<ul class="ld-modal-list">${m.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
                : ''
            }
            <a class="ld-btn ld-modal-cta" href="${m.ctaHref || '/'}">${m.cta || 'SHOP NOW'}</a>
            <button class="ld-modal-dismiss" type="button" data-close="1">${m.dismiss || 'Maybe later'}</button>
          </div>
        </div>
      </div>
    `);

    const close = () => {
      pop.classList.remove('is-on');
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch (e) {}
      setTimeout(() => pop.remove(), 260);
    };

    document.body.appendChild(pop);
    pop.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.contains(pop)) close();
    });
    setTimeout(() => pop.classList.add('is-on'), Number(m.delayMs || 800));
  }

  const boot = () => {
    const hm = document.getElementById('ld-header');
    if (hm) buildHeader(hm);
    const fm = document.getElementById('ld-footer');
    if (fm) buildFooter(fm);
    window.addEventListener('ld:cart-changed', paintBadge);
    buildPromoModal();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
