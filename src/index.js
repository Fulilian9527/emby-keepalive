// Emby 保号管理 Worker
// 静态资源走 ASSETS 绑定，/api/* 走 D1 数据库

// 同源部署（前端即 Worker 静态资源），无需跨域；收紧 CORS 防止其他网站偷数据
const CORS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  "Access-Control-Max-Age": "86400",
};

// 鉴权：校验 X-Admin-Token 是否匹配 ADMIN_TOKEN 环境变量
function authorized(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token) return true; // 未配置 token 时放行（开发/首次部署）
  const provided = request.headers.get("X-Admin-Token") || "";
  // 常量时间比较，防时序攻击
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(token);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// 校验保号方式字段
function validate(body) {
  const { name, keep_mode, watch_days, both_days, expiry_date, server_type } = body;
  if (!name || !String(name).trim()) return "服务器名称不能为空";
  if (!["watch", "checkin", "both", "none", "white", "expiry"].includes(keep_mode))
    return "保号方式无效";

  if (server_type != null && server_type !== "") {
    if (!["webdav", "smb", "ftp", "emby", "jelly"].includes(server_type))
      return "服务器类型无效";
  }

  if (keep_mode === "watch") {
    const n = Number(watch_days);
    if (!Number.isInteger(n) || n <= 0) return "观看保号需填写有效的天数";
  }
  if (keep_mode === "both") {
    const n = Number(both_days);
    if (!Number.isInteger(n) || n <= 0) return "观看+签到保号需填写有效的天数";
  }
  if (keep_mode === "expiry") {
    if (!expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(expiry_date)))
      return "到期时间需填写有效的日期";
  }
  return null;
}

// 可选字符串字段 → 空串转 null
function optStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// 服务器类型 → 小写，默认 emby
function normType(v) {
  const s = optStr(v);
  if (!s) return "emby";
  return s.toLowerCase();
}

// 备用线路数组 → JSON 字符串（存库）；空数组 → null
// 支持对象数组 [{name, address}] 或旧版字符串数组 ["url"]
function serializeBackupLines(arr) {
  if (!Array.isArray(arr)) return null;
  const list = arr
    .map((v) => {
      if (v == null) return null;
      if (typeof v === "string") return { name: "", address: v.trim() };
      const name = v.name ? String(v.name).trim() : "";
      const address = v.address ? String(v.address).trim() : "";
      return { name, address };
    })
    .filter((v) => v && v.address !== "");
  if (list.length === 0) return null;
  return JSON.stringify(list);
}

// icon 对象 → JSON 字符串（存库）；null/undefined → null
function serializeIcon(icon) {
  if (!icon || typeof icon !== "object") return null;
  const name = icon.name ? String(icon.name) : "";
  const url = icon.url ? String(icon.url) : "";
  if (!url) return null;
  return JSON.stringify({ name, url });
}

// 数据库行 → 前端对象（icon / backup_lines 从 JSON 字符串解析回对象/数组）
function parseRow(row) {
  if (!row) return row;
  if (row.icon) {
    try {
      row.icon = JSON.parse(row.icon);
    } catch (e) {
      row.icon = null;
    }
  } else {
    row.icon = null;
  }
  if (row.backup_lines) {
    try {
      const parsed = JSON.parse(row.backup_lines);
      row.backup_lines = Array.isArray(parsed)
        ? parsed.map((v) => {
            if (typeof v === "string") return { name: "", address: v };
            return { name: v.name || "", address: v.address || "" };
          })
        : [];
    } catch (e) {
      row.backup_lines = [];
    }
  } else {
    row.backup_lines = [];
  }
  return row;
}

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;

  // GET /api/servers —— 列表
  if (method === "GET" && path === "/servers") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM servers ORDER BY created_at DESC"
    ).all();
    return json(results.map(parseRow));
  }

  // POST /api/servers —— 新增
  if (method === "POST" && path === "/servers") {
    const body = await request.json().catch(() => null);
    if (!body) return error("请求体无效");
    const err = validate(body);
    if (err) return error(err);

    const { name, keep_mode, watch_days, both_days, expiry_date, icon, line, backup_lines, username, password, server_type } = body;
    const info = await env.DB.prepare(
      `INSERT INTO servers (name, keep_mode, watch_days, both_days, expiry_date, icon, line, backup_lines, username, password, server_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        name.trim(),
        keep_mode,
        watch_days ?? null,
        both_days ?? null,
        optStr(expiry_date),
        serializeIcon(icon),
        optStr(line),
        serializeBackupLines(backup_lines),
        optStr(username),
        optStr(password),
        normType(server_type)
      )
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM servers WHERE id = ?"
    )
      .bind(info.meta.last_row_id)
      .first();
    return json(parseRow(row), 201);
  }

  // 匹配 /api/servers/:id
  const m = path.match(/^\/servers\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);

    // PUT —— 编辑
    if (method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body) return error("请求体无效");
      const err = validate(body);
      if (err) return error(err);

      const { name, keep_mode, watch_days, both_days, expiry_date, icon, line, backup_lines, username, password, server_type } = body;
      const info = await env.DB.prepare(
        `UPDATE servers SET
           name = ?, keep_mode = ?, watch_days = ?, both_days = ?, expiry_date = ?, icon = ?,
           line = ?, backup_lines = ?, username = ?, password = ?, server_type = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(
          name.trim(),
          keep_mode,
          watch_days ?? null,
          both_days ?? null,
          optStr(expiry_date),
          serializeIcon(icon),
          optStr(line),
          serializeBackupLines(backup_lines),
          optStr(username),
          optStr(password),
          normType(server_type),
          id
        )
        .run();

      if (info.meta.changes === 0) return error("记录不存在", 404);
      const row = await env.DB.prepare("SELECT * FROM servers WHERE id = ?")
        .bind(id)
        .first();
      return json(parseRow(row));
    }

    // DELETE —— 删除
    if (method === "DELETE") {
      const info = await env.DB.prepare("DELETE FROM servers WHERE id = ?")
        .bind(id)
        .run();
      if (info.meta.changes === 0) return error("记录不存在", 404);
      return json({ ok: true });
    }
  }

  return error("接口不存在", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // API 路由
    if (url.pathname.startsWith("/api/")) {
      if (!authorized(request, env)) {
        return error("未授权", 401);
      }
      return handleApi(request, env, url);
    }

    // 静态资源
    return env.ASSETS.fetch(request);
  },
};