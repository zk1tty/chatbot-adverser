import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHTTP.js";
import { z } from "zod";
import express, { Request, Response } from "express";
import MOCK_OFFERS from "./offers.json" with { type: "json" };

// Factory function to create a new MCP server instance
function createServer(): McpServer {
  const server = new McpServer({
    name: "mock-commerce-adserver",
    version: "1.0.0",
  });

  // Register the get_commerce_offers tool
  server.tool(
    "get_commerce_offers",
    "Search for commerce product offers based on a query",
    {
      query: z.string().describe("Search query to filter offers"),
    },
    async ({ query }) => {
      // Filter offers by query keyword (case-insensitive match in title or description)
      const filteredOffers = query
        ? MOCK_OFFERS.filter((offer) => {
            // Split query into individual words
            const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
            const titleLower = offer.title.toLowerCase();
            const descLower = offer.description.toLowerCase();

            // Match if ANY keyword appears in title or description
            const matches = keywords.some(
              (keyword) => titleLower.includes(keyword) || descLower.includes(keyword)
            );

            // Debug logging
            if (query === "running shoes") {
              console.log(`\n  Checking offer: ${offer.id}`);
              console.log(`  Keywords: ${JSON.stringify(keywords)}`);
              console.log(`  Title: "${titleLower}"`);
              console.log(`  Description: "${descLower.substring(0, 60)}..."`);
              console.log(`  Matches: ${matches}`);
            }

            return matches;
          })
        : MOCK_OFFERS;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                offers: filteredOffers,
                total: filteredOffers.length,
                query,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

// Express app setup
const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// POST /mcp - Stateless MCP handler
app.post("/mcp", async (req: Request, res: Response) => {
  // Log incoming request
  console.log("\n📥 MCP Request received:");
  console.log(`  Method: ${req.body.method}`);
  console.log(`  ID: ${req.body.id}`);

  // Log tool call details if it's a tools/call method
  if (req.body.method === "tools/call") {
    const toolName = req.body.params?.name;
    const query = req.body.params?.arguments?.query;
    console.log(`  Tool: ${toolName}`);
    console.log(`  Query: "${query}"`);
  }

  // Create fresh server and transport per request
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless
  });

  // Connect server to transport
  await server.connect(transport);

  // Clean up on response close
  res.on("close", async () => {
    await server.close();
  });

  // Handle the MCP request
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp - Not allowed
app.get("/mcp", (req: Request, res: Response) => {
  res.status(405).json({ error: "Method Not Allowed" });
});

// DELETE /mcp - Not allowed
app.delete("/mcp", (req: Request, res: Response) => {
  res.status(405).json({ error: "Method Not Allowed" });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "mock-commerce-adserver" });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Mock Commerce Ad Server running on http://localhost:${PORT}`);
  console.log(`📡 MCP endpoint: POST http://localhost:${PORT}/mcp`);
});
