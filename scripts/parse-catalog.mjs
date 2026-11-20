#!/usr/bin/env node
/**
 * 把 raw/pages/*.xml（Magento REST 产品分页）解析成站点数据。
 *
 * 输出：
 *   data/catalog.json          全量商品（默认口径：status=1 且 is_salable）
 *   data/categories.json       类目清单（slug / 名称 / 商品数）
 *   data/cat/<slug>.json       单类目商品（分类页只加载自己的一份）
 *   data/search.json           搜索用轻量索引
 *   data/home.json             首页轮播 / 类目瓷片 / 商品轨道
 *   data/lookup.json           id -> 类目 slug（商品页兜底查类目）
 *
 * 用法：node scripts/parse-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'data');
const IMG_CACHE = 'https://assets.landers.ph/catalog/product/cache/7ea2575b56506914ef5fff8fcbc8a182';
const IMG_HOST = 'https://assets.landers.ph';

/** 类目 slug -> 展示名（顺序即导航顺序，与 landers.ph 顶部导航一致） */
const CATEGORY_NAMES = {
  'food-cupboard': 'Food Cupboard',
  'health-beauty': 'Health & Beauty',
  'household-pets': 'Household & Laundry',
  'home-outdoor': 'Home & Outdoor',
  'beverages': 'Beverages',
  'dairy-chilled': 'Dairy & Chilled',
  'fruits-vegetables': 'Fruits & Vegetables',
  'beer-wine-spirits': 'Beer, Wine & Spirits',
  'rotisserie-meat-poultry-seafood': 'Rotisserie, Meat, Poultry & Seafood',
  'chocolates-candies-sweets': 'Chocolates, Candies & Sweets',
  frozen: 'Frozen',
  'baby-kids-toys': 'Baby, Kids & Toys',
  'capital-care-pharmacy': 'Capital Care Pharmacy',
  'pet-care': 'Pet Care',
  bakery: 'Bakery',
  fashion: 'Fashion',
  'anti-hoarding-and-anti-panic-buying-list': 'Anti-Hoarding List',
  solane: 'Solane LPG',
  'gtc-aldis': 'GTC & Aldis',
  uncategorized: 'Other',
};

const decode = (s = '') =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');

