import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createServer, { configSchema } from "./index.js";

async function main() {
  const config = configSchema.parse({
    SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY || undefined,
    WILEY_TDM_CLIENT_TOKEN: process.env.WILEY_TDM_CLIENT_TOKEN || undefined,
    debug: process.env.DEBUG === "true",
  });

  const server = createServer({ config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
