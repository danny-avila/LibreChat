import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { TExodeExchangeResponse } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useExodeExchangeMutation, useExodeEmbedConfigQuery } from '~/data-provider/Auth';
import {
  EXODE_EMBED_PROTOCOL,
  exodeHostMessageSchema,
  getExodeAgentKind,
  type ExodeBridgeMessage,
} from './protocol';

interface ExodeBridgeProps {
  children: ReactNode;
}

interface Handshake {
  handshakeId: string;
  requestId: string;
  /** False for a token refresh, which must not navigate away from the open conversation */
  initial: boolean;
}

interface BrowserSafeError {
  code: string;
  retryable: boolean;
}

const KNOWN_ERROR_CODES = new Set([
  'INVALID_HANDSHAKE',
  'BOOTSTRAP_INVALID',
  'AI_CHAT_FORBIDDEN',
  'AI_CHAT_LIMIT',
  'EXODE_UNAVAILABLE',
  'IDENTITY_CONFLICT',
  'INTERNAL_ERROR',
]);

function getBrowserSafeError(error: unknown): BrowserSafeError {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return { code: 'EXODE_UNAVAILABLE', retryable: true };
  }

  const response = (error as { response?: { status?: number; data?: { code?: string } } }).response;
  const code = response?.data?.code;
  const safeCode = code && KNOWN_ERROR_CODES.has(code) ? code : 'EXODE_UNAVAILABLE';
  const retryable = response?.status === 429 || (response?.status ?? 500) >= 500;
  return { code: safeCode, retryable };
}

function getRefreshDelay(session: TExodeExchangeResponse): number {
  const tokenRefreshAt = Date.parse(session.tokenExpiresAt) - 90_000;
  const mcpRefreshAt = Date.parse(session.mcpExpiresAt) - 120_000;
  return Math.max(1_000, Math.min(tokenRefreshAt, mcpRefreshAt) - Date.now());
}

export default function ExodeBridge({ children }: ExodeBridgeProps) {
  const navigate = useNavigate();
  const { data: config } = useExodeEmbedConfigQuery();
  const { mutateAsync: exchange } = useExodeExchangeMutation();
  const { acceptExternalSession, clearExternalSession } = useAuthContext();

  useEffect(() => {
    if (config?.enabled !== true || config.protocol !== EXODE_EMBED_PROTOCOL) {
      return;
    }

    const allowedOrigins = new Set(config.allowedOrigins);
    let activeOrigin: string | undefined;
    let currentHandshake: Handshake | undefined;
    let refreshTimer: number | undefined;
    let exchangeInFlight = false;

    const post = (message: ExodeBridgeMessage, origin?: string) => {
      const targets = origin ? [origin] : config.allowedOrigins;
      for (const targetOrigin of targets) {
        window.parent.postMessage(message, targetOrigin);
      }
    };

    const beginHandshake = (type: 'exode-ai-chat:ready' | 'exode-ai-chat:refresh-required') => {
      currentHandshake = {
        handshakeId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        initial: type === 'exode-ai-chat:ready',
      };
      post(
        {
          protocol: EXODE_EMBED_PROTOCOL,
          source: 'exode-ai-chat',
          type,
          requestId: currentHandshake.requestId,
          payload: { handshakeId: currentHandshake.handshakeId },
        },
        activeOrigin,
      );
    };

    const scheduleRefresh = (session: TExodeExchangeResponse) => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(
        () => beginHandshake('exode-ai-chat:refresh-required'),
        getRefreshDelay(session),
      );
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== window.parent || !allowedOrigins.has(event.origin)) {
        return;
      }

      const parsed = exodeHostMessageSchema.safeParse(event.data);
      if (!parsed.success) {
        return;
      }

      const message = parsed.data;
      if (message.type === 'exode-ai-chat:logout') {
        if (refreshTimer != null) {
          window.clearTimeout(refreshTimer);
        }
        currentHandshake = undefined;
        exchangeInFlight = false;
        clearExternalSession();
        return;
      }

      const handshake = currentHandshake;
      if (
        exchangeInFlight ||
        !handshake ||
        message.requestId !== handshake.requestId ||
        message.payload.handshakeId !== handshake.handshakeId
      ) {
        return;
      }

      exchangeInFlight = true;
      activeOrigin = event.origin;
      try {
        /**
         * The requested kind goes with the exchange, so exode returns exactly one agent id.
         * Asking for both and choosing here would let the knowledge frame open the assistant.
         */
        const kind = getExodeAgentKind(window.location.search) === 'knowledge'
          ? 'Knowledge'
          : 'Assistant';

        const session = await exchange({
          kind,
          token: message.payload.token,
          handshakeId: handshake.handshakeId,
          parentOrigin: event.origin,
        });
        if (currentHandshake !== handshake) {
          return;
        }
        currentHandshake = undefined;
        acceptExternalSession(session);
        scheduleRefresh(session);

        /**
         * Open the agent exode provisioned for this principal.
         *
         * Only done on the initial handshake: a refresh renews the token mid-conversation, and
         * navigating then would throw the user back to an empty chat.
         */
        const agentId = session.agents?.[getExodeAgentKind(window.location.search)];


        if (agentId != null && agentId !== '' && handshake.initial) {
          const params = new URLSearchParams(window.location.search);

          if (params.get('agent_id') !== agentId) {
            params.set('agent_id', agentId);
            navigate(`/c/new?${params.toString()}`, { replace: true });
          }
        }
        post(
          {
            protocol: EXODE_EMBED_PROTOCOL,
            source: 'exode-ai-chat',
            type: 'exode-ai-chat:authenticated',
            requestId: message.requestId,
            payload: {},
          },
          event.origin,
        );
      } catch (error) {
        const safeError = getBrowserSafeError(error);
        currentHandshake = undefined;
        post(
          {
            protocol: EXODE_EMBED_PROTOCOL,
            source: 'exode-ai-chat',
            type: 'exode-ai-chat:error',
            requestId: message.requestId,
            payload: safeError,
          },
          event.origin,
        );
      } finally {
        exchangeInFlight = false;
      }
    };

    window.addEventListener('message', handleMessage);
    beginHandshake('exode-ai-chat:ready');

    return () => {
      window.removeEventListener('message', handleMessage);
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }
      clearExternalSession();
    };
  }, [acceptExternalSession, clearExternalSession, config, exchange, navigate]);

  return children;
}
