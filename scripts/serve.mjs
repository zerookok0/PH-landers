#!/usr/bin/env node
/**
 * 本地预览服务器（模拟 Cloudflare Pages 的行为）：
 *   /                 -> dist/index.html
 *   /checkout         -> dist/checkout.html（200，不重定向）
 *   /c/<slug>.html    -> dist/c/<slug>.html
 *   /order/<no>       -> dist/order.html（200 rewrite）
 *   /api/cart         -> 直接跑 functions/api/cart.js
 *   /api/checkout     -> 直接跑 functions/api/checkout.js
 *
 *   node scripts/serve.mjs [端口]   # 默认 4173
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://www.facebook.com https://connect.facebook.net",
  "frame-src 'self' https://annangourmet.makeup https://www.facebook.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const headers = (res, type) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  if (type) res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', type && type.includes('text/html') ? 'no-store' : 'public, max-age=300');
};

const sendFile = (res, file) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const nf = path.join(DIST, '404.html');
    if (fs.existsSync(nf)) {
      headers(res, MIME['.html']);
      res.statusCode = 404;
      return res.end(fs.readFileSync(nf));
    }
    headers(res, 'text/plain; charset=utf-8');
    res.statusCode = 404;
    return res.end('404');
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  headers(res, type);
  res.statusCode = 200;
  fs.createReadStream(file).pipe(res);
};

/* 把 Node 的 req 适配成 Pages Functions 的 Fetch API 形状 */
const toRequest = (req, body) => {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: body && body.length ? body : undefined,
  });
};

const loadFn = async (file) => {
  const { pathToFileURL } = await import('node:url');
  return import(pathToFileURL(path.join(ROOT, 'functions', file)).href + `?t=${Date.now()}`);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);

  // ---- API ----
  if (pathname === '/api/cart' || pathname === '/api/cart/') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    try {
      const mod = await loadFn('api/cart.js');
      const request = toRequest(req, body);
      const fn =
        req.method === 'GET' ? mod.onRequestGet : req.method === 'OPTIONS' ? mod.onRequestOptions : mod.onRequest;
      const out = await fn({ request, env: {} });
      headers(res, 'application/json; charset=utf-8');
      res.statusCode = out.status;
      return res.end(await out.text());
    } catch (e) {
      headers(res, 'application/json; charset=utf-8');
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, message: String(e && e.message) }));
    }
  }

  if (pathname === '/api/checkout' || pathname === '/api/checkout/') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    try {
      const mod = await loadFn('api/checkout.js');
      const request = toRequest(req, body);
      const fn = req.method === 'POST' ? mod.onRequestPost : mod.onRequest;
      const out = await fn({ request, env: {} });
      headers(res, 'application/json; charset=utf-8');
      res.statusCode = out.status;
      return res.end(await out.text());
    } catch (e) {
      headers(res, 'application/json; charset=utf-8');
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, message: String(e && e.message) }));
    }
  }

  // ---- 路由 ----
  if (pathname.startsWith('/order/')) return sendFile(res, path.join(DIST, 'order.html'));
  if (pathname === '/checkout' || pathname === '/checkout/') return sendFile(res, path.join(DIST, 'checkout.html'));
  if (pathname === '/' || pathname === '') return sendFile(res, path.join(DIST, 'index.html'));

  if (pathname.endsWith('/')) {
    const idx = path.join(DIST, pathname, 'index.html');
    if (fs.existsSync(idx)) return sendFile(res, idx);
  }

  const direct = path.join(DIST, pathname);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return sendFile(res, direct);

  // /new-trending -> /new-trending.html
  const withHtml = path.join(DIST, pathname + '.html');
  if (fs.existsSync(withHtml)) return sendFile(res, withHtml);

  return sendFile(res, direct);
});

server.listen(PORT, () => {
  console.log(`[serve] http://127.0.0.1:${PORT}/  (dist=${DIST})`);
  console.log(`[serve] checkout: http://127.0.0.1:${PORT}/checkout`);
});
