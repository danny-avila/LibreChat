import type { LCTool, LCToolRegistry } from '@librechat/agents';
import {
  isBackgroundEligibleToolName,
  isBackgroundRequested,
  stripRunInBackgroundArg,
  injectRunInBackgroundParam,
  stripBackgroundFromToolDefinitions,
  applyBackgroundToolCalls,
  synthesizeBackgroundToolOptions,
  registerBackgroundTaskTool,
  buildBackgroundHandleContent,
  runCheckBackgroundTask,
  backgroundTaskRegistry,
  BackgroundTaskRegistryClass,
  CHECK_BACKGROUND_TASK_NAME,
  RUN_IN_BACKGROUND_ARG,
} from './background';
import { toolOptionsSchema } from './validation';

const mcpDef = (name: string): LCTool =>
  ({
    name,
    description: `${name} description`,
    parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  }) as unknown as LCTool;

describe('isBackgroundEligibleToolName', () => {
  it('excludes direct-path, host-special, code-session, and machinery tools', () => {
    for (const name of [
      'execute_code',
      'bash_tool',
      'read_file',
      'skill',
      'tool_search',
      'run_tools_with_code',
      'run_tools_with_bash',
      'subagent',
      'create_file',
      'edit_file',
      'set_memory',
      'delete_memory',
      'ask_user_question',
      'web_search',
      'file_search',
      'dalle',
      'flux',
      'gemini_image_gen',
      'image_gen_oai',
      'image_edit_oai',
      CHECK_BACKGROUND_TASK_NAME,
      'lc_transfer_to_researcher',
    ]) {
      expect(isBackgroundEligibleToolName(name)).toBe(false);
    }
  });

  it('allows MCP and other event-driven tools', () => {
    for (const name of ['search_mcp_docs', 'lookup_customer', 'fetch_weather']) {
      expect(isBackgroundEligibleToolName(name)).toBe(true);
    }
  });
});

describe('isBackgroundRequested / stripRunInBackgroundArg', () => {
  it('detects the flag only when explicitly true on an object', () => {
    expect(isBackgroundRequested({ [RUN_IN_BACKGROUND_ARG]: true })).toBe(true);
    expect(isBackgroundRequested({ [RUN_IN_BACKGROUND_ARG]: false })).toBe(false);
    expect(isBackgroundRequested({})).toBe(false);
    expect(isBackgroundRequested('run_in_background')).toBe(false);
    expect(isBackgroundRequested(undefined)).toBe(false);
    expect(isBackgroundRequested(null)).toBe(false);
  });

  it('strips the flag without mutating the original', () => {
    const args = { q: 'hi', [RUN_IN_BACKGROUND_ARG]: true };
    const stripped = stripRunInBackgroundArg(args) as Record<string, unknown>;
    expect(stripped).toEqual({ q: 'hi' });
    expect(RUN_IN_BACKGROUND_ARG in args).toBe(true);
  });

  it('returns non-object / flagless args unchanged', () => {
    expect(stripRunInBackgroundArg('str')).toBe('str');
    const noFlag = { q: 'hi' };
    expect(stripRunInBackgroundArg(noFlag)).toBe(noFlag);
  });

  it('handles stringified JSON args', () => {
    expect(isBackgroundRequested('{"run_in_background":true,"q":"x"}')).toBe(true);
    expect(isBackgroundRequested('{"q":"x"}')).toBe(false);
    expect(isBackgroundRequested('not json')).toBe(false);
    expect(stripRunInBackgroundArg('{"run_in_background":true,"q":"x"}')).toEqual({ q: 'x' });
    // flag absent -> string returned unchanged (no shape rewrite)
    expect(stripRunInBackgroundArg('{"q":"x"}')).toBe('{"q":"x"}');
  });
});

