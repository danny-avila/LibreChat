import { ErrorTypes } from 'librechat-data-provider';
import type { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export interface UserKeyHandlerDependencies {
  updateUserKey: (params: {
    userId: string;
    name: string;
    value: string;
    expiresAt?: Date | string | null;
  }) => Promise<unknown>;
  deleteUserKey: (params: { userId: string; name?: string; all?: boolean }) => Promise<unknown>;
  getUserKeyExpiry: (params: {
    userId: string;
    name: string;
  }) => Promise<{ expiresAt: Date | string | 'never' | null }>;
  getUserKeyValues: (params: { userId: string; name: string }) => Promise<Record<string, string>>;
}

function readStringQuery(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMissingUserKey(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes(ErrorTypes.NO_USER_KEY) || msg.includes(ErrorTypes.INVALID_USER_KEY);
}

export function createUserKeyHandlers(deps: UserKeyHandlerDependencies): {
  update: (req: AuthenticatedRequest, res: Response) => Promise<Response | undefined>;
  remove: (req: AuthenticatedRequest, res: Response) => Promise<Response | undefined>;
  removeAll: (req: AuthenticatedRequest, res: Response) => Promise<Response | undefined>;
  get: (req: AuthenticatedRequest, res: Response) => Promise<Response | undefined>;
} {
  async function update(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response | undefined> {
    if (req.body == null || typeof req.body !== 'object') {
      return res.status(400).send({ error: 'Invalid request body.' });
    }

    const { name, value, expiresAt } = req.body as {
      name: string;
      value: string;
      expiresAt?: string;
    };
    await deps.updateUserKey({ userId: req.user?.id ?? '', name, value, expiresAt });
    res.status(201).send();
  }

  async function remove(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response | undefined> {
    await deps.deleteUserKey({ userId: req.user?.id ?? '', name: req.params.name });
    res.status(204).send();
  }

  async function removeAll(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response | undefined> {
    if (req.query.all !== 'true') {
      return res.status(400).send({ error: 'Specify either all=true to delete.' });
    }

    await deps.deleteUserKey({ userId: req.user?.id ?? '', all: true });
    res.status(204).send();
  }

  async function get(req: AuthenticatedRequest, res: Response): Promise<Response | undefined> {
    const name = readStringQuery(req.query.name);
    const includeValues = req.query.includeValues === 'true';
    const response = await deps.getUserKeyExpiry({ userId: req.user?.id ?? '', name });

    if (!includeValues || !name) {
      return res.status(200).send(response);
    }

    try {
      const values = await deps.getUserKeyValues({ userId: req.user?.id ?? '', name });
      return res.status(200).send({ ...response, values });
    } catch (error) {
      if (!isMissingUserKey(error)) {
        throw error;
      }
      return res.status(200).send(response);
    }
  }

  return {
    update,
    remove,
    removeAll,
    get,
  };
}
