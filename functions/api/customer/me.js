/* GET /api/customer/me —— 当前会话用户 + 当前登录模式（前端据此放宽/收紧表单校验） */
import { json, currentUser, publicUser } from './_shared.js';

const authMode = (env) => {
  const m = String((env && env.AUTH_MODE) || 'lenient').toLowerCase();
  return m === 'strict' ? 'strict' : 'lenient';
};

export async function onRequestGet({ request, env }) {
  const user = currentUser(request);
  return json({ ok: true, user: user ? publicUser(user) : null, auth_mode: authMode(env) });
}

export async function onRequest({ request, env }) {
  const user = currentUser(request);
  return json({ ok: true, user: user ? publicUser(user) : null, auth_mode: authMode(env) });
}
