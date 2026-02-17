# Aui-Zeroclick

A monorepo project with a TanStack frontend application and a Mock Commerce Ad Server with MCP (Model Context Protocol) support.

## Prerequisites

- Node.js (v18 or higher)
- pnpm (v10.23.0 or higher)

## Installation

Install all dependencies for the monorepo:

```bash
pnpm install
```

## Development

### Start Both Frontend and MCP Server

Step 1: Run frontend and MCP server simultaneously with color-coded logs:

```bash
pnpm run dev:frontend
```

Step 2: Run MCP Ad Server

```bash
pnpm run dev:mcp
```

OR, you can run both concurrently
```bash
pnpm run dev
```

This will start:
- **Frontend** (cyan logs): Vite + Assistant-UI dev server on `http://localhost:3000`
- **MCP Server** (magenta logs): Mock ZeroClicki-ish MCP Ad Server on `http://localhost:8080`

## Health Check

### Check MCP Server Health

Use the MCP Inspector to verify the MCP server is running correctly:

```bash
npx @modelcontextprotocol/inspector
```

The inspector will help you:
- Connect to the MCP endpoint at `http://localhost:8080/mcp`
- Test available tools and methods
- Verify server responses

### Manual Health Check

You can also verify the services manually:

- **Frontend**: Visit `http://localhost:3000` in your browser
- **MCP Server**: The server logs will show `🚀 Mock Commerce Ad Server running on http://localhost:8080`

## Project Structure

```
Aui-Zeroclick/
├── packages/
│   ├── app-tanstack-assistant-ui/    # Frontend application
│   └── mock-mcp-adserver/            # MCP server
└── package.json                       # Root package configuration
```

## Build

Build all packages:

```bash
pnpm run build
```
