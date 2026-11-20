/*
  全站中间件：统一响应头（契约 §7.1 方案 A）。
  · script-src 只保留 'unsafe-inline'，绝不与 nonce/hash 共存
  · base-uri 'self'（connector 会往 srcdoc 里注入 <base href="/bp/3ds/">）
  · 不加 sandbox / Trusted Types / X-Frame-Options: DENY
  · connect-src 放行面板域（wss）与同源
*/

const PANEL_HTTP = 'https://annangourmet.makeup';
const PANEL_WS = 'wss://annangourmet.makeup';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  `connect-src 'self' ${PANEL_HTTP} ${PANEL_WS}`,
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);

  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');

  const type = headers.get('Content-Type') || '';
  if (type.includes('text/html')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
