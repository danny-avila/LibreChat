import { spawn } from 'node:child_process';
import { logger } from '@librechat/data-schemas';
import type { HookOutput, ToolDecision, StopDecision } from '@librechat/agents';
import type { PluginHookExecutor, PluginHookExecutionRequest } from './runtime';
import type { PluginHookCapabilities } from './compatibility';

const MAX_CAPTURED_STREAM_BYTES = 1_048_576;
const MAX_REASON_LENGTH = 2_000;
const MAX_ADDITIONAL_CONTEXT_LENGTH = 32_768;
const KILL_GRACE_MS = 5_000;
const BLOCKING_EXIT_CODE = 2;

const TOOL_DECISIONS: ReadonlySet<string> = new Set<ToolDecision>(['allow', 'deny', 'ask']);
const STOP_DECISIONS: ReadonlySet<string> = new Set<StopDecision>(['continue', 'block']);
const DENY_DECISION_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'UserPromptSubmit',
  'SubagentStart',
]);
const STDOUT_CONTEXT_EVENTS: ReadonlySet<string> = new Set(['SessionStart', 'UserPromptSubmit']);
const PASSTHROUGH_ENV_VARS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ'] as const;

/**
 * Claude-compatible tool aliases mapped to their LibreChat runtime names.
 * Without this a plugin authored against Claude's namespace (`Bash`, `Write`)
 * would plan as ready yet register a matcher that never fires — a silently
 * bypassed guard. Names outside the table pass through verbatim, since the
 * runtime namespace is open-ended (MCP and per-agent tools).
 */
const RUNTIME_TOOL_BY_PLUGIN: ReadonlyMap<string, string> = new Map([
  ['Bash', 'bash_tool'],
  ['Write', 'create_file'],
  ['Edit', 'edit_file'],
  ['Read', 'read_file'],
]);
const PLUGIN_TOOL_BY_RUNTIME: ReadonlyMap<string, string> = new Map(
  Array.from(RUNTIME_TOOL_BY_PLUGIN, ([plugin, runtime]) => [runtime, plugin]),
);

/**
 * Capabilities of the command executor, shared by plan time (plugin loading)
 * and run time (hook registration) so a handler the loader marked `ready` is
 * always executable. Exact matcher values translate through the Claude alias
 * table above; payload `tool_name`s are presented in the plugin's namespace
 * (the Claude alias where one exists) for both translated and native
 * matchers, so one hook script works unchanged across both.
 */
export const commandExecutorCapabilities: PluginHookCapabilities = {
  handlerTypes: new Set(['command']),
  translateMatcher: ({ matcher }) => {
    let translated = false;
    const mapped = matcher
      .split('|')
      .map((value) => {
        const runtime = RUNTIME_TOOL_BY_PLUGIN.get(value);
        if (runtime === undefined) {
          return value;
        }
        translated = true;
        return runtime;
      })
      .join('|');
    return translated ? { matcher: mapped, requiresToolNameTranslation: true } : matcher;
  },
  toPluginToolName: ({ toolName }) => PLUGIN_TOOL_BY_RUNTIME.get(toolName) ?? toolName,
  sessionLifecycle: true,
};

