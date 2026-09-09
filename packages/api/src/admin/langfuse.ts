import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { logger, BASE_CONFIG_PRINCIPAL_ID } from '@librechat/data-schemas';
import type {
  TCustomConfig,
  TLangfuseConnectionStatus,
  TUpdateLangfuseConnectionRequest,
  TLangfuseConnectionTestErrorCode,
  TLangfuseConnectionTestRequest,
  TLangfuseConnectionTestResponse,
  TLangfuseSessionLinkResponse,
} from 'librechat-data-provider';
import type {
  FindConfigByPrincipalOptions,
  IConfig,
  MessageMethods,
} from '@librechat/data-schemas';
import type { Types, ClientSession } from 'mongoose';
import type { Response } from 'express';
import type { LangfuseTenantDestination } from '~/langfuse/tenantDestinations';
import type { ServerRequest } from '~/types/http';
import {
  getLangfuseTenantDestinations,
  resolveLangfuseTenantDestination,
} from '~/langfuse/tenantDestinations';
import {
  decryptConfigSecret,
  encryptConfigSecretFields,
  encryptLegacyPlaintextConfigSecrets,
} from './secrets';
import {
  isTransactionRequired,
  isConfigVersionConflict,
  rejectConfigVersionConflict,
} from './config';
import { redirectPolicyFor, resolveLangfuseHeaders } from '~/langfuse/utils';
import { scopeHeadersToDestination } from '~/langfuse/destinations';
import { isLangfuseConnectionAvailable } from '~/langfuse/policy';
import { resolveLangfuseSessionUrl } from '~/langfuse/session';
import { getEffectiveTenantId } from '~/middleware/tenant';
import { mergeHeaders } from '~/utils/headers';

const ENCRYPTED_PREFIX = 'v3:';
const LANGFUSE_VERIFICATION_TIMEOUT_MS = 10_000;

type LangfuseConnectionChange =
  | 'created'
  | 'credentials_rotated'
  | 'destination_changed'
  | 'disabled'
  | 'enabled'
  | 'updated';
type LangfuseConnectionChanges = [LangfuseConnectionChange, ...LangfuseConnectionChange[]];

export interface LangfuseConnectionEvent {
  event_name: 'librechat.langfuse.connection.changed';
  tenant_id?: string;
  configured: boolean;
  enabled: boolean;
  destination?: string;
  change: LangfuseConnectionChange;
  changes: LangfuseConnectionChange[];
  verification_result: 'skipped' | 'success';
}

type LangfuseMutationOp = {
  kind: 'fields';
  resetPaths: string[];
  fields: Record<string, unknown>;
  priority: number;
  isActive?: boolean;
};

export interface AdminLangfuseDeps {
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: FindConfigByPrincipalOptions,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  mutateConfigWithRevision: (params: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
    principalModel: PrincipalModel;
    expectedVersion: number | null;
    op: LangfuseMutationOp;
    cause: 'save';
    actor: { actorId: string; actorEmail?: string; tenantId: string };
    normalizeSecrets?: (overrides: Record<string, unknown>) => Record<string, unknown>;
    trustedBasePrincipalSections?: string[];
  }) => Promise<{
    changed: boolean;
    config: IConfig | null;
    revision: { id: string } | null;
  }>;
  getMessages: MessageMethods['getMessages'];
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
  recordConnectionUpdate?: (event: LangfuseConnectionEvent) => void;
}

/** Reads from the stored override tree, so this is `TCustomConfig`'s
 *  `DeepPartial` view of the section rather than the standalone
 *  `LangfuseConfig` — record-valued fields carry optional values here. */
function readStoredLangfuse(config: IConfig | null): TCustomConfig['langfuse'] {
  const overrides = config?.overrides as Partial<TCustomConfig> | undefined;
  return overrides?.langfuse;
}

