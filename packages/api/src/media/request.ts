import { RetentionMode } from 'librechat-data-provider';
import { createChatExpirationDate } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { ModelUsageSinkOptions } from '~/agents/usage';
import type { NativeMediaFactory } from './native';
import type { MediaRuntime } from './runtime';
import { createModelUsageSink } from '~/agents/usage';

type Retention = { isTemporary?: boolean; expiredAt?: Date | string | null };
type NativeRequest = Request & {
  config?: AppConfig;
  resolvedConversation?: Retention | null;
  _agentEventBindingRetention?: Retention;
};

/** Reuse the request's loaded conversation and effective policy, including its original deadline. */
export function resolveNativeMediaFactory(
  request: NativeRequest,
  conversationId: string,
  messageId: string,
  collectedUsage: UsageMetadata[] = [],
  usageOptions: ModelUsageSinkOptions = {},
): Promise<NativeMediaFactory | undefined> | undefined {
  const runtime: Pick<MediaRuntime, 'nativeFactory'> | undefined =
    request.app?.locals?.mediaRuntime;
  if (!runtime?.nativeFactory) return undefined;
  const collectUsage = createModelUsageSink(collectedUsage, {
    ...usageOptions,
    onUsage: (usage) =>
      usage.usage_type === 'subagent' ? usageOptions.onUsage?.(usage) : undefined,
  });
  const retention = request._agentEventBindingRetention ?? request.resolvedConversation;
  const temporary = retention?.isTemporary ?? request.body?.isTemporary === true;
  const policy = request.config?.interfaceConfig;
  let deadline = retention?.expiredAt;
  if (!retention && (temporary || policy?.retentionMode === RetentionMode.ALL)) {
    deadline = createChatExpirationDate(policy, temporary);
  }
  return runtime.nativeFactory(
    request,
    {
      conversationId,
      messageId,
      prompt: typeof request.body?.text === 'string' ? request.body.text : '',
      temporary,
      ...(deadline ? { expiresAt: new Date(deadline).toISOString() } : {}),
    },
    ({ usage, modelRunId, model, provider, agentId, usageType }) =>
      collectUsage({
        ...usage,
        modelRunId,
        model,
        provider,
        agentId,
        ...(usageType ? { usage_type: usageType } : {}),
      }),
  );
}
