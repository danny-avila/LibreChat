import jwt from 'jsonwebtoken';

/**
 * Mints short-lived service-to-service JWTs the LibreChat backend sends to
 * django-hub when executing Django-backed tool calls on behalf of a chat user.
 *
 * The claim shape is fixed by django-hub's ChatMintedJWTAuthentication:
 *   { iss: 'librechat', sub: <chat user id>, email: <chat user email>, exp }
 * signed HS256 with the shared CHAT_SECRET. Django resolves the user by `sub`
 * (integer pk) and falls back to `email`, so email is the canonical join key.
 */

const CHAT_TOKEN_ISSUER = 'librechat';
const CHAT_TOKEN_ALGORITHM = 'HS256';
const DEFAULT_EXPIRY_SECONDS = 300;
const REFRESH_SKEW_MS = 30_000;

export interface ChatTokenUser {
  id: string;
  email?: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

const getExpirySeconds = (): number => {
  const raw = Number(process.env.CHAT_TOKEN_EXPIRY_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EXPIRY_SECONDS;
};

const getSecret = (): string => {
  const secret = process.env.CHAT_SECRET ?? '';
  if (!secret) {
    throw new Error('CHAT_SECRET is not configured; cannot mint django-hub tool token');
  }
  return secret;
};

const cacheKey = (user: ChatTokenUser): string => `${user.id}:${user.email ?? ''}`;

/**
 * Returns a valid chat-minted JWT for the user, reusing a cached token until it
 * is within REFRESH_SKEW_MS of expiry.
 */
export function mintChatJwt(user: ChatTokenUser): string {
  const now = Date.now();
  const key = cacheKey(user);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs - REFRESH_SKEW_MS > now) {
    return cached.token;
  }

  const expirySeconds = getExpirySeconds();
  const token = jwt.sign(
    { sub: user.id, ...(user.email ? { email: user.email } : {}) },
    getSecret(),
    { algorithm: CHAT_TOKEN_ALGORITHM, issuer: CHAT_TOKEN_ISSUER, expiresIn: expirySeconds },
  );

  tokenCache.set(key, { token, expiresAtMs: now + expirySeconds * 1000 });
  return token;
}

export function clearChatJwtCache(): void {
  tokenCache.clear();
}
