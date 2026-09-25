/**
 * Zen Dashboard - Cloudflare Worker
 * WORK / LIFE / NOTE 加密数据同步
 * + 国内 IP 归属地反查（百度地图 API + ip-api.com 双源）
 * + Workers Assets 托管前端静态页（index / work / life / note）
 *
 * 路由约定：
 *   /                 → 静态资源（index.html）
 *   /work.html 等     → 静态资源
 *   /health           → 健康检查 JSON
 *   /api/ip/me        → 访客真实公网 IP（CF-Connecting-IP）
 *   /api/ip/cn?ip=x   → 国内归属地反查
 *   /api/work|life|note  → KV 读写
 */

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

    // 健康检查（根路径 / 交给静态资源，避免首页变成 JSON）
    if (path === 'health') {
      return json({ ok: true, service: 'zen-dashboard-sync' }, 200, request);
    }

    // 天气中转：wttr.in 属境外，国内浏览器直连易超时，由 Worker 代理
    // GET /api/weather?city=Qidong,Jiangsu,China
    if (path === 'api/weather') {
      const city = url.searchParams.get('city') || 'Qidong,Jiangsu,China';
      try {
        const r = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        if (!r.ok) return json({ error: 'weather upstream ' + r.status }, 502, request);
        const j = await r.json();
        const c = (j.current_condition && j.current_condition[0]) || {};
        return json({
          temp: c.temp_C,
          code: c.weatherCode,
          feels: c.FeelsLikeC,
          humidity: c.humidity,
          desc: (c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value) || '',
        }, 200, request);
      } catch (err) {
        return json({ error: 'weather upstream failed' }, 502, request);
      }
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
          const loc = parseBaiduLoc(j.data[0].location);
          if (loc.prov || loc.city) {
            return json({
              ret: 200,
              data: {
                country: '中国',
                prov: loc.prov,
                city: loc.city,
                area: loc.area,
                isp: loc.isp,
              },
            }, 200, request);
          }
        }
      } catch (err) {
        // 百度失败，尝试 ip-api.com
      }

      // 源2：ip-api.com（区县级更细，带 ISP）
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
              isp: j.isp || '',
            },
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
      // 非 API 路径 → 回退到静态资源
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: 'Not Found' }, 404, request);
    }

    const page = match[1];
    const key = `zen:${page}`;

    try {
      if (request.method === 'GET') {
        const raw = await env.ZEN_KV.get(key);
        if (!raw) {
          return json({ hash: null, data: null }, 200, request);
        }
        const obj = JSON.parse(raw);
        return json({ hash: obj.hash || null, data: obj.data || null }, 200, request);
      }

      if (request.method === 'PUT') {
        const body = await request.json();
        if (!body || typeof body.hash !== 'string' || typeof body.data !== 'string') {
          return json({ error: 'Invalid body, need { hash, data }' }, 400, request);
        }
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

/**
 * 解析百度返回的 location 串，例如：
 *   "北京市海淀区 CNNIC"        → prov=北京市 city=海淀区 area=CNNIC
 *   "江苏省南通市启东市 电信"    → prov=江苏省 city=南通市 area=启东市 电信
 *   "浙江省金华市义乌市 电信"    → prov=浙江省 city=金华市 area=义乌市 电信
 */
function parseBaiduLoc(location) {
  let rest = String(location || '').trim();
  let prov = '', city = '';

  let m = rest.match(/^(.+?(?:省|自治区|特别行政区))/);
  if (m) {
    prov = m[1];
    rest = rest.slice(m[1].length);
  } else {
    m = rest.match(/^(.+?市)/);
    if (m) {
      prov = m[1];
      rest = rest.slice(m[1].length);
    }
  }

  m = rest.match(/^(.+?(?:市|区|县|盟|州|地区))/);
  if (m) {
    city = m[1];
    rest = rest.slice(m[1].length);
  }

  // 剩余部分含运营商关键词则归 ISP，否则归 area
  const tail = rest.trim();
  const isIsp = /电信|联通|移动|铁通|广电|教育网|CNNIC|阿里|腾讯|华为|云|网络|科技|通信/.test(tail);

  return {
    prov,
    city,
    area: isIsp ? '' : tail,
    isp: isIsp ? tail : '',
  };
}

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
