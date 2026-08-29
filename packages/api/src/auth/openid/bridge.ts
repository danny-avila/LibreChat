/* eslint-disable @typescript-eslint/no-explicit-any -- dependency-injected legacy API boundary */
import crypto from 'node:crypto';

type BridgeIdentity = { userId: string; tenantId?: string; openidIssuer?: string };

export interface RefreshTokenBridgeDeps {
  db: {
    upsertRefreshTokenBridge: (data: Record<string, any>) => Promise<any>;
    findRefreshTokenBridge: (data: Record<string, any>) => Promise<any>;
    deleteRefreshTokenBridges: (data: Record<string, any>) => Promise<any>;
  };
  logger: {
    warn: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    info: (...args: any[]) => void;
  };
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
  math: (value: string | undefined, fallback: number) => number;
  defaultRefreshTokenExpiry: number;
  createIdentity: (data: Record<string, any>) => BridgeIdentity | null;
}

export function createRefreshTokenBridgeService(deps: RefreshTokenBridgeDeps): any {
  const { db, logger, encrypt, decrypt, math, defaultRefreshTokenExpiry, createIdentity } = deps;
  const OPENID_REFRESH_BRIDGE_GRACE_MS = math(
    process.env.OPENID_REFRESH_BRIDGE_GRACE_MS,
    60 * 1000,
  );
  const getBridgeTtlMs = () => math(process.env.REFRESH_TOKEN_EXPIRY, defaultRefreshTokenExpiry);
  const resolveBridgeIdentity = ({ userId, tenantId, openidIssuer }: any) =>
    createIdentity({ userId, tenantId, openidIssuer });
  const hashRefreshToken = (refreshToken: string) =>
    crypto.createHash('sha256').update(refreshToken).digest('hex');

  function createRefreshTokenBridgeFlightKey({
    oldRefreshToken,
    userId,
    tenantId,
    openidIssuer,
  }: any) {
    const identity = resolveBridgeIdentity({ userId, tenantId, openidIssuer });
    if (!oldRefreshToken || !identity) return null;
    return hashRefreshToken(
      [
        'bridge-recovery',
        identity.userId,
        identity.tenantId ?? '',
        identity.openidIssuer ?? '',
        hashRefreshToken(oldRefreshToken),
      ].join('\x1f'),
    );
  }

  async function storeRefreshTokenBridge({
    oldRefreshToken,
    newRefreshToken,
    userId,
    tenantId,
    openidIssuer,
    ttl,
  }: any) {
    const identity = resolveBridgeIdentity({ userId, tenantId, openidIssuer });
    if (!oldRefreshToken || !newRefreshToken || !identity) {
      logger.warn('[RefreshTokenBridge] Attempted to store bridge with missing required fields');
      return;
    }
    const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);
    const bridgeTtl = ttl ?? getBridgeTtlMs();
    await db.upsertRefreshTokenBridge({
      oldRefreshTokenHash,
      encryptedNewRefreshToken: await encrypt(newRefreshToken),
      userId: identity.userId,
      tenantId: identity.tenantId,
      openidIssuer: identity.openidIssuer,
      expiresAt: new Date(Date.now() + bridgeTtl),
    });
    logger.debug('[RefreshTokenBridge] Stored recovery bridge', {
      tokenHash: oldRefreshTokenHash,
      userId: identity.userId,
      ttl: bridgeTtl,
    });
  }

  async function getRefreshTokenBridge({ oldRefreshToken, userId, tenantId, openidIssuer }: any) {
    const identity = resolveBridgeIdentity({ userId, tenantId, openidIssuer });
    if (!oldRefreshToken || !identity) return null;
    const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);
    const bridge = await db.findRefreshTokenBridge({
      oldRefreshTokenHash,
      userId: identity.userId,
      tenantId: identity.tenantId,
    });
    if (!bridge) return null;
    const bridgeIdentity = resolveBridgeIdentity({
      userId: bridge.userId,
      tenantId: bridge.tenantId,
      openidIssuer: bridge.openidIssuer,
    });
    if (!bridgeIdentity || bridgeIdentity.openidIssuer !== identity.openidIssuer) {
      logger.warn('[RefreshTokenBridge] Bridge lookup failed: issuer mismatch', {
        tokenHash: oldRefreshTokenHash,
      });
      return null;
    }
    logger.info('[RefreshTokenBridge] Successfully resolved recovery bridge', {
      tokenHash: oldRefreshTokenHash,
      userId: identity.userId,
      age: Date.now() - new Date(bridge.createdAt).getTime(),
    });
    return decrypt(bridge.encryptedNewRefreshToken);
  }

  async function deleteRefreshTokenBridges({ refreshTokens, userId, tenantId }: any) {
    const identity = resolveBridgeIdentity({ userId, tenantId });
    const tokens = [...new Set<string>((refreshTokens ?? []).filter(Boolean))];
    if (!identity || tokens.length === 0) return null;
    return db.deleteRefreshTokenBridges({
      oldRefreshTokenHashes: tokens.map(hashRefreshToken),
      userId: identity.userId,
      tenantId: identity.tenantId,
    });
  }

  async function deleteAllRefreshTokenBridges({ userId, tenantId }: any) {
    const identity = resolveBridgeIdentity({ userId, tenantId });
    if (!identity) return null;
    return db.deleteRefreshTokenBridges({ userId: identity.userId, tenantId: identity.tenantId });
  }

  return {
    OPENID_REFRESH_BRIDGE_GRACE_MS,
    createRefreshTokenBridgeFlightKey,
    deleteAllRefreshTokenBridges,
    deleteRefreshTokenBridges,
    storeRefreshTokenBridge,
    getRefreshTokenBridge,
    __internals: { hashRefreshToken, getBridgeTtlMs, resolveBridgeIdentity },
  };
}
