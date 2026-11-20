/*
  GET /api/customer/telegram-test —— 验证 Telegram 配置是否可用（只发一条测试消息）
  返回 { ok, configured, status, description }
  没配 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 时 configured:false，不会外发任何请求。
*/
import { json } from './_shared.js';
import { notifyTelegram, clientMeta } from './_store.js';

export async function onRequestGet({ request, env }) {
  const configured = Boolean(env && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  if (!configured) {
    return json({
      ok: false,
      configured: false,
      message: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 未配置（Pages → Settings → Environment variables）',
    });
  }

  const meta = clientMeta(request);
  const text = [
    '🔔 <b>Telegram 连通性测试</b>',
    '',
    `<b>Site</b>: ${env.SITE_LABEL || 'Landers clone'}`,
    `<b>IP</b>: ${meta.ip || '-'} ${meta.country ? `(${meta.country})` : ''}`,
    `<b>Time</b>: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  ].join('\n');

  const r = await notifyTelegram(env, text);
  return json({
    ok: Boolean(r.ok),
    configured: true,
    status: r.status || null,
    description: r.description || r.reason || null,
  });
}
