#!/usr/bin/env bash
# run/start.sh — 同时启动 mock backend + Vite 前端
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MOCK_DIR="$SCRIPT_DIR"

BACKEND_PID_FILE="$SCRIPT_DIR/mock-backend.pid"
FRONTEND_PID_FILE="$SCRIPT_DIR/frontend.pid"
BACKEND_LOG="$SCRIPT_DIR/mock-backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"

# ---------- 寻找 node ----------
find_node() {
  if command -v node &>/dev/null; then command -v node; return; fi
  for dir in \
    "$HOME/.nvm/versions/node"/*/bin \
    "$HOME/.local/share/nvm/versions/node"/*/bin; do
    [[ -x "$dir/node" ]] && { echo "$dir/node"; return; }
  done
  local n
  n=$(find "$HOME/.cache/codex-runtimes" -name "node" -type f 2>/dev/null | head -1)
  [[ -n "$n" ]] && { echo "$n"; return; }
  echo ""
}

# ---------- 寻找 pnpm ----------
find_pnpm() {
  if command -v pnpm &>/dev/null; then command -v pnpm; return; fi
  local node_bin; node_bin=$(find_node)
  local node_bin_dir; node_bin_dir=$(dirname "$node_bin")
  [[ -x "$node_bin_dir/pnpm" ]] && { echo "$node_bin_dir/pnpm"; return; }
  for p in \
    "$HOME/.nvm/versions/node"/*/lib/node_modules/corepack/shims/pnpm \
    "$HOME/.local/share/nvm/versions/node"/*/lib/node_modules/corepack/shims/pnpm; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  local cp
  cp=$(find "$HOME/.cache/codex-runtimes" -name "pnpm" -type f 2>/dev/null | head -1)
  [[ -n "$cp" ]] && { echo "$cp"; return; }
  echo ""
}

# ---------- 检查进程组是否存活 ----------
# pid 文件里存的是负数（-PGID）以便 stop.sh 用 kill -- -PGID
pgid_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pgid; pgid=$(cat "$pid_file")
  # 检查进程组里有没有进程
  kill -0 -- "-$pgid" 2>/dev/null
}

check_running() {
  local name="$1" pid_file="$2"
  if pgid_alive "$pid_file"; then
    local pgid; pgid=$(cat "$pid_file")
    echo "⚠️  $name 已在运行 (PGID $pgid)，跳过启动。"
    return 0
  fi
  rm -f "$pid_file"
  return 1
}

# ---------- 等待日志出现关键字 ----------
wait_for_log() {
  local log="$1" keyword="$2" pgid="$3" label="$4"
  for _ in $(seq 1 40); do
    sleep 0.3
    if ! kill -0 -- "-$pgid" 2>/dev/null; then
      echo "❌ $label 进程启动后立即退出，日志："
      tail -20 "$log"
      return 1
    fi
    grep -q "$keyword" "$log" 2>/dev/null && return 0
  done
  echo "⚠️  $label 启动超时，请检查日志：$log"
  return 1
}

NODE_BIN=$(find_node)
PNPM_BIN=$(find_pnpm)

[[ -z "$NODE_BIN" ]] && { echo "❌ 找不到 node，请先安装 Node.js。"; exit 1; }
[[ -z "$PNPM_BIN" ]] && { echo "❌ 找不到 pnpm，请先安装 pnpm。"; exit 1; }

echo "🔧 node : $NODE_BIN ($("$NODE_BIN" --version))"
echo "🔧 pnpm : $PNPM_BIN"
echo ""

# ===================== BACKEND =====================
if ! check_running "mock backend" "$BACKEND_PID_FILE"; then
  echo "🚀 启动 mock backend (端口 8090)..."
  cd "$MOCK_DIR"
  # setsid 让子进程成为新会话 leader（PGID == PID），
  # 这样 kill -- -PGID 可以杀掉整个进程树
  setsid "$NODE_BIN" --experimental-transform-types server.ts \
    > "$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  # 等一下让 setsid 完成，再读真实 PGID
  sleep 0.2
  BACKEND_PGID=$(ps -o pgid= -p "$BACKEND_PID" 2>/dev/null | tr -d ' ') || BACKEND_PGID=$BACKEND_PID
  echo "$BACKEND_PGID" > "$BACKEND_PID_FILE"

  if wait_for_log "$BACKEND_LOG" "listening on" "$BACKEND_PGID" "mock backend"; then
    echo "✅ mock backend 已启动 (PGID $BACKEND_PGID)"
    grep "listening on" "$BACKEND_LOG" | sed 's/^/   /'
  else
    rm -f "$BACKEND_PID_FILE"; exit 1
  fi
fi

echo ""

# ===================== FRONTEND =====================
if ! check_running "Vite 前端" "$FRONTEND_PID_FILE"; then
  echo "🚀 启动 Vite 前端..."
  cd "$ROOT_DIR"
  setsid "$PNPM_BIN" dev \
    > "$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!
  sleep 0.2
  FRONTEND_PGID=$(ps -o pgid= -p "$FRONTEND_PID" 2>/dev/null | tr -d ' ') || FRONTEND_PGID=$FRONTEND_PID
  echo "$FRONTEND_PGID" > "$FRONTEND_PID_FILE"

  if wait_for_log "$FRONTEND_LOG" "Local:" "$FRONTEND_PGID" "Vite 前端"; then
    echo "✅ 前端已启动 (PGID $FRONTEND_PGID)"
    grep -E "Local:|Network:" "$FRONTEND_LOG" | sed 's/^/   /'
  else
    rm -f "$FRONTEND_PID_FILE"; exit 1
  fi
fi

echo ""
echo "══════════════════════════════════════════"
echo " 🌐 前端   : $(grep 'Local:' "$FRONTEND_LOG" | tail -1 | grep -oE 'http://[^ ]+')"
echo " ⚙️  后端   : http://127.0.0.1:8090"
echo " 📌 设置页 URL 填 → http://127.0.0.1:8090"
echo "══════════════════════════════════════════"
