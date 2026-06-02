import { RetentionMode } from 'librechat-data-provider';
import { createFallbackRetentionDate } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';

type InterfaceConfig = AppConfig['interfaceConfig'];

const retentionExpiryCache = new WeakMap<RetentionRequest, Map<string, Promise<RetentionExpiry>>>();

export type RetentionConversation = {
  expiredAt?: Date | string | number | null;
};

export type RetentionRequest = {
  user?: {
    id?: string;
    tenantId?: string;
  };
  body?: {
    conversationId?: string;
    isTemporary?: boolean | string | null;
  };
  config?: {
    interfaceConfig?: InterfaceConfig;
  };
};

export type RetentionExpiry = {
  expiredAt?: Date | null;
};

export type RetentionOptions = {
  applyFileRetention?: boolean;
};

export type AgentFileRetentionRequest = {
  req: RetentionRequest | null | undefined;
  messageAttachment?: boolean | null;
  toolResource?: string | null;
};

export type RetentionLogger = {
  error: (message: string, error?: unknown) => void;
};

export type RetentionDependencies = {
  getConvo: (
    userId: string,
    conversationId: string,
  ) => Promise<RetentionConversation | null | undefined>;
  createExpirationDate: (interfaceConfig?: InterfaceConfig) => Date;
  logger?: RetentionLogger;
};

export type SharedLinkRetentionDependencies = {
  getConvo: (
    userId: string,
    conversationId: string,
  ) => Promise<RetentionConversation | null | undefined>;
  createExpirationDate: (interfaceConfig?: InterfaceConfig) => Date;
  logger?: RetentionLogger;
};

export const isBooleanOrStringTrue = (value: unknown): boolean =>
  value === true || value === 'true';

export const getConversationExpirationDate = (
  convo?: RetentionConversation | null,
): Date | null => {
  if (convo?.expiredAt == null) {
    return null;
  }

  const expiredAt = convo.expiredAt instanceof Date ? convo.expiredAt : new Date(convo.expiredAt);
  return Number.isNaN(expiredAt.getTime()) ? null : expiredAt;
};

export const isActiveExpirationDate = (expiredAt: Date, now = new Date()): boolean =>
  expiredAt > now;

const createRetentionExpiry = (
  req: RetentionRequest | null | undefined,
  { createExpirationDate, logger }: RetentionDependencies,
): RetentionExpiry => {
  try {
    return { expiredAt: createExpirationDate(req?.config?.interfaceConfig) };
  } catch (err) {
    logger?.error('[getRetentionExpiry] Error creating file expiration date:', err);
    return { expiredAt: createFallbackRetentionDate() };
  }
};

const hasFileRetentionConfigured = (req: RetentionRequest | null | undefined): boolean =>
  req?.config?.interfaceConfig?.fileRetention != null;

const getRetentionCacheKey = (req: RetentionRequest, options: RetentionOptions = {}): string =>
  [
    String(options.applyFileRetention ?? false),
    req.config?.interfaceConfig?.fileRetention ?? '',
    req.config?.interfaceConfig?.retentionMode ?? '',
    req.user?.id ?? '',
    req.body?.conversationId ?? '',
    String(req.body?.isTemporary ?? ''),
  ].join('|');

async function computeRetentionExpiry(
  req: RetentionRequest | null | undefined,
  dependencies: RetentionDependencies,
  options: RetentionOptions,
): Promise<RetentionExpiry> {
  if (options.applyFileRetention && hasFileRetentionConfigured(req)) {
    return createRetentionExpiry(req, dependencies);
  }

  if (req?.config?.interfaceConfig?.retentionMode === RetentionMode.ALL) {
    return createRetentionExpiry(req, dependencies);
  }

  const conversationId = req?.body?.conversationId;
  const userId = req?.user?.id;

  if (conversationId && userId) {
    try {
      const convo = await dependencies.getConvo(userId, conversationId);
      if (convo) {
        const expiredAt = getConversationExpirationDate(convo);
        if (expiredAt == null) {
          if (isBooleanOrStringTrue(req?.body?.isTemporary)) {
            return createRetentionExpiry(req, dependencies);
          }
          return {};
        }

        if (!isActiveExpirationDate(expiredAt)) {
          return { expiredAt };
        }

        return createRetentionExpiry(req, dependencies);
      }
    } catch (err) {
      dependencies.logger?.error(
        '[getRetentionExpiry] Error checking conversation retention:',
        err,
      );
      if (isBooleanOrStringTrue(req?.body?.isTemporary)) {
        return createRetentionExpiry(req, dependencies);
      }
      return {};
    }
  }

  if (!isBooleanOrStringTrue(req?.body?.isTemporary)) {
    return {};
  }

  return createRetentionExpiry(req, dependencies);
}