describe('injectRunInBackgroundParam', () => {
  it('adds a run_in_background boolean without mutating a frozen def', () => {
    const def = Object.freeze(mcpDef('search_mcp_docs'));
    const injected = injectRunInBackgroundParam(def);
    const props = (injected.parameters as { properties: Record<string, { type: string }> })
      .properties;
    expect(props[RUN_IN_BACKGROUND_ARG]).toEqual(expect.objectContaining({ type: 'boolean' }));
    expect(props.q).toEqual({ type: 'string' });
    // original untouched
    expect(RUN_IN_BACKGROUND_ARG in (def.parameters as { properties: object }).properties).toBe(
      false,
    );
  });

  it('creates an object schema when the tool declares no parameters', () => {
    const def = { name: 'no_params' } as unknown as LCTool;
    const injected = injectRunInBackgroundParam(def);
    const params = injected.parameters as { type: string; properties: Record<string, unknown> };
    expect(params.type).toBe('object');
    expect(params.properties[RUN_IN_BACKGROUND_ARG]).toBeDefined();
  });

  it('is a no-op when the param already exists', () => {
    const def = mcpDef('search_mcp_docs');
    const once = injectRunInBackgroundParam(def);
    const twice = injectRunInBackgroundParam(once);
    expect(twice).toBe(once);
  });
});

describe('applyBackgroundToolCalls', () => {
  it('is a no-op when the capability is disabled', () => {
    const defs = [mcpDef('search_mcp_docs')];
    const registry: LCToolRegistry = new Map();
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: { search_mcp_docs: { run_in_background: true } },
      enabled: false,
    });
    expect(result.enabled).toBe(false);
    expect(result.toolDefinitions).toBe(defs);
    expect(result.backgroundToolNames).toEqual([]);
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(false);
  });

  it('injects only opted-in eligible tools and registers the poll tool', () => {
    const defs = [mcpDef('search_mcp_docs'), mcpDef('lookup_customer')];
    const registry: LCToolRegistry = new Map(defs.map((d) => [d.name, { ...d }]));
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: { search_mcp_docs: { run_in_background: true } },
      enabled: true,
    });
    expect(result.enabled).toBe(true);
    expect(result.backgroundToolNames).toEqual(['search_mcp_docs']);

    const searchDef = result.toolDefinitions.find((d) => d.name === 'search_mcp_docs');
    const lookupDef = result.toolDefinitions.find((d) => d.name === 'lookup_customer');
    expect(
      (searchDef?.parameters as { properties: Record<string, unknown> }).properties[
        RUN_IN_BACKGROUND_ARG
      ],
    ).toBeDefined();
    expect(
      (lookupDef?.parameters as { properties: Record<string, unknown> }).properties[
        RUN_IN_BACKGROUND_ARG
      ],
    ).toBeUndefined();

    expect(result.toolDefinitions.some((d) => d.name === CHECK_BACKGROUND_TASK_NAME)).toBe(true);
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(true);
    // registry entry for the opted-in tool also carries the injected param
    expect(
      (registry.get('search_mcp_docs')?.parameters as { properties: Record<string, unknown> })
        .properties[RUN_IN_BACKGROUND_ARG],
    ).toBeDefined();
  });

  it('does not inject or register when an opted-in tool is excluded', () => {
    const defs = [mcpDef('read_file')];
    const registry: LCToolRegistry = new Map();
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: { read_file: { run_in_background: true } },
      enabled: true,
    });
    expect(result.enabled).toBe(false);
    expect(result.backgroundToolNames).toEqual([]);
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(false);
  });

  it('skips a non-object (string-input) schema without rewriting it', () => {
    const defs = [{ name: 'legacy_tool', parameters: { type: 'string' } } as unknown as LCTool];
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: new Map(),
      toolOptions: { legacy_tool: { run_in_background: true } },
      enabled: true,
    });
    expect(result.enabled).toBe(false);
    expect(result.backgroundToolNames).toEqual([]);
    expect((result.toolDefinitions[0].parameters as { type: string }).type).toBe('string');
  });

  it('skips a tool that already declares its own run_in_background param', () => {
    const defs = [
      {
        name: 'owns_it',
        parameters: { type: 'object', properties: { run_in_background: { type: 'boolean' } } },
      } as unknown as LCTool,
    ];
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: new Map(),
      toolOptions: { owns_it: { run_in_background: true } },
      enabled: true,
    });
    expect(result.enabled).toBe(false);
    expect(result.backgroundToolNames).toEqual([]);
  });
});

