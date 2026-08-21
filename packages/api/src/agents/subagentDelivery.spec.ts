import type { PostToolUseHookInput } from '@librechat/agents';
import { SUBAGENT_WAKEUP_GUIDANCE, createSubagentWakeupHandleHook } from './subagentDelivery';

const hookSignal = new AbortController().signal;

function input(toolName: string, toolOutput: unknown): PostToolUseHookInput {
  return {
    hook_event_name: 'PostToolUse',
    toolName,
    toolInput: {},
    toolOutput,
    toolUseId: 'call-1',
  } as PostToolUseHookInput;
}

describe('createSubagentWakeupHandleHook', () => {
  it('replaces the legacy poll-first instruction on a running detached subagent handle', async () => {
    const output = JSON.stringify({
      background_task_id: 'task-1',
      subagent_thread_id: 'thread-1',
      tool: 'subagent',
      subagent_type: 'researcher',
      status: 'running',
      message: 'Poll the host background-task tool.',
    });

    const result = await createSubagentWakeupHandleHook()(input('subagent', output), hookSignal);
    const updated = JSON.parse(result.updatedOutput as string);

    expect(updated).toMatchObject({
      background_task_id: 'task-1',
      subagent_thread_id: 'thread-1',
      status: 'running',
      message: SUBAGENT_WAKEUP_GUIDANCE,
    });
  });

  it('leaves ordinary background tools and terminal subagent results unchanged', async () => {
    const hook = createSubagentWakeupHandleHook();

    await expect(
      hook(
        input('execute_code', JSON.stringify({ background_task_id: 'code-1', status: 'running' })),
        hookSignal,
      ),
    ).resolves.toEqual({});
    await expect(
      hook(
        input('subagent', JSON.stringify({ background_task_id: 'task-1', status: 'completed' })),
        hookSignal,
      ),
    ).resolves.toEqual({});
  });

  it('fails closed on malformed or non-handle subagent output', async () => {
    const hook = createSubagentWakeupHandleHook();

    await expect(hook(input('subagent', 'not-json'), hookSignal)).resolves.toEqual({});
    await expect(
      hook(input('subagent', JSON.stringify({ status: 'running' })), hookSignal),
    ).resolves.toEqual({});
  });
});
