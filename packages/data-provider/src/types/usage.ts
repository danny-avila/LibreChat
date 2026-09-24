import type { RefillIntervalUnit } from '../balance';

/** Widest window the admin usage rollup will aggregate in one request. */
export const USAGE_MAX_RANGE_DAYS = 366;

/**
 * Most `{ user, model, month }` rows one usage request will return. The rollups in
 * `TUsageTotals` are computed server-side over the whole range, so the cap only ever
 * truncates the per-user detail table — never a total.
 */
export const USAGE_MAX_ROWS = 1000;

/**
 * Spenders kept by the `byUser` rollup. That rollup is computed over the whole range before
 * any cap applies, so this bounds a leaderboard rather than truncating a total: the entries
 * it returns are the highest spenders and each figure is exact.
 */
export const USAGE_MAX_USERS = 100;

export type TUsageParams = {
  /** ISO 8601 instant; defaults to the first day of the current calendar month. */
  from?: string;
  /** ISO 8601 instant; defaults to now. */
  to?: string;
  timeZone?: string;
  userId?: string;
};

/**
 * Every usage figure is *spend*: the rollup reads `tokenValue`/`rawAmount` as magnitudes
 * because spend is stored as a negative ledger delta, and it excludes `tokenType: 'credits'`
 * rows, so balance grants and auto-refills are never counted as money spent.
 */
export type TUsageAmounts = {
  credits: number;
  tokens: number;
  transactions: number;
};

/** One `{ user, model, month }` bucket of the monthly usage rollup. */
export type TUsageMonthlyRow = TUsageAmounts & {
  userId: string;
  name: string;
  email: string;
  /** Role held by the user at read time, `''` when the user no longer exists. */
  role: string;
  model: string;
  /** Calendar month key (`YYYY-MM`) in the requested time zone. */
  month: string;
};

export type TUsageModelTotal = TUsageAmounts & {
  model: string;
};

export type TUsageMonthTotal = TUsageAmounts & {
  /** Calendar month key (`YYYY-MM`) in the requested time zone. */
  month: string;
};

export type TUsageRoleTotal = TUsageAmounts & {
  role: string;
  /** Distinct users of this role that spent anything in the range. */
  users: number;
};

/** One spender's total across the whole range, identity joined at read time. */
export type TUsageUserTotal = TUsageAmounts & {
  userId: string;
  name: string;
  email: string;
  /** Role held by the user at read time, `''` when the user no longer exists. */
  role: string;
};

export type TUsageTotals = TUsageAmounts & {
  models: TUsageModelTotal[];
  /** Ascending by month, so a trend reads left to right. */
  byMonth: TUsageMonthTotal[];
  byRole: TUsageRoleTotal[];
  /** Highest spenders first, at most `USAGE_MAX_USERS`; every figure covers the whole range. */
  byUser: TUsageUserTotal[];
};

export type TUsageResponse = {
  from: string;
  to: string;
  timeZone: string;
  rows: TUsageMonthlyRow[];
  /** `rows` was truncated to `rowLimit`; `totals` still covers the whole range. */
  rowsCapped: boolean;
  rowLimit: number;
  totals: TUsageTotals;
};

/** Balance record as returned by the admin API (no Mongoose internals). */
export type TAdminBalance = {
  userId: string;
  tokenCredits: number;
  autoRefillEnabled: boolean;
  refillIntervalValue: number;
  refillIntervalUnit: RefillIntervalUnit;
  refillAmount: number;
  lastRefill?: string;
};

/** Balance joined with its owner's identity for the admin balances table. */
export type TAdminBalanceListItem = TAdminBalance & {
  name: string;
  email: string;
  role: string;
};

export type TAdminBalanceResponse = {
  balance: TAdminBalance;
};

export type TAdminBalanceListResponse = {
  balances: TAdminBalanceListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type TAdminBalanceTopUpResponse = TAdminBalanceResponse & {
  /** Credits applied by this operation; negative for a deduction. */
  credits: number;
};
