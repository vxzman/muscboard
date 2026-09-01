# sing-box Dashboard 后端模拟器（mock-backend）

这是一个自包含的 sing-box 守护进程模拟器，给 [sing-box dashboard](https://github.com/SagerNet/sing-box) 前端提供数据，
不需要安装真实的 sing-box 核心。

## 目录结构

```text
mock-backend/
├── server.ts      # 模拟 daemon 主程序：gRPC-Web (HTTP) + grpc-websockets (WS) 双向流
├── verify.ts      # 端到端冒烟测试：逐接口解码校验
├── package.json   # 快捷脚本 start / verify / generate
├── buf.gen.yaml   # protobuf 代码生成配置
├── proto/         # started_service.proto 协议定义副本
└── gen/           # 生成的 TS 消息代码（本文件夹自包含，不依赖 dashboard 的 src/gen）
```

## 快速开始

```sh
# 1.（可选）重新生成 protobuf 代码；gen/ 已生成可跳过
cd mock-backend
BUF_CACHE_DIR=/tmp/buf-cache pnpm exec buf generate

# 2. 启动模拟后端（默认监听 8090）
pnpm start          # 等价于 node --experimental-transform-types server.ts

# 3. 另开终端，在项目根目录启动前端
cd ..
pnpm dev            # http://localhost:5173
```

浏览器打开 http://localhost:5173，在设置页 **URL** 输入框填 `http://127.0.0.1:8090`（密钥留空），点 **Connect**。

> 注意：URL 框填的是后端地址 8090，不是页面地址 5173。填 5173 会报 `[unimplemented] HTTP 404`。

## 协议与开发要点

### 1. 传输层：gRPC-Web（二进制 protobuf）

- 前端 `src/api/daemon.ts` 使用 `@connectrpc/connect-web` 的 `createGrpcWebTransport`，走 gRPC-Web 二进制协议。
- unary 和服务端流都是 `POST /daemon.StartedService/{Method}`，例如 `POST /daemon.StartedService/GetVersion`。
- 请求体 = gRPC envelope：1 字节 flag + 4 字节大端长度 + protobuf 消息字节。
- 响应体 = 若干消息帧 + 1 个 trailers 帧（flag `0x80`，内容如 `grpc-status: 0\r\n`）。
- **不要发送空的 headers 帧**：connect-web 客户端把第一个非 trailers 帧直接当消息解析，空帧会导致解码错误（`mock/server.ts` 的 `frame()` 只发消息帧和 trailers 帧，与官方 handler-factory 行为一致）。
- 服务端流保持 TCP 连接不结束，客户端断开时通过 `res.on("close")` 清理 `setInterval`，避免定时器泄漏。

### 2. WebSocket 双向流：grpc-websockets

- 终端 / Taildrop / USB/IP 使用 WebSocket，subprotocol 为 `grpc-websockets`，路径与 HTTP 相同。
- 握手：响应 `Sec-WebSocket-Accept = base64(SHA1(客户端 key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`，并回显 subprotocol。
- 客户端连接后第一帧是**文本 headers**（`content-type: application/grpc-web+proto` 等），应忽略；之后是二进制 gRPC envelope。
- 客户端帧必须 mask，服务端帧不 mask（RFC 6455）。
- 会话结束：发送 flag `0x80` 的 trailers 帧；客户端 `GrpcWebSocketStream` 收到后即结束。

### 3. CORS

- 预检 `OPTIONS` 返回 204 + `Access-Control-Allow-*`。
- `Access-Control-Allow-Headers` 必须包含 `content-type, x-grpc-web, x-user-agent, accept-language, authorization, grpc-timeout` 等，否则浏览器预检失败。

### 4. 方法名大小写映射

- 线上路径是 proto 原始名（PascalCase）：`GetVersion`、`SubscribeServiceStatus`。
- handler 表键是 camelCase：`getVersion`、`subscribeServiceStatus`。
- `mock/server.ts` 里用 `wireMethod.charAt(0).toLowerCase() + wireMethod.slice(1)` 做转换。

### 5. 类型与运行环境

- protobuf 的 int64 字段在生成代码里是 `bigint`（例如 `createdAt`、`uplinkTotal`），构造数据时用 `nowMs()`（返回 `BigInt`），**不要 number 与 bigint 混算**。
- 生成代码含 `enum`，Node 需要 `--experimental-transform-types`（Node 24 默认 type-stripping 不支持 enum）。如果不想用该 flag，可先用 tsc 编译再运行。
- 模拟数据全部在内存中，重启即重置。

## 模拟内容清单

| 接口 | 模拟行为 |
| --- | --- |
| GetVersion | `1.13.2` / apiVersion 4（开启全部能力：usbip、openvpn/openconnect、taildrop） |
| SubscribeServiceStatus | 立即返回 `STARTED` |
| SubscribeStatus | 每秒更新内存 / goroutines / 连接数 / 上下行速率与总量 |
| SubscribeGroups / SetGroupExpand / SelectOutbound / URLTest | selector（proxy，9 节点）+ urltest（auto）两组；操作后更新状态并广播给所有订阅者 |
| GetClashModeStatus / SubscribeClashMode / SetClashMode | rule / global / direct 三档，可切换 |
| SubscribeConnections / CloseConnection / CloseAllConnections | 6 条实时连接（google/youtube/github/openai 等），1.5s 更新速率，随机关闭/新建 |
| SubscribeLog / ClearLogs / GetDefaultLogLevel | 流式日志（INFO/DEBUG），清空日志有效 |
| SubscribeOutbounds | 全部节点扁平列表 |
| SubscribeTailscaleStatus | 1 个端点 + 3 台 peer，2 个未读 Taildrop 文件（导航栏角标） |
| SubscribeUSBIPServerStatus | 1 台 USB/IP 服务器 + 1 个已连接 U 盘 |
| SubscribeOpenConnectStatus / SubscribeOpenVPNStatus | 各 1 条已连接隧道（IP/DNS/MTU/加密等） |
| SubscribeTaildropInbox | 收件箱 2 个文件 |
| StartNetworkQualityTest / StartSTUNTest / StartTailscalePing | 阶段式进度消息，最终帧 `isFinal=true` 后结束流 |
| WS StartTailscaleSSHSession | 收到 start 后发 authBanner → ready → 输出模拟 motd，保持会话 |
| WS SendTaildropFiles | 按文件发送 0% / 35% / 70% / 100% 进度后结束 |
| WS ProvideUSBDevices | attach 后返回 ready |
| 其余 unary | 返回空响应（`google.protobuf.Empty`） |

## 验证

```sh
pnpm verify   # 等价于 node --experimental-transform-types verify.ts
```

脚本会逐个校验 unary、服务端流、CORS 预检和 WebSocket 终端握手，输出解码后的消息内容。

## 常见问题

- **`[unimplemented] HTTP 404`**：设置页 URL 填成了前端地址 `5173`，应填 `http://127.0.0.1:8090`。
- **`EPERM: listen`**：沙箱/受限环境不允许绑定端口，需要提权或在普通 shell 中启动。
- **`mkdir /home/kaishuai/.cache/buf: read-only file system`**：buf 缓存目录不可写，设 `BUF_CACHE_DIR=/tmp/buf-cache` 再执行 generate。
- **改完 server.ts 不生效**：`node` 不会热重载，需重启进程。
