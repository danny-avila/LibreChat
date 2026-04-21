import { Constants } from '@librechat/agents';
import type {
  ToolExecuteBatchRequest,
  ToolExecuteResult,
  ToolCallRequest,
} from '@librechat/agents';
import { createToolExecuteHandler, ToolExecuteOptions } from './handlers';

function createMockTool(name: string, capturedConfigs: Record<string, unknown>[]) {
  return {
    name,
    invoke: jest.fn(async (_args: unknown, config: Record<string, unknown>) => {
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
              { session_id: 'prev-session-abc', id: 'f1', name: 'data.parquet' },
              { session_id: 'prev-session-abc', id: 'f2', name: 'chart.png' },
            ],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBe('prev-session-abc');
      expect(capturedConfigs[0]._injected_files).toEqual([
        { session_id: 'prev-session-abc', id: 'f1', name: 'data.parquet' },
        { session_id: 'prev-session-abc', id: 'f2', name: 'chart.png' },
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
            files: [{ session_id: 'session-A', id: 'fa', name: 'a.csv' }],
          },
        },
        {
          id: 'call_b',
          name: Constants.EXECUTE_CODE,
          args: { lang: 'python', code: 'step_2()' },
          codeSessionContext: {
            session_id: 'session-A',
            files: [{ session_id: 'session-A', id: 'fa', name: 'a.csv' }],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(2);
      for (const config of capturedConfigs) {
        expect(config.session_id).toBe('session-A');
        expect(config._injected_files).toEqual([
          { session_id: 'session-A', id: 'fa', name: 'a.csv' },
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
            files: [{ session_id: 'x', id: 'y', name: 'z' }],
          },
        },
      ];

      await invokeHandler(handler, toolCalls);

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].session_id).toBeUndefined();
      expect(capturedConfigs[0]._injected_files).toBeUndefined();
    });
  });

  describe('skill tool model-invocation gate', () => {
    function createSkillHandler(getSkillByName: ToolExecuteOptions['getSkillByName']) {
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
      }));
      return createToolExecuteHandler({ loadTools, getSkillByName });
    }

    it('rejects with a clear error when the named skill has disableModelInvocation=true', async () => {
      const getSkillByName = jest.fn(async () => ({
        _id: 'skill-id' as unknown as never,
        name: 'pii-redactor',
        body: 'restricted body',
        fileCount: 0,
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
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({ loadedTools: [] })),
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
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
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
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({ loadedTools: [] })),
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
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({ loadedTools: [] })),
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
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
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
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
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
        disableModelInvocation: true,
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
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
      }));
      const handler = createToolExecuteHandler({
        loadTools: jest.fn(async () => ({
          loadedTools: [],
          configurable: {
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

      const [, accessibleIdsArg, lookupOptions] = getSkillByName.mock.calls[0] as [
        string,
        Array<{ toString(): string }>,
        Record<string, unknown>,
      ];
      expect(accessibleIdsArg).toHaveLength(1);
      expect(accessibleIdsArg[0].toString()).toBe(primedHex);
      // Primed lookups do NOT pass preferModelInvocable — the _id pin is
      // authoritative.
      expect(lookupOptions).toEqual({});
    });
  });
});
