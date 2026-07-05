import { Constants } from 'librechat-data-provider';
import type { Action } from 'librechat-data-provider';
import type { AgentItem, AgentItemKind } from './types';

export interface FormSelection {
  execute_code: boolean;
  web_search: boolean;
  file_search: boolean;
  memory: boolean;
  artifacts: string | undefined;
  tools: string[];
  skills: string[];
  context_files: Array<[string, unknown]>;
  knowledge_files: Array<[string, unknown]>;
  code_files: Array<[string, unknown]>;
}

const KIND_ORDER: AgentItemKind[] = ['builtin', 'mcp', 'tool', 'skill', 'action'];
const MCP_PREFIX = 'mcp_';

/**
 * Stable identity for a catalog item across kinds. IDs come from disjoint
 * namespaces (capability ids, MCP server names, pluginKeys, skill ids, action
 * ids), so selection sets must key on `kind:id` to avoid cross-kind collisions.
 */
export function itemKey(item: Pick<AgentItem, 'kind' | 'id'>): string {
  return `${item.kind}:${item.id}`;
}

function isBuiltinSelected(item: AgentItem, form: FormSelection): boolean {
  if (item.kind !== 'builtin') return false;
  switch (item.id) {
    case 'execute_code':
      return form.execute_code || form.code_files.length > 0;
    case 'web_search':
      return form.web_search;
    case 'file_search':
      return form.file_search || form.knowledge_files.length > 0;
    case 'memory':
      return form.memory;
    case 'artifacts':
      return Boolean(form.artifacts);
    case 'context':
      return form.context_files.length > 0;
    default:
      return false;
  }
}

function isToolSelected(item: AgentItem, form: FormSelection): boolean {
  if (item.kind !== 'tool') return false;
  return form.tools.includes(item.id);
}

/**
 * Server-level placeholder token (`sys__server__sys_mcp_<serverName>`). It pins
 * the server's attachment independently of tool selection, so a server stays
 * attached even with zero tools selected (deselect-all keeps the token); only
 * an explicit remove strips it.
 */
export function mcpServerToken(serverName: string): string {
  return `${Constants.mcp_server}${Constants.mcp_delimiter}${serverName}`;
}

/**
 * Whether a form `tools` token references the given MCP server, across every
 * format ever persisted: the server placeholder token, the raw server name,
 * the exact `mcp_<server>` pluginKey form, and delimiter-suffixed per-tool
 * ids (`<tool>_mcp_<server>`). All checks are exact or delimiter-bounded —
 * server names may contain underscores, so a bare prefix match would claim
 * `mcp_github_extra` for a server named `github`. Selection and removal must
 * share this predicate: anything the selection logic counts as attached, an
 * explicit remove must also strip, or a legacy token leaves the server
 * permanently selected.
 */
export function matchesMcpServer(token: string, serverName: string): boolean {
  const prefixed = `${MCP_PREFIX}${serverName}`;
  return (
    token === mcpServerToken(serverName) ||
    token === serverName ||
    token === prefixed ||
    token.endsWith(`_${prefixed}`)
  );
}

function isMcpSelected(item: AgentItem, form: FormSelection): boolean {
  if (item.kind !== 'mcp') return false;
  return form.tools.some((t) => matchesMcpServer(t, item.id));
}

function isSkillSelected(item: AgentItem, form: FormSelection): boolean {
  if (item.kind !== 'skill') return false;
  return form.skills.includes(item.id);
}

function isActionSelected(item: AgentItem, agentActions: Action[]): boolean {
  if (item.kind !== 'action') return false;
  return agentActions.some((a) => a.action_id === item.id);
}

export function deriveSelectedItems(
  form: FormSelection,
  catalog: AgentItem[],
  agentActions: Action[],
): AgentItem[] {
  const selected = catalog.filter((item) => {
    if (item.kind === 'builtin') return isBuiltinSelected(item, form);
    if (item.kind === 'tool') return isToolSelected(item, form);
    if (item.kind === 'mcp') return isMcpSelected(item, form);
    if (item.kind === 'skill') return isSkillSelected(item, form);
    if (item.kind === 'action') return isActionSelected(item, agentActions);
    return false;
  });

  return selected.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
