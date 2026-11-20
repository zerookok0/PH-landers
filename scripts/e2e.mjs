#!/usr/bin/env node
/**
 * End-to-end smoke test with a real Chromium/Edge over CDP (no third-party deps).
 *
 *   home -> ADD TO CART -> /cart.html (+qty) -> /checkout (fill card) -> /order/<no>
 *
 *   node scripts/e2e.mjs [baseUrl]      # default http://127.0.0.1:4199
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://127.0.0.1:4199').replace(/\/+$/, '');
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('no edge/chrome found');

const port = 9400 + Math.floor(Math.random() * 300);
const profile = `${process.env.TEMP}\\e2e-${Date.now()}`;
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,1000',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const check = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`);
  }
};

const main = async () => {
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('cdp not ready');

  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });

  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res.result.value;
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await sleep(2600);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  console.log(`\n[e2e] ${BASE}\n`);

  // 1. home
  await goto(BASE + '/');
  const home = await evaluate(`
    const cards = document.querySelectorAll('.ld-card').length;
    const firstHref = document.querySelector('.ld-card-media')?.getAttribute('href') || '';
    const navCount = document.querySelectorAll('.ld-side a').length;
    return { cards, firstHref, navCount, title: document.title };
  `);
  check(home.cards > 10, 'home renders product cards', `${home.cards} cards`);
  check(home.navCount > 5, 'sidebar categories injected', `${home.navCount} links`);
  check(/\/product\.html\?id=\d+/.test(home.firstHref), 'product link shape', home.firstHref);

  // 2. add to cart
  const added = await evaluate(`
    document.querySelector('.ld-card [data-add]').click();
    await new Promise(r => setTimeout(r, 400));
    const cart = JSON.parse(localStorage.getItem('ld_cart') || '[]');
    return { count: cart.length, qty: cart[0]?.qty || 0, price: cart[0]?.price || 0, listPrice: cart[0]?.listPrice || 0, badge: document.getElementById('ld-cart-count')?.textContent };
  `);
  check(added.count === 1, 'add-to-cart creates one line');
  check(added.qty === 1, 'qty is 1');
  check(
    added.price > 0 && added.price === Math.round(added.listPrice / 2),
    'sale price is exactly half of list (centavos, rounded)',
    `${added.price} / ${added.listPrice}`
  );
  check(added.badge === '1', 'header badge synced to 1');

  // 2b. 进场弹窗 + 像素事件
  const pop = await evaluate(`
    await new Promise(r => setTimeout(r, 1400));
    const m = document.getElementById('ld-modal');
    const events = (window.LD && window.LD.pixel && window.LD.pixel.log || []).map(e => e.name);
    return {
      exists: !!m,
      visible: !!(m && m.classList.contains('is-on')),
      title: m?.querySelector('#ld-modal-title')?.textContent || '',
      cta: m?.querySelector('.ld-modal-cta')?.getAttribute('href') || '',
      events,
    };
  `);
  check(pop.exists && pop.visible, 'promo modal pops on first visit', pop.title);
  check(pop.cta.includes('/'), 'promo modal has CTA link', pop.cta);
  check(pop.events.includes('PageView'), 'pixel fired PageView', pop.events.join(','));
  check(pop.events.includes('AddToCart'), 'pixel fired AddToCart', pop.events.join(','));

  // 3. product page
  await evaluate(`
    const cart = JSON.parse(localStorage.getItem('ld_cart'));
    location.href = '/product.html?id=' + cart[0].id + '&cat=' + cart[0].cat;
    return true;
  `);
  await sleep(2600);
  const pd = await evaluate(`
    return {
      h1: document.querySelector('#ld-product h1')?.textContent || '',
      now: document.querySelector('.ld-pv-price .now')?.textContent || '',
      was: document.querySelector('.ld-pv-price .was')?.textContent || '',
      addBtn: !!document.getElementById('ld-add-main'),
      stacked: !!document.querySelector('#ld-product .ld-pv-media') && !!document.querySelector('#ld-product .ld-pv-body'),
      related: document.querySelectorAll('#ld-related .ld-card').length,
      pageView: (window.LD && window.LD.pixel && window.LD.pixel.log || []).map(e => e.name),
    };
  `);
  check(pd.h1.length > 3, 'product page title', pd.h1.slice(0, 40));
  check(/[\u20B1]/.test(pd.now) && /[\u20B1]/.test(pd.was), 'product page shows sale + list price', `${pd.now} / ${pd.was}`);
  check(pd.addBtn, 'product page has ADD TO CART');
  check(pd.stacked, 'product page is stacked (media above body)');
  check(pd.pageView.includes('ViewContent'), 'pixel fired ViewContent', pd.pageView.join(','));
  check(pd.related > 0, 'related products rendered', `${pd.related} cards`);

  // 4. cart page qty
  await goto(BASE + '/cart.html');
  const cartPage = await evaluate(`
    const row = document.querySelector('.ld-cart-row');
    row.querySelector('[data-step="1"]').click();
    await new Promise(r => setTimeout(r, 400));
    const cart = JSON.parse(localStorage.getItem('ld_cart'));
    return { rows: document.querySelectorAll('.ld-cart-row').length, qty: cart[0].qty, sum: document.getElementById('ld-cart-summary')?.textContent.includes('Total') };
  `);
  check(cartPage.rows === 1, 'cart page has one row');
  check(cartPage.qty === 2, 'qty + works', `qty=${cartPage.qty}`);
  check(cartPage.sum, 'cart summary shows total');

  // 5. checkout page contract state
  await goto(BASE + '/checkout?utm_source=facebook&adset_id=123');
  const co = await evaluate(`
    const c = window.__BP_CART__;
    const t = document.getElementById('bp-total');
    return {
      cardFields: document.querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length,
      orderNumber: c.order_number,
      total: c.total,
      totalAmount: c.total_amount,
      domAmount: t?.dataset.amount,
      textMatch: t?.textContent === c.total_amount,
      utm: JSON.parse(sessionStorage.getItem('bp_utm') || '{}'),
      connectorLoaded: !!document.querySelector('script[src="/bp/connector.js"]'),
      apiCart: await (await fetch('/api/cart')).json(),
    };
  `);
  check(co.cardFields === 3, 'checkout has 3 card inputs');
  check(/^ORD-/.test(co.orderNumber), 'order number generated', co.orderNumber);
  check(co.total > 0, 'total is integer centavos', String(co.total));
  check(String(co.domAmount) === String(co.total), 'data-amount matches __BP_CART__.total');
  check(co.textMatch, 'total text matches total_amount', co.totalAmount);
  check(co.utm.utm_source === 'facebook' && co.utm.adset_id === '123', 'utm captured', JSON.stringify(co.utm));
  check(co.connectorLoaded, 'connector.js loaded');
  check(co.apiCart.total === co.total, '/api/cart total matches frontend', String(co.apiCart.total));

  // 6. submit with a valid test card (connector validates card format first)
  await evaluate(`
    document.getElementById('t-name').value = 'Juan Dela Cruz';
    document.getElementById('t-email').value = 'juan@example.com';
    document.getElementById('t-phone').value = '+639171234567';
    document.getElementById('t-addr').value = '12 Mabini St, Barangay Poblacion';
    document.getElementById('t-city').value = 'Makati';
    document.getElementById('t-zip').value = '1210';
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('bp-card-number', '4242424242424242');
    set('bp-card-expiry', '12/30');
    set('bp-card-cvc', '123');
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('bp-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return true;
  `);
  await sleep(4500);
  const after = await evaluate(`
    await new Promise(r => setTimeout(r, 1200));
    const log = (window.LD && window.LD.pixel && window.LD.pixel.log || []);
    const purchase = log.filter(e => e.name === 'Purchase').pop();
    return {
      url: location.pathname,
      no: document.getElementById('ld-order-no')?.textContent || '',
      total: document.getElementById('ld-order-total')?.textContent || '',
      purchase: !!purchase,
      purchaseParams: purchase ? JSON.stringify(purchase.params) : '',
    };
  `);
  check(/^\/order\/ORD-/.test(after.url), 'redirected to /order/<no>', after.url);
  check(/^ORD-/.test(after.no), 'success page shows order number', after.no);
  check(/[\u20B1]/.test(after.total), 'success page shows amount', after.total);
  check(after.purchase, 'pixel fired Purchase after card submit', after.purchaseParams);

  // 7. console errors
  const errors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => JSON.stringify(e.params).slice(0, 160));
  const realErrors = errors.filter((t) => !/annangourmet|socket\.io|WebSocket|connect_error|ERR_NAME|net::/i.test(t));
  check(realErrors.length === 0, 'no unhandled page errors', realErrors.slice(0, 2).join(' | '));

  console.log(`\n[e2e] pass=${pass} fail=${fail}\n`);
  ws.close();
  child.kill();
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch (e) {}
  process.exit(fail ? 1 : 0);
};

main().catch((e) => {
  console.error('[e2e] fatal', e.message);
  try {
    child.kill();
  } catch (err) {}
  process.exit(2);
});
