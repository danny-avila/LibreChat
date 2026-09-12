export const CODE_WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** Protocol-v1 ceiling enforced by the worker and Code API. */
export const CODE_WORKSPACE_MAX_COUNT = 32;
export const CODE_WORKSPACE_OPERATIONS = [
  'read_file',
  'search_text',
  'list_files',
  'write_file',
  'preview_edit',
  'edit_file',
  'execute_command',
] as const;
export const CODE_WORKSPACE_SELECTION_ERROR_REASONS = [
  'required',
  'invalid',
  'worker_unavailable',
  'unsupported',
  'missing',
  'locked',
] as const;
export const CODE_ENVIRONMENT_MODES = ['attached', 'without_attached'] as const;

export type CodeWorkspaceOperation = (typeof CODE_WORKSPACE_OPERATIONS)[number];
export type CodeWorkspaceSelectionErrorReason =
  (typeof CODE_WORKSPACE_SELECTION_ERROR_REASONS)[number];
export type CodeEnvironmentMode = (typeof CODE_ENVIRONMENT_MODES)[number];

/** Public, path-free description of one root registered by an attached worker. */
export interface CodeWorkspaceDescriptor {
  id: string;
  name?: string;
  /** Omitted when every worker-level operation applies to this workspace. */
  operations?: CodeWorkspaceOperation[];
}

/** Conversation-owned selection, bound to the environment that advertised it. */
export interface CodeWorkspaceSelection {
  environmentId: string;
  workspaceId: string;
}

export function isCodeEnvironmentMode(value: unknown): value is CodeEnvironmentMode {
  return CODE_ENVIRONMENT_MODES.some((mode) => mode === value);
}

export function isCodeWorkspaceSelectionErrorReason(
  value: unknown,
): value is CodeWorkspaceSelectionErrorReason {
  return CODE_WORKSPACE_SELECTION_ERROR_REASONS.some((reason) => reason === value);
}

export function isCodeWorkspaceSelection(value: unknown): value is CodeWorkspaceSelection {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const selection = value as Record<string, unknown>;
  return (
    Object.keys(selection).every((key) => key === 'environmentId' || key === 'workspaceId') &&
    typeof selection.environmentId === 'string' &&
    CODE_WORKSPACE_ID_PATTERN.test(selection.environmentId) &&
    typeof selection.workspaceId === 'string' &&
    CODE_WORKSPACE_ID_PATTERN.test(selection.workspaceId)
  );
}

/** One exact workspace per attached environment used by a conversation. */
export function isCodeWorkspaceSelections(value: unknown): value is CodeWorkspaceSelection[] {
  if (!Array.isArray(value)) return false;
  const environmentIds = new Set<string>();
  return value.every((selection) => {
    if (!isCodeWorkspaceSelection(selection) || environmentIds.has(selection.environmentId)) {
      return false;
    }
    environmentIds.add(selection.environmentId);
    return true;
  });
}