const stripTags = (html = '') =>
  decode(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 从分页 XML 中切出顶层 <item> 块（Magento 输出里顶层缩进 4 空格） */
function splitProducts(xml) {
  const parts = xml.split(/\r?\n {4}<item>\r?\n/);
  const blocks = parts.slice(1).map((b) => b.split(/\r?\n {4}<\/item>/)[0]);
  return blocks.length > 1 ? blocks : parts.slice(1);
}

function parseBlock(block) {
  const pick = (tag) => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? decode(m[1]) : '';
  };
  const id = Number(pick('id'));
  if (!id) return null;
  const sku = pick('sku');
  const name = pick('name');
  const price = num(pick('price'));
  const status = num(pick('status'));
  const visibility = num(pick('visibility'));
  const createdAt = pick('created_at');

  const ext = (block.match(/<extension_attributes>([\s\S]*?)<\/extension_attributes>/) || [, ''])[1];
  const extPick = (tag) => {
    const m = ext.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? decode(m[1]) : '';
  };
  const finalPrice = num(extPick('final_price') || price);
  const isSalable = extPick('is_salable') !== 'false';
  const brand = extPick('brand').trim();
  const urlKey = extPick('url_key');
  const rating = num(extPick('rating_summary'));
  const promoTag = stripTags(extPick('promo_tag'));

  const cats = [...block.matchAll(/<category_id>(\d+)<\/category_id>/g)].map((m) => Number(m[1]));

  const gallery = (block.match(/<media_gallery_entries>([\s\S]*?)<\/media_gallery_entries>/) || [, ''])[1];
  const files = [...gallery.matchAll(/<file>([^<]+)<\/file>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .map((f) => f.replace(/^\/+/, ''));

  const attrs = {};
  for (const m of block.matchAll(
    /<attribute_code>([a-z0-9_]+)<\/attribute_code>\s*<value>([\s\S]*?)<\/value>/g
  )) {
    attrs[m[1]] = stripTags(m[2]);
  }

  return {
    id,
    sku,
    name,
    brand,
    price,
    finalPrice,
    status,
    visibility,
    createdAt,
    rating,
    promoTag,
    urlKey,
    cats,
    files,
    desc: attrs.description || '',
    shortDesc: attrs.short_description || '',
    metaTitle: attrs.meta_title || '',
    metaDescription: attrs.meta_description || '',
    isSalable,
  };
}

function loadSitemapCategoryBySku() {
  const file = path.join(RAW, 'sitemap.txt');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const url = line.trim();
    if (!url) continue;
    const m = url.match(/landers\.ph\/([a-z0-9-]+)\/([a-z0-9-]+)-(\d{4,8})-(\d+)$/);
    if (!m) continue;
    map.set(m[3], { cat: m[1], slug: m[2], entityId: Number(m[4]) });
  }
  return map;
}

const main = () => {
  // 首选 raw/chunks（entity_id 分批，结果确定）；兼容旧的 raw/pages 抓法
  const chunksDir = path.join(RAW, 'chunks');
  const pagesDir = path.join(RAW, 'pages');
  const useChunks = fs.existsSync(chunksDir) && fs.readdirSync(chunksDir).some((f) => /^c\d+\.xml$/.test(f));
  const dir = useChunks ? chunksDir : pagesDir;
  const files = fs
    .readdirSync(dir)
    .filter((f) => (useChunks ? /^c\d+\.xml$/ : /^p\d+\.xml$/).test(f))
    .sort();
  if (!files.length) throw new Error('raw/chunks 里没有 XML，先跑 scripts/fetch-catalog.mjs');

  const seen = new Set();
  const all = [];
  for (const f of files) {
    const xml = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const block of splitProducts(xml)) {
      const p = parseBlock(block);
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      all.push(p);
    }
  }

  const sitemapBySku = loadSitemapCategoryBySku();

  const products = [];
  for (const p of all) {
    if (p.status !== 1) continue;
    const sm = sitemapBySku.get(p.sku);
    const cat = (sm && sm.cat) || 'uncategorized';
    const image = p.files[0] || '';
    if (!image) continue; // 一张图都没有的商品不进站，保证“图文齐全”
    products.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      price: p.price,
      finalPrice: p.finalPrice,
      url: p.urlKey || sm?.slug || String(p.id),
      cat,
      img: `${IMG_CACHE}/${image}`,
      // 只保留主图：Magento 缓存目录里的次图经常 403，多图会裂在商品页上
      imgs: [`${IMG_CACHE}/${image}`],
      rating: p.rating,
      promo: p.promoTag,
      createdAt: p.createdAt,
      desc: p.desc || p.shortDesc,
    });
  }

  const byCat = new Map();
  for (const p of products) {
    if (!byCat.has(p.cat)) byCat.set(p.cat, []);
    byCat.get(p.cat).push(p);
  }
  const categories = [...byCat.entries()]
    .map(([slug, items]) => ({
      slug,
      name: CATEGORY_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count: items.length,
    }))
    .sort((a, b) => (CATEGORY_NAMES[a.slug] === undefined) - (CATEGORY_NAMES[b.slug] === undefined) || b.count - a.count);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'cat'), { recursive: true });

  const write = (rel, obj) => {
    const file = path.join(OUT, rel);
    fs.writeFileSync(file, JSON.stringify(obj));
    return file;
  };

  write('catalog.json', { generatedAt: new Date().toISOString(), total: products.length, items: products });
  write('categories.json', categories);

  for (const [slug, items] of byCat) {
    write(`cat/${slug}.json`, {
      slug,
      name: CATEGORY_NAMES[slug] || slug,
      count: items.length,
      items,
    });
  }

  write(
    'search.json',
    products.map((p) => ({ id: p.id, name: p.name, cat: p.cat, price: p.price, img: p.img }))
  );

  write(
    'lookup.json',
    products.reduce((acc, p) => {
      acc[p.id] = p.cat;
      return acc;
    }, {})
  );

  // 首页：新上架 + 各类目顶部几个，拼成轨道交通道
  const newest = [...products].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20);
  const rails = [
    { title: 'New & Trending', href: '', items: newest },
    ...categories
      .filter((c) => c.count > 40)
      .slice(0, 6)
      .map((c) => ({
        title: c.name,
        href: `/c/${c.slug}.html`,
        items: (byCat.get(c.slug) || []).slice(0, 12),
      })),
  ];

  write('home.json', {
    banners: [
      'https://assets.landers.ph/mageplaza/bannerslider/banner/image/m/e/membership_main_web_986x384_1.jpg',
      'https://assets.landers.ph/mageplaza/bannerslider/banner/image/s/c/scsnov_main-web_986x384_nb_1_.jpg',
      'https://assets.landers.ph/mageplaza/bannerslider/banner/image/m/a/main_web_1p_what_s-new_986x384-1.jpg',
      'https://assets.landers.ph/mageplaza/bannerslider/banner/image/g/c/gcash_main_web_986x384-lm_1_.jpg',
      'https://assets.landers.ph/mageplaza/bannerslider/banner/image/i/s/iss_main_web_986x384_nov.jpg',
    ],
    tiles: [
      ['food-cupboard', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/f/o/food_cupboard_desktop_1.png'],
      ['frozen', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/f/r/frozen_3.png'],
      ['baby-kids-toys', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/b/a/baby_kids_toys_3.png'],
      ['rotisserie-meat-poultry-seafood', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/m/e/meat_seafood_3.png'],
      ['chocolates-candies-sweets', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/c/h/chocolate_sweets_3.png'],
      ['dairy-chilled', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/d/a/dairy_chilled_2.png'],
      ['bakery', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/b/a/bakery_3.png'],
      ['beer-wine-spirits', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/b/e/beer_wine_spirits_3.png'],
      ['pet-care', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/p/e/pet_care_5.png'],
      ['fruits-vegetables', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/f/r/fruits_vegetables_3.png'],
      ['home-outdoor', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/h/o/home_outdoor_3.png'],
      ['beverages', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/b/e/beverages_3.png'],
      ['health-beauty', 'https://assets.landers.ph/mageplaza/bannerslider/banner/image/h/e/health_beauty_1.png'],
    ].map(([slug, banner]) => {
      // 瓷片优先用该类目第一个商品的主图（方图、白底，观感和原站一致），拿不到再退回官方 banner
      const first = (byCat.get(slug) || [])[0];
      return {
        slug,
        img: first ? first.img : banner,
        name: CATEGORY_NAMES[slug] || slug,
      };
    }),
    rails,
  });

  const withImage = products.length;
  console.log(
    `[parse] pages=${files.length} raw=${all.length} 入站=${withImage} 类目=${categories.length} ` +
      `无图剔除=${all.filter((p) => p.status === 1).length - withImage}`
  );
  console.log(
    '[parse] top: ' +
      categories
        .slice(0, 6)
        .map((c) => `${c.slug}=${c.count}`)
        .join(' ')
  );
};

main();
