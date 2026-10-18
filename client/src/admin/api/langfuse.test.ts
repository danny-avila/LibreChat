import '~/admin/test/fetch';

const mockApiFetchMock = jest.fn();
const mockRequireAllSectionCapabilitiesMock = jest.fn();

jest.mock('./utils/api', () => ({
  apiFetch: (path: string, init?: RequestInit) => mockApiFetchMock(path, init),
  extractApiError: jest.fn(async (_response: Response, message: string) => {
    throw new Error(message);
  }),
}));

jest.mock('./capabilities', () => ({
  requireAllSectionCapabilities: (sections: string[]) =>
    mockRequireAllSectionCapabilitiesMock(sections),
}));

import {
  getLangfuseConnectionFn,
  testLangfuseConnectionFn,
  updateLangfuseConnectionFn,
} from './langfuse';

const status = {
  configured: true,
  enabled: true,
  destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
  destination: 'eu',
  publicKey: 'pk-lf-public',
  displaySecretKey: 'sk-lf-...515f',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAllSectionCapabilitiesMock.mockResolvedValue(undefined);
});

describe('Langfuse connection server functions', () => {
  it('reads connection status through LibreChat', async () => {
    mockApiFetchMock.mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }));

    await expect(getLangfuseConnectionFn()).resolves.toEqual(status);
    expect(mockRequireAllSectionCapabilitiesMock).toHaveBeenCalledWith(['langfuse']);
    expect(mockApiFetchMock).toHaveBeenCalledWith('/api/admin/langfuse/connection', undefined);
  });

  it('updates the connection without exposing or reconstructing a stored secret', async () => {
    mockApiFetchMock.mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }));
    const data = { enabled: false, destination: 'eu', publicKey: 'pk-lf-public' };

    await expect(updateLangfuseConnectionFn({ data })).resolves.toEqual(status);
    expect(mockRequireAllSectionCapabilitiesMock).toHaveBeenCalledWith(['langfuse']);
    expect(mockApiFetchMock).toHaveBeenCalledWith('/api/admin/langfuse/connection', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  });

  it('delegates credential verification to LibreChat', async () => {
    mockApiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Langfuse rejected these keys' }), {
        status: 200,
      }),
    );
    const data = { destination: 'eu', publicKey: 'pk-lf-public', secretKey: 'sk-lf-secret' };

    await expect(testLangfuseConnectionFn({ data })).resolves.toEqual({
      success: false,
      message: 'Langfuse rejected these keys',
    });
    expect(mockRequireAllSectionCapabilitiesMock).toHaveBeenCalledWith(['langfuse']);
    expect(mockApiFetchMock).toHaveBeenCalledWith('/api/admin/langfuse/connection/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  });
});
