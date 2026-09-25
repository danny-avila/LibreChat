import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import {
  createBackgroundTaskCancelHandler,
  createBackgroundTaskIndexHandler,
  createBackgroundTaskPolicyMiddleware,
} from './tasks';
import { BackgroundTaskRegistryClass } from './background';

const conversationId = 'convo-1';

const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const request = ({
  userId = 'user-1',
  cancellation = true,
  body,
}: {
  userId?: string;
  cancellation?: boolean;
  body?: unknown;
} = {}) =>
  ({
    user: { id: userId },
    params: { conversationId },
    body,
    config: {
      endpoints: { agents: { backgroundTasks: { ordinaryToolCancellation: cancellation } } },
    },
  }) as unknown as ServerRequest;

const createTask = (
  registry: BackgroundTaskRegistryClass,
  toolCallId: string,
  requestCancellation: () => boolean | void = jest.fn(),
) => {
  const created = registry.create({
    userId: 'user-1',
    conversationId,
    toolCallId,
    toolName: 'bash_tool',
    messageId: 'message-1',
    requestCancellation,
  });
  if ('atCapacity' in created) {
    throw new Error('unexpected capacity');
  }
  return created.task;
};

describe('background task routes', () => {
  it('loads effective policy without runtime workspace augmentation and fails closed', async () => {
    const req = request();
    const getAppConfig = jest.fn().mockResolvedValue(req.config);
    const next = jest.fn();
    const middleware = createBackgroundTaskPolicyMiddleware({ getAppConfig });
    await middleware(req, response(), next);
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        skipRuntimeAugmentation: true,
        failClosed: true,
      }),
    );
    expect(next).toHaveBeenCalledTimes(1);
    getAppConfig.mockRejectedValue(new Error('policy store unavailable'));
    const failed = response();
    await middleware(req, failed, next);
    expect(failed.status).toHaveBeenCalledWith(503);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('lists only the caller’s tasks without results', () => {
    const registry = new BackgroundTaskRegistryClass();
    const running = createTask(registry, 'call-1');
    const done = createTask(registry, 'call-2');
    registry.complete('user-1', conversationId, done.id, { content: 'secret output' });
    const handler = createBackgroundTaskIndexHandler({ registry });

    const res = response();
    handler(request(), res);
    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body.cancellable).toBe(true);
    expect(body.tasks).toEqual([
      expect.objectContaining({
        taskId: running.id,
        toolName: 'bash_tool',
        toolCallId: 'call-1',
        messageId: 'message-1',
        status: 'running',
        cancellationRequested: false,
      }),
      expect.objectContaining({
        taskId: done.id,
        status: 'completed',
        settledAt: expect.any(String),
      }),
    ]);
    expect(body.tasks[0].settledAt).toBeUndefined();
    expect(body.tasks[1].settledAt).toBe(new Date(done.settledAt!).toISOString());
    const later = jest.spyOn(Date, 'now').mockReturnValue(done.settledAt! + 60_000);
    registry.markCompletionPersistenceFinished('user-1', conversationId, done.id);
    later.mockRestore();
    const afterPersistence = response();
    handler(request(), afterPersistence);
    expect(afterPersistence.json.mock.calls[0][0].tasks[1].settledAt).toBe(body.tasks[1].settledAt);
    expect(JSON.stringify(body)).not.toContain('secret output');

    const other = response();
    handler(request({ userId: 'user-2', cancellation: false }), other);
    expect(other.json).toHaveBeenCalledWith({ conversationId, tasks: [], cancellable: false });
  });

  it('cancels every running task when no ids are given', () => {
    const registry = new BackgroundTaskRegistryClass();
    const abortFirst = jest.fn();
    const abortSecond = jest.fn();
    const first = createTask(registry, 'call-1', abortFirst);
    const second = createTask(registry, 'call-2', abortSecond);
    const done = createTask(registry, 'call-3');
    registry.complete('user-1', conversationId, done.id, { content: 'ok' });
    const handler = createBackgroundTaskCancelHandler({ registry });

    const res = response();
    handler(request({ body: {} }), res);
    expect(res.json).toHaveBeenCalledWith({
      results: [
        { taskId: first.id, status: 'requested' },
        { taskId: second.id, status: 'requested' },
      ],
    });
    expect(abortFirst).toHaveBeenCalledTimes(1);
    expect(abortSecond).toHaveBeenCalledTimes(1);

    const again = response();
    handler(request({ body: { taskIds: [first.id, done.id, 'missing'] } }), again);
    expect(again.json).toHaveBeenCalledWith({
      results: [
        { taskId: first.id, status: 'already_requested' },
        { taskId: done.id, status: 'settled' },
        { taskId: 'missing', status: 'not_found' },
      ],
    });
    expect(abortFirst).toHaveBeenCalledTimes(1);
  });

  it('refuses cancellation when the deployment has not opted in', () => {
    const registry = new BackgroundTaskRegistryClass();
    const abort = jest.fn();
    createTask(registry, 'call-1', abort);
    const res = response();
    createBackgroundTaskCancelHandler({ registry })(request({ cancellation: false }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(abort).not.toHaveBeenCalled();
  });

  it('never reaches another user’s tasks', () => {
    const registry = new BackgroundTaskRegistryClass();
    const abort = jest.fn();
    const task = createTask(registry, 'call-1', abort);
    const res = response();
    createBackgroundTaskCancelHandler({ registry })(
      request({ userId: 'user-2', body: { taskIds: [task.id] } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ results: [{ taskId: task.id, status: 'not_found' }] });
    expect(abort).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies without accidentally cancelling every task', () => {
    const registry = new BackgroundTaskRegistryClass();
    const abort = jest.fn();
    createTask(registry, 'call-1', abort);
    const handler = createBackgroundTaskCancelHandler({ registry });
    for (const body of [
      undefined,
      null,
      'invalid',
      [],
      { taskIds: null },
      { taskIds: undefined },
      { taskIds: [1] },
    ]) {
      const res = response();
      handler(request({ body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(abort).not.toHaveBeenCalled();
    }
  });
});
