import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { logger, BASE_CONFIG_PRINCIPAL_ID } from '@librechat/data-schemas';
import type {
  TCustomConfig,
  LangfuseConfig,
  TLangfuseConnectionStatus,
  TUpdateLangfuseConnectionRequest,
  TLangfuseConnectionTestRequest,
  TLangfuseConnectionTestResponse,
} from 'librechat-data-provider';
import type { IConfig } from '@librechat/data-schemas';
import type { Types, ClientSession } from 'mongoose';
import type { Response } from 'express';
import type { LangfuseTenantDestination } from '~/langfuse/tenantDestinations';
import type { ServerRequest } from '~/types/http';
import {
  getLangfuseTenantDestinations,
  resolveLangfuseTenantDestination,
} from '~/langfuse/tenantDestinations';
import { decryptConfigSecret, encryptConfigSecretFields } from './secrets';
import { isLangfuseFanoutEnabled } from '~/langfuse/config';

const DEFAULT_PRIORITY = 10;
const ENCRYPTED_PREFIX = 'v3:';
const LANGFUSE_VERIFICATION_TIMEOUT_MS = 10_000;

export interface AdminLangfuseDeps {
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: { includeInactive?: boolean },
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  patchConfigFields: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority: number,
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  invalidateConfigCaches?: (tenantId?: string) => Promise<void>;
}

function getTenantId(req: ServerRequest): string | undefined {
  return (req.user as { tenantId?: string } | undefined)?.tenantId;
}

function readStoredLangfuse(config: IConfig | null): LangfuseConfig | undefined {
  const overrides = config?.overrides as Partial<TCustomConfig> | undefined;
  return overrides?.langfuse;
}

function buildStatus(config: IConfig | null): TLangfuseConnectionStatus {
  const stored = readStoredLangfuse(config);
  return {
    configured: Boolean(stored?.publicKey && stored?.secretKey),
    enabled: stored?.enabled === true,
    destinations: getLangfuseTenantDestinations(),
    destination: stored?.destination,
    publicKey: stored?.publicKey,
    displaySecretKey: stored?.displaySecretKey,
    updatedAt: config?.updatedAt ? new Date(config.updatedAt).toISOString() : undefined,
  };
}

function rejectWhenFanoutDisabled(res: Response): Response | undefined {
  if (isLangfuseFanoutEnabled()) {
    return undefined;
  }

  return res.status(404).json({ error: 'Langfuse fanout is not enabled' });
}

function getLangfuseTestFailureMessage(status: number): string {
  if (status === 401) {
    return 'Langfuse rejected these keys. Check the destination and keys';
  }

  if (status >= 500) {
    return 'Langfuse is returning server errors. This may be a Langfuse incident.';
  }

  return `Langfuse responded with status ${status}`;
}

type LangfuseVerificationResult = TLangfuseConnectionTestResponse & {
  responseStatus?: number;
};

