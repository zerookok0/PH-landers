#!/usr/bin/env node
/**
 * 生成站点信息页 / 条款页。
 *   - terms-and-conditions.html、privacy.html 由 raw/docs/*.md（原站正文）转成 HTML
 *   - 其余信息页是本站文案（结构对齐原站导航）
 *
 * 用法：node scripts/gen-info.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const DOCS = path.join(ROOT, 'raw', 'docs');

const shell = (title, body, { desc = '' } = {}) => `<!doctype html>
<html lang="en-PH">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Landers Superstore</title>
  <meta name="description" content="${desc || title}">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/assets/base.css">
  <script defer src="/assets/config.js"></script>
  <script defer src="/assets/pixel.js"></script>
  <script defer src="/assets/layout.js"></script>
</head>
<body>
  <div id="ld-header"></div>
  <main class="ld-wrap">
    <div class="ld-crumb"><a href="/">Home</a> / ${title}</div>
    <article class="ld-doc">
${body}
    </article>
  </main>
  <div id="ld-footer"></div>
</body>
</html>
`;

/* ---------- markdown（jina 输出）→ HTML ---------- */
function mdToHtml(md) {
  let text = md;
  const start = text.search(/\*\*Membership Terms and Conditions\*\*|\*\*[A-Z][^*]{4,120}\*\*/);
  if (start > 0) text = text.slice(start);
  const endMarkers = ['MY ACCOUNT', 'OUR STORES', 'CONTACT US', 'Store Business Hours'];
  const endIdx = Math.min(
    ...endMarkers.map((m) => {
      const i = text.indexOf(m);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    })
  );
  if (endFinite(endIdx)) text = text.slice(0, endIdx);

  const lines = text.split('\n');
  const out = [];
  let para = [];

  const inline = (s) =>
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*{2,}/g, '')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/&nbsp;/g, ' ')
      .trim();

  const flush = () => {
    if (!para.length) return;
    const chunk = para.join(' ').trim();
    para = [];
    if (!chunk) return;
    if (/^\d+\./.test(chunk) || /^[-*]\s/.test(chunk)) {
      out.push(`<p>${inline(chunk.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''))}</p>`);
    } else if (/^#{1,6}\s/.test(chunk)) {
      out.push(`<h2>${inline(chunk.replace(/^#{1,6}\s*/, ''))}</h2>`);
    } else if (chunk.length < 90 && /\*\*$/.test(chunk.trim()) === false && /^[A-Z0-9 ,&'’\-()]+$/.test(chunk)) {
      out.push(`<h2>${inline(chunk)}</h2>`);
    } else {
      out.push(`<p>${inline(chunk)}</p>`);
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line) || /^\s*[-*]\s+/.test(line)) {
      flush();
      para.push(line.replace(/^\s*\d+\.\s+/, '').replace(/^\s*[-*]\s+/, ''));
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      const level = (line.match(/^#+/) || ['#'])[0].length;
      out.push(level <= 2 ? `<h2>${inline(line.replace(/^#+\s*/, ''))}</h2>` : `<h3>${inline(line.replace(/^#+\s*/, ''))}</h3>`);
      continue;
    }
    para.push(line);
  }
  flush();

  return out.join('\n');
}
const endFinite = (n) => Number.isFinite(n) && n !== Number.MAX_SAFE_INTEGER;

/* ---------- 手写信息页 ---------- */
const PAGES = {
  'about.html': [
    'About Landers',
    `<h1>About Landers Superstore</h1>
<p>Landers Superstore is the Philippines' premier membership shopping destination, bringing world-class groceries, appliances, home essentials and a curated selection of global brands closer to Filipino families.</p>
<h2>Our Stores</h2>
<p>With branches across Metro Manila, Cebu, Naga, Bacolod and Davao, Landers serves members both in-store and online through <b>landers.ph</b>. Orders placed online are picked from your nearest branch and delivered to your door.</p>
<h2>The Landers Experience</h2>
<p>Members enjoy exclusive food counts, multi-purpose counters, a bakery and deli, an in-house pharmacy, and free delivery thresholds on qualifying orders.</p>
<h2>Membership</h2>
<p>Landers is a membership store. Apply online, renew in a branch, or use the digital membership card in the Landers app. See <a href="/membership.html">Membership</a> for details.</p>`,
  ],
  'help.html': [
    'Help Center',
    `<h1>Help Center</h1>
<p>Everything you need to place an order, fix a delivery issue, or use your membership online.</p>
<h2 id="contact">Contact Us</h2>
<p>Online Customer Service is available 7am – 9pm, Monday to Sunday (excluding holidays). Use the live chat button in the Landers app, or email the customer service desk listed on your order confirmation.</p>
<h2 id="voucher">How to Use a Voucher</h2>
<p>Vouchers are applied at checkout: enter the voucher code in the cart summary, confirm the discount appears in the order total, then continue to payment. Vouchers are single-use unless stated otherwise and cannot be combined with other promotions.</p>
<h2 id="save-card">How to Save a Credit Card</h2>
<p>Saved cards are tokenized by our payment partner and never stored on Landers servers. To keep checkout fast on your next order, tick “Save card for future purchases” when paying.</p>
<h2>How to Shop Online</h2>
<p>Enter your delivery location, add items to the cart, choose your delivery slot, and pay. Read the full guide in <a href="/how-to-shop.html">How to Shop Online</a>.</p>
<h2>Track an Order</h2>
<p>Use <a href="/track.html">Track &amp; Trace</a> with your order number (format <code>ORD-YYYYMMDD-XXXX</code>).</p>`,
  ],
  'delivery-areas.html': [
    'Delivery Areas',
    `<h1>Delivery Areas</h1>
<p>Landers delivers from the branch nearest to your shipping address. Enter your delivery location at the top of the page to confirm availability and the next available 2-hour slot.</p>
<h2>Coverage</h2>
<ul>
  <li>Metro Manila — all cities, 7 days a week (7am – 9pm slots)</li>
  <li>Cebu — Cebu City, Mandaue, Lapu-Lapu, Talisay</li>
  <li>Naga — Naga City and adjacent municipalities</li>
  <li>Bacolod — Bacolod City and nearby towns</li>
  <li>Davao — Davao City and suburbs</li>
</ul>
<h2>Delivery Fees</h2>
<p>Delivery is free above the qualifying basket amount of your membership tier; below that a flat delivery fee applies, shown before payment.</p>
<h2>Pick-up in Store</h2>
<p>Prefer to collect? Choose “Pick up in store” at checkout and pick your order from the designated counter.</p>`,
  ],
  'membership.html': [
    'Membership',
    `<h1>Landers Membership</h1>
<p>Membership unlocks member pricing, exclusive counts, and free delivery thresholds. Apply, renew or look up your benefits below.</p>
<h2 id="apply">Apply Membership</h2>
<p>Apply online with a valid government ID and a selfie for verification. Digital cards are issued immediately; physical cards follow by courier.</p>
<h2 id="renew">Renew Membership</h2>
<p>Renew at any Landers branch counter or through the app. Renewal keeps your card number and accumulated vouchers.</p>
<h2 id="benefits">Membership Benefits</h2>
<ul>
  <li>Member pricing across the whole catalogue</li>
  <li>Exclusive “Selection by Landers” merchandise</li>
  <li>Free delivery above the tier threshold</li>
  <li>Fuel discounts at partner stations</li>
</ul>
<h2 id="digital">Digital Membership Card</h2>
<p>Your card lives in the Landers app. Show the QR at the counter, or use the card number at checkout to attach member pricing to online orders.</p>
<h2 id="rewards">Rewards Hub</h2>
<p>Collect stamps and vouchers in the Rewards Hub inside the app. Vouchers can be applied at cart or checkout.</p>
<h2 id="login">Login</h2>
<p>Sign in with your registered email or mobile number. This clone renders the storefront only; member accounts are not created here.</p>`,
  ],
  'how-to-shop.html': [
    'How to Shop Online',
    `<h1>How to Shop Online</h1>
<h2>1. Set your delivery location</h2>
<p>Use “Enter Your Delivery Location” in the header to confirm that your address is serviceable.</p>
<h2>2. Fill your cart</h2>
<p>Browse a category, tap <b>ADD TO CART</b>, then adjust quantities in the cart page.</p>
<h2>3. Choose a slot</h2>
<p>Slots are 2-hour windows. Same-day slots close when the branch capacity is reached.</p>
<h2>4. Pay</h2>
<p>Pay by credit or debit card. You will receive an order number in the format <code>ORD-YYYYMMDD-XXXX</code> and a confirmation screen.</p>
<h2>5. Track</h2>
<p>Use <a href="/track.html">Track &amp; Trace</a> any time after checkout.</p>`,
  ],
  'store.html': [
    'Store Locator',
    `<h1>Store Locator</h1>
<h2>Metro Manila</h2>
<ul><li>Landers Arcovia (Pasig)</li><li>Landers Otis (Manila)</li><li>Landers Alabang West (Muntinlupa)</li><li>Landers Uptown (BGC)</li><li>Landers Fairview (Quezon City)</li></ul>
<h2>Provincial</h2>
<ul><li>Landers Cebu (Cebu City)</li><li>Landers Naga (Camarines Sur)</li><li>Landers Bacolod (Negros Occidental)</li><li>Landers Davao (Davao City)</li></ul>
<p>Store hours: 9am – 9pm daily. Online customer service: 7am – 9pm.</p>`,
  ],
  'track.html': [
    'Track &amp; Trace',
    `<h1>Track &amp; Trace</h1>
<p>Enter the order number you received after checkout.</p>
<form onsubmit="event.preventDefault();var v=this.o.value.trim();document.getElementById('tr').innerHTML=v?('<p><b>Order '+v.replace(/[<>&]/g,'')+'</b> — preparing at your chosen branch. You will receive an SMS when the rider is on the way.</p>'):'';">
  <p style="display:flex;gap:8px;max-width:520px"><input name="o" placeholder="ORD-20261120-XXXX" style="flex:1;height:44px;border:1px solid #e6e8ee;border-radius:6px;padding:0 12px"><button class="ld-btn" type="submit">TRACK</button></p>
</form>
<div id="tr"></div>`,
  ],
  'careers.html': [
    'Careers at Landers',
    `<h1>Careers at Landers</h1>
<p>Landers is hiring across store operations, supply chain, digital commerce and corporate functions.</p>
<h2>Open areas</h2>
<ul><li>Store supervisors and section heads</li><li>Warehouse and cold-chain associates</li><li>Riders and delivery coordinators</li><li>Software engineers (e-commerce platform)</li></ul>
<p>Send your CV to the careers desk listed in the store locator. This page is part of a storefront clone and does not collect applications.</p>`,
  ],
  'business.html': [
    'Landers for Business',
    `<h1>Landers for Business</h1>
<p>Bulk orders, office pantry supply and reseller pricing for registered businesses.</p>
<h2>What you get</h2>
<ul><li>Tiered volume discounts on top of member pricing</li><li>Consolidated invoicing with VAT</li><li>Dedicated account manager and scheduled deliveries</li></ul>
<p>Apply in-store with your BIR 2303 and SEC/DTI registration.</p>`,
  ],
  'bir-registration.html': [
    'BIR Registration',
    `<h1>BIR Registration</h1>
<p>Landers Superstore is a BIR-registered taxpayer. Official receipts / sales invoices are issued for every transaction and may be requested at checkout for business orders.</p>
<h2>Details</h2>
<ul><li>TIN and branch code are printed on the official receipt</li><li>VAT is included in displayed prices</li><li>For B2B invoicing, use <a href="/business.html">Landers for Business</a></li></ul>`,
  ],
  'app.html': [
    'Download the App',
    `<h1>Download the Landers App</h1>
<p>The app carries your digital membership card, delivery slots, vouchers and order tracking.</p>
<p style="display:flex;gap:12px;align-items:center">
  <img src="/assets/app-store.png" alt="App Store" style="height:40px">
  <img src="/assets/google-play.png" alt="Google Play" style="height:40px">
</p>
<h2>Features</h2>
<ul><li>Digital membership card and QR</li><li>Faster checkout with saved addresses</li><li>Order tracking and reorder</li><li>Rewards Hub vouchers</li></ul>`,
  ],
  'experience.html': [
    'The Landers Experience',
    `<h1>The Landers Experience</h1>
<p>More than a supermarket: food counts, a bakery and deli, an in-house pharmacy, household and outdoor ranges, and a rotating line-up of international selections.</p>
<h2>In-store</h2>
<ul><li>Food Count — freshly cooked Filipino and international dishes</li><li>Bakery &amp; Deli — baked on site daily</li><li>Capital Care Pharmacy — prescriptions and wellness</li><li>Selection by Landers — exclusive imported labels</li></ul>`,
  ],
  'promotions.html': [
    'Promotions',
    `<h1>Promotions</h1>
<p>Every item in this storefront is listed at <b>50% off the regular shelf price</b>. Browse a category to see the full range.</p>
<div id="ld-cats" class="ld-grid" style="margin-top:18px"></div>
<script>
fetch('/data/categories.json').then(r=>r.json()).then(cats=>{
  document.getElementById('ld-cats').innerHTML = cats.filter(c=>c.slug!=='uncategorized')
    .map(c=>'<a class="ld-card" style="text-decoration:none" href="/c/'+c.slug+'"><div class="ld-card-name" style="height:auto">'+c.name+'</div><div class="ld-card-brand">'+c.count+' products · 50% off</div></a>')
    .join('');
});
</script>`,
  ],
  'new-trending.html': [
    'New &amp; Trending',
    `<h1>New &amp; Trending</h1>
<p>The latest arrivals across the store, all at half the shelf price.</p>
<div id="ld-new" class="ld-grid"></div>
<script>
fetch('/data/home.json').then(r=>r.json()).then(h=>{
  const items = (h.rails.find(r=>r.title==='New & Trending')||{items:[]}).items;
  const money = c => '\u20B1' + (Math.round(c/2)/100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  document.getElementById('ld-new').innerHTML = items.map(p=>{
    const sale = Math.round(Math.round(p.price*100)/2);
    return '<a class="ld-card" style="text-decoration:none" href="/product.html?id='+p.id+'&cat='+encodeURIComponent(p.cat)+'">'
      + '<div class="ld-card-media"><span class="ld-badge">-50%</span><img loading="lazy" src="'+p.img+'" alt=""></div>'
      + '<div class="ld-card-name">'+p.name+'</div>'
      + '<div class="ld-price"><span class="ld-price-now">'+money(sale*2)+'</span><span class="ld-price-was">\u20B1'+p.price.toFixed(2)+'</span></div></a>';
  }).join('');
});
</script>`,
  ],
};

const docPage = (title, html) => shell(title, html);

const main = () => {
  // 条款 / 隐私：原站正文
  for (const [md, file, title] of [
    ['terms.md', 'terms-and-conditions.html', 'Terms and Conditions'],
    ['privacy.md', 'privacy.html', 'Security & Privacy Policy'],
  ]) {
    const src = path.join(DOCS, md);
    if (!fs.existsSync(src)) {
      console.warn('[info] 缺少 ' + src + '，跳过（先跑抓取脚本）');
      continue;
    }
    const html = mdToHtml(fs.readFileSync(src, 'utf8'));
    fs.writeFileSync(
      path.join(SITE, file),
      docPage(title, `<h1>${title}</h1>\n${html}`),
      'utf8'
    );
    console.log(`[info] ${file} <- ${md} (${html.length} bytes)`);
  }

  for (const [file, [title, body]] of Object.entries(PAGES)) {
    fs.writeFileSync(path.join(SITE, file), docPage(title, body), 'utf8');
  }
  console.log(`[info] 信息页 ${Object.keys(PAGES).length} 个已生成`);
};

main();
