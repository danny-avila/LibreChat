import { PermissionBits } from '../accessPermissions';
import type { MCPOptions, MCPServerUserInput } from '../mcp';

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
 * Response for MCP server list endpoint
 */
export type MCPServerDBObjectResponse = {
  _id?: string;
  mcp_id?: string;
  author?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  effectivePermissions?: PermissionBits;
} & MCPOptions;

export type MCPServersListResponse = Record<string, MCPServerDBObjectResponse>;
