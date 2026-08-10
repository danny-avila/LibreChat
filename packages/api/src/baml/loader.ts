import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '@librechat/data-schemas';
import type { BamlFunctionSet } from '@librechat/agents/baml';

/**
 * The one place CommonJS crosses into the BAML runtime.
 *
 * `@boundaryml/baml-bridge` publishes an `import` condition only, and the
 * generated SDK initializes native bytecode at module scope. Both must stay out
 * of `@librechat/api`'s ordinary graph, or every non-BAML boot would load the
 * native runtime and require BAML credentials. So the import here is
 * deliberately NON-STATIC — the documented exception to this package's no-dynamic-
 * import rule, and the reason the facade lives in `dist/baml/runtime.mjs` rather
 * than behind a package export.
 */

interface BamlRuntimeOptions {
  readonly clientName: string;
  readonly onDiagnostic?: (diagnostic: {
    readonly clientName: string;
    readonly stage: string;
    readonly detail: string;
  }) => void;
}

interface BamlRuntimeModule {
  createBamlFunctionSet(options: BamlRuntimeOptions): BamlFunctionSet;
}

const RUNTIME_LOAD_FAILED =
  'The BAML runtime could not be loaded on this server. Rebuild @librechat/api and restart.';

/**
 * Bundled, `__dirname` is `dist`, so the facade sits at `dist/baml/runtime.mjs`.
 * Run from source (Jest), `__dirname` is `src/baml`, and the built facade is two
 * levels up — resolving both means a source-side test can drive the REAL runtime
 * instead of a stand-in.
 */
const runtimeUrl = (): string => {
  const fromSource = __dirname.endsWith(path.join('src', 'baml'));
  const target = fromSource
    ? path.join(__dirname, '..', '..', 'dist', 'baml', 'runtime.mjs')
    : path.join(__dirname, 'baml', 'runtime.mjs');
  return pathToFileURL(target).href;
};

/**
 * Cached forever, success or failure.
 *
 * Success caching is the point: concurrent initializations share one ESM graph.
 * Failure caching is not a shortcut — Node caches a failed ESM evaluation for the
 * same URL, so a corrected deployment needs a process restart regardless.
 * Pretending otherwise by clearing this would just produce a second, more
 * confusing error. Per-invocation worker and provider failures are NOT cached
 * here; they happen inside a call, and the next request gets a fresh worker.
 */
let runtimeModule: Promise<BamlRuntimeModule> | null = null;

const loadRuntime = (): Promise<BamlRuntimeModule> => {
  if (runtimeModule != null) {
    return runtimeModule;
  }
  const url = runtimeUrl();
  runtimeModule = (import(/* webpackIgnore: true */ url) as Promise<BamlRuntimeModule>).catch(
    (error: unknown) => {
      logger.error('[BAML] failed to load the compiled runtime facade', error);
      throw new Error(RUNTIME_LOAD_FAILED);
    },
  );
  // A cached rejection is still a rejection; keep Node from reporting it as
  // unhandled before the first caller awaits it.
  runtimeModule.catch(() => undefined);
  return runtimeModule;
};

/**
 * Builds the port for one selected logical client.
 *
 * The name is NOT validated against the compiled registry here: doing so would
 * mean loading the generated graph in the parent, which is exactly what this
 * boundary exists to avoid. An unknown name becomes a sanitized turn-level
 * `model_error` on the first turn instead.
 */
export const createBamlFunctions = async (clientName: string): Promise<BamlFunctionSet> => {
  const runtime = await loadRuntime();
  return runtime.createBamlFunctionSet({
    clientName,
    onDiagnostic: ({ stage, detail }) => {
      logger.warn(`[BAML] ${clientName} ${stage}: ${detail}`);
    },
  });
};

/** Test-only: lets a suite prove the module is loaded once and cached. */
export const __resetBamlRuntimeCacheForTests = (): void => {
  runtimeModule = null;
};
