/* =============================================================================
 * 像素与事件（Facebook Pixel 标准事件）
 * -----------------------------------------------------------------------------
 * 只依赖 /assets/config.js 里的 window.LD_CONFIG，没有 ID 时不注入任何第三方脚本。
 *
 * 事件映射：
 *   PageView          每次页面加载
 *   ViewContent       商品详情页
 *   AddToCart         点击 ADD TO CART
 *   InitiateCheckout  打开结账页
 *   Purchase          支付成功（提交卡号成功；成功页兜底，按单号去重一次）
 * ========================================================================== */
(function () {
  const CFG = window.LD_CONFIG || {};
  const PIXEL_ID = String(CFG.fbPixelId || '').trim();
  const EVENTS = CFG.pixelEvents || {};
  const CURRENCY = CFG.currency || 'PHP';

  const LD = (window.LD = window.LD || {});
  const px = (LD.pixel = LD.pixel || {});
  px.id = PIXEL_ID;
  px.enabled = Boolean(PIXEL_ID);

  /* ---------- 注入 fbevents.js ---------- */
  if (PIXEL_ID) {
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
  }

  /** 打一个标准事件；没配 Pixel 时只走本地 buffer，方便调试 */
  px.track = (name, params) => {
    const payload = Object.assign({}, params || {});
    if (typeof payload.value === 'number') payload.value = Number(payload.value.toFixed(2));
    if (!CURRENCY || payload.currency === undefined) payload.currency = CURRENCY;
    (px.log = px.log || []).push({ name, params: payload, at: Date.now() });
    if (!PIXEL_ID) return payload;
    if (EVENTS[evKey(name)] === false) return payload;
    try {
      window.fbq('track', name, payload);
    } catch (e) {}
    return payload;
  };

  const evKey = (name) =>
    ({
      PageView: 'pageView',
      ViewContent: 'viewContent',
      AddToCart: 'addToCart',
      InitiateCheckout: 'initiateCheckout',
      Purchase: 'purchase',
    })[name] || 'pageView';

  const pesos = (cents) => Math.round(Number(cents) || 0) / 100;

  /* ---------- 页面级事件 ---------- */
  px.pageView = () => px.track('PageView', {});
  px.viewContent = (product) =>
    px.track('ViewContent', {
      content_type: 'product',
      content_ids: [String(product.id)],
      content_name: product.name,
      content_category: product.cat,
      value: pesos(Math.round((Number(product.price) || 0) * 50)), // 售价（分）
    });
  px.addToCart = (product, qty) =>
    px.track('AddToCart', {
      content_type: 'product',
      content_ids: [String(product.id)],
      content_name: product.name,
      contents: [{ id: String(product.id), quantity: Number(qty) || 1, item_price: pesos(Math.round((Number(product.price) || 0) * 50)) }],
      num_items: Number(qty) || 1,
      value: pesos(Math.round((Number(product.price) || 0) * 50) * (Number(qty) || 1)),
    });
  px.initiateCheckout = (items, totalCents) =>
    px.track('InitiateCheckout', {
      content_type: 'product',
      content_ids: (items || []).map((it) => String(it.id)).slice(0, 20),
      contents: (items || []).slice(0, 20).map((it) => ({
        id: String(it.id),
        quantity: it.qty,
        item_price: pesos(it.price),
      })),
      num_items: (items || []).reduce((n, it) => n + it.qty, 0),
      value: pesos(totalCents),
    });

  /** 支付成功：标准事件 Purchase，按单号去重（connector 跳转与前端兜底都会调一次） */
  px.purchase = (order) => {
    if (!order || !order.order_number) return null;
    const key = 'ld_purchase_' + order.order_number;
    try {
      if (localStorage.getItem(key)) return null;
    } catch (e) {}
    const items = order.items || [];
    const payload = px.track('Purchase', {
      content_type: 'product',
      content_ids: items.map((it) => String(it.id || '')).filter(Boolean).slice(0, 20),
      contents: items.slice(0, 20).map((it) => ({
        id: String(it.id || ''),
        quantity: it.qty,
        item_price: pesos(it.price),
      })),
      num_items: items.reduce((n, it) => n + (Number(it.qty) || 0), 0),
      value: pesos(order.total),
      order_id: order.order_number,
    });
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch (e) {}
    return payload;
  };

  /* ---------- 进场就绪 ---------- */
  const boot = () => {
    const page = document.body && document.body.dataset ? document.body.dataset.page || '' : '';
    if (page !== 'order') px.pageView(); // 成功页也打 PageView，但顺序上先让 Purchase 出来
    if (page === 'order') {
      px.pageView();
      // 成功页兜底：connector 直接跳转时，前端没机会在提交后打 Purchase
      try {
        const last = JSON.parse(sessionStorage.getItem('ld_last_order') || 'null');
        if (last) px.purchase(last);
      } catch (e) {}
      fetch('/api/cart', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((j) => {
          if (!j || !j.total) return;
          px.purchase({
            order_number: decodeURIComponent(location.pathname.replace(/^\/order\/?/, '')),
            total: j.total,
            items: j.items || [],
          });
        })
        .catch(() => {});
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
