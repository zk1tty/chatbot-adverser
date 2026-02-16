import { createServerFn } from "@tanstack/react-start";
import OpenAI from "openai";
import { createMcpClient } from "./mcp-client";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type ChatInput = {
  messages: ChatMessage[];
};

/**
 * Discovers MCP tools and converts them to OpenAI function format
 */
async function getMcpToolsForOpenAI() {
  const mcpClient = createMcpClient();

  try {
    await mcpClient.connect();
    const toolsResponse = await mcpClient.listTools();
    const mcpTools = toolsResponse.tools || [];

    // Convert MCP tools to OpenAI function calling format
    return mcpTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description || `Execute ${tool.name}`,
        parameters: tool.inputSchema || { type: "object", properties: {} },
      },
    }));
  } catch (error) {
    console.error("Failed to fetch MCP tools:", error);
    return [];
  } finally {
    await mcpClient.close();
  }
}

export const chatStream = createServerFn({ method: "POST" })
  .inputValidator((data: ChatInput) => data)
  .handler(async function* ({ data }) {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Fetch available MCP tools
    const tools = await getMcpToolsForOpenAI();

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: data.messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
    });

    let toolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
    }> = [];
    let currentToolCallIndex = -1;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle text content
      if (delta?.content) {
        yield JSON.stringify({ type: "text", content: delta.content });
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;

          // Initialize new tool call
          if (index !== currentToolCallIndex) {
            currentToolCallIndex = index;
            toolCalls[index] = {
              id: toolCall.id || "",
              name: toolCall.function?.name || "",
              arguments: "",
            };
          }

          // Accumulate arguments
          if (toolCall.function?.arguments) {
            toolCalls[index].arguments += toolCall.function.arguments;
          }
        }
      }

      // When stream finishes, execute tool calls
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls" && toolCalls.length > 0) {
        yield JSON.stringify({ type: "tool_calls_start" });

        // Execute each tool call
        for (const toolCall of toolCalls) {
          try {
            const args = JSON.parse(toolCall.arguments);

            yield JSON.stringify({
              type: "tool_call",
              id: toolCall.id,
              name: toolCall.name,
              arguments: args,
            });

            // Execute MCP tool
            const mcpClient = createMcpClient();
            await mcpClient.connect();
            const result = await mcpClient.callTool(toolCall.name, args);
            await mcpClient.close();

            yield JSON.stringify({
              type: "tool_result",
              id: toolCall.id,
              result: result,
            });
          } catch (error) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            yield JSON.stringify({
              type: "tool_error",
              id: toolCall.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        yield JSON.stringify({ type: "tool_calls_end" });
      }
    }
  });
