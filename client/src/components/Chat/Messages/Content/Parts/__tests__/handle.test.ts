import { parseBackgroundHandle } from '../handle';

describe('parseBackgroundHandle', () => {
  const handle = JSON.stringify({
    background_task_id: 'task-1',
    tool: 'execute_code',
    status: 'running',
    message:
      'Started "execute_code" in the background. Call check_background_task with background_task_id "task-1" to check progress and retrieve the result.',
  });

  it('parses a dispatch handle', () => {
    expect(parseBackgroundHandle(handle)).toEqual(
      expect.objectContaining({ background_task_id: 'task-1', tool: 'execute_code' }),
    );
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBackgroundHandle(`\n  ${handle}  \n`)).not.toBeNull();
  });

  it.each([
    undefined,
    '',
    'stdout:\nhello',
    'Traceback (most recent call last): ...',
    '{"result": "background_task_id mentioned in output"}',
    '{"background_task_id": 42, "tool": "x"}',
    '{"background_task_id": "t"',
  ])('returns null for non-handle output: %s', (output) => {
    expect(parseBackgroundHandle(output)).toBeNull();
  });

  it('returns null for real stdout that mimics the handle without the poll instruction', () => {
    expect(
      parseBackgroundHandle(
        JSON.stringify({
          background_task_id: 'task-1',
          tool: 'execute_code',
          status: 'running',
          message: 'user code printed this',
        }),
      ),
    ).toBeNull();
  });

  it('returns null when extra keys are present (patched real output)', () => {
    expect(
      parseBackgroundHandle(
        JSON.stringify({
          background_task_id: 'task-1',
          tool: 'execute_code',
          status: 'done',
          message: 'mentions check_background_task',
          data: [1, 2, 3],
        }),
      ),
    ).toBeNull();
  });

  it('returns null for oversized payloads (real output, not a handle)', () => {
    const big = JSON.stringify({
      background_task_id: 'task-1',
      tool: 'execute_code',
      padding: 'x'.repeat(2000),
    });
    expect(parseBackgroundHandle(big)).toBeNull();
  });
});
