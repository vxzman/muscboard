// Mock sing-box daemon for the sing-box dashboard.
//
// Implements the gRPC-Web (binary proto) API of daemon.StartedService and the
// "grpc-websockets" bidirectional streams used for the terminal, Taildrop and
// USB/IP tools.  Run with:
//
//   node --experimental-transform-types mock/server.ts
//
// The frontend connects to it via the setup screen (URL: http://127.0.0.1:8090).

import http from "node:http";
import crypto from "node:crypto";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";

import * as pb from "./gen/daemon/started_service_pb.ts";

const PORT = Number(process.env.MOCK_PORT ?? 8090);
const SERVICE_PREFIX = `/${pb.StartedService.typeName}/`;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ---------------------------------------------------------------------------
// Small shared state
// ---------------------------------------------------------------------------

const nowMs = () => BigInt(Date.now());
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const NODE_TAGS = [
  "🇭🇰 HK-01",
  "🇭🇰 HK-02",
  "🇺🇸 US-01",
  "🇯🇵 JP-01",
  "🇸🇬 SG-01",
  "🇹🇼 TW-01",
  "🇩🇪 DE-01",
];

const state = {
  startedAt: BigInt(Date.now() - 6 * 60 * 1000),
  version: "1.13.2",
  apiVersion: 4,
  memory: 84_000_000,
  goroutines: 128,
  connectionsIn: 9,
  connectionsOut: 8,
  uplink: 123_456n,
  downlink: 987_654n,
  uplinkTotal: 5_214_567_890n,
  downlinkTotal: 42_109_876_543n,
  clashMode: { modeList: ["rule", "global", "direct"], currentMode: "rule" },
  groups: buildGroups(),
  connections: buildConnections(),
  logs: buildLogs(),
  seq: 0,
};

function buildGroups() {
  const nodeItems = NODE_TAGS.map((tag, index) => ({
    tag,
    type: ["vmess", "ss", "trojan", "hysteria2", "vmess", "shadowsocks", "wireguard"][index],
    urlTestTime: nowMs() - BigInt(index * 13_000),
    urlTestDelay: [128, 152, 210, 96, 118, 143, 178][index],
  }));
  return [
    {
      tag: "proxy",
      type: "selector",
      selectable: true,
      selected: "🇭🇰 HK-01",
      isExpand: true,
      items: [
        { tag: "DIRECT", type: "direct", urlTestTime: 0n, urlTestDelay: 0 },
        { tag: "REJECT", type: "block", urlTestTime: 0n, urlTestDelay: 0 },
        ...nodeItems,
      ],
    },
    {
      tag: "auto",
      type: "urltest",
      selectable: false,
      selected: "auto",
      isExpand: false,
      items: nodeItems.map((item) => ({ ...item, urlTestDelay: item.urlTestDelay + rand(-8, 12) })),
    },
  ];
}

