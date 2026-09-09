#!/usr/bin/env bash
# Emby 保号管理 - Cloudflare Workers 部署脚本
# 用法: bash deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 检查 wrangler..."
if ! command -v wrangler >/dev/null 2>&1; then
  echo "    未安装 wrangler，使用 npx 运行"
  WRANGLER="npx wrangler"
else
  WRANGLER="wrangler"
fi

echo "==> 创建 D1 数据库（如已存在会复用）..."
DB_ID=$($WRANGLER d1 create emby-keepalive --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).uuid||'')}catch(e){console.log('')}})" || true)

if [ -z "$DB_ID" ]; then
  echo "    数据库可能已存在，尝试获取现有 ID..."
  DB_ID=$($WRANGLER d1 list --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const db=(j||[]).find(x=>x.name==='emby-keepalive');console.log(db?db.uuid:'')}catch(e){console.log('')}})" || true)
fi

if [ -z "$DB_ID" ]; then
  echo "!! 无法获取 D1 数据库 ID，请手动创建后填入 wrangler.toml"
  exit 1
fi

echo "    D1 数据库 ID: $DB_ID"

# 写入 wrangler.toml
sed -i.bak "s/REPLACE_WITH_D1_ID/$DB_ID/" wrangler.toml
rm -f wrangler.toml.bak

echo "==> 初始化数据库表..."
$WRANGLER d1 execute emby-keepalive --remote --file=schema.sql

echo "==> 设置管理口令（ADMIN_TOKEN）..."
if [ -n "${ADMIN_TOKEN:-}" ]; then
  echo "$ADMIN_TOKEN" | $WRANGLER secret put ADMIN_TOKEN
  echo "    已从环境变量 ADMIN_TOKEN 设置"
else
  echo "    未检测到 ADMIN_TOKEN 环境变量，请输入管理口令（留空则跳过，面板将无鉴权保护）："
  read -r -s -p "    管理口令: " TOKEN_INPUT || true
  echo ""
  if [ -n "$TOKEN_INPUT" ]; then
    echo "$TOKEN_INPUT" | $WRANGLER secret put ADMIN_TOKEN
    echo "    已设置管理口令"
  else
    echo "    ⚠️ 未设置管理口令，API 将无鉴权保护（不推荐）"
  fi
fi

echo "==> 部署 Worker..."
$WRANGLER deploy

echo ""
echo "✅ 部署完成！"
echo "   访问地址见上方输出（*.workers.dev）"
echo "   如需绑定自定义域名，运行: $WRANGLER deploy 后到 Cloudflare 控制台配置"
echo ""
echo "🔐 安全提示："
echo "   - 已启用 API 鉴权（X-Admin-Token），首次打开面板会提示输入管理口令"
echo "   - 管理口令即 ADMIN_TOKEN，请妥善保管，勿泄露"