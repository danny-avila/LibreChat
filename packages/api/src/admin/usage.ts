import { logger } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

export interface AdminUsageUserSummary {
  user: string;
  name?: string;
  email?: string;
  totalCost: number;
  transactionCount: number;
}

export interface AdminUsageSummaryResult {
  items: AdminUsageUserSummary[];
  total: number;
}

export interface AdminUsageDeps {
  getUserUsageSummary: (params: {
    startDate?: Date;
    endDate?: Date;
    limit: number;
    offset: number;
  }) => Promise<AdminUsageSummaryResult>;
}

function parseDateParam(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function createAdminUsageHandlers(deps: AdminUsageDeps): {
  getUsageSummary: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const { getUserUsageSummary } = deps;

  async function getUsageSummaryHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const startDate = parseDateParam(req.query.startDate);
      const endDate = parseDateParam(req.query.endDate);

      const { items, total } = await getUserUsageSummary({ startDate, endDate, limit, offset });

      return res.status(200).json({ items, total, limit, offset });
    } catch (error) {
      logger.error('[adminUsage] getUsageSummary error:', error);
      return res.status(500).json({ error: 'Failed to load usage summary' });
    }
  }

  return {
    getUsageSummary: getUsageSummaryHandler,
  };
}
