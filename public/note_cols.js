/* note_cols.js — 两栏 + 自定义分组（NOTE 页）
   notes 数组加 col 字段（0=左 / 1=右）。旧数据无 col → 左栏；
   旧三栏数据 col===2（原右栏）并入右栏，自动兼容。
   覆盖全局 render / saveNote，openEdit / deleteCurrent 等原有流程继续可用。 */
(function () {
  'use strict';
  var NCOL = 2;
  var NAMES_KEY = 'zen_' + (typeof PAGE !== 'undefined' ? PAGE : 'note') + '_colnames';
  var DEFAULT_NAMES = ['左栏', '右栏'];

  function getNames() {
    try {
      var raw = localStorage.getItem(NAMES_KEY);
      if (raw) {
        var a = JSON.parse(raw);
        if (Array.isArray(a) && a.length === NCOL) {
          return a.map(function (s) { return String(s).slice(0, 20); });
        }
      }
    } catch (e) {}
    return DEFAULT_NAMES.slice();
  }
  function setNames(a) { try { localStorage.setItem(NAMES_KEY, JSON.stringify(a)); } catch (e) {} }
  // 旧三栏：col 0→左(0)，col 1/2→右(1)；无 col → 左
  function colOf(n) { var c = n && n.col; return (c === 1 || c === 2) ? 1 : 0; }

  // ---------- CSS ----------
  var css = document.createElement('style');
  css.textContent = [
    '.cols2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.9rem; align-items: start; }',
    '@media (max-width: 820px) { .cols2 { grid-template-columns: 1fr; } }',
    '.col-box { background: rgba(255,255,255,0.6); border: 1px solid rgba(90,107,138,0.22); border-radius: 10px; padding: 0.7rem; min-height: 90px; }',
    '.col-head { font-size: 0.92rem; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem; padding-bottom: 0.35rem; border-bottom: 1px dashed rgba(90,107,138,0.3); cursor: pointer; display: flex; justify-content: space-between; align-items: baseline; }',
    '.col-head small { font-weight: 400; color: #999; font-size: 0.72rem; }',
    '.col-empty { color: #aaa; font-size: 0.82rem; text-align: center; padding: 0.8rem 0; }',
    '.col-item { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; padding: 0.45rem 0.25rem; border-bottom: 1px dashed rgba(90,107,138,0.15); }',
    '.col-item:last-child { border-bottom: none; }',
    '.col-item a { color: var(--ink); text-decoration: none; flex: 1; font-size: 0.88rem; word-break: break-all; cursor: pointer; }',
    '.col-item a:hover { color: var(--accent); text-decoration: underline; }',
    '.col-item button.danger { padding: 0.2rem 0.45rem; font-size: 0.72rem; }'
  ].join('\n');
  document.head.appendChild(css);

  // ---------- 新建笔记时的栏目选择器 ----------
  function injectColPicker() {
    if (document.getElementById('colSelect')) return;
    var btn = document.querySelector('button[onclick="openEdit(-1)"]');
    if (!btn) return;
    var sel = document.createElement('select');
    sel.id = 'colSelect';
    sel.style.cssText = 'margin-left:0.5rem;padding:0.45rem;border-radius:8px;border:1px solid #ccc;font-family:inherit;font-size:0.9rem;';
    getNames().forEach(function (n, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = '新建到：' + (n || ('栏 ' + (i + 1)));
      sel.appendChild(o);
    });
    btn.parentNode.insertBefore(sel, btn.nextSibling);
  }

  // ---------- 两栏渲染 ----------
  function render() {
    var host = document.getElementById('noteList');
    var empty = document.getElementById('emptyTip');
    if (!host) return;
    host.innerHTML = '';
    var names = getNames();
    var buckets = [[], []];
    notes.forEach(function (n, i) { buckets[colOf(n)].push({ n: n, i: i }); });
    if (empty) empty.style.display = notes.length === 0 ? 'block' : 'none';

    var wrap = document.createElement('div');
    wrap.className = 'cols2';

    buckets.forEach(function (bucket, ci) {
      var box = document.createElement('div');
      box.className = 'col-box';

      var head = document.createElement('div');
      head.className = 'col-head';
      head.title = '点击重命名此栏';
      var nm = document.createElement('span');
      nm.textContent = names[ci] || ('栏 ' + (ci + 1));
      var cnt = document.createElement('small');
      cnt.textContent = bucket.length + ' 条';
      head.appendChild(nm);
      head.appendChild(cnt);
      head.onclick = function () {
        var v = prompt('栏目名称：', names[ci]);
        if (v === null) return;
        var nn = getNames();
        nn[ci] = String(v).trim().slice(0, 20) || ('栏 ' + (ci + 1));
        setNames(nn);
        render();
      };
      box.appendChild(head);

      if (!bucket.length) {
        var e = document.createElement('div');
        e.className = 'col-empty';
        e.textContent = '空';
        box.appendChild(e);
      }

      bucket.sort(function (a, b) {
        return (b.n.updated || b.n.created || 0) - (a.n.updated || a.n.created || 0);
      });

      bucket.forEach(function (row) {
        var n = row.n, i = row.i;
        var item = document.createElement('div');
        item.className = 'col-item';

        var a = document.createElement('a');
        a.textContent = n.title || '（无标题）';
        a.onclick = function () { openEdit(i); };

        var del = document.createElement('button');
        del.className = 'danger';
        del.textContent = '删';
        del.onclick = function () {
          if (!confirm('确定删除「' + (n.title || '（无标题）') + '」？')) return;
          notes.splice(i, 1);
          saveNotes().then(render);
        };

        item.appendChild(a);
        item.appendChild(del);
        box.appendChild(item);
      });

      wrap.appendChild(box);
    });

    host.appendChild(wrap);
  }

  // ---------- 保存（新建时写入所选栏） ----------
  function saveNote() {
    var title = document.getElementById('noteTitle').value.trim();
    var content = document.getElementById('noteContent').value;
    if (!title && !content.trim()) { alert('标题和内容不能都为空'); return; }
    var now = Date.now();
    if (editingIndex < 0) {
      var col = 0;
      var sel = document.getElementById('colSelect');
      if (sel) col = parseInt(sel.value, 10) || 0;
      if (col !== 1) col = 0;
      notes.push({ title: title, content: content, created: now, updated: now, col: col });
    } else {
      var n = notes[editingIndex];
      n.title = title;
      n.content = content;
      n.updated = now;
      if (n.col !== 1) n.col = 0;
    }
    saveNotes().then(function () {
      closeEdit();
      render();
    });
  }

  // ---------- 挂到全局，覆盖原实现 ----------
  window.render = render;
  window.saveNote = saveNote;

  injectColPicker();
  if (typeof notes !== 'undefined' && Array.isArray(notes)) render();
})();
