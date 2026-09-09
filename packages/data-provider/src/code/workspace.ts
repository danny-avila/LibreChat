export const CODE_WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const CODE_WORKSPACE_OPERATIONS = [
  'read_file',
  'search_text',
  'list_files',
  'write_file',
  'preview_edit',
  'edit_file',
  'execute_command',
] as const;

export type CodeWorkspaceOperation = (typeof CODE_WORKSPACE_OPERATIONS)[number];

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
