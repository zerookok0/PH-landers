/* 结账页：购物车 -> __BP_CART__ -> /api/cart（双保险） -> /api/checkout
   契约要点：
   - 金额三处同源（__BP_CART__.total / #bp-total[data-amount] / 展示文本）
   - 单号就是最终单号，提交后不换号
   - 按钮不禁用，用 aria-busy 防重复；错误写进 #bp-error
   - 只在 connector 之后注册 submit 兜底（defer 顺序保证） */
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

  /* ---------- 2. __BP_CART__：原地 mutate，绝不换对象 ---------- */
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

  /* 成功页的数据快照：connector 也会自己跳转，所以这里在页面加载/输入邮箱时就落盘，
     不依赖「谁发起的提交」。 */
  const snapshot = () => {
    try {
      sessionStorage.setItem(
        'ld_last_order',
        JSON.stringify({
          order_number: window.__BP_CART__.order_number,
          email: (document.getElementById('t-email')?.value || '').trim(),
          total: window.__BP_CART__.total,
          items: window.__BP_CART__.items,
        })
      );
    } catch (e) {}
  };
  snapshot();
  ['t-email', 't-name'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', snapshot);
  });

  /* ---------- 像素：进入结账 = InitiateCheckout ---------- */
  try {
    window.LD?.pixel?.initiateCheckout?.(items, total);
  } catch (e) {}

  /* ---------- 3. /api/cart 双保险：服务端口径对齐 ---------- */
  (async () => {
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const server = await res.json();
      if (!server || typeof server.total !== 'number') return;
      // 单号以服务端为准（同一 cookie 下应完全一致）
      if (server.order_number && server.order_number !== window.__BP_CART__.order_number) {
        window.__BP_CART__.order_number = server.order_number;
        setText('ld-order-number', 'Order ' + server.order_number);
      }
      // 服务端没有购物车数据时保留前端数据
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

  /* ---------- 4. 兜底提交（connector 之后注册） ---------- */
  const form = document.getElementById('bp-form');
  const errBox = document.getElementById('bp-error');
  const submitBtn = document.getElementById('bp-submit');
  let busy = false;

  const utm = () => {
    try {
      return JSON.parse(sessionStorage.getItem('bp_utm') || '{}');
    } catch (e) {
      return {};
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // connector 会先处理；这里只做兜底
    if (busy) return;
    busy = true;
    submitBtn.setAttribute('aria-busy', 'true');
    if (errBox) errBox.textContent = '';

    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const payload = {
      order_number: window.__BP_CART__.order_number || orderNumber,
      amount: window.__BP_CART__.total || total,
      currency: 'PHP',
      locale: document.documentElement.lang || 'en',
      utm: utm(),
      customer: {
        name: val('t-name'),
        email: val('t-email'),
        phone: val('t-phone'),
        addr: val('t-addr'),
        city: val('t-city'),
        zip: val('t-zip'),
        country: val('t-country') || 'PH',
      },
    };

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) {
        try {
          sessionStorage.setItem(
            'ld_last_order',
            JSON.stringify({
              order_number: data.order_number,
              email: payload.customer.email,
              total: payload.amount,
              items: window.__BP_CART__.items,
            })
          );
        } catch (err) {}
        /* 像素：支付成功 → 标准事件 Purchase（按单号去重，成功页不会再打一次） */
        try {
          window.LD?.pixel?.purchase?.({
            order_number: data.order_number,
            total: payload.amount,
            items: window.__BP_CART__.items,
          });
        } catch (err) {}
        localStorage.removeItem('ld_cart');
        document.cookie = 'ld_cart=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'ld_ord=; path=/; max-age=0; SameSite=Lax';
        location.href = '/order/' + encodeURIComponent(data.order_number);
        return;
      }
      if (errBox) errBox.textContent = (data && data.message) || 'Payment could not be completed. Please try again.';
    } catch (err) {
      if (errBox) errBox.textContent = 'Network error — your details were kept. Please try again.';
    } finally {
      busy = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = 'PAY NOW';
    }
  });
})();
