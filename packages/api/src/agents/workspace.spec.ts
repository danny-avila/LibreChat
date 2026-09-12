import { reconcileAgentWorkspaceDefault } from './workspace';

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
