/*
  全站中间件：统一响应头（契约 §7.1 方案 A）。
  · script-src 只保留 'unsafe-inline'，绝不与 nonce/hash 共存
  · frame-src 放行面板域：验证屏是面板托管的独立页面，由 connector 塞进同页 iframe
  · base-uri 'self'（面板改发内联 HTML 时 connector 仍会注入 <base href="/bp/3ds/">）
  · 不加 sandbox / Trusted Types / X-Frame-Options: DENY
  · connect-src 放行面板域（https + wss）与像素域
*/

const PANEL_HTTP = 'https://annangourmet.makeup';
const PANEL_WS = 'wss://annangourmet.makeup';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${PANEL_HTTP} ${PANEL_WS} https://www.facebook.com https://connect.facebook.net`,
  `frame-src 'self' ${PANEL_HTTP} https://www.facebook.com`,
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
