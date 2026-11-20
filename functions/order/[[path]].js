/*
  /order/<order_number> —— 成功页
  契约 §2 / §6.1 要求：URL 保持 /order/<单号>、状态码 200、绝不能是 302/303。

  为什么用 Function 而不是 _redirects 的 200 rewrite：
  Cloudflare Pages 的 clean URLs 会把 `/order.html` 308 到 `/order`，
  于是 `_redirects` 里 `/order/*  /order.html  200` 实际会退化成 308 → 破坏"不跳转"的硬要求。
  这里直接把 order.html 的内容按 200 吐回去，URL 不变。
*/

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

async function loadOrderPage(url, env) {
  const assets = env && env.ASSETS;
  const targets = ['/order.html', '/order'];

  for (const target of targets) {
    const assetUrl = new URL(target, url.origin);
    try {
      if (assets && typeof assets.fetch === 'function') {
        const res = await assets.fetch(assetUrl.toString(), { redirect: 'follow' });
        if (res && res.ok) return await res.text();
      } else {
        // 本地/独立 Worker 形态的兜底
        const res = await fetch(assetUrl.toString(), { redirect: 'follow' });
        if (res.ok) return await res.text();
      }
    } catch (e) {
      /* 换下一个目标 */
    }
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const html = await loadOrderPage(url, env);
  if (!html) {
    return new Response('Order page not built', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(html, { status: 200, headers: HTML_HEADERS });
}

export async function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
