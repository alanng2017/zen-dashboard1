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

    // 访问者真实公网 IP（CF-Connecting-IP）
    if (path === 'api/ip/me') {
      const ip = request.headers.get('CF-Connecting-IP') || '';
      return json({ ip }, 200, request);
    }

    // 国内归属地反查：浏览器直连无 CORS 头，由 Worker 服务端转发
    // GET /api/ip/cn?ip=1.2.3.4 → 百度地图 API + ip-api.com 双源解析
    if (path === 'api/ip/cn') {
      const ip = url.searchParams.get('ip');
      if (!ip) return json({ error: 'need ?ip=' }, 400, request);

      // 源1：百度地图 API（稳定，无需 token）
      try {
        const r = await fetch(`https://opendata.baidu.com/api.php?query=${ip}&co=&resource_id=6006&oe=utf8`);
        const j = await r.json();
        if (j.status === '0' && j.data && j.data.length > 0) {
          const d = j.data[0];
          // 百度返回：location: "北京市 海淀区 电信"
          const parts = (d.location || '').split(' ');
          return json({
            ret: 200,
            data: {
              country: '中国',
              prov: parts[0] || '',
              city: parts[1] || '',
              area: parts.slice(2).join(' ') || '',
              isp: ''
            }
          }, 200, request);
        }
      } catch (err) {
        // 百度失败，尝试 ip-api.com
      }

      // 源2：ip-api.com（更精确，但偶发超时）
      try {
        const r = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
        const j = await r.json();
        if (j.status === 'success') {
          return json({
            ret: 200,
            data: {
              country: j.country || '中国',
              prov: j.regionName || '',
              city: j.city || '',
              area: '',
              isp: j.isp || ''
            }
          }, 200, request);
        }
      } catch (err) {
        // 都失败
      }

      return json({ error: 'all lookups failed' }, 502, request);
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
