import {
  createOneDriveDocument,
  downloadMicrosoftOneDriveFile,
  searchMicrosoftOneDriveFiles,
} from './oneDriveApi';

describe('searchMicrosoftOneDriveFiles', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists OneDrive root files when no query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'item-1',
            name: 'Budget.xlsx',
            file: {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
            size: 1024,
            lastModifiedDateTime: '2026-06-01T12:00:00Z',
          },
          {
            id: 'folder-1',
            name: 'Reports',
            folder: {},
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchMicrosoftOneDriveFiles('token-123', { pageSize: 10 });

    expect(result.files).toEqual([
      {
        id: 'item-1',
        name: 'Budget.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        modifiedTime: '2026-06-01T12:00:00Z',
        size: '1024',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.microsoft.com/v1.0/me/drive/root/children'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('searches OneDrive files when a query is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'item-search',
            name: 'contract.pdf',
            file: { mimeType: 'application/pdf' },
          },
        ],
      }),
    } as unknown as Response);

    const result = await searchMicrosoftOneDriveFiles('token-123', {
      query: 'contract',
      pageSize: 5,
    });

    expect(result.files[0]?.name).toBe('contract.pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/me/drive/root/search(q='),
      expect.any(Object),
    );
  });

  it('throws a clear error when OneDrive is not provisioned', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          error: {
            code: 'itemNotFound',
            message: 'Item does not exist',
          },
        }),
    } as unknown as Response);

    await expect(searchMicrosoftOneDriveFiles('token-123')).rejects.toThrow(
      'OneDrive not provisioned',
    );
  });
});

describe('downloadMicrosoftOneDriveFile', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('downloads a file by OneDrive item id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadMicrosoftOneDriveFile('token-123', {
      id: 'item-1',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.fileName).toBe('contract.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/drive/items/item-1/content',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });

  it('infers MIME type from the file name when Graph returns octet-stream', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadMicrosoftOneDriveFile('token-123', {
      id: 'item-1',
      name: 'contract.pdf',
      mimeType: 'application/octet-stream',
    });

    expect(result.mimeType).toBe('application/pdf');
  });
});

describe('createOneDriveDocument', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a document file to OneDrive root', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc-1',
        name: 'Football.md',
        webUrl: 'https://onedrive.live.com/doc-1',
      }),
    } as unknown as Response);

    const result = await createOneDriveDocument('token-123', {
      title: 'Football',
      content: 'A short note about football.',
    });

    expect(result.id).toBe('doc-1');
    expect(result.name).toBe('Football.md');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://graph.microsoft.com/v1.0/me/drive/root:/Football.md:/content',
      ),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'text/plain',
        }),
        body: 'A short note about football.',
      }),
    );
  });

  it('uploads into a folder when folderId is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'doc-2',
        name: 'Notes.md',
        webUrl: 'https://onedrive.live.com/doc-2',
      }),
    } as unknown as Response);

    await createOneDriveDocument('token-123', {
      title: 'Notes',
      content: 'Body',
      folderId: 'folder-abc',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/me/drive/items/folder-abc:/Notes.md:/content'),
      expect.any(Object),
    );
  });
});
