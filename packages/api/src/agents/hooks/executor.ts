import { spawn } from 'node:child_process';
import { logger } from '@librechat/data-schemas';
import type { HookOutput, ToolDecision, StopDecision } from '@librechat/agents';
import type { PluginHookCapabilities } from './compatibility';
import type { PluginHookExecutor, PluginHookExecutionRequest } from './runtime';

const MAX_CAPTURED_STREAM_BYTES = 1_048_576;
const MAX_REASON_LENGTH = 2_000;
const MAX_ADDITIONAL_CONTEXT_LENGTH = 32_768;
const KILL_GRACE_MS = 5_000;
const BLOCKING_EXIT_CODE = 2;

const TOOL_DECISIONS: ReadonlySet<string> = new Set<ToolDecision>(['allow', 'deny', 'ask']);
const STOP_DECISIONS: ReadonlySet<string> = new Set<StopDecision>(['continue', 'block']);
const STDOUT_CONTEXT_EVENTS: ReadonlySet<string> = new Set(['SessionStart', 'UserPromptSubmit']);
const PASSTHROUGH_ENV_VARS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ'] as const;

/**
 * Capabilities of the command executor, shared by plan time (plugin loading)
 * and run time (hook registration) so a handler the loader marked `ready` is
 * always executable. Matchers pass through untranslated: deployment-plugin
 * hooks address tools by their LibreChat runtime names, so the plugin and
 * runtime namespaces are one and the same.
 */
export const commandExecutorCapabilities: PluginHookCapabilities = {
  handlerTypes: new Set(['command']),
  translateMatcher: ({ matcher }) => matcher,
  sessionLifecycle: true,
};

export interface CommandExecutorOptions {
  /** Filesystem-resolved plugin root; becomes the command's cwd and `PLUGIN_ROOT`. */
  pluginRoot: string;
  /** Persistent per-plugin data directory; becomes `PLUGIN_DATA`. */
  pluginData: string;
  /** Environment source for the allowlist (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
}

interface CommandCompletion {
  code: number | null;
  stdout: string;
  stderr: string;
}

function buildCommandEnv(
  options: CommandExecutorOptions,
  allowedEnvVars: string[] | undefined,
): NodeJS.ProcessEnv {
  const source = options.env ?? process.env;
  const env: NodeJS.ProcessEnv = {
    PLUGIN_ROOT: options.pluginRoot,
    PLUGIN_DATA: options.pluginData,
  };
  for (const name of PASSTHROUGH_ENV_VARS) {
    if (source[name] !== undefined) {
      env[name] = source[name];
    }
  }
  for (const name of allowedEnvVars ?? []) {
    if (source[name] !== undefined) {
      env[name] = source[name];
    }
  }
  return env;
}

/** Agent Plugins §9.2 expansion applied to hook commands: one literal, non-recursive pass. */
function expandVariables(value: string, options: CommandExecutorOptions): string {
  return value.replace(/\$\{(PLUGIN_ROOT|PLUGIN_DATA)\}/g, (_match, name: string) =>
    name === 'PLUGIN_ROOT' ? options.pluginRoot : options.pluginData,
  );
}

interface ShellInvocation {
  executable: string;
  argv: string[];
}

/**
 * POSIX hosts run `bash -c <command>` with `args` bound to `$1..$n`; Windows
 * hosts honor `commandWindows`/`shell: powershell` and fold `args` onto the
 * command line. Handler-declared `shell: powershell` is ignored off-Windows —
 * the portable `command` string is authoritative there.
 */
function buildInvocation(
  request: PluginHookExecutionRequest,
  options: CommandExecutorOptions,
): ShellInvocation | undefined {
  const { handler } = request;
  const isWindows = process.platform === 'win32';
  const rawCommand = isWindows ? (handler.commandWindows ?? handler.command) : handler.command;
  if (!rawCommand?.trim()) {
    return undefined;
  }
  const command = expandVariables(rawCommand, options);
  const args = (handler.args ?? []).map((arg) => expandVariables(arg, options));
  if (isWindows && (handler.shell === 'powershell' || handler.commandWindows !== undefined)) {
    return {
      executable: 'powershell.exe',
      argv: ['-NoLogo', '-NoProfile', '-Command', [command, ...args].join(' ')],
    };
  }
  return { executable: 'bash', argv: ['-c', command, 'bash', ...args] };
}

function appendCapped(current: string, chunk: Buffer): string {
  if (current.length >= MAX_CAPTURED_STREAM_BYTES) {
    return current;
  }
  return (current + chunk.toString('utf8')).slice(0, MAX_CAPTURED_STREAM_BYTES);
}

function runCommand(
  invocation: ShellInvocation,
  payload: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  signal: AbortSignal,
): Promise<CommandCompletion> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.argv, {
      cwd,
      env,
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killTimer: NodeJS.Timeout | undefined;
    const forceKill = () => {
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    };
    signal.addEventListener('abort', forceKill, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk);
    });
    child.on('error', (error) => {
      signal.removeEventListener('abort', forceKill);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', forceKill);
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {
      /* A handler that never reads stdin closes the pipe early; EPIPE is not a failure. */
    });
    child.stdin.end(payload);
  });
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts only the SDK output fields a plugin command may set. Decisions are
 * validated against the target event's legal set; message-injection fields
 * (`injectedMessages`, `allowedDecisions`) stay host-only.
 */
