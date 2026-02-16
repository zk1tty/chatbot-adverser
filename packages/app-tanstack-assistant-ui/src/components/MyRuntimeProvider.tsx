import { useState, useEffect, type ReactNode } from "react";
import {
  useExternalStoreRuntime,
  ThreadMessageLike,
  AppendMessage,
  AssistantRuntimeProvider,
  useAui,
  Tools,
  type Toolkit,
} from "@assistant-ui/react";
import { chatStream } from "@/server/chat";
import { createMcpToolkit } from "@/lib/mcp-toolkit";

type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
};

type MyMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallPart[];
};

const generateId = () => Math.random().toString(36).substring(2, 9);

const convertMessage = (message: MyMessage): ThreadMessageLike => {
  const parts: Array<ThreadMessageLike["content"][number]> = [];

  // Add text content
  if (message.content) {
    parts.push({ type: "text", text: message.content });
  }

  // Add tool calls
  if (message.toolCalls) {
    for (const toolCall of message.toolCalls) {
      parts.push({
        type: "tool-call",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
        result: toolCall.result,
      });
    }
  }

  return {
    id: message.id,
    role: message.role,
    content: parts,
  };
};

export function MyRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<MyMessage[]>([]);
  const [toolkit, setToolkit] = useState<Toolkit>({});

  // Load MCP tools on mount
  useEffect(() => {
    createMcpToolkit()
      .then((mcpToolkit) => {
        setToolkit(mcpToolkit);
        console.log("MCP tools loaded:", Object.keys(mcpToolkit));
      })
      .catch((error) => {
        console.error("Failed to load MCP tools:", error);
      });
  }, []);

  const onNew = async (message: AppendMessage) => {
    if (message.content[0]?.type !== "text")
      throw new Error("Only text messages are supported");

    const input = message.content[0].text;
    const userMessage: MyMessage = {
      id: generateId(),
      role: "user",
      content: input,
    };

    // Add user message (don't clear tool calls yet - OpenAI needs them!)
    const updatedMessages = [...messages, userMessage];

    // Create placeholder for assistant message
    setIsRunning(true);
    const assistantId = generateId();
    const assistantMessage: MyMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
    };

    // Add the new assistant placeholder
    setMessages([...updatedMessages, assistantMessage]);

    try {
      // Stream response using async generator
      // IMPORTANT: Send tool calls and results to OpenAI so it knows they've been executed
      const stream = await chatStream({
        data: {
          messages: updatedMessages.flatMap((m): any[] => {
            // For user messages, send as-is
            if (m.role === "user") {
              return [{ role: "user" as const, content: m.content }];
            }

            // For assistant messages with tool calls, send both the message and tool results
            if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
              const result: any[] = [
                {
                  role: "assistant" as const,
                  content: m.content || "",
                  tool_calls: m.toolCalls.map((tc) => ({
                    id: tc.toolCallId,
                    type: "function" as const,
                    function: {
                      name: tc.toolName,
                      arguments: JSON.stringify(tc.args),
                    },
                  })),
                },
              ];

              // Add tool result messages
              for (const tc of m.toolCalls) {
                if (tc.result) {
                  result.push({
                    role: "tool" as const,
                    tool_call_id: tc.toolCallId,
                    content: JSON.stringify(tc.result),
                  });
                }
              }

              return result;
            }

            // For assistant messages without tool calls, send as-is
            return [{ role: "assistant" as const, content: m.content }];
          }),
        },
      });

      // Handle streaming chunks
      for await (const chunk of stream) {
        try {
          const parsed = JSON.parse(chunk);

          if (parsed.type === "text") {
            // Handle text content
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + parsed.content }
                  : m
              )
            );
          } else if (parsed.type === "tool_call") {
            // Handle tool call - add to current message only
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        {
                          type: "tool-call" as const,
                          toolCallId: parsed.id,
                          toolName: parsed.name,
                          args: parsed.arguments,
                        },
                      ],
                    }
                  : m
              )
            );
          } else if (parsed.type === "tool_result") {
            // Handle tool result
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls || []).map((tc) =>
                        tc.toolCallId === parsed.id
                          ? { ...tc, result: parsed.result }
                          : tc
                      ),
                    }
                  : m
              )
            );
          }
        } catch (e) {
          // If not JSON, treat as plain text (fallback for backward compatibility)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, an error occurred. Please try again." }
            : m
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    convertMessage,
    onNew,
  });

  // Register MCP tools with assistant-ui
  const aui = useAui({
    tools: Tools({ toolkit }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      {children}
    </AssistantRuntimeProvider>
  );
}
