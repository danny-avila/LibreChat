interface TaskResult {
  status: string;
}

interface TaskClient {
  waitForTask(
    taskUid: number,
    options: { timeOutMs: number; intervalMs: number },
  ): Promise<TaskResult>;
}

interface WaitForMeiliTaskOptions {
  timeoutMs?: number;
}

const DEFAULT_MEILI_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const MEILI_TASK_POLL_TIMEOUT_MS = 10_000;
const MEILI_TASK_POLL_INTERVAL_MS = 100;

/**
 * Waits through Meilisearch client timeout windows until a task reaches a terminal state or the
 * overall deadline expires.
 */
export async function waitForMeiliTask(
  client: TaskClient,
  taskUid: number,
  operation: string,
  isTimeoutError: (error: unknown) => boolean,
  options: WaitForMeiliTaskOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_MEILI_TASK_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Meilisearch task timeout must be a positive finite number');
  }
  const startedAt = Date.now();

  while (true) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error(`${operation} task ${taskUid} did not complete within ${timeoutMs}ms`);
    }

    try {
      const task = await client.waitForTask(taskUid, {
        timeOutMs: Math.min(MEILI_TASK_POLL_TIMEOUT_MS, remainingMs),
        intervalMs: MEILI_TASK_POLL_INTERVAL_MS,
      });
      if (task.status !== 'succeeded') {
        throw new Error(`${operation} task ${taskUid} ended with ${task.status}`);
      }
      return;
    } catch (error) {
      if (isTimeoutError(error)) {
        continue;
      }
      throw error;
    }
  }
}
