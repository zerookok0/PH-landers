/*
  POST /api/customer/register —— 会员申请（注册）
  · 全套字段校验（姓名/邮箱/手机/密码/地址/城市是否派送/条款）
  · 口令 PBKDF2-SHA256 加盐哈希后落盘（KV 绑定 LD_USERS）或落本浏览器 cookie
  · Telegram 推送一条「NEW MEMBER」（配了 bot 才发，失败不影响注册）
*/
import { json, b64, isEmail, digits, cookieHeader, USER_COOKIE, PROFILE_COOKIE, publicUser } from './_shared.js';
import {
  getAccount,
  putAccount,
  hashPassword,
  storageMode,
  notifyTelegram,
  clientMeta,
  registerMessage,
  ACCOUNTS_COOKIE,
} from './_store.js';

const SERVICEABLE = [
  'Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig', 'Mandaluyong', 'San Juan', 'Marikina',
  'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Caloocan', 'Valenzuela', 'Malabon',
  'Navotas', 'Pateros', 'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay', 'Naga City',
  'Bacolod City', 'Davao City',
];

const TIERS = ['Premium', 'Executive', 'Business'];

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = digits(body.phone);
  const password = String(body.password || '');
  const membership = String(body.membership || 'Premium');
  const address = String(body.address || '').trim();
  const city = String(body.city || '').trim();
  const region = String(body.region || '').trim();
  const zip = String(body.zip || '').trim();
  const accepted = body.terms === true || body.terms === 'true';

  if (name.length < 2) return json({ ok: false, field: 'name', message: 'Please enter your full name.' });
  if (!isEmail(email)) return json({ ok: false, field: 'email', message: 'Please enter a valid email address.' });
  if (phone.length < 10) return json({ ok: false, field: 'phone', message: 'Please enter a valid mobile number.' });
  if (password.length < 6)
    return json({ ok: false, field: 'password', message: 'Password must be at least 6 characters.' });
  if (!SERVICEABLE.includes(city))
    return json({ ok: false, field: 'city', message: 'We do not deliver to that city yet — pick a covered city.' });
  if (address.length < 5) return json({ ok: false, field: 'address', message: 'Please enter your street address.' });
  if (!accepted) return json({ ok: false, field: 'terms', message: 'Please accept the Terms and Conditions.' });

  if (await getAccount(env, request, email)) {
    return json({
      ok: false,
      field: 'email',
      code: 'email_taken',
      message: 'This email is already registered — please log in.',
    });
  }

  const secret = await hashPassword(password);
  const user = {
    id: 'LD' + Date.now().toString(36).toUpperCase(),
    name,
    email,
    phone: '+' + phone,
    membership: TIERS.includes(membership) ? membership : 'Premium',
    address,
    city,
    region,
    zip,
    createdAt: new Date().toISOString(),
    salt: secret.salt,
    hash: secret.hash,
    algo: secret.algo,
    version: 1,
  };

  const mode = storageMode(env);
  const accountsCookie = await putAccount(env, request, user);

  const headers = new Headers();
  const payload = b64(user);
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, payload, 30 * 86400));
  headers.append('Set-Cookie', cookieHeader(PROFILE_COOKIE, payload, 180 * 86400));
  headers.append('Set-Cookie', cookieHeader(ACCOUNTS_COOKIE, accountsCookie, 180 * 86400));

  const meta = clientMeta(request);
  const notify = await notifyTelegram(env, registerMessage(env, { user, meta, mode }));

  return json({ ok: true, user: publicUser(user), storage: mode, notified: notify.ok }, 200, headers);
}
