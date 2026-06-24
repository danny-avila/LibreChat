import { getOutlookMailMessageAsText, searchOutlookMailMessages } from './outlookMailApi';

describe('searchOutlookMailMessages', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists recent Outlook messages when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            subject: 'Quarterly report',
            from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
            receivedDateTime: '2026-06-01T12:00:00Z',
            bodyPreview: 'Please review the attached report.',
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchOutlookMailMessages('token-123', { pageSize: 10 });

    expect(result.messages).toEqual([
      {
        id: 'msg-1',
        threadId: 'conv-1',
        subject: 'Quarterly report',
        from: 'Alice <alice@example.com>',
        date: '2026-06-01T12:00:00Z',
        snippet: 'Please review the attached report.',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.microsoft.com/v1.0/me/messages'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('filters Outlook messages when a query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ value: [] }),
    } as unknown as Response);

    await searchOutlookMailMessages('token-123', { query: 'invoice' });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('invoice'), expect.any(Object));
  });
});

describe('getOutlookMailMessageAsText', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns plain-text content for an Outlook message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'msg-1',
        subject: 'Hello team',
        from: { emailAddress: { address: 'sender@example.com' } },
        toRecipients: [{ emailAddress: { address: 'team@example.com' } }],
        receivedDateTime: '2026-06-01T12:00:00Z',
        body: { contentType: 'text', content: 'Meeting at 3pm.' },
        bodyPreview: 'Meeting at 3pm.',
      }),
    } as unknown as Response);

    const result = await getOutlookMailMessageAsText('token-123', 'msg-1');

    expect(result.fileName).toBe('Hello team.txt');
    expect(result.content).toContain('Subject: Hello team');
    expect(result.content).toContain('Meeting at 3pm.');
  });
});
