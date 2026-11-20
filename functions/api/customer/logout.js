/* POST /api/customer/logout —— 清会话（保留 ld_profile，方便下次登录带回资料） */
import { json, cookieHeader, USER_COOKIE } from './_shared.js';

export async function onRequestPost() {
  const headers = new Headers();
  headers.append('Set-Cookie', cookieHeader(USER_COOKIE, '', 0));
  return json({ ok: true }, 200, headers);
}