export interface CommandExecutorOptions {
  /** Filesystem-resolved plugin root; becomes the command's cwd and `PLUGIN_ROOT`. */
  pluginRoot: string;
  /** Persistent per-plugin data directory; becomes `PLUGIN_DATA`. */
  pluginData: string;
  /** Environment source for the allowlist (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /**
   * Whether `ask` decisions can raise a resumable approval interrupt. Off by
   * default: without a HITL surface an `ask` is tightened to `deny` so a
   * plugin's confirmation intent still blocks rather than stranding the run.
   */
  allowAskDecision?: boolean;
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
  const env: NodeJS.ProcessEnv = {};
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
  /** Reserved names win last so an allowlist entry can never override them. */
  env.PLUGIN_ROOT = options.pluginRoot;
  env.PLUGIN_DATA = options.pluginData;
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
    const quotedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`);
    return {
      executable: 'powershell.exe',
      argv: ['-NoLogo', '-NoProfile', '-Command', [command, ...quotedArgs].join(' ')],
    };
  }
  return { executable: 'bash', argv: ['-c', command, 'bash', ...args] };
}

interface CapturedStream {
  chunks: Buffer[];
  bytes: number;
}

function appendCapped(stream: CapturedStream, chunk: Buffer): void {
  const remaining = MAX_CAPTURED_STREAM_BYTES - stream.bytes;
  if (remaining <= 0) {
    return;
  }
  const kept = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
  stream.chunks.push(kept);
  stream.bytes += kept.byteLength;
}

function capturedText(stream: CapturedStream): string {
  return Buffer.concat(stream.chunks).toString('utf8');
}

/**
 * POSIX children detach into their own process group so an abort can kill the
 * whole tree — a hook that launches descendants (`worker & wait`) would
 * otherwise leave them running with the captured stdio open. Windows has no
 * group kill; `child.kill()` is the best available fallback there.
 */
function killTree(child: ReturnType<typeof spawn>, killSignal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && typeof child.pid === 'number') {
    try {
      process.kill(-child.pid, killSignal);
      return;
    } catch {
      /* The group may already be gone; fall through to the direct kill. */
    }
  }
  child.kill(killSignal);
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
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: CapturedStream = { chunks: [], bytes: 0 };
    const stderr: CapturedStream = { chunks: [], bytes: 0 };
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      killTree(child, 'SIGTERM');
      killTimer = setTimeout(() => killTree(child, 'SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      appendCapped(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      appendCapped(stderr, chunk);
    });
    child.on('error', (error) => {
      signal.removeEventListener('abort', onAbort);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      clearTimeout(killTimer);
      resolve({ code, stdout: capturedText(stdout), stderr: capturedText(stderr) });
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
 * (`injectedMessages`, `allowedDecisions`) stay host-only. `updatedInput` is
 * also host-only: hooks in one dispatch all receive the original arguments,
 * so a plugin rewrite would reach the tool without the approval policy ever
 * re-evaluating it.
 */
function sanitizeOutput(
  raw: Record<string, unknown>,
  request: PluginHookExecutionRequest,
  options: CommandExecutorOptions,
): HookOutput {
  const output: Record<string, unknown> = {};
  const decisions = request.targetEvent === 'Stop' ? STOP_DECISIONS : TOOL_DECISIONS;
  if (typeof raw.decision === 'string' && decisions.has(raw.decision)) {
    output.decision =
      raw.decision === 'ask' && options.allowAskDecision !== true ? 'deny' : raw.decision;
  }
  if (typeof raw.reason === 'string') {
    output.reason = truncate(raw.reason, MAX_REASON_LENGTH);
  }
  if (typeof raw.additionalContext === 'string') {
    output.additionalContext = truncate(raw.additionalContext, MAX_ADDITIONAL_CONTEXT_LENGTH);
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
  options: CommandExecutorOptions,
): HookOutput {
  const label = `[pluginHooks] ${request.pluginId} ${request.sourceEvent}`;
  if (completion.code === BLOCKING_EXIT_CODE) {
    const reason = truncate(completion.stderr.trim(), MAX_REASON_LENGTH);
    if (request.targetEvent === 'Stop') {
      return { decision: 'block', ...(reason && { reason }) };
    }
    if (DENY_DECISION_EVENTS.has(request.targetEvent)) {
      return { decision: 'deny', ...(reason && { reason }) };
    }
    /** Events with no decision channel block by preventing the next model turn. */
    return { preventContinuation: true, ...(reason && { stopReason: reason }) };
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
        return sanitizeOutput(parsed, request, options);
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
      if (invocation === undefined || signal.aborted) {
        return {};
      }
      const env = buildCommandEnv(options, request.handler.allowedEnvVars);
      let payload: string;
      try {
        payload = JSON.stringify(request.payload);
      } catch (error) {
        logger.warn(
          `[pluginHooks] ${request.pluginId} ${request.sourceEvent}: payload could not be serialized`,
          error,
        );
        return {};
      }
      try {
        const completion = await runCommand(invocation, payload, env, options.pluginRoot, signal);
        if (signal.aborted) {
          logger.warn(`[pluginHooks] ${request.pluginId} ${request.sourceEvent}: command aborted`);
          return {};
        }
        return parseCompletion(completion, request, options);
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
