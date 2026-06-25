import {
  createGmailDraft,
  listGmailLabels,
  modifyGmailMessageLabels,
  sendGmailMessage,
} from './mailApi';

function decodeRawMessage(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf-8');
}

function decodeBody(raw: string): string {
  const mime = decodeRawMessage(raw);
  const [, body = ''] = mime.split('\r\n\r\n');
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf-8');
}

describe('createGmailDraft', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a draft with an RFC822 message containing the recipients and body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'draft-1', message: { id: 'msg-1', threadId: 'thread-1' } }),
    } as unknown as Response);

    const result = await createGmailDraft('token-123', {
      to: ['someone@example.com'],
      subject: 'Hello',
      body: 'Body text',
    });

    expect(result).toEqual({ id: 'draft-1', messageId: 'msg-1', threadId: 'thread-1' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/drafts');
    expect(init.method).toBe('POST');

    const payload = JSON.parse(init.body as string) as { message: { raw: string } };
    const mime = decodeRawMessage(payload.message.raw);
    expect(mime).toContain('To: someone@example.com');
    expect(mime).toContain('Subject: Hello');
    expect(decodeBody(payload.message.raw)).toBe('Body text');
  });

  it('throws when no recipient is provided', async () => {
    await expect(
      createGmailDraft('token-123', { to: [], body: 'hi' }),
    ).rejects.toThrow('At least one recipient is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when the body is empty', async () => {
    await expect(
      createGmailDraft('token-123', { to: ['a@example.com'], body: '   ' }),
    ).rejects.toThrow('Email body is required');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves reply context to thread and Re: subject when replying', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threadId: 'thread-9',
          payload: {
            headers: [
              { name: 'Message-ID', value: '<orig@mail>' },
              { name: 'Subject', value: 'Project update' },
            ],
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'draft-2', message: { id: 'msg-2', threadId: 'thread-9' } }),
      } as unknown as Response);

    await createGmailDraft('token-123', {
      to: ['a@example.com'],
      body: 'Replying',
      replyToMessageId: 'orig-1',
    });

    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as { message: { raw: string; threadId: string } };
    expect(payload.message.threadId).toBe('thread-9');
    const mime = decodeRawMessage(payload.message.raw);
    expect(mime).toContain('Subject: Re: Project update');
    expect(mime).toContain('In-Reply-To: <orig@mail>');
  });
});

describe('sendGmailMessage', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts to the send endpoint and returns the sent message metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] }),
    } as unknown as Response);

    const result = await sendGmailMessage('token-123', {
      to: ['someone@example.com'],
      subject: 'Hi',
      body: 'Body',
    });

    expect(result).toEqual({ id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] });
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  });
});

describe('listGmailLabels', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the labels reported by Gmail', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        labels: [{ id: 'Label_1', name: 'Clients', type: 'user' }],
      }),
    } as unknown as Response);

    const labels = await listGmailLabels('token-123');
    expect(labels).toEqual([{ id: 'Label_1', name: 'Clients', type: 'user' }]);
  });
});

describe('modifyGmailMessageLabels', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends the add and remove label IDs to the modify endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1', labelIds: ['INBOX', 'STARRED'] }),
    } as unknown as Response);

    const result = await modifyGmailMessageLabels('token-123', {
      messageId: 'msg-1',
      addLabelIds: ['STARRED'],
      removeLabelIds: ['UNREAD'],
    });

    expect(result).toEqual({ id: 'msg-1', labelIds: ['INBOX', 'STARRED'] });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify');
    expect(JSON.parse(init.body as string)).toEqual({
      addLabelIds: ['STARRED'],
      removeLabelIds: ['UNREAD'],
    });
  });

  it('throws when no labels are provided', async () => {
    await expect(
      modifyGmailMessageLabels('token-123', { messageId: 'msg-1' }),
    ).rejects.toThrow('Provide at least one label');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