function buildStatus(config: IConfig | null, effectiveTenantId: string): TLangfuseConnectionStatus {
  const stored = readStoredLangfuse(config);
  const configured = Boolean(stored?.publicKey && stored?.secretKey);
  const configActive = config?.isActive !== false;
  return {
    configured,
    enabled: configActive && configured && stored?.enabled === true,
    configActive,
    destinations: getLangfuseTenantDestinations(),
    destination: stored?.destination,
    publicKey: stored?.publicKey,
    secretKeyPreview: stored?.secretKeyPreview,
    updatedAt: config?.updatedAt ? new Date(config.updatedAt).toISOString() : undefined,
    // `null` means "no document at all" for CAS purposes — a legacy or
    // inactive document that exists but predates the version counter must
    // report 0, the same fallback mutateConfigWithRevision's own CAS check
    // uses, or the client's next `expectedVersion: null` write will never
    // match the live document and 409 indefinitely.
    configVersion: config == null ? null : (config.configVersion ?? 0),
    effectiveTenantId,
  };
}

function getConnectionChanges(
  stored: TCustomConfig['langfuse'],
  enabled: boolean,
  destination: string,
  publicKey: string,
  secretKey: string,
): LangfuseConnectionChanges {
  if (!stored?.publicKey || !stored.secretKey) {
    return ['created'];
  }
  const changes: LangfuseConnectionChange[] = [];
  if (stored.destination !== destination) {
    changes.push('destination_changed');
  }
  if (stored.publicKey !== publicKey || secretKey !== '') {
    changes.push('credentials_rotated');
  }
  if (stored.enabled !== true && enabled) {
    changes.push('enabled');
  }
  if (stored.enabled === true && !enabled) {
    changes.push('disabled');
  }
  const [change, ...additionalChanges] = changes;
  return change ? [change, ...additionalChanges] : ['updated'];
}

function rejectWhenConnectionUnavailable(res: Response): Response | undefined {
  if (isLangfuseConnectionAvailable()) {
    return undefined;
  }

  return res.status(404).json({ error: 'Langfuse connection settings are not available' });
}

type LangfuseVerificationFailure = {
  errorCode: TLangfuseConnectionTestErrorCode;
  message: string;
};

function getLangfuseTestFailure(status: number): LangfuseVerificationFailure {
  if (status === 401) {
    return {
      errorCode: 'invalid_credentials',
      message: 'Langfuse rejected these keys. Check the destination and keys',
    };
  }

  if (status === 403) {
    return {
      errorCode: 'access_denied',
      message: 'Langfuse denied access. Check the API key type and project status.',
    };
  }

  if (status === 429) {
    return {
      errorCode: 'rate_limited',
      message: 'Langfuse is rate limiting verification. Try again later.',
    };
  }

  if (status >= 500) {
    return {
      errorCode: 'server_error',
      message: 'Langfuse is returning server errors. This may be a Langfuse incident.',
    };
  }

  return {
    errorCode: 'unexpected_response',
    message: `Langfuse responded with status ${status}`,
  };
}

type LangfuseVerificationResult =
  | { success: true; projectId: string }
  | {
      success: false;
      errorCode: TLangfuseConnectionTestErrorCode;
      message: string;
      responseStatus?: number;
    };

