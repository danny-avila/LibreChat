import { MCP_USER_INPUT_FIELDS } from 'librechat-data-provider';
import type { AdminAuditEmitter, RecordAuditEntry } from '~/admin/audit';
import { createAdminAuditEmitter } from '~/admin/audit';

type MCPServerAction = 'mcp_server.created' | 'mcp_server.updated' | 'mcp_server.deleted';
type ServerConfigLike = Record<string, unknown> | null | undefined;

export interface MCPServerAuditEvent {
  action: MCPServerAction;
  serverName: string;
  /** Config before the change; omitted on create. */
  previous?: ServerConfigLike;
  /** Config after the change; omitted on delete. */
  next?: ServerConfigLike;
}

/**
 * Lists the user-input fields that differ between two server configs. Only
 * field names are returned, so headers, env values and credentials never reach
 * the audit trail.
 */
export function diffMCPServerFields(previous: ServerConfigLike, next: ServerConfigLike): string[] {
  const changed: string[] = [];
  for (const field of MCP_USER_INPUT_FIELDS) {
    const before = previous?.[field];
    const after = next?.[field];
    if (before === undefined && after === undefined) {
      continue;
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed.push(field);
    }
  }
  return changed.sort();
}

function serverTitle(config: ServerConfigLike): string | undefined {
  const title = config?.title;
  return typeof title === 'string' && title.length > 0 ? title : undefined;
}

/**
 * Builds the MCP server audit writer. Fail-open unless `failClosed` is set,
 * matching the admin handler factories.
 */
export function createMCPServerAuditor(options: {
  recordAuditEntry?: RecordAuditEntry;
  failClosed?: boolean;
}): (req: Parameters<AdminAuditEmitter>[0], event: MCPServerAuditEvent) => Promise<void> {
  const emit = createAdminAuditEmitter({ ...options, logPrefix: '[mcpServers]' });
  return async function auditMCPServer(req, { action, serverName, previous, next }) {
    const name = serverTitle(next) ?? serverTitle(previous);
    const before = action === 'mcp_server.created' ? undefined : previous;
    const changed = action === 'mcp_server.deleted' ? [] : diffMCPServerFields(before, next);
    await emit(req, {
      action,
      severity: action === 'mcp_server.deleted' ? 'warning' : 'info',
      target: { type: 'mcp_server', id: serverName, ...(name ? { name } : {}) },
      metadata: {
        source: 'DB',
        ...(changed.length > 0 ? { fields: changed.join(',') } : {}),
      },
    });
  };
}
