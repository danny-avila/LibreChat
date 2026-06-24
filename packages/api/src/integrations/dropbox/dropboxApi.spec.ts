import { createDropboxDocument, downloadDropboxFile, searchDropboxFiles } from './dropboxApi';

describe('searchDropboxFiles', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists root folder files when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            '.tag': 'file',
            id: 'id:abc',
            name: 'Budget.xlsx',
            client_modified: '2026-06-01T12:00:00Z',
            size: 1024,
          },
          {
            '.tag': 'folder',
            id: 'id:folder',
            name: 'Reports',
          },
        ],
        has_more: false,
      }),
    } as unknown as Response);

    const result = await searchDropboxFiles('token-123', { pageSize: 10 });

    expect(result.files).toEqual([
      {
        id: 'id:abc',
        name: 'Budget.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        modifiedTime: '2026-06-01T12:00:00Z',
        size: '1024',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/files/list_folder',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('searches files when a query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          {
            metadata: {
              '.tag': 'file',
              id: 'id:search',
              name: 'contract.pdf',
              size: 2048,
            },
          },
        ],
        has_more: false,
      }),
    } as unknown as Response);

    const result = await searchDropboxFiles('token-123', { query: 'contract', pageSize: 5 });

    expect(result.files[0]?.name).toBe('contract.pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.dropboxapi.com/2/files/search_v2',
      expect.objectContaining({
        body: expect.stringContaining('contract'),
      }),
    );
  });
});

describe('downloadDropboxFile', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('downloads a file by Dropbox id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadDropboxFile('token-123', {
      id: 'id:abc',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.fileName).toBe('contract.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://content.dropboxapi.com/2/files/download',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Dropbox-API-Arg': JSON.stringify({ path: 'id:abc' }),
        }),
      }),
    );
  });

  it('infers MIME type from the file name when Dropbox returns octet-stream', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadDropboxFile('token-123', {
      id: 'id:abc',
      name: 'contract.pdf',
      mimeType: 'application/octet-stream',
    });

    expect(result.mimeType).toBe('application/pdf');
  });
});

describe('createDropboxDocument', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a document file to Dropbox root', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'id:doc',
        name: 'Football.md',
        path_display: '/Football.md',
      }),
    } as unknown as Response);

    const result = await createDropboxDocument('token-123', {
      title: 'Football',
      content: 'A short note about football.',
    });

    expect(result.name).toBe('Football.md');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://content.dropboxapi.com/2/files/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Dropbox-API-Arg': JSON.stringify({
            path: '/Football.md',
            mode: 'add',
            autorename: true,
          }),
        }),
      }),
    );
  });
});