async function verifyLangfuseCredentials(
  destination: LangfuseTenantDestination,
  publicKey: string,
  secretKey: string,
  headers?: Record<string, string>,
): Promise<LangfuseVerificationResult> {
  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    const signal = AbortSignal.timeout(LANGFUSE_VERIFICATION_TIMEOUT_MS);
    const secretResponse = await fetch(`${destination.baseUrl}/api/public/projects`, {
      headers: mergeHeaders(headers, { Authorization: `Basic ${auth}` }),
      signal,
      ...redirectPolicyFor(headers),
    });
    if (!secretResponse.ok) {
      return {
        success: false,
        ...getLangfuseTestFailure(secretResponse.status),
        responseStatus: secretResponse.status >= 500 ? 502 : 400,
      };
    }
    let projects: unknown;
    try {
      projects = await secretResponse.json();
    } catch {
      return {
        success: false,
        errorCode: 'unexpected_response',
        message: 'Langfuse returned an invalid project response',
        responseStatus: 400,
      };
    }
    const projectId =
      projects != null &&
      typeof projects === 'object' &&
      Array.isArray((projects as { data?: unknown }).data) &&
      (projects as { data: unknown[] }).data.length === 1 &&
      typeof (projects as { data: Array<{ id?: unknown }> }).data[0]?.id === 'string'
        ? (projects as { data: Array<{ id: string }> }).data[0].id.trim()
        : '';
    if (!projectId) {
      return {
        success: false,
        errorCode: 'unexpected_response',
        message: 'Langfuse did not return a project identity',
        responseStatus: 400,
      };
    }

    const publicResponse = await fetch(`${destination.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: mergeHeaders(headers, {
        Authorization: `Bearer ${publicKey}`,
        'X-Langfuse-Public-Key': publicKey,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ batch: [] }),
      signal,
      ...redirectPolicyFor(headers),
    });
    if (!publicResponse.ok) {
      return {
        success: false,
        ...getLangfuseTestFailure(publicResponse.status),
        responseStatus: publicResponse.status >= 500 ? 502 : 400,
      };
    }

    return { success: true, projectId };
  } catch (error) {
    logger.error('[adminLangfuse] connection verification error:', error);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        errorCode: 'timeout',
        message: 'Langfuse verification timed out',
        responseStatus: 502,
      };
    }
    return {
      success: false,
      errorCode: 'unreachable',
      message: 'Could not reach the Langfuse host',
      responseStatus: 502,
    };
  }
}

/**
 * Admin handlers for the per-tenant Langfuse connection.
 *
 * The connection is stored as a `langfuse` override on the base config so it is
 * resolved for every user in the tenant. The secret key is encrypted at rest and
 * never returned by read endpoints; reads expose only non-secret metadata.
 */
export function createAdminLangfuseHandlers(deps: AdminLangfuseDeps): {
  getConnection: (req: ServerRequest, res: Response) => Promise<Response>;
  getSessionLink: (req: ServerRequest, res: Response) => Promise<Response>;
  updateConnection: (req: ServerRequest, res: Response) => Promise<Response>;
  testConnection: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    findConfigByPrincipal,
    mutateConfigWithRevision,
    getMessages,
    invalidateConfigCaches,
    recordConnectionUpdate = (event) =>
      logger.info({ message: '[adminLangfuse] Connection updated', ...event }),
  } = deps;

  function findBaseConfig(
    req: ServerRequest,
    options: Pick<FindConfigByPrincipalOptions, 'includeInactive'> = {},
  ): Promise<IConfig | null> {
    return findConfigByPrincipal(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID, {
      ...options,
      tenantId: getEffectiveTenantId(req) ?? '',
    });
  }

  async function getConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenConnectionUnavailable(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    try {
      // Must see an inactive document to report both its lifecycle state and
      // real configVersion. Treating it as absent would freeze the next write
      // at `expectedVersion: null` against a document that actually exists.
      const config = await findBaseConfig(req, { includeInactive: true });
      return res.status(200).json(buildStatus(config, getEffectiveTenantId(req) ?? ''));
    } catch (error) {
      logger.error('[adminLangfuse] getConnection error:', error);
      return res.status(500).json({ error: 'Failed to read Langfuse connection' });
    }
  }

  async function getSessionLink(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenConnectionUnavailable(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    const conversationId = (req.params as { conversationId?: string }).conversationId?.trim();
    const userId = req.user?.id ?? req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    try {
      const url = await resolveLangfuseSessionUrl({
        config: readStoredLangfuse(await findBaseConfig(req)),
        conversationId,
        userId,
        getMessages,
      });
      const response: TLangfuseSessionLinkResponse = { url };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[adminLangfuse] getSessionLink error:', error);
      return res.status(500).json({ error: 'Failed to resolve Langfuse session' });
    }
  }

  async function updateConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenConnectionUnavailable(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    try {
      const body = (req.body ?? {}) as TUpdateLangfuseConnectionRequest;
      const enabled = body.enabled === true;
      const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
      const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';

      // Independently enforced, not just relied on from the panel's own Zod
      // schema — a caller bypassing the panel must not be able to smuggle a
      // missing, negative, or fractional expectedVersion past the CAS check
      // by way of a silent `null` coercion.
      const rawExpectedVersion = body.expectedVersion;
      const expectedVersionValid =
        rawExpectedVersion === null ||
        (typeof rawExpectedVersion === 'number' &&
          Number.isInteger(rawExpectedVersion) &&
          rawExpectedVersion >= 0);
      if (!expectedVersionValid) {
        return res
          .status(400)
          .json({ error: 'expectedVersion must be a non-negative integer or null' });
      }
      const expectedVersion = rawExpectedVersion as number | null;
      const requestTenantId = getEffectiveTenantId(req) ?? '';
      if (typeof body.expectedTenantId !== 'string') {
        return res.status(400).json({ error: 'expectedTenantId is required' });
      }
      if (body.expectedTenantId !== requestTenantId) {
        return res.status(409).json({
          error: 'Tenant context changed',
          expectedTenantId: body.expectedTenantId,
          currentTenantId: requestTenantId,
        });
      }

      if (!destination) {
        return res.status(400).json({ error: 'destination is required' });
      }
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey is required' });
      }
      if (secretKey.startsWith(ENCRYPTED_PREFIX)) {
        return res.status(400).json({ error: 'Encrypted secretKey values cannot be submitted' });
      }

      const existing = await findBaseConfig(req, { includeInactive: true });
      const versionConflictResponse = rejectConfigVersionConflict(res, expectedVersion, existing);
      if (versionConflictResponse) {
        return versionConflictResponse;
      }
      if (enabled && existing?.isActive === false) {
        return res.status(409).json({
          error: 'The base configuration is inactive; activate it before enabling Langfuse',
        });
      }
      const stored = readStoredLangfuse(existing);
      const hasStoredSecret = Boolean(stored?.secretKey);
      const tenantDestination = resolveLangfuseTenantDestination(destination);
      const isPureDisableOfStoredConnection =
        !enabled &&
        secretKey === '' &&
        hasStoredSecret &&
        stored?.destination === destination &&
        stored.publicKey === publicKey;

      if (!tenantDestination && !isPureDisableOfStoredConnection) {
        return res.status(400).json({ error: 'destination is not configured' });
      }
      if (!secretKey && !hasStoredSecret) {
        return res
          .status(400)
          .json({ error: 'secretKey is required for first-time configuration' });
      }

      const persistedDestination = tenantDestination?.key ?? destination;
      const connectionChanged =
        secretKey !== '' ||
        stored?.destination !== persistedDestination ||
        stored?.publicKey !== publicKey;
      let verifiedProjectId = stored?.projectId;
      if (connectionChanged) {
        if (!tenantDestination) {
          return res.status(400).json({ error: 'destination is not configured' });
        }
        if (!secretKey) {
          return res
            .status(400)
            .json({ error: 'secretKey is required when changing the destination or publicKey' });
        }
        const verification = await verifyLangfuseCredentials(
          tenantDestination,
          publicKey,
          secretKey,
          scopeHeadersToDestination(
            resolveLangfuseHeaders(req.config?.langfuse?.headers),
            tenantDestination.baseUrl,
          ),
        );
        if (!verification.success) {
          return res
            .status(verification.responseStatus ?? 400)
            .json({ error: verification.message });
        }
        verifiedProjectId = verification.projectId;
      }

      const fields: Record<string, unknown> = {
        'langfuse.enabled': enabled,
        'langfuse.destination': persistedDestination,
        'langfuse.publicKey': publicKey,
      };
      if (verifiedProjectId) {
        fields['langfuse.projectId'] = verifiedProjectId;
      }
      if (secretKey) {
        fields['langfuse.secretKey'] = secretKey;
      }

      const actorId = req.user?.id ?? req.user?._id?.toString() ?? '';
      // The same effective tenant the route's capability middleware
      // authorized against, so the config write (Mongoose, ALS-scoped) and the
      // raw revision/epoch read/write (explicit tenant filter) land in the
      // tenant whose grants were actually checked.
      const { config: updated } = await mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion,
        op: {
          kind: 'fields',
          resetPaths: [],
          fields: encryptConfigSecretFields(fields),
          // Base config has no more-general layer beneath it, so a
          // brand-new __base__ document must use priority 0 — tying it with
          // the default role-profile priority (10) leaves their relative
          // ordering undefined, and the base config must always apply first.
          priority: existing?.priority ?? 0,
        },
        cause: 'save',
        actor: {
          actorId,
          actorEmail: (req.user as { email?: string } | undefined)?.email,
          tenantId: requestTenantId,
        },
        normalizeSecrets: encryptLegacyPlaintextConfigSecrets,
        // `langfuse` is a base-principal-protected section: every other
        // base-config write path (generic save, import, restore) must never
        // be able to smuggle a langfuse change past this handler's own
        // credential verification and encryption. This is the one call
        // trusted to actually write it.
        trustedBasePrincipalSections: ['langfuse'],
      });

      const status = buildStatus(updated ?? existing, requestTenantId);
      const changes = getConnectionChanges(
        stored,
        enabled,
        persistedDestination,
        publicKey,
        secretKey,
      );
      recordConnectionUpdate({
        event_name: 'librechat.langfuse.connection.changed',
        tenant_id: requestTenantId,
        configured: status.configured,
        enabled: status.enabled,
        destination: status.destination,
        change: changes[0],
        changes,
        verification_result: connectionChanged ? 'success' : 'skipped',
      });

      invalidateConfigCaches?.(requestTenantId)?.catch((err) =>
        logger.error('[adminLangfuse] Cache invalidation failed after update:', err),
      );

      return res.status(200).json(status);
    } catch (error) {
      if (isConfigVersionConflict(error)) {
        return res.status(409).json({
          error: 'Config version conflict',
          currentVersion: error.currentVersion,
        });
      }
      if (isTransactionRequired(error)) {
        return res.status(503).json({ error: error.message });
      }
      logger.error('[adminLangfuse] updateConnection error:', error);
      return res.status(500).json({ error: 'Failed to update Langfuse connection' });
    }
  }

  async function testConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenConnectionUnavailable(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    try {
      const body = (req.body ?? {}) as TLangfuseConnectionTestRequest;
      const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
      const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      let secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';
      const tenantDestination = resolveLangfuseTenantDestination(destination);

      if (!destination || !publicKey) {
        return res.status(400).json({ error: 'destination and publicKey are required' });
      }
      if (!tenantDestination) {
        return res.status(400).json({ error: 'destination is not configured' });
      }
      if (secretKey.startsWith(ENCRYPTED_PREFIX)) {
        return res.status(400).json({ error: 'Encrypted secretKey values cannot be submitted' });
      }

      if (!secretKey) {
        const existing = await findBaseConfig(req);
        const stored = readStoredLangfuse(existing);
        const unchangedConnection =
          stored?.destination === tenantDestination.key && stored.publicKey === publicKey;
        if (unchangedConnection && stored.secretKey) {
          secretKey = decryptConfigSecret(stored.secretKey) ?? '';
          if (!secretKey) {
            const failed: TLangfuseConnectionTestResponse = {
              success: false,
              errorCode: 'stored_secret_unavailable',
            };
            return res.status(200).json(failed);
          }
        }
      }

      if (!secretKey) {
        const failed: TLangfuseConnectionTestResponse = {
          success: false,
          errorCode: 'missing_secret',
        };
        return res.status(200).json(failed);
      }

      const result = await verifyLangfuseCredentials(
        tenantDestination,
        publicKey,
        secretKey,
        scopeHeadersToDestination(
          resolveLangfuseHeaders(req.config?.langfuse?.headers),
          tenantDestination.baseUrl,
        ),
      );
      const response: TLangfuseConnectionTestResponse = result.success
        ? { success: true }
        : { success: false, errorCode: result.errorCode };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[adminLangfuse] testConnection error:', error);
      const result: TLangfuseConnectionTestResponse = {
        success: false,
        errorCode: 'unreachable',
      };
      return res.status(200).json(result);
    }
  }

  return { getConnection, getSessionLink, updateConnection, testConnection };
}
