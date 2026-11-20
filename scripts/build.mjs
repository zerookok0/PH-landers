#!/usr/bin/env node
/**
 * 构建：site/ + public/ + data/ + bp/ -> dist/
 *
 *   node scripts/build.mjs
 *
 * 产物结构：
 *   dist/index.html, dist/c/<slug>.html（19 个类目页）, dist/product.html …
 *   dist/data/*.json       商品数据（分类页只加载自己的一份）
 *   dist/bp/*              结账接管包（契约要求的 /bp/ 绝对路径）
 *   dist/api/*             Pages Functions 走 functions/ 目录，不进 dist
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const SKIP_SITE_FILES = new Set(['category.html']); // 模板，不直接对外

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });

function copyDir(src, dst, { skip = new Set() } = {}) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) n += copyDir(s, d, { skip });
    else if (entry.isFile()) {
      fs.copyFileSync(s, d);
      n++;
    }
  }
  return n;
}

const stat = (dir) => {
  let files = 0;
  let bytes = 0;
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) {
        files++;
        bytes += fs.statSync(f).size;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { files, bytes: (bytes / 1024 / 1024).toFixed(1) };
};

const main = () => {
  const siteDir = path.join(ROOT, 'site');
  if (!fs.existsSync(siteDir)) throw new Error('缺少 site/ 目录');

  rmrf(DIST);
  let n = copyDir(siteDir, DIST, { skip: SKIP_SITE_FILES });
  n += copyDir(path.join(ROOT, 'public'), DIST);
  n += copyDir(path.join(ROOT, 'data'), path.join(DIST, 'data'));
  n += copyDir(path.join(ROOT, 'bp'), path.join(DIST, 'bp'));

  // ---- 类目页：19 个 /c/<slug>.html ----
  const catsFile = path.join(ROOT, 'data', 'categories.json');
  let catCount = 0;
  if (fs.existsSync(catsFile)) {
    const cats = JSON.parse(fs.readFileSync(catsFile, 'utf8'));
    const tpl = fs.readFileSync(path.join(siteDir, 'category.html'), 'utf8');
    fs.mkdirSync(path.join(DIST, 'c'), { recursive: true });
    for (const c of cats) {
      const html = tpl
        .split('__SLUG__')
        .join(c.slug)
        .split('__NAME__')
        .join(c.name.replace(/&/g, '&amp;'));
      fs.writeFileSync(path.join(DIST, 'c', `${c.slug}.html`), html);
      n++;
      catCount++;
    }
  } else {
    console.warn('[build] 没有 data/categories.json——先跑 node scripts/parse-catalog.mjs');
  }

  // ---- /checkout 目录形式（同时保留根级 checkout.html，避免 Pages 对 /checkout 做 308 重定向）----
  const checkout = path.join(DIST, 'checkout.html');
  if (fs.existsSync(checkout)) {
    fs.mkdirSync(path.join(DIST, 'checkout'), { recursive: true });
    fs.copyFileSync(checkout, path.join(DIST, 'checkout', 'index.html'));
  }

  // ---- 404 ----
  const notFound = path.join(DIST, '404.html');
  if (!fs.existsSync(notFound)) {
    fs.writeFileSync(
      notFound,
      `<!doctype html><html lang="en-PH"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | Landers Superstore</title>
<link rel="stylesheet" href="/assets/base.css"></head>
<body><div id="ld-header"></div><main class="ld-wrap"><div class="ld-empty" style="padding:80px 20px">
<h2>Page not found</h2><p>The aisle you are looking for does not exist.</p>
<p style="margin-top:18px"><a class="ld-btn" href="/" style="display:inline-block;line-height:44px">BACK TO HOME</a></p>
</div></main><div id="ld-footer"></div>
<script defer src="/assets/layout.js"></script></body></html>`
    );
    n++;
  }

  const s = stat(DIST);
  console.log(`[build] 复制文件 ${n} 个，类目页 ${catCount} 个`);
  console.log(`[build] dist ready: ${s.files} files, ${s.bytes} MB`);
  if (s.files > 19000) console.warn('[build] ⚠ 文件数接近 Cloudflare Pages 20000 上限');
};

main();
