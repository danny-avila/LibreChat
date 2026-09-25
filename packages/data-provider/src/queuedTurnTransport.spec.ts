import { enqueueAgentQueuedTurn } from './data-service';
import * as endpoints from './api-endpoints';
import request from './request';

jest.mock('./request', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const get = jest.mocked(request.get);
const post = jest.mocked(request.post);
const payload = {
  conversationId: 'conversation',
  parentMessageId: 'parent',
  clientRequestId: 'retry-id',
  text: 'later',
};
const v2 = {
  capability: { supported: true, durability: 'durable', protocolVersion: 2 },
  queuedTurns: [],
  revision: 0,
};
const protocolError = {
  response: { status: 409, data: { code: 'QUEUED_TURN_PROTOCOL_REQUIRED' } },
};

beforeEach(() => jest.resetAllMocks());

it('keeps snapshot-free requests on the legacy endpoint without negotiation', async () => {
  await enqueueAgentQueuedTurn(payload);
  expect(get).not.toHaveBeenCalled();
  expect(post).toHaveBeenCalledWith(endpoints.agentQueuedTurns(), payload);
});

it.each(['ask', 'acceptEdits', 'fullAccess'] as const)(
  'requires v2 before sending a %s snapshot',
  async (codeApprovalMode) => {
    get.mockResolvedValue(v2);
    await enqueueAgentQueuedTurn({ ...payload, codeApprovalMode });
    expect(post).toHaveBeenCalledWith(endpoints.agentQueuedTurns(2), {
      ...payload,
      codeApprovalMode,
    });
  },
);

it('rejects an older capability without sending or stripping the snapshot', async () => {
  get.mockResolvedValue({ ...v2, capability: { supported: true, durability: 'durable' } });
  await expect(
    enqueueAgentQueuedTurn({ ...payload, codeApprovalMode: 'fullAccess' }),
  ).rejects.toMatchObject(protocolError);
  expect(post).not.toHaveBeenCalled();
});

it.each([404, 501])(
  'does not downgrade when negotiation and enqueue hit different replicas (%s)',
  async (status) => {
    get.mockResolvedValue(v2);
    post.mockRejectedValue({ response: { status } });
    await expect(
      enqueueAgentQueuedTurn({ ...payload, codeApprovalMode: 'fullAccess' }),
    ).rejects.toMatchObject(protocolError);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(endpoints.agentQueuedTurns(2), expect.anything());
  },
);

it('keeps a lost response ambiguous and retries the same identity and snapshot', async () => {
  get.mockResolvedValue(v2);
  const timeout = new Error('lost response');
  post
    .mockRejectedValueOnce(timeout)
    .mockResolvedValueOnce({ receipt: { queuedTurnId: 'durable-row' } });
  const input = { ...payload, codeApprovalMode: 'acceptEdits' as const };
  await expect(enqueueAgentQueuedTurn(input)).rejects.toBe(timeout);
  await expect(enqueueAgentQueuedTurn(input)).resolves.toMatchObject({
    receipt: { queuedTurnId: 'durable-row' },
  });
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
});
