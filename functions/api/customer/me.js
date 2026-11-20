/* GET /api/customer/me —— 当前会话用户（前端页头/账号页用） */
import { json, currentUser, publicUser } from './_shared.js';

export async function onRequestGet({ request }) {
  const user = currentUser(request);
  return json({ ok: true, user: user ? publicUser(user) : null });
}

export async function onRequest({ request }) {
  const user = currentUser(request);
  return json({ ok: true, user: user ? publicUser(user) : null });
}
