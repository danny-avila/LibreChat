import { logger } from '@librechat/data-schemas';
import type { HookRegistry, HookOutput } from '@librechat/agents';
import type {
  PluginHookExecutionRequest,
  PluginHookRuntimeContext,
  PluginHookCapabilities,
  PluginHookExecutor,
  PluginHookHandler,
} from '~/agents/hooks';
import type { LoadedPlugin } from './types';
import {
  commandExecutorCapabilities,
  createCommandExecutor,
  registerPluginHooks,
} from '~/agents/hooks';
import { getDeploymentPluginRegistry } from './deployment';
import { DEPLOYMENT_PLUGIN_HOOKS_ENV } from './constants';
import { isEnabled } from '~/utils/common';

const MAX_TRACKED_FIRINGS = 10_000;
const KEY_SEPARATOR = '\u0000';

/**
 * Hook registration is per-run, so the runtime's own SessionStart and `once`
 * dedup only spans one run. This process-wide FIFO extends both across runs
 * of the same conversation. Per-process by design: a multi-replica deployment
 * fires once per replica per conversation, which over-fires rather than
 * drops. Keys are scoped to the authenticated user so caller-supplied
 * conversation ids cannot collide across principals, and to the handler so
 * one handler firing never suppresses a sibling declared on the same event.
 */
const firedOnceKeys = new Set<string>();

function markFiredOnce(key: string): boolean {
  if (firedOnceKeys.has(key)) {
    return false;
  }
  if (firedOnceKeys.size >= MAX_TRACKED_FIRINGS) {
    const oldest = firedOnceKeys.values().next().value;
    if (oldest !== undefined) {
      firedOnceKeys.delete(oldest);
    }
  }
  firedOnceKeys.add(key);
  return true;
}

function handlerIdentity(handler: PluginHookHandler): string {
  return JSON.stringify(
    Object.entries(handler).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function onceKey(
  pluginId: string,
  userId: string | undefined,
  request: PluginHookExecutionRequest,
): string {
  return [
    userId ?? '',
    pluginId,
    request.payload.session_id,
    request.sourceEvent,
    String(request.groupIndex ?? ''),
    String(request.handlerIndex ?? ''),
    handlerIdentity(request.handler),
  ].join(KEY_SEPARATOR);
}

function withOnceDedup(
  pluginId: string,
  userId: string | undefined,
  executor: PluginHookExecutor,
): PluginHookExecutor {
  return {
    capabilities: executor.capabilities,
    execute(request, signal): HookOutput | Promise<HookOutput> {
      const oncePerSession =
        request.sourceEvent === 'SessionStart' || request.handler.once === true;
      if (oncePerSession && !markFiredOnce(onceKey(pluginId, userId, request))) {
        return {};
      }
      return executor.execute(request, signal);
    },
  };
}

/**
 * Capabilities handed to plugin loading when the operator has opted in to
 * hook execution via `DEPLOYMENT_PLUGIN_HOOKS`. Undefined (the default) keeps
 * hook documents parsed-but-inert, with the existing "not executed" warning.
 */
export function getDeploymentPluginHookCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): PluginHookCapabilities | undefined {
  return isEnabled(env[DEPLOYMENT_PLUGIN_HOOKS_ENV]) ? commandExecutorCapabilities : undefined;
}

function getExecutableHookPlugins(): LoadedPlugin[] {
  return getDeploymentPluginRegistry()
    .list()
    .filter((plugin) => (plugin.hooks?.plan.summary.ready ?? 0) > 0);
}

export function hasDeploymentPluginHooks(): boolean {
  return getExecutableHookPlugins().length > 0;
}

export interface RegisterDeploymentPluginHooksOptions {
  registry: HookRegistry;
  context?: PluginHookRuntimeContext;
  /**
   * Whether the run has a HITL approval surface (checkpointer + resume route).
   * Off by default: without it a plugin's `ask` decision is tightened to
   * `deny`, since an un-resumable interrupt would strand the run.
   */
  askDecisionSupported?: boolean;
}

/**
 * Registers every loaded deployment plugin's ready hooks onto a run's hook
 * registry. Called once per run from the run-construction seam; the registry
 * (and with it every registration) is garbage-collected with the run.
 * Returns the number of handlers registered.
 */
export function registerDeploymentPluginHooks(
  options: RegisterDeploymentPluginHooksOptions,
): number {
  let registered = 0;
  for (const plugin of getExecutableHookPlugins()) {
    const document = plugin.hooks?.document;
    if (document === undefined) {
      continue;
    }
    const pluginId = plugin.manifest.name;
    const executor = withOnceDedup(
      pluginId,
      options.context?.userId,
      createCommandExecutor({
        pluginRoot: plugin.root,
        pluginData: plugin.dataDirectory,
        allowAskDecision: options.askDecisionSupported === true,
      }),
    );
    try {
      const registration = registerPluginHooks({
        pluginId,
        registry: options.registry,
        document,
        executor,
        context: { ...options.context, cwd: plugin.root },
      });
      registered += registration.registered;
    } catch (error) {
      logger.error(`[pluginHooks] Failed to register hooks for plugin "${pluginId}"`, error);
    }
  }
  return registered;
}
