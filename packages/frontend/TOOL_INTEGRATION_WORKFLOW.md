# MCP Tool Integration Workflow

This document explains the complete workflow for integrating MCP (Model Context Protocol) tools with TanStack Assistant UI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
│                  (TanStack Assistant UI)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MyRuntimeProvider.tsx                         │
│  • Manages message state                                       │
│  • Loads MCP tools on mount                                    │
│  • Registers tools with useAui()                               │
│  • Handles streaming responses                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       chat.ts (Server)                          │
│  • Receives user messages                                      │
│  • Fetches MCP tools and passes to OpenAI                      │
│  • Streams OpenAI responses (text + tool calls)                │
│  • Executes MCP tools when requested                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   mcp-client.ts & mcp-toolkit.ts                │
│  • Connects to MCP server                                      │
│  • Lists available tools                                       │
│  • Executes tool calls                                         │
│  • Converts MCP schemas to Zod                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server                                 │
│                  (http://localhost:8080/mcp)                    │
│  • Exposes tools via MCP protocol                              │
│  • Executes tool logic                                         │
│  • Returns results                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Step-by-Step Workflow

### 1. **Initialization Phase**

**When:** Application starts

**What happens:**
1. `MyRuntimeProvider` mounts and calls `useEffect()`
2. `createMcpToolkit()` is invoked
3. MCP client connects to server at `MCP_BASE_URL/mcp`
4. `listTools()` fetches all available tools from MCP server
5. Each MCP tool is converted to assistant-ui `Toolkit` format:
   - Tool name → registered in toolkit
   - Description → used by LLM to understand when to call
   - JSON Schema → converted to Zod schema
   - Execute function → proxies to MCP server
6. Toolkit is registered via `useAui({ tools: Tools({ toolkit }) })`

**Result:** UI knows about all available MCP tools and can render them

---

### 2. **User Sends Message**

**When:** User types a message and hits send

**What happens:**
1. `onNew(message)` is called in `MyRuntimeProvider`
2. User message is added to state
3. Assistant placeholder message is created
4. `chatStream()` server function is invoked with message history

**Data flow:**
```typescript
User Input → AppendMessage → MyMessage → chatStream({ messages })
```

---

### 3. **Tool Discovery (Server Side)**

**When:** `chatStream()` handler executes

**What happens:**
1. `getMcpToolsForOpenAI()` is called
2. MCP client connects to server
3. `listTools()` fetches available tools
4. MCP tool schemas are converted to OpenAI function format:
   ```typescript
   {
     type: "function",
     function: {
       name: "tool_name",
       description: "What the tool does",
       parameters: { /* JSON Schema */ }
     }
   }
   ```
5. These tools are passed to OpenAI's `chat.completions.create()`

**Result:** OpenAI knows what tools are available and can decide to call them

---

### 4. **LLM Processing**

**When:** OpenAI processes the conversation

**What happens:**
1. OpenAI analyzes the user's message
2. Decides whether to:
   - Respond with text only, OR
   - Call one or more tools
3. If tools are needed, OpenAI includes `tool_calls` in response:
   ```json
   {
     "tool_calls": [
       {
         "id": "call_abc123",
         "type": "function",
         "function": {
           "name": "get_weather",
           "arguments": "{\"location\":\"San Francisco\"}"
         }
       }
     ]
   }
   ```

---

### 5. **Streaming Response (Text)**

**When:** OpenAI returns text content

**What happens:**
1. Server receives chunks: `delta.content = "Hello"`
2. Server yields JSON: `{ type: "text", content: "Hello" }`
3. Client parses JSON and updates assistant message:
   ```typescript
   setMessages(prev =>
     prev.map(m =>
       m.id === assistantId
         ? { ...m, content: m.content + "Hello" }
         : m
     )
   )
   ```
4. UI updates in real-time as text streams in

---

### 6. **Tool Call Detection**

**When:** OpenAI decides to call a tool

**What happens:**
1. Server receives `delta.tool_calls` chunks
2. Tool call details are accumulated:
   ```typescript
   toolCalls[index] = {
     id: "call_abc123",
     name: "get_weather",
     arguments: "{\"location\":\"SF\"}" // streamed gradually
   }
   ```
3. When `finish_reason === "tool_calls"`, execution begins

---

### 7. **Tool Execution (Server Side)**

**When:** All tool calls are received

**What happens:**
1. Server yields: `{ type: "tool_calls_start" }`
2. For each tool call:
   ```typescript
   // Parse arguments
   const args = JSON.parse(toolCall.arguments);

   // Yield tool call notification
   yield { type: "tool_call", id, name, arguments: args };

   // Execute via MCP
   const mcpClient = createMcpClient();
   await mcpClient.connect();
   const result = await mcpClient.callTool(name, args);

   // Yield result
   yield { type: "tool_result", id, result };
   ```
3. Server yields: `{ type: "tool_calls_end" }`

**Result:** Tool is executed on MCP server, result is streamed to client

---

### 8. **Tool Result Display (Client Side)**

**When:** Client receives tool result chunks

**What happens:**
1. Client receives `{ type: "tool_call", ... }`:
   ```typescript
   setMessages(prev => prev.map(m =>
     m.id === assistantId ? {
       ...m,
       toolCalls: [...m.toolCalls, {
         type: "tool-call",
         toolCallId: id,
         toolName: name,
         args: arguments
       }]
     } : m
   ))
   ```

2. Client receives `{ type: "tool_result", ... }`:
   ```typescript
   setMessages(prev => prev.map(m =>
     m.id === assistantId ? {
       ...m,
       toolCalls: m.toolCalls.map(tc =>
         tc.toolCallId === id
           ? { ...tc, result }
           : tc
       )
     } : m
   ))
   ```

3. Assistant-UI renders tool calls using the `render()` function from toolkit:
   ```tsx
   render: ({ result }) => (
     <div className="tool-result">
       {JSON.stringify(result, null, 2)}
     </div>
   )
   ```

---

### 9. **Continuation (Optional)**

**When:** LLM needs tool results to formulate final answer

**What happens:**
1. Tool results are added to message history
2. New request is made to OpenAI with:
   ```typescript
   messages: [
     ...previousMessages,
     { role: "assistant", tool_calls: [...] },
     { role: "tool", tool_call_id: "...", content: result }
   ]
   ```
3. OpenAI uses tool results to generate final text response
4. Process returns to step 5 (streaming response)

---

## Key Integration Points

### 1. **Tool Discovery**
- **Location:** `createMcpToolkit()` in [mcp-toolkit.ts](src/lib/mcp-toolkit.ts)
- **Purpose:** Connect to MCP server and fetch available tools
- **Timing:** On application mount

### 2. **Tool Schema Conversion**
- **Location:** `jsonSchemaToZod()` in [mcp-toolkit.ts](src/lib/mcp-toolkit.ts)
- **Purpose:** Convert MCP JSON Schema to Zod for validation
- **Note:** May need expansion based on your tool schemas

### 3. **Tool Registration**
- **Location:** `useAui()` in [MyRuntimeProvider.tsx](src/components/MyRuntimeProvider.tsx:143)
- **Purpose:** Make tools available to assistant-ui for rendering
- **API:** `Tools({ toolkit })`

### 4. **Tool Execution Proxy**
- **Location:** `execute` function in toolkit + `chatStream()` in [chat.ts](src/server/chat.ts)
- **Purpose:** Forward tool calls from OpenAI to MCP server
- **Note:** Execution happens server-side for security

### 5. **Result Streaming**
- **Location:** `chatStream()` generator in [chat.ts](src/server/chat.ts)
- **Purpose:** Stream tool calls and results to client
- **Format:** JSON-encoded messages

---

## Message Flow Diagram

```
User: "What's the weather in SF?"
  ↓
[MyRuntimeProvider] Add user message to state
  ↓
[chatStream] Call OpenAI with tools=[get_weather, ...]
  ↓
[OpenAI] → Decides to call get_weather("San Francisco")
  ↓
[chatStream] Receives tool_calls in stream
  ↓
[chatStream] Executes: mcpClient.callTool("get_weather", {location: "SF"})
  ↓
[MCP Server] Returns: { temperature: 72, condition: "sunny" }
  ↓
[chatStream] Yields: {type: "tool_result", result: {...}}
  ↓
[MyRuntimeProvider] Updates message with tool result
  ↓
[Assistant-UI] Renders tool call with custom UI
  ↓
[User sees] Tool result displayed in chat
```

---

## Configuration

### Environment Variables

```bash
# .env
MCP_BASE_URL=http://localhost:8080
OPENAI_API_KEY=sk-...
```

### MCP Server Requirements

Your MCP server must:
1. Expose `/mcp` endpoint
2. Support GET for SSE (server-to-client messages)
3. Support POST for JSON-RPC requests
4. Implement `tools/list` method
5. Implement `tools/call` method
6. Follow MCP Streamable HTTP protocol

---

## Testing the Integration

### 1. Start your MCP server
```bash
# Example
cd mcp-server
npm start
# Server running at http://localhost:8080
```

### 2. Verify tools are available
```bash
curl http://localhost:8080/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 3. Start your app
```bash
pnpm dev
```

### 4. Test in UI
1. Open chat interface
2. Check console for: "MCP tools loaded: [tool1, tool2]"
3. Send a message that should trigger a tool
4. Watch for tool call in UI

---

## Troubleshooting

### Tools not loading
- Check MCP_BASE_URL is correct
- Verify MCP server is running
- Check browser console for errors
- Ensure MCP server implements Streamable HTTP protocol

### Tools not being called
- Verify tool descriptions are clear
- Check OpenAI is receiving tools (`console.log(tools)` in chat.ts)
- Ensure tool parameters match expected schema
- Try asking more explicitly: "Use the weather tool to check SF"

### Tool execution fails
- Check MCP server logs
- Verify argument schema matches
- Ensure MCP client can connect
- Check for network issues

### Results not displaying
- Verify `render()` function in toolkit
- Check message state updates in React DevTools
- Ensure JSON parsing works for streamed chunks

---

## Next Steps

1. **Customize Tool Rendering**: Update `render()` functions in [mcp-toolkit.ts](src/lib/mcp-toolkit.ts) for better UI
2. **Add Error Handling**: Implement retry logic and user-friendly error messages
3. **Human-in-the-Loop**: Add confirmation dialogs for sensitive operations
4. **Tool Caching**: Cache tool discovery to avoid repeated MCP calls
5. **Multi-Server Support**: Connect to multiple MCP servers simultaneously

---

## References

- [Assistant-UI Tools Guide](https://www.assistant-ui.com/docs/guides/tools.mdx)
- [Model Context Protocol Spec](https://spec.modelcontextprotocol.io/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
