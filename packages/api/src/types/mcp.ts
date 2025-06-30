import type { TUser, MCP } from 'librechat-data-provider';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: TUser;
}

export interface MCPRequest extends AuthenticatedRequest {
  body: MCP;
}

export interface MCPParamsRequest extends AuthenticatedRequest {
  params: {
    mcp_id: string;
  };
  body: MCP;
}
