/* 页头 / 导航 / 页脚 —— 每个页面注入同一份结构，保证全站一致。
   数据依赖：/data/categories.json（构建产物） */
(function () {
  const LANDERS_LOGO = '/assets/logo-dark.png';

  const TOPBAR = [
    ['Download the App', '/app.html'],
    ['About Landers', '/about.html'],
    ['The Landers Experience', '/experience.html'],
    ['Delivery Areas', '/delivery-areas.html'],
    ['Track Orders', '/track.html'],
  ];

  const FOOTER = [
    {
      title: 'Customer Service',
      links: [
        ['Help Center', '/help.html'],
        ['Contact Us', '/help.html#contact'],
        ['How to Shop Online', '/how-to-shop.html'],
        ['How to Apply Membership', '/membership.html'],
        ['Track and Trace', '/track.html'],
      ],
    },
    {
      title: 'About Landers',
      links: [
        ['About Landers', '/about.html'],
        ['The Landers Experience', '/experience.html'],
        ['Delivery Areas', '/delivery-areas.html'],
        ['Store Locator', '/store.html'],
        ['Careers at Landers', '/careers.html'],
        ['Landers for Business', '/business.html'],
      ],
    },
    {
      title: 'Policies',
      links: [
        ['Terms and Conditions', '/terms-and-conditions.html'],
        ['Security & Privacy Policy', '/privacy.html'],
        ['BIR Registration', '/bir-registration.html'],
        ['How to Use Voucher', '/help.html#voucher'],
        ['How to Save Credit Card', '/help.html#save-card'],
      ],
    },
    {
      title: 'Membership',
      links: [
        ['Apply Membership', '/membership.html'],
        ['Renew Membership', '/membership.html#renew'],
        ['Membership Benefits', '/membership.html#benefits'],
        ['Digital Membership Card', '/membership.html#digital'],
        ['Rewards Hub', '/membership.html#rewards'],
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
            <a class="ld-logo" href="/" aria-label="Landers Superstore">
              <img src="${LANDERS_LOGO}" alt="Landers Superstore" width="140" height="46">
            </a>
            <form class="ld-search" role="search" action="/search.html" method="get">
              <input type="search" name="q" placeholder="Search for products, brands and more" aria-label="Search">
              <button type="submit">SEARCH</button>
            </form>
            <div class="ld-head-actions">
              <a class="ld-loc" href="/delivery-areas.html" title="Delivery location">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
                <span>Enter Your Delivery Location</span>
              </a>
              <a class="ld-head-link" href="/membership.html">Sign Up</a>
              <a class="ld-head-link" href="/membership.html#login">Login</a>
              <a class="ld-cart-btn" href="/cart.html">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h-2l-1 2H2v2h2l3.6 7.6-1.4 2.4H19v-2H8.4l1.1-2H16a2 2 0 0 0 1.8-1.1l3-6.9H6.2L5.3 4H7zm0 0"/><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/></svg>
                Cart <span class="ld-cart-count" id="ld-cart-count">0</span>
              </a>
            </div>
          </div>
        </header>
        <nav class="ld-nav" aria-label="Categories"><div class="ld-wrap" id="ld-nav-list"></div></nav>
      </div>
    `);
    mount.replaceWith(head);
    paintBadge();
    fillNav();
  }

  async function fillNav() {
    const box = document.getElementById('ld-nav-list');
    if (!box) return;
    let cats = [];
    try {
      cats = await (await fetch('/data/categories.json')).json();
    } catch (e) {
      cats = [];
    }
    const here = location.pathname;
    const items = cats
      .filter((c) => c.slug !== 'uncategorized')
      .map(
        (c) =>
          `<a href="/c/${c.slug}.html" class="${here === `/c/${c.slug}.html` ? 'is-active' : ''}">${c.name}</a>`
      );
    box.innerHTML =
      items.join('') +
      `<a href="/new-trending.html">New &amp; Trending</a><a href="/promotions.html">Promos</a>`;
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
              <a href="/app.html"><img src="/assets/app-store.png" alt="App Store"></a>
              <a href="/app.html"><img src="/assets/google-play.png" alt="Google Play"></a>
            </div>
          </div>
        </div>
      </footer>
    `);
    mount.replaceWith(foot);
  }

  const boot = () => {
    const hm = document.getElementById('ld-header');
    if (hm) buildHeader(hm);
    const fm = document.getElementById('ld-footer');
    if (fm) buildFooter(fm);
    window.addEventListener('ld:cart-changed', paintBadge);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
