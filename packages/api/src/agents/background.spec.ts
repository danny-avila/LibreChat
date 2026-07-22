import type { LCTool, LCToolRegistry } from '@librechat/agents';
import {
  isBackgroundEligibleToolName,
  isBackgroundRequested,
  stripRunInBackgroundArg,
  injectRunInBackgroundParam,
  stripBackgroundFromToolDefinitions,
  stripBackgroundFromToolRegistry,
  applyBackgroundToolCalls,
  synthesizeBackgroundToolOptions,
  registerBackgroundTaskTool,
  buildBackgroundHandleContent,
  runCheckBackgroundTask,
  getBackgroundCodeDelivery,
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
  it('excludes direct-path, host-special, and machinery tools', () => {
    for (const name of [
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
      'dall-e',
      'stable-diffusion',
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

  it('allows the code-execution pair (natively backgroundable)', () => {
    expect(isBackgroundEligibleToolName('execute_code')).toBe(true);
    expect(isBackgroundEligibleToolName('bash_tool')).toBe(true);
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
  it('is a no-op when no tool opted in (returns the same defs, registers nothing)', () => {
    const defs = [mcpDef('search_mcp_docs')];
    const registry: LCToolRegistry = new Map();
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: { search_mcp_docs: { defer_loading: true } },
    });
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
    });
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
    });
    expect(result.backgroundToolNames).toEqual([]);
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(false);
  });

  it('skips a tool the host excludeTool predicate rejects (e.g. ephemeral MCP server)', () => {
    const defs = [mcpDef('ephemeral_mcp__body_server'), mcpDef('search_mcp_docs')];
    const registry: LCToolRegistry = new Map(defs.map((d) => [d.name, { ...d }]));
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: {
        ephemeral_mcp__body_server: { run_in_background: true },
        search_mcp_docs: { run_in_background: true },
      },
      excludeTool: (name) => name === 'ephemeral_mcp__body_server',
    });
    expect(result.backgroundToolNames).toEqual(['search_mcp_docs']);
    const ephemeralDef = result.toolDefinitions.find(
      (d) => d.name === 'ephemeral_mcp__body_server',
    );
    expect(
      (ephemeralDef?.parameters as { properties?: Record<string, unknown> }).properties?.[
        RUN_IN_BACKGROUND_ARG
      ],
    ).toBeUndefined();
  });

  it('skips a non-object (string-input) schema without rewriting it', () => {
    const defs = [{ name: 'legacy_tool', parameters: { type: 'string' } } as unknown as LCTool];
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: new Map(),
      toolOptions: { legacy_tool: { run_in_background: true } },
    });
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
    });
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
  it('returns undefined when neither the ephemeral toggle nor the model spec enables it', () => {
    expect(synthesizeBackgroundToolOptions(['search_mcp_docs'], {})).toBeUndefined();
    expect(
      synthesizeBackgroundToolOptions(['search_mcp_docs'], {
        ephemeralAgent: { run_in_background: false },
        modelSpec: { runInBackground: false },
      }),
    ).toBeUndefined();
  });

  it('marks only eligible tools (excludes HITL/attachment built-ins; code tools are eligible)', () => {
    const options = synthesizeBackgroundToolOptions(
      ['search_mcp_docs', 'execute_code', 'ask_user_question', 'web_search', 'lookup_customer'],
      { ephemeralAgent: { run_in_background: true } },
    );
    expect(options).toEqual({
      search_mcp_docs: { run_in_background: true },
      execute_code: { run_in_background: true },
      lookup_customer: { run_in_background: true },
    });
  });

  it('returns undefined when nothing is eligible', () => {
    expect(
      synthesizeBackgroundToolOptions(['read_file', 'skill'], {
        modelSpec: { runInBackground: true },
      }),
    ).toBeUndefined();
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

    registry.complete('u1', 'c1', created.task.id, { content: 'DONE' });
    const task = registry.get('u1', 'c1', created.task.id);
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('DONE');
  });

  it('stamps strictly-increasing createdAt even for same-millisecond dispatches', () => {
    /* `createdAt` orders writers in the stale-output guard, which accepts
     * equal stamps for idempotent re-commits — a wall-clock tie between two
     * DIFFERENT dispatches would let the older one overwrite the newer. */
    const registry = new BackgroundTaskRegistryClass();
    const frozenNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    try {
      const first = registry.create({
        userId: 'u1',
        conversationId: 'c1',
        toolCallId: 'call_a',
        toolName: 'execute_code',
      });
      const second = registry.create({
        userId: 'u1',
        conversationId: 'c1',
        toolCallId: 'call_b',
        toolName: 'execute_code',
      });
      if ('atCapacity' in first || 'atCapacity' in second) {
        throw new Error('unexpected capacity');
      }
      expect(second.task.createdAt).toBeGreaterThan(first.task.createdAt);
    } finally {
      nowSpy.mockRestore();
    }
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

  it('does NOT collide when two agents in the same run emit the same toolCallId', () => {
    const registry = new BackgroundTaskRegistryClass();
    const agentA = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_0',
      toolName: 'search_mcp_docs',
      runId: 'run-1',
      agentId: 'agent-A',
    });
    const agentB = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_0',
      toolName: 'search_mcp_docs',
      runId: 'run-1',
      agentId: 'agent-B',
    });
    if ('atCapacity' in agentA || 'atCapacity' in agentB) {
      throw new Error('unexpected capacity');
    }
    expect(agentB.isNew).toBe(true);
    expect(agentB.task.id).not.toBe(agentA.task.id);
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

  it('holds a completed artifact and claims it exactly once', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_art',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.complete('u1', 'c1', created.task.id, {
      content: 'DONE',
      artifact: { files: ['a.png'] },
    });
    expect(registry.get('u1', 'c1', created.task.id)?.artifact).toEqual({ files: ['a.png'] });

    const claimed = registry.claimArtifact('u1', 'c1', created.task.id);
    expect(claimed).toEqual({
      toolName: 'search_mcp_docs',
      toolCallId: 'call_art',
      artifact: { files: ['a.png'] },
      content: 'DONE',
    });
    // second claim yields nothing (delivered once), and the artifact is freed
    expect(registry.claimArtifact('u1', 'c1', created.task.id)).toBeUndefined();
    expect(registry.get('u1', 'c1', created.task.id)?.artifact).toBeUndefined();
  });

  it('keeps harvest state (messageId, attachments) independent of the one-shot artifact claim', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_code',
      toolName: 'execute_code',
      messageId: 'dispatch-msg',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.complete('u1', 'c1', created.task.id, {
      content: 'stdout',
      artifact: { session_id: 'exec-1', files: [{ id: 'f1' }] },
      harvestStarted: true,
    });

    const claimed = registry.claimArtifact('u1', 'c1', created.task.id);
    expect(claimed).toEqual({
      toolName: 'execute_code',
      toolCallId: 'call_code',
      messageId: 'dispatch-msg',
      harvestStarted: true,
      artifact: { session_id: 'exec-1', files: [{ id: 'f1' }] },
      content: 'stdout',
    });
    expect(registry.claimArtifact('u1', 'c1', created.task.id)).toBeUndefined();

    /** Attachments can land AFTER the artifact was claimed (harvest is
     *  detached) and stay retrievable on every later poll. */
    const attachments = [{ file_id: 'f1', toolCallId: 'call_code' }];
    registry.attachHarvest('u1', 'c1', created.task.id, attachments);
    expect(registry.get('u1', 'c1', created.task.id)?.attachments).toEqual(attachments);
  });

  it('revokeHarvest hands delivery back to the fallback path, restoring a claimed artifact', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_code',
      toolName: 'execute_code',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    const artifact = { session_id: 'exec-1', files: [{ id: 'f1' }] };
    registry.complete('u1', 'c1', created.task.id, {
      content: 'stdout',
      artifact,
      harvestStarted: true,
    });

    /** Poll claimed the artifact while the harvest was in flight… */
    expect(registry.claimArtifact('u1', 'c1', created.task.id)?.harvestStarted).toBe(true);
    /** …then the harvest failed: revoke restores the artifact for the
     *  legacy fallback and clears the suppression flag. */
    registry.revokeHarvest('u1', 'c1', created.task.id, artifact);
    const task = registry.get('u1', 'c1', created.task.id);
    expect(task?.harvestStarted).toBeUndefined();
    expect(task?.artifact).toEqual(artifact);
    expect(registry.claimArtifact('u1', 'c1', created.task.id)?.harvestStarted).toBeUndefined();
  });

  it('exposes reaped (timed-out) tasks to the heal path when harvest was armed at dispatch', () => {
    jest.useFakeTimers();
    try {
      const created = backgroundTaskRegistry.create({
        userId: 'reap_user',
        conversationId: 'reap_convo',
        toolCallId: 'call_reaped',
        toolName: 'execute_code',
        messageId: 'dispatch-msg',
        harvestStarted: true,
      });
      if ('atCapacity' in created) {
        throw new Error('unexpected capacity');
      }

      /** Past the running TTL the sweeper reaps the task to an error; the
       *  dispatch-time harvest flag keeps it visible to marker/re-anchor
       *  delivery so the original card doesn't stay on "running" forever. */
      jest.advanceTimersByTime(31 * 60 * 1000);
      const delivery = getBackgroundCodeDelivery({
        userId: 'reap_user',
        conversationId: 'reap_convo',
        args: { background_task_id: created.task.id },
      });
      expect(delivery).toEqual(
        expect.objectContaining({
          status: 'error',
          toolCallId: 'call_reaped',
          messageId: 'dispatch-msg',
          error: 'Background task timed out',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('fail() can mark a task harvested so failed code tasks join the heal path', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_code_err',
      toolName: 'execute_code',
      messageId: 'dispatch-msg',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.fail('u1', 'c1', created.task.id, 'Execution error:\n\nboom', {
      harvestStarted: true,
    });
    const task = registry.get('u1', 'c1', created.task.id);
    expect(task?.status).toBe('error');
    expect(task?.harvestStarted).toBe(true);
  });

  it('truncates an oversized stored result with an explicit marker (not a silent cut)', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_big',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.complete('u1', 'c1', created.task.id, { content: 'x'.repeat(150_000) });
    const stored = registry.get('u1', 'c1', created.task.id)?.result ?? '';
    expect(stored.length).toBeLessThanOrEqual(100_000);
    expect(stored).toContain('[truncated: 150000 chars exceeded 100000 limit]');
  });

  it('restores a claimed artifact after a failed delivery so a later claim retries', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_art_retry',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.complete('u1', 'c1', created.task.id, {
      content: 'DONE',
      artifact: { files: ['a.png'] },
    });

    const claimed = registry.claimArtifact('u1', 'c1', created.task.id);
    expect(claimed?.artifact).toEqual({ files: ['a.png'] });
    // delivery failed: restore, then a fresh claim gets the same artifact once
    registry.restoreArtifact('u1', 'c1', created.task.id, claimed?.artifact);
    expect(registry.claimArtifact('u1', 'c1', created.task.id)).toEqual({
      toolName: 'search_mcp_docs',
      toolCallId: 'call_art_retry',
      artifact: { files: ['a.png'] },
      content: 'DONE',
    });
    expect(registry.claimArtifact('u1', 'c1', created.task.id)).toBeUndefined();
  });

  it('reaps a stuck running task past the running TTL (frees the slot)', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_stuck',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    // backdate creation past the 30-min running TTL, then trigger a sweep
    created.task.createdAt = Date.now() - 31 * 60 * 1000;
    registry.list('u1', 'c1');
    expect(created.task.status).toBe('error');
    expect(created.task.error).toBe('Background task timed out');
  });

  it('sweeps an expired completed task on direct get() (no indefinite retention)', () => {
    const registry = new BackgroundTaskRegistryClass();
    const created = registry.create({
      userId: 'u1',
      conversationId: 'c1',
      toolCallId: 'call_old',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    registry.complete('u1', 'c1', created.task.id, { content: 'X' });
    // backdate completion past the 1-hour completed TTL
    created.task.updatedAt = Date.now() - 61 * 60 * 1000;
    expect(registry.get('u1', 'c1', created.task.id)).toBeUndefined();
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

  it('evicts oldest settled tasks instead of blocking when the total cap is full', () => {
    const registry = new BackgroundTaskRegistryClass();
    for (let i = 0; i < 200; i++) {
      const created = registry.create({
        userId: 'u1',
        conversationId: 'c-full',
        toolCallId: `call_${i}`,
        toolName: 't',
        runId: 'r',
        agentId: 'a',
      });
      if ('atCapacity' in created) {
        throw new Error(`unexpected capacity at ${i}`);
      }
      registry.complete('u1', 'c-full', created.task.id, { content: 'x' });
    }
    // bucket now holds the max number of settled tasks; a new dispatch must
    // succeed by evicting the oldest settled task, not be rejected.
    const next = registry.create({
      userId: 'u1',
      conversationId: 'c-full',
      toolCallId: 'call_new',
      toolName: 't',
      runId: 'r',
      agentId: 'a',
    });
    expect('atCapacity' in next).toBe(false);
    if ('atCapacity' in next) {
      return;
    }
    expect(next.isNew).toBe(true);
    // total held stays bounded (one evicted, one added)
    expect(registry.list('u1', 'c-full')).toHaveLength(200);
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

describe('applyBackgroundToolCalls — code-pair expansion', () => {
  it('an execute_code opt-in covers the runtime bash_tool definition', () => {
    const defs = [mcpDef('bash_tool')];
    const registry: LCToolRegistry = new Map(defs.map((d) => [d.name, { ...d }]));
    const result = applyBackgroundToolCalls({
      toolDefinitions: defs,
      toolRegistry: registry,
      toolOptions: { execute_code: { run_in_background: true } },
    });
    expect(result.backgroundToolNames).toEqual(['bash_tool']);
    const bashDef = result.toolDefinitions.find((d) => d.name === 'bash_tool');
    expect(
      (bashDef?.parameters as { properties: Record<string, unknown> }).properties[
        RUN_IN_BACKGROUND_ARG
      ],
    ).toBeDefined();
  });
});

describe('getBackgroundCodeDelivery (singleton)', () => {
  it('exposes harvest state for a settled task and stays available across polls', () => {
    const created = backgroundTaskRegistry.create({
      userId: 'delivery_user',
      conversationId: 'delivery_convo',
      toolCallId: 'call_code',
      toolName: 'execute_code',
      messageId: 'dispatch-msg',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    backgroundTaskRegistry.complete('delivery_user', 'delivery_convo', created.task.id, {
      content: 'stdout',
      artifact: { session_id: 'exec-1' },
      harvestStarted: true,
    });
    backgroundTaskRegistry.attachHarvest('delivery_user', 'delivery_convo', created.task.id, [
      { file_id: 'f1' },
    ]);

    const args = { background_task_id: created.task.id };
    const first = getBackgroundCodeDelivery({
      userId: 'delivery_user',
      conversationId: 'delivery_convo',
      args,
    });
    expect(first).toEqual(
      expect.objectContaining({
        status: 'completed',
        toolName: 'execute_code',
        toolCallId: 'call_code',
        messageId: 'dispatch-msg',
        result: 'stdout',
        attachments: [{ file_id: 'f1' }],
      }),
    );
    /** Not one-shot: a later poll can still re-emit / re-anchor. */
    expect(
      getBackgroundCodeDelivery({
        userId: 'delivery_user',
        conversationId: 'delivery_convo',
        args,
      })?.attachments,
    ).toEqual([{ file_id: 'f1' }]);
  });

  it('returns undefined for tasks without a harvest (non-code tools)', () => {
    const created = backgroundTaskRegistry.create({
      userId: 'delivery_user',
      conversationId: 'delivery_convo2',
      toolCallId: 'call_mcp',
      toolName: 'search_mcp_docs',
    });
    if ('atCapacity' in created) {
      throw new Error('unexpected capacity');
    }
    backgroundTaskRegistry.complete('delivery_user', 'delivery_convo2', created.task.id, {
      content: 'RESULT',
    });
    expect(
      getBackgroundCodeDelivery({
        userId: 'delivery_user',
        conversationId: 'delivery_convo2',
        args: { background_task_id: created.task.id },
      }),
    ).toBeUndefined();
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

    // stringified args must still resolve the specific task (with its full result)
    const singleFromString = JSON.parse(
      runCheckBackgroundTask({
        userId: 'poll_user',
        conversationId: 'poll_convo2',
        args: `{"background_task_id":"${created.task.id}"}`,
      }),
    );
    expect(singleFromString).toEqual(
      expect.objectContaining({ status: 'completed', result: 'RESULT' }),
    );
  });

  it('retrieves a task across turns: the poll is keyed only by id, not the dispatch run/turn', () => {
    // Turn 1 dispatches under run-turn-1 and the result lands after the turn.
    const dispatched = backgroundTaskRegistry.create({
      userId: 'poll_user',
      conversationId: 'poll_xturn',
      toolCallId: 'call_xturn',
      toolName: 'search_mcp_docs',
      runId: 'run-turn-1',
      agentId: 'agent-A',
    });
    if ('atCapacity' in dispatched) {
      throw new Error('unexpected capacity');
    }
    backgroundTaskRegistry.complete('poll_user', 'poll_xturn', dispatched.task.id, {
      content: 'XTURN_RESULT',
    });

    // Turn 2 (a later run) polls with just the id; get/list carry no run/turn scope.
    const polled = JSON.parse(
      runCheckBackgroundTask({
        userId: 'poll_user',
        conversationId: 'poll_xturn',
        args: { background_task_id: dispatched.task.id },
      }),
    );
    expect(polled).toEqual(
      expect.objectContaining({
        status: 'completed',
        result: 'XTURN_RESULT',
        background_task_id: dispatched.task.id,
      }),
    );
  });
});

describe('stripBackgroundFromToolRegistry', () => {
  it('drops the poll entry and the injected param without mutating the input', () => {
    const searchDef = mcpDef('search_mcp_docs');
    const registry: LCToolRegistry = new Map([['search_mcp_docs', { ...searchDef }]]);
    applyBackgroundToolCalls({
      toolDefinitions: [searchDef],
      toolRegistry: registry,
      toolOptions: { search_mcp_docs: { run_in_background: true } },
    });
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(true);

    const stripped = stripBackgroundFromToolRegistry(registry, ['search_mcp_docs']);
    expect(stripped?.has(CHECK_BACKGROUND_TASK_NAME)).toBe(false);
    expect(
      (stripped?.get('search_mcp_docs')?.parameters as { properties: Record<string, unknown> })
        .properties[RUN_IN_BACKGROUND_ARG],
    ).toBeUndefined();
    // original untouched (parent still needs background)
    expect(registry.has(CHECK_BACKGROUND_TASK_NAME)).toBe(true);
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
