/* =============================================================================
 * 站点配置（唯一需要改的文件）
 * -----------------------------------------------------------------------------
 * 1) Facebook Pixel：把 fbPixelId 换成你的 Pixel ID 即启用，留空则完全不加载脚本。
 * 2) 进场弹窗：promoModal 里的文案/图片/按钮/跳转全部可改，也可以直接 enabled:false 关掉。
 * 3) 事件开关：pixelEvents 控制每个标准事件要不要打。
 * ========================================================================== */
window.LD_CONFIG = {
  currency: 'PHP',

  /* ---------------- Facebook Pixel ---------------- */
  fbPixelId: '', // 例：'1234567890123456'。填了才会注入 fbevents.js
  pixelEvents: {
    pageView: true, // 每次页面加载
    viewContent: true, // 商品详情页
    addToCart: true, // 点击 ADD TO CART
    initiateCheckout: true, // 打开结账页
    purchase: true, // 支付成功（提交卡号成功后回传标准事件 Purchase）
  },

  /* ---------------- 进场弹窗（预告活动） ---------------- */
  promoModal: {
    enabled: true,
    // 只在这些页面弹（body[data-page] 的取值）：home / category / search
    pages: ['home', 'category', 'search'],
    delayMs: 900, // 进入页面后多久弹
    ttlHours: 6, // 关闭后多久内不再弹（0 = 每次都弹）
    badge: 'SUPER CRAZY SALE',
    title: 'November 25 – 29, 2026',
    subtitle: 'Christmas Edition · online starts at midnight',
    body:
      'Up to 50% off across the whole store. Every item on this site is already listed at half the shelf price — ' +
      'members get free delivery above the basket threshold.',
    bullets: ['50% off every item', '2-hour delivery slots', 'Visa · Mastercard · JCB · Amex'],
    // 弹窗顶部大图：留空则用品牌绿渐变 + 下面两行大字（更好看，也不依赖外链图）
    image: '',
    mediaTitle: '50% OFF',
    mediaSubtitle: 'STORE WIDE',
    cta: 'SHOP THE SALE',
    ctaHref: '/promotions.html',
    dismiss: 'Maybe later',
  },

  /* ---------------- 站点文案 ---------------- */
  site: {
    name: 'Landers Superstore',
    supportHours: 'Online Customer Service: 7am – 9pm, Monday to Sunday',
    freeDeliveryNote: 'Free delivery above the qualifying basket amount of your membership tier.',
  },
};
