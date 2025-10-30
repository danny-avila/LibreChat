import type { MCPOptions, MCPServerUserInput } from '../mcp';

/**
 * Base MCP Server interface
 * Core structure shared between API and database layers
 */
export interface IMcpServer {
  _id?: string; // MongoDB ObjectId (used for ACL/permissions)
  mcp_id: string;
  config: MCPOptions;
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
 * Note: Only UI-editable fields are allowed (excludes server-managed fields)
 */
export type McpServerCreateParams = {
  config: MCPServerUserInput; // UI fields only (title, description, url, oauth, iconPath)
};

/**
 * Parameters for updating an existing user-managed MCP server
 * Note: Only UI-editable fields are allowed (excludes server-managed fields)
 */
export type McpServerUpdateParams = {
  config?: MCPServerUserInput; // UI fields only (title, description, url, oauth, iconPath)
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
