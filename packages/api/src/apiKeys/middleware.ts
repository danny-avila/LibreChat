import { logger } from '@librechat/data-schemas';
import { ResourceType, PermissionBits, hasPermissions } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import { getRemoteAgentPermissions } from './service';

export interface ApiKeyAuthDependencies {
  validateAgentApiKey: (apiKey: string) => Promise<{
    userId: Types.ObjectId;
    keyId: Types.ObjectId;
  } | null>;
  findUser: (query: { _id: string | Types.ObjectId }) => Promise<IUser | null>;
}

export interface RemoteAgentAccessDependencies {
  getAgent: (query: {
    id: string;
  }) => Promise<{ _id: Types.ObjectId; [key: string]: unknown } | null>;
  getEffectivePermissions: (params: {
    userId: string;
    role?: string;
    resourceType: ResourceType;
    resourceId: string | Types.ObjectId;
  }) => Promise<number>;
}

export interface ApiKeyAuthRequest extends Request {
  user?: IUser & { id: string };
  apiKeyId?: Types.ObjectId;
}

export interface RemoteAgentAccessRequest extends ApiKeyAuthRequest {
  agent?: { _id: Types.ObjectId; [key: string]: unknown };
  agentPermissions?: number;
}

export function createRequireApiKeyAuth(deps: ApiKeyAuthDependencies) {
  return async (req: ApiKeyAuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Missing or invalid Authorization header. Expected: Bearer <api_key>',
          type: 'invalid_request_error',
          code: 'missing_api_key',
        },
      });
    }

    const apiKey = authHeader.slice(7);

    if (!apiKey || apiKey.trim() === '') {
      return res.status(401).json({
        error: {
          message: 'API key is required',
          type: 'invalid_request_error',
          code: 'missing_api_key',
        },
      });
    }

    try {
      const keyValidation = await deps.validateAgentApiKey(apiKey);

      if (!keyValidation) {
        return res.status(401).json({
          error: {
            message: 'Invalid API key',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        });
      }

      const user = await deps.findUser({ _id: keyValidation.userId });

      if (!user) {
        return res.status(401).json({
          error: {
            message: 'User not found for this API key',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        });
      }

      user.id = (user._id as Types.ObjectId).toString();
      req.user = user as IUser & { id: string };
      req.apiKeyId = keyValidation.keyId;

      next();
    } catch (error) {
      logger.error('[requireApiKeyAuth] Error validating API key:', error);
      return res.status(500).json({
        error: {
          message: 'Internal server error during authentication',
          type: 'server_error',
          code: 'internal_error',
        },
      });
    }
  };
}

export function createCheckRemoteAgentAccess(deps: RemoteAgentAccessDependencies) {
  return async (req: RemoteAgentAccessRequest, res: Response, next: NextFunction) => {
    const agentId = req.body?.model || req.params?.model;

    if (!agentId) {
      return res.status(400).json({
        error: {
          message: 'Model (agent ID) is required',
          type: 'invalid_request_error',
          code: 'missing_model',
        },
      });
    }

    try {
      const agent = await deps.getAgent({ id: agentId });

      if (!agent) {
        return res.status(404).json({
          error: {
            message: `Agent not found: ${agentId}`,
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        });
      }

      const userId = req.user?.id || '';

      const permissions = await getRemoteAgentPermissions(deps, userId, req.user?.role, agent._id);

      if (!hasPermissions(permissions, PermissionBits.VIEW)) {
        return res.status(403).json({
          error: {
            message: `No remote access to agent: ${agentId}`,
            type: 'permission_error',
            code: 'access_denied',
          },
        });
      }

      req.agent = agent;
      req.agentPermissions = permissions;

      next();
    } catch (error) {
      logger.error('[checkRemoteAgentAccess] Error checking agent access:', error);
      return res.status(500).json({
        error: {
          message: 'Internal server error while checking agent access',
          type: 'server_error',
          code: 'internal_error',
        },
      });
    }
  };
}