describe('stripBackgroundFromToolDefinitions', () => {
  it('removes the poll tool and the injected param (self-spawn sanitization)', () => {
    const injected = injectRunInBackgroundParam(mcpDef('search_mcp_docs'));
    const withPoll = registerBackgroundTaskTool({
      toolRegistry: new Map(),
      toolDefinitions: [injected],
    }).toolDefinitions;
    const stripped = stripBackgroundFromToolDefinitions(withPoll, ['search_mcp_docs']);
    expect(stripped.some((d) => d.name === CHECK_BACKGROUND_TASK_NAME)).toBe(false);
    const search = stripped.find((d) => d.name === 'search_mcp_docs');
    expect(
      (search?.parameters as { properties: Record<string, unknown> }).properties[
        RUN_IN_BACKGROUND_ARG
      ],
    ).toBeUndefined();
  });
});

describe('registerBackgroundTaskTool', () => {
  it('adds the poll tool once (idempotent)', () => {
    const registry: LCToolRegistry = new Map();
    const first = registerBackgroundTaskTool({ toolRegistry: registry, toolDefinitions: [] });
    expect(first.toolDefinitions).toHaveLength(1);
    const second = registerBackgroundTaskTool({
      toolRegistry: registry,
      toolDefinitions: first.toolDefinitions,
    });
    expect(second.toolDefinitions).toHaveLength(1);
  });

  it('reserves the name: shadows a colliding non-poll tool with the host poll schema', () => {
    const collidingDef = {
      name: CHECK_BACKGROUND_TASK_NAME,
      description: 'a user MCP tool that happens to share the name',
      parameters: { type: 'object', properties: {} },
    } as unknown as LCTool;
    const registry: LCToolRegistry = new Map([[CHECK_BACKGROUND_TASK_NAME, { ...collidingDef }]]);
    const result = registerBackgroundTaskTool({
      toolRegistry: registry,
      toolDefinitions: [collidingDef],
    });
    const matching = result.toolDefinitions.filter((d) => d.name === CHECK_BACKGROUND_TASK_NAME);
    expect(matching).toHaveLength(1);
    // the surviving def/registry entry is the host poll tool, not the user's
    expect(matching[0].description).not.toBe(collidingDef.description);
    expect(registry.get(CHECK_BACKGROUND_TASK_NAME)?.description).not.toBe(
      collidingDef.description,
    );
  });
});

describe('synthesizeBackgroundToolOptions', () => {
  it('returns undefined when disabled', () => {
    expect(synthesizeBackgroundToolOptions(['search_mcp_docs'], false)).toBeUndefined();
  });

  it('marks only eligible tools (excludes code/HITL/attachment built-ins)', () => {
    const options = synthesizeBackgroundToolOptions(
      ['search_mcp_docs', 'execute_code', 'ask_user_question', 'web_search', 'lookup_customer'],
      true,
    );
    expect(options).toEqual({
      search_mcp_docs: { run_in_background: true },
      lookup_customer: { run_in_background: true },
    });
  });

  it('returns undefined when nothing is eligible', () => {
    expect(synthesizeBackgroundToolOptions(['execute_code', 'skill'], true)).toBeUndefined();
  });
});

