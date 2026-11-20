/*
  POST /api/checkout —— 契约 §6.1
  · 永远 HTTP 200 + JSON，绝不 302/303
  · order_number 原样回传（不生成新号）
  · 幂等：同一单号重复提交返回同一个 ok:true
  · 不接收卡数据（卡只走 /bp/ 面板通道）
  · Origin 与站点同源才接受（SameSite=Lax cookie + Origin 比对）
*/

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

export async function onRequestPost({ request }) {
  // 同源校验（浏览器提交一定带 Origin；非浏览器客户端允许通过，便于自检脚本）
  const origin = request.headers.get('Origin');
  if (origin) {
    const self = new URL(request.url).origin;
    const allowed = new Set([self, self.replace('http://', 'https://'), self.replace('https://', 'http://')]);
    if (!allowed.has(origin)) {
      return json({ ok: false, error_code: 'bad_origin', message: 'Request origin not allowed' });
    }
  }

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' });
  }

  const orderNumber = String(body.order_number || '').trim();
  if (!orderNumber) {
    return json({ ok: false, error_code: 'missing_order_number', message: 'order_number is required' });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return json({ ok: false, error_code: 'bad_amount', message: 'amount must be a positive integer (centavos)' });
  }

  // 幂等：同一单号永远返回同一个成功结果，不生成新号
  return json({
    ok: true,
    order_number: orderNumber,
    amount: Math.round(amount),
    currency: String(body.currency || 'PHP'),
    received_at: new Date().toISOString(),
  });
}

export async function onRequest() {
  return json({ ok: false, error_code: 'method_not_allowed', message: 'Use POST /api/checkout' }, 405);
}
