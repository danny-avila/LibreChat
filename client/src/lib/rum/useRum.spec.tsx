import { renderHook, waitFor } from '@testing-library/react';
import useRum from './useRum';

const mockInit = jest.fn();
const mockSetGlobalAttributes = jest.fn();
const mockUseGetStartupConfig = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('@hyperdx/browser', () => ({
  __esModule: true,
  default: {
    init: (...args: unknown[]) => mockInit(...args),
    setGlobalAttributes: (...args: unknown[]) => mockSetGlobalAttributes(...args),
  },
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockUseLocation(),
}));

describe('useRum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocation.mockReturnValue({ pathname: '/c/conversation-123' });
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      token: 'jwt-token',
      user: {
        id: 'user-123',
        role: 'USER',
        tenantId: 'org-123',
        email: 'user@example.com',
      },
    });
  });

  it('initializes HyperDX public-token RUM with privacy defaults and safe attributes', async () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        rum: {
          provider: 'hyperdx',
          enabled: true,
          url: 'https://rum.example.com',
          serviceName: 'librechat-web',
          authMode: 'publicToken',
          publicToken: 'public-token',
          tracePropagationTargets: ['https://librechat.example.com'],
        },
      },
    });

    renderHook(() => useRum());

    await waitFor(() => {
      expect(mockInit).toHaveBeenCalledWith({
        advancedNetworkCapture: false,
        apiKey: 'public-token',
        consoleCapture: false,
        disableReplay: true,
        service: 'librechat-web',
        tracePropagationTargets: ['https://librechat.example.com'],
        url: 'https://rum.example.com',
      });
    });

    expect(mockSetGlobalAttributes).toHaveBeenCalledWith({
      route: '/c/:conversationId',
      role: 'USER',
      userId: 'user-123',
      orgId: 'org-123',
      serviceName: 'librechat-web',
    });
    expect(mockSetGlobalAttributes).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
  });

  it('does not initialize RUM for unsupported auth modes', async () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        rum: {
          provider: 'hyperdx',
          enabled: true,
          url: 'https://rum.example.com/ingest',
          serviceName: 'librechat-web',
          authMode: 'userJwt',
          publicToken: 'public-token',
        },
      },
    });

    renderHook(() => useRum());

    expect(mockInit).not.toHaveBeenCalled();
  });

  it('initializes proxy RUM with the LibreChat bearer token for same-origin ingest', async () => {
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Promise.resolve({ ok: true, status: 200 } as Response),
    );
    window.fetch = Object.assign(fetchMock, { preconnect: () => undefined });
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        rum: {
          provider: 'hyperdx',
          enabled: true,
          url: '/api/rum',
          serviceName: 'librechat-web',
          authMode: 'proxy',
        },
      },
    });

    renderHook(() => useRum());

    await waitFor(() => {
      expect(mockInit).toHaveBeenCalledWith({
        advancedNetworkCapture: false,
        apiKey: 'librechat-rum-proxy',
        consoleCapture: false,
        disableReplay: true,
        service: 'librechat-web',
        tracePropagationTargets: undefined,
        url: '/api/rum',
      });
    });

    await window.fetch('/api/rum/v1/traces', { method: 'POST' });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get('authorization')).toBe('Bearer jwt-token');
  });

  it('does not initialize proxy RUM without an authenticated token', async () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: false,
      token: undefined,
      user: undefined,
    });
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        rum: {
          provider: 'hyperdx',
          enabled: true,
          url: '/api/rum',
          serviceName: 'librechat-web',
          authMode: 'proxy',
        },
      },
    });

    renderHook(() => useRum());

    expect(mockInit).not.toHaveBeenCalled();
  });
});
