import fs from 'fs';
import os from 'os';
import path from 'path';
import { HookRegistry, executeHooks } from '@librechat/agents';
import { PLUGIN_MANIFEST_SCHEMA_ID } from './constants';
import { initializeDeploymentPlugins } from './deployment';
import {
  getDeploymentPluginHookCapabilities,
  registerDeploymentPluginHooks,
  hasDeploymentPluginHooks,
} from './runtime';

let base: string;
let pluginsDir: string;
let dataDir: string;

const HOOKS_DOCUMENT = {
  hooks: {
    PreToolUse: [
      {
        matcher: '^write_file$',
        hooks: [
          {
            type: 'command',
            command: `printf '%s' '{"decision":"deny","reason":"guarded"}'`,
          },
        ],
      },
    ],
    SessionStart: [
      {
        hooks: [{ type: 'command', command: 'echo started >> "$PLUGIN_DATA/starts.log"' }],
      },
    ],
  },
};

async function writePlugin(name: string): Promise<void> {
  const root = path.join(pluginsDir, name);
  await fs.promises.mkdir(path.join(root, 'ai.librechat', 'hooks'), { recursive: true });
  await fs.promises.writeFile(
    path.join(root, 'plugin.json'),
    JSON.stringify({ $schema: PLUGIN_MANIFEST_SCHEMA_ID, name }),
  );
  await fs.promises.writeFile(
    path.join(root, 'ai.librechat', 'hooks', 'hooks.json'),
    JSON.stringify(HOOKS_DOCUMENT),
  );
}

async function initialize(): Promise<void> {
  await initializeDeploymentPlugins({
    projectRoot: base,
    env: {
      DEPLOYMENT_PLUGINS_DIR: pluginsDir,
      DEPLOYMENT_PLUGIN_DATA_DIR: dataDir,
    },
    hookCapabilities: getDeploymentPluginHookCapabilities({ DEPLOYMENT_PLUGIN_HOOKS: 'true' }),
  });
}

async function fireRunStart(sessionId: string): Promise<void> {
  const registry = new HookRegistry();
  registerDeploymentPluginHooks({ registry, context: { sessionId } });
  await executeHooks({
    registry,
    input: { hook_event_name: 'RunStart', runId: `run-${Math.random()}`, messages: [] },
  });
}

beforeEach(async () => {
  base = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lc-plugin-runtime-')),
  );
  pluginsDir = path.join(base, 'plugin');
  dataDir = path.join(base, 'data');
  await fs.promises.mkdir(pluginsDir, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(base, { recursive: true, force: true });
  /** Unconfigured missing directories reset the module registry to empty. */
  await initializeDeploymentPlugins({ projectRoot: base, env: {} });
});

describe('getDeploymentPluginHookCapabilities', () => {
  it('returns undefined unless DEPLOYMENT_PLUGIN_HOOKS is enabled', () => {
    expect(getDeploymentPluginHookCapabilities({})).toBeUndefined();
    expect(
      getDeploymentPluginHookCapabilities({ DEPLOYMENT_PLUGIN_HOOKS: 'false' }),
    ).toBeUndefined();
    expect(
      getDeploymentPluginHookCapabilities({ DEPLOYMENT_PLUGIN_HOOKS: 'true' })?.handlerTypes.has(
        'command',
      ),
    ).toBe(true);
  });
});

describe('registerDeploymentPluginHooks', () => {
  it('registers nothing when plugins loaded without hook capabilities', async () => {
    await writePlugin('inert');
    await initializeDeploymentPlugins({
      projectRoot: base,
      env: { DEPLOYMENT_PLUGINS_DIR: pluginsDir, DEPLOYMENT_PLUGIN_DATA_DIR: dataDir },
    });
    expect(hasDeploymentPluginHooks()).toBe(false);
    const registry = new HookRegistry();
    expect(registerDeploymentPluginHooks({ registry })).toBe(0);
  });

  it('executes a plugin command hook end-to-end through a run hook registry', async () => {
    await writePlugin('guard');
    await initialize();
    expect(hasDeploymentPluginHooks()).toBe(true);

    const registry = new HookRegistry();
    const registered = registerDeploymentPluginHooks({
      registry,
      context: { sessionId: 'conversation-1' },
    });
    expect(registered).toBe(2);

    const result = await executeHooks({
      registry,
      matchQuery: 'write_file',
      input: {
        hook_event_name: 'PreToolUse',
        runId: 'run-1',
        toolName: 'write_file',
        toolInput: { path: '/etc/passwd' },
        toolUseId: 'tool-1',
      },
    });
    expect(result).toEqual(expect.objectContaining({ decision: 'deny', reason: 'guarded' }));

    const unmatched = await executeHooks({
      registry,
      matchQuery: 'read_file',
      input: {
        hook_event_name: 'PreToolUse',
        runId: 'run-1',
        toolName: 'read_file',
        toolInput: {},
        toolUseId: 'tool-2',
      },
    });
    expect(unmatched.decision).toBeUndefined();
  });

  it('fires SessionStart once per conversation across separate runs', async () => {
    await writePlugin('session');
    await initialize();

    await fireRunStart('conversation-a');
    await fireRunStart('conversation-a');
    await fireRunStart('conversation-b');

    const log = await fs.promises.readFile(path.join(dataDir, 'session', 'starts.log'), 'utf8');
    expect(log.trim().split('\n')).toHaveLength(2);
  });
});
