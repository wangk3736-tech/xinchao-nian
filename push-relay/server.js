// Bark → 微信 推送转发：心潮按 Bark 格式 POST {BARK_SERVER}/{BARK_KEY}，这里转给 PushPlus 或 Server酱。
// 零依赖，Node >= 20。
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const RELAY_KEY = process.env.RELAY_KEY || '';            // 心潮那边的 BARK_KEY 填这个
const PROVIDER = (process.env.PUSH_PROVIDER || 'pushplus').toLowerCase(); // pushplus | serverchan
const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN || '';
const PUSHPLUS_TOPIC = process.env.PUSHPLUS_TOPIC || '';  // 可选：群组推送编码
const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || '';
const DEFAULT_TITLE = process.env.DEFAULT_TITLE || '心潮';

if (!RELAY_KEY) { console.error('RELAY_KEY 未设置'); process.exit(1); }
if (PROVIDER === 'pushplus' && !PUSHPLUS_TOKEN) { console.error('PUSHPLUS_TOKEN 未设置'); process.exit(1); }
if (PROVIDER === 'serverchan' && !SERVERCHAN_KEY) { console.error('SERVERCHAN_KEY 未设置'); process.exit(1); }

const log = (event, extra = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...extra }));

async function forward(title, body) {
  if (PROVIDER === 'serverchan') {
    const m = SERVERCHAN_KEY.match(/^sctp(\d+)t/);
    const url = m
      ? `https://${m[1]}.push.ft07.com/send/${SERVERCHAN_KEY}.send`
      : `https://sctapi.ftqq.com/${SERVERCHAN_KEY}.send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body: JSON.stringify({ title: title.slice(0, 32), desp: body }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code !== undefined && data.code !== 0)) throw new Error(`serverchan: HTTP ${res.status} ${JSON.stringify(data)}`);
    return;
  }
  const payload = { token: PUSHPLUS_TOKEN, title, content: body, template: 'txt' };
  if (PUSHPLUS_TOPIC) payload.topic = PUSHPLUS_TOPIC;
  const res = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 200) throw new Error(`pushplus: HTTP ${res.status} ${JSON.stringify(data)}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 64 * 1024) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function parse(raw, contentType) {
  if (!raw) return {};
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { return {}; }
}

const reply = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0 || parts[0] === 'healthz') return reply(res, 200, { ok: true, provider: PROVIDER });
  if (parts[0] !== RELAY_KEY) return reply(res, 404, { code: 404, message: 'not found' });

  try {
    let title, body;
    if (req.method === 'POST') {
      const data = parse(await readBody(req), String(req.headers['content-type'] || ''));
      title = data.title; body = data.body;
    } else if (req.method === 'GET') {
      if (parts.length === 2) body = parts[1];
      else if (parts.length >= 3) { title = parts[1]; body = parts.slice(2).join('/'); }
    } else return reply(res, 405, { code: 405, message: 'method not allowed' });

    title = title || url.searchParams.get('title') || DEFAULT_TITLE;
    body = body || url.searchParams.get('body') || '';
    if (!body) return reply(res, 400, { code: 400, message: 'body 为空' });

    await forward(String(title), String(body));
    log('sent', { provider: PROVIDER, len: String(body).length });
    return reply(res, 200, { code: 200, message: 'success' });
  } catch (error) {
    log('failed', { message: error.message });
    return reply(res, 502, { code: 502, message: error.message });
  }
}).listen(PORT, () => log('listening', { port: PORT, provider: PROVIDER }));
