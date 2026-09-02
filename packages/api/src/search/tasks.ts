interface TaskResult {
  status: string;
}

interface TaskClient {
  waitForTask(
    taskUid: number,
    options: { timeOutMs: number; intervalMs: number },
  ): Promise<TaskResult>;
}

/**
 * Waits through bounded Meilisearch client timeouts until a task reaches a terminal state.
 */
export async function waitForMeiliTask(
  client: TaskClient,
  taskUid: number,
  operation: string,
  isTimeoutError: (error: unknown) => boolean,
): Promise<void> {
  while (true) {
    try {
      const task = await client.waitForTask(taskUid, { timeOutMs: 10_000, intervalMs: 100 });
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