function buildConnections() {
  const rows = [
    {
      id: "conn-0001",
      inbound: "mixed-in",
      inboundType: "mixed",
      ipVersion: 4,
      network: "tcp",
      source: "192.168.1.10:54321",
      destination: "142.250.72.14:443",
      domain: "www.google.com",
      protocol: "tls",
      createdAt: nowMs() - 125_000n,
      uplink: 120_000n,
      downlink: 1_800_000n,
      uplinkTotal: 4_800_000n,
      downlinkTotal: 76_000_000n,
      rule: "geosite:google",
      outbound: "🇭🇰 HK-01",
      outboundType: "vmess",
      chainList: ["🇭🇰 HK-01"],
      processInfo: { processId: 5123, userId: 1000, userName: "kaishuai", processPath: "/usr/bin/firefox" },
    },
    {
      id: "conn-0002",
      inbound: "mixed-in",
      inboundType: "mixed",
      ipVersion: 6,
      network: "tcp",
      source: "192.168.1.10:54328",
      destination: "[2607:f8b0:4004:c17::5e]:443",
      domain: "www.youtube.com",
      protocol: "tls",
      createdAt: nowMs() - 98_000n,
      uplink: 45_000n,
      downlink: 4_200_000n,
      uplinkTotal: 1_200_000n,
      downlinkTotal: 210_000_000n,
      rule: "geosite:youtube",
      outbound: "🇯🇵 JP-01",
      outboundType: "ss",
      chainList: ["🇯🇵 JP-01"],
      processInfo: { processId: 5123, userId: 1000, userName: "kaishuai", processPath: "/usr/bin/firefox" },
    },
    {
      id: "conn-0003",
      inbound: "tun-in",
      inboundType: "tun",
      ipVersion: 4,
      network: "udp",
      source: "192.168.1.23:51002",
      destination: "1.1.1.1:53",
      domain: "",
      protocol: "dns",
      createdAt: nowMs() - 3_000n,
      uplink: 320n,
      downlink: 640n,
      uplinkTotal: 1_200n,
      downlinkTotal: 2_600n,
      rule: "dns",
      outbound: "dns-out",
      outboundType: "dns",
      chainList: [],
    },
    {
      id: "conn-0004",
      inbound: "mixed-in",
      inboundType: "mixed",
      ipVersion: 4,
      network: "tcp",
      source: "192.168.1.10:54410",
      destination: "140.82.112.4:443",
      domain: "api.github.com",
      protocol: "tls",
      createdAt: nowMs() - 210_000n,
      uplink: 18_000n,
      downlink: 960_000n,
      uplinkTotal: 3_100_000n,
      downlinkTotal: 18_500_000n,
      rule: "geosite:github",
      outbound: "🇺🇸 US-01",
      outboundType: "trojan",
      chainList: ["🇺🇸 US-01"],
      processInfo: { processId: 6621, userId: 1000, userName: "kaishuai", processPath: "/usr/lib/git-core/git-remote-https" },
    },
    {
      id: "conn-0005",
      inbound: "mixed-in",
      inboundType: "mixed",
      ipVersion: 4,
      network: "udp",
      source: "192.168.1.10:61440",
      destination: "104.18.25.13:443",
      domain: "chat.openai.com",
      protocol: "quic",
      createdAt: nowMs() - 45_000n,
      uplink: 260_000n,
      downlink: 1_100_000n,
      uplinkTotal: 8_900_000n,
      downlinkTotal: 34_000_000n,
      rule: "geosite:openai",
      outbound: "🇹🇼 TW-01",
      outboundType: "vmess",
      chainList: ["🇹🇼 TW-01"],
      processInfo: { processId: 7122, userId: 1000, userName: "kaishuai", processPath: "/opt/google/chrome/chrome" },
    },
    {
      id: "conn-0006",
      inbound: "mixed-in",
      inboundType: "mixed",
      ipVersion: 4,
      network: "tcp",
      source: "192.168.1.11:38888",
      destination: "104.16.132.229:443",
      domain: "cdn.jsdelivr.net",
      protocol: "tls",
      createdAt: nowMs() - 8_000n,
      uplink: 5_000n,
      downlink: 720_000n,
      uplinkTotal: 200_000n,
      downlinkTotal: 42_000_000n,
      rule: "geosite:cn",
      outbound: "DIRECT",
      outboundType: "direct",
      chainList: [],
    },
  ];
  const map = new Map<string, typeof rows[0]>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function buildLogs() {
  return [
    { level: pb.LogLevel.INFO, message: "sing-box 1.13.2 starting" },
    { level: pb.LogLevel.INFO, message: "router: loaded 1024 rules, 6 geosite sources" },
    { level: pb.LogLevel.INFO, message: "inbound/mixed-in: started" },
    { level: pb.LogLevel.INFO, message: "inbound/tun-in: started" },
    { level: pb.LogLevel.DEBUG, message: "outbound/🇭🇰 HK-01: connected to 203.0.113.10:443" },
    { level: pb.LogLevel.DEBUG, message: "connection/conn-0005: closed by peer" },
  ];
}

// ---------------------------------------------------------------------------
// gRPC-Web framing helpers
// ---------------------------------------------------------------------------

function encode(schema: pb.MessageSchema, message: object): Uint8Array {
  return toBinary(schema, create(schema, message));
}

function frame(payload: Uint8Array, trailers = false): Buffer {
  const header = Buffer.alloc(5);
  header[0] = trailers ? 0x80 : 0x00;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}

function trailersBuffer(status = 0, message = ""): Buffer {
  let text = `grpc-status: ${status}\r\n`;
  if (message !== "") text += `grpc-message: ${encodeURIComponent(message)}\r\n`;
  return frame(Buffer.from(text, "utf8"), true);
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, x-grpc-web, x-user-agent, x-requested-with, accept-language, authorization, grpc-timeout, grpc-encoding",
  "Access-Control-Expose-Headers": "grpc-status, grpc-message, grpc-encoding, content-type",
};

function writeStreamResponse(res: http.ServerResponse, method: string): (message: object) => boolean {
  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": "application/grpc-web+proto",
    "Cache-Control": "no-store",
  });
  return (message) => res.write(frame(encode(methodOutputSchema(method), message)));
}

function methodOutputSchema(method: string): pb.MessageSchema {
  return (pb.StartedService.method as never as Record<string, { output: pb.MessageSchema }>)[method]
    .output;
}

function methodInputSchema(method: string): pb.MessageSchema {
  return (pb.StartedService.method as never as Record<string, { input: pb.MessageSchema }>)[method]
    .input;
}

function methodKind(method: string): string {
  return (pb.StartedService.method as never as Record<string, { methodKind: string }>)[method]
    .methodKind;
}

function parseRequest(method: string, body: Buffer) {
  const schema = methodInputSchema(method);
  if (body.length === 0) return create(schema, {});

  // gRPC-Web unary requests are framed as [flags][len:u32][payload].
  // The frontend sends these frames, so we must strip the 5-byte gRPC-Web
  // header before decoding the protobuf request body.
  let payload = body;
  if (body.length >= 5) {
    const flags = body[0];
    const length = body.readUInt32BE(1);
    const expectedLength = 5 + length;
    if ((flags === 0x00 || flags === 0x80 || flags === 0x01 || flags === 0x81) && body.length === expectedLength) {
      payload = body.subarray(5, expectedLength);
    }
  }

  return fromBinary(schema, payload);
}

// ---------------------------------------------------------------------------
// Stream bookkeeping
// ---------------------------------------------------------------------------