describe('BackgroundTaskRegistryClass', () => {
  it('creates, completes, and reads a task', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_1',
      toolName: 'search_mcp_docs',
    });
    expect('atCapacity' in created).toBe(false);
    if ('atCapacity' in created) {
      return;
    }
    expect(created.isNew).toBe(true);
    expect(created.task.status).toBe('running');

    registry.complete('u1', 'c1', created.task.id, { content: 'DONE', hasArtifact: false });
    const task = registry.get('u1', 'c1', created.task.id);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('DONE');
    expect(task?.progress).toBe(1);
  });

  it('is idempotent within the same run (never double-dispatches on replay)', () => {
    const registry = new BackgroundTaskRegistryClass();
    const first = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_dup',
      toolName: 'search_mcp_docs',
      runId: 'run-A',
    });
    const second = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_dup',
      toolName: 'search_mcp_docs',
      runId: 'run-A',
    });
    if ('atCapacity' in first || 'atCapacity' in second) {
      throw new Error('unexpected capacity');
    }
    expect(second.isNew).toBe(false);
    expect(second.task.id).toBe(first.task.id);
  });

  it('does NOT collide when the same provider toolCallId repeats in a later run/turn', () => {
    const registry = new BackgroundTaskRegistryClass();
    const turn1 = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_0',
      toolName: 'search_mcp_docs',
      runId: 'run-turn-1',
    });
    const turn2 = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_0',
      toolName: 'search_mcp_docs',
      runId: 'run-turn-2',
    });
    if ('atCapacity' in turn1 || 'atCapacity' in turn2) {
      throw new Error('unexpected capacity');
    }
    expect(turn2.isNew).toBe(true);
    expect(turn2.task.id).not.toBe(turn1.task.id);
  });

  it('records failures', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_err',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.fail('u1', 'c1', created.task.id, 'boom');
    expect(registry.get('u1', 'c1', created.task.id)?.status).toBe('error');
    expect(registry.get('u1', 'c1', created.task.id)?.error).toBe('boom');
  });

  it('caps concurrent running tasks per conversation', () => {
    const registry = new BackgroundTaskRegistryClass();
    let atCapacity = false;
    for (let i = 0; i < 25; i++) {
      const created = registry.create({
        userId: 'u1',
        conversationId: 'c-cap',
        toolCallId: `call_${i}`,
        toolName: 'search_mcp_docs',
      });
      if ('atCapacity' in created) {
        atCapacity = true;
        break;
      }
    }
    expect(atCapacity).toBe(true);
  });

  it('scopes tasks by user and conversation', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_scope',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    expect(registry.get('u2', 'c1', created.task.id)).toBeUndefined();
    expect(registry.get('u1', 'c2', created.task.id)).toBeUndefined();
    expect(registry.list('u2', 'c1')).toHaveLength(0);
  });
});

describe('runCheckBackgroundTask (singleton)', () => {
  it('returns not_found for an unknown id', () => {
    const content = runCheckBackgroundTask({
      userId: 'poll_user',
      conversationId: 'poll_convo',
      args: { background_task_id: 'nope' },
    });
    expect(JSON.parse(content)).toEqual(
      expect.objectContaining({ status: 'not_found', background_task_id: 'nope' }),
    );
  });

  it('returns a single task by id and lists all when omitted', () => {
    const created = backgroundTaskRegistry.create({
      userId: 'poll_user',
      conversationId: 'poll_convo2',
      toolCallId: 'call_poll',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    backgroundTaskRegistry.complete('poll_user', 'poll_convo2', created.task.id, {
      content: 'RESULT',
    });

    const single = JSON.parse(
      runCheckBackgroundTask({
        userId: 'poll_user',
        conversationId: 'poll_convo2',
        args: { background_task_id: created.task.id },
      }),
    );
    expect(single).toEqual(
      expect.objectContaining({
        status: 'completed',
        result: 'RESULT',
        background_task_id: created.task.id,
      }),
    );

    const listed = JSON.parse(
      runCheckBackgroundTask({ userId: 'poll_user', conversationId: 'poll_convo2', args: {} }),
    );
    expect(listed.tasks).toHaveLength(1);
    expect(listed.tasks[0].background_task_id).toBe(created.task.id);
    // list path must NOT dump full results (context-overflow guard); metadata only
    expect(listed.tasks[0].result).toBeUndefined();
    expect(listed.tasks[0]).toEqual(
      expect.objectContaining({ status: 'completed', result_available: true, result_chars: 6 }),
    );
  });
});

describe('buildBackgroundHandleContent', () => {
  it('produces a running handle carrying the id and poll instruction', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_h',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    const parsed = JSON.parse(buildBackgroundHandleContent(created.task));
    expect(parsed.background_task_id).toBe(created.task.id);
    expect(parsed.status).toBe('running');
    expect(parsed.message).toContain(CHECK_BACKGROUND_TASK_NAME);
  });
});

describe('toolOptionsSchema', () => {
  it('preserves run_in_background alongside the existing options', () => {
    const parsed = toolOptionsSchema.parse({
      defer_loading: true,
      run_in_background: true,
      allowed_callers: ['direct'],
    });
    expect(parsed.run_in_background).toBe(true);
    expect(parsed.defer_loading).toBe(true);
  });

  it('strips unknown keys but keeps run_in_background', () => {
    const parsed = toolOptionsSchema.parse({
      run_in_background: true,
      bogus: 'x',
    } as Record<string, unknown>);
    expect(parsed).toEqual({ run_in_background: true });
  });
});
