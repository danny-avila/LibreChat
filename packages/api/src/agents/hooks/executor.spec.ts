import fs from 'fs';
import os from 'os';
import path from 'path';
import type { HookInput, HookEvent } from '@librechat/agents';
import type { PluginHookExecutionRequest } from './runtime';
import type { PluginHookHandler } from './schema';
import { commandExecutorCapabilities, createCommandExecutor } from './executor';

let pluginRoot: string;
let pluginData: string;

const PRE_TOOL_INPUT: HookInput = {
  hook_event_name: 'PreToolUse',
  runId: 'run-1',
  threadId: 'thread-1',
  toolName: 'write_file',
  toolInput: { path: '/workspace/file.ts' },
  toolUseId: 'tool-1',
};

function request(
  handler: PluginHookHandler,
  overrides: Partial<Omit<PluginHookExecutionRequest, 'handler'>> = {},
): PluginHookExecutionRequest {
  return {
    pluginId: 'demo',
    sourceEvent: 'PreToolUse',
    targetEvent: 'PreToolUse' as HookEvent,
    handler,
    input: PRE_TOOL_INPUT,
    payload: {
      hook_event_name: 'PreToolUse',
      session_id: 'conversation-1',
      run_id: 'run-1',
      tool_name: 'write_file',
      tool_input: { path: '/workspace/file.ts' },
      tool_use_id: 'tool-1',
    },
    ...overrides,
  };
}

function execute(
  handler: PluginHookHandler,
  overrides: Partial<Omit<PluginHookExecutionRequest, 'handler'>> = {},
  env: NodeJS.ProcessEnv = { PATH: process.env.PATH },
  executorOptions: { allowAskDecision?: boolean } = {},
) {
  const executor = createCommandExecutor({ pluginRoot, pluginData, env, ...executorOptions });
  return executor.execute(request(handler, overrides), new AbortController().signal);
}

beforeEach(async () => {
  const base = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lc-hook-exec-')),
  );
  pluginRoot = path.join(base, 'root');
  pluginData = path.join(base, 'data');
  await fs.promises.mkdir(pluginRoot, { recursive: true });
  await fs.promises.mkdir(pluginData, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(path.dirname(pluginRoot), { recursive: true, force: true });
});