type StreamKey =
  | "serviceStatus"
  | "status"
  | "groups"
  | "clashMode"
  | "log"
  | "connections"
  | "outbounds"
  | "tailscale"
  | "usbip"
  | "openconnect"
  | "openvpn"
  | "taildropInbox";

const streamRes = new Map<StreamKey, Set<http.ServerResponse>>();

function subscribe(key: StreamKey, res: http.ServerResponse) {
  let set = streamRes.get(key);
  if (!set) {
    set = new Set();
    streamRes.set(key, set);
  }
  set.add(res);
  res.on("close", () => set!.delete(res));
}

function broadcast(key: StreamKey, method: string, message: object) {
  const set = streamRes.get(key);
  if (!set) return;
  const bytes = frame(encode(methodOutputSchema(method), message));
  for (const res of set) {
    if (!res.writableEnded && res.writable) res.write(bytes);
  }
}

// ---------------------------------------------------------------------------
// Mock data producers
// ---------------------------------------------------------------------------

const subscriptions = new Map<http.ServerResponse, ReturnType<typeof setInterval>[]>();

function attachInterval(res: http.ServerResponse, timer: ReturnType<typeof setInterval>) {
  let list = subscriptions.get(res);
  if (!list) {
    list = [];
    subscriptions.set(res, list);
  }
  list.push(timer);
  res.on("close", () => {
    for (const t of list!) clearInterval(t);
    subscriptions.delete(res);
  });
}

function statusSnapshot() {
  return {
    memory: state.memory,
    goroutines: state.goroutines,
    connectionsIn: state.connectionsIn,
    connectionsOut: state.connectionsOut,
    trafficAvailable: true,
    uplink: state.uplink,
    downlink: state.downlink,
    uplinkTotal: state.uplinkTotal,
    downlinkTotal: state.downlinkTotal,
  };
}

function groupsMessage() {
  return { group: state.groups };
}

function outboundsMessage() {
  const items: object[] = [];
  for (const group of state.groups) for (const item of group.items) items.push(item);
  return { outbounds: items };
}

function connectionEventsMessage(reset = false) {
  const events: object[] = [];
  for (const conn of state.connections.values()) {
    events.push({
      type: pb.ConnectionEventType.CONNECTION_EVENT_NEW,
      id: conn.id,
      connection: { ...conn },
      uplinkDelta: 0n,
      downlinkDelta: 0n,
      closedAt: 0n,
    });
  }
  return { events, reset };
}

function tailscaleMessage() {
  return {
    endpoints: [
      {
        endpointTag: "tailscale0",
        backendState: "Running",
        stateText: "Running",
        networkName: "home-raspberry.ts.net",
        magicDNSSuffix: "home-raspberry.ts.net",
        self: {
          hostName: "laptop",
          dnsName: "laptop.home-raspberry.ts.net",
          os: "linux",
          tailscaleIPs: ["100.101.102.103", "fd7a:115c:a1e0::103"],
          online: true,
          active: true,
          rxBytes: 12_345_678_901n,
          txBytes: 3_210_987_654n,
          keyExpiry: nowMs() + 7_200_000n,
          stableID: "self-abc123",
          canReceiveFiles: true,
        },
        userGroups: [
          {
            userID: 0n,
            loginName: "kaishuai@github",
            displayName: "kaishuai",
            peers: [
              {
                hostName: "server",
                dnsName: "server.home-raspberry.ts.net",
                os: "linux",
                tailscaleIPs: ["100.101.102.104", "fd7a:115c:a1e0::104"],
                online: true,
                exitNodeOption: true,
                rxBytes: 987_654_321n,
                txBytes: 5_432_109_876n,
                keyExpiry: nowMs() + 86_400_000n,
                stableID: "peer-server-01",
                lastSeen: nowMs() - 30_000n,
                canReceiveFiles: true,
              },
              {
                hostName: "phone",
                dnsName: "phone.home-raspberry.ts.net",
                os: "android",
                tailscaleIPs: ["100.101.102.105"],
                online: true,
                rxBytes: 123_456_789n,
                txBytes: 456_789_012n,
                keyExpiry: nowMs() + 30n * 86_400_000n,
                stableID: "peer-phone-01",
                lastSeen: nowMs() - 2n * 60_000n,
                canReceiveFiles: true,
              },
              {
                hostName: "nas",
                dnsName: "nas.home-raspberry.ts.net",
                os: "linux",
                tailscaleIPs: ["100.101.102.106"],
                online: false,
                rxBytes: 0n,
                txBytes: 0n,
                keyExpiry: 0n,
                stableID: "peer-nas-01",
                expired: true,
                lastSeen: nowMs() - 9n * 86_400_000n,
                canReceiveFiles: false,
              },
            ],
          },
        ],
        exitNode: {
          hostName: "server",
          dnsName: "server.home-raspberry.ts.net",
          os: "linux",
          tailscaleIPs: ["100.101.102.104"],
          online: true,
          exitNode: true,
          exitNodeOption: true,
          stableID: "peer-server-01",
          canReceiveFiles: true,
        },
        keyAuth: true,
        canShareFiles: true,
        waitingFileCount: 0,
        receivingFileCount: 0,
        unreadFileCount: 2,
      },
    ],
  };
}

