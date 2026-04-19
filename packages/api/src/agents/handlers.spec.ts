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
  });
});
