import { SYSTEM_TENANT_ID, SystemCapabilities } from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import type {
  CapabilityUser,
  HasCapabilityFn,
  HasConfigCapabilityFn,
} from '~/middleware/capabilities';
import type { LangfuseSessionLinkParams } from '~/langfuse/session';
import { resolveLangfuseSessionUrl } from '~/langfuse/session';

interface SharedSessionViewer {
  id?: string;
  _id?: { toString(): string };
  role?: string;
  tenantId?: string;
  idOnTheSource?: string | null;
}

export interface SharedLangfuseSessionParams {
  viewer?: SharedSessionViewer;
  shareTenantId?: string;
  shareConversationId?: string;
  shareOwnerId?: string;
  config: TCustomConfig['langfuse'];
}

export interface SharedLangfuseSessionDeps {
  hasCapability: HasCapabilityFn;
  hasConfigCapability: HasConfigCapabilityFn;
  getMessages: LangfuseSessionLinkParams['getMessages'];
  resolveSessionUrl?: (params: LangfuseSessionLinkParams) => Promise<string | null>;
}

function normalizeTenantId(tenantId?: string): string | undefined {
  return tenantId && tenantId !== SYSTEM_TENANT_ID ? tenantId : undefined;
}

export function createSharedLangfuseSessionResolver(deps: SharedLangfuseSessionDeps) {
  const resolveSessionUrl = deps.resolveSessionUrl ?? resolveLangfuseSessionUrl;

  return async function getSharedLangfuseSessionUrl({
    viewer,
    shareTenantId,
    shareConversationId,
    shareOwnerId,
    config,
  }: SharedLangfuseSessionParams): Promise<string | null> {
    const userId = viewer?.id ?? viewer?._id?.toString();
    if (
      !viewer ||
      !userId ||
      normalizeTenantId(viewer?.tenantId) !== normalizeTenantId(shareTenantId) ||
      !shareOwnerId ||
      !shareConversationId
    ) {
      return null;
    }

    const capabilityUser: CapabilityUser = {
      id: userId,
      role: viewer.role ?? '',
      tenantId: viewer.tenantId,
      idOnTheSource: viewer.idOnTheSource ?? null,
    };
    if (!(await deps.hasCapability(capabilityUser, SystemCapabilities.ACCESS_ADMIN))) {
      return null;
    }
    if (!(await deps.hasConfigCapability(capabilityUser, 'langfuse'))) {
      return null;
    }

    return resolveSessionUrl({
      config,
      conversationId: shareConversationId,
      userId: shareOwnerId,
      getMessages: deps.getMessages,
    });
  };
}
