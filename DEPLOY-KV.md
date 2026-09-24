# Cloudflare KV 跨设备同步 · 配置指南

本方案使用 **Cloudflare Worker + KV**，让 WORK / LIFE / NOTE 的加密数据可以在任意设备同步。

密码仍然只在你本地使用（AES 加密），Worker 只存加密后的密文，服务器看不到明文。

---

## 一、创建 KV 命名空间

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **Workers & Pages** → **KV**
3. 点击 **Create a namespace**
4. 名称填：`ZEN_KV`（必须一致）
5. 点击 Create

记下这个命名空间（后面绑定用）。

---

## 二、创建并部署 Worker

### 方法 A：Dashboard 在线创建（推荐新手）

1. 进入 **Workers & Pages** → **Create** → **Create Worker**
2. 名称随意，例如 `zen-sync`
3. 点击 **Deploy**
4. 进入该 Worker → **Edit code**
5. 把 `worker.js` 的全部内容复制进去，覆盖原有代码
6. 点击 **Save and Deploy**

### 方法 B：使用 Wrangler（命令行）

```bash
# 安装
npm install -g wrangler

# 登录
wrangler login

# 在项目目录创建
mkdir zen-worker && cd zen-worker
# 把 worker.js 放进来

# 创建配置文件 wrangler.toml
```

`wrangler.toml` 内容：

```toml
name = "zen-sync"
main = "worker.js"
compatibility_date = "2024-09-01"

[[kv_namespaces]]
binding = "ZEN_KV"
id = "你的KV命名空间ID"          # 在 KV 页面可以看到
```

然后：

```bash
wrangler deploy
```

---

## 三、绑定 KV 到 Worker

1. 进入你刚创建的 Worker
2. 点击 **Settings** → **Variables**
3. 找到 **KV Namespace Bindings** → **Add binding**
4. Variable name 填：`ZEN_KV`（必须和代码里一致）
5. KV namespace 选择刚才创建的 `ZEN_KV`
6. 保存并重新部署

---

## 四、获取 Worker 地址

部署成功后，Worker 会有一个地址，类似：

```
https://zen-sync.你的账号.workers.dev
```

复制这个地址，后面要用。

可以先访问：

```
https://zen-sync.你的账号.workers.dev/health
```

如果返回 `{"ok":true,"service":"zen-dashboard-sync"}` 就说明成功了。

---

## 五、前端配置（把 Worker 地址写进页面）

打开以下三个文件，找到最顶部的配置行：

```js
const WORKER_URL = '';   // ← 改成你的 Worker 地址
```

改成例如：

```js
const WORKER_URL = 'https://zen-sync.你的账号.workers.dev';
```

需要改的文件：
- `work.html`
- `life.html`
- `note.html`

改完后重新上传到 Cloudflare Pages（或 git push）。

---

## 六、使用说明

1. **第一次**在任意设备打开 WORK / LIFE / NOTE
2. 设置密码（或输入已有密码）
3. 添加链接 / 笔记后，会自动同步到 KV
4. 换另一台设备打开同一页面 → 输入相同密码 → 自动拉取最新数据

### 同步逻辑
- 有 `WORKER_URL` 时：优先使用云端数据
- 本地仍会缓存一份（离线也能看）
- 保存时同时写本地 + 云端

### 安全说明
- 密码永远不会上传到服务器
- 上传的是 AES-GCM 加密后的密文
- 即使有人拿到 KV 数据，没有密码也无法解密

---

## 七、可选：自定义域名

在 Worker 的 **Triggers** → **Custom Domains** 里可以绑定自己的域名，例如：

```
https://sync.你的域名.com
```

然后把 `WORKER_URL` 改成这个新地址即可。

---

## 常见问题

**Q：换设备后提示密码错误？**  
A：请确认使用的是同一套密码。如果之前只在本地用过，需要先在旧设备「导出」，再在新设备「导入」。

**Q：数据会丢吗？**  
A：KV 有 Cloudflare 的持久化保证。建议偶尔点一下「导出」做本地备份。

**Q：免费额度够用吗？**  
A：个人使用完全足够。KV 每天有较高的免费读写次数，Workers 也有充足的请求额度。

---

配置完成后，你的三个二级页面就可以在任意设备、任意浏览器之间同步了。