function usbipMessage() {
  return {
    servers: [
      {
        serverTag: "usbip0",
        devices: [
          {
            descriptor: {
              deviceId: "usb-1-5",
              busNum: 1,
              devNum: 5,
              speed: 3,
              vendorId: 0x0781,
              productId: 0x5583,
              bcdDevice: 0x0100,
              deviceClass: 0,
              deviceSubClass: 0,
              deviceProtocol: 0,
              configurationValue: 1,
              numConfigurations: 1,
              interfaces: [
                { interfaceClass: 8, interfaceSubClass: 6, interfaceProtocol: 80 },
              ],
              serial: "4C530001010322120092",
              product: "SanDisk Ultra Fit",
            },
            busId: "1-5",
            stableId: "usb-1-5",
            backend: pb.USBBackend.USB_BACKEND_DYNAMIC,
            state: pb.USBDeviceState.USB_DEVICE_STATE_ATTACHED,
          },
        ],
      },
    ],
  };
}

function openConnectMessage() {
  return {
    endpoints: [
      {
        endpointTag: "oc0",
        state: "connected",
        stateText: "Connected",
        tunnelInfo: {
          server: "vpn.example.com",
          flavor: "anyconnect",
          transport: "dtls",
          ipv4: ["10.20.30.40"],
          ipv6: ["fd10:20:30::40"],
          dns: ["1.1.1.1", "8.8.8.8"],
          mtu: 1400,
          connectedSince: nowMs() - 3_600_000n,
        },
      },
    ],
  };
}

function openVpnMessage() {
  return {
    endpoints: [
      {
        endpointTag: "ovpn0",
        state: "connected",
        stateText: "Connected",
        tunnelInfo: {
          server: "vpn2.example.com:1194",
          network: "10.8.0.0/24",
          ipv4: ["10.8.0.10"],
          ipv6: [],
          dns: ["8.8.8.8"],
          mtu: 1500,
          connectedSince: nowMs() - 7_200_000n,
          cipher: "AES-256-GCM",
        },
      },
    ],
  };
}

function taildropInboxMessage() {
  return {
    endpointTag: "tailscale0",
    files: [
      {
        name: "screenshot-2026-09-01.png",
        size: 1_234_567n,
        senderName: "phone",
        modifiedAt: nowMs() - 8_000_000n,
      },
      {
        name: "notes.md",
        size: 8_192n,
        senderName: "server",
        modifiedAt: nowMs() - 40_000_000n,
      },
    ],
    receiving: [],
  };
}

// ---------------------------------------------------------------------------
// HTTP gRPC-Web endpoint
// ---------------------------------------------------------------------------

