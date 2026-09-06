import type {
  LangfuseTraceConversationMetadataField,
  LangfuseTraceUserMetadataField,
  LangfuseTraceConfig,
  DeepPartial,
} from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import { normalizeString } from '~/utils/text';

export type LangfuseTraceUser = Partial<Pick<IUser, LangfuseTraceUserMetadataField>>;

/** Request-scoped values a run may expose as trace metadata when allowlisted. */
export type LangfuseTraceContext = Partial<
  Record<LangfuseTraceConversationMetadataField, string | null>
>;

export type LangfuseTraceIdentityConfig = DeepPartial<LangfuseTraceConfig>;

const DEFAULT_USER_ID_FIELD = 'id';
/** Fields already reported as unset, so a busy deployment logs each once. */
const missingUserIdFieldWarnings = new Set<string>();
const USER_METADATA_PREFIX = 'librechat.user.';
const CONVERSATION_METADATA_KEYS: Record<LangfuseTraceConversationMetadataField, string> = {
  conversationId: 'librechat.conversation.id',
  endpoint: 'librechat.endpoint',
  endpointType: 'librechat.endpoint.type',
  provider: 'librechat.provider',
  model: 'librechat.model',
  modelLabel: 'librechat.model.label',
  spec: 'librechat.spec',
};

/**
 * The trace `userId` a deployment selected, or `undefined` to keep the SDK's
 * default (`configurable.user_id`, the internal id). A user without a value
 * for the configured field also yields `undefined`, so the trace still
 * carries the internal id rather than no user at all.
 */
export function resolveLangfuseTraceUserId(
  trace: LangfuseTraceIdentityConfig | undefined,
  user: LangfuseTraceUser | undefined,
): string | undefined {
  const field = trace?.userIdField ?? DEFAULT_USER_ID_FIELD;
  if (field === DEFAULT_USER_ID_FIELD) {
    return undefined;
  }
  const value = normalizeString(user?.[field]);
  if (value == null && !missingUserIdFieldWarnings.has(field)) {
    missingUserIdFieldWarnings.add(field);
    logger.warn(
      `[langfuse] trace.userIdField "${field}" is unset for user ${user?.id ?? '(unknown)'}; the trace keeps the internal id. Reported once per field.`,
    );
  }
  return value;
}

/**
 * Allowlisted user and request fields as trace metadata. Only fields the
 * deployment listed are read, blank values are skipped, and `undefined` is
 * returned when nothing survives so callers can leave the metadata untouched.
 */
export function buildLangfuseTraceMetadata({
  trace,
  user,
  context,
}: {
  trace: LangfuseTraceIdentityConfig | undefined;
  user: LangfuseTraceUser | undefined;
  context: LangfuseTraceContext | undefined;
}): Record<string, string> | undefined {
  const metadata: Record<string, string> = {};
  for (const field of new Set(trace?.userMetadataFields ?? [])) {
    const value = field == null ? undefined : normalizeString(user?.[field]);
    if (value != null) {
      metadata[`${USER_METADATA_PREFIX}${field}`] = value;
    }
  }
  for (const field of new Set(trace?.conversationMetadataFields ?? [])) {
    const value = field == null ? undefined : normalizeString(context?.[field]);
    if (value != null) {
      metadata[CONVERSATION_METADATA_KEYS[field]] = value;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
