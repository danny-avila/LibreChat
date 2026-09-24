import { USAGE_MAX_RANGE_DAYS, USAGE_MAX_ROWS } from 'librechat-data-provider';
import {
  logger,
  dateKey,
  validTimeZone,
  endOfZonedDate,
  startOfZonedDate,
  isValidObjectIdString,
  calendarDayDifference,
} from '@librechat/data-schemas';
import type { MonthlyUsageResult } from '@librechat/data-schemas';
import type { TUsageTotals } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

export interface AdminUsageDeps {
  getMonthlyUsage: (options: {
    from: Date;
    to: Date;
    timeZone?: string;
    tenantId?: string;
    userId?: string;
    limit?: number;
  }) => Promise<MonthlyUsageResult>;
  getUsageTotals: (options: {
    from: Date;
    to: Date;
    timeZone?: string;
    tenantId?: string;
    userId?: string;
  }) => Promise<TUsageTotals>;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** A bare `YYYY-MM-DD` means a calendar day in `timeZone`, not UTC midnight. */
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseInstant(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Callers send either a full ISO instant or a calendar day. A day is resolved here rather
 * than in the browser so the zone arithmetic has exactly one implementation.
 */
function parseBoundary(value: string, timeZone: string, edge: 'start' | 'end'): Date | null {
  if (!DATE_KEY_PATTERN.test(value)) {
    return parseInstant(value);
  }
  const resolved =
    edge === 'start' ? startOfZonedDate(value, timeZone) : endOfZonedDate(value, timeZone);
  return Number.isFinite(resolved.getTime()) ? resolved : null;
}

/** First instant of the current calendar month in `timeZone`. */
function startOfCurrentMonth(now: Date, timeZone: string): Date {
  const [year, month] = dateKey(now, timeZone).split('-');
  return startOfZonedDate(`${year}-${month}-01`, timeZone);
}

export function createAdminUsageHandlers(deps: AdminUsageDeps): {
  getUsage: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const { getMonthlyUsage, getUsageTotals } = deps;

  async function getUsageHandler(req: ServerRequest, res: Response) {
    try {
      const timeZone = validTimeZone(stringParam(req.query.timeZone));
      const rawFrom = stringParam(req.query.from);
      const rawTo = stringParam(req.query.to);
      const userId = stringParam(req.query.userId);

      if (userId && !isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const now = new Date();
      const from = rawFrom
        ? parseBoundary(rawFrom, timeZone, 'start')
        : startOfCurrentMonth(now, timeZone);
      const to = rawTo ? parseBoundary(rawTo, timeZone, 'end') : now;

      if (!from) {
        return res.status(400).json({ error: 'Query parameter "from" is not a valid date' });
      }
      if (!to) {
        return res.status(400).json({ error: 'Query parameter "to" is not a valid date' });
      }
      if (from > to) {
        return res.status(400).json({ error: 'Query parameter "from" must precede "to"' });
      }

      const spannedDays = calendarDayDifference(dateKey(from, timeZone), dateKey(to, timeZone)) + 1;
      if (spannedDays > USAGE_MAX_RANGE_DAYS) {
        return res
          .status(400)
          .json({ error: `Range must not exceed ${USAGE_MAX_RANGE_DAYS} days` });
      }

      const tenantId = req.user?.tenantId;
      const [monthly, totals] = await Promise.all([
        getMonthlyUsage({ from, to, timeZone, tenantId, userId, limit: USAGE_MAX_ROWS }),
        getUsageTotals({ from, to, timeZone, tenantId, userId }),
      ]);

      return res.status(200).json({
        from: from.toISOString(),
        to: to.toISOString(),
        timeZone,
        rows: monthly.rows,
        rowsCapped: monthly.capped,
        rowLimit: USAGE_MAX_ROWS,
        totals,
      });
    } catch (error) {
      logger.error('[adminUsage] getUsage error:', error);
      return res.status(500).json({ error: 'Failed to read usage' });
    }
  }

  return { getUsage: getUsageHandler };
}