function sanitizeOutput(
  raw: Record<string, unknown>,
  request: PluginHookExecutionRequest,
): HookOutput {
  const output: Record<string, unknown> = {};
  const decisions = request.targetEvent === 'Stop' ? STOP_DECISIONS : TOOL_DECISIONS;
  if (typeof raw.decision === 'string' && decisions.has(raw.decision)) {
    output.decision = raw.decision;
  }
  if (typeof raw.reason === 'string') {
    output.reason = truncate(raw.reason, MAX_REASON_LENGTH);
  }
  if (typeof raw.additionalContext === 'string') {
    output.additionalContext = truncate(raw.additionalContext, MAX_ADDITIONAL_CONTEXT_LENGTH);
  }
  if (request.targetEvent === 'PreToolUse' && isPlainObject(raw.updatedInput)) {
    output.updatedInput = raw.updatedInput;
  }
  if (request.targetEvent === 'PostToolUse' && 'updatedOutput' in raw) {
    output.updatedOutput = raw.updatedOutput;
  }
  if (typeof raw.preventContinuation === 'boolean') {
    output.preventContinuation = raw.preventContinuation;
  }
  if (typeof raw.stopReason === 'string') {
    output.stopReason = truncate(raw.stopReason, MAX_REASON_LENGTH);
  }
  if (raw.async === true) {
    output.async = true;
  }
  return output as HookOutput;
}

function parseCompletion(
  completion: CommandCompletion,
  request: PluginHookExecutionRequest,
): HookOutput {
  const label = `[pluginHooks] ${request.pluginId} ${request.sourceEvent}`;
  if (completion.code === BLOCKING_EXIT_CODE) {
    const reason = truncate(completion.stderr.trim(), MAX_REASON_LENGTH);
    return {
      decision: request.targetEvent === 'Stop' ? 'block' : 'deny',
      ...(reason && { reason }),
    };
  }
  if (completion.code !== 0) {
    logger.warn(
      `${label}: command exited with code ${completion.code}: ${truncate(
        completion.stderr.trim(),
        MAX_REASON_LENGTH,
      )}`,
    );
    return {};
  }
  const stdout = completion.stdout.trim();
  if (!stdout) {
    return {};
  }
  if (stdout.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (isPlainObject(parsed)) {
        return sanitizeOutput(parsed, request);
      }
    } catch (error) {
      logger.warn(`${label}: stdout is not valid JSON and was ignored`, error);
      return {};
    }
  }
  if (STDOUT_CONTEXT_EVENTS.has(request.sourceEvent)) {
    return { additionalContext: truncate(stdout, MAX_ADDITIONAL_CONTEXT_LENGTH) };
  }
  return {};
}

/**
 * Runs `command` hook handlers as child processes outside the LibreChat API
 * process, mirroring Claude Code's contract: the event payload arrives as
 * JSON on stdin, exit 0 with JSON stdout returns a (sanitized) hook output,
 * exit 2 blocks with stderr as the reason, and any other exit is logged and
 * ignored. Commands run from the plugin root with a minimal allowlisted
 * environment plus `PLUGIN_ROOT`/`PLUGIN_DATA`.
 *
 * SECURITY: deployment plugins are operator-installed code, the same trust
 * level as `toolApproval.hooks` modules. Execution is additionally gated on
 * the `DEPLOYMENT_PLUGIN_HOOKS` environment opt-in (see `plugins/runtime`).
 */
export function createCommandExecutor(options: CommandExecutorOptions): PluginHookExecutor {
  return {
    capabilities: commandExecutorCapabilities,
    async execute(request, signal) {
      const invocation = buildInvocation(request, options);
      if (invocation === undefined) {
        return {};
      }
      const env = buildCommandEnv(options, request.handler.allowedEnvVars);
      const payload = JSON.stringify(request.payload);
      try {
        const completion = await runCommand(invocation, payload, env, options.pluginRoot, signal);
        return parseCompletion(completion, request);
      } catch (error) {
        if (signal.aborted) {
          logger.warn(`[pluginHooks] ${request.pluginId} ${request.sourceEvent}: command aborted`);
          return {};
        }
        logger.warn(
          `[pluginHooks] ${request.pluginId} ${request.sourceEvent}: command failed to run`,
          error,
        );
        return {};
      }
    },
  };
}
