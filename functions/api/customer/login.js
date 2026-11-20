/*
  POST /api/customer/login
  演示站没有数据库：邮箱能在 ld_profile 里对上就用那份资料，否则按邮箱生成一个会员档案。
  登录成功的判定：邮箱格式合法 + 密码 ≥ 6 位（并对已注册邮箱做"密码错误"提示示范）。
*/
import {
  json,
  b64,
  isEmail,
  digits,
  cookieHeader,
  USER_COOKIE,
  PROFILE_COOKIE,
  readProfile,
} from './_shared.js';

export async function onRequestPost({ request }) {
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!isEmail(email)) return json({ ok: false, field: 'email', message: 'Please enter a valid email address.' });
  if (password.length < 6)
    return json({ ok: false, field: 'password', message: 'Password must be at least 6 characters.' });

  const profile = readProfile(request);
  const known = profile && profile.email === email;

  const user = known
    ? { ...profile }
    : {
        id: 'LD' + Date.now().toString(36).toUpperCase(),
        name: email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email,
        phone: digits(body.phone) ? '+' + digits(body.phone) : '',
        membership: 'Premium',
        address: '',
        city: '',
        region: '',
        zip: '',
        createdAt: new Date().toISOString(),
      };

  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, b64(user), 30 * 86400));
  if (!known) headers.append('Set-Cookie', cookieHeader(PROFILE_COOKIE, b64(user), 180 * 86400));

  return json({ ok: true, user, returning: Boolean(known) }, 200, headers);
}
