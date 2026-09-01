import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { logger, encryptV2, decryptV2, getTenantId } from '@librechat/data-schemas';
import type {
  TokenMethods,
  IToken,
  TokenCreateData,
  TokenUpdateData,
} from '@librechat/data-schemas';
import type { OAuthTokens, OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { MCPOAuthTokens, ExtendedOAuthTokens, OAuthStoredClientMetadata } from './types';
import { isInvalidClientMessage } from '~/mcp/utils';
import { isSystemUserId } from '~/mcp/enum';

export class ReauthenticationRequiredError extends Error {
  constructor(serverName: string, reason: 'expired' | 'missing' | 'invalid_client' | 'binding') {
    let detail: string;
    if (reason === 'invalid_client') {
      detail = 'stored client registration is no longer valid';
    } else if (reason === 'binding') {
      detail = 'stored OAuth binding metadata is missing or no longer valid';
    } else {
      detail = `access token ${reason} and no refresh token available`;
    }
    super(`Re-authentication required for "${serverName}": ${detail}`);
    this.name = 'ReauthenticationRequiredError';
  }
}

interface StoreTokensParams {
  userId: string;
  serverName: string;
  tokens: OAuthTokens | ExtendedOAuthTokens | MCPOAuthTokens;
  createToken: TokenMethods['createToken'];
  updateToken?: TokenMethods['updateToken'];
  deleteTokens?: TokenMethods['deleteTokens'];
  findToken?: TokenMethods['findToken'];
  clientInfo?: OAuthClientInformation;
  metadata?: Partial<OAuthStoredClientMetadata>;
  /** Existing generation that must still own every stored record before a refresh is persisted. */
  expectedCredentialSetId?: string;
  /** Optional: Pass existing token state to avoid duplicate DB calls */
  existingTokens?: {
    accessToken?: IToken | null;
    refreshToken?: IToken | null;
    clientInfoToken?: IToken | null;
  };
}

interface GetTokensParams {
  userId: string;
  serverName: string;
  findToken: TokenMethods['findToken'];
  refreshTokens?: (
    refreshToken: string,
    metadata: {
      userId: string;
      serverName: string;
      identifier: string;
      clientInfo?: OAuthClientInformation;
      storedTokenEndpoint?: string;
      storedAuthMethods?: string[];
      storedServerUrl?: string;
      clientSource?: OAuthStoredClientMetadata['client_source'];
      resource?: string;
    },
    signal?: AbortSignal,
  ) => Promise<MCPOAuthTokens>;
  createToken?: TokenMethods['createToken'];
  updateToken?: TokenMethods['updateToken'];
  /** Enables cleanup of stale client registration and refresh token on invalid_client errors during refresh. */
  deleteTokens?: TokenMethods['deleteTokens'];
  /** Waiter-specific: aborting resolves this caller's wait with `null` without cancelling the shared redemption. */
  signal?: AbortSignal;
  /**
   * Invoked inside the shared redemption after rotated tokens are persisted.
   * Runs even when the initiating waiter has already aborted its wait, so
   * cache invalidation tied to the fresh tokens cannot be skipped by a timeout.
   */
  onRefreshSuccess?: (tokens: MCPOAuthTokens) => Promise<void>;
  /** Separates in-flight redemptions for the same named server under different OAuth bindings. */
  singleFlightScope?: string;
}

/**
 * Reads the `exp` claim (RFC 7519 §4.1.4 / RFC 9068) from a JWT-format access
 * token, returned as epoch milliseconds. Returns null for opaque (non-JWT)
 * tokens or when no usable `exp` is present. The signature is intentionally
 * not verified — the protected resource server validates the token; here we
 * only read its self-declared expiry to avoid a lossy default.
 */
function getJwtAccessTokenExpiry(accessToken?: string): number | null {
  if (!accessToken) {
    return null;
  }
  try {
    const decoded = jwt.decode(accessToken);
    if (
      decoded != null &&
      typeof decoded !== 'string' &&
      typeof decoded.exp === 'number' &&
      Number.isFinite(decoded.exp)
    ) {
      return decoded.exp * 1000;
    }
  } catch {
    /* Not a JWT or malformed — fall through to other expiry sources. */
  }
  return null;
}

function getTokenMetadata(tokenData: IToken | null | undefined): Record<string, unknown> {
  if (tokenData?.metadata == null) {
    return {};
  }
  if (tokenData.metadata instanceof Map) {
    return Object.fromEntries(tokenData.metadata);
  }
  return { ...(tokenData.metadata as unknown as Record<string, unknown>) };
}

function getCredentialSetId(tokenData: IToken | null | undefined): string | undefined {
  const value = getTokenMetadata(tokenData).credential_set_id;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function cloneTokenMetadata(tokenData: IToken): Record<string, unknown> | Map<string, unknown> {
  if (tokenData.metadata instanceof Map) {
    return new Map(tokenData.metadata);
  }
  if (tokenData.metadata) {
    return { ...(tokenData.metadata as unknown as Record<string, unknown>) };
  }
  return {};
}

export class MCPTokenStorage {
  /**
   * Process-local in-flight refresh-token redemptions, keyed by
   * `tenantId:userId:serverName:bindingScope`. Every code path that redeems a refresh token
   * (expired-token refresh via `getTokens`, silent refresh on 401, reconnect
   * retries) converges on `forceRefreshTokens`, so coalescing here guarantees
   * at most one wire call to the token endpoint per user/server at a time.
   * RFC 9700 servers treat a replayed (already-consumed) refresh token as
   * theft and revoke the entire grant family, so concurrent redemptions are
   * not merely wasteful — they destroy the freshly issued tokens. Only
   * in-flight promises are held (no result caching): each new refresh request
   * after settlement triggers a fresh redemption.
   */
  private static inflightRefreshes = new Map<string, Promise<MCPOAuthTokens | null>>();

  /**
   * How long an in-flight redemption may run before it is aborted. Generous
   * relative to a healthy refresh round trip (well under a minute) so the
   * abort only fires for genuinely wedged executions. The single-flight slot
   * is freed when the aborted execution settles — never while it might still
   * reach the token endpoint with the old refresh token.
   */
  static readonly INFLIGHT_REFRESH_STALE_MS = 60_000;

  static getLogPrefix(userId: string, serverName: string): string {
    return isSystemUserId(userId)
      ? `[MCP][${serverName}]`
      : `[MCP][User: ${userId}][${serverName}]`;
  }

  /** Returns whether storage contains a currently usable, generation-bound authorization. */
  static async hasStoredAuthorization({
    userId,
    serverName,
    findToken,
    validateClientBinding,
  }: {
    userId: string;
    serverName: string;
    findToken: TokenMethods['findToken'];
    validateClientBinding: (
      clientInfo: OAuthClientInformation,
      storedMetadata: Partial<OAuthStoredClientMetadata>,
    ) => void;
  }): Promise<boolean> {
    const identifier = `mcp:${serverName}`;
    try {
      const [accessTokenData, clientInfoData] = await Promise.all([
        findToken({ userId, type: 'mcp_oauth', identifier }),
        findToken({ userId, type: 'mcp_oauth_client', identifier: `${identifier}:client` }),
      ]);
      const clientCredentialSetId = getCredentialSetId(clientInfoData);
      const accessCredentialSetId = getCredentialSetId(accessTokenData);
      let hasUsableAuthorization = false;
      if (accessTokenData) {
        if (!accessCredentialSetId || clientCredentialSetId !== accessCredentialSetId) {
          return false;
        }
        if (!accessTokenData.expiresAt || accessTokenData.expiresAt > new Date()) {
          hasUsableAuthorization = true;
        }
      }

      if (!hasUsableAuthorization) {
        const refreshTokenData = await findToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
        });
        const refreshCredentialSetId = getCredentialSetId(refreshTokenData);
        hasUsableAuthorization =
          !!refreshCredentialSetId &&
          refreshCredentialSetId === clientCredentialSetId &&
          (!accessCredentialSetId || refreshCredentialSetId === accessCredentialSetId) &&
          (!refreshTokenData?.expiresAt || refreshTokenData.expiresAt > new Date());
      }

      if (!hasUsableAuthorization || !clientInfoData?.token) {
        return false;
      }

      const clientInfo = JSON.parse(
        await decryptV2(clientInfoData.token),
      ) as OAuthClientInformation;
      try {
        validateClientBinding(clientInfo, getTokenMetadata(clientInfoData));
      } catch (error) {
        logger.debug(
          `${this.getLogPrefix(userId, serverName)} Stored authorization no longer matches the configured OAuth binding`,
          { error },
        );
        return false;
      }
      return true;
    } catch (error) {
      logger.warn(
        `${this.getLogPrefix(userId, serverName)} Failed to inspect stored authorization`,
        {
          error,
        },
      );
      return false;
    }
  }

  /**
   * Confirms a flow-cached access token is still the token in persistent storage. This prevents
   * an old `mcp_get_tokens` result from being paired with newer client-binding metadata.
   */
  static async isCurrentAccessToken({
    userId,
    serverName,
    accessToken,
    credentialSetId,
    findToken,
  }: {
    userId: string;
    serverName: string;
    accessToken: string;
    credentialSetId: string | undefined;
    findToken: TokenMethods['findToken'];
  }): Promise<boolean> {
    try {
      const tokenData = await findToken({
        userId,
        type: 'mcp_oauth',
        identifier: `mcp:${serverName}`,
      });
      if (!tokenData || (tokenData.expiresAt && new Date() >= tokenData.expiresAt)) {
        return false;
      }
      return (
        credentialSetId != null &&
        getCredentialSetId(tokenData) === credentialSetId &&
        (await decryptV2(tokenData.token)) === accessToken
      );
    } catch (error) {
      logger.warn(`${this.getLogPrefix(userId, serverName)} Failed to verify cached access token`, {
        error,
      });
      return false;
    }
  }

  /** Fails closed when separately stored OAuth records are not from the same authorization. */
  static assertCredentialSetBinding(
    serverName: string,
    tokenCredentialSetId: string | undefined,
    clientMetadata: Partial<OAuthStoredClientMetadata> | Record<string, unknown> | undefined,
  ): void {
    const clientCredentialSetId = clientMetadata?.credential_set_id;
    if (
      !tokenCredentialSetId ||
      typeof clientCredentialSetId !== 'string' ||
      clientCredentialSetId.length === 0 ||
      tokenCredentialSetId !== clientCredentialSetId
    ) {
      throw new ReauthenticationRequiredError(serverName, 'binding');
    }
  }

  /**
   * Stores OAuth tokens for an MCP server
   *
   * @param params.existingTokens - Optional: Pass existing token state to avoid duplicate DB calls.
   * This is useful when refreshing tokens, as getTokens() already has the token state.
   */
  static async storeTokens({
    userId,
    serverName,
    tokens,
    createToken,
    updateToken,
    deleteTokens,
    findToken,
    clientInfo,
    existingTokens,
    metadata,
    expectedCredentialSetId,
  }: StoreTokensParams): Promise<MCPOAuthTokens> {
    const logPrefix = this.getLogPrefix(userId, serverName);
    const rollbackWrites: Array<() => Promise<void>> = [];

    try {
      const identifier = `mcp:${serverName}`;
      const tokenCredentialSetId = (tokens as Partial<MCPOAuthTokens>).credential_set_id;
      const metadataCredentialSetId = metadata?.credential_set_id;
      const validTokenCredentialSetId =
        typeof tokenCredentialSetId === 'string' && tokenCredentialSetId.length > 0
          ? tokenCredentialSetId
          : undefined;
      const validMetadataCredentialSetId =
        typeof metadataCredentialSetId === 'string' && metadataCredentialSetId.length > 0
          ? metadataCredentialSetId
          : undefined;
      let credentialSetId: string;
      if (expectedCredentialSetId) {
        if (
          (validTokenCredentialSetId && validTokenCredentialSetId !== expectedCredentialSetId) ||
          (validMetadataCredentialSetId && validMetadataCredentialSetId !== expectedCredentialSetId)
        ) {
          throw new ReauthenticationRequiredError(serverName, 'binding');
        }
        /** Every successful refresh becomes a distinct credential generation. */
        credentialSetId = randomUUID();
      } else {
        /**
         * Only the token exchange result carries an internally generated flow ID. OAuth
         * metadata is provider-controlled (and the schema permits extensions), so it must
         * never select the credential generation for an interactive/non-refresh write.
         */
        credentialSetId = validTokenCredentialSetId ?? randomUUID();
      }
      const tokenMetadata = { credential_set_id: credentialSetId };

      /**
       * Snapshot every record before the first write. Conditional updates below use these
       * encrypted values and generation IDs as an optimistic lock, so a refresh response from
       * generation A cannot overwrite a newer interactive authorization B.
       */
      let existingAccessToken: IToken | null | undefined;
      let existingRefreshToken: IToken | null | undefined;
      let existingClientInfo: IToken | null | undefined;
      if (findToken && updateToken) {
        const accessLookup =
          existingTokens?.accessToken !== undefined
            ? Promise.resolve(existingTokens.accessToken)
            : findToken({ userId, type: 'mcp_oauth', identifier });
        const refreshLookup =
          existingTokens?.refreshToken !== undefined
            ? Promise.resolve(existingTokens.refreshToken)
            : findToken({
                userId,
                type: 'mcp_oauth_refresh',
                identifier: `${identifier}:refresh`,
              });
        const clientLookup =
          existingTokens?.clientInfoToken !== undefined
            ? Promise.resolve(existingTokens.clientInfoToken)
            : findToken({
                userId,
                type: 'mcp_oauth_client',
                identifier: `${identifier}:client`,
              });

        [existingAccessToken, existingRefreshToken, existingClientInfo] = await Promise.all([
          accessLookup,
          refreshLookup,
          clientLookup,
        ]);
      }

      if (expectedCredentialSetId) {
        if (!existingRefreshToken || !existingClientInfo) {
          throw new ReauthenticationRequiredError(serverName, 'binding');
        }
        for (const currentRecord of [
          existingAccessToken,
          existingRefreshToken,
          existingClientInfo,
        ]) {
          if (currentRecord && getCredentialSetId(currentRecord) !== expectedCredentialSetId) {
            throw new ReauthenticationRequiredError(serverName, 'binding');
          }
        }
      } else if (
        existingAccessToken &&
        existingClientInfo &&
        getCredentialSetId(existingAccessToken) !== getCredentialSetId(existingClientInfo)
      ) {
        /**
         * A fresh authorization may replace a coherent generation, but it must not build on a
         * crash-left mixed anchor. Allowing that would let three concurrent writers chain their
         * access-token CAS operations and make a later rollback resurrect a failed generation.
         */
        throw new ReauthenticationRequiredError(serverName, 'binding');
      }

      const updateIfCurrent = async (
        existingToken: IToken,
        type: string,
        recordIdentifier: string,
        tokenData: TokenUpdateData,
      ): Promise<void> => {
        const existingCredentialSetId = getCredentialSetId(existingToken);
        const updated = await updateToken!(
          {
            userId,
            type,
            identifier: recordIdentifier,
            token: existingToken.token,
            metadataCredentialSetId: existingCredentialSetId ?? null,
          },
          tokenData,
        );
        if (!updated) {
          throw new ReauthenticationRequiredError(serverName, 'binding');
        }
        const postWriteToken = tokenData.token ?? existingToken.token;
        const previousMetadata = cloneTokenMetadata(existingToken);
        rollbackWrites.push(async () => {
          const restored = await updateToken!(
            {
              userId,
              type,
              identifier: recordIdentifier,
              token: postWriteToken,
              metadataCredentialSetId: credentialSetId,
            },
            {
              token: existingToken.token,
              expiresAt: existingToken.expiresAt,
              metadata: previousMetadata,
            },
          );
          if (!restored) {
            logger.warn(
              `${logPrefix} Skipped OAuth rollback for ${type}; the record was superseded`,
            );
          }
        });
      };

      const createWithRollback = async (
        type: string,
        recordIdentifier: string,
        tokenData: TokenCreateData,
      ): Promise<void> => {
        await createToken(tokenData);
        if (!deleteTokens) {
          return;
        }
        rollbackWrites.push(async () => {
          const result = await deleteTokens({
            userId,
            type,
            identifier: recordIdentifier,
            token: tokenData.token,
            metadataCredentialSetId: credentialSetId,
          });
          if (result.deletedCount === 0) {
            logger.warn(
              `${logPrefix} Skipped OAuth create rollback for ${type}; the record was superseded`,
            );
          }
        });
      };

      interface PlannedTokenWrite {
        type: string;
        identifier: string;
        existingToken?: IToken | null;
        createData?: TokenCreateData;
        updateData: TokenUpdateData;
        description: string;
      }

      const plannedWrites: PlannedTokenWrite[] = [];

      // Encrypt and store access token
      const encryptedAccessToken = await encryptV2(tokens.access_token);

      logger.debug(
        `${logPrefix} Token expires_in: ${'expires_in' in tokens ? tokens.expires_in : 'N/A'}, expires_at: ${'expires_at' in tokens ? tokens.expires_at : 'N/A'}`,
      );

      const defaultTTL = 365 * 24 * 60 * 60;

      let accessTokenExpiry: Date;
      let expiresInSeconds: number;
      if ('expires_at' in tokens && tokens.expires_at) {
        /** MCPOAuthTokens format - already has calculated expiry */
        logger.debug(`${logPrefix} Using expires_at: ${tokens.expires_at}`);
        accessTokenExpiry = new Date(tokens.expires_at);
        expiresInSeconds = Math.floor((accessTokenExpiry.getTime() - Date.now()) / 1000);
      } else if (tokens.expires_in) {
        /** Standard OAuthTokens format - use expires_in directly to avoid lossy Date round-trip */
        logger.debug(`${logPrefix} Using expires_in: ${tokens.expires_in}`);
        expiresInSeconds = tokens.expires_in;
        accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      } else {
        /**
         * RFC 6749 §5.1 makes `expires_in` only RECOMMENDED, so some providers
         * (e.g. Salesforce) omit it. When the access token is a JWT (RFC 9068),
         * its `exp` claim is the authoritative lifetime — prefer it over the
         * 365-day default so the token is refreshed on time rather than being
         * treated as valid for a year and never refreshed.
         */
        const jwtExpiryMs = getJwtAccessTokenExpiry(tokens.access_token);
        if (jwtExpiryMs != null && jwtExpiryMs > Date.now()) {
          logger.debug(`${logPrefix} Using JWT exp claim: ${new Date(jwtExpiryMs).toISOString()}`);
          accessTokenExpiry = new Date(jwtExpiryMs);
          expiresInSeconds = Math.floor((jwtExpiryMs - Date.now()) / 1000);
        } else {
          logger.debug(`${logPrefix} No expiry provided, using default`);
          expiresInSeconds = defaultTTL;
          accessTokenExpiry = new Date(Date.now() + defaultTTL * 1000);
        }
      }

      logger.debug(`${logPrefix} Calculated expiry date: ${accessTokenExpiry.toISOString()}`);

      if (isNaN(accessTokenExpiry.getTime())) {
        logger.error(`${logPrefix} Invalid expiry date calculated, using default`);
        accessTokenExpiry = new Date(Date.now() + defaultTTL * 1000);
        expiresInSeconds = defaultTTL;
      }

      const accessTokenData = {
        userId,
        type: 'mcp_oauth',
        identifier,
        token: encryptedAccessToken,
        expiresIn: expiresInSeconds > 0 ? expiresInSeconds : defaultTTL,
        metadata: tokenMetadata,
      };

      plannedWrites.push({
        type: 'mcp_oauth',
        identifier,
        existingToken: existingAccessToken,
        createData: accessTokenData,
        updateData: accessTokenData,
        description: 'access token',
      });

      // Store refresh token if available
      if (tokens.refresh_token) {
        logger.debug(
          `${logPrefix} New refresh token received from OAuth server, will store/update`,
        );
        const encryptedRefreshToken = await encryptV2(tokens.refresh_token);
        const extendedTokens = tokens as ExtendedOAuthTokens;
        const refreshTokenExpiry = extendedTokens.refresh_token_expires_in
          ? new Date(Date.now() + extendedTokens.refresh_token_expires_in * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year

        /** Calculated expiresIn for refresh token */
        const refreshExpiresIn = Math.floor((refreshTokenExpiry.getTime() - Date.now()) / 1000);

        const refreshTokenData = {
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
          token: encryptedRefreshToken,
          expiresIn: refreshExpiresIn > 0 ? refreshExpiresIn : 365 * 24 * 60 * 60,
          metadata: tokenMetadata,
        };

        plannedWrites.push({
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
          existingToken: existingRefreshToken,
          createData: refreshTokenData,
          updateData: refreshTokenData,
          description: 'refresh token',
        });
      } else {
        logger.debug(
          `${logPrefix} No refresh token in response - OAuth server did not rotate refresh token (this is normal for some providers)`,
        );
        if (expectedCredentialSetId && existingRefreshToken && updateToken) {
          plannedWrites.push({
            type: 'mcp_oauth_refresh',
            identifier: `${identifier}:refresh`,
            existingToken: existingRefreshToken,
            updateData: { metadata: tokenMetadata },
            description: 'refresh token binding',
          });
        }
      }

      /** Store client information if provided */
      if (clientInfo) {
        logger.debug(`${logPrefix} Storing client info:`, {
          client_id: clientInfo.client_id,
          has_client_secret: !!clientInfo.client_secret,
        });
        const encryptedClientInfo = await encryptV2(JSON.stringify(clientInfo));

        const clientInfoData = {
          userId,
          type: 'mcp_oauth_client',
          identifier: `${identifier}:client`,
          token: encryptedClientInfo,
          expiresIn: 365 * 24 * 60 * 60,
          metadata: { ...metadata, credential_set_id: credentialSetId },
        };

        plannedWrites.push({
          type: 'mcp_oauth_client',
          identifier: `${identifier}:client`,
          existingToken: existingClientInfo,
          createData: clientInfoData,
          updateData: clientInfoData,
          description: 'client info',
        });
      }

      /**
       * Claim an existing access record first (then refresh/client as fallbacks). Once the
       * anchor moves to the target generation, a competing writer can only continue from the
       * exact record versions it observed. Remaining writes are journaled so a later failure
       * restores the exact snapshot without clobbering a still-newer writer. The preflight gate
       * above rejects mixed access/client snapshots before they can extend this CAS chain.
       */
      const anchorIndex = plannedWrites.findIndex((write) => write.existingToken != null);
      const orderedWrites =
        anchorIndex > 0
          ? [
              plannedWrites[anchorIndex],
              ...plannedWrites.slice(0, anchorIndex),
              ...plannedWrites.slice(anchorIndex + 1),
            ]
          : plannedWrites;

      for (const write of orderedWrites) {
        if (findToken && updateToken && write.existingToken) {
          await updateIfCurrent(
            write.existingToken,
            write.type,
            write.identifier,
            write.updateData,
          );
          logger.debug(`${logPrefix} Updated existing ${write.description}`);
        } else if (write.createData) {
          await createWithRollback(write.type, write.identifier, write.createData);
          logger.debug(`${logPrefix} Created ${write.description}`);
        } else {
          throw new ReauthenticationRequiredError(serverName, 'binding');
        }
      }

      /**
       * An interactive response without a refresh token must never bind an older refresh
       * secret to the new client. Remove that stale record after the committed writes. This
       * cleanup is best-effort and fully scoped; reads already omit it if a crash or transient
       * database error leaves it behind.
       */
      if (
        !expectedCredentialSetId &&
        !tokens.refresh_token &&
        existingRefreshToken &&
        getCredentialSetId(existingRefreshToken) !== credentialSetId &&
        deleteTokens
      ) {
        try {
          const result = await deleteTokens({
            userId,
            type: 'mcp_oauth_refresh',
            identifier: `${identifier}:refresh`,
            token: existingRefreshToken.token,
            metadataCredentialSetId: getCredentialSetId(existingRefreshToken) ?? null,
          });
          if (result.deletedCount === 0) {
            logger.debug(`${logPrefix} Stale refresh token was already superseded`);
          }
        } catch (cleanupError) {
          logger.warn(`${logPrefix} Failed to remove stale refresh token after OAuth callback`, {
            error: cleanupError,
          });
        }
      }

      logger.debug(`${logPrefix} Stored OAuth tokens`, {
        client_id: clientInfo?.client_id,
        has_refresh_token: !!tokens.refresh_token,
        expires_at: 'expires_at' in tokens ? tokens.expires_at : 'N/A',
      });
      return {
        ...tokens,
        credential_set_id: credentialSetId,
        obtained_at:
          'obtained_at' in tokens && typeof tokens.obtained_at === 'number'
            ? tokens.obtained_at
            : Date.now(),
        expires_at: accessTokenExpiry.getTime(),
      };
    } catch (error) {
      for (const rollback of rollbackWrites.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          logger.warn(`${logPrefix} Failed to roll back a partial OAuth credential write`, {
            error: rollbackError,
          });
        }
      }
      logger.error(`${logPrefix} Failed to store tokens`, error);
      throw error;
    }
  }

  /**
   * Forces a refresh of OAuth tokens using the stored refresh token, regardless
   * of whether the access token appears locally expired. Use this when the
   * server has signaled token invalidity (e.g. a 401 mid-session) — the 401 is
   * the authoritative signal, not the local `expires_at`.
   *
   * Single-flighted per `(tenantId, userId, serverName, bindingScope)`: concurrent callers
   * (tool-call 401s, pings, reconnect retries, expired-token reads) share one
   * redemption and receive the same rotated result instead of each replaying
   * the refresh token at the token endpoint.
   *
   * Returns the new tokens, or `null` when refresh is not possible (no refresh
   * token stored, no refresh callback, etc.). Throws `ReauthenticationRequiredError`
   * when the refresh server response indicates the client registration is stale.
   */
  static async forceRefreshTokens(
    params: GetTokensParams & {
      existingAccessToken?: IToken | null;
    },
  ): Promise<MCPOAuthTokens | null> {
    const { userId, serverName, refreshTokens, createToken, signal, singleFlightScope } = params;
    const logPrefix = this.getLogPrefix(userId, serverName);

    const refreshKey = `${getTenantId() ?? ''}:${userId}:${serverName}:${singleFlightScope ?? ''}`;
    const inflight = this.inflightRefreshes.get(refreshKey);
    if (inflight) {
      logger.debug(`${logPrefix} Joining in-flight token refresh`);
      return this.raceWithAbort(inflight, signal);
    }

    if (!refreshTokens) {
      logger.warn(`${logPrefix} Cannot refresh tokens: no \`refreshTokens\` callback provided`);
      return null;
    }

    if (!createToken) {
      logger.warn(`${logPrefix} Cannot refresh tokens: no \`createToken\` function provided`);
      return null;
    }

    /**
     * The shared redemption is owner-neutral: no caller's `AbortSignal` is
     * threaded into the execution, so an impatient waiter (e.g. the silent
     * refresh path's short timeout) cannot cancel the wire call for everyone
     * who joined. Cancellation is waiter-specific via `raceWithAbort`; the
     * execution itself is bounded by the internal stale-abort controller below.
     */
    const executionController = new AbortController();
    const refreshPromise = this.executeTokenRefresh({
      ...params,
      refreshTokens,
      createToken,
      signal: executionController.signal,
    }).finally(() => {
      clearTimeout(staleTimer);
      if (this.inflightRefreshes.get(refreshKey) === refreshPromise) {
        this.inflightRefreshes.delete(refreshKey);
      }
    });
    /**
     * Safety valve for wedged executions: after the stale window the execution
     * is aborted so it can never reach the token endpoint with a refresh token
     * that a successor is about to redeem. The slot itself is freed only by the
     * `.finally` above, that is, once the aborted execution has actually
     * settled. Deleting the entry while the redemption might still consume the
     * stored refresh token would re-open the concurrent-replay window this
     * single-flight exists to close.
     *
     * If the abort lands after the endpoint already processed the request
     * (response lost in transit), the rotated tokens are unrecoverable and the
     * stored refresh token is deliberately left in place rather than deleted.
     * A later redemption then either succeeds (request never actually
     * processed, or the server grants rotation leeway) or trips reuse
     * detection on a family whose fresh tokens were never received and whose
     * access token was already expired or rejected. That failure ends in the
     * same re-authentication the proactive deletion would force on every
     * stall, while deletion would also foreclose the silent recovery paths.
     */
    const staleTimer = setTimeout(() => {
      if (this.inflightRefreshes.get(refreshKey) === refreshPromise) {
        logger.warn(
          `${logPrefix} Aborting stalled in-flight token refresh after ${MCPTokenStorage.INFLIGHT_REFRESH_STALE_MS}ms`,
        );
        executionController.abort();
      }
    }, MCPTokenStorage.INFLIGHT_REFRESH_STALE_MS);
    staleTimer.unref?.();
    this.inflightRefreshes.set(refreshKey, refreshPromise);
    return this.raceWithAbort(refreshPromise, signal);
  }

  /**
   * Wraps the shared redemption promise for a single waiter: if the waiter's
   * `signal` aborts first, that waiter receives `null` (matching the prior
   * abort contract) while the shared execution continues for other callers.
   */
  private static raceWithAbort(
    promise: Promise<MCPOAuthTokens | null>,
    signal?: AbortSignal,
  ): Promise<MCPOAuthTokens | null> {
    if (!signal) {
      return promise;
    }
    if (signal.aborted) {
      return Promise.resolve(null);
    }
    return new Promise<MCPOAuthTokens | null>((resolve, reject) => {
      const onAbort = () => resolve(null);
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  /**
   * Runs a single refresh-token redemption under the `inflightRefreshes`
   * single-flight lock. The refresh token is read from storage at execution
   * time — never from a caller-provided snapshot — so a redemption that starts
   * after another refresh completed uses the rotated token instead of
   * replaying the consumed one (which RFC 9700 reuse detection punishes by
   * revoking the whole grant family).
   */
  private static async executeTokenRefresh({
    userId,
    serverName,
    findToken,
    createToken,
    updateToken,
    deleteTokens,
    refreshTokens,
    existingAccessToken,
    onRefreshSuccess,
    signal,
  }: GetTokensParams & {
    existingAccessToken?: IToken | null;
    refreshTokens: NonNullable<GetTokensParams['refreshTokens']>;
    createToken: NonNullable<GetTokensParams['createToken']>;
    /** Internal stale-abort signal owned by `forceRefreshTokens` — never a caller's. */
    signal: AbortSignal;
  }): Promise<MCPOAuthTokens | null> {
    const logPrefix = this.getLogPrefix(userId, serverName);
    const identifier = `mcp:${serverName}`;

    const refreshTokenData = await findToken({
      userId,
      type: 'mcp_oauth_refresh',
      identifier: `${identifier}:refresh`,
    });

    if (!refreshTokenData) {
      logger.debug(`${logPrefix} No refresh token in storage`);
      return null;
    }

    const refreshCredentialSetId = getCredentialSetId(refreshTokenData);
    try {
      logger.info(`${logPrefix} Attempting to refresh token`);

      let clientInfo;
      let clientInfoData;
      let storedClientMetadata: Partial<OAuthStoredClientMetadata> | undefined;
      let storedTokenEndpoint: string | undefined;
      let storedAuthMethods: string[] | undefined;
      let storedServerUrl: string | undefined;
      let clientSource: OAuthStoredClientMetadata['client_source'] | undefined;
      let resource: string | undefined;
      try {
        clientInfoData = await findToken({
          userId,
          type: 'mcp_oauth_client',
          identifier: `${identifier}:client`,
        });
        if (clientInfoData) {
          const decryptedClientInfo = await decryptV2(clientInfoData.token);
          clientInfo = JSON.parse(decryptedClientInfo);
          logger.debug(`${logPrefix} Retrieved client info:`, {
            client_id: clientInfo.client_id,
            has_client_secret: !!clientInfo.client_secret,
          });

          if (clientInfoData.metadata) {
            const raw = getTokenMetadata(clientInfoData);
            storedClientMetadata = raw as Partial<OAuthStoredClientMetadata>;
            if (typeof raw.token_endpoint === 'string') {
              storedTokenEndpoint = raw.token_endpoint;
            }
            if (Array.isArray(raw.token_endpoint_auth_methods_supported)) {
              storedAuthMethods = raw.token_endpoint_auth_methods_supported as string[];
            }
            if (typeof raw.server_url === 'string') {
              storedServerUrl = raw.server_url;
            }
            if (raw.client_source === 'configured' || raw.client_source === 'dynamic') {
              clientSource = raw.client_source;
            }
            if (typeof raw.resource === 'string') {
              resource = raw.resource;
            }
          }
        }
      } catch {
        logger.debug(`${logPrefix} No client info found`);
      }

      if (
        !clientInfo?.client_id ||
        !storedTokenEndpoint ||
        !storedServerUrl ||
        !clientSource ||
        !refreshCredentialSetId
      ) {
        throw new ReauthenticationRequiredError(serverName, 'binding');
      }
      this.assertCredentialSetBinding(serverName, refreshCredentialSetId, storedClientMetadata);
      const decryptedRefreshToken = await decryptV2(refreshTokenData.token);

      const metadata = {
        userId,
        serverName,
        identifier,
        clientInfo,
        storedTokenEndpoint,
        storedAuthMethods,
        storedServerUrl,
        clientSource,
        resource,
      };

      /**
       * A stalled execution may wake here after the stale-abort fired and a
       * successor already redeemed (and rotated) the refresh token — reaching
       * the endpoint with the old token would trip RFC 9700 reuse detection.
       */
      if (signal.aborted) {
        throw new Error('Token refresh aborted before reaching the token endpoint');
      }

      const newTokens = await refreshTokens(decryptedRefreshToken, metadata, signal);

      logger.debug(`${logPrefix} Refresh completed`, {
        has_new_access_token: !!newTokens.access_token,
        has_new_refresh_token: !!newTokens.refresh_token,
        refresh_token_will_be_rotated: !!newTokens.refresh_token,
        expires_at: newTokens.expires_at,
      });

      // Store the refreshed tokens (handles both create and update)
      // Pass existing token state to avoid duplicate DB calls
      const storedTokens = await this.storeTokens({
        userId,
        serverName,
        tokens: newTokens,
        createToken,
        updateToken,
        deleteTokens,
        findToken,
        clientInfo,
        existingTokens: {
          accessToken: existingAccessToken ?? undefined,
          refreshToken: refreshTokenData,
          clientInfoToken: clientInfoData,
        },
        metadata: storedClientMetadata,
        expectedCredentialSetId: refreshCredentialSetId,
      });

      if (onRefreshSuccess) {
        try {
          await onRefreshSuccess(storedTokens);
        } catch (hookError) {
          logger.warn(`${logPrefix} onRefreshSuccess callback failed`, hookError);
        }
      }

      logger.info(`${logPrefix} Successfully refreshed and stored OAuth tokens`);
      return storedTokens;
    } catch (refreshError) {
      logger.error(`${logPrefix} Failed to refresh tokens`, refreshError);
      if (refreshError instanceof ReauthenticationRequiredError) {
        throw refreshError;
      }
      // Check if it's an unauthorized_client error (refresh not supported)
      const errorMessage =
        refreshError instanceof Error ? refreshError.message : String(refreshError);
      if (errorMessage.toLowerCase().includes('unauthorized_client')) {
        logger.info(
          `${logPrefix} Server does not support refresh tokens for this client. New authentication required.`,
        );
      } else if (isInvalidClientMessage(errorMessage)) {
        if (deleteTokens) {
          logger.info(
            `${logPrefix} Client registration rejected during token refresh, attempting to clear stale registration and refresh token`,
          );
          const results = await Promise.allSettled([
            MCPTokenStorage.deleteClientRegistration({
              userId,
              serverName,
              deleteTokens,
              credentialSetId: refreshCredentialSetId,
            }),
            deleteTokens({
              userId,
              type: 'mcp_oauth_refresh',
              identifier: `${identifier}:refresh`,
              ...(refreshCredentialSetId && {
                metadataCredentialSetId: refreshCredentialSetId,
              }),
            }),
          ]);
          for (const r of results) {
            if (r.status === 'rejected') {
              logger.warn(`${logPrefix} Failed to clear stale token data`, r.reason);
            }
          }
          throw new ReauthenticationRequiredError(serverName, 'invalid_client');
        }
        logger.warn(
          `${logPrefix} Client registration rejected during token refresh but deleteTokens not available — stale registration cannot be cleared`,
        );
      }
      return null;
    }
  }

  /**
   * Retrieves OAuth tokens for an MCP server
   */
  static async getTokens({
    userId,
    serverName,
    findToken,
    createToken,
    updateToken,
    deleteTokens,
    refreshTokens,
    singleFlightScope,
  }: GetTokensParams): Promise<MCPOAuthTokens | null> {
    const logPrefix = this.getLogPrefix(userId, serverName);

    try {
      const identifier = `mcp:${serverName}`;

      // Get access token
      const accessTokenData = await findToken({
        userId,
        type: 'mcp_oauth',
        identifier,
      });

      /** Check if access token is missing or expired */
      const isMissing = !accessTokenData;
      const isExpired = accessTokenData?.expiresAt && new Date() >= accessTokenData.expiresAt;

      if (isMissing || isExpired) {
        logger.info(`${logPrefix} Access token ${isMissing ? 'missing' : 'expired'}`);

        /** Probe for a refresh token first so we can throw `ReauthenticationRequiredError`
         *  when none exists, matching the prior contract. The probe result is
         *  intentionally not passed to `forceRefreshTokens` — the redemption
         *  re-reads storage under its single-flight lock so it never replays a
         *  refresh token that a concurrent refresh already consumed. */
        const refreshTokenData = await findToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
        });

        if (!refreshTokenData) {
          const reason = isMissing ? 'missing' : 'expired';
          logger.info(
            `${logPrefix} Access token ${reason} and no refresh token available — re-authentication required`,
          );
          throw new ReauthenticationRequiredError(serverName, reason);
        }

        return await this.forceRefreshTokens({
          userId,
          serverName,
          findToken,
          createToken,
          updateToken,
          deleteTokens,
          refreshTokens,
          singleFlightScope,
          existingAccessToken: accessTokenData,
        });
      }

      // If we reach here, access token should exist and be valid
      if (!accessTokenData) {
        return null;
      }

      const credentialSetId = getCredentialSetId(accessTokenData);
      if (!credentialSetId) {
        throw new ReauthenticationRequiredError(serverName, 'binding');
      }

      const decryptedAccessToken = await decryptV2(accessTokenData.token);

      /** Get refresh token if available */
      const refreshTokenData = await findToken({
        userId,
        type: 'mcp_oauth_refresh',
        identifier: `${identifier}:refresh`,
      });

      const clientInfoData = await findToken({
        userId,
        type: 'mcp_oauth_client',
        identifier: `${identifier}:client`,
      });
      this.assertCredentialSetBinding(
        serverName,
        credentialSetId,
        getTokenMetadata(clientInfoData),
      );

      const tokens: MCPOAuthTokens = {
        access_token: decryptedAccessToken,
        token_type: 'Bearer',
        credential_set_id: credentialSetId,
        obtained_at: accessTokenData.createdAt.getTime(),
        expires_at: accessTokenData.expiresAt?.getTime(),
      };

      if (refreshTokenData && getCredentialSetId(refreshTokenData) === credentialSetId) {
        tokens.refresh_token = await decryptV2(refreshTokenData.token);
      } else if (refreshTokenData) {
        logger.warn(`${logPrefix} Ignoring refresh token from a different OAuth credential set`);
      }

      logger.debug(`${logPrefix} Loaded existing OAuth tokens from storage`);
      return tokens;
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError) {
        throw error;
      }
      logger.error(`${logPrefix} Failed to retrieve tokens`, error);
      return null;
    }
  }

  static async getClientInfoAndMetadata({
    userId,
    serverName,
    findToken,
  }: {
    userId: string;
    serverName: string;
    findToken: TokenMethods['findToken'];
  }): Promise<{
    clientInfo: OAuthClientInformation;
    clientMetadata: Record<string, unknown>;
  } | null> {
    const identifier = `mcp:${serverName}`;

    const clientInfoData: IToken | null = await findToken({
      userId,
      type: 'mcp_oauth_client',
      identifier: `${identifier}:client`,
    });
    if (clientInfoData == null) {
      return null;
    }

    const tokenData = await decryptV2(clientInfoData.token);
    const clientInfo = JSON.parse(tokenData);

    const clientMetadata = getTokenMetadata(clientInfoData);

    return {
      clientInfo,
      clientMetadata,
    };
  }

  /** Deletes only the stored client registration for a specific user and server */
  static async deleteClientRegistration({
    userId,
    serverName,
    deleteTokens,
    credentialSetId,
  }: {
    userId: string;
    serverName: string;
    deleteTokens: TokenMethods['deleteTokens'];
    credentialSetId?: string;
  }): Promise<void> {
    const identifier = `mcp:${serverName}`;
    await deleteTokens({
      userId,
      type: 'mcp_oauth_client',
      identifier: `${identifier}:client`,
      ...(credentialSetId && { metadataCredentialSetId: credentialSetId }),
    });
    const logPrefix = this.getLogPrefix(userId, serverName);
    logger.debug(`${logPrefix} Cleared stored client registration`);
  }

  /**
   * Deletes all OAuth-related tokens for a specific user and server
   */
  static async deleteUserTokens({
    userId,
    serverName,
    deleteToken,
  }: {
    userId: string;
    serverName: string;
    deleteToken: (filter: { userId: string; type: string; identifier: string }) => Promise<void>;
  }): Promise<void> {
    const identifier = `mcp:${serverName}`;

    // delete client info token
    await deleteToken({
      userId,
      type: 'mcp_oauth_client',
      identifier: `${identifier}:client`,
    });

    // delete access token
    await deleteToken({
      userId,
      type: 'mcp_oauth',
      identifier,
    });

    // delete refresh token
    await deleteToken({
      userId,
      type: 'mcp_oauth_refresh',
      identifier: `${identifier}:refresh`,
    });
  }
}
