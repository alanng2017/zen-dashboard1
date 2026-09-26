/* ==== 两栏自定义分组（左/右）—— work / life / ai 共用 ====
 * 覆盖原 render / addLink / loadLinks / saveLinks；数据存 {v:2,groups:[{name,links}]}
 * 旧格式 links:[{name,url}] 自动迁移到左栏；旧三栏数据第 2/3 组并入右栏。
 * Worker 无需改动（密文对 Worker 不透明）。
 */
(function () {
  const CSS = `
  .zen-cols{display:grid;grid-template-columns:repeat(2,1fr);gap:0.9rem;margin-top:0.6rem}
  @media(max-width:820px){.zen-cols{grid-template-columns:1fr}}
  .zen-col{background:rgba(255,255,255,0.55);border:1px dashed rgba(120,120,120,0.35);border-radius:10px;padding:0.6rem 0.7rem;min-height:120px}
  .zen-col-head{display:flex;justify-content:space-between;align-items:baseline;font-size:0.95rem;color:var(--accent);margin-bottom:0.45rem;border-bottom:1px solid rgba(120,120,120,0.22);padding-bottom:0.35rem}
  .zen-col-title{cursor:pointer;font-weight:600}
  .zen-col-title:hover{text-decoration:underline}
  .zen-col-count{font-size:0.75rem;opacity:0.7}
  ul.zen-list{list-style:none}
  .zen-item{display:flex;align-items:center;justify-content:space-between;gap:0.4rem;padding:0.45rem 0.1rem;border-bottom:1px dashed rgba(120,120,120,0.18)}
  .zen-item:last-child{border-bottom:none}
  .zen-item a{display:block;color:var(--ink);text-decoration:none;word-break:break-all;font-size:0.92rem;flex:1;min-width:0}
  .zen-item a:hover{color:var(--accent);text-decoration:underline}
  .zen-item button.danger{flex:0 0 auto;padding:0.2rem 0.45rem;font-size:0.72rem}
  .zen-empty{color:#999;font-size:0.8rem;padding:0.5rem 0.1rem}
  #groupSel{padding:0.55rem 0.6rem;border:1px solid #ccc;border-radius:8px;font-family:inherit;font-size:0.9rem;background:#fff;flex:0 0 auto}
  `;

  const COLS = ['左栏', '右栏'];
  const blank = () => COLS.map(() => ({ name: '', links: [] }));
  let G = null;

  function pushInto(dst, it) {
    if (it && it.url) dst.links.push({ name: it.name || it.url, url: it.url });
  }

  // 旧格式 links:[] 或 {groups:[...]} → 两栏（旧第 2/3 栏并入右栏）
  function migrate(p) {
    const g = blank();
    if (Array.isArray(p)) {
      p.forEach(it => pushInto(g[0], it));
    } else if (p && Array.isArray(p.groups)) {
      p.groups.forEach((s, i) => {
        if (!s) return;
        const ti = i >= 1 ? 1 : 0;
        if (i <= 1) g[ti].name = String(s.name || '');
        else if (!g[1].name) g[1].name = String(s.name || ''); // 旧右栏名带入
        (Array.isArray(s.links) ? s.links : []).forEach(it => pushInto(g[ti], it));
      });
    }
    return g;
  }

  // ---------- 数据层 ----------
  window.loadLinks = async function () {
    if (!currentPassword) { G = blank(); return; }
    let raw = null;
    if (WORKER_URL) {
      try {
        const res = await fetch(`${WORKER_URL}/api/${PAGE}`);
        if (res.ok) {
          const obj = await res.json();
          if (obj.data) {
            raw = obj.data;
            localStorage.setItem(DATA_KEY, raw);
            if (obj.hash) localStorage.setItem(HASH_KEY, obj.hash);
          }
        }
      } catch (e) { console.warn('云端读取失败，使用本地缓存', e); }
    }
    if (!raw) raw = localStorage.getItem(DATA_KEY);
    if (!raw) { G = blank(); return; }
    try { G = migrate(JSON.parse(await decrypt(raw, currentPassword))); }
    catch (e) { G = blank(); alert('数据解密失败，可能是密码错误或数据已损坏。'); }
  };

  window.saveLinks = async function () {
    if (!currentPassword) return;
    const encrypted = await encrypt(JSON.stringify({ v: 2, groups: G }), currentPassword);
    const hash = await sha256(currentPassword);
    localStorage.setItem(DATA_KEY, encrypted);
    localStorage.setItem(HASH_KEY, hash);
    if (WORKER_URL) {
      try {
        await fetch(`${WORKER_URL}/api/${PAGE}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash, data: encrypted }),
        });
      } catch (e) { console.warn('云端保存失败（本地已保存）', e); }
    }
  };

  // ---------- 视图层 ----------
  window.render = function () {
    const host = document.getElementById('zenCols');
    if (!host) return;
    if (!G) G = blank();
    host.innerHTML = '';
    G.forEach((g, gi) => {
      const col = document.createElement('div'); col.className = 'zen-col';

      const head = document.createElement('div'); head.className = 'zen-col-head';
      const title = document.createElement('span'); title.className = 'zen-col-title';
      title.textContent = g.name || COLS[gi];
      title.title = '点击重命名分组';
      title.onclick = async () => {
        const n = prompt('分组名称（留空恢复默认「' + COLS[gi] + '」）', g.name || '');
        if (n === null) return;
        g.name = n.trim();
        await saveLinks(); render();
      };
      const cnt = document.createElement('span'); cnt.className = 'zen-col-count';
      cnt.textContent = g.links.length + ' 条';
      head.appendChild(title); head.appendChild(cnt); col.appendChild(head);

      const ul = document.createElement('ul'); ul.className = 'zen-list';
      if (!g.links.length) {
        const d = document.createElement('li'); d.className = 'zen-empty';
        d.textContent = '（空，点上方添加）'; ul.appendChild(d);
      }
      g.links.forEach((item, idx) => {
        const row = document.createElement('li'); row.className = 'zen-item';
        const a = document.createElement('a');
        a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = item.name || item.url;

        const del = document.createElement('button'); del.className = 'danger'; del.textContent = '删除';
        del.onclick = async () => {
          if (!confirm('确定删除「' + (item.name || item.url) + '」？')) return;
          g.links.splice(idx, 1); await saveLinks(); render();
        };
        row.appendChild(a); row.appendChild(del);
        ul.appendChild(row);
      });
      col.appendChild(ul); host.appendChild(col);
    });
  };

  window.addLink = async function () {
    const nameEl = document.getElementById('nameInput');
    const urlEl = document.getElementById('urlInput');
    const sel = document.getElementById('groupSel');
    const gi = sel ? (+sel.value === 1 ? 1 : 0) : 0;
    let url = urlEl.value.trim();
    const name = nameEl.value.trim();
    if (!url) { alert('请填写网址'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { alert('网址格式不正确'); return; }
    if (!G) G = blank();
    G[gi].links.push({ name: name || url, url });
    await saveLinks();
    nameEl.value = ''; urlEl.value = '';
    render();
  };

  // ---------- DOM 注入 ----------
  function injectUI() {
    const st = document.createElement('style'); st.textContent = CSS;
    document.head.appendChild(st);

    const list = document.getElementById('linkList');
    if (list) {
      list.style.display = 'none';
      const et = document.getElementById('emptyTip'); if (et) et.style.display = 'none';
      const card = list.closest('.card') || list.parentNode;
      const cols = document.createElement('div'); cols.id = 'zenCols'; cols.className = 'zen-cols';
      card.appendChild(cols);
    }
    const form = document.querySelector('.form-row');
    if (form && !document.getElementById('groupSel')) {
      const sel = document.createElement('select'); sel.id = 'groupSel'; sel.title = '添加到哪一栏';
      COLS.forEach((lab, i) => {
        const o = document.createElement('option'); o.value = i; o.textContent = lab;
        sel.appendChild(o);
      });
      form.appendChild(sel);
    }
  }
  injectUI();

  // 原始 init 已同步设好 currentPassword；此处用新数据层重载一次。
  (async () => {
    const pwd = localStorage.getItem(SHARED_PWD_KEY);
    const main = document.getElementById('mainContent');
    if (!pwd || !main || main.classList.contains('hidden')) return;
    currentPassword = currentPassword || pwd;
    await loadLinks();
    render();
  })();
})();
