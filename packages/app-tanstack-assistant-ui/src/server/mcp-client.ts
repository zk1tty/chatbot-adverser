/**
 * MCP client using the official @modelcontextprotocol/sdk.
 *
 * Install: pnpm add @modelcontextprotocol/sdk zod
 *
 * Usage:
 *   1. Create a Client with name/version.
 *   2. Create a transport (StreamableHTTPClientTransport for http://localhost:8080/mcp).
 *   3. await client.connect(transport).
 *   4. client.listTools() / client.callTool({ name, arguments }).
 *
 * Your mock server must speak the MCP Streamable HTTP protocol:
 *   - GET /mcp → SSE stream for server-to-client messages
 *   - POST /mcp → send JSON-RPC messages, receive JSON or SSE response
 *
 * If your mock only supports "POST /mcp with JSON-RPC body and SSE response",
 * that is the legacy HTTP+SSE style; use a custom fetch in that case.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = process.env.MCP_BASE_URL ?? "http://localhost:8080";

/**
 * Creates an MCP client connected to the server at MCP_SERVER_URL/mcp.
 * Call connect() before using listTools/callTool.
 */
export function createMcpClient(baseUrl: string = MCP_SERVER_URL) {
  const url = new URL("/mcp", baseUrl.replace(/\/$/, ""));
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Accept: "application/json, text/event-stream",
      },
    },
  });

  const client = new Client(
    {
      name: "tanstack-assistant-ui",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  return {
    client,
    transport,
    async connect() {
      await client.connect(transport);
    },
    async listTools() {
      return client.listTools();
    },
    async callTool(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      return result;
    },
    close() {
      return transport.close();
    },
  };
}

/**
 * One-off: connect, call a tool, then close.
 * Useful for serverless or single-request flows.
 */
export async function callMcpToolWithSdk(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string = MCP_SERVER_URL
) {
  const { client, transport, connect, callTool, close } = createMcpClient(baseUrl);
  try {
    await connect();
    const result = await callTool(name, args);
    return result;
  } finally {
    await close();
  }
}
