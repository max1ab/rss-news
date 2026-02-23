import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { loadConfig } from "./config.js"
import { createServer } from "./mcp/server.js"

async function main() {
  const config = loadConfig()
  const { server } = createServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error("Failed to start RSS MCP server:", error)
  process.exit(1)
})
