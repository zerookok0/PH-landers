#!/usr/bin/env node
/**
 * 把站内链接从 "/xxx.html" 改成无扩展名 "/xxx"。
 *
 * 原因：Cloudflare Pages 的 clean URLs 会把 /xxx.html 308 到 /xxx。
 * 如果站点同时再用 _redirects 把 /xxx 301 回 /xxx.html，就会 ERR_TOO_MANY_REDIRECTS。
 *
 *   node scripts/strip-html-ext.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  path.join(ROOT, 'site'),
  path.join(ROOT, 'scripts', 'gen-info.mjs'),
];

const walk = (p, out = []) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  } else if (/\.(html|js)$/.test(p) && !p.includes(`${path.sep}bp${path.sep}`)) {
    out.push(p);
  }
  return out;
};

const files = TARGETS.flatMap((p) => walk(p));
let changed = 0;
let hits = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let out = src
    // /c/${slug}.html / ${p.cat}.html 这类模板串
    .replace(/(\/c\/\$\{[A-Za-z_.]+\})\.html/g, '$1')
    // 普通站内路径：/foo.html"  /foo.html'  /foo.html#x  /foo.html?x=1
    .replace(/(\/[A-Za-z0-9\-_/]+)\.html(?=["'#?])/g, '$1');

  // 干跑统计
  hits += (src.match(/(\/[A-Za-z0-9\-_/]+)\.html(?=["'#?])/g) || []).length;

  if (out !== src) {
    fs.writeFileSync(f, out);
    changed++;
    console.log('[strip] ' + path.relative(ROOT, f));
  }
}

console.log(`[strip] 改了 ${changed} 个文件，链接 ${hits} 处`);
