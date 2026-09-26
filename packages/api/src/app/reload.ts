import isEqual from 'lodash/isEqual';
import isPlainObject from 'lodash/isPlainObject';
import { logger } from '@librechat/data-schemas';
import { getMaxSubagents, setMaxSubagents } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { ConfigReloadError } from './loader';

const CONFIG_GENERATION_KEY = 'config:generation';
const DEFAULT_GENERATION_POLL_MS = 1_000;

const RESTART_ONLY_PATHS = [
  'cloudfront',
  'fileStrategies',
  'fileStrategy',
  'mcpServers',
  'rateLimits',
  'secureImageLinks',
  'endpoints.agents.backgroundTasks',
  'endpoints.agents.eventDriven',
  'endpoints.agents.toolApproval',
] as const;

const PARTIAL_RESTART_PATHS = [
  'registration.openidDiscovery',
  'registration.oauthStateTtlMs',
  'registration.socialLogins',
  'interface.agents',
  'interface.bookmarks',
  'interface.fileCitations',
  'interface.fileSearch',
  'interface.marketplace',
  'interface.mcpServers',
  'interface.memories',
  'interface.multiConvo',
  'interface.peoplePicker',
  'interface.prompts',
  'interface.remoteAgents',
  'interface.runCode',
  'interface.schedules',
  'interface.sharedLinks',
  'interface.skills',
  'interface.temporaryChat',
  'interface.webSearch',
] as const;

export type ConfigSectionStatus = 'applied_live' | 'restart_required' | 'unchanged';

export interface ConfigSectionReport {
  section: string;
  status: ConfigSectionStatus;
  restartRequired: boolean;
  restartRequiredPaths?: string[];
}

export interface ConfigReloadResult {
  scope: 'cluster' | 'local' | 'unchanged';
  distributed: boolean;
  generation?: number;
  propagationError?: string;
  sections: ConfigSectionReport[];
}

export interface ConfigGenerationStore {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
}

export interface ConfigGenerationChange {
  acknowledge(): void;
}

export interface ConfigGenerationTracker {
  readonly distributed: boolean;
  check(): Promise<ConfigGenerationChange | undefined>;
  bump(): Promise<number | undefined>;
}

export interface ConfigGenerationTrackerOptions {
  pollIntervalMs?: number;
  now?: () => number;
}

export interface ConfigReloaderDeps {
  loadConfig: () => Promise<TCustomConfig | null>;
  buildBaseConfig: (config: TCustomConfig) => Promise<AppConfig>;
  getBaseConfig: () => Promise<AppConfig>;
  replaceBaseConfig: (config: AppConfig) => Promise<AppConfig>;
  clearOverrideCache: () => Promise<void>;
  generation: ConfigGenerationTracker;
}

function hasPathPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}

function matchesAnyPath(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => hasPathPrefix(path, prefix));
}

function collectChangedPaths(previous: unknown, next: unknown, path: string): string[] {
  if (isEqual(previous, next)) {
    return [];
  }
  const previousIsObject = isPlainObject(previous);
  const nextIsObject = isPlainObject(next);
  if ((!previousIsObject && previous != null) || (!nextIsObject && next != null)) {
    return [path];
  }
  if (!previousIsObject && !nextIsObject) {
    return [path];
  }

  const previousObject = previousIsObject ? (previous as Record<string, unknown>) : {};
  const nextObject = nextIsObject ? (next as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(previousObject), ...Object.keys(nextObject)]);
  return [...keys]
    .sort()
    .flatMap((key) =>
      collectChangedPaths(previousObject[key], nextObject[key], path ? `${path}.${key}` : key),
    );
}

export function createConfigReloadReport(
  previous: TCustomConfig,
  next: TCustomConfig,
): ConfigSectionReport[] {
  const sections = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...sections].sort().map((section) => {
    const changedPaths = collectChangedPaths(
      previous[section as keyof TCustomConfig],
      next[section as keyof TCustomConfig],
      section,
    );
    if (changedPaths.length === 0) {
      return { section, status: 'unchanged', restartRequired: false };
    }

    const restartRequiredPaths = changedPaths.filter(
      (path) =>
        matchesAnyPath(path, RESTART_ONLY_PATHS) || matchesAnyPath(path, PARTIAL_RESTART_PATHS),
    );
    const restartOnly = changedPaths.every((path) => matchesAnyPath(path, RESTART_ONLY_PATHS));
    return {
      section,
      status: restartOnly ? 'restart_required' : 'applied_live',
      restartRequired: restartRequiredPaths.length > 0,
      ...(restartRequiredPaths.length > 0 ? { restartRequiredPaths } : {}),
    };
  });
}

