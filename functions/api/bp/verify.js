/*
  /api/bp/verify —— 契约 §10 / README 三节的服务端准入薄代理。
  当前 bp/config.json 里 enable_verify=false，connector 不会调用本接口；
  需要按 IP/国家过滤时把它改成 true，并在 Pages 里配置 PANEL_ORIGIN 环境变量。
*/

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';

  const origin = env.PANEL_ORIGIN;
  if (!origin) {
    // 没有配置面板地址时 fail-open：纯静态站不阻塞结账
    return Response.json({ ok: true, data: { bypass: true, reason: 'PANEL_ORIGIN not configured' } });
  }

  try {
    const upstream = await fetch(origin.replace(/\/+$/, '') + '/api/UserEnvironmentDetection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ user_ip: ip, user_agent: ua, referer: body.referer || '' }),
    });
    const data = await upstream.json().catch(() => null);
    if (data && data.status === 'success') return Response.json({ ok: true, data: data.data });
    return Response.json({ ok: false, reason: (data && data.data && data.data.reason) || 'denied' });
  } catch (e) {
    return Response.json({ ok: false, reason: 'upstream_error' });
  }
}