const STREAM_HANDLERS: Record<string, (req: http.IncomingMessage, res: http.ServerResponse, method: string) => void> = {
  subscribeServiceStatus(req, res) {
    subscribe("serviceStatus", res);
    const send = writeStreamResponse(res, "subscribeServiceStatus");
    send({ status: pb.ServiceStatus_Type.STARTED, errorMessage: "" });
  },
  subscribeStatus(req, res) {
    subscribe("status", res);
    const send = writeStreamResponse(res, "subscribeStatus");
    send(statusSnapshot());
    attachInterval(res, setInterval(() => {
      state.memory = 78_000_000 + rand(0, 24_000_000);
      state.goroutines = 120 + rand(0, 24);
      state.connectionsIn = 6 + rand(0, 5);
      state.connectionsOut = Math.max(0, state.connectionsIn - rand(0, 2));
      state.uplink = BigInt(rand(20_000, 420_000));
      state.downlink = BigInt(rand(300_000, 4_200_000));
      state.uplinkTotal += state.uplink;
      state.downlinkTotal += state.downlink;
      send(statusSnapshot());
    }, 1000));
  },
  subscribeGroups(req, res) {
    subscribe("groups", res);
    const send = writeStreamResponse(res, "subscribeGroups");
    send(groupsMessage());
  },
  subscribeClashMode(req, res) {
    subscribe("clashMode", res);
    const send = writeStreamResponse(res, "subscribeClashMode");
    send({ mode: state.clashMode.currentMode });
  },
  subscribeLog(req, res) {
    subscribe("log", res);
    const send = writeStreamResponse(res, "subscribeLog");
    send({ messages: state.logs.map((entry) => ({ ...entry })), reset: true });
    attachInterval(res, setInterval(() => {
      const lines = [
        `connection/conn-${String(state.seq++).padStart(4, "0")}: inbound mixed-in, outbound 🇭🇰 HK-01`,
        `dns: query ${["example.com", "api.github.com", "www.google.com", "cdn.cloudflare.com"][rand(0, 3)]} -> 1.1.1.1 (${rand(2, 40)}ms)`,
        `router: matched rule geosite:${["google", "youtube", "github", "telegram"][rand(0, 3)]}`,
        `outbound/🇺🇸 US-01: download speed ${rand(10, 60)} Mbps`,
        `inbound/tun-in: packet from 192.168.1.${rand(2, 40)}`,
      ];
      const entry = { level: rand(0, 3) === 0 ? pb.LogLevel.DEBUG : pb.LogLevel.INFO, message: lines[rand(0, lines.length - 1)] };
      state.logs.push(entry);
      if (state.logs.length > 500) state.logs.shift();
      send({ messages: [entry] });
    }, 3000));
  },
  subscribeConnections(req, res) {
    subscribe("connections", res);
    const send = writeStreamResponse(res, "subscribeConnections");
    send(connectionEventsMessage(true));
    attachInterval(res, setInterval(() => {
      const events: object[] = [];
      for (const conn of state.connections.values()) {
        const up = BigInt(rand(200, 60_000));
        const down = BigInt(rand(2_000, 600_000));
        conn.uplinkTotal += up;
        conn.downlinkTotal += down;
        conn.uplink = up;
        conn.downlink = down;
        events.push({
          type: pb.ConnectionEventType.CONNECTION_EVENT_UPDATE,
          id: conn.id,
          uplinkDelta: up,
          downlinkDelta: down,
          closedAt: 0n,
        });
      }
      if (Math.random() < 0.18 && state.connections.size > 0) {
        const ids = [...state.connections.keys()];
        const victim = ids[rand(0, ids.length - 1)];
        const closed = state.connections.get(victim)!;
        state.connections.delete(victim);
        events.push({
          type: pb.ConnectionEventType.CONNECTION_EVENT_CLOSED,
          id: victim,
          connection: { ...closed },
          uplinkDelta: 0n,
          downlinkDelta: 0n,
          closedAt: nowMs(),
        });
      }
      if (Math.random() < 0.25) {
        const domain = ["www.cloudflare.com", "open.spotify.com", "pypi.org", "registry.npmjs.org"][rand(0, 3)];
        const id = `conn-${String(state.seq++).padStart(4, "0")}`;
        const fresh = {
          id,
          inbound: rand(0, 1) === 0 ? "mixed-in" : "tun-in",
          inboundType: rand(0, 1) === 0 ? "mixed" : "tun",
          ipVersion: 4,
          network: "tcp",
          source: `192.168.1.${rand(2, 40)}:${rand(1024, 65000)}`,
          destination: `203.0.113.${rand(1, 250)}:443`,
          domain,
          protocol: "tls",
          createdAt: nowMs(),
          uplink: 0n,
          downlink: 0n,
          uplinkTotal: 0n,
          downlinkTotal: 0n,
          rule: "geosite:cn",
          outbound: "🇭🇰 HK-01",
          outboundType: "vmess",
          chainList: ["🇭🇰 HK-01"],
          processInfo: undefined,
        };
        state.connections.set(id, fresh);
        events.push({
          type: pb.ConnectionEventType.CONNECTION_EVENT_NEW,
          id,
          connection: { ...fresh },
          uplinkDelta: 0n,
          downlinkDelta: 0n,
          closedAt: 0n,
        });
      }
      send({ events });
    }, 1500));
  },
  subscribeOutbounds(req, res) {
    subscribe("outbounds", res);
    const send = writeStreamResponse(res, "subscribeOutbounds");
    send(outboundsMessage());
  },
  subscribeTailscaleStatus(req, res) {
    subscribe("tailscale", res);
    const send = writeStreamResponse(res, "subscribeTailscaleStatus");
    send(tailscaleMessage());
  },
  subscribeUSBIPServerStatus(req, res) {
    subscribe("usbip", res);
    const send = writeStreamResponse(res, "subscribeUSBIPServerStatus");
    send(usbipMessage());
  },
  subscribeOpenConnectStatus(req, res) {
    subscribe("openconnect", res);
    const send = writeStreamResponse(res, "subscribeOpenConnectStatus");
    send(openConnectMessage());
  },
  subscribeOpenVPNStatus(req, res) {
    subscribe("openvpn", res);
    const send = writeStreamResponse(res, "subscribeOpenVPNStatus");
    send(openVpnMessage());
  },
  subscribeTaildropInbox(req, res) {
    subscribe("taildropInbox", res);
    const send = writeStreamResponse(res, "subscribeTaildropInbox");
    send(taildropInboxMessage());
  },
  startNetworkQualityTest(req, res) {
    const send = writeStreamResponse(res, "startNetworkQualityTest");
    const steps = [
      { phase: 1, downloadCapacity: 120_000_000n, uploadCapacity: 30_000_000n, downloadRPM: 800, uploadRPM: 200, idleLatencyMs: 24, elapsedMs: 300n },
      { phase: 2, downloadCapacity: 118_500_000n, uploadCapacity: 28_900_000n, downloadRPM: 792, uploadRPM: 198, idleLatencyMs: 24, elapsedMs: 1900n },
      { phase: 3, downloadCapacity: 119_200_000n, uploadCapacity: 29_400_000n, downloadRPM: 795, uploadRPM: 199, idleLatencyMs: 24, elapsedMs: 3600n },
      { phase: 4, downloadCapacity: 119_000_000n, uploadCapacity: 29_500_000n, downloadRPM: 793, uploadRPM: 197, idleLatencyMs: 26, elapsedMs: 5200n, isFinal: true, downloadCapacityAccuracy: 95, uploadCapacityAccuracy: 93, downloadRPMAccuracy: 97, uploadRPMAccuracy: 94 },
    ];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= steps.length || res.writableEnded) {
        clearInterval(timer);
        return;
      }
      res.write(frame(encode(pb.NetworkQualityTestProgressSchema, steps[index])));
      if (steps[index].isFinal) {
        clearInterval(timer);
        res.end(trailersBuffer());
      }
      index += 1;
    }, 900);
    attachInterval(res, timer);
  },
  startSTUNTest(req, res) {
    const send = writeStreamResponse(res, "startSTUNTest");
    const steps = [
      { phase: 1, latencyMs: 12 },
      { phase: 2, latencyMs: 12, externalAddr: "203.0.113.66:52108", natMapping: 3, natFiltering: 3, natTypeSupported: true },
      { phase: 3, latencyMs: 12, externalAddr: "203.0.113.66:52108", natMapping: 3, natFiltering: 3, natTypeSupported: true, isFinal: true },
    ];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= steps.length || res.writableEnded) {
        clearInterval(timer);
        return;
      }
      res.write(frame(encode(pb.STUNTestProgressSchema, steps[index])));
      if (steps[index].isFinal) {
        clearInterval(timer);
        res.end(trailersBuffer());
      }
      index += 1;
    }, 700);
    attachInterval(res, timer);
  },
  startTailscalePing(req, res) {
    const send = writeStreamResponse(res, "startTailscalePing");
    send({ latencyMs: 12.4, isDirect: true, endpoint: "203.0.113.88:41641", derpRegionID: 1, derpRegionCode: "hkg" });
    res.end(trailersBuffer());
  },
  downloadTaildropFile(req, res) {
    const send = writeStreamResponse(res, "downloadTaildropFile");
    const chunkSize = 64 * 1024;
    const total = 1_048_576;
    const chunk = Buffer.alloc(chunkSize, 0x61);
    let sent = 0;
    const timer = setInterval(() => {
      if (sent >= total || res.writableEnded) {
        clearInterval(timer);
        if (!res.writableEnded) res.end(trailersBuffer());
        return;
      }
      const size = Math.min(chunkSize, total - sent);
      res.write(frame(encode(pb.DownloadTaildropFileChunkSchema, { size: BigInt(size), data: chunk.subarray(0, size) })));
      sent += size;
    }, 30);
    attachInterval(res, timer);
  },
};

