import { act, render, waitFor } from '@testing-library/react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useExodeExchangeMutation, useExodeEmbedConfigQuery } from '~/data-provider/Auth';
import ExodeBridge from './Bridge';

jest.mock('~/hooks/AuthContext');
jest.mock('~/data-provider/Auth');

const mockedUseAuthContext = jest.mocked(useAuthContext);
const mockedUseExodeExchangeMutation = jest.mocked(useExodeExchangeMutation);
const mockedUseExodeEmbedConfigQuery = jest.mocked(useExodeEmbedConfigQuery);

const allowedOrigin = 'https://app.exode.test';
const handshakeId = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';

const session = {
  token: 'librechat-token',
  tokenExpiresAt: '2099-01-01T00:00:00.000Z',
  mcpExpiresAt: '2099-01-01T00:00:00.000Z',
  user: {
    id: 'user-id',
    username: '',
    email: 'user@users.exode.invalid',
    name: 'Exode User',
    avatar: '',
    role: 'USER',
    provider: 'exode',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  },
};

function dispatchHostMessage(
  data: object,
  origin = allowedOrigin,
  source: MessageEventSource | null = window,
) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

describe('ExodeBridge', () => {
  const exchange = jest.fn();
  const acceptExternalSession = jest.fn();
  const clearExternalSession = jest.fn();
  let postMessageSpy: jest.SpyInstance;
  let randomUuidSpy: jest.SpyInstance;

  beforeEach(() => {
    exchange.mockReset();
    acceptExternalSession.mockReset();
    clearExternalSession.mockReset();
    mockedUseExodeEmbedConfigQuery.mockReturnValue({
      data: { enabled: true, protocol: 1, allowedOrigins: [allowedOrigin] },
    } as ReturnType<typeof useExodeEmbedConfigQuery>);
    mockedUseExodeExchangeMutation.mockReturnValue({
      mutateAsync: exchange,
    } as unknown as ReturnType<typeof useExodeExchangeMutation>);
    mockedUseAuthContext.mockReturnValue({
      acceptExternalSession,
      clearExternalSession,
    } as unknown as ReturnType<typeof useAuthContext>);
    postMessageSpy = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    randomUuidSpy = jest
      .spyOn(window.crypto, 'randomUUID')
      .mockReturnValueOnce(handshakeId)
      .mockReturnValueOnce(requestId);
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    randomUuidSpy.mockRestore();
  });

  it('announces readiness only to configured origins', () => {
    render(
      <ExodeBridge>
        <div />
      </ExodeBridge>,
    );

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        protocol: 1,
        source: 'exode-ai-chat',
        type: 'exode-ai-chat:ready',
        requestId,
        payload: { handshakeId },
      },
      allowedOrigin,
    );
  });

  it('ignores authentication from a wrong origin, source, or handshake', async () => {
    render(
      <ExodeBridge>
        <div />
      </ExodeBridge>,
    );
    const authenticate = {
      protocol: 1,
      source: 'exode-host',
      type: 'exode-ai-chat:authenticate',
      requestId,
      payload: { handshakeId, token: 'bootstrap-token-long-enough' },
    };

    act(() => dispatchHostMessage(authenticate, 'https://attacker.test'));
    act(() => dispatchHostMessage(authenticate, allowedOrigin, null));
    act(() =>
      dispatchHostMessage({
        ...authenticate,
        payload: {
          ...authenticate.payload,
          handshakeId: '00000000-0000-4000-8000-000000000099',
        },
      }),
    );

    await Promise.resolve();
    expect(exchange).not.toHaveBeenCalled();
  });

  it('exchanges a valid bootstrap and installs the external session', async () => {
    exchange.mockResolvedValue(session);
    render(
      <ExodeBridge>
        <div />
      </ExodeBridge>,
    );

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:authenticate',
        requestId,
        payload: { handshakeId, token: 'bootstrap-token-long-enough' },
      }),
    );

    await waitFor(() => {
      expect(exchange).toHaveBeenCalledWith({
        token: 'bootstrap-token-long-enough',
        handshakeId,
        parentOrigin: allowedOrigin,
      });
      expect(acceptExternalSession).toHaveBeenCalledWith(session);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'exode-ai-chat:authenticated',
          requestId,
        }),
        allowedOrigin,
      );
    });
  });

  it('clears the in-memory session on host logout', () => {
    const view = render(
      <ExodeBridge>
        <div />
      </ExodeBridge>,
    );

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:logout',
        requestId: '00000000-0000-4000-8000-000000000003',
        payload: {},
      }),
    );

    expect(clearExternalSession).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(clearExternalSession).toHaveBeenCalledTimes(2);
  });
});
