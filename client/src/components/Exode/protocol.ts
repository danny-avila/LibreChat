import { z } from 'zod';

export const EXODE_EMBED_QUERY = 'embed=exode';
export const EXODE_EMBED_PROTOCOL = 1 as const;

const envelopeSchema = z.object({
  protocol: z.literal(EXODE_EMBED_PROTOCOL),
  source: z.literal('exode-host'),
  requestId: z.string().uuid(),
});

const authenticateSchema = envelopeSchema.extend({
  type: z.literal('exode-ai-chat:authenticate'),
  payload: z.object({
    token: z.string().min(16).max(16_384),
    handshakeId: z.string().uuid(),
  }),
});

const logoutSchema = envelopeSchema.extend({
  type: z.literal('exode-ai-chat:logout'),
  payload: z.object({}).optional(),
});

export const exodeHostMessageSchema = z.discriminatedUnion('type', [
  authenticateSchema,
  logoutSchema,
]);

export type ExodeHostMessage = z.infer<typeof exodeHostMessageSchema>;

export interface ExodeBridgeMessage {
  protocol: typeof EXODE_EMBED_PROTOCOL;
  source: 'exode-ai-chat';
  type:
    | 'exode-ai-chat:ready'
    | 'exode-ai-chat:authenticated'
    | 'exode-ai-chat:refresh-required'
    | 'exode-ai-chat:error';
  requestId: string;
  payload: object;
}

export function isExodeEmbedLocation(pathname: string, search: string): boolean {
  if (pathname === '/embed/exode') {
    return true;
  }
  return new URLSearchParams(search).get('embed') === 'exode';
}

/** Which provisioned agent the host wants this frame to open */
export type ExodeAgentKind = 'knowledge' | 'assistant';

/**
 * Reads the requested agent from the embed URL.
 *
 * Carried in the URL rather than in a postMessage: the host already controls the iframe `src`,
 * and the value has to survive the bridge's own navigation to the conversation. Anything other
 * than the two known kinds falls back to `assistant` — the host must never be able to name an
 * arbitrary agent, since exode decides which ids this principal may actually open.
 */
export function getExodeAgentKind(search: string): ExodeAgentKind {
  return new URLSearchParams(search).get('agent') === 'knowledge'
    ? 'knowledge'
    : 'assistant';
}
