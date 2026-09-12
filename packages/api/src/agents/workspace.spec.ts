import {
  AGENT_WORKSPACE_ATTACHED_ENVIRONMENT_ERROR,
  reconcileAgentWorkspaceDefault,
  validateAgentWorkspaceDefaultBinding,
} from './workspace';

describe('reconcileAgentWorkspaceDefault', () => {
  it('clears a stale default when the attached environment changes', () => {
    expect(
      reconcileAgentWorkspaceDefault({
        update: { code_environment_id: 'machine-b' },
        request: { code_environment_id: 'machine-b' },
        currentEnvironmentId: 'machine-a',
      }),
    ).toEqual({ code_environment_id: 'machine-b', code_workspace_id: '' });
  });

  it('preserves an explicit replacement default', () => {
    expect(
      reconcileAgentWorkspaceDefault({
        update: { code_environment_id: 'machine-b', code_workspace_id: 'project-b' },
        request: { code_environment_id: 'machine-b', code_workspace_id: 'project-b' },
        currentEnvironmentId: 'machine-a',
      }),
    ).toEqual({ code_environment_id: 'machine-b', code_workspace_id: 'project-b' });
  });

  it('does not clear the default when an unchanged environment is resubmitted', () => {
    expect(
      reconcileAgentWorkspaceDefault({
        update: { code_environment_id: 'machine-a' },
        request: { code_environment_id: 'machine-a' },
        currentEnvironmentId: 'machine-a',
      }),
    ).toEqual({ code_environment_id: 'machine-a' });
  });
});

describe('validateAgentWorkspaceDefaultBinding', () => {
  const environments = [
    { id: 'attached-vm', type: 'attached' },
    { id: 'managed-runtime', type: 'managed' },
  ];

  it('accepts a new default bound to an explicit attached environment', () => {
    expect(
      validateAgentWorkspaceDefaultBinding({
        workspaceId: 'project-a',
        environmentId: 'attached-vm',
        environments,
      }),
    ).toEqual({ valid: true });
  });

  it.each([
    ['an omitted environment', undefined],
    ['a managed environment', 'managed-runtime'],
    ['an unconfigured environment', 'missing-vm'],
  ])('rejects a new default bound to %s', (_label, environmentId) => {
    expect(
      validateAgentWorkspaceDefaultBinding({
        workspaceId: 'project-a',
        environmentId,
        environments,
      }),
    ).toEqual({ valid: false, error: AGENT_WORKSPACE_ATTACHED_ENVIRONMENT_ERROR });
  });

  it('skips an unchanged binding after its environment is removed', () => {
    expect(
      validateAgentWorkspaceDefaultBinding({
        workspaceId: 'project-a',
        environmentId: 'removed-vm',
        currentWorkspaceId: 'project-a',
        currentEnvironmentId: 'removed-vm',
        environments,
      }),
    ).toEqual({ valid: true });
  });

  it('revalidates the same workspace when it is rebound to another environment', () => {
    expect(
      validateAgentWorkspaceDefaultBinding({
        workspaceId: 'project-a',
        environmentId: 'managed-runtime',
        currentWorkspaceId: 'project-a',
        currentEnvironmentId: 'attached-vm',
        environments,
      }),
    ).toEqual({ valid: false, error: AGENT_WORKSPACE_ATTACHED_ENVIRONMENT_ERROR });
  });

  it('allows clearing a stale default', () => {
    expect(
      validateAgentWorkspaceDefaultBinding({
        workspaceId: '',
        environmentId: 'removed-vm',
        currentWorkspaceId: 'project-a',
        currentEnvironmentId: 'removed-vm',
        environments,
      }),
    ).toEqual({ valid: true });
  });
});
