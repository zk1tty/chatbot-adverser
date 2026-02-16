/**
 * Adapter to convert MCP tools into assistant-ui Toolkit format.
 * Handles tool discovery, schema conversion, and execution proxying.
 */

import { createMcpClient } from "@/server/mcp-client";
import { z } from "zod";
import type { Toolkit } from "@assistant-ui/react";

/**
 * Converts MCP JSON Schema to Zod schema (simplified version)
 * You may need to expand this based on your MCP tool schemas
 */
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.any();
  }

  // Handle object type
  if (schema.type === "object" && schema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      shape[key] = jsonSchemaToZod(value);
    }
    const zodObj = z.object(shape);

    // Handle required fields
    if (Array.isArray(schema.required)) {
      return zodObj;
    }
    return zodObj.partial();
  }

  // Handle primitive types
  switch (schema.type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.any());
    default:
      return z.any();
  }
}

/**
 * Discovers all MCP tools and converts them to assistant-ui Toolkit format
 */
export async function createMcpToolkit(baseUrl?: string): Promise<Toolkit> {
  const mcpClient = createMcpClient(baseUrl);

  try {
    // Step 1: Connect to MCP server
    await mcpClient.connect();

    // Step 2: Discover available tools
    const toolsResponse = await mcpClient.listTools();
    const mcpTools = toolsResponse.tools || [];

    // Step 3: Convert each MCP tool to assistant-ui tool format
    const toolkit: Toolkit = {};

    for (const mcpTool of mcpTools) {
      const toolName = mcpTool.name;

      // Convert JSON Schema to Zod
      const parameters = mcpTool.inputSchema
        ? jsonSchemaToZod(mcpTool.inputSchema)
        : z.object({});

      toolkit[toolName] = {
        description: mcpTool.description || `Execute ${toolName}`,
        parameters,

        // Step 4: Proxy execution to MCP server
        execute: async (args: any) => {
          try {
            const result = await mcpClient.callTool(toolName, args);
            return result.content || result;
          } catch (error) {
            console.error(`Error executing MCP tool ${toolName}:`, error);
            throw error;
          }
        },

        // Note: Custom rendering is handled by Tool UI components (makeAssistantToolUI)
        // See: src/components/assistant-ui/offers-tool-ui.tsx for the get_commerce_offers renderer
        // The toolkit's render function is not used by assistant-ui's architecture
      };
    }

    return toolkit;
  } finally {
    // Keep connection open for tool execution
    // Don't close here; close when runtime unmounts
  }
}

/**
 * Server-side tool execution handler
 * Use this in your chat stream to call MCP tools
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  baseUrl?: string
) {
  const mcpClient = createMcpClient(baseUrl);

  try {
    await mcpClient.connect();
    const result = await mcpClient.callTool(toolName, args);
    return result;
  } finally {
    await mcpClient.close();
  }
}