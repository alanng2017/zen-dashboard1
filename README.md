# 禅意仪表盘 · Zen Dashboard

纯静态网页，专为 **Cloudflare Pages** 优化，零构建、全球加速、免费 HTTPS。

## 功能

- 顶部随机激励格言 / 佛家禅语 / 名人名言（可点击刷新）
- 实时时间与日期
- 天气（wttr.in，自动定位）
- 局域网 IP（WebRTC）
- 公网 IP + 中英文归属地
- Google / YouTube / Gemini / Grok / ChatGPT 连通性检测
- **WORK** / **LIFE** 二级页面：密码保护 + AES加密链接，支持导出/导入跨设备
- **NOTE** 笔记页面：密码保护 + AES加密笔记，支持新建/编辑/删除，导出/导入

## Cloudflare Pages 推荐部署方式

### 方法一：直接上传（最快）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 项目名称随意（如 `zen-dashboard`）
3. 把本文件夹内的所有文件（`index.html`、`work.html`、`life.html`、`404.html`、`_headers` 等）直接拖进去上传
4. 点击 **Deploy site**
5. 几秒后即可获得 `https://xxx.pages.dev` 地址

### 方法二：连接 GitHub（推荐长期维护）

1. 把本文件夹推送到 GitHub 仓库（可公开或私有）
2. Cloudflare Pages → **Create project** → **Connect to Git**
3. 选择仓库
4. 构建设置：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `/`（或 `.`）
5. 点击 **Save and Deploy**

之后每次 `git push` 会自动重新部署。

## 已做的优化

| 项目 | 说明 |
|------|------|
| `_headers` | 安全头（防点击劫持、XSS 等）+ 合理缓存策略 |
| `404.html` | 禅意风格 404 页面 |
| Favicon | 内联 SVG，无需额外文件 |
| Meta / theme-color | 更好的手机浏览器体验 |
| 纯静态 | 无 Node、无构建、部署秒级完成 |
| 字体 | `display=swap`，避免阻塞渲染 |

## 自定义域名（可选）

1. 在 Cloudflare 添加你的域名（如果还没有）
2. Pages 项目 → **Custom domains** → 添加域名
3. 按提示配置 DNS（通常是 CNAME 到 `xxx.pages.dev`）
4. 自动获得免费 SSL

## 文件结构

```
zen-dashboard/
├── index.html      # 主页
├── work.html       # 工作链接（密码保护）
├── life.html       # 生活娱乐链接（密码保护）
├── note.html       # 笔记（密码保护）
├── 404.html        # 自定义 404
├── _headers        # Cloudflare 缓存与安全头
└── README.md
```

## 注意事项

- WORK / LIFE 链接保存在浏览器 `localStorage`，仅当前设备有效。
- 部分 IP / 天气接口依赖外部免费服务，偶发失败属正常。
- 现代浏览器隐私政策可能导致局域网 IP 获取失败。
- 如需跨设备同步链接，可后续接入 Cloudflare KV + Workers。

---

愿你心静如水 · 部署顺利
