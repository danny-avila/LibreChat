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

  describe('read_file sandbox fallback (code-env paths + non-skill segments)', () => {
    function makeReadFileHandler(params: {
      codeEnvAvailable?: boolean;
      accessibleSkillIds?: unknown[];
      activeSkillNames?: Set<string>;
      skillPrimedIdsByName?: Record<string, string>;
      readSandboxFile?: ToolExecuteOptions['readSandboxFile'];
      getSkillByName?: ToolExecuteOptions['getSkillByName'];
    }) {
      const loadTools: ToolExecuteOptions['loadTools'] = jest.fn(async () => ({
        loadedTools: [],
        configurable: {
          codeEnvAvailable: params.codeEnvAvailable === true,
          accessibleSkillIds: params.accessibleSkillIds ?? [],
          activeSkillNames: params.activeSkillNames,
          skillPrimedIdsByName: params.skillPrimedIdsByName,
        },
      }));
      return createToolExecuteHandler({
        loadTools,
        getSkillByName: params.getSkillByName,
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
