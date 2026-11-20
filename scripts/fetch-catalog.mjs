#!/usr/bin/env node
/**
 * 抓 landers.ph 全量商品（Magento REST `/rest/V1/products`）。
 *
 * 为什么要用 entity_id in (...) 而不是翻页：
 *   实测 `searchCriteria[currentPage]` 的排序不稳定（相邻两页重叠约 50%），翻页会漏商品。
 *   用 sitemap 里每个商品的 entity_id 组成 `filter_groups[0][filters][0][condition_type]=in`
 *   一次要 100 个 id，结果确定、可断点续跑、不重不漏。
 *
 * 本机出口 IP 被原站 Cloudflare 地域/信誉规则拦截（HTML 与 /rest/V1 直连均 403），
 * 请求统一走 r.jina.ai 只读代理（单 IP 20 req/min）。
 *
 * 用法：
 *   node scripts/fetch-catalog.mjs               # 增量（跳过已存在的 chunk）
 *   node scripts/fetch-catalog.mjs --force       # 全部重抓
 *   SHARD=1/4 node scripts/fetch-catalog.mjs     # 4 进程并行，共打满 20 req/min
 *   node scripts/fetch-catalog.mjs --limit 3     # 只抓前 3 个 chunk（调试）
 *
 * 产物：raw/chunks/c0000.xml …
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(RAW, 'chunks');
const CHUNK = 100;
const MIN_INTERVAL_MS = Number(process.env.INTERVAL_MS || 2600);
const MAX_RETRY = 6;
const PROXY = 'https://r.jina.ai/';
const API = 'https://www.landers.ph/rest/V1/products';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const LIMIT = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : 0;

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** sitemap.txt -> 去重后的 entity_id（商品详情页 URL 的最后一段数字） */
function loadIds() {
  const file = path.join(RAW, 'sitemap.txt');
  if (!fs.existsSync(file)) throw new Error('缺少 raw/sitemap.txt');
  const ids = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.trim().match(/landers\.ph\/[a-z0-9-]+\/[a-z0-9-]+-\d{4,8}-(\d+)$/);
    if (m) ids.add(Number(m[1]));
  }
  return [...ids].sort((a, b) => a - b);
}

let last = 0;
async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

const chunkUrl = (ids) =>
  `${API}?searchCriteria[pageSize]=${CHUNK}` +
  `&searchCriteria[filter_groups][0][filters][0][field]=entity_id` +
  `&searchCriteria[filter_groups][0][filters][0][condition_type]=in` +
  `&searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(ids.join(','))}`;

async function fetchText(url) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    await throttle();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 240_000);
    try {
      const res = await fetch(PROXY + url, {
        headers: { 'X-Return-Format': 'text', 'User-Agent': 'landers-clone/1.0' },
        signal: ctl.signal,
      });
      const body = await res.text();
      if (res.ok && body.includes('<response>')) return body;
      const hint = `${res.status} ${body.slice(0, 110).replace(/\s+/g, ' ')}`;
      const retriable =
        res.status === 429 || res.status >= 500 || /AssertionFailure|Unprocessable/i.test(body);
      if (retriable && attempt < MAX_RETRY) {
        const backoff = Math.min(60_000, 3_000 * attempt);
        console.log(`  retry ${attempt}/${MAX_RETRY} in ${backoff}ms (${hint})`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`bad response: ${hint}`);
    } catch (err) {
      if (attempt === MAX_RETRY) throw err;
      const backoff = Math.min(60_000, 3_000 * attempt);
      console.log(`  retry ${attempt}/${MAX_RETRY} in ${backoff}ms (${err.message})`);
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('exhausted retries');
}

const pad = (n) => String(n).padStart(4, '0');

const main = async () => {
  const ids = loadIds();
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const [shardIdx, shardNum] = (process.env.SHARD || '0/1').split('/').map(Number);
  console.log(
    `[catalog] ids=${ids.length} chunks=${chunks.length} chunkSize=${CHUNK} ` +
      `shard=${shardIdx}/${shardNum} out=${OUT}`
  );

  let done = 0;
  let missing = 0;
  for (let k = 0; k < chunks.length; k++) {
    if (shardNum > 1 && k % shardNum !== shardIdx) continue;
    if (LIMIT && done >= LIMIT) break;
    const file = path.join(OUT, `c${pad(k)}.xml`);
    if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 500) continue;

    const started = Date.now();
    const xml = await fetchText(chunkUrl(chunks[k]));
    fs.writeFileSync(file, xml);

    const total = Number((xml.match(/<total_count>(\d+)/) || [0, 0])[1]);
    const got = (xml.match(/\n {6}<id>\d+<\/id>/g) || []).length;
    if (got < chunks[k].length) {
      missing += chunks[k].length - got;
      console.log(`  chunk ${k}: 期望 ${chunks[k].length} 实得 ${got}（差 ${chunks[k].length - got}，可能停售/不可见）`);
    }
    done++;
    console.log(
      `[catalog] chunk ${k + 1}/${chunks.length} total=${total} ids=${got} bytes=${xml.length} ${Date.now() - started}ms`
    );
  }
  console.log(`[catalog] done: fetched=${done} missing=${missing}`);
};

main().catch((e) => {
  console.error('[catalog] fatal', e);
  process.exit(1);
});
