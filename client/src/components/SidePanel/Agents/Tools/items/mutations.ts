import { AgentCapabilities, ArtifactModes } from 'librechat-data-provider';
import type { AgentItem } from './types';

export type TogglePatch =
  | { type: 'builtin'; field: AgentCapabilities; value: boolean | string }
  | { type: 'tool-add'; id: string }
  | { type: 'tool-remove'; id: string }
  | { type: 'skill-add'; id: string }
  | { type: 'skill-remove'; id: string }
  | { type: 'mcp-add'; serverName: string }
  | { type: 'mcp-remove'; serverName: string }
  | { type: 'action-add'; actionId: string }
  | { type: 'action-remove'; actionId: string };

function builtinTogglePatch(id: string, selected: boolean): TogglePatch {
  if (id === 'ask_user_question') {
    // Native tool presented as a builtin — it has no capability field; the
    // toggle edits agent.tools exactly like a plugin.
    return selected ? { type: 'tool-remove', id } : { type: 'tool-add', id };
  }
  // Every other BuiltinId string equals its AgentCapabilities enum value, so
  // the id is already the form field name.
  const field = id as AgentCapabilities;
  if (id === 'artifacts') {
    return { type: 'builtin', field, value: selected ? '' : ArtifactModes.DEFAULT };
  }
  return { type: 'builtin', field, value: !selected };
}

export function computeToggleAction(item: AgentItem, state: { selected: boolean }): TogglePatch {
  if (item.kind === 'builtin') {
    return builtinTogglePatch(item.id, state.selected);
  }
  if (item.kind === 'tool') {
    return state.selected
      ? { type: 'tool-remove', id: item.id }
      : { type: 'tool-add', id: item.id };
  }
  if (item.kind === 'skill') {
    return state.selected
      ? { type: 'skill-remove', id: item.id }
      : { type: 'skill-add', id: item.id };
  }
  if (item.kind === 'mcp') {
    return state.selected
      ? { type: 'mcp-remove', serverName: item.id }
      : { type: 'mcp-add', serverName: item.id };
  }
  return state.selected
    ? { type: 'action-remove', actionId: item.id }
    : { type: 'action-add', actionId: item.id };
}

/**
 * `skills_enabled` is the master opt-in for the skill allowlist, and an empty
 * allowlist with the flag on means the FULL accessible catalog ("use all
 * skills"). Selection edits sync the flag to the selection: any non-empty
 * selection needs the flag on to take effect (this also heals agents saved
 * with the since-removed Advanced kill switch off while skills were still
 * selected), and clearing the selection turns it off so the agent doesn't
 * silently escalate to the full catalog. Returns `undefined` when the flag
 * already matches. The "use all skills" state (flag on, empty selection) is
 * only ever set by its explicit toggle, never by selection edits.
 */
export function skillsEnabledTransition(
  next: string[],
  enabled: boolean | undefined,
): boolean | undefined {
  if (next.length > 0) {
    return enabled === true ? undefined : true;
  }
  return enabled === true ? false : undefined;
}
