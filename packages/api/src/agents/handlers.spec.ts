import { Constants } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type {
  ToolExecuteBatchRequest,
  ToolExecuteResult,
  ToolCallRequest,
} from '@librechat/agents';
import { createToolExecuteHandler, ToolExecuteOptions } from './handlers';

function createMockTool(
  name: string,
  capturedConfigs: Record<string, unknown>[],
  options: { schema?: unknown; capturedArgs?: unknown[] } = {},
) {
  return {
    name,
    schema: options.schema,
    invoke: jest.fn(async (_args: unknown, config: Record<string, unknown>) => {
      options.capturedArgs?.push(_args);
      capturedConfigs.push({ ...(config.toolCall as Record<string, unknown>) });
      return {
        content: `stdout:\n${name} executed\n`,
        artifact: { session_id: `result-session-${name}`, files: [] },
      };
    }),
  };
}

function createHandler(
  capturedConfigs: Record<string, unknown>[],
  toolNames: string[] = [Constants.EXECUTE_CODE],
) {
  const mockTools = toolNames.map((name) => createMockTool(name, capturedConfigs));
  const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
    loadedTools: mockTools as never[],
  }));
  return createToolExecuteHandler({ loadTools });
}

function invokeHandler(
  handler: ReturnType<typeof createToolExecuteHandler>,
  toolCalls: ToolCallRequest[],
): Promise<ToolExecuteResult[]> {
  return new Promise((resolve, reject) => {
    const request: ToolExecuteBatchRequest = {
      toolCalls,
      resolve,
      reject,
    };
    handler.handle('on_tool_execute', request);
  });
}

function invokeHandlerWithConfig(
  handler: ReturnType<typeof createToolExecuteHandler>,
  toolCalls: ToolCallRequest[],
  configurable: Record<string, unknown>,
): Promise<ToolExecuteResult[]> {
  return new Promise((resolve, reject) => {
    const request: ToolExecuteBatchRequest = {
      toolCalls,
      configurable,
      resolve,
      reject,
    };
    handler.handle('on_tool_execute', request);
  });
}

/**
 * Sentinel non-empty `accessibleSkillIds` for fixtures that need to opt
 * into "skills are effectively in scope". The `read_file` handler short-
 * circuits to the sandbox fallback (or errors when code env isn't
 * available) whenever `accessibleSkillIds` is empty — that's the resolved
 * output of `resolveAgentScopedSkillIds` (admin capability + ephemeral
 * badge / persisted `skills_enabled` + ACL). Tests that mock
 * `getSkillByName` directly need this so they reach the lookup.
 */
function skillsInScope(): unknown[] {
  const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
  return [new Types.ObjectId()];
}

