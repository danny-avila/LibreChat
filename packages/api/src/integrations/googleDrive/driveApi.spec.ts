import {
  buildGoogleDriveFullTextQuery,
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
});