export function createConfigGenerationTracker(
  store?: ConfigGenerationStore | null,
  options: ConfigGenerationTrackerOptions = {},
): ConfigGenerationTracker {
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? DEFAULT_GENERATION_POLL_MS);
  const now = options.now ?? Date.now;
  let seenGeneration: string | undefined;
  let nextPollAt = 0;
  let checkFlight: Promise<ConfigGenerationChange | undefined> | undefined;

  async function readGeneration(): Promise<ConfigGenerationChange | undefined> {
    const generation = (await store!.get(CONFIG_GENERATION_KEY)) ?? '0';
    if (seenGeneration == null) {
      seenGeneration = generation;
      return undefined;
    }
    if (generation === seenGeneration) {
      return undefined;
    }
    const previousGeneration = seenGeneration;
    return {
      acknowledge() {
        if (seenGeneration === previousGeneration) {
          seenGeneration = generation;
        }
      },
    };
  }

  async function check(): Promise<ConfigGenerationChange | undefined> {
    if (!store) {
      return undefined;
    }
    if (checkFlight) {
      return checkFlight;
    }
    if (now() < nextPollAt) {
      return undefined;
    }

    nextPollAt = now() + pollIntervalMs;
    const flight = readGeneration();
    checkFlight = flight;
    try {
      return await flight;
    } finally {
      if (checkFlight === flight) {
        checkFlight = undefined;
      }
    }
  }

  async function bump(): Promise<number | undefined> {
    if (!store) {
      return undefined;
    }
    const generation = await store.incr(CONFIG_GENERATION_KEY);
    seenGeneration = String(generation);
    nextPollAt = now() + pollIntervalMs;
    return generation;
  }

  return { distributed: store != null, check, bump };
}

export function createConfigReloader(deps: ConfigReloaderDeps): () => Promise<ConfigReloadResult> {
  let reloadFlight: Promise<ConfigReloadResult> | undefined;

  async function reload(): Promise<ConfigReloadResult> {
    const current = await deps.getBaseConfig();
    const previousMaxSubagents = getMaxSubagents();
    let installed = false;
    let candidate: TCustomConfig;
    let report: ConfigSectionReport[];
    try {
      const loaded = await deps.loadConfig();
      if (!loaded) {
        throw new ConfigReloadError('The custom configuration could not be loaded.');
      }
      candidate = loaded;
      report = createConfigReloadReport((current.config ?? {}) as TCustomConfig, candidate);
      if (report.every((section) => section.status === 'unchanged')) {
        return {
          scope: 'unchanged',
          distributed: deps.generation.distributed,
          sections: report,
        };
      }

      const next = await deps.buildBaseConfig(candidate);
      await deps.replaceBaseConfig(next);
      installed = true;
      await deps.clearOverrideCache();
    } catch (error) {
      if (installed) {
        await deps
          .replaceBaseConfig(current)
          .catch((rollbackError) =>
            logger.error(
              '[configReload] Failed to restore the previous base config:',
              rollbackError,
            ),
          );
      }
      setMaxSubagents(previousMaxSubagents);
      throw error;
    }

    try {
      const generation = await deps.generation.bump();
      if (generation == null) {
        return { scope: 'local', distributed: false, sections: report };
      }
      return { scope: 'cluster', distributed: true, generation, sections: report };
    } catch (error) {
      logger.error('[configReload] Failed to publish the config generation:', error);
      return {
        scope: 'local',
        distributed: false,
        propagationError: 'Redis generation update failed',
        sections: report,
      };
    }
  }

  return async function reloadConfig(): Promise<ConfigReloadResult> {
    if (reloadFlight) {
      return reloadFlight;
    }
    const flight = reload();
    reloadFlight = flight;
    try {
      return await flight;
    } finally {
      if (reloadFlight === flight) {
        reloadFlight = undefined;
      }
    }
  };
}