export async function getRetentionExpiry(
  req: RetentionRequest | null | undefined,
  dependencies: RetentionDependencies,
  options: RetentionOptions = {},
): Promise<RetentionExpiry> {
  if (!req) {
    return {};
  }

  const key = getRetentionCacheKey(req, options);
  const reqCache = retentionExpiryCache.get(req);
  const cachedPromise = reqCache?.get(key);
  if (cachedPromise) {
    return cachedPromise;
  }

  const promise = computeRetentionExpiry(req, dependencies, options);

  if (reqCache) {
    reqCache.set(key, promise);
  } else {
    retentionExpiryCache.set(req, new Map([[key, promise]]));
  }

  return promise;
}

const isPersistentAgentResourceUpload = ({
  messageAttachment,
  toolResource,
}: Omit<AgentFileRetentionRequest, 'req'>): boolean => !messageAttachment && !!toolResource;

const shouldRetainPersistentAgentFile = ({
  req,
  messageAttachment,
  toolResource,
}: AgentFileRetentionRequest): boolean => {
  const interfaceConfig = req?.config?.interfaceConfig;
  return (
    isPersistentAgentResourceUpload({ messageAttachment, toolResource }) &&
    (interfaceConfig?.retentionMode !== RetentionMode.ALL ||
      interfaceConfig?.retainAgentFiles === true)
  );
};

export async function getAgentFileRetentionExpiry(
  params: AgentFileRetentionRequest,
  dependencies: RetentionDependencies,
): Promise<RetentionExpiry> {
  if (hasFileRetentionConfigured(params.req)) {
    return await getRetentionExpiry(params.req, dependencies, { applyFileRetention: true });
  }

  if (shouldRetainPersistentAgentFile(params)) {
    return {};
  }

  return await getRetentionExpiry(params.req, dependencies);
}

/**
 * Resolves the retention deadline for a shared link derived from a conversation.
 *
 * Return values are intentionally tri-state:
 * - `undefined`: no decision can be made because the conversation id or row is missing.
 * - `null`: the share should be stored without an expiration.
 * - `Date`: the share should expire at that date; callers reject already-expired dates.
 */
export async function getSharedLinkExpiration(
  {
    req,
    conversationId,
  }: {
    req: RetentionRequest | null | undefined;
    conversationId?: string | null;
  },
  dependencies: SharedLinkRetentionDependencies,
): Promise<Date | null | undefined> {
  const userId = req?.user?.id;
  if (!conversationId || !userId) {
    return undefined;
  }

  const isRetentionAll = req?.config?.interfaceConfig?.retentionMode === RetentionMode.ALL;
  const convo = await dependencies.getConvo(userId, conversationId);
  if (!convo) {
    return undefined;
  }

  const conversationExpiredAt = getConversationExpirationDate(convo);
  if (conversationExpiredAt == null) {
    if (!isRetentionAll) {
      return null;
    }
  } else if (!isActiveExpirationDate(conversationExpiredAt)) {
    return conversationExpiredAt;
  }

  try {
    return dependencies.createExpirationDate(req?.config?.interfaceConfig);
  } catch (err) {
    dependencies.logger?.error('[getSharedLinkExpiration] Error creating expiration date:', err);
    return null;
  }
}

export const createMinimalRetentionRequest = (
  req?: RetentionRequest | null,
): RetentionRequest | undefined => {
  if (!req) {
    return undefined;
  }

  return {
    user: req.user
      ? {
          id: req.user.id,
          tenantId: req.user.tenantId,
        }
      : undefined,
    body: {
      conversationId: req.body?.conversationId,
      isTemporary: req.body?.isTemporary,
    },
    config: {
      interfaceConfig: req.config?.interfaceConfig,
    },
  };
};
