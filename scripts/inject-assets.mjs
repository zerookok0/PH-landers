#!/usr/bin/env node
/**
 * 一次性工具：给 site/*.html 补 /assets/location.js 与 /assets/auth.js（在 layout.js 之前）。
 * 幂等：已经有的文件跳过。
 *
 *   node scripts/inject-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

const LAYOUT_TAG = '  <script defer src="/assets/layout.js"></script>';
const INJECT =
  '  <script defer src="/assets/location.js"></script>\n' +
  '  <script defer src="/assets/auth.js"></script>\n' +
  LAYOUT_TAG;

let patched = 0;
let skipped = 0;

for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) {
  const p = path.join(SITE, f);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes('/assets/location.js') || !t.includes(LAYOUT_TAG)) {
    skipped++;
    continue;
  }
  t = t.replace(LAYOUT_TAG, INJECT);
  fs.writeFileSync(p, t);
  patched++;
}

console.log(`[inject] patched=${patched} skipped=${skipped}`);
