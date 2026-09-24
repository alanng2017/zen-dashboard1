/**
 * Zen Dashboard - Cloudflare Worker
 * 用于 WORK / LIFE / NOTE 跨设备加密数据同步
 *
 * 部署后得到类似：https://zen-sync.你的子域.workers.dev
 */

const ALLOWED_PAGES = ['work', 'life', 'note'];

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, ''); // 去掉首尾斜杠

    // 健康检查
    if (path === '' || path === 'health') {
      return json({ ok: true, service: 'zen-dashboard-sync' }, 200, request);
    }

    // 只允许 /api/work  /api/life  /api/note
    const match = path.match(/^api\/(work|life|note)$/);
    if (!match) {
      return json({ error: 'Not Found' }, 404, request);
    }

    const page = match[1];
    const key = `zen:${page}`;

    try {
      if (request.method === 'GET') {
        // 读取数据
        const raw = await env.ZEN_KV.get(key);
        if (!raw) {
          return json({ hash: null, data: null }, 200, request);
        }
        const obj = JSON.parse(raw);
        return json({ hash: obj.hash || null, data: obj.data || null }, 200, request);
      }

      if (request.method === 'PUT') {
        // 保存数据
        const body = await request.json();
        if (!body || typeof body.hash !== 'string' || typeof body.data !== 'string') {
          return json({ error: 'Invalid body, need { hash, data }' }, 400, request);
        }
        // 简单长度限制，防止滥用
        if (body.data.length > 500000) {
          return json({ error: 'Data too large (max ~500KB)' }, 413, request);
        }
        await env.ZEN_KV.put(key, JSON.stringify({
          hash: body.hash,
          data: body.data,
          updated: Date.now(),
        }));
        return json({ ok: true }, 200, request);
      }

      if (request.method === 'DELETE') {
        await env.ZEN_KV.delete(key);
        return json({ ok: true }, 200, request);
      }

      return json({ error: 'Method Not Allowed' }, 405, request);
    } catch (err) {
      return json({ error: err.message || 'Server Error' }, 500, request);
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
