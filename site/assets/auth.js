/* =============================================================================
 * 账号：注册 / 登录 / 会话 / 页头状态
 * -----------------------------------------------------------------------------
 * 会话真身在 httpOnly cookie `ld_user`（由 Functions 写入），前端只通过
 *   GET  /api/customer/me       取当前用户
 *   POST /api/customer/login    登录
 *   POST /api/customer/register 注册（会员申请）
 *   POST /api/customer/logout   退出
 * 来读写，页面脚本拿不到 cookie 内容，也不需要。
 * ========================================================================== */
(function () {
  const LD = (window.LD = window.LD || {});
  const AUTH = (LD.auth = LD.auth || {});

  const jsonFetch = async (url, opts = {}) => {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: Object.assign({ Accept: 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  };

  AUTH.me = async () => {
    try {
      const { data } = await jsonFetch('/api/customer/me');
      if (data && data.auth_mode) AUTH._mode = data.auth_mode;
      return data && data.user ? data.user : null;
    } catch (e) {
      return null;
    }
  };

  /** 当前登录模式：lenient（默认，任何凭证都放行）/ strict（真校验） */
  AUTH.mode = async () => {
    if (AUTH._mode) return AUTH._mode;
    await AUTH.me();
    return AUTH._mode || 'lenient';
  };

  AUTH.login = async (email, password) =>
    jsonFetch('/api/customer/login', { method: 'POST', body: JSON.stringify({ email, password }) });

  AUTH.register = async (payload) =>
    jsonFetch('/api/customer/register', { method: 'POST', body: JSON.stringify(payload) });

  AUTH.logout = async () => {
    const r = await jsonFetch('/api/customer/logout', { method: 'POST', body: '{}' });
    paintHeader(null);
    return r;
  };

  AUTH.requireUser = async (next) => {
    const user = await AUTH.me();
    if (!user) {
      const target = next || location.pathname + location.search;
      location.replace('/login?next=' + encodeURIComponent(target));
      return null;
    }
    return user;
  };

  /* ---------------- 页头账号区 ---------------- */
  function paintHeader(user) {
    const box = document.getElementById('ld-account');
    if (!box) return;

    if (user) {
      const first = String(user.name || user.email || '').split(/\s+/)[0];
      box.innerHTML = `
        <a class="ld-head-link ld-head-user" href="/account">Hi, ${escapeHtml(first)}</a>
        <button class="ld-head-link ld-head-logout" type="button" id="ld-logout">Logout</button>`;
      const btn = box.querySelector('#ld-logout');
      if (btn) {
        btn.addEventListener('click', async () => {
          await AUTH.logout();
          LD.toast && LD.toast('Signed out');
          if (document.body.dataset.page === 'account') location.href = '/';
          else paintHeader(null);
        });
      }
    } else {
      box.innerHTML = `
        <a class="ld-head-link" href="/register">Sign Up</a>
        <a class="ld-head-link" href="/login">Login</a>`;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  AUTH.paintHeader = paintHeader;

  let cachedUser;

  const boot = async () => {
    const user = await AUTH.me();
    cachedUser = user;
    paintHeader(user);
    // layout.js 注入页头后会广播，顺序无关地再刷一次
    window.addEventListener('ld:header-ready', () => paintHeader(cachedUser));
    window.dispatchEvent(new CustomEvent('ld:auth-ready', { detail: { user } }));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
