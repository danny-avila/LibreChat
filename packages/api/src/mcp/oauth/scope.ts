export interface ParsedFlowId {
  namespace?: string;
  userId: string;
  serverName: string;
}

const DEFAULT_NAMESPACE = 'default';

function sanitizeNamespace(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || DEFAULT_NAMESPACE;
}

function deriveNamespaceFromDomainServer(): string {
  const domainServer = process.env.DOMAIN_SERVER;
  if (!domainServer) {
    return DEFAULT_NAMESPACE;
  }

  try {
    const normalized = /^https?:\/\//i.test(domainServer)
      ? domainServer
      : `https://${domainServer}`;
    const parsed = new URL(normalized);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return sanitizeNamespace(
      `${parsed.hostname}${parsed.port ? `-${parsed.port}` : ''}${pathname}`,
    );
  } catch {
    return sanitizeNamespace(domainServer);
  }
}

export function getMCPOAuthNamespace(): string {
  if (process.env.MCP_OAUTH_NAMESPACE) {
    return sanitizeNamespace(process.env.MCP_OAUTH_NAMESPACE);
  }

  return deriveNamespaceFromDomainServer();
}

export function buildMCPOAuthFlowId(userId: string, serverName: string): string {
  return `${getMCPOAuthNamespace()}:${userId}:${serverName}`;
}

export function parseMCPOAuthFlowId(flowId: string): ParsedFlowId | null {
  const parts = flowId.split(':');

  if (parts.length === 2) {
    const [userId, serverName] = parts;
    if (!userId || !serverName) {
      return null;
    }
    return { userId, serverName };
  }

  if (parts.length >= 3) {
    const [namespace, userId, ...serverNameParts] = parts;
    const serverName = serverNameParts.join(':');
    if (!namespace || !userId || !serverName) {
      return null;
    }
    return { namespace, userId, serverName };
  }

  return null;
}

export function isMCPOAuthFlowOwnedByUser(flowId: string, userId: string): boolean {
  return parseMCPOAuthFlowId(flowId)?.userId === userId;
}

export function buildMCPOAuthTokenIdentifier(serverName: string): string {
  return `mcp:${getMCPOAuthNamespace()}:${serverName}`;
}

export function buildLegacyMCPOAuthTokenIdentifier(serverName: string): string {
  return `mcp:${serverName}`;
}