describe('createCommandExecutor', () => {
  test('advertises the plan-time capabilities', () => {
    const executor = createCommandExecutor({ pluginRoot, pluginData });
    expect(executor.capabilities).toBe(commandExecutorCapabilities);
    expect(executor.capabilities.handlerTypes.has('command')).toBe(true);
    expect(
      executor.capabilities.translateMatcher?.({
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        matcher: 'write_file|execute_code',
      }),
    ).toBe('write_file|execute_code');
  });

  test('translates Claude tool aliases in matchers and payload names', () => {
    const executor = createCommandExecutor({ pluginRoot, pluginData });
    expect(
      executor.capabilities.translateMatcher?.({
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        matcher: 'Bash|write_file',
      }),
    ).toEqual({ matcher: 'bash_tool|write_file', requiresToolNameTranslation: true });
    expect(
      executor.capabilities.toPluginToolName?.({
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        toolName: 'bash_tool',
      }),
    ).toBe('Bash');
    expect(
      executor.capabilities.toPluginToolName?.({
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        toolName: 'my_mcp_tool',
      }),
    ).toBe('my_mcp_tool');
  });

  test('translates Claude aliases inside regex-form matchers or rejects unsafe ones', () => {
    const translate = (matcher: string) =>
      createCommandExecutor({ pluginRoot, pluginData }).capabilities.translateMatcher?.({
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        matcher,
      });
    expect(translate('^Bash$')).toEqual({
      matcher: '^bash_tool$',
      requiresToolNameTranslation: true,
    });
    expect(translate('^(Write|Edit)$')).toEqual({
      matcher: '^(create_file|edit_file)$',
      requiresToolNameTranslation: true,
    });
    expect(translate('Bashful|write_file')).toBe('Bashful|write_file');
    expect(translate('[Bash]')).toBeUndefined();
    expect(translate('Bash\\d')).toBeUndefined();
  });

  test('returns sanitized JSON stdout and drops host-only or invalid fields', async () => {
    const output = await execute({
      type: 'command',
      command: `printf '%s' '{"decision":"deny","reason":"blocked","injectedMessages":[{"content":"x"}],"allowedDecisions":["approve"],"updatedInput":{"path":"/evil"},"extra":1}'`,
    });
    expect(output).toEqual({ decision: 'deny', reason: 'blocked' });
  });

  test('receives the Claude-shaped payload on stdin', async () => {
    const output = await execute({
      type: 'command',
      command: `node -e 'let d="";process.stdin.on("data",(c)=>{d+=c;}).on("end",()=>{const p=JSON.parse(d);console.log(JSON.stringify({reason:p.tool_name+":"+p.session_id}));});'`,
    });
    expect(output).toEqual({ reason: 'write_file:conversation-1' });
  });

  test('maps exit code 2 to a blocking decision with stderr as the reason', async () => {
    const output = await execute({
      type: 'command',
      command: `echo 'writes to protected paths are refused' >&2; exit 2`,
    });
    expect(output).toEqual({ decision: 'deny', reason: 'writes to protected paths are refused' });
  });

  test('maps exit code 2 on Stop to a block decision', async () => {
    const output = await execute(
      { type: 'command', command: 'exit 2' },
      { sourceEvent: 'Stop', targetEvent: 'Stop' },
    );
    expect(output).toEqual({ decision: 'block' });
  });

  test('maps exit code 2 on events without a decision channel to preventContinuation', async () => {
    const handler: PluginHookHandler = { type: 'command', command: 'echo halted >&2; exit 2' };
    await expect(
      execute(handler, { sourceEvent: 'UserPromptSubmit', targetEvent: 'UserPromptSubmit' }),
    ).resolves.toEqual({ decision: 'deny', reason: 'halted' });
    await expect(
      execute(handler, { sourceEvent: 'PostToolUse', targetEvent: 'PostToolUse' }),
    ).resolves.toEqual({ preventContinuation: true, stopReason: 'halted' });
    await expect(
      execute(handler, { sourceEvent: 'SessionStart', targetEvent: 'RunStart' }),
    ).resolves.toEqual({ preventContinuation: true, stopReason: 'halted' });
  });

  test('tightens ask decisions to deny unless the run supports approvals', async () => {
    const handler: PluginHookHandler = {
      type: 'command',
      command: `printf '%s' '{"decision":"ask","reason":"confirm"}'`,
    };
    await expect(execute(handler)).resolves.toEqual({ decision: 'deny', reason: 'confirm' });
    await expect(
      execute(handler, {}, { PATH: process.env.PATH }, { allowAskDecision: true }),
    ).resolves.toEqual({ decision: 'ask', reason: 'confirm' });
  });

  test('returns an empty output when the payload cannot be serialized', async () => {
    const output = await execute(
      { type: 'command', command: 'echo unreachable' },
      {
        sourceEvent: 'PostToolUse',
        targetEvent: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          session_id: 'conversation-1',
          run_id: 'run-1',
          tool_response: BigInt(1),
        },
      },
    );
    expect(output).toEqual({});
  });

  test('accepts stop decisions only for Stop and tool decisions only elsewhere', async () => {
    const handler: PluginHookHandler = {
      type: 'command',
      command: `printf '%s' '{"decision":"block"}'`,
    };
    await expect(execute(handler)).resolves.toEqual({});
    await expect(execute(handler, { sourceEvent: 'Stop', targetEvent: 'Stop' })).resolves.toEqual({
      decision: 'block',
    });
  });

  test('ignores non-blocking failures', async () => {
    const output = await execute({ type: 'command', command: 'echo oops >&2; exit 1' });
    expect(output).toEqual({});
  });

  test('runs from the plugin root with PLUGIN_ROOT, PLUGIN_DATA, and only allowlisted vars', async () => {
    const output = await execute(
      {
        type: 'command',
        command: `printf '{"reason":"%s|%s|%s|%s|%s"}' "$PWD" "$PLUGIN_ROOT" "$PLUGIN_DATA" "$ALLOWED_TOKEN" "\${SECRET_TOKEN:-absent}"`,
        allowedEnvVars: ['ALLOWED_TOKEN', 'PLUGIN_ROOT'],
      },
      {},
      {
        PATH: process.env.PATH,
        ALLOWED_TOKEN: 'granted',
        SECRET_TOKEN: 's3cret',
        PLUGIN_ROOT: '/poisoned/by/host/env',
      },
    );
    expect(output).toEqual({
      reason: `${pluginRoot}|${pluginRoot}|${pluginData}|granted|absent`,
    });
  });

  test('expands PLUGIN_ROOT/PLUGIN_DATA placeholders in the command and binds args to $1..$n', async () => {
    const output = await execute({
      type: 'command',
      command: 'printf \'{"reason":"%s %s"}\' "$1" "${PLUGIN_DATA}"',
      args: ['${PLUGIN_ROOT}/scripts/check.sh'],
    });
    expect(output).toEqual({
      reason: `${path.join(pluginRoot, 'scripts/check.sh')} ${pluginData}`,
    });
  });

  test('treats non-JSON stdout as context for prompt-shaped events and ignores it elsewhere', async () => {
    const handler: PluginHookHandler = { type: 'command', command: 'echo loaded project notes' };
    await expect(
      execute(handler, { sourceEvent: 'UserPromptSubmit', targetEvent: 'UserPromptSubmit' }),
    ).resolves.toEqual({ additionalContext: 'loaded project notes' });
    await expect(execute(handler)).resolves.toEqual({});
  });

  test('returns an empty output when the signal aborts a running command', async () => {
    const controller = new AbortController();
    const executor = createCommandExecutor({
      pluginRoot,
      pluginData,
      env: { PATH: process.env.PATH },
    });
    const pending = executor.execute(
      request({ type: 'command', command: 'sleep 30 & wait' }),
      controller.signal,
    );
    setTimeout(() => controller.abort(), 50);
    await expect(pending).resolves.toEqual({});
  });

  test('returns an empty output when the handler has no runnable command', async () => {
    const output = await execute({ type: 'command', command: '   ' });
    expect(output).toEqual({});
  });
});
