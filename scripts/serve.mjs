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

const SENSITIVE = /^\/(checkout|order|login|register|account|api)(\/|$)/;

/* 本地复刻 public/_headers + functions/_middleware.js 的头 */
const headers = (res, type, reqPath = '') => {
  const isHtml = type && type.includes('text/html');
  const isApi = reqPath.startsWith('/api/');
  const sensitive = SENSITIVE.test(reqPath);

  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (type) res.setHeader('Content-Type', type);
  if (isHtml) res.setHeader('Content-Language', 'en-PH');

  if (isApi || sensitive) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else if (isHtml) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else if (/\.(js|css)$/i.test(reqPath)) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
};

const sendFile = (res, file, reqPath = "") => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const nf = path.join(DIST, '404.html');
    if (fs.existsSync(nf)) {
      headers(res, MIME['.html'], reqPath);
      res.statusCode = 404;
      return res.end(fs.readFileSync(nf));
    }
    headers(res, 'text/plain; charset=utf-8', reqPath);
    res.statusCode = 404;
    return res.end('404');
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  headers(res, type, reqPath);
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

/* 本地把 Pages 的环境变量透给 Functions（AUTH_MODE / TELEGRAM_* / SITE_LABEL…） */
const fnEnv = (origin) => {
  const env = { ASSETS: mkAssets(origin) };
  for (const k of ['AUTH_MODE', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_INCLUDE_PASSWORD', 'SITE_LABEL', 'PANEL_ORIGIN']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
};

/* 本地模拟 Pages 的 env.ASSETS（顺便复刻 clean URL：/x 也能取到 x.html） */
const mkAssets = (origin) => ({
  async fetch(input, init = {}) {
    const href = typeof input === 'string' ? input : input.url;
    const u = new URL(href, origin);
    const candidates = [u.pathname, u.pathname.replace(/\/+$/, '') + '.html', u.pathname + 'index.html'];
    for (const rel of candidates) {
      const file = path.join(DIST, decodeURIComponent(rel));
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
        return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
      }
    }
    return new Response('not found', { status: 404 });
  },
});

const loadFn = async (file) => {
  const { pathToFileURL } = await import('node:url');
  return import(pathToFileURL(path.join(ROOT, 'functions', file)).href + `?t=${Date.now()}`);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);

  // ---- API：/api/** 一律映射到 functions/api/**（和 Pages 的约定一致） ----
  if (pathname.startsWith('/api/')) {
    const rel = pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    const file = path.join(ROOT, 'functions', 'api', rel + '.js');
    if (!fs.existsSync(file)) {
      headers(res, 'application/json; charset=utf-8', pathname);
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false, message: 'No such API route: ' + pathname }));
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    try {
      const mod = await loadFn(path.join('api', rel + '.js'));
      const request = toRequest(req, body);
      const byMethod =
        (req.method === 'GET' && mod.onRequestGet) ||
        (req.method === 'POST' && mod.onRequestPost) ||
        (req.method === 'OPTIONS' && mod.onRequestOptions) ||
        mod.onRequest ||
        mod.onRequestGet ||
        mod.onRequestPost;
      if (!byMethod) {
        headers(res, 'application/json; charset=utf-8');
        res.statusCode = 405;
        return res.end(JSON.stringify({ ok: false, message: 'Method not allowed' }));
      }
      const out = await byMethod({
        request,
        env: fnEnv(new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`).origin),
        params: {},
      });

      headers(res, out.headers.get('Content-Type') || 'application/json; charset=utf-8', pathname);
      out.headers.forEach((v, k) => {
        if (k.toLowerCase() === 'set-cookie') return;
        res.setHeader(k, v);
      });
      const cookies =
        typeof out.headers.getSetCookie === 'function'
          ? out.headers.getSetCookie()
          : out.headers.get('set-cookie')
          ? [out.headers.get('set-cookie')]
          : [];
      if (cookies.length) res.setHeader('Set-Cookie', cookies);

      res.statusCode = out.status;
      return res.end(await out.text());
    } catch (e) {
      headers(res, 'application/json; charset=utf-8', pathname);
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, message: String(e && e.message) }));
    }
  }

  // ---- /order/<单号> 走真 Function（和线上一致） ----
  if (pathname.startsWith('/order/')) {
    try {
      const mod = await loadFn('order/[[path]].js');
      const request = toRequest(req, Buffer.alloc(0));
      const out = await mod.onRequestGet({ request, env: fnEnv(new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`).origin) });
      headers(res, out.headers.get('Content-Type') || 'text/html; charset=utf-8', pathname);
      res.statusCode = out.status;
      return res.end(await out.text());
    } catch (e) {
      headers(res, 'text/plain; charset=utf-8');
      res.statusCode = 500;
      return res.end('order function error: ' + (e && e.message));
    }
  }

  // ---- 路由 ----
  if (pathname === '/checkout' || pathname === '/checkout/') return sendFile(res, path.join(DIST, 'checkout.html'), pathname);
  if (pathname === '/' || pathname === '') return sendFile(res, path.join(DIST, 'index.html'), pathname);

  if (pathname.endsWith('/')) {
    const idx = path.join(DIST, pathname, 'index.html');
    if (fs.existsSync(idx)) return sendFile(res, idx, pathname);
  }

  const direct = path.join(DIST, pathname);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return sendFile(res, direct, pathname);

  // /new-trending -> /new-trending.html
  const withHtml = path.join(DIST, pathname + '.html');
  if (fs.existsSync(withHtml)) return sendFile(res, withHtml, pathname);

  return sendFile(res, direct, pathname);
});

server.listen(PORT, () => {
  console.log(`[serve] http://127.0.0.1:${PORT}/  (dist=${DIST})`);
  console.log(`[serve] checkout: http://127.0.0.1:${PORT}/checkout`);
});
