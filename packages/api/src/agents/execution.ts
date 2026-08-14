import { createHash } from 'node:crypto';
import { Constants, getCodeBaseURL } from '@librechat/agents';
import type { StatefulCodeEnvironment } from 'librechat-data-provider';

export const CODE_API_EXPECTED_PROFILE_HEADER = 'X-CodeAPI-Expected-Profile';

export type CodeExecutionProfile = 'default' | 'stateful';

export interface CodeExecutionContext {
  baseUrl: string;
  codeSessionKey: string;
  executionProfile: CodeExecutionProfile;
  runtimeSessionHint?: string;
  statefulSessions: boolean;
}

export function normalizeStatefulCodeEnvironment(
  environment?: StatefulCodeEnvironment | string | null,
): StatefulCodeEnvironment {
  if (environment === 'agent-user') {
    return 'agent-user';
  }
  if (environment === 'conversation') {
    return 'conversation';
  }
  return 'user';
}

export function getCodeExecutionBaseUrl(profile: CodeExecutionProfile): string {
  if (profile === 'default') {
    return getCodeBaseURL().replace(/\/+$/, '');
  }
  const baseUrl = process.env.LIBRECHAT_CODE_BASEURL_STATEFUL?.trim().replace(/\/+$/, '');
  if (baseUrl) {
    return baseUrl;
  }
  throw new Error(
    'Stateful code execution is enabled for this agent, but LIBRECHAT_CODE_BASEURL_STATEFUL is not configured.',
  );
}

function resolveRuntimeSessionHint(params: {
  environment: StatefulCodeEnvironment;
  userId: string;
  agentId?: string | null;
  conversationId?: string | null;
}): string {
  const { environment, userId, agentId, conversationId } = params;
  const scopeFingerprint = (...parts: string[]): string =>
    createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  if (environment === 'agent-user') {
    if (!agentId) {
      throw new Error('Agent-user code environments require an agent ID.');
    }
    return `v2:agent-user:${scopeFingerprint(userId, agentId)}`;
  }
  if (environment === 'conversation') {
    if (!conversationId) {
      throw new Error('Conversation code environments require a conversation ID.');
    }
    return `v2:conversation:${scopeFingerprint(userId, conversationId)}`;
  }
  return `v2:user:${scopeFingerprint(userId)}`;
}

export function resolveCodeExecutionContext(params: {
  statefulSessions: boolean;
  environment?: StatefulCodeEnvironment | string | null;
  userId?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
}): CodeExecutionContext {
  if (!params.statefulSessions) {
    return {
      baseUrl: getCodeExecutionBaseUrl('default'),
      codeSessionKey: Constants.EXECUTE_CODE,
      executionProfile: 'default',
      statefulSessions: false,
    };
  }

  const environment = normalizeStatefulCodeEnvironment(params.environment);
  if (!params.userId) {
    throw new Error('Stateful code environments require an authenticated user ID.');
  }
  const runtimeSessionHint = resolveRuntimeSessionHint({
    environment,
    userId: params.userId,
    agentId: params.agentId,
    conversationId: params.conversationId,
  });
  return {
    baseUrl: getCodeExecutionBaseUrl('stateful'),
    codeSessionKey: `${Constants.EXECUTE_CODE}:stateful:${runtimeSessionHint}`,
    executionProfile: 'stateful',
    runtimeSessionHint,
    statefulSessions: true,
  };
}

export function codeExecutionHeaders(
  context: Pick<CodeExecutionContext, 'executionProfile'>,
): Record<string, string> {
  return { [CODE_API_EXPECTED_PROFILE_HEADER]: context.executionProfile };
}
