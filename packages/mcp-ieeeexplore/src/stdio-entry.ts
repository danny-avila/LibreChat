import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createServer, { configSchema } from "./index.js";

async function main() {
  const config = configSchema.parse({
    IEEE_API_KEY: process.env.IEEE_API_KEY,
    IEEE_AUTH_TOKEN: process.env.IEEE_AUTH_TOKEN || undefined,
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
