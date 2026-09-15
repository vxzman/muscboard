#!/usr/bin/env bash
# run/stop.sh — 彻底停止 mock backend + Vite 前端（按进程组杀）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 用 kill -- -PGID 杀掉整个进程组（包括所有子进程）
stop_group() {
  local name="$1" pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "ℹ️  $name：未找到 PID 文件，可能未在运行。"
    return
  fi

  local pgid; pgid=$(cat "$pid_file")

  if ! kill -0 -- "-$pgid" 2>/dev/null; then
    echo "ℹ️  $name (PGID $pgid) 已不存在，清理文件。"
    rm -f "$pid_file"
    return
  fi

  echo "🛑 停止 $name (PGID $pgid，含所有子进程)..."

  # SIGTERM — 优雅退出
  kill -- "-$pgid" 2>/dev/null || true

  # 等最多 3s
  for _ in $(seq 1 10); do
    sleep 0.3
    kill -0 -- "-$pgid" 2>/dev/null || break
  done

  # 仍存活 → SIGKILL
  if kill -0 -- "-$pgid" 2>/dev/null; then
    echo "   ⚡ 强制终止进程组..."
    kill -9 -- "-$pgid" 2>/dev/null || true
    sleep 0.3
  fi

  rm -f "$pid_file"
  echo "✅ $name 已停止。"
}

stop_group "Vite 前端"   "$SCRIPT_DIR/frontend.pid"
stop_group "mock backend" "$SCRIPT_DIR/mock-backend.pid"
