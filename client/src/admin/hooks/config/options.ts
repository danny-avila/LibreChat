import type * as t from '~/admin/types';

const NO_OPTIONS: t.OptionSourceResult = { options: [], isLoading: false };

/**
 * Options for a reference select: configured endpoints, an endpoint's models,
 * MCP servers, spec groups or tools (stub: no options yet; WS9 implements it,
 * WS3's RefSelectField consumes it).
 */
export function useOptionSources(_source?: t.OptionSource): t.OptionSourceResult {
  return NO_OPTIONS;
}
