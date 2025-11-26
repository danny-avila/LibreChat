import type { MCPOptions } from '../mcp';

/**
 * Base MCP Server interface
 * Core structure shared between API and database layers
 */
export interface IMCPServerDB {
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
export type MCPServerDB = IMCPServerDB;
