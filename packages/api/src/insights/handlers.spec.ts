import type { TInsightsResponse } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createInsightsAccessHandler, createInsightsHandler } from './handlers';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

const emptyInsights: TInsightsResponse = {
  summary: {
    totalUsers: 0,
    totalConversations: 0,
    totalMessages: 0,
    totalTokens: 0,
  },
  daily: [],
  topUsers: [],
  churnedUsers: [],
  latest: { conversations: [], page: 1, pageSize: 10, pages: 1 },
};

const insightsEnabled = jest.fn(() => true);
const insightsDisabled = jest.fn(() => false);

const createResponse = () => {
  const status = jest.fn();
  const json = jest.fn();
  status.mockReturnValue({ json });
  return {
    response: { status, json } as Partial<Response> as Response,
    status,
    json,
  };
};

const createRequest = (query: ServerRequest['query'] = {}): ServerRequest =>
  ({
    query,
    user: { id: 'admin-id', role: 'ADMIN', tenantId: 'tenant-a' },
  }) as ServerRequest;

describe('Insights handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns access when Insights is enabled', async () => {
    const handler = createInsightsAccessHandler({ isInsightsEnabled: insightsEnabled });
    const { response, json } = createResponse();

    await handler(createRequest(), response);

    expect(insightsEnabled).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith({ access: true });
  });

  it('returns 404 from the access endpoint when Insights is disabled', async () => {
    const handler = createInsightsAccessHandler({ isInsightsEnabled: insightsDisabled });
    const { response, status, json } = createResponse();

    await handler(createRequest(), response);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ message: 'Not found' });
  });

  it('returns 404 when Insights is disabled', async () => {
    const getInsights = jest.fn();
    const handler = createInsightsHandler({ isInsightsEnabled: insightsDisabled, getInsights });
    const { response, status, json } = createResponse();

    await handler(createRequest(), response);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ message: 'Not found' });
    expect(getInsights).not.toHaveBeenCalled();
  });

  it('loads a bounded page for the authenticated tenant', async () => {
    const getInsights = jest.fn().mockResolvedValue(emptyInsights);
    const handler = createInsightsHandler({ isInsightsEnabled: insightsEnabled, getInsights });
    const { response, json } = createResponse();

    await handler(
      createRequest({ page: '3', pageSize: '500', tenantId: 'forged-tenant', range: '30d' }),
      response,
    );

    expect(getInsights).toHaveBeenCalledWith({
      page: 3,
      pageSize: 50,
      tenantId: 'tenant-a',
      search: undefined,
      range: '30d',
      fromTimestamp: undefined,
      toTimestamp: undefined,
      timeZone: undefined,
    });
    expect(json).toHaveBeenCalledWith(emptyInsights);
  });

  it('passes custom dates and a valid timezone to the data layer', async () => {
    const getInsights = jest.fn().mockResolvedValue(emptyInsights);
    const handler = createInsightsHandler({ isInsightsEnabled: insightsEnabled, getInsights });
    const { response } = createResponse();

    await handler(
      createRequest({
        range: 'custom',
        fromTimestamp: '2026-06-01T00:00:00.000Z',
        toTimestamp: '2026-06-10T00:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }),
      response,
    );

    expect(getInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'custom',
        fromTimestamp: '2026-06-01T00:00:00.000Z',
        toTimestamp: '2026-06-10T00:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }),
    );
  });

  it('uses pagination defaults and discards an invalid timezone', async () => {
    const getInsights = jest.fn().mockResolvedValue(emptyInsights);
    const handler = createInsightsHandler({ isInsightsEnabled: insightsEnabled, getInsights });
    const { response } = createResponse();

    await handler(
      createRequest({ page: '-1', pageSize: 'invalid', timeZone: 'Not/A-Timezone' }),
      response,
    );

    expect(getInsights).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10, timeZone: undefined }),
    );
  });

  it('normalizes and bounds search input', async () => {
    const getInsights = jest.fn().mockResolvedValue(emptyInsights);
    const handler = createInsightsHandler({ isInsightsEnabled: insightsEnabled, getInsights });
    const { response } = createResponse();

    await handler(createRequest({ search: `  ${'message'.repeat(40)}  ` }), response);

    expect(getInsights).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'message'.repeat(40).slice(0, 200) }),
    );
  });

  it('does not run searches shorter than the minimum length', async () => {
    const getInsights = jest.fn().mockResolvedValue(emptyInsights);
    const handler = createInsightsHandler({ isInsightsEnabled: insightsEnabled, getInsights });
    const { response } = createResponse();

    await handler(createRequest({ search: 'ab' }), response);

    expect(getInsights).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }));
  });
});
