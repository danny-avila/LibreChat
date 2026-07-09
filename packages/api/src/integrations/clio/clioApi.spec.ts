import {
  createClioMatter,
  downloadClioDocument,
  listClioMatters,
  runClioAction,
  searchClioDocuments,
} from './clioApi';

describe('searchClioDocuments', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists recent Clio documents when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 101,
            name: 'Retainer Agreement',
            filename: 'retainer.pdf',
            content_type: 'application/pdf',
            size: 2048,
            updated_at: '2026-06-01T12:00:00Z',
          },
        ],
        meta: {
          paging: {
            next: 'https://app.clio.com/api/v4/documents.json?page_token=abc',
          },
        },
      }),
    } as unknown as Response);

    const result = await searchClioDocuments('token-123', { pageSize: 10 });

    expect(result.files).toEqual([
      {
        id: '101',
        name: 'retainer.pdf',
        mimeType: 'application/pdf',
        modifiedTime: '2026-06-01T12:00:00Z',
        size: '2048',
      },
    ]);
    expect(result.nextPageToken).toBe('https://app.clio.com/api/v4/documents.json?page_token=abc');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://app.clio.com/api/v4/documents.json'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('searches Clio documents when a query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 202,
            filename: 'contract.docx',
            content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchClioDocuments('token-123', {
      query: 'contract',
      pageSize: 5,
    });

    expect(result.files[0]?.name).toBe('contract.docx');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('query=contract'),
      expect.any(Object),
    );
  });

  it('follows the next page URL when a page token is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as unknown as Response);

    const nextUrl = 'https://app.clio.com/api/v4/documents.json?page_token=next-page';
    await searchClioDocuments('token-123', { pageToken: nextUrl });

    expect(mockFetch).toHaveBeenCalledWith(nextUrl, expect.any(Object));
  });
});

describe('listClioMatters', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists matters with status filter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 42,
            display_number: '00001',
            description: 'Smith v Jones',
            status: 'open',
            client_id: 7,
          },
        ],
      }),
    } as unknown as Response);

    const result = await listClioMatters('token-123', {
      status: 'open',
      maxResults: 5,
    });

    expect(result.records).toEqual([
      expect.objectContaining({
        id: '42',
        displayNumber: '00001',
        description: 'Smith v Jones',
        status: 'open',
        clientId: '7',
      }),
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/matters.json'),
      expect.any(Object),
    );
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('status=open');
  });
});

describe('createClioMatter', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a matter and returns id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 999 },
      }),
    } as unknown as Response);

    const result = await createClioMatter('token-123', {
      client_id: 7,
      description: 'AIWP Test Matter',
      responsible_attorney_id: 3,
    });

    expect(result).toEqual({ id: '999' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/matters.json'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
    const body = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body));
    expect(body.data).toEqual(
      expect.objectContaining({
        client: { id: 7 },
        description: 'AIWP Test Matter',
        responsible_attorney: { id: 3 },
      }),
    );
  });
});

describe('runClioAction', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('dispatches list_users', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 1, name: 'Jane Attorney', email: 'jane@firm.com', enabled: true }],
      }),
    } as unknown as Response);

    const result = await runClioAction('token-123', 'list_users', { max_results: 10 });

    expect(result).toEqual({
      records: [
        {
          id: '1',
          name: 'Jane Attorney',
          email: 'jane@firm.com',
          enabled: true,
        },
      ],
    });
  });
});

describe('downloadClioDocument', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('downloads a document by Clio id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadClioDocument('token-123', {
      id: '101',
      name: 'retainer.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.fileName).toBe('retainer.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://app.clio.com/api/v4/documents/101/download.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
        redirect: 'follow',
      }),
    );
  });
});
