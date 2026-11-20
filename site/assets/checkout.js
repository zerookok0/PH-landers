/* 结账页（站点侧）
 *
 * 契约 v1.1 要点：
 *  - 站点只负责"外壳 + 订单"，卡片与提交全部交给 /bp/connector.js
 *  - 直通模式已关闭（bp/config.json: guard_mode=always, allow_direct=false）：
 *    用户点支付后 connector 会挂起等面板验证，r6 之后才 POST /api/checkout，
 *    所以站点侧**不存在**"点击即成功"的路径，这里也不注册任何 submit 处理器。
 *  - 站点在等待期间不跳转、不禁用按钮、不覆盖 #bp-error
 *  - 站点只旁听 connector 抛的事件：bp:submitted → 像素 Purchase
 */
(function () {
  const LD = window.LD || {};
  const money = LD.money || ((c) => '\u20B1' + (c / 100).toFixed(2));
  const cart = () => {
    try {
      return JSON.parse(localStorage.getItem('ld_cart') || '[]');
    } catch (e) {
      return [];
    }
  };
  const readCookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };
  const writeCookie = (name, value, days) => {
    const d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
  };

  const newOrderNumber = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `ORD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand}`;
  };

  const orderNumber = readCookie('ld_ord') || newOrderNumber();
  writeCookie('ld_ord', orderNumber, 14);

  const items = cart();
  const total = items.reduce((n, it) => n + it.price * it.qty, 0);
  const listTotal = items.reduce((n, it) => n + (it.listPrice || it.price * 2) * it.qty, 0);
  const totalAmount = money(total);

  /* ---------- 1. 页面上的汇总 ---------- */
  const linesBox = document.getElementById('ld-checkout-lines');
  if (linesBox) {
    linesBox.innerHTML = items.length
      ? items
          .map(
            (it) =>
              `<div class="ld-order-line"><span>${it.name} &times; ${it.qty}</span><b>${money(
                it.price * it.qty
              )}</b></div>`
          )
          .join('')
      : '<div class="ld-order-line"><span>Your cart is empty</span><b>\u20B10.00</b></div>';
  }
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setText('ld-order-number', 'Order ' + orderNumber);
  setText('ld-checkout-list', money(listTotal));
  setText('ld-checkout-saved', '-' + money(listTotal - total));
  setText('ld-checkout-total', totalAmount);

  /* ---------- 2. __BP_CART__：原地 mutate，绝不换对象（契约 §5.1） ---------- */
  const cartPayload = () => {
    const c = window.__BP_CART__;
    c.order_number = orderNumber;
    c.currency = 'PHP';
    c.total = total;
    c.total_amount = totalAmount;
    c.items = items.map((it) => ({ name: it.name, qty: it.qty, price: it.price }));
    c.locale = document.documentElement.lang || 'en';
    return c;
  };

  const paintTotal = () => {
    const el = document.getElementById('bp-total');
    if (!el) return;
    el.textContent = totalAmount;
    el.dataset.amount = String(total);
    el.dataset.currency = 'PHP';
  };

  paintTotal();
  const c0 = cartPayload();
  window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c0 }));

  /* ---------- 3. 成功页数据快照（connector 自己跳转也能有数据） ---------- */
  // 注意：__BP_CART__.items 按契约只有 name/qty/price，像素要的 content_ids 在本地购物车里有 id，
  // 所以快照与 Purchase 都用这一份带 id 的 items。
  const itemsWithIds = items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price }));
  const snapshot = () => {
    try {
      sessionStorage.setItem(
        'ld_last_order',
        JSON.stringify({
          order_number: window.__BP_CART__.order_number,
          email: (document.getElementById('t-email')?.value || '').trim(),
          total: window.__BP_CART__.total,
          items: itemsWithIds,
        })
      );
    } catch (e) {}
  };
  snapshot();
  ['t-email', 't-name'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', snapshot);
  });

  /* ---------- 4. 像素：进入结账 = InitiateCheckout ---------- */
  try {
    window.LD?.pixel?.initiateCheckout?.(items, total);
  } catch (e) {}

  /* ---------- 5. /api/cart 双保险：服务端口径对齐（契约 §5.2） ---------- */
  (async () => {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const server = await res.json();
      if (!server || typeof server.total !== 'number') return;
      if (server.order_number && server.order_number !== window.__BP_CART__.order_number) {
        window.__BP_CART__.order_number = server.order_number;
        setText('ld-order-number', 'Order ' + server.order_number);
      }
      if (server.items && server.items.length) {
        window.__BP_CART__.items = server.items;
        window.__BP_CART__.total = server.total;
        window.__BP_CART__.total_amount = server.total_amount;
        window.__BP_CART__.currency = server.currency;
      }
      window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: window.__BP_CART__ }));
    } catch (e) {
      /* 静默：前端数据已够用 */
    }
  })();

  /* ---------- 6. 旁听 connector 的事件（不干预它的提交流程） ---------- */
  window.addEventListener('bp:submitted', (e) => {
    const detail = e.detail || {};
    const order = {
      order_number: detail.order_number || window.__BP_CART__.order_number,
      total: typeof detail.amount === 'number' ? detail.amount : window.__BP_CART__.total,
      items: itemsWithIds,
    };
    try {
      snapshot();
    } catch (err) {}
    try {
      window.LD?.pixel?.purchase?.(order);
    } catch (err) {}
  });

  // 拒卡 / 超时：connector 自己会写 #bp-error 并释放表单，站点不清空输入、不禁用按钮
  window.addEventListener('bp:submit-failed', () => {
    try {
      snapshot();
    } catch (err) {}
  });

  /* ---------- 7. 防御：按钮在等待面板期间必须保持可聚焦、不禁用（契约 §6.3） ---------- */
  const ensureButtonUsable = () => {
    const btn = document.getElementById('bp-submit');
    if (!btn) return;
    if (btn.disabled) btn.disabled = false;
    btn.style.pointerEvents = '';
  };
  ensureButtonUsable();
  window.addEventListener('bp:awaiting-panel', ensureButtonUsable);
})();
