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
    delete window.__libreChatRumInterceptor;
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

  it('configures the early interceptor and uses a placeholder api key for userJwt mode', async () => {
    const configure = jest.fn();
    const clear = jest.fn();
    window.__libreChatRumInterceptor = { configure, clear };
    mockUseGetStartupConfig.mockReturnValue({
      data: {
        rum: {
          provider: 'hyperdx',
          enabled: true,
          url: 'https://rum.example.com/ingest',
          serviceName: 'librechat-web',
          authMode: 'userJwt',
          authHeaderScheme: 'Basic',
        },
      },
    });

    renderHook(() => useRum());

    expect(configure).toHaveBeenCalledWith({
      url: 'https://rum.example.com/ingest',
      authHeaderScheme: 'Basic',
      tokenProvider: expect.any(Function),
    });
    expect(configure.mock.calls[0][0].tokenProvider()).toBe('jwt-token');

    await waitFor(() => {
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'placeholder',
          url: 'https://rum.example.com/ingest',
        }),
      );
    });
  });
});
