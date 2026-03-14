import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';

export interface SovereignProxyDependencies {
  sovereignProxyUrl: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    _id: Types.ObjectId;
    federatedTokens?: {
      access_token?: string;
    };
  };
}

function getZitadelToken(req: AuthenticatedRequest): string | undefined {
  return req.user?.federatedTokens?.access_token;
}

function requireZitadelToken(
  req: AuthenticatedRequest,
  res: Response,
): string | null {
  const token = getZitadelToken(req);
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No Zitadel token available. Please re-authenticate.',
    });
    return null;
  }
  return token;
}

async function forwardProxyError(
  label: string,
  defaultMessage: string,
  proxyResponse: globalThis.Response,
  res: Response,
): Promise<void> {
  const errorData = await proxyResponse.json().catch(() => ({}));
  logger.error(`[${label}] Sovereign proxy error:`, {
    status: proxyResponse.status,
    error: errorData,
  });
  res.status(proxyResponse.status).json({
    error: 'Proxy error',
    message: errorData.error?.message || defaultMessage,
  });
}

export function createSovereignProxyHandlers(deps: SovereignProxyDependencies) {
  async function listKeys(req: AuthenticatedRequest, res: Response) {
    const token = requireZitadelToken(req, res);
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${deps.sovereignProxyUrl}/api/me/keys`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return forwardProxyError(
          'listKeys',
          'Failed to fetch API keys from sovereign proxy',
          response,
          res,
        );
      }

      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      logger.error('[listKeys] Error fetching keys from sovereign proxy:', error);
      res.status(502).json({
        error: 'Proxy unavailable',
        message: 'Failed to connect to sovereign proxy',
      });
    }
  }

  async function createKey(req: AuthenticatedRequest, res: Response) {
    const token = requireZitadelToken(req, res);
    if (!token) {
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '' || name.trim().length > 255) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'API key name is required and must be 255 characters or less',
      });
      return;
    }

    try {
      const response = await fetch(`${deps.sovereignProxyUrl}/api/me/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        return forwardProxyError(
          'createKey',
          'Failed to create API key via sovereign proxy',
          response,
          res,
        );
      }

      const data = await response.json();
      res.status(201).json(data);
    } catch (error) {
      logger.error('[createKey] Error creating key via sovereign proxy:', error);
      res.status(502).json({
        error: 'Proxy unavailable',
        message: 'Failed to connect to sovereign proxy',
      });
    }
  }

  async function deleteKey(req: AuthenticatedRequest, res: Response) {
    const token = requireZitadelToken(req, res);
    if (!token) {
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'API key ID is required',
      });
      return;
    }

    try {
      const response = await fetch(`${deps.sovereignProxyUrl}/api/me/keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return forwardProxyError(
          'deleteKey',
          'Failed to delete API key via sovereign proxy',
          response,
          res,
        );
      }

      res.status(204).send();
    } catch (error) {
      logger.error('[deleteKey] Error deleting key via sovereign proxy:', error);
      res.status(502).json({
        error: 'Proxy unavailable',
        message: 'Failed to connect to sovereign proxy',
      });
    }
  }

  return {
    listKeys,
    createKey,
    deleteKey,
  };
}
