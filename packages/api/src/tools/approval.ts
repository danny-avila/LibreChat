import type { TToolApproval } from 'librechat-data-provider';

export function requiresApproval(
  toolName: string,
  toolApproval: TToolApproval | undefined,
): boolean {
  if (!toolApproval) {
    return false;
  }

  const { required, excluded } = toolApproval;

  if (required === undefined || required === false) {
    return false;
  }

  if (excluded && excluded.length > 0) {
    for (const pattern of excluded) {
      if (matchesPattern(toolName, pattern)) {
        return false;
      }
    }
  }

  if (required === true) {
    return true;
  }

  if (Array.isArray(required)) {
    for (const pattern of required) {
      if (matchesPattern(toolName, pattern)) {
        return true;
      }
    }
  }

  return false;
}

export function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === toolName) {
    return true;
  }

  if (pattern === 'all') {
    return true;
  }

  if (pattern === 'mcp:*' || pattern === 'mcp_*') {
    return toolName.includes(':::mcp:::') || /_mcp_/.test(toolName);
  }

  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return toolName.startsWith(prefix);
  }

  return false;
}

export function getToolServerName(toolName: string): string {
  if (toolName.includes(':::mcp:::')) {
    const parts = toolName.split(':::mcp:::');
    return parts[1] || 'mcp';
  }
  const mcpMatch = toolName.match(/_mcp_([^_]+)$/);
  if (mcpMatch) {
    return mcpMatch[1];
  }
  return 'builtin';
}

export function getBaseToolName(toolName: string): string {
  if (toolName.includes(':::mcp:::')) {
    const parts = toolName.split(':::mcp:::');
    return parts[0] || toolName;
  }
  const mcpMatch = toolName.match(/^(.+)_mcp_[^_]+$/);
  if (mcpMatch) {
    return mcpMatch[1];
  }
  return toolName;
}