const UNARY_HANDLERS: Record<string, (req: http.IncomingMessage, res: http.ServerResponse, method: string, body: Buffer) => void> = {
  getVersion(req, res) {
    unaryResponse(res, pb.VersionSchema, { version: state.version, apiVersion: state.apiVersion });
  },
  getDefaultLogLevel(req, res) {
    unaryResponse(res, pb.DefaultLogLevelSchema, { level: pb.LogLevel.INFO });
  },
  clearLogs(req, res) {
    state.logs = [];
    broadcast("log", "subscribeLog", { messages: [], reset: true });
    unaryResponse(res, EmptySchema, {});
  },
  getClashModeStatus(req, res) {
    unaryResponse(res, pb.ClashModeStatusSchema, { ...state.clashMode });
  },
  setClashMode(req, res, method, body) {
    const request = parseRequest(method, body);
    state.clashMode.currentMode = request.mode;
    broadcast("clashMode", "subscribeClashMode", { mode: state.clashMode.currentMode });
    unaryResponse(res, EmptySchema, {});
  },
  urlTest(req, res, method, body) {
    const request = parseRequest(method, body);
    const now = nowMs();
    for (const group of state.groups) {
      for (const item of group.items) {
        if (item.type === "direct" || item.type === "block") continue;
        item.urlTestTime = now;
        item.urlTestDelay = rand(60, 320);
      }
    }
    broadcast("groups", "subscribeGroups", groupsMessage());
    broadcast("outbounds", "subscribeOutbounds", outboundsMessage());
    unaryResponse(res, EmptySchema, {});
  },
  selectOutbound(req, res, method, body) {
    const request = parseRequest(method, body);
    for (const group of state.groups) {
      if (group.tag === request.groupTag) group.selected = request.outboundTag;
    }
    broadcast("groups", "subscribeGroups", groupsMessage());
    unaryResponse(res, EmptySchema, {});
  },
  setGroupExpand(req, res, method, body) {
    const request = parseRequest(method, body);
    for (const group of state.groups) {
      if (group.tag === request.groupTag) group.isExpand = request.isExpand;
    }
    broadcast("groups", "subscribeGroups", groupsMessage());
    unaryResponse(res, EmptySchema, {});
  },
  closeConnection(req, res, method, body) {
    const request = parseRequest(method, body);
    const closed = state.connections.get(request.id);
    if (closed) {
      state.connections.delete(request.id);
      broadcast("connections", "subscribeConnections", {
        events: [{ type: pb.ConnectionEventType.CONNECTION_EVENT_CLOSED, id: request.id, connection: { ...closed }, uplinkDelta: 0n, downlinkDelta: 0n, closedAt: nowMs() }],
      });
    }
    unaryResponse(res, EmptySchema, {});
  },
  closeAllConnections(req, res) {
    const closed = [...state.connections.values()];
    state.connections.clear();
    broadcast("connections", "subscribeConnections", {
      events: closed.map((conn) => ({
        type: pb.ConnectionEventType.CONNECTION_EVENT_CLOSED,
        id: conn.id,
        connection: { ...conn },
        uplinkDelta: 0n,
        downlinkDelta: 0n,
        closedAt: nowMs(),
      })),
    });
    unaryResponse(res, EmptySchema, {});
  },
  getDeprecatedWarnings(req, res) {
    unaryResponse(res, pb.DeprecatedWarningsSchema, { warnings: [] });
  },
  getStartedAt(req, res) {
    unaryResponse(res, pb.StartedAtSchema, { startedAt: state.startedAt });
  },
  setTailscaleExitNode(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  tailscaleLogout(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  markTaildropInboxRead(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  deleteTaildropFile(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  cancelTaildropReceiving(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  submitOpenConnectAuthResponse(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  cancelOpenConnectAuthChallenge(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  submitOpenVPNChallengeResponse(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
  cancelOpenVPNChallenge(req, res) {
    unaryResponse(res, EmptySchema, {});
  },
};

function unaryResponse(res: http.ServerResponse, schema: pb.MessageSchema, message: object) {
  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": "application/grpc-web+proto",
    "Cache-Control": "no-store",
  });
  res.write(frame(encode(schema, message)));
  res.end(trailersBuffer());
}

function handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "sing-box mock daemon", status: "ok" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, CORS_HEADERS);
    res.end();
    return;
  }

  const path = (req.url ?? "").split("?")[0];
  console.log(`[mock] ${req.method ?? "?"} ${path} origin=${req.headers.origin ?? "-"}`);
  if (!path.startsWith(SERVICE_PREFIX)) {
    res.writeHead(404, CORS_HEADERS);
    res.end();
    return;
  }
  const wireMethod = path.slice(SERVICE_PREFIX.length);
  const method = wireMethod.charAt(0).toLowerCase() + wireMethod.slice(1);
  const known = method in STREAM_HANDLERS || method in UNARY_HANDLERS;
  if (!known) {
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/grpc-web+proto" });
    res.end(trailersBuffer(12, "method not implemented in mock"));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (STREAM_HANDLERS[method]) {
      STREAM_HANDLERS[method](req, res, method);
    } else {
      UNARY_HANDLERS[method](req, res, method, body);
    }
  });
  req.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
}

// ---------------------------------------------------------------------------
// Minimal RFC 6455 WebSocket server for "grpc-websockets" streams
// ---------------------------------------------------------------------------

interface WsConnection {
  socket: import("node:net").Socket;
  buffer: Buffer;
  headersSeen: boolean;
  closed: boolean;
  pendingOpcode: number | null;
  pendingFragments: Buffer[];
}

function wsAccept(key: string): string {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

function wsFrame(opcode: number, payload: Buffer, fin = true): Buffer {
  let header: Buffer;
  const len = payload.length;
  if (len < 126) {
    header = Buffer.from([(fin ? 0x80 : 0x00) | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0x00) | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsSendBinary(conn: WsConnection, envelope: Buffer) {
  if (!conn.closed) conn.socket.write(wsFrame(0x2, envelope));
}

function wsSendEnvelope(conn: WsConnection, schema: pb.MessageSchema, message: object) {
  const payload = toBinary(schema, create(schema, message));
  wsSendBinary(conn, frame(payload, false));
}

function wsEndStream(conn: WsConnection, status = 0, message = "") {
  let text = `grpc-status: ${status}\r\n`;
  if (message !== "") text += `grpc-message: ${encodeURIComponent(message)}\r\n`;
  wsSendBinary(conn, frame(Buffer.from(text, "utf8"), true));
}

function handleWsMessage(conn: WsConnection, opcode: number, payload: Buffer) {
  if (opcode === 0x9) {
    // ping -> pong
    if (!conn.closed) conn.socket.write(wsFrame(0xa, payload));
    return;
  }
  if (opcode === 0x8) {
    conn.closed = true;
    try {
      conn.socket.end(wsFrame(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0)));
    } catch {
      conn.socket.destroy();
    }
    return;
  }
  if (opcode !== 0x1 && opcode !== 0x2) return;

  if (!conn.headersSeen) {
    // The first text frame carries the gRPC headers; ignore it.
    if (opcode === 0x1) {
      conn.headersSeen = true;
      return;
    }
    conn.headersSeen = true;
  }

  // Envelope: 1 flag byte + 4 length bytes + payload.
  if (payload.length < 5) return;
  const length = payload.readUInt32BE(1);
  if (payload.length < 5 + length) return;
  const body = payload.subarray(5, 5 + length);
  conn.onEnvelope?.(body);
}

function parseWsFrames(conn: WsConnection) {
  for (;;) {
    if (conn.buffer.length < 2) return;
    const b0 = conn.buffer[0];
    const b1 = conn.buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (conn.buffer.length < 4) return;
      len = conn.buffer.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (conn.buffer.length < 10) return;
      len = Number(conn.buffer.readBigUInt64BE(2));
      offset = 10;
    }
    const maskSize = masked ? 4 : 0;
    if (conn.buffer.length < offset + maskSize + len) return;
    let payload = conn.buffer.subarray(offset + maskSize, offset + maskSize + len);
    if (masked) {
      const mask = conn.buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    conn.buffer = conn.buffer.subarray(offset + maskSize + len);

    if (opcode === 0x0) {
      // continuation frame
      if (conn.pendingOpcode !== null) {
        conn.pendingFragments.push(payload);
        if (fin) {
          const merged = Buffer.concat(conn.pendingFragments);
          const pending = conn.pendingOpcode;
          conn.pendingOpcode = null;
          conn.pendingFragments = [];
          handleWsMessage(conn, pending, merged);
        }
      }
      continue;
    }
    if (!fin) {
      conn.pendingOpcode = opcode;
      conn.pendingFragments = [payload];
      continue;
    }
    handleWsMessage(conn, opcode, payload);
  }
}

function handleWsUpgrade(req: http.IncomingMessage, socket: import("node:net").Socket, head: Buffer) {
  const method = (req.url ?? "").split("?")[0].slice(SERVICE_PREFIX.length);
  console.log(`[mock] WS upgrade ${req.url ?? "?"} protocol=${req.headers["sec-websocket-protocol"] ?? "-"}`);
  const key = req.headers["sec-websocket-key"];
  const protocol = req.headers["sec-websocket-protocol"];

  if (!key || typeof method !== "string" || method !== "StartTailscaleSSHSession" && method !== "SendTaildropFiles" && method !== "ProvideUSBDevices") {
    socket.write(
      "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
    );
    socket.destroy();
    return;
  }

  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n` +
      (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "") +
      `\r\n`,
  );

  const conn: WsConnection = {
    socket,
    buffer: Buffer.concat([head]),
    headersSeen: false,
    closed: false,
    pendingOpcode: null,
    pendingFragments: [],
  };

  socket.on("data", (chunk: Buffer) => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    parseWsFrames(conn);
  });
  socket.on("close", () => {
    conn.closed = true;
  });
  socket.on("error", () => {
    conn.closed = true;
  });

  if (method === "StartTailscaleSSHSession") {
    conn.onEnvelope = (body) => {
      const clientMessage = fromBinary(pb.TailscaleSSHClientMessageSchema, body);
      if (clientMessage.message.case === "start") {
        const start = clientMessage.message.value;
        wsSendEnvelope(conn, pb.TailscaleSSHServerMessageSchema, {
          message: {
            case: "authBanner",
            value: {
              message: `Welcome to mock Tailscale SSH session on ${start.endpointTag}\r\n`,
            },
          },
        });
        wsSendEnvelope(conn, pb.TailscaleSSHServerMessageSchema, {
          message: { case: "ready", value: {} },
        });
        const motd = [
          "Linux mockhost 6.8.0-rc1 #1 SMP PREEMPT_DYNAMIC x86_64\r\n",
          "\r\n",
          "This is a simulated sing-box dashboard backend.\r\n",
          "Commands are accepted but not executed.\r\n",
          "\r\n",
          "mockhost:~$ ",
        ].join("");
        wsSendEnvelope(conn, pb.TailscaleSSHServerMessageSchema, {
          message: { case: "output", value: { data: new TextEncoder().encode(motd) } },
        });
      }
    };
  } else if (method === "SendTaildropFiles") {
    conn.onEnvelope = (body) => {
      const clientMessage = fromBinary(pb.TaildropSendClientMessageSchema, body);
      if (clientMessage.message.case === "start") {
        const start = clientMessage.message.value;
        start.files.forEach((file, fileIndex) => {
          const fileSize = file.size;
          for (const fraction of [0, 0.35, 0.7, 1]) {
            const sentBytes = BigInt(Math.floor(Number(fileSize) * fraction));
            wsSendEnvelope(conn, pb.TaildropSendServerMessageSchema, {
              message: {
                case: "progress",
                value: { fileIndex, sentBytes, fileCompleted: fraction === 1 },
              },
            });
          }
        });
        wsEndStream(conn);
      }
    };
  } else {
    conn.onEnvelope = (body) => {
      const clientMessage = fromBinary(pb.USBProviderMessageSchema, body);
      switch (clientMessage.message.case) {
        case "attach": {
          const attach = clientMessage.message.value;
          wsSendEnvelope(conn, pb.USBServerMessageSchema, {
            message: {
              case: "ready",
              value: { deviceId: attach.descriptor?.deviceId ?? "usb-1", busId: "1-5" },
            },
          });
          break;
        }
        case "urbResponse": {
          const response = clientMessage.message.value;
          wsSendEnvelope(conn, pb.USBServerMessageSchema, {
            message: {
              case: "ready",
              value: { deviceId: response.deviceId, busId: "1-5" },
            },
          });
          break;
        }
        default:
          break;
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  try {
    handleHttp(req, res);
  } catch (error) {
    console.error("mock: request failed", error);
    if (!res.headersSent) {
      res.writeHead(500, CORS_HEADERS);
    }
    res.end();
  }
});

server.on("upgrade", (req, socket, head) => {
  try {
    handleWsUpgrade(req, socket, head);
  } catch (error) {
    console.error("mock: websocket upgrade failed", error);
    socket.destroy();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock] sing-box mock daemon listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock] gRPC-Web service path: ${SERVICE_PREFIX}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
