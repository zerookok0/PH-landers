#!/usr/bin/env node
/**
 * 极简 CDP 探针：用来在真浏览器里量尺寸 / 跑断言。
 *
 *   node scripts/cdp-probe.mjs <url> "<js expression>" [width] [height]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const [, , url, expr, w = '390', h = '844'] = process.argv;
if (!EDGE) throw new Error('no edge/chrome found');

const port = 9333 + Math.floor(Math.random() * 200);
const profile = `${process.env.TEMP}\\cdp-${Date.now()}`;

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${w},${h}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getWS = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('cdp not ready');
};

const main = async () => {
  const wsUrl = await getWS();
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(w),
    height: Number(h),
    deviceScaleFactor: 1,
    mobile: Number(w) < 500,
  });
  await send('Page.navigate', { url });
  await sleep(3500);

  const res = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(JSON.stringify(res.result.value ?? res.result.description ?? null, null, 2));

  ws.close();
  child.kill();
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch (e) {}
};

main().catch((e) => {
  console.error('[cdp]', e.message);
  try {
    child.kill();
  } catch (err) {}
  process.exit(1);
});
