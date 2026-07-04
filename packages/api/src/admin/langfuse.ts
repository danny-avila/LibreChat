import crypto from 'node:crypto';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { logger, BASE_CONFIG_PRINCIPAL_ID, encryptV3, decryptV3 } from '@librechat/data-schemas';
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
import type { ServerRequest } from '~/types/http';

const DEFAULT_PRIORITY = 10;
const FINGERPRINT_LENGTH = 12;

/** Short, non-reversible fingerprint of a secret so reads can show which key is
 * configured without exposing it. */
function fingerprintSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

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
    baseUrl: stored?.baseUrl,
    publicKey: stored?.publicKey,
    secretKeyFingerprint: stored?.secretKeyFingerprint,
    updatedAt: config?.updatedAt ? new Date(config.updatedAt).toISOString() : undefined,
  };
}

function resolveStoredSecret(secret?: string): string | undefined {
  if (!secret) {
    return undefined;
  }
  if (!secret.startsWith('v3:')) {
    return secret;
  }
  return decryptV3(secret);
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
    try {
      const config = await findBaseConfig();
      return res.status(200).json(buildStatus(config));
    } catch (error) {
      logger.error('[adminLangfuse] getConnection error:', error);
      return res.status(500).json({ error: 'Failed to read Langfuse connection' });
    }
  }

  async function updateConnection(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const body = (req.body ?? {}) as TUpdateLangfuseConnectionRequest;
      const enabled = body.enabled === true;
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';

      if (!baseUrl) {
        return res.status(400).json({ error: 'baseUrl is required' });
      }
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey is required' });
      }
      try {
        new URL(baseUrl);
      } catch {
        return res.status(400).json({ error: 'baseUrl must be a valid URL' });
      }

      const existing = await findBaseConfig();
      const hasStoredSecret = Boolean(readStoredLangfuse(existing)?.secretKey);
      if (!secretKey && !hasStoredSecret) {
        return res
          .status(400)
          .json({ error: 'secretKey is required for first-time configuration' });
      }

      const fields: Record<string, unknown> = {
        'langfuse.enabled': enabled,
        'langfuse.baseUrl': baseUrl,
        'langfuse.publicKey': publicKey,
      };
      if (secretKey) {
        fields['langfuse.secretKey'] = encryptV3(secretKey);
        fields['langfuse.secretKeyFingerprint'] = fingerprintSecret(secretKey);
      }

      const updated = await patchConfigFields(
        PrincipalType.ROLE,
        BASE_CONFIG_PRINCIPAL_ID,
        PrincipalModel.ROLE,
        fields,
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
    try {
      const body = (req.body ?? {}) as TLangfuseConnectionTestRequest;
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      let secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';

      if (!baseUrl || !publicKey) {
        return res.status(400).json({ error: 'baseUrl and publicKey are required' });
      }

      if (!secretKey) {
        const existing = await findBaseConfig();
        try {
          secretKey = resolveStoredSecret(readStoredLangfuse(existing)?.secretKey) ?? '';
        } catch {
          const failed: TLangfuseConnectionTestResponse = {
            success: false,
            message: 'Stored secret key could not be decrypted',
          };
          return res.status(200).json(failed);
        }
      }

      if (!secretKey) {
        const failed: TLangfuseConnectionTestResponse = {
          success: false,
          message: 'secretKey is required to test the connection',
        };
        return res.status(200).json(failed);
      }

      const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
      const url = `${baseUrl.replace(/\/+$/, '')}/api/public/projects`;
      const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

      const result: TLangfuseConnectionTestResponse = response.ok
        ? { success: true }
        : { success: false, message: `Langfuse responded with status ${response.status}` };
      return res.status(200).json(result);
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
