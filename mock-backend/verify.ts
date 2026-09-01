// Quick end-to-end verification of the mock daemon.
// Run with:  node --experimental-transform-types mock/verify.ts

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import * as pb from "./gen/daemon/started_service_pb.ts";

const BASE = process.env.MOCK_BASE ?? "http://127.0.0.1:8090";

function parseEnvelopes(bytes: Uint8Array): { flags: number; data: Uint8Array }[] {
  const out: { flags: number; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset];
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0);
    offset += 5;
    if (offset + length > bytes.length) break;
    out.push({ flags, data: bytes.subarray(offset, offset + length) });
    offset += length;
  }
  return out;
}

async function unary(method: string, schema: pb.MessageSchema) {
  const response = await fetch(`${BASE}/${pb.StartedService.typeName}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/grpc-web+proto" },
    body: new Uint8Array(0),
  });
  const envelopes = parseEnvelopes(new Uint8Array(await response.arrayBuffer()));
  const messages = envelopes.filter((env) => (env.flags & 0x80) === 0);
  const trailers = envelopes.find((env) => (env.flags & 0x80) !== 0);
  const decoded = messages.length > 0 ? fromBinary(schema, messages[0].data) : null;
  return { status: response.status, decoded, trailers: trailers ? new TextDecoder().decode(trailers.data) : null };
}

async function streamFirst(method: string, schema: pb.MessageSchema) {
  const response = await fetch(`${BASE}/${pb.StartedService.typeName}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/grpc-web+proto" },
    body: new Uint8Array(0),
  });
  const reader = response.body!.getReader();
  let buffer = new Uint8Array(0);
  let attempts = 0;
  while (attempts < 20) {
    const { value, done } = await reader.read();
    if (done) break;
    const merged = new Uint8Array(buffer.length + value.length);
    merged.set(buffer);
    merged.set(value, buffer.length);
    buffer = merged;
    const envelopes = parseEnvelopes(buffer);
    if (envelopes.length > 0) {
      reader.cancel();
      const first = envelopes.find((env) => (env.flags & 0x80) === 0);
      return first ? fromBinary(schema, first.data) : null;
    }
    attempts += 1;
  }
  return null;
}

function wsEnvelope(message: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(5 + message.length);
  new DataView(out.buffer).setUint32(1, message.length);
  out.set(message, 5);
  return out.buffer;
}

async function main() {
  console.log("== GetVersion ==");
  const version = await unary("GetVersion", pb.VersionSchema);
  console.log(version.decoded);
  console.log("trailers:", version.trailers?.trim());

  console.log("\n== SubscribeServiceStatus ==");
  const status = await streamFirst("SubscribeServiceStatus", pb.ServiceStatusSchema);
  console.log(status);

  console.log("\n== SubscribeStatus ==");
  const traffic = await streamFirst("SubscribeStatus", pb.StatusSchema);
  console.log(`memory=${traffic?.memory} goroutines=${traffic?.goroutines} uplink=${traffic?.uplink} downlink=${traffic?.downlink}`);

  console.log("\n== SubscribeGroups ==");
  const groups = await streamFirst("SubscribeGroups", pb.GroupsSchema);
  console.log(`groups=${groups?.group.length} first=${groups?.group[0]?.tag} items=${groups?.group[0]?.items.length}`);

  console.log("\n== other dashboard streams ==");
  const connections = await streamFirst("SubscribeConnections", pb.ConnectionEventsSchema);
  console.log(`connections events=${connections?.events.length}`);
  const log = await streamFirst("SubscribeLog", pb.LogSchema);
  console.log(`log entries=${log?.messages.length}`);
  const outbounds = await streamFirst("SubscribeOutbounds", pb.OutboundListSchema);
  console.log(`outbounds=${outbounds?.outbounds.length}`);
  const tailscale = await streamFirst("SubscribeTailscaleStatus", pb.TailscaleStatusUpdateSchema);
  console.log(`tailscale endpoints=${tailscale?.endpoints.length} unread=${tailscale?.endpoints[0]?.unreadFileCount}`);
  const usbip = await streamFirst("SubscribeUSBIPServerStatus", pb.USBIPServerStatusUpdateSchema);
  console.log(`usbip servers=${usbip?.servers.length} devices=${usbip?.servers[0]?.devices.length}`);
  const openconnect = await streamFirst("SubscribeOpenConnectStatus", pb.OpenConnectStatusUpdateSchema);
  console.log(`openconnect endpoints=${openconnect?.endpoints.length} state=${openconnect?.endpoints[0]?.state}`);
  const openvpn = await streamFirst("SubscribeOpenVPNStatus", pb.OpenVPNStatusUpdateSchema);
  console.log(`openvpn endpoints=${openvpn?.endpoints.length} state=${openvpn?.endpoints[0]?.state}`);
  const inbox = await streamFirst("SubscribeTaildropInbox", pb.TaildropInboxSchema);
  console.log(`taildrop files=${inbox?.files.length}`);

  console.log("\n== unary extras ==");
  const mode = await unary("GetClashModeStatus", pb.ClashModeStatusSchema);
  console.log(`clash mode=${mode.decoded?.currentMode} list=${mode.decoded?.modeList}`);
  const startedAt = await unary("GetStartedAt", pb.StartedAtSchema);
  console.log(`startedAt=${startedAt.decoded?.startedAt}`);
  const warnings = await unary("GetDeprecatedWarnings", pb.DeprecatedWarningsSchema);
  console.log(`warnings=${warnings.decoded?.warnings.length}`);

  console.log("\n== CORS preflight ==");
  const preflight = await fetch(`${BASE}/${pb.StartedService.typeName}/GetVersion`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-grpc-web",
    },
  });
  console.log("status:", preflight.status, "allow-origin:", preflight.headers.get("access-control-allow-origin"));

  console.log("\n== WebSocket: StartTailscaleSSHSession ==");
  const ws = new WebSocket(
    `${BASE.replace(/^http/, "ws")}/${pb.StartedService.typeName}/StartTailscaleSSHSession`,
    ["grpc-websockets"],
  );
  const received: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws timeout")), 4000);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      ws.send(
        "content-type: application/grpc-web+proto\r\nx-grpc-web: 1\r\naccept-language: en\r\n",
      );
      const startMessage = create(pb.TailscaleSSHClientMessageSchema, {
        message: {
          case: "start",
          value: {
            endpointTag: "tailscale0",
            peerAddress: "100.101.102.104",
            username: "user",
            terminalType: "xterm",
            columns: 80,
            rows: 24,
          },
        },
      });
      ws.send(wsEnvelope(toBinary(pb.TailscaleSSHClientMessageSchema, startMessage)));
    };
    ws.onmessage = (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      if (bytes.length < 5) return;
      const length = new DataView(bytes.buffer, 1, 4).getUint32(0);
      const payload = bytes.subarray(5, 5 + length);
      if ((bytes[0] & 0x80) !== 0) {
        received.push(`trailers: ${new TextDecoder().decode(payload).trim()}`);
        clearTimeout(timer);
        ws.close();
        resolve();
        return;
      }
      const serverMessage = fromBinary(pb.TailscaleSSHServerMessageSchema, payload);
      received.push(`message.case = ${serverMessage.message.case}`);
      if (serverMessage.message.case === "output") {
        received.push(
          `output: ${new TextDecoder().decode(serverMessage.message.value.data).split("\n")[0]}`,
        );
      }
      if (serverMessage.message.case === "ready") {
        // client would keep the session open; we close after seeing ready
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    };
    ws.onerror = (error) => {
      clearTimeout(timer);
      reject(new Error(`ws error: ${String(error)}`));
    };
  });
  console.log(received.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
