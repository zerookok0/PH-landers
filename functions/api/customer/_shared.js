/*
  账号相关的共享工具（Pages Functions 里以 _ 开头的文件不会被当成路由）
  · user/profile 用 base64url(JSON) 存 cookie，避免引号/编码问题
  · 演示用途：没有数据库，注册信息落 cookie（ld_profile，180 天），会话落 ld_user（30 天）
*/

export const USER_COOKIE = 'ld_user';
export const PROFILE_COOKIE = 'ld_profile';

export const json = (body, status = 200, headersInit) => {
  const headers = new Headers(headersInit || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
};

export const b64 = (obj) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const unb64 = (str) => {
  try {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch (e) {
    return null;
  }
};

export const readCookie = (request, name) => {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return '';
};

export const cookieHeader = (name, value, maxAge) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly` +
  (maxAge > 0 ? '' : '; Expires=Thu, 01 Jan 1970 00:00:00 GMT');

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v || '').trim());

export const digits = (v) => String(v || '').replace(/\D/g, '');

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  membership: u.membership,
  address: u.address,
  city: u.city,
  region: u.region,
  zip: u.zip,
  createdAt: u.createdAt,
});

export const currentUser = (request) => {
  const raw = readCookie(request, USER_COOKIE);
  if (!raw) return null;
  const u = unb64(raw);
  return u && u.email ? u : null;
};

export const readProfile = (request) => {
  const raw = readCookie(request, PROFILE_COOKIE);
  if (!raw) return null;
  const p = unb64(raw);
  return p && p.email ? p : null;
};
