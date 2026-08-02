import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { useExodeExchangeMutation, useExodeEmbedConfigQuery } from '~/data-provider/Auth';
import ExodeBridge from './Bridge';

/** ExodeBridge calls useNavigate, so it needs a router just as it has one in the app */
const renderBridge = () =>
  render(
    <MemoryRouter>
      <ExodeBridge>
        <div />
      </ExodeBridge>
    </MemoryRouter>,
  );

jest.mock('~/hooks/AuthContext');
jest.mock('~/data-provider/Auth');

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

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
    mockNavigate.mockReset();
    acceptExternalSession.mockReset();
    clearExternalSession.mockReset();
    window.history.replaceState({}, '', '/c/new?embed=exode');
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
    renderBridge();

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
    renderBridge();
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
    renderBridge();

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
        /** No `agent` in the URL — the assistant is the default */
        kind: 'Assistant',
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

  it('asks exode for the knowledge agent when the frame requests it', async () => {
    window.history.replaceState({}, '', '/c/new?embed=exode&agent=knowledge');
    exchange.mockResolvedValue({ ...session, agents: { knowledge: 'agent-router' } });
    renderBridge();

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:authenticate',
        requestId,
        payload: { handshakeId, token: 'bootstrap-token-long-enough' },
      }),
    );

    /**
     * The kind travels with the exchange so exode returns one agent id. Were both returned,
     * flipping the URL would turn the knowledge chat into the MCP-enabled assistant.
     */
    await waitFor(() =>
      expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'Knowledge' })),
    );
  });

  it('opens the agent exode provisioned for the requested kind', async () => {
    window.history.replaceState({}, '', '/c/new?embed=exode&agent=knowledge');
    exchange.mockResolvedValue({
      ...session,
      agents: { knowledge: 'agent-router', assistant: 'agent-assistant' },
    });
    renderBridge();

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:authenticate',
        requestId,
        payload: { handshakeId, token: 'bootstrap-token-long-enough' },
      }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('agent_id=agent-router'), {
        replace: true,
      }),
    );
  });

  it('defaults to the assistant when no agent kind is requested', async () => {
    exchange.mockResolvedValue({
      ...session,
      agents: { knowledge: 'agent-router', assistant: 'agent-assistant' },
    });
    renderBridge();

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:authenticate',
        requestId,
        payload: { handshakeId, token: 'bootstrap-token-long-enough' },
      }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('agent_id=agent-assistant'), {
        replace: true,
      }),
    );
  });

  it('does not navigate again when a refresh renews the token', async () => {
    jest.useFakeTimers();

    try {
      exchange.mockResolvedValue({
        ...session,
        /** Already elapsed, so the refresh timer is due immediately */
        tokenExpiresAt: new Date(Date.now() + 1_000).toISOString(),
        mcpExpiresAt: new Date(Date.now() + 1_000).toISOString(),
        agents: { assistant: 'agent-assistant' },
      });
      renderBridge();

      act(() =>
        dispatchHostMessage({
          protocol: 1,
          source: 'exode-host',
          type: 'exode-ai-chat:authenticate',
          requestId,
          payload: { handshakeId, token: 'bootstrap-token-long-enough' },
        }),
      );

      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(exchange).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledTimes(1);

      /** Fire the scheduled refresh, then answer its handshake as the host would */
      act(() => {
        jest.advanceTimersByTime(5_000);
      });

      /**
       * The refresh mints fresh ids (the spy only fixes the first pair), so echo back the ones
       * it actually posted — replying with the initial pair would just be ignored.
       */
      const refresh = postMessageSpy.mock.calls
        .map(([message]) => message as { type: string; requestId: string; payload: { handshakeId: string } })
        .find(({ type }) => type === 'exode-ai-chat:refresh-required');

      expect(refresh).toBeDefined();

      act(() =>
        dispatchHostMessage({
          protocol: 1,
          source: 'exode-host',
          type: 'exode-ai-chat:authenticate',
          requestId: refresh!.requestId,
          payload: {
            handshakeId: refresh!.payload.handshakeId,
            token: 'bootstrap-token-long-enough',
          },
        }),
      );

      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      /** The refresh really did re-exchange — otherwise this test proves nothing */
      expect(exchange).toHaveBeenCalledTimes(2);

      /** Still one: navigating here would drop the user's open conversation */
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not navigate when the exchange returns no agents', async () => {
    exchange.mockResolvedValue(session);
    renderBridge();

    act(() =>
      dispatchHostMessage({
        protocol: 1,
        source: 'exode-host',
        type: 'exode-ai-chat:authenticate',
        requestId,
        payload: { handshakeId, token: 'bootstrap-token-long-enough' },
      }),
    );

    await waitFor(() => expect(acceptExternalSession).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears the in-memory session on host logout', () => {
    const view = renderBridge();

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
