import type { MCPOptions } from '../mcp';

/**
 * Base MCP Server interface
 * Core structure shared between API and database layers
 */
export interface IMcpServer {
  mcp_id: string;
  title: string;
  options: MCPOptions;
  author?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * User-managed MCP Server (standalone, not attached to agent)
 * API type for frontend/backend communication
 * Similar to Agent type - includes populated author fields
 */
export type McpServer = IMcpServer;

/**
 * Parameters for creating a new user-managed MCP server
 */
export type McpServerCreateParams = {
  title: string;
  options: MCPOptions;
};

/**
 * Parameters for updating an existing user-managed MCP server
 */
export type McpServerUpdateParams = {
  title?: string;
  options?: MCPOptions;
};

/**
 * Parameters for listing user-managed MCP servers
 */
export type McpServerListParams = {
  limit?: number;
  cursor?: string;
  search?: string;
};

/**
 * Response for MCP server list endpoint
 */
export type McpServerListResponse = {
  object: string;
  data: McpServer[];
  first_id: string | null;
  last_id: string | null;
  has_more: boolean;
  after?: string | null;
};
