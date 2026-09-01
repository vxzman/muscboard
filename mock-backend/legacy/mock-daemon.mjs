// Dev-only mock of the sing-box daemon gRPC-web API.
// Lets you preview the dashboard UI without a real sing-box backend:
//   node scripts/mock-daemon.mjs   (listens on :8099)
// Then open the dashboard and enter URL "localhost:8099" (name/secret optional).
import http from "node:http";

const PORT = 8099;

/* ---------- tiny protobuf writer ---------- */

const varint = (value) => {
  let v = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  const out = [];
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  return out;
};

const key = (num, wireType) => (num << 3) | wireType;

const fVarint = (num, value) => [...varint(key(num, 0)), ...varint(value)];
const fBool = (num, value) => fVarint(num, value ? 1 : 0);
const fBytes = (num, bytes) => [
  ...varint(key(num, 2)),
  ...varint(bytes.length),
  ...bytes,
];
const fString = (num, text) => fBytes(num, Buffer.from(text, "utf8"));

/* ---------- message builders ---------- */

const serviceStatus = () => Uint8Array.from(fVarint(1, 2)); // status = STARTED

const version = () =>
  Uint8Array.from([
    ...fString(1, "1.12.1"),
    ...fVarint(2, 10), // apiVersion
  ]);

const startedAt = (seconds) => Uint8Array.from(fVarint(1, seconds));

const statusMessage = (tick) => {
  const MiB = 1024n * 1024n;
  return Uint8Array.from([
    ...fVarint(1, 384n * MiB), // memory
    ...fVarint(2, 126 + (tick % 9)), // goroutines
    ...fVarint(3, 3), // connectionsIn
    ...fVarint(4, 2), // connectionsOut
    ...fBool(5, true), // trafficAvailable
    ...fVarint(6, BigInt(Math.round(1_800_000 + 640_000 * Math.sin(tick / 2)))), // uplink
    ...fVarint(7, BigInt(Math.round(14_200_000 + 5_100_000 * Math.sin(tick / 3)))), // downlink
    ...fVarint(8, 12_345_678_901n), // uplinkTotal
    ...fVarint(9, 98_765_432_109n), // downlinkTotal
  ]);
};

const groupItem = (tag, delay) =>
  Uint8Array.from([
    ...fString(1, tag),
    ...fString(2, "vmess"),
    ...fVarint(3, Math.floor(Date.now() / 1000)), // urlTestTime
    ...fVarint(4, delay), // urlTestDelay
  ]);

const group = (tag, type, selectable, selected, items) =>
  Uint8Array.from([
    ...fString(1, tag),
    ...fString(2, type),
    ...fBool(3, selectable),
    ...fString(4, selected),
    ...fBool(5, items.length > 0),
    ...items.flatMap((item) => fBytes(6, item)),
  ]);

const groupsMessage = () =>
  Uint8Array.from([
    ...fBytes(
      1,
      group("proxy", "selector", true, "🇭🇰 香港 01", [
        groupItem("🇭🇰 香港 01", 128),
        groupItem("🇭🇰 香港 02", 142),
        groupItem("🇯🇵 东京 01", 96),
        groupItem("🇸🇬 新加坡 01", 152),
      ]),
    ),
    ...fBytes(
      1,
      group("auto", "urltest", true, "自动选择", [
        groupItem("🇭🇰 香港 01", 128),
        groupItem("🇯🇵 东京 01", 96),
      ]),
    ),
  ]);

const outboundsMessage = () =>
  Uint8Array.from([
    ...fBytes(1, groupItem("🇭🇰 香港 01", 128)),
    ...fBytes(1, groupItem("🇯🇵 东京 01", 96)),
  ]);

const clashModeStatus = () =>
  Uint8Array.from([
    ...fString(1, "rule"),
    ...fString(1, "global"),
    ...fString(1, "direct"),
    ...fString(2, "rule"),
  ]);

const clashMode = () => Uint8Array.from(fString(1, "rule"));

const defaultLogLevel = () => Uint8Array.from(fVarint(1, 4)); // INFO

const logMessage = () => {
  const entry = (level, text) =>
    Uint8Array.from([...fVarint(1, level), ...fString(2, text)]);
  return Uint8Array.from([
    ...fBool(2, true), // reset
    ...fBytes(1, entry(4, "sing-box started")),
    ...fBytes(1, entry(4, "router: inbound mixed-in listening on [::]:2080")),
    ...fBytes(1, entry(4, "outbound/proxy: using 🇭🇰 香港 01")),
  ]);
};

const emptyMessage = () => new Uint8Array(0);

/* ---------- gRPC-web framing ---------- */

const frame = (flag, payload) => {
  const buf = Buffer.alloc(5 + payload.length);
  buf[0] = flag;
  buf.writeUInt32BE(payload.length, 1);
  Buffer.from(payload).copy(buf, 5);
  return buf;
};

const msg = (payload) => frame(0, payload);
const trailer = frame(0x80, Buffer.from("grpc-status: 0\r\n"));

const readRequest = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      resolve(body.length >= 5 ? body.subarray(5, 5 + body.readUInt32BE(1)) : Buffer.alloc(0));
    });
  });

/* ---------- handlers ---------- */

const unaryHandlers = {
  GetVersion: () => [msg(version())],
  GetStartedAt: () => [msg(startedAt(Math.floor(Date.now() / 1000) - 7200))],
  GetDefaultLogLevel: () => [msg(defaultLogLevel())],
  GetClashModeStatus: () => [msg(clashModeStatus())],
  GetDeprecatedWarnings: () => [msg(emptyMessage())],
};

const streamHandlers = {
  SubscribeServiceStatus: (res) => {
    res.write(msg(serviceStatus()));
    return setInterval(() => res.write(msg(serviceStatus())), 10_000);
  },
  SubscribeStatus: (res) => {
    let tick = 0;
    res.write(msg(statusMessage(tick)));
    return setInterval(() => res.write(msg(statusMessage(++tick))), 2_000);
  },
  SubscribeGroups: (res) => {
    res.write(msg(groupsMessage()));
    return null;
  },
  SubscribeClashMode: (res) => {
    res.write(msg(clashMode()));
    return null;
  },
  SubscribeLog: (res) => {
    res.write(msg(logMessage()));
    return null;
  },
  SubscribeOutbounds: (res) => {
    res.write(msg(outboundsMessage()));
    return null;
  },
};

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, x-grpc-web, x-user-agent, grpc-timeout, authorization, accept, accept-language",
  );
  res.setHeader("Access-Control-Expose-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  const match = req.url.match(/^\/[^/]+\/([A-Za-z0-9_]+)$/);
  if (!match) {
    res.writeHead(404);
    res.end();
    return;
  }
  const method = match[1];
  res.writeHead(200, { "Content-Type": "application/grpc-web+proto" });
  await readRequest(req);

  if (streamHandlers[method]) {
    const timer = streamHandlers[method](res);
    res.on("close", () => timer && clearInterval(timer));
    return;
  }

  for (const chunk of unaryHandlers[method]?.() ?? []) {
    res.write(chunk);
  }
  res.write(trailer);
  res.end();
});

server.listen(PORT, () => {
  console.log(`mock sing-box daemon listening on http://localhost:${PORT}`);
});
