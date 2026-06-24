import {
  buildGoogleDriveFullTextQuery,
  createGoogleDriveDocument,
  downloadGoogleDriveFile,
  searchGoogleDriveFiles,
} from './driveApi';

describe('buildGoogleDriveFullTextQuery', () => {
  it('escapes single quotes in search terms', () => {
    expect(buildGoogleDriveFullTextQuery("O'Brien report")).toBe(
      "fullText contains 'O\\'Brien report'",
    );
  });

  it('returns empty string for blank input', () => {
    expect(buildGoogleDriveFullTextQuery('   ')).toBe('');
  });
});

describe('searchGoogleDriveFiles', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests files with the provided access token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [{ id: '1', name: 'Doc', mimeType: 'application/pdf' }],
      }),
    } as unknown as Response);

    const result = await searchGoogleDriveFiles('token-123', {
      query: "fullText contains 'budget'",
      pageSize: 5,
    });

    expect(result.files).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://www.googleapis.com/drive/v3/files?'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
    const requestUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(requestUrl).toContain('pageSize=5');
    expect(requestUrl).toContain('fullText+contains');
    expect(requestUrl).toContain('budget');
  });
});

describe('downloadGoogleDriveFile', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('exports Google Docs as PDF', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadGoogleDriveFile('token-123', {
      id: 'doc-1',
      name: 'Quarterly Plan',
      mimeType: 'application/vnd.google-apps.document',
    });

    expect(result.fileName).toBe('Quarterly Plan.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/doc-1/export?mimeType=application%2Fpdf',
      expect.any(Object),
    );
  });

  it('infers MIME type from the file name when Drive returns octet-stream', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as Response);

    const result = await downloadGoogleDriveFile('token-123', {
      id: 'file-1',
      name: 'contract.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.fileName).toBe('contract.pdf');
    expect(result.mimeType).toBe('application/pdf');
  });
});

describe('createGoogleDriveDocument', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a Google Doc and inserts content', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'doc-1',
          name: 'Meeting Notes',
          mimeType: 'application/vnd.google-apps.document',
          webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

    const result = await createGoogleDriveDocument('token-123', {
      title: 'Meeting Notes',
      content: 'Summary from chat',
    });

    expect(result.id).toBe('doc-1');
    expect(result.webViewLink).toContain('doc-1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toContain('https://www.googleapis.com/drive/v3/files');
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      'https://docs.googleapis.com/v1/documents/doc-1:batchUpdate',
    );
  });

  it('uses Untitled document when title is blank', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'doc-2',
        name: 'Untitled document',
        mimeType: 'application/vnd.google-apps.document',
      }),
    } as unknown as Response);

    await createGoogleDriveDocument('token-123', {
      title: '   ',
      content: '',
    });

    const createInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(createInit.body).toContain('"name":"Untitled document"');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
