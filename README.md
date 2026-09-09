# Emby 保号管理

一个部署在 Cloudflare Workers 上的 Emby 服务器保号任务管理网页。

## 功能

- **添加服务器**：输入 Emby 服务器名称，选择保号方式
  - 观看保号：填写「多少天观看一次」
  - 签到保号：记录签到说明
  - 观看+签到保号：填写「天数」
- **粘贴识别**：粘贴「创建用户成功」信息，自动识别线路、用户名、密码、保号条件
- **多线路支持**：主线路 + 备用线路（含名称），支持 5 个播放器一键导入
- **搜索筛选**：按服务器名称实时搜索
- **卡片展示**：图标 + 名称 + 保号条件 + 线路/用户名/密码（默认掩码显示）
- **编辑 / 删除**：卡片可随时修改或删除
- 数据持久化到 Cloudflare D1（SQLite）

## 技术栈

- Cloudflare Workers（静态资源 + REST API）
- Cloudflare D1（数据存储）
- 原生 HTML/CSS/JS 单页应用

## 目录结构

```
emby-keepalive/
├── wrangler.toml      # Workers 配置（Assets + D1 绑定）
├── schema.sql         # D1 数据库表结构
├── src/index.js       # Worker 入口（静态资源 + /api/* 接口）
├── public/index.html  # 前端页面（正式版，走 Worker API）
├── public/preview.html# 前端页面（本地预览版，localStorage 存储）
├── public/icons.js    # 图标库
├── public/*.png       # 播放器图标 + 品牌 logo
└── deploy.sh          # 一键部署脚本
```

## 部署

### 方式一：Cloudflare 控制台（推荐，连接 GitHub 仓库）

1. 将本仓库推送到 GitHub
2. 打开 Cloudflare Dashboard → Workers & Pages → **Create** → **Pages** 或 **Workers**
3. 选择 **Connect to Git**，授权并选择本仓库
4. 构建配置：
   - Build command：留空（无需构建）
   - Build output directory：留空
5. 部署后，在 **Settings → Variables and Secrets** 中添加：
   - `ADMIN_TOKEN`（Secret）：管理面板访问口令
6. 创建 D1 数据库并绑定：
   - 在 D1 页面创建数据库 `emby-keepalive`
   - 执行 `schema.sql` 建表
   - 在 Worker/Pages 的 **Settings → Bindings** 中绑定 D1，变量名 `DB`
7. 重新部署即可

### 方式二：命令行部署

1. 登录 Cloudflare：
   ```bash
   npx wrangler login
   ```

2. 运行部署脚本（自动创建 D1、建表、设置口令、部署）：
   ```bash
   bash deploy.sh
   ```

3. 部署完成后访问输出的 `*.workers.dev` 地址。

## 安全

- API 已启用鉴权：所有 `/api/*` 请求需携带 `X-Admin-Token` 请求头，与 Worker 的 `ADMIN_TOKEN` 环境变量一致
- 首次打开面板会提示输入管理口令，口令保存在浏览器 localStorage
- 密码在卡片上默认掩码显示（`••••••••`），需点击「显示」才可见

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/servers` | 获取所有服务器列表 |
| POST | `/api/servers` | 新增服务器 |
| PUT | `/api/servers/:id` | 编辑服务器 |
| DELETE | `/api/servers/:id` | 删除服务器 |

所有接口需携带请求头 `X-Admin-Token: <ADMIN_TOKEN>`。

### 数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 服务器名称 |
| keep_mode | string | `watch` / `checkin` / `both` |
| watch_days | number | 观看天数（watch 时） |
| both_days | number | 观看天数（both 时） |
| icon | object | 图标 `{name, url}` |
| line | string | 主线路 |
| backup_lines | array | 备用线路 `[{name, address}]` |
| username | string | 用户名 |
| password | string | 密码 |
| server_type | string | `emby` / `jelly` / `webdav` / `smb` / `ftp` |