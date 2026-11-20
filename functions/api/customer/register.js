/*
  POST /api/customer/register —— 会员申请（注册）
  校验：姓名、邮箱、手机、密码长度、城市是否在派送范围、条款勾选
  成功：写 ld_user（会话）+ ld_profile（资料，180 天），返回 user
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

const SERVICEABLE = [
  'Quezon City', 'Manila', 'Makati', 'Pasig', 'Taguig', 'Mandaluyong', 'San Juan', 'Marikina',
  'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Caloocan', 'Valenzuela', 'Malabon',
  'Navotas', 'Pateros', 'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay', 'Naga City',
  'Bacolod City', 'Davao City',
];

const TIERS = ['Premium', 'Executive', 'Business'];

export async function onRequestPost({ request }) {
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
  if (address.length < 5)
    return json({ ok: false, field: 'address', message: 'Please enter your street address.' });
  if (!accepted)
    return json({ ok: false, field: 'terms', message: 'Please accept the Terms and Conditions.' });

  const existing = readProfile(request);
  if (existing && existing.email === email) {
    return json({ ok: false, field: 'email', message: 'This email is already registered — please log in.' });
  }

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
  };

  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, b64(user), 30 * 86400));
  headers.append('Set-Cookie', cookieHeader(PROFILE_COOKIE, b64(user), 180 * 86400));

  return json({ ok: true, user }, 200, headers);
}
