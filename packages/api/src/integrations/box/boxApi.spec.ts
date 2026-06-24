import { downloadBoxFile, searchBoxFiles } from './boxApi';

describe('searchBoxFiles', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists Box root files when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            type: 'file',
            id: '123',
            name: 'Budget.xlsx',
            size: 1024,
            modified_at: '2026-06-01T12:00:00Z',
          },
          {
            type: 'folder',
            id: '456',
            name: 'Reports',
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchBoxFiles('token-123', { pageSize: 10 });

    expect(result.files).toEqual([
      {
        id: '123',
        name: 'Budget.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        modifiedTime: '2026-06-01T12:00:00Z',
        size: '1024',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.box.com/2.0/folders/0/items'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('searches Box files when a query of at least 3 characters is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            type: 'file',
            id: '789',
            name: 'contract.pdf',
          },
        ],
        total_count: 1,
        offset: 0,
        limit: 5,
      }),
    } as unknown as Response);

    const result = await searchBoxFiles('token-123', {
      query: 'contract',
      pageSize: 5,
    });

    expect(result.files[0]?.name).toBe('contract.pdf');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/search?'), expect.any(Object));
  });

  it('lists root folder when the query is shorter than 3 characters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [] }),
    } as unknown as Response);

    await searchBoxFiles('token-123', { query: 'ab', pageSize: 5 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/folders/0/items'),
      expect.any(Object),
    );
  });
});

describe('downloadBoxFile', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('downloads a file by Box id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadBoxFile('token-123', {
      id: '123',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.fileName).toBe('contract.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.box.com/2.0/files/123/content',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
        redirect: 'follow',
      }),
    );
  });
});
