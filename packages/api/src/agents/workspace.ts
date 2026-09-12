interface AgentWorkspaceUpdate {
  code_environment_id?: string | null;
  code_workspace_id?: string;
  [key: string]: unknown;
}

/** Clear a machine-scoped default when its environment changes without a replacement default. */
export function reconcileAgentWorkspaceDefault<T extends AgentWorkspaceUpdate>({
  update,
  request,
  currentEnvironmentId,
}: {
  update: T;
  request: AgentWorkspaceUpdate;
  currentEnvironmentId?: string | null;
}): T {
  const changesEnvironment =
    Object.prototype.hasOwnProperty.call(request, 'code_environment_id') &&
    request.code_environment_id !== currentEnvironmentId;
  if (!changesEnvironment || Object.prototype.hasOwnProperty.call(request, 'code_workspace_id')) {
    return update;
  }
  return { ...update, code_workspace_id: '' };
}
