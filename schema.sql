-- Emby 保号管理数据库
-- 卡片表：每个 Emby 服务器账号一条记录

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- Emby 服务器名称
  keep_mode TEXT NOT NULL,            -- watch / checkin / both / none / white / expiry
  watch_days INTEGER,                 -- 观看保号：多少天观看一次
  both_days INTEGER,                  -- 观看+签到：天数
  expiry_date TEXT,                   -- 到期时间：到期日期 YYYY-MM-DD
  icon TEXT,                          -- 图标 JSON: {"name":"...","url":"..."}
  line TEXT,                          -- 线路（服务器地址/URL）
  backup_lines TEXT,                  -- 备用线路 JSON 数组: ["https://...","https://..."]
  username TEXT,                      -- 用户名
  password TEXT,                      -- 密码
  security_password TEXT,             -- 安全密码
  max_streams INTEGER,                -- 同时播放数
  recommended_node TEXT,              -- 推荐播放节点
  unavailable TEXT,                   -- 不可用（播放器名称）
  server_type TEXT NOT NULL DEFAULT 'emby',  -- webdav/smb/ftp/emby/jelly
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_servers_created ON servers(created_at DESC);