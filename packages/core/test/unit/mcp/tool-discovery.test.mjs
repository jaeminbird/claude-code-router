import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { listMcpServerTools } from "@ccr/core/mcp/tool-discovery.ts";

const tool = {
  description: "Echo text back.",
  inputSchema: { properties: { text: { type: "string" } }, type: "object" },
  name: "echo"
};

test("Streamable HTTP discovery reads tools from a single-event SSE reply", async (t) => {
  const url = await startSseMcpServer(t, (message) => [message]);
  const tools = await listMcpServerTools({ name: "sse-test", transport: "http", url });
  assert.deepEqual(tools.map((entry) => entry.name), ["echo"]);
});

test("Streamable HTTP discovery reads the response after a notification in the same SSE stream", async (t) => {
  const url = await startSseMcpServer(t, (message) => [
    { jsonrpc: "2.0", method: "notifications/message", params: { data: "listing tools", level: "info" } },
    message
  ]);
  const tools = await listMcpServerTools({ name: "sse-test", transport: "http", url });
  assert.deepEqual(tools.map((entry) => entry.name), ["echo"]);
});

async function startSseMcpServer(t, frame) {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    const message = JSON.parse(body);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const result = message.method === "initialize"
      ? { capabilities: { tools: {} }, protocolVersion: "2025-06-18", serverInfo: { name: "sse-test", version: "1.0.0" } }
      : { tools: [tool] };
    const events = frame({ id: message.id, jsonrpc: "2.0", result });
    // Same framing as the MCP TypeScript SDK's StreamableHTTPServerTransport.
    response.writeHead(200, { "content-type": "text/event-stream", "mcp-session-id": "session-1" });
    response.end(events.map((event) => `event: message\ndata: ${JSON.stringify(event)}\n\n`).join(""));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}/mcp`;
}
