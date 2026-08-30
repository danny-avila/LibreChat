import { createHash } from 'node:crypto';
import { Constants, getCodeBaseURL } from '@librechat/agents';
import type { StatefulCodeEnvironment, TAgentsEndpoint } from 'librechat-data-provider';

export const CODE_API_EXPECTED_PROFILE_HEADER = 'X-CodeAPI-Expected-Profile';

export type CodeExecutionProfile = 'default' | 'stateful';
export type CodeEnvironmentConfig = NonNullable<
  NonNullable<TAgentsEndpoint['statefulCodeSessions']>['environments']
>[number];

export interface CodeExecutionContext {
  baseUrl: string;
  codeSessionKey: string;
  executionProfile: CodeExecutionProfile;
  runtimeSessionHint?: string;
  statefulSessions: boolean;
  environmentId?: string;
  environmentType?: CodeEnvironmentConfig['type'];
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

export function getCodeExecutionBaseUrl(
  profile: CodeExecutionProfile,
  environment?: CodeEnvironmentConfig,
): string {
  if (profile === 'default') {
    return getCodeBaseURL().replace(/\/+$/, '');
  }
  if (environment) {
    return environment.baseURL.trim().replace(/\/+$/, '');
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
  environmentId?: string;
  userId: string;
  agentId?: string | null;
  conversationId?: string | null;
}): string {
  const { environment, environmentId, userId, agentId, conversationId } = params;
  const scopeFingerprint = (...parts: string[]): string =>
    createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  const prefix = environmentId ? `v3:${scopeFingerprint(environmentId).slice(0, 12)}` : 'v2';
  if (environment === 'agent-user') {
    if (!agentId) {
      throw new Error('Agent-user code environments require an agent ID.');
    }
    return `${prefix}:agent-user:${scopeFingerprint(userId, agentId)}`;
  }
  if (environment === 'conversation') {
    if (!conversationId) {
      throw new Error('Conversation code environments require a conversation ID.');
    }
    return `${prefix}:conversation:${scopeFingerprint(userId, conversationId)}`;
  }
  return `${prefix}:user:${scopeFingerprint(userId)}`;
}

function resolveConfiguredEnvironment(params: {
  environmentId?: string | null;
  environments?: readonly CodeEnvironmentConfig[];
}): CodeEnvironmentConfig | undefined {
  const { environmentId, environments } = params;
  if (environmentId) {
    const configured = environments?.find((environment) => environment.id === environmentId);
    if (!configured) {
      throw new Error(`Stateful code environment "${environmentId}" is not configured.`);
    }
    return configured;
  }
  return environments?.find((environment) => environment.default === true);
}

export function resolveCodeExecutionContext(params: {
  statefulSessions: boolean;
  environment?: StatefulCodeEnvironment | string | null;
  environmentId?: string | null;
  environments?: readonly CodeEnvironmentConfig[];
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
  const configuredEnvironment = resolveConfiguredEnvironment(params);
  if (!params.userId) {
    throw new Error('Stateful code environments require an authenticated user ID.');
  }
  const runtimeSessionHint = resolveRuntimeSessionHint({
    environment,
    environmentId: configuredEnvironment?.id,
    userId: params.userId,
    agentId: params.agentId,
    conversationId: params.conversationId,
  });
  return {
    baseUrl: getCodeExecutionBaseUrl('stateful', configuredEnvironment),
    codeSessionKey: `${Constants.EXECUTE_CODE}:stateful:${runtimeSessionHint}`,
    executionProfile: 'stateful',
    runtimeSessionHint,
    statefulSessions: true,
    environmentId: configuredEnvironment?.id,
    environmentType: configuredEnvironment?.type,
  };
}

export function codeExecutionHeaders(
  context: Pick<CodeExecutionContext, 'executionProfile'>,
): Record<string, string> {
  return { [CODE_API_EXPECTED_PROFILE_HEADER]: context.executionProfile };
}