async function verifyLangfuseCredentials(
  destination: LangfuseTenantDestination,
  publicKey: string,
  secretKey: string,
): Promise<LangfuseVerificationResult> {
  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    const signal = AbortSignal.timeout(LANGFUSE_VERIFICATION_TIMEOUT_MS);
    const secretResponse = await fetch(`${destination.baseUrl}/api/public/projects`, {
      headers: { Authorization: `Basic ${auth}` },
      signal,
    });
    if (!secretResponse.ok) {
      return {
        success: false,
        message: getLangfuseTestFailureMessage(secretResponse.status),
        responseStatus: secretResponse.status >= 500 ? 502 : 400,
      };
    }

    const publicResponse = await fetch(`${destination.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batch: [] }),
      signal,
    });
    if (!publicResponse.ok) {
      return {
        success: false,
        message: getLangfuseTestFailureMessage(publicResponse.status),
        responseStatus: publicResponse.status >= 500 ? 502 : 400,
      };
    }

    return { success: true };
  } catch (error) {
    logger.error('[adminLangfuse] connection verification error:', error);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        message: 'Langfuse verification timed out',
        responseStatus: 502,
      };
    }
    return {
      success: false,
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
  updateConnection: (req: ServerRequest, res: Response) => Promise<Response>;
  testConnection: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const { findConfigByPrincipal, patchConfigFields, invalidateConfigCaches } = deps;

  function findBaseConfig(): Promise<IConfig | null> {
    return findConfigByPrincipal(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID, {
      includeInactive: true,
    });
  }

  async function getConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenFanoutDisabled(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    try {
      const config = await findBaseConfig();
      return res.status(200).json(buildStatus(config));
    } catch (error) {
      logger.error('[adminLangfuse] getConnection error:', error);
      return res.status(500).json({ error: 'Failed to read Langfuse connection' });
    }
  }

  async function updateConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenFanoutDisabled(res);
    if (disabledResponse) {
      return disabledResponse;
    }

    try {
      const body = (req.body ?? {}) as TUpdateLangfuseConnectionRequest;
      const enabled = body.enabled === true;
      const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
      const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';
      const tenantDestination = resolveLangfuseTenantDestination(destination);

      if (!destination) {
        return res.status(400).json({ error: 'destination is required' });
      }
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey is required' });
      }
      if (!tenantDestination) {
        return res.status(400).json({ error: 'destination is not configured' });
      }
      if (secretKey.startsWith(ENCRYPTED_PREFIX)) {
        return res.status(400).json({ error: 'Encrypted secretKey values cannot be submitted' });
      }

      const existing = await findBaseConfig();
      const stored = readStoredLangfuse(existing);
      const hasStoredSecret = Boolean(stored?.secretKey);
      if (!secretKey && !hasStoredSecret) {
        return res
          .status(400)
          .json({ error: 'secretKey is required for first-time configuration' });
      }

      const connectionChanged =
        secretKey !== '' ||
        stored?.destination !== tenantDestination.key ||
        stored?.publicKey !== publicKey;
      if (connectionChanged) {
        const verificationSecret = secretKey || decryptConfigSecret(stored?.secretKey) || '';
        if (!verificationSecret) {
          return res.status(400).json({ error: 'Stored secret key could not be decrypted' });
        }
        const verification = await verifyLangfuseCredentials(
          tenantDestination,
          publicKey,
          verificationSecret,
        );
        if (!verification.success) {
          return res
            .status(verification.responseStatus ?? 400)
            .json({ error: verification.message });
        }
      }

      const fields: Record<string, unknown> = {
        'langfuse.enabled': enabled,
        'langfuse.destination': tenantDestination.key,
        'langfuse.publicKey': publicKey,
      };
      if (secretKey) {
        fields['langfuse.secretKey'] = secretKey;
      }

      const updated = await patchConfigFields(
        PrincipalType.ROLE,
        BASE_CONFIG_PRINCIPAL_ID,
        PrincipalModel.ROLE,
        encryptConfigSecretFields(fields),
        existing?.priority ?? DEFAULT_PRIORITY,
      );

      invalidateConfigCaches?.(getTenantId(req))?.catch((err) =>
        logger.error('[adminLangfuse] Cache invalidation failed after update:', err),
      );

      return res.status(200).json(buildStatus(updated ?? existing));
    } catch (error) {
      logger.error('[adminLangfuse] updateConnection error:', error);
      return res.status(500).json({ error: 'Failed to update Langfuse connection' });
    }
  }

  async function testConnection(req: ServerRequest, res: Response): Promise<Response> {
    const disabledResponse = rejectWhenFanoutDisabled(res);
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
        const existing = await findBaseConfig();
        const storedSecret = readStoredLangfuse(existing)?.secretKey;
        if (storedSecret) {
          secretKey = decryptConfigSecret(storedSecret) ?? '';
          if (!secretKey) {
            const failed: TLangfuseConnectionTestResponse = {
              success: false,
              message: 'Stored secret key could not be decrypted',
            };
            return res.status(200).json(failed);
          }
        }
      }

      if (!secretKey) {
        const failed: TLangfuseConnectionTestResponse = {
          success: false,
          message: 'secretKey is required to test the connection',
        };
        return res.status(200).json(failed);
      }

      const result = await verifyLangfuseCredentials(tenantDestination, publicKey, secretKey);
      const response: TLangfuseConnectionTestResponse = {
        success: result.success,
        ...(result.message ? { message: result.message } : {}),
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[adminLangfuse] testConnection error:', error);
      const result: TLangfuseConnectionTestResponse = {
        success: false,
        message: 'Could not reach the Langfuse host',
      };
      return res.status(200).json(result);
    }
  }

  return { getConnection, updateConnection, testConnection };
}
