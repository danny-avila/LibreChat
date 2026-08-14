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

function statefulCodeBaseUrl(): string {
  const baseUrl = process.env.LIBRECHAT_CODE_BASEURL_STATEFUL?.trim().replace(/\/$/, '');
  if (baseUrl) {
    return baseUrl;
  }
  throw new Error(
    'Stateful code execution is enabled for this agent, but LIBRECHAT_CODE_BASEURL_STATEFUL is not configured.',
  );
}

function resolveRuntimeSessionHint(params: {
  environment: StatefulCodeEnvironment;
  agentId?: string | null;
  conversationId?: string | null;
}): string {
  const { environment, agentId, conversationId } = params;
  if (environment === 'agent-user') {
    if (!agentId) {
      throw new Error('Agent-user code environments require an agent ID.');
    }
    return `v1:agent-user:${agentId}`;
  }
  if (environment === 'conversation') {
    if (!conversationId) {
      throw new Error('Conversation code environments require a conversation ID.');
    }
    return `v1:conversation:${conversationId}`;
  }
  return 'v1:user';
}

export function resolveCodeExecutionContext(params: {
  statefulSessions: boolean;
  environment?: StatefulCodeEnvironment | string | null;
  agentId?: string | null;
  conversationId?: string | null;
}): CodeExecutionContext {
  if (!params.statefulSessions) {
    return {
      baseUrl: getCodeBaseURL().replace(/\/$/, ''),
      codeSessionKey: Constants.EXECUTE_CODE,
      executionProfile: 'default',
      statefulSessions: false,
    };
  }

  const environment = normalizeStatefulCodeEnvironment(params.environment);
  const runtimeSessionHint = resolveRuntimeSessionHint({
    environment,
    agentId: params.agentId,
    conversationId: params.conversationId,
  });
  return {
    baseUrl: statefulCodeBaseUrl(),
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