describe('createToolExecuteHandler', () => {
  describe('code execution session context passthrough', () => {
    it('passes session_id and _injected_files from codeSessionContext to toolCallConfig', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_1',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'print("hi")' },
          codeSessionContext: {
            session_id: 'prev-session-abc',
            files: [
              {
                storage_session_id: 'prev-session-abc',
                id: 'f1',
                resource_id: 'user_alice',
                name: 'data.parquet',
                kind: 'user',
              },
              {
                storage_session_id: 'prev-session-abc',
                id: 'f2',
                resource_id: 'user_alice',
                name: 'chart.png',
                kind: 'user',
              },
            ],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBe('prev-session-abc');
      expect(capturedConfigs[0]._injected_files).toEqual([
        {
          storage_session_id: 'prev-session-abc',
          id: 'f1',
          resource_id: 'user_alice',
          name: 'data.parquet',
          kind: 'user',
        },
        {
          storage_session_id: 'prev-session-abc',
          id: 'f2',
          resource_id: 'user_alice',
          name: 'chart.png',
          kind: 'user',
        },
      ]);
    });

    it('passes session_id without _injected_files when session has no files', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_2',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'import pandas' },
          codeSessionContext: {
            session_id: 'session-no-files',
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBe('session-no-files');
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });

    it('does not inject session context when codeSessionContext is absent', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_3',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'x = 1' },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });

    it('passes session context independently for multiple code execution calls', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_a',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'step_1()' },
          codeSessionContext: {
            session_id: 'session-A',
            files: [
              {
                storage_session_id: 'session-A',
                id: 'fa',
                resource_id: 'user_alice',
                name: 'a.csv',
                kind: 'user',
              },
            ],
          },
        },
        {
          id: 'call_b',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'step_2()' },
          codeSessionContext: {
            session_id: 'session-A',
            files: [
              {
                storage_session_id: 'session-A',
                id: 'fa',
                resource_id: 'user_alice',
                name: 'a.csv',
                kind: 'user',
              },
            ],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(2);
      for (const config of capturedConfigs) {
        expect(config.session_id).toBe('session-A');
        expect(config._injected_files).toEqual([
          {
            storage_session_id: 'session-A',
            id: 'fa',
            resource_id: 'user_alice',
            name: 'a.csv',
            kind: 'user',
          },
        ]);
      }
    });

    it('does not pass session context to non-code-execution tools', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const handler = createHandler(capturedConfigs, ['web_search']);

      const toolCalls: ToolCallRequest[] = [
        {
          id: 'call_ws',
          name: 'web_search',
          args: { query: 'test' },
          codeSessionContext: {
            session_id: 'should-be-ignored',
            files: [
              {
                storage_session_id: 'x',
                id: 'y',
                resource_id: 'user_alice',
                name: 'z',
                kind: 'user',
              },
            ],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });
  });

  describe('tool argument normalization', () => {
    it('parses JSON-string args for object-schema tools before invocation', async () => {
      const capturedArgs: unknown[] = [];
      const tool = createMockTool(Constants.BASH_PROGRAMMATIC_TOOL_CALLING, [], {
        capturedArgs,
        schema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            timeout: { type: 'number' },
          },
          required: ['code'],
        },
      });
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [tool] as never[],
      }));
      const handler = createToolExecuteHandler({ loadTools });

      await invokeHandler(handler, [
        {
          id: 'call_bash_json_string',
          name: Constants.BASH_PROGRAMMATIC_TOOL_CALLING,
          args: '{"code":"echo hi","timeout":30000}' as unknown as ToolCallRequest['args'],
        },
      ]);

      expect(capturedArgs).toEqual([{ code: 'echo hi', timeout: 30000 }]);
    });

    it('preserves JSON-looking strings for string-schema tools', async () => {
      const capturedArgs: unknown[] = [];
      const payload = '{"serviceId":"svc","query":"SELECT price / 10.0 FROM default.uk_prices_3"}';
      const tool = createMockTool('raw_string_tool', [], {
        capturedArgs,
        schema: { type: 'string' },
      });
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [tool] as never[],
      }));
      const handler = createToolExecuteHandler({ loadTools });

      await invokeHandler(handler, [
        {
          id: 'call_raw_string',
          name: 'raw_string_tool',
          args: payload as unknown as ToolCallRequest['args'],
        },
      ]);

      expect(capturedArgs).toEqual([payload]);
    });

    it('preserves JSON-looking strings when a tool accepts string or object input', async () => {
      const capturedArgs: unknown[] = [];
      const payload = '{"query":"SELECT * FROM t WHERE name IN (\'a\',\'b\')"}';
      const tool = createMockTool('union_tool', [], {
        capturedArgs,
        schema: { anyOf: [{ type: 'string' }, { type: 'object' }] },
      });
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [tool] as never[],
      }));
      const handler = createToolExecuteHandler({ loadTools });

      await invokeHandler(handler, [
        {
          id: 'call_union',
          name: 'union_tool',
          args: payload as unknown as ToolCallRequest['args'],
        },
      ]);

      expect(capturedArgs).toEqual([payload]);
    });
  });

  describe('programmatic tool config', () => {
    it('injects tool definitions for the legacy PTC tool name', async () => {
      const capturedConfigs: Record<string, unknown>[] = [];
      const legacyPtcTool = createMockTool(Constants.PROGRAMMATIC_TOOL_CALLING, capturedConfigs);
      const toolRegistry = new Map([
        ['custom_tool', { name: 'custom_tool' }],
        ['create_file', { name: 'create_file' }],
        [Constants.PROGRAMMATIC_TOOL_CALLING, { name: Constants.PROGRAMMATIC_TOOL_CALLING }],
        [
          Constants.BASH_PROGRAMMATIC_TOOL_CALLING,
          { name: Constants.BASH_PROGRAMMATIC_TOOL_CALLING },
        ],
        [Constants.TOOL_SEARCH, { name: Constants.TOOL_SEARCH }],
      ]);
      const ptcToolMap = new Map([['custom_tool', createMockTool('custom_tool', [])]]);
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [legacyPtcTool] as never[],
        configurable: {
          toolRegistry,
          ptcToolMap,
          fileAuthoringToolNames: new Set(['create_file']),
        },
      }));
      const handler = createToolExecuteHandler({ loadTools });

      await invokeHandler(handler, [
        {
          id: 'call_1',
          name: Constants.PROGRAMMATIC_TOOL_CALLING,
          args: { code: 'custom_tool "{}"' },
        },
      ]);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].toolDefs).toEqual([{ name: 'custom_tool' }]);
      expect(capturedConfigs[0].toolMap).toBe(ptcToolMap);
    });
  });

  describe('host file authoring collisions', () => {
    it('invokes a loaded user tool named create_file when host file authoring is not active', async () => {
      const capturedArgs: unknown[] = [];
      const capturedConfigs: Record<string, unknown>[] = [];
      const tool = createMockTool('create_file', capturedConfigs, { capturedArgs });
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [tool] as never[],
        configurable: { fileAuthoringToolNames: new Set<string>() },
      }));
      const handler = createToolExecuteHandler({ loadTools });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_user_create_file',
          name: 'create_file',
          args: { custom: true },
          codeSessionContext: {
            session_id: 'ignored-session',
            files: [
              {
                id: 'ignored-file',
                name: 'ignored.txt',
                storage_session_id: 'ignored-session',
                resource_id: 'user-1',
                kind: 'user',
              },
            ],
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('create_file executed');
      expect(capturedArgs).toEqual([{ custom: true }]);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });
  });

  describe('tool error handling', () => {
    it('truncates oversized tool errors in the result and log context', async () => {
      const oversizedMessage = `tool failed: ${'x'.repeat(15_000)}`;
      const thrown = new Error(oversizedMessage);
      thrown.stack = `Error: ${oversizedMessage}\n${'stack-line\n'.repeat(600)}`;
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [
          {
            name: 'bad_tool',
            invoke: jest.fn(async () => {
              throw thrown;
            }),
          },
        ] as never[],
      }));
      const errorSpy = jest.spyOn(logger, 'error').mockReturnValue(logger);
      try {
        const handler = createToolExecuteHandler({ loadTools });
        const [result] = await invokeHandler(handler, [
          {
            id: 'call_bad',
            name: 'bad_tool',
            args: {},
          },
        ]);

        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('truncated');
        expect(result.errorMessage!.length).toBeLessThanOrEqual(12_000);
        expect(errorSpy).toHaveBeenCalledWith(
          '[ON_TOOL_EXECUTE] Tool bad_tool error',
          expect.objectContaining({
            messageTruncated: true,
            messageLength: oversizedMessage.length,
          }),
        );
        const [, logContext] = errorSpy.mock.calls[0] as unknown as [string, { stack?: string }];
        expect(logContext.stack!.length).toBeLessThanOrEqual(4_000);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('returns a per-tool error when thrown value stringification fails', async () => {
      const thrown = {
        toString() {
          throw new Error('toString failed');
        },
      };
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [
          {
            name: 'bad_to_string_tool',
            invoke: jest.fn(async () => {
              throw thrown;
            }),
          },
        ] as never[],
      }));
      const errorSpy = jest.spyOn(logger, 'error').mockReturnValue(logger);
      try {
        const handler = createToolExecuteHandler({ loadTools });
        const [result] = await invokeHandler(handler, [
          {
            id: 'call_bad_to_string',
            name: 'bad_to_string_tool',
            args: {},
          },
        ]);

        expect(result.status).toBe('error');
        expect(result.errorMessage).toBe('[Thrown value could not be converted to string]');
        expect(errorSpy).toHaveBeenCalledWith(
          '[ON_TOOL_EXECUTE] Tool bad_to_string_tool error',
          expect.objectContaining({
            name: 'object',
            messageTruncated: false,
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('preserves message from thrown plain objects', async () => {
      const thrown = { message: 'plain object timeout' };
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [
          {
            name: 'plain_object_tool',
            invoke: jest.fn(async () => {
              throw thrown;
            }),
          },
        ] as never[],
      }));
      const errorSpy = jest.spyOn(logger, 'error').mockReturnValue(logger);
      try {
        const handler = createToolExecuteHandler({ loadTools });
        const [result] = await invokeHandler(handler, [
          {
            id: 'call_plain_object',
            name: 'plain_object_tool',
            args: {},
          },
        ]);

        expect(result.status).toBe('error');
        expect(result.errorMessage).toBe('plain object timeout');
        expect(errorSpy).toHaveBeenCalledWith(
          '[ON_TOOL_EXECUTE] Tool plain_object_tool error',
          expect.objectContaining({
            message: 'plain object timeout',
            messageTruncated: false,
          }),
        );
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe('skill tool model-invocation gate', () => {
    function createSkillHandler(getSkillByName: ToolExecuteOptions['getSkillByName']) {
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: { accessibleSkillIds: skillsInScope() },
      }));
      return createToolExecuteHandler({ loadTools, getSkillByName });
    }

    it('rejects with a clear error when the named skill has disableModelInvocation=true', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'pii-redactor',
        body: 'restricted body',
        fileCount: 0,
        version: 1,
        disableModelInvocation: true,
      }));
      const handler = createSkillHandler(getSkillByName);

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_skill_1',
          name: Constants.SKILL_TOOL,
          args: { skillName: 'pii-redactor' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('cannot be invoked by the model');
      expect(result.errorMessage).toContain('pii-redactor');
    });

    it('returns the regular not-accessible error when the skill itself is missing (gate runs after lookup)', async () => {
      const getSkillByName = jest.fn(async () => null);
      const handler = createSkillHandler(getSkillByName);

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_skill_2',
          name: Constants.SKILL_TOOL,
          args: { skillName: 'ghost' },
        },
      ]);

      expect(result.status).toBe('error');
      /* Distinct error message — operators can tell "not in catalog" apart
         from "exists but model-blocked". */
      expect(result.errorMessage).toContain('not found or not accessible');
      expect(result.errorMessage).not.toContain('cannot be invoked');
    });

    it('lets through skills without disableModelInvocation set (default behavior)', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'normal-skill',
        body: 'body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createSkillHandler(getSkillByName);

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_skill_3',
          name: Constants.SKILL_TOOL,
          args: { skillName: 'normal-skill' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('normal-skill');
    });

    it('skill tool calls getSkillByName with preferModelInvocable (and NOT preferUserInvocable, so model-only skills still resolve)', async () => {
      /* The skill tool should resolve to the cataloged model-invocable doc
         when a same-name disabled duplicate exists — passing
         preferModelInvocable keeps the resolution consistent with the
         catalog. We do NOT pass preferUserInvocable: model-only skills
         (`userInvocable: false`) are valid model-invocation targets, and
         filtering them out would let an older user-invocable duplicate
         shadow the cataloged model-only skill. Falls back to newest when
         only a disabled doc exists so the gate fires its explicit error. */
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'maybe-disabled',
        body: 'body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createSkillHandler(getSkillByName);

      await invokeHandler(handler, [
        {
          id: 'call_skill_4',
          name: Constants.SKILL_TOOL,
          args: { skillName: 'maybe-disabled' },
        },
      ]);

      expect(getSkillByName).toHaveBeenCalledWith('maybe-disabled', expect.any(Array), {
        preferModelInvocable: true,
      });
      const callOptions = (getSkillByName.mock.calls[0] as unknown[])[2] as
        | { preferUserInvocable?: boolean }
        | undefined;
      expect(callOptions).not.toHaveProperty('preferUserInvocable', true);
    });

    it('read_file uses preferModelInvocable for AUTONOMOUS probes (skill not in skillPrimedIdsByName)', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'maybe-disabled-read',
        body: '# Body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: { accessibleSkillIds: skillsInScope() },
        })),
        getSkillByName,
      });

      await invokeHandler(handler, [
        {
          id: 'call_read_5',
          name: Constants.READ_FILE,
          args: { file_path: 'maybe-disabled-read/SKILL.md' },
        },
      ]);

      expect(getSkillByName).toHaveBeenCalledWith('maybe-disabled-read', expect.any(Array), {
        preferModelInvocable: true,
      });
      const callOptions = (getSkillByName.mock.calls[0] as unknown[])[2] as
        | { preferUserInvocable?: boolean }
        | undefined;
      expect(callOptions).not.toHaveProperty('preferUserInvocable', true);
    });

    it("read_file pins lookup to the primed skill's _id when manually invoked this turn (no shadowing on collision)", async () => {
      /* Same-name collision corner: the resolver primed a specific doc
         (its `_id` is in `skillPrimedIdsByName`). If read_file used
         the full ACL set + a `prefer*` flag, a same-name duplicate could
         shadow the resolver's pick and the model would read files from
         the WRONG skill. The handler now constrains accessibleIds to
         the primed `_id`, so the lookup returns the EXACT same doc. */
      const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
      const primedHex = '507f1f77bcf86cd799439011';
      const getSkillByName = jest.fn(async () => ({
        _id: new Types.ObjectId(primedHex) as unknown as never,
        name: 'manually-primed',
        body: '# Body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            accessibleSkillIds: skillsInScope(),
            skillPrimedIdsByName: { 'manually-primed': primedHex },
          },
        })),
        getSkillByName,
      });

      await invokeHandler(handler, [
        {
          id: 'call_read_6',
          name: Constants.READ_FILE,
          args: { file_path: 'manually-primed/references/foo.md' },
        },
      ]);

      /* Lookup is pinned to the primed _id (single-element array) and
         carries no preference flags — the constrained accessibleIds set
         already disambiguates which doc to return. */
      expect(getSkillByName).toHaveBeenCalledTimes(1);
      const [calledName, calledIds, calledOpts] = getSkillByName.mock.calls[0] as unknown as [
        string,
        Array<{ toString(): string }>,
        object,
      ];
      expect(calledName).toBe('manually-primed');
      expect(calledOpts).toEqual({});
      expect(calledIds).toHaveLength(1);
      /* Constructed `ObjectId` with the primed hex — `.toString()`
         produces the same hex back. Compare via the canonical form to
         avoid coupling to the runtime ObjectId class. */
      expect(calledIds[0].toString()).toBe(primedHex);
    });

    it('rejects read_file tool calls for disableModelInvocation skills (file ACL parity)', async () => {
      /* The `read_file` handler shares `accessibleSkillIds` with the skill
         tool. Without the disableModelInvocation gate there too, a model
         that learned a hidden skill's name (stale catalog, hallucination)
         could read its SKILL.md body or bundled files via `read_file`,
         defeating the contract. */
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'pii-redactor',
        body: 'restricted body',
        fileCount: 0,
        version: 1,
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: { accessibleSkillIds: skillsInScope() },
        })),
        getSkillByName,
        getSkillFileByPath: jest.fn(),
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_read_1',
          name: Constants.READ_FILE,
          args: { file_path: 'pii-redactor/SKILL.md' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('cannot be invoked by the model');
      expect(result.errorMessage).toContain('pii-redactor');
    });

    it('lets read_file calls through for normal skills (regression: gate is not over-broad)', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'normal-skill',
        body: '# Body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: { accessibleSkillIds: skillsInScope() },
        })),
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_read_2',
          name: Constants.READ_FILE,
          args: { file_path: 'normal-skill/SKILL.md' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Body');
    });

    it('allows read_file for a manually-primed disabled skill (manual `$` invocation must stay usable)', async () => {
      /* Disabled skill that the user manually invoked this turn. The body
         is already primed into context via `manualSkillPrimes`; if read_file
         were also blocked here, any skill referencing `references/foo.md`
         in its body would be non-functional under manual invocation. The
         autonomous-block contract is preserved because the bypass is
         scoped to the per-turn `skillPrimedIdsByName` allowlist. */
      const getSkillByName = jest.fn(async () => ({
        _id: '507f1f77bcf86cd799439020' as unknown as never,
        name: 'manual-only-skill',
        body: '# Use references/docs.md for details',
        fileCount: 0,
        version: 1,
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            accessibleSkillIds: skillsInScope(),
            skillPrimedIdsByName: { 'manual-only-skill': '507f1f77bcf86cd799439020' },
          },
        })),
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_read_3',
          name: Constants.READ_FILE,
          args: { file_path: 'manual-only-skill/SKILL.md' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('references/docs.md');
    });

    it('still blocks read_file for a disabled skill the user did NOT manually prime this turn', async () => {
      /* Defense-in-depth: the manual-prime exception is scoped to the
         specific names in `skillPrimedIdsByName`. A model trying
         to read a different disabled skill (one the user never manually
         invoked) is still rejected. */
      const getSkillByName = jest.fn(async () => ({
        _id: 'other-id' as unknown as never,
        name: 'other-disabled-skill',
        body: 'restricted',
        fileCount: 0,
        version: 1,
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            accessibleSkillIds: skillsInScope(),
            skillPrimedIdsByName: { 'something-else': '507f1f77bcf86cd799439030' },
          },
        })),
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_read_4',
          name: Constants.READ_FILE,
          args: { file_path: 'other-disabled-skill/SKILL.md' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('cannot be invoked by the model');
    });

    it('relaxes the disable-model gate for always-apply primes the same way it does for manual', async () => {
      /* Regression: always-apply skills landed in `skillPrimedIdsByName`
         alongside manual primes, so a `disable-model-invocation: true`
         skill that auto-primes via always-apply must be able to read
         its own bundled files. Without this, a team's auto-primed
         "model-only" skill (e.g. legal boilerplate) would silently
         degrade the first time it referenced `references/foo.md`. */
      const getSkillByName = jest.fn(async () => ({
        _id: '507f1f77bcf86cd799439040' as unknown as never,
        name: 'always-applied-legal',
        body: '# Cite references/policy.md when advising',
        fileCount: 0,
        version: 1,
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            accessibleSkillIds: skillsInScope(),
            /* Map includes the always-apply skill because `buildSkillPrimedIdsByName`
               now combines both prime sources. */
            skillPrimedIdsByName: {
              'always-applied-legal': '507f1f77bcf86cd799439040',
            },
          },
        })),
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_read_always',
          name: Constants.READ_FILE,
          args: { file_path: 'always-applied-legal/SKILL.md' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('references/policy.md');
    });

    it('pins accessibleIds to the primed _id for an always-apply skill (no same-name shadowing)', async () => {
      /* Same-name collision: two skills share a name, one got primed via
         always-apply. read_file must resolve to the exact primed doc so
         the body and file lookup stay consistent within a turn. */
      const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
      const primedHex = '507f1f77bcf86cd799439050';
      const getSkillByName = jest.fn(async () => ({
        _id: new Types.ObjectId(primedHex) as unknown as never,
        name: 'collides',
        body: '# primed body',
        fileCount: 0,
        version: 1,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            accessibleSkillIds: skillsInScope(),
            skillPrimedIdsByName: { collides: primedHex },
          },
        })),
        getSkillByName,
      });

      await invokeHandler(handler, [
        {
          id: 'call_read_pin',
          name: Constants.READ_FILE,
          args: { file_path: 'collides/SKILL.md' },
        },
      ]);

      const firstCall = getSkillByName.mock.calls[0] as unknown as [
        string,
        Array<{ toString(): string }>,
        Record<string, unknown>,
      ];
      const accessibleIdsArg = firstCall[1];
      const lookupOptions = firstCall[2];
      expect(accessibleIdsArg).toHaveLength(1);
      expect(accessibleIdsArg[0].toString()).toBe(primedHex);
      // Primed lookups do NOT pass preferModelInvocable — the _id pin is
      // authoritative.
      expect(lookupOptions).toEqual({});
    });
  });

  describe('skill tool codeEnvAvailable gate (sandbox file priming)', () => {
    const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
    const SKILL_ID = new Types.ObjectId();

    function makeSkillHandlerWithFiles(params: {
      codeEnvAvailable: boolean;
      listSkillFiles: jest.Mock;
      batchUploadCodeEnvFiles?: jest.Mock;
    }) {
      const getSkillByName = jest.fn(async () => ({
        _id: SKILL_ID as unknown as never,
        name: 'brand-guidelines',
        body: 'skill body',
        fileCount: 2,
        version: 1,
      }));
      /* `loadTools` injects `codeEnvAvailable` into the returned
         `configurable`, which mirrors production flow through
         `enrichWithSkillConfigurable`. `req` must be present for the
         priming branch to enter (the handler guards on it). */
      const req = { user: { id: 'user-1' } };
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: { codeEnvAvailable: params.codeEnvAvailable, req },
      }));
      return createToolExecuteHandler({
        loadTools,
        getSkillByName,
        listSkillFiles: params.listSkillFiles as unknown as ToolExecuteOptions['listSkillFiles'],
        batchUploadCodeEnvFiles: (params.batchUploadCodeEnvFiles ??
          jest.fn()) as unknown as ToolExecuteOptions['batchUploadCodeEnvFiles'],
        getStrategyFunctions: jest.fn() as unknown as ToolExecuteOptions['getStrategyFunctions'],
      });
    }

    it('does NOT call listSkillFiles when codeEnvAvailable is false', async () => {
      const listSkillFiles = jest.fn().mockResolvedValue([]);
      const handler = makeSkillHandlerWithFiles({
        codeEnvAvailable: false,
        listSkillFiles,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_gate_off',
          name: Constants.SKILL_TOOL,
          args: { skillName: 'brand-guidelines' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(listSkillFiles).not.toHaveBeenCalled();
    });

    it('calls listSkillFiles when codeEnvAvailable is true', async () => {
      const listSkillFiles = jest.fn().mockResolvedValue([]);
      const handler = makeSkillHandlerWithFiles({
        codeEnvAvailable: true,
        listSkillFiles,
      });

      await invokeHandler(handler, [
        { id: 'call_gate_on', name: Constants.SKILL_TOOL, args: { skillName: 'brand-guidelines' } },
      ]);

      expect(listSkillFiles).toHaveBeenCalledWith(SKILL_ID);
    });
  });

  describe('file authoring tools for skills', () => {
    const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
    const SKILL_ID = new Types.ObjectId();
    const req = {
      user: {
        id: 'user-1',
        _id: new Types.ObjectId(),
        role: 'USER',
        name: 'Test User',
      },
      config: {},
    } as never;

    function makeAuthoringHandler(
      params: Partial<ToolExecuteOptions>,
      configurable?: Record<string, unknown>,
    ) {
      const toolConfigurable = {
        req,
        accessibleSkillIds: skillsInScope(),
        skillAuthoringAvailable: true,
        fileAuthoringToolNames: new Set(['create_file', 'edit_file']),
        ...(configurable ?? {}),
      };
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: toolConfigurable,
      }));
      return createToolExecuteHandler({
        loadTools,
        canCreateSkill: jest.fn(async () => true),
        canEditSkill: jest.fn(async () => true),
        grantSkillOwner: jest.fn(async () => undefined),
        ...params,
      });
    }

    it('creates a new SKILL.md through create_file', async () => {
      const createSkill = jest.fn(async () => ({
        skill: {
          _id: SKILL_ID,
          name: 'new-skill',
          body: '# New skill',
          version: 1,
        },
      }));
      const grantSkillOwner = jest.fn(async () => undefined);
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => null),
        createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
        grantSkillOwner,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_skill',
          name: 'create_file',
          args: {
            file_path: 'skills/new-skill/SKILL.md',
            content:
              '---\nname: new-skill\ndescription: Use for tests\ndisable-model-invocation: true\nallowed-tools:\n  - execute_code\n---\n# New skill\n',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Created skills/new-skill/SKILL.md');
      expect(result.artifact).toMatchObject({
        path: 'skills/new-skill/SKILL.md',
        created: true,
      });
      expect(createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'new-skill',
          description: 'Use for tests',
          frontmatter: expect.objectContaining({
            name: 'new-skill',
            description: 'Use for tests',
            'disable-model-invocation': true,
            'allowed-tools': ['execute_code'],
          }),
        }),
      );
      expect(grantSkillOwner).toHaveBeenCalledWith({ req, skillId: SKILL_ID });
    });

    it('adds required SKILL.md frontmatter when create_file only provides markdown', async () => {
      const createSkill = jest.fn(async () => ({
        skill: {
          _id: SKILL_ID,
          name: 'auto-skill',
          body: '# Auto skill',
          version: 1,
        },
      }));
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => null),
        createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_auto_frontmatter',
          name: 'create_file',
          args: {
            file_path: 'skills/auto-skill/SKILL.md',
            content: '# Auto skill\nUse this skill when testing generated frontmatter.\n',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'auto-skill',
          description: 'Use this skill when testing generated frontmatter.',
          body: expect.stringContaining('name: auto-skill'),
          frontmatter: expect.objectContaining({
            name: 'auto-skill',
            description: 'Use this skill when testing generated frontmatter.',
          }),
        }),
      );
    });

    it('preserves block-scalar SKILL.md descriptions when creating skills', async () => {
      const createSkill = jest.fn(async () => ({
        skill: {
          _id: SKILL_ID,
          name: 'block-description-skill',
          body: '# Block description skill',
          version: 1,
        },
      }));
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => null),
        createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_block_description',
          name: 'create_file',
          args: {
            file_path: 'skills/block-description-skill/SKILL.md',
            content:
              '---\nname: block-description-skill\ndescription: |-\n  Use this skill for long descriptions.\n  Keep both lines searchable.\n---\n# Block description skill\n',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'block-description-skill',
          description: 'Use this skill for long descriptions.\nKeep both lines searchable.',
          frontmatter: expect.objectContaining({
            description: 'Use this skill for long descriptions.\nKeep both lines searchable.',
          }),
        }),
      );
    });

    it('can add bundled files to a newly created skill in the same tool batch', async () => {
      const createdSkill = {
        _id: SKILL_ID,
        name: 'new-skill',
        body: '# New skill',
        fileCount: 0,
        version: 1,
      };
      const createSkill = jest.fn(async () => ({
        skill: createdSkill,
      }));
      const getSkillByName = jest.fn(async () => createdSkill);
      const saveSkillFileContent = jest.fn(async () => ({
        bytes: 12,
        relativePath: 'references/a.md',
      }));
      const handler = makeAuthoringHandler(
        {
          getSkillByName,
          createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
          getSkillFileByPath: jest.fn(async () => null),
          saveSkillFileContent,
        },
        {
          accessibleSkillIds: [],
          skillPrimedIdsByName: {},
          activeSkillNames: new Set(['stale-skill']),
        },
      );

      const results = await invokeHandler(handler, [
        {
          id: 'call_create_skill',
          name: 'create_file',
          args: {
            file_path: 'skills/new-skill/SKILL.md',
            content: '---\nname: new-skill\ndescription: Use for tests\n---\n# New skill\n',
          },
        },
        {
          id: 'call_create_reference',
          name: 'create_file',
          args: {
            file_path: 'skills/new-skill/references/a.md',
            content: 'reference text',
          },
        },
      ]);

      expect(results.map((r) => r.status)).toEqual(['success', 'success']);
      expect(saveSkillFileContent).toHaveBeenCalledWith(
        expect.objectContaining({
          skillId: SKILL_ID,
          relativePath: 'references/a.md',
          content: 'reference text',
        }),
      );
    });

    it('preserves newly authored skills across later tool execution rounds', async () => {
      const createdSkill = {
        _id: SKILL_ID,
        name: 'round-skill',
        body: '---\nname: round-skill\ndescription: Use for tests\n---\n# Round skill\n',
        fileCount: 0,
        version: 1,
      };
      const runtimeConfigurable = {
        req,
        accessibleSkillIds: [],
        skillPrimedIdsByName: {},
        activeSkillNames: new Set<string>(),
        skillAuthoringAvailable: true,
        fileAuthoringToolNames: new Set(['create_file', 'edit_file']),
      };
      const staleLoadedConfigurable = {
        req,
        accessibleSkillIds: [],
        skillPrimedIdsByName: {},
        activeSkillNames: new Set<string>(),
        skillAuthoringAvailable: true,
        fileAuthoringToolNames: new Set(['create_file', 'edit_file']),
      };
      let created = false;
      const createSkill = jest.fn(async () => {
        created = true;
        return { skill: createdSkill };
      });
      const getSkillByName = jest.fn(async () => (created ? createdSkill : null));
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: staleLoadedConfigurable,
      }));
      const handler = createToolExecuteHandler({
        loadTools,
        canCreateSkill: jest.fn(async () => true),
        canEditSkill: jest.fn(async () => true),
        grantSkillOwner: jest.fn(async () => undefined),
        getSkillByName,
        createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
      });

      const [createResult] = await invokeHandlerWithConfig(
        handler,
        [
          {
            id: 'call_create_round_skill',
            name: 'create_file',
            args: {
              file_path: 'skills/round-skill/SKILL.md',
              content: createdSkill.body,
            },
          },
        ],
        runtimeConfigurable,
      );
      const [readResult] = await invokeHandlerWithConfig(
        handler,
        [
          {
            id: 'call_read_round_skill',
            name: Constants.READ_FILE,
            args: { file_path: 'skills/round-skill/SKILL.md' },
          },
        ],
        runtimeConfigurable,
      );

      expect(createResult.status).toBe('success');
      expect(readResult.status).toBe('success');
      expect(readResult.content).toContain('Round skill');
      const lookupCalls = getSkillByName.mock.calls as unknown as Array<
        [string, import('mongoose').Types.ObjectId[], Record<string, unknown>]
      >;
      const lastLookup = lookupCalls[lookupCalls.length - 1];
      const lookupIds = lastLookup?.[1];
      expect(lastLookup?.[0]).toBe('round-skill');
      expect(lookupIds?.[0].toString()).toBe(SKILL_ID.toString());
      expect(lastLookup?.[2]).toEqual({});
    });

    it('refuses to overwrite an existing SKILL.md without overwrite: true', async () => {
      const updateSkill = jest.fn();
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'existing-skill',
          body: '# Existing',
          fileCount: 0,
          version: 1,
        })),
        updateSkill,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_existing',
          name: 'create_file',
          args: {
            file_path: 'skills/existing-skill/SKILL.md',
            content: '---\nname: existing-skill\ndescription: Use for tests\n---\n# Updated\n',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('overwrite: true');
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('rehydrates same-author existing skills before refusing a duplicate create_file', async () => {
      const existingSkill = {
        _id: SKILL_ID,
        name: 'stale-skill',
        body: '---\nname: stale-skill\ndescription: Existing\n---\n# Existing\n',
        fileCount: 0,
        version: 3,
      };
      const updateSkill = jest.fn();
      const getAuthorSkillByName = jest.fn(async () => existingSkill);
      const handler = makeAuthoringHandler(
        {
          getSkillByName: jest.fn(async () => null),
          getAuthorSkillByName,
          updateSkill,
        },
        {
          accessibleSkillIds: [],
          skillPrimedIdsByName: {},
          activeSkillNames: new Set(['stale-skill']),
        },
      );

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_duplicate_stale_skill',
          name: 'create_file',
          args: {
            file_path: 'skills/stale-skill/SKILL.md',
            content: '---\nname: stale-skill\ndescription: Replacement\n---\n# Replacement\n',
          },
        },
      ]);

      expect(getAuthorSkillByName).toHaveBeenCalledWith({ req, name: 'stale-skill' });
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('already exists');
      expect(result.errorMessage).toContain('edit_file');
      expect(result.errorMessage).toContain('overwrite: true');
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('does not rehydrate same-author skills outside the current agent scope', async () => {
      const updateSkill = jest.fn();
      const getAuthorSkillByName = jest.fn(async () => ({
        _id: SKILL_ID,
        name: 'excluded-skill',
        body: '---\nname: excluded-skill\ndescription: Excluded\n---\n# Excluded\n',
        fileCount: 0,
        version: 1,
      }));
      const handler = makeAuthoringHandler(
        {
          getSkillByName: jest.fn(async () => null),
          getAuthorSkillByName,
          updateSkill,
        },
        {
          accessibleSkillIds: [],
          skillPrimedIdsByName: {},
          activeSkillNames: new Set(['hidden-recovered-skill']),
        },
      );

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_excluded_skill',
          name: 'edit_file',
          args: {
            file_path: 'skills/excluded-skill/SKILL.md',
            old_text: '# Excluded',
            new_text: '# Changed',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('not found or not accessible');
      expect(getAuthorSkillByName).not.toHaveBeenCalled();
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('does not treat stale same-author recovery as a hidden-skill prime', async () => {
      const updateSkill = jest.fn();
      const handler = makeAuthoringHandler(
        {
          getSkillByName: jest.fn(async () => null),
          getAuthorSkillByName: jest.fn(async () => ({
            _id: SKILL_ID,
            name: 'hidden-recovered-skill',
            body: '---\nname: hidden-recovered-skill\ndescription: Hidden\n---\n# Hidden\n',
            fileCount: 0,
            version: 1,
            disableModelInvocation: true,
          })),
          updateSkill,
        },
        {
          accessibleSkillIds: [],
          skillPrimedIdsByName: {},
          activeSkillNames: new Set(['hidden-recovered-skill']),
        },
      );

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_recovered_hidden_skill',
          name: 'edit_file',
          args: {
            file_path: 'skills/hidden-recovered-skill/SKILL.md',
            old_text: '# Hidden',
            new_text: '# Changed',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('cannot be authored by the model');
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('edits a bundled skill file and returns strategies plus a diff', async () => {
      const saveSkillFileContent = jest.fn(async () => ({
        bytes: 10,
        relativePath: 'references/a.md',
      }));
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'edit-skill',
          body: '# Existing',
          fileCount: 1,
          version: 1,
        })),
        getSkillFileByPath: jest.fn(async () => ({
          content: 'hello old\n',
          isBinary: false,
          mimeType: 'text/markdown',
          bytes: 10,
          filepath: '/tmp/a.md',
          source: 'local',
          relativePath: 'references/a.md',
        })),
        saveSkillFileContent,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_file',
          name: 'edit_file',
          args: {
            file_path: 'skills/edit-skill/references/a.md',
            old_text: 'hello old',
            new_text: 'hello new',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Strategies: exact');
      expect(result.content).toContain('-hello old');
      expect(result.content).toContain('+hello new');
      expect(result.artifact).toMatchObject({
        path: 'skills/edit-skill/references/a.md',
        edits: 1,
        strategies: ['exact'],
      });
      expect(saveSkillFileContent).toHaveBeenCalledWith(
        expect.objectContaining({
          relativePath: 'references/a.md',
          content: 'hello new\n',
          mimeType: 'text/markdown',
        }),
      );
    });

    it('rejects bundled skill file writes when the skill version changed after reading', async () => {
      const getSkillByName = jest
        .fn()
        .mockResolvedValueOnce({
          _id: SKILL_ID,
          name: 'edit-skill',
          body: '# Existing',
          fileCount: 1,
          version: 1,
        })
        .mockResolvedValueOnce({
          _id: SKILL_ID,
          name: 'edit-skill',
          body: '# Existing changed elsewhere',
          fileCount: 1,
          version: 2,
        });
      const saveSkillFileContent = jest.fn();
      const handler = makeAuthoringHandler({
        getSkillByName,
        getSkillFileByPath: jest.fn(async () => ({
          content: 'hello old\n',
          isBinary: false,
          mimeType: 'text/markdown',
          bytes: 10,
          filepath: '/tmp/a.md',
          source: 'local',
          relativePath: 'references/a.md',
        })),
        saveSkillFileContent,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_stale_bundled_file',
          name: 'edit_file',
          args: {
            file_path: 'skills/edit-skill/references/a.md',
            old_text: 'hello old',
            new_text: 'hello new',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('changed while editing');
      expect(result.errorMessage).toContain('skills/edit-skill/references/a.md');
      expect(saveSkillFileContent).not.toHaveBeenCalled();
    });

    it('passes structured frontmatter when editing SKILL.md', async () => {
      const oldBody =
        '---\nname: runtime-skill\ndescription: Use before\naction: ignored\n---\n# Body\n';
      const currentBody =
        '---\nname: runtime-skill\ndescription: Use before\nuser-invocable: true\ndisable-model-invocation: false\nallowed-tools:\n  - web_search\nalways-apply: true\n---\n# Body\n';
      const updateSkill = jest.fn(async () => ({
        status: 'updated',
        skill: {
          _id: SKILL_ID,
          name: 'runtime-skill',
          body: currentBody,
          version: 2,
        },
      }));
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'runtime-skill',
          body: oldBody,
          fileCount: 0,
          version: 1,
        })),
        updateSkill: updateSkill as unknown as ToolExecuteOptions['updateSkill'],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_skill_md_frontmatter',
          name: 'edit_file',
          args: {
            file_path: 'skills/runtime-skill/SKILL.md',
            old_text: 'description: Use before\naction: ignored',
            new_text:
              'description: Use before\nuser-invocable: false\ndisable-model-invocation: true\nallowed-tools:\n  - execute_code\nalways-apply: true',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(updateSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            alwaysApply: true,
            frontmatter: expect.objectContaining({
              name: 'runtime-skill',
              description: 'Use before',
              'user-invocable': false,
              'disable-model-invocation': true,
              'allowed-tools': ['execute_code'],
              'always-apply': true,
            }),
          }),
        }),
      );
    });

    it('preserves block-scalar SKILL.md descriptions when editing skills', async () => {
      const oldBody = '---\nname: runtime-skill\ndescription: Use before\n---\n# Runtime skill\n';
      const updateSkill = jest.fn(async () => ({
        status: 'updated',
        skill: {
          _id: SKILL_ID,
          name: 'runtime-skill',
          body: oldBody,
          version: 2,
        },
      }));
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'runtime-skill',
          body: oldBody,
          fileCount: 0,
          version: 1,
        })),
        updateSkill: updateSkill as unknown as ToolExecuteOptions['updateSkill'],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_skill_md_block_description',
          name: 'edit_file',
          args: {
            file_path: 'skills/runtime-skill/SKILL.md',
            old_text: 'description: Use before',
            new_text:
              'description: |-\n  Use this skill for long descriptions.\n  Keep both lines searchable.',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(updateSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            description: 'Use this skill for long descriptions.\nKeep both lines searchable.',
            frontmatter: expect.objectContaining({
              description: 'Use this skill for long descriptions.\nKeep both lines searchable.',
            }),
          }),
        }),
      );
    });

    it('rejects edit_file attempts to rename a skill through SKILL.md frontmatter', async () => {
      const oldBody = '---\nname: runtime-skill\ndescription: Use before\n---\n# Runtime skill\n';
      const updateSkill = jest.fn();
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'runtime-skill',
          body: oldBody,
          fileCount: 0,
          version: 1,
        })),
        updateSkill: updateSkill as unknown as ToolExecuteOptions['updateSkill'],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_skill_md_name',
          name: 'edit_file',
          args: {
            file_path: 'skills/runtime-skill/SKILL.md',
            old_text: 'name: runtime-skill',
            new_text: 'name: dev-toolkit',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain(
        'frontmatter name "dev-toolkit" must match path skill name "runtime-skill"',
      );
      expect(result.errorMessage).toContain('edit_file cannot rename skills');
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('fails loudly when edit_file old_text is ambiguous', async () => {
      const saveSkillFileContent = jest.fn();
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'ambiguous-skill',
          body: '# Existing',
          fileCount: 1,
          version: 1,
        })),
        getSkillFileByPath: jest.fn(async () => ({
          content: 'same\nsame\n',
          isBinary: false,
          mimeType: 'text/markdown',
          bytes: 10,
          filepath: '/tmp/a.md',
          source: 'local',
          relativePath: 'references/a.md',
        })),
        saveSkillFileContent,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_ambiguous',
          name: 'edit_file',
          args: {
            file_path: 'skills/ambiguous-skill/references/a.md',
            old_text: 'same',
            new_text: 'different',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('matched 2 locations');
      expect(saveSkillFileContent).not.toHaveBeenCalled();
    });

    it('blocks authoring hidden skills unless they were primed this turn', async () => {
      const updateSkill = jest.fn();
      const handler = makeAuthoringHandler(
        {
          getSkillByName: jest.fn(async () => ({
            _id: SKILL_ID,
            name: 'hidden-skill',
            body: '---\nname: hidden-skill\ndescription: Hidden\n---\n# Hidden\n',
            fileCount: 0,
            version: 1,
            disableModelInvocation: true,
          })),
          updateSkill: updateSkill as unknown as ToolExecuteOptions['updateSkill'],
        },
        {
          skillPrimedIdsByName: {},
          activeSkillNames: new Set(['hidden-skill']),
        },
      );

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_hidden_skill',
          name: 'edit_file',
          args: {
            file_path: 'skills/hidden-skill/SKILL.md',
            old_text: '# Hidden',
            new_text: '# Changed',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('cannot be authored by the model');
      expect(updateSkill).not.toHaveBeenCalled();
    });

    it('allows authoring a hidden skill that was primed this turn', async () => {
      const updateSkill = jest.fn(async () => ({
        status: 'updated',
        skill: {
          _id: SKILL_ID,
          name: 'primed-hidden-skill',
          body: '---\nname: primed-hidden-skill\ndescription: Hidden\n---\n# Changed\n',
          version: 2,
        },
      }));
      const handler = makeAuthoringHandler(
        {
          getSkillByName: jest.fn(async () => ({
            _id: SKILL_ID,
            name: 'primed-hidden-skill',
            body: '---\nname: primed-hidden-skill\ndescription: Hidden\n---\n# Hidden\n',
            fileCount: 0,
            version: 1,
            disableModelInvocation: true,
          })),
          updateSkill: updateSkill as unknown as ToolExecuteOptions['updateSkill'],
        },
        {
          skillPrimedIdsByName: { 'primed-hidden-skill': SKILL_ID.toString() },
          activeSkillNames: new Set(['primed-hidden-skill']),
        },
      );

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_primed_hidden_skill',
          name: 'edit_file',
          args: {
            file_path: 'skills/primed-hidden-skill/SKILL.md',
            old_text: '# Hidden',
            new_text: '# Changed',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(updateSkill).toHaveBeenCalled();
    });

    it('overwrites large bundled skill files without reading the old content', async () => {
      const saveSkillFileContent = jest.fn(async () => ({
        bytes: 11,
        relativePath: 'references/large.md',
      }));
      const getStrategyFunctions = jest.fn();
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'large-skill',
          body: '# Existing',
          fileCount: 1,
          version: 1,
        })),
        getSkillFileByPath: jest.fn(async () => ({
          isBinary: false,
          mimeType: 'text/markdown',
          bytes: 600 * 1024,
          filepath: '/tmp/large.md',
          source: 'local',
          relativePath: 'references/large.md',
        })),
        getStrategyFunctions,
        saveSkillFileContent,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_overwrite_large',
          name: 'create_file',
          args: {
            file_path: 'skills/large-skill/references/large.md',
            content: 'replacement',
            overwrite: true,
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Updated skills/large-skill/references/large.md');
      expect(saveSkillFileContent).toHaveBeenCalledWith(
        expect.objectContaining({
          relativePath: 'references/large.md',
          content: 'replacement',
        }),
      );
      expect(getStrategyFunctions).not.toHaveBeenCalled();
    });

    it('serializes same-file authoring calls so later edits see prior writes', async () => {
      let storedContent = 'one\n';
      const saveSkillFileContent = jest.fn(async ({ content }: { content: string }) => {
        storedContent = content;
        return {
          bytes: Buffer.byteLength(content, 'utf8'),
          relativePath: 'references/a.md',
        };
      });
      const handler = makeAuthoringHandler({
        getSkillByName: jest.fn(async () => ({
          _id: SKILL_ID,
          name: 'serial-skill',
          body: '# Existing',
          fileCount: 1,
          version: 1,
        })),
        getSkillFileByPath: jest.fn(async () => ({
          content: storedContent,
          isBinary: false,
          mimeType: 'text/markdown',
          bytes: Buffer.byteLength(storedContent, 'utf8'),
          filepath: '/tmp/a.md',
          source: 'local',
          relativePath: 'references/a.md',
        })),
        saveSkillFileContent,
      });

      const results = await invokeHandler(handler, [
        {
          id: 'call_edit_one',
          name: 'edit_file',
          args: {
            file_path: 'skills/serial-skill/references/a.md',
            old_text: 'one',
            new_text: 'two',
          },
        },
        {
          id: 'call_edit_two',
          name: 'edit_file',
          args: {
            file_path: 'skills/serial-skill/references/a.md',
            old_text: 'two',
            new_text: 'three',
          },
        },
      ]);

      expect(results.map((r) => r.status)).toEqual(['success', 'success']);
      expect(storedContent).toBe('three\n');
      expect(saveSkillFileContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('file authoring tools for code-exec sandbox files', () => {
    const req = {
      user: { id: 'user-1' },
      config: {},
    } as never;

    function makeSandboxAuthoringHandler(params: Partial<ToolExecuteOptions>) {
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: {
          req,
          codeEnvAvailable: true,
          accessibleSkillIds: [],
          skillAuthoringAvailable: false,
          fileAuthoringToolNames: new Set(['create_file', 'edit_file']),
        },
      }));
      return createToolExecuteHandler({
        loadTools,
        ...params,
      });
    }

    it('creates a sandbox file when it does not already exist', async () => {
      const readSandboxFile = jest.fn(async () => {
        throw new Error('cat: /mnt/data/new.txt: No such file or directory');
      });
      const writeSandboxFile = jest.fn(async () => ({
        stdout: 'WROTE 11 bytes to /mnt/data/new.txt\n',
        session_id: 'sess-new',
        files: [{ id: 'file-new', name: 'new.txt', storage_session_id: 'sess-new' }],
      }));
      const handler = makeSandboxAuthoringHandler({
        readSandboxFile,
        writeSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_sandbox',
          name: 'create_file',
          args: {
            file_path: '/mnt/data/new.txt',
            content: 'hello world',
          },
          codeSessionContext: {
            session_id: 'sess-prev',
            files: [{ id: 'f1', name: 'input.csv', session_id: 'sess-prev' }],
          },
        } as unknown as ToolCallRequest,
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Created /mnt/data/new.txt');
      expect(result.artifact).toMatchObject({
        path: '/mnt/data/new.txt',
        created: true,
        session_id: 'sess-new',
        files: [{ id: 'file-new', name: 'new.txt' }],
      });
      expect(writeSandboxFile).toHaveBeenCalledWith({
        file_path: '/mnt/data/new.txt',
        content: 'hello world',
        session_id: 'sess-prev',
        files: [{ id: 'f1', name: 'input.csv', session_id: 'sess-prev' }],
        req,
      });
    });

    it('refuses to overwrite an existing sandbox file without overwrite: true', async () => {
      const writeSandboxFile = jest.fn();
      const handler = makeSandboxAuthoringHandler({
        readSandboxFile: jest.fn(async () => ({ content: 'existing text\n' })),
        writeSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_create_existing_sandbox',
          name: 'create_file',
          args: {
            file_path: '/mnt/data/existing.txt',
            content: 'new text\n',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('overwrite: true');
      expect(writeSandboxFile).not.toHaveBeenCalled();
    });

    it('edits a sandbox file and returns diff, strategies, and session artifact', async () => {
      const writeSandboxFile = jest.fn(async () => ({
        stdout: 'WROTE 10 bytes to /mnt/data/edit.txt\n',
        session_id: 'sess-edit',
        files: [{ id: 'file-edit', name: 'edit.txt', storage_session_id: 'sess-edit' }],
      }));
      const handler = makeSandboxAuthoringHandler({
        readSandboxFile: jest.fn(async () => ({ content: 'alpha old\n' })),
        writeSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_edit_sandbox',
          name: 'edit_file',
          args: {
            file_path: '/mnt/data/edit.txt',
            old_text: 'alpha old',
            new_text: 'alpha new',
          },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).toContain('Strategies: exact');
      expect(result.content).toContain('-alpha old');
      expect(result.content).toContain('+alpha new');
      expect(result.artifact).toMatchObject({
        path: '/mnt/data/edit.txt',
        edits: 1,
        strategies: ['exact'],
        session_id: 'sess-edit',
      });
      expect(writeSandboxFile).toHaveBeenCalledWith(
        expect.objectContaining({
          file_path: '/mnt/data/edit.txt',
          content: 'alpha new\n',
        }),
      );
    });

    it('propagates newly created sandbox sessions to queued same-path authoring calls', async () => {
      let readCount = 0;
      let writeCount = 0;
      const sandboxFiles = [
        { id: 'file-queued', name: 'queued.txt', storage_session_id: 'sess-new' },
      ];
      const readSandboxFile = jest.fn(
        async ({
          session_id,
          files,
        }: {
          session_id?: string;
          files?: Array<{ id: string; name: string; storage_session_id?: string }>;
        }) => {
          readCount++;
          if (readCount === 1) {
            throw new Error('cat: /mnt/data/queued.txt: No such file or directory');
          }

          expect(session_id).toBe('sess-new');
          expect(files).toEqual(sandboxFiles);
          return { content: 'hello world\n' };
        },
      );
      const writeSandboxFile = jest.fn(
        async ({
          session_id,
          files,
          content,
        }: {
          session_id?: string;
          files?: Array<{ id: string; name: string; storage_session_id?: string }>;
          content: string;
        }) => {
          writeCount++;
          if (writeCount === 1) {
            expect(session_id).toBeUndefined();
            expect(files).toBeUndefined();
            expect(content).toBe('hello world\n');
          } else {
            expect(session_id).toBe('sess-new');
            expect(files).toEqual(sandboxFiles);
            expect(content).toBe('goodbye world\n');
          }
          return {
            stdout: `WROTE ${content.length} bytes to /mnt/data/queued.txt\n`,
            session_id: 'sess-new',
            files: sandboxFiles,
          };
        },
      );
      const handler = makeSandboxAuthoringHandler({
        readSandboxFile,
        writeSandboxFile,
      });

      const results = await invokeHandler(handler, [
        {
          id: 'call_create_queued_sandbox',
          name: 'create_file',
          args: {
            file_path: '/mnt/data/queued.txt',
            content: 'hello world\n',
          },
        },
        {
          id: 'call_edit_queued_sandbox',
          name: 'edit_file',
          args: {
            file_path: '/mnt/data/queued.txt',
            old_text: 'hello world',
            new_text: 'goodbye world',
          },
        },
      ]);

      expect(results.map((result) => result.status)).toEqual(['success', 'success']);
      expect(readSandboxFile).toHaveBeenCalledTimes(2);
      expect(writeSandboxFile).toHaveBeenCalledTimes(2);
    });

    it('rejects non-skill paths when code execution is unavailable', async () => {
      const writeSandboxFile = jest.fn();
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: {
          req,
          codeEnvAvailable: false,
          accessibleSkillIds: [],
          skillAuthoringAvailable: false,
          fileAuthoringToolNames: new Set(['create_file', 'edit_file']),
        },
      }));
      const handler = createToolExecuteHandler({
        loadTools,
        writeSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_no_code_env_authoring',
          name: 'create_file',
          args: {
            file_path: '/mnt/data/nope.txt',
            content: 'nope',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('code execution enabled');
      expect(writeSandboxFile).not.toHaveBeenCalled();
    });

    it('rejects skills/ paths for code-exec-only agents', async () => {
      const createSkill = jest.fn();
      const writeSandboxFile = jest.fn();
      const handler = makeSandboxAuthoringHandler({
        getSkillByName: jest.fn(async () => null),
        createSkill: createSkill as unknown as ToolExecuteOptions['createSkill'],
        writeSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_code_only_skill_path',
          name: 'create_file',
          args: {
            file_path: 'skills/nope/SKILL.md',
            content: '---\nname: nope\ndescription: Nope\n---\n# Nope\n',
          },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Skill file authoring is not available');
      expect(createSkill).not.toHaveBeenCalled();
      expect(writeSandboxFile).not.toHaveBeenCalled();
    });
  });

  describe('read_file sandbox fallback (code-env paths + non-skill segments)', () => {
    function makeReadFileHandler(params: {
      codeEnvAvailable?: boolean;
      accessibleSkillIds?: unknown[];
      activeSkillNames?: Set<string>;
      skillPrimedIdsByName?: Record<string, string>;
      skillAuthoringAvailable?: boolean;
      req?: unknown;
      readSandboxFile?: ToolExecuteOptions['readSandboxFile'];
      getSkillByName?: ToolExecuteOptions['getSkillByName'];
      getAuthorSkillByName?: ToolExecuteOptions['getAuthorSkillByName'];
    }) {
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: {
          req: params.req,
          codeEnvAvailable: params.codeEnvAvailable === true,
          accessibleSkillIds: params.accessibleSkillIds ?? [],
          activeSkillNames: params.activeSkillNames,
          skillPrimedIdsByName: params.skillPrimedIdsByName,
          skillAuthoringAvailable: params.skillAuthoringAvailable === true,
        },
      }));
      return createToolExecuteHandler({
        loadTools,
        getSkillByName: params.getSkillByName,
        getAuthorSkillByName: params.getAuthorSkillByName,
        readSandboxFile: params.readSandboxFile,
      });
    }

    it('routes /mnt/data/ paths to the sandbox fallback when codeEnv is available', async () => {
      const readSandboxFile = jest.fn(async () => ({ content: 'hello-world' }));
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_mnt_1',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/sentinel.txt' },
          codeSessionContext: {
            session_id: 'sess-X',
            files: [{ id: 'f1', name: 'sentinel.txt', session_id: 'sess-X' }],
          },
        } as unknown as ToolCallRequest,
      ]);

      expect(readSandboxFile).toHaveBeenCalledWith({
        file_path: '/mnt/data/sentinel.txt',
        session_id: 'sess-X',
        files: [{ id: 'f1', name: 'sentinel.txt', session_id: 'sess-X' }],
      });
      expect(result.status).toBe('success');
      expect(result.content).toContain('hello-world');
    });

    it('returns a clear error for /mnt/data/ when codeEnv is not available', async () => {
      const readSandboxFile = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: false,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_mnt_2',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/sentinel.txt' },
        },
      ]);

      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('code-execution sandbox path');
    });

    it('falls back to sandbox when first segment is not a known skill name', async () => {
      const readSandboxFile = jest.fn(async () => ({ content: 'sandbox-data' }));
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        activeSkillNames: new Set(['only-real-skill']),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_unknown_skill',
          name: Constants.READ_FILE,
          args: { file_path: 'not-a-skill/foo.md' },
          codeSessionContext: { session_id: 'sess-Y' },
        } as unknown as ToolCallRequest,
      ]);

      expect(readSandboxFile).toHaveBeenCalledWith(
        expect.objectContaining({ file_path: 'not-a-skill/foo.md', session_id: 'sess-Y' }),
      );
      expect(result.status).toBe('success');
      expect(result.content).toContain('sandbox-data');
    });

    it('does NOT misroute primed skills outside the catalog cap to the sandbox', async () => {
      /**
       * Regression for review P2 #2: manual ($-popover) and always-apply
       * primes are intentionally resolved off the wider `accessibleSkillIds`
       * ACL set BEFORE catalog injection — see `resolveManualSkills`.
       * A primed skill name can therefore legitimately be ABSENT from
       * `activeSkillNames` (which reflects the catalog after the
       * `SKILL_CATALOG_LIMIT` cap and active filter).
       *
       * Without the primed-bypass, the `activeSkillNames` shortcut would
       * misroute `read_file("primed-only-skill/references/foo.md")` to
       * the sandbox even though the primed skill is in scope and
       * `getSkillByName` would resolve it via the pinned `_id`.
       */
      const primedHex = '507f1f77bcf86cd799439060';
      const getSkillByName = jest.fn(async () => ({
        _id: primedHex as unknown as never,
        name: 'primed-only-skill',
        body: '# Primed skill body',
        fileCount: 1,
        version: 1,
      }));
      const readSandboxFile = jest.fn();
      const getSkillFileByPath = jest.fn(async () => ({
        content: 'references content',
        mimeType: 'text/markdown',
        bytes: 18,
        filepath: 'references/foo.md',
        source: 'local',
        relativePath: 'references/foo.md',
        isBinary: false,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
            codeEnvAvailable: true,
            accessibleSkillIds: skillsInScope(),
            /* Catalog visible names DO NOT include the primed skill — it's
               outside the cap. */
            activeSkillNames: new Set(['some-other-skill']),
            /* But the prime resolver authorized it for this turn. */
            skillPrimedIdsByName: { 'primed-only-skill': primedHex },
          },
        })),
        getSkillByName,
        getSkillFileByPath,
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_primed_outside_catalog',
          name: Constants.READ_FILE,
          args: { file_path: 'primed-only-skill/references/foo.md' },
        },
      ]);

      // Primed skill resolved through the existing skill path, not the
      // sandbox shortcut.
      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(getSkillByName).toHaveBeenCalledWith('primed-only-skill', expect.any(Array), {});
      expect(result.status).toBe('success');
      expect(result.content).toContain('references content');
    });

    it('rehydrates same-author skills when activeSkillNames is stale', async () => {
      const { Types } = jest.requireActual('mongoose') as typeof import('mongoose');
      const skillId = new Types.ObjectId();
      const req = {
        user: {
          id: 'user-1',
          _id: new Types.ObjectId(),
          role: 'USER',
        },
      } as never;
      const recoveredSkill = {
        _id: skillId,
        name: 'stale-catalog-skill',
        body: '# Recovered Body',
        fileCount: 0,
        version: 4,
      };
      const getAuthorSkillByName = jest.fn(async () => recoveredSkill);
      const getSkillByName = jest.fn(async (_name: string, ids: unknown[]) =>
        ids.some((id) => id?.toString() === skillId.toString()) ? recoveredSkill : null,
      );
      const readSandboxFile = jest.fn();
      const handler = makeReadFileHandler({
        req,
        codeEnvAvailable: true,
        skillAuthoringAvailable: true,
        accessibleSkillIds: skillsInScope(),
        activeSkillNames: new Set(['stale-catalog-skill']),
        readSandboxFile,
        getAuthorSkillByName,
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_stale_catalog_skill',
          name: Constants.READ_FILE,
          args: { file_path: 'stale-catalog-skill/SKILL.md' },
        },
      ]);

      expect(getAuthorSkillByName).toHaveBeenCalledWith({ req, name: 'stale-catalog-skill' });
      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(getSkillByName).toHaveBeenCalledWith(
        'stale-catalog-skill',
        expect.arrayContaining([skillId]),
        expect.objectContaining({ preferModelInvocable: true }),
      );
      expect(result.status).toBe('success');
      expect(result.content).toContain('Recovered Body');
    });

    it('routes through sandbox when skills are not effectively enabled (empty accessibleSkillIds)', async () => {
      /**
       * `accessibleSkillIds: []` is what `resolveAgentScopedSkillIds`
       * returns when the admin capability is off, the ephemeral badge is
       * off, or the persisted agent has `skills_enabled !== true`. Skip
       * the skill resolver entirely.
       */
      const readSandboxFile = jest.fn(async () => ({ content: 'sandbox-content' }));
      const getSkillByName = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: [],
        readSandboxFile,
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_skills_off',
          name: Constants.READ_FILE,
          args: { file_path: 'whatever/path.md' },
        },
      ]);

      expect(getSkillByName).not.toHaveBeenCalled();
      expect(readSandboxFile).toHaveBeenCalled();
      expect(result.status).toBe('success');
      expect(result.content).toContain('sandbox-content');
    });

    it('returns a clear error when skills off + codeEnv off (nowhere to route)', async () => {
      const handler = makeReadFileHandler({
        codeEnvAvailable: false,
        accessibleSkillIds: [],
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_no_route',
          name: Constants.READ_FILE,
          args: { file_path: 'whatever/path.md' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Skill files are not available');
    });

    it('still resolves a real skill when activeSkillNames knows the name', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'real-skill-id' as unknown as never,
        name: 'real-skill',
        body: '# Real Body',
        fileCount: 0,
        version: 1,
      }));
      const readSandboxFile = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        activeSkillNames: new Set(['real-skill']),
        readSandboxFile,
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_real_skill',
          name: Constants.READ_FILE,
          args: { file_path: 'real-skill/SKILL.md' },
        },
      ]);

      expect(getSkillByName).toHaveBeenCalled();
      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(result.status).toBe('success');
      expect(result.content).toContain('Real Body');
    });

    it('resolves authored skills/{skillName}/... paths without falling back to sandbox', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'real-skill-id' as unknown as never,
        name: 'real-skill',
        body: '# Real Body',
        fileCount: 0,
        version: 1,
      }));
      const readSandboxFile = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        activeSkillNames: new Set(['real-skill']),
        readSandboxFile,
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_real_skill_namespace',
          name: Constants.READ_FILE,
          args: { file_path: 'skills/real-skill/SKILL.md' },
        },
      ]);

      expect(getSkillByName).toHaveBeenCalledWith(
        'real-skill',
        expect.any(Array),
        expect.objectContaining({ preferModelInvocable: true }),
      );
      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(result.status).toBe('success');
      expect(result.content).toContain('File: skills/real-skill/SKILL.md');
      expect(result.content).toContain('Real Body');
    });

    it('does not route explicit skills/ paths to the sandbox when skills are unavailable', async () => {
      const readSandboxFile = jest.fn(async () => ({ content: 'sandbox-content' }));
      const getSkillByName = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: [],
        readSandboxFile,
        getSkillByName,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_explicit_skill_namespace_off',
          name: Constants.READ_FILE,
          args: { file_path: 'skills/whatever/SKILL.md' },
        },
      ]);

      expect(getSkillByName).not.toHaveBeenCalled();
      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Skill files are not available');
    });

    it('falls back to sandbox for trailing-slash paths (empty relativePath, codeEnv on)', async () => {
      /**
       * Regression for review Finding #4: `read_file("output/")` is
       * malformed-but-unambiguously-not-a-skill. Previously this branch
       * dead-ended with `Missing file path after skill name`; with code
       * execution available it should route to the sandbox like every
       * other malformed-path branch.
       */
      const readSandboxFile = jest.fn(async () => ({ content: 'whatever' }));
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_trailing_slash',
          name: Constants.READ_FILE,
          args: { file_path: 'output/' },
        },
      ]);

      expect(readSandboxFile).toHaveBeenCalledWith(
        expect.objectContaining({ file_path: 'output/' }),
      );
      expect(result.status).toBe('success');
    });

    it('still errors on trailing-slash paths when codeEnv is off (no sandbox to route to)', async () => {
      const readSandboxFile = jest.fn();
      const handler = makeReadFileHandler({
        codeEnvAvailable: false,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_trailing_slash_no_env',
          name: Constants.READ_FILE,
          args: { file_path: 'output/' },
        },
      ]);

      expect(readSandboxFile).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Missing file path after skill name');
    });

    it('hints toward bash_tool when readSandboxFile is not configured', async () => {
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        // readSandboxFile intentionally omitted
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_no_callback',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/x.txt' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('bash_tool');
    });

    it('caps sandbox fallback content at MAX_READABLE_BYTES before line-numbering (Codex review #1)', async () => {
      /**
       * Without the cap, `addLineNumbers` would allocate a SECOND
       * full-size string with per-line prefixes, materializing ~2x
       * the file in memory before downstream truncation kicks in.
       * Match the skill-file path's 256KB ceiling: truncate the raw
       * content first, then number, and surface the truncation to
       * the model so it knows to use `bash_tool` for the rest.
       */
      const oversize = 'A'.repeat(300_000); // 300KB > 256KB MAX_READABLE_BYTES
      const readSandboxFile = jest.fn(async () => ({ content: oversize }));
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_huge_file',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/huge.log' },
        },
      ]);

      expect(result.status).toBe('success');
      // `addLineNumbers` of a 256KB single-char run roughly preserves
      // the 256KB payload size (one char per line is impossible — the
      // content is one long line — so the line-prefix overhead is a
      // few bytes total). Either way the prefix-stripped content
      // length should NOT exceed the cap.
      expect((result.content as string).length).toBeLessThan(oversize.length);
      expect(result.content).toContain('truncated at 262144 bytes');
      expect(result.content).toContain('bash_tool');
      expect(result.content).toContain('huge.log');
    });

    it('does not truncate when sandbox content is within MAX_READABLE_BYTES', async () => {
      const readSandboxFile = jest.fn(async () => ({ content: 'sentinel-XYZ-1234\n' }));
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_small_file',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/sentinel.txt' },
        },
      ]);

      expect(result.status).toBe('success');
      expect(result.content).not.toContain('truncated');
      expect(result.content).toContain('sentinel-XYZ-1234');
    });

    it('surfaces sandbox fallback failures with a bash_tool retry hint', async () => {
      const readSandboxFile = jest.fn(async () => null);
      const handler = makeReadFileHandler({
        codeEnvAvailable: true,
        accessibleSkillIds: skillsInScope(),
        readSandboxFile,
      });

      const [result] = await invokeHandler(handler, [
        {
          id: 'call_null_result',
          name: Constants.READ_FILE,
          args: { file_path: '/mnt/data/missing.txt' },
        },
      ]);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('Failed to read');
      expect(result.errorMessage).toContain('bash_tool');
    });

    describe('binary file guard', () => {
      /**
       * Regression for the matplotlib-shape bug where `read_file` on
       * `/mnt/data/simple_graph.png` shelled `cat` through codeapi and
       * line-numbered the lossy-string-decoded PNG bytes back to the
       * model. The guard short-circuits BEFORE the network call for any
       * extension that can never round-trip through codeapi's JSON
       * `/exec` transport, and falls back to a NUL-byte sniff after the
       * read for unknown extensions.
       */
      it('rejects images by extension without ever calling readSandboxFile', async () => {
        const readSandboxFile = jest.fn();
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_png',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/simple_graph.png' },
            codeSessionContext: { session_id: 'sess-Z' },
          } as unknown as ToolCallRequest,
        ]);

        expect(readSandboxFile).not.toHaveBeenCalled();
        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('image file');
        expect(result.errorMessage).toContain('.png');
        expect(result.errorMessage).toContain('already attached');
        expect(result.errorMessage).toContain('bash_tool');
      });

      it('rejects non-image binary types with a bash-pointing message (not the image-attachment hint)', async () => {
        const readSandboxFile = jest.fn();
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_zip',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/archive.zip' },
          },
        ]);

        expect(readSandboxFile).not.toHaveBeenCalled();
        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('binary file');
        expect(result.errorMessage).toContain('.zip');
        expect(result.errorMessage).not.toContain('already attached');
        expect(result.errorMessage).toContain('bash_tool');
      });

      it('is case-insensitive on the extension match (PNG vs .png)', async () => {
        const readSandboxFile = jest.fn();
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_uppercase',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/CHART.PNG' },
          },
        ]);

        expect(readSandboxFile).not.toHaveBeenCalled();
        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('image file');
      });

      it('rejects binary content (NUL bytes) post-fetch when the extension was unknown', async () => {
        /* No extension → no precheck shortcut → read goes through, but the
         * NUL-byte sniff catches it before line-numbering. Mojibake from
         * codeapi's lossy JSON-encoding still round-trips through whatever
         * string LibreChat builds, and the NUL terminator from the binary
         * header survives that. */
        const binaryWithNul = '\x00\x00\x00\rIHDR\x00\x00\x04';
        const readSandboxFile = jest.fn(async () => ({ content: binaryWithNul }));
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_nul_sniff',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/mystery_file' },
          },
        ]);

        expect(readSandboxFile).toHaveBeenCalled();
        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('binary');
        expect(result.errorMessage).toContain('bash_tool');
        // The bytes themselves never reach the model.
        expect(result.content).toBe('');
      });

      it('still allows text files with binary-adjacent extensions (e.g. log.txt → readable)', async () => {
        const readSandboxFile = jest.fn(async () => ({ content: 'plain text\nline 2' }));
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_text',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/notes.txt' },
          },
        ]);

        expect(readSandboxFile).toHaveBeenCalled();
        expect(result.status).toBe('success');
        expect(result.content).toContain('plain text');
      });

      it('does not false-trigger on filenames containing `.` in directory names', async () => {
        /* `lowercaseExtension` must use the basename, not the path —
         * `proj.v1/notes` should yield `''` (no extension), not `.v1/notes`,
         * so the file goes through the normal read path. */
        const readSandboxFile = jest.fn(async () => ({ content: 'text from a dotted-dir path' }));
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_dotted_dir',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/proj.v1/notes' },
          },
        ]);

        expect(readSandboxFile).toHaveBeenCalled();
        expect(result.status).toBe('success');
      });

      it('reads SVG files as text (not blocked by the binary denylist)', async () => {
        /* SVG is XML text — the model has legitimate reasons to inspect
         * or edit generated SVG output (tweaking colors, paths, viewBox).
         * The post-fetch NUL-byte sniff still rejects anything that
         * turns out to be binary despite a `.svg` extension. */
        const svgContent =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n' +
          '  <circle cx="5" cy="5" r="4" />\n' +
          '</svg>';
        const readSandboxFile = jest.fn(async () => ({ content: svgContent }));
        const handler = makeReadFileHandler({
          codeEnvAvailable: true,
          accessibleSkillIds: skillsInScope(),
          readSandboxFile,
        });

        const [result] = await invokeHandler(handler, [
          {
            id: 'call_svg',
            name: Constants.READ_FILE,
            args: { file_path: '/mnt/data/icon.svg' },
          },
        ]);

        expect(readSandboxFile).toHaveBeenCalled();
        expect(result.status).toBe('success');
        expect(result.content).toContain('<svg');
        expect(result.content).toContain('viewBox');
      });
    });
  });
});
