/*
  /api/cart —— 契约 §5.2 的双保险接口。
  数据来源：前端写入的 ld_cart cookie（[{i,q,n,p,g,c}]，p 为「售价」整数分）。
  返回结构与 window.__BP_CART__ 完全一致。
*/

const CURRENCY = 'PHP';

const money = (cents) => {
  const v = (Math.round(cents) / 100).toFixed(2).split('.');
  return '\u20B1' + v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + v[1];
};

const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch (e) {
        return rest.join('=');
      }
    }
  }
  return '';
};

const orderNumberFrom = (request) => {
  const fromCookie = readCookie(request, 'ld_ord');
  if (fromCookie) return fromCookie;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `ORD-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
};

export async function onRequestGet({ request }) {
  let items = [];
  try {
    const raw = readCookie(request, 'ld_cart');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      items = parsed
        .map((it) => ({
          id: Number(it.i),
          name: String(it.n || ''),
          qty: Math.max(1, Math.min(999, Number(it.q) || 1)),
          price: Math.max(0, Math.round(Number(it.p) || 0)),
        }))
        .filter((it) => it.id && it.price > 0);
    }
  } catch (e) {
    items = [];
  }

  const total = items.reduce((n, it) => n + it.price * it.qty, 0);

  return Response.json(
    {
      order_number: orderNumberFrom(request),
      currency: CURRENCY,
      total,
      total_amount: money(total),
      items: items.map(({ name, qty, price }) => ({ name, qty, price })),
      locale: 'en',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequest() {
  return Response.json({ ok: false, error_code: 'method_not_allowed', message: 'Use GET /api/cart' }, { status: 405 });
}
