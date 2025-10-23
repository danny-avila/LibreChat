import { Document, Types } from 'mongoose';
import type { McpServer } from 'librechat-data-provider';

/**
 * Mongoose document interface for MCP Server
 * Extends API interface with Mongoose-specific database fields
 */
export interface MCPServerDocument extends Omit<McpServer, 'author'>, Document {
  author: Types.ObjectId; // ObjectId reference in DB (vs string in API)
}
