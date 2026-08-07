/** Proof scope that binds a discovered MCP catalog to its exact authority inputs. */
export interface MCPToolCatalogScope {
  tenant: string;
  principal: string;
  server: string;
  policy: string;
  config: string;
  credentials: string;
}
