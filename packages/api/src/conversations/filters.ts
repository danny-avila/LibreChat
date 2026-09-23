import type { Request } from 'express';

/**
 * A conversation-list request carries user input straight into a database query, so the
 * facets are parsed here rather than in the route: one place decides what a valid filter
 * is, and the route keeps only the call.
 */
export interface ConversationListFilters {
  updatedAfter?: Date;
  createdAfter?: Date;
  endpoints?: string[];
  hasFiles?: boolean;
  sharedOnly?: boolean;
}

export interface ConversationListFilterResult {
  filters: ConversationListFilters;
  /** Set when the request is malformed; the route answers 400 with it. */
  error?: string;
}

/**
 * How many endpoints one request may name. The list is a fixed menu of the endpoints a
 * deployment serves, so a request naming more than this is not a user choosing filters:
 * it is an unbounded `$in` arriving from somewhere else.
 */
const MAX_ENDPOINT_FILTERS = 50;

/** One endpoint name. Long enough for a custom endpoint, short enough to bound the query. */
const MAX_ENDPOINT_LENGTH = 128;

const firstValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const parseDate = (value: unknown): { date?: Date; invalid?: boolean } => {
  const raw = firstValue(value);
  if (raw == null || raw === '') {
    return {};
  }
  if (typeof raw !== 'string') {
    return { invalid: true };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { invalid: true };
  }
  return { date };
};

const parseEndpoints = (value: unknown): { endpoints?: string[]; invalid?: boolean } => {
  if (value == null) {
    return {};
  }
  const raw = Array.isArray(value) ? value : [value];
  const endpoints: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      return { invalid: true };
    }
    const trimmed = entry.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed.length > MAX_ENDPOINT_LENGTH) {
      return { invalid: true };
    }
    /** Repeated values would widen the `$in` without widening the result. */
    if (!endpoints.includes(trimmed)) {
      endpoints.push(trimmed);
    }
  }
  if (endpoints.length === 0) {
    return {};
  }
  if (endpoints.length > MAX_ENDPOINT_FILTERS) {
    return { invalid: true };
  }
  return { endpoints };
};

/**
 * Reads the list facets off a request query. An absent facet is left undefined so the
 * query builder can tell "not filtering" from "filtering on nothing", and anything
 * malformed fails the request rather than being silently dropped: a filter that is
 * quietly ignored shows the user more conversations than they asked to see.
 */
export function parseConversationListFilters(
  query: Request['query'] | Record<string, unknown>,
): ConversationListFilterResult {
  const updated = parseDate(query.updatedAfter);
  if (updated.invalid === true) {
    return { filters: {}, error: 'updatedAfter must be an ISO 8601 date' };
  }

  const created = parseDate(query.createdAfter);
  if (created.invalid === true) {
    return { filters: {}, error: 'createdAfter must be an ISO 8601 date' };
  }

  const endpoints = parseEndpoints(query.endpoints);
  if (endpoints.invalid === true) {
    return {
      filters: {},
      error: `endpoints must be at most ${MAX_ENDPOINT_FILTERS} names of ${MAX_ENDPOINT_LENGTH} characters or fewer`,
    };
  }

  const filters: ConversationListFilters = {};
  if (updated.date) {
    filters.updatedAfter = updated.date;
  }
  if (created.date) {
    filters.createdAfter = created.date;
  }
  if (endpoints.endpoints) {
    filters.endpoints = endpoints.endpoints;
  }
  /** Only the positive case is a filter: "false" means the user is not filtering. */
  if (firstValue(query.hasFiles) === 'true') {
    filters.hasFiles = true;
  }
  if (firstValue(query.sharedOnly) === 'true') {
    filters.sharedOnly = true;
  }

  return { filters };
}
