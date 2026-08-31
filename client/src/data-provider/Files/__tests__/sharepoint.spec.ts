import type { SharePointFile, SharePointDriveItem } from '../sharepoint';
import { expandSharePointFolders } from '../sharepoint';

const ACCESS_TOKEN = 'test-token';
const DRIVE_ID = 'drive-1';

function pickedFile(id: string, overrides: Partial<SharePointFile> = {}): SharePointFile {
  return {
    id,
    name: `${id}.txt`,
    size: 10,
    webUrl: `https://contoso.sharepoint.com/${id}`,
    downloadUrl: `https://download/${id}`,
    driveId: DRIVE_ID,
    itemId: id,
    isFolder: false,
    sharePointItem: { id, name: `${id}.txt` },
    ...overrides,
  };
}

function pickedFolder(id: string): SharePointFile {
  return pickedFile(id, {
    name: `${id}-folder`,
    isFolder: true,
    downloadUrl: '',
    sharePointItem: { id, name: `${id}-folder`, folder: { childCount: 1 } },
  });
}

function driveFile(id: string): SharePointDriveItem {
  return {
    id,
    name: `${id}.txt`,
    size: 20,
    webUrl: `https://contoso.sharepoint.com/${id}`,
    '@microsoft.graph.downloadUrl': `https://download/${id}`,
    parentReference: { driveId: DRIVE_ID },
  };
}

function driveFolder(id: string): SharePointDriveItem {
  return {
    id,
    name: `${id}-folder`,
    folder: { childCount: 1 },
    parentReference: { driveId: DRIVE_ID },
  };
}

/** Serves `children` responses keyed by folder item id, tracking every request made. */
function mockGraph(children: Record<string, SharePointDriveItem[] | 'forbidden'>) {
  const requested: string[] = [];

  const fetchMock = jest.fn(async (url: string) => {
    const itemId = decodeURIComponent(url.split('/items/')[1].split('/children')[0]);
    requested.push(itemId);

    const entry = children[itemId];
    if (entry === 'forbidden' || entry === undefined) {
      return { ok: false, status: 403, statusText: 'Forbidden' } as Response;
    }

    return {
      ok: true,
      json: async () => ({ value: entry }),
    } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return { requested, fetchMock };
}

describe('expandSharePointFolders', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns directly picked files untouched and makes no requests', async () => {
    const { fetchMock } = mockGraph({});

    const result = await expandSharePointFolders({
      items: [pickedFile('a'), pickedFile('b')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(false);
    expect(result.unreadableFolders).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a picked folder with the files inside it', async () => {
    mockGraph({ 'folder-1': [driveFile('inner-1'), driveFile('inner-2')] });

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id)).toEqual(['inner-1', 'inner-2']);
    expect(result.files.every((file) => file.isFolder === false)).toBe(true);
    expect(result.files[0].downloadUrl).toBe('https://download/inner-1');
    expect(result.files[0].driveId).toBe(DRIVE_ID);
  });

  it('walks nested folders', async () => {
    mockGraph({
      'folder-1': [driveFile('top'), driveFolder('folder-2')],
      'folder-2': [driveFile('nested')],
    });

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id).sort()).toEqual(['nested', 'top']);
  });

  it('follows pagination until the listing is exhausted', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      if (urls.length === 1) {
        return {
          ok: true,
          json: async () => ({
            value: [driveFile('page-1')],
            '@odata.nextLink': 'https://graph.microsoft.com/next-page',
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ value: [driveFile('page-2')] }) } as Response;
    }) as unknown as typeof fetch;

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id)).toEqual(['page-1', 'page-2']);
    expect(urls[1]).toBe('https://graph.microsoft.com/next-page');
  });

  it('does not return a file twice when it is both picked and inside a picked folder', async () => {
    mockGraph({ 'folder-1': [driveFile('shared')] });

    const result = await expandSharePointFolders({
      items: [pickedFile('shared'), pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id)).toEqual(['shared']);
  });

  it('stops at maxFiles and reports the walk as truncated', async () => {
    mockGraph({
      'folder-1': [driveFile('one'), driveFile('two'), driveFile('three')],
    });

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
      maxFiles: 2,
    });

    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('counts directly picked files against maxFiles', async () => {
    mockGraph({ 'folder-1': [driveFile('inner')] });

    const result = await expandSharePointFolders({
      items: [pickedFile('a'), pickedFile('b'), pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
      maxFiles: 2,
    });

    expect(result.files.map((file) => file.id)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });

  it('reports folders it cannot list without dropping the rest of the selection', async () => {
    mockGraph({
      'folder-1': 'forbidden',
      'folder-2': [driveFile('readable')],
    });

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1'), pickedFolder('folder-2')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files.map((file) => file.id)).toEqual(['readable']);
    expect(result.unreadableFolders).toEqual(['folder-1-folder']);
  });

  it('lists a folder once even when it is reachable twice', async () => {
    const { requested } = mockGraph({ 'folder-1': [driveFile('only')] });

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1'), pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(requested).toEqual(['folder-1']);
    expect(result.files.map((file) => file.id)).toEqual(['only']);
  });

  it('sends the access token as a bearer credential', async () => {
    const { fetchMock } = mockGraph({ 'folder-1': [] });

    await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/drives/drive-1/items/folder-1/children'),
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
    );
  });

  it('stops walking once the folder-request budget is spent', async () => {
    /** Each folder holds only another folder, so the walk never reaches a file. */
    const fetchMock = jest.fn(async (url: string) => {
      const itemId = decodeURIComponent(url.split('/items/')[1].split('/children')[0]);
      const depth = Number(itemId.split('-')[1]);
      return {
        ok: true,
        json: async () => ({ value: [driveFolder(`folder-${depth + 1}`)] }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await expandSharePointFolders({
      items: [pickedFolder('folder-1')],
      accessToken: ACCESS_TOKEN,
    });

    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });
});
