import { RetentionMode } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

type InterfaceConfig = AppConfig['interfaceConfig'];

const FALLBACK_RETENTION_HOURS = 24 * 30;

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
  _retentionExpiry?: {
    key: string;
    promise: Promise<RetentionExpiry>;
  };
};

export type RetentionExpiry = {
  expiredAt?: Date | null;
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

export const isRetentionTruthy = (value: unknown): boolean => value === true || value === 'true';

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
    return { expiredAt: new Date(Date.now() + FALLBACK_RETENTION_HOURS * 60 * 60 * 1000) };
  }
};

const getRetentionCacheKey = (req: RetentionRequest): string =>
  [
    req.config?.interfaceConfig?.retentionMode ?? '',
    req.user?.id ?? '',
    req.body?.conversationId ?? '',
    String(req.body?.isTemporary ?? ''),
  ].join('|');

async function computeRetentionExpiry(
  req: RetentionRequest | null | undefined,
  dependencies: RetentionDependencies,
): Promise<RetentionExpiry> {
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
      if (isRetentionTruthy(req?.body?.isTemporary)) {
        return createRetentionExpiry(req, dependencies);
      }
      return {};
    }
  }

  if (!isRetentionTruthy(req?.body?.isTemporary)) {
    return {};
  }

  return createRetentionExpiry(req, dependencies);
}

export async function getRetentionExpiry(
  req: RetentionRequest | null | undefined,
  dependencies: RetentionDependencies,
): Promise<RetentionExpiry> {
  if (!req) {
    return {};
  }

  const key = getRetentionCacheKey(req);
  if (req._retentionExpiry?.key === key) {
    return req._retentionExpiry.promise;
  }

  const promise = computeRetentionExpiry(req, dependencies);
  req._retentionExpiry = { key, promise };
  return promise;
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
