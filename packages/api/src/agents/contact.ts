import type { AgentOwnerContact } from 'librechat-data-provider';

export interface AgentContactSource {
  authorName?: string | null;
  support_contact?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export interface AgentOwnerContactSource {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}

const normalizeContactValue = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const hasSupportContact = (agent: AgentContactSource): boolean => {
  const support = agent.support_contact;
  if (!support) {
    return false;
  }
  return !!normalizeContactValue(support.name) || !!normalizeContactValue(support.email);
};

export function resolveAgentOwnerContact(
  agent: AgentContactSource,
  owner: AgentOwnerContactSource | null,
): AgentOwnerContact | undefined {
  if (hasSupportContact(agent) || owner == null) {
    return undefined;
  }

  const name =
    normalizeContactValue(owner.name) ??
    normalizeContactValue(owner.username) ??
    normalizeContactValue(agent.authorName);
  const email = normalizeContactValue(owner.email);

  if (!name && !email) {
    return undefined;
  }

  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };
}
