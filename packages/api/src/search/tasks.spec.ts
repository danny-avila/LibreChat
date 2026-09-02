import { waitForMeiliTask } from './tasks';

class TaskTimeoutError extends Error {}

describe('waitForMeiliTask', () => {
  test('retries client timeout windows until the task succeeds', async () => {
    const client = {
      waitForTask: jest
        .fn()
        .mockRejectedValueOnce(new TaskTimeoutError('still processing'))
        .mockResolvedValueOnce({ status: 'succeeded' }),
    };

    await expect(
      waitForMeiliTask(
        client,
        17,
        'messages settings',
        (error) => error instanceof TaskTimeoutError,
      ),
    ).resolves.toBeUndefined();

    expect(client.waitForTask).toHaveBeenCalledTimes(2);
    expect(client.waitForTask).toHaveBeenCalledWith(17, {
      timeOutMs: 10_000,
      intervalMs: 100,
    });
  });

  test('reports the operation and terminal task status', async () => {
    const client = {
      waitForTask: jest.fn().mockResolvedValue({ status: 'failed' }),
    };

    await expect(waitForMeiliTask(client, 23, 'messages cleanup', () => false)).rejects.toThrow(
      'messages cleanup task 23 ended with failed',
    );
  });

  test('propagates non-timeout client errors', async () => {
    const client = {
      waitForTask: jest.fn().mockRejectedValue(new Error('Meilisearch unavailable')),
    };

    await expect(waitForMeiliTask(client, 31, 'convos settings', () => false)).rejects.toThrow(
      'Meilisearch unavailable',
    );
  });
});
