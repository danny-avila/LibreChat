import { agentUpdateSchema } from './validation';

describe('agent workspace default', () => {
  it('retains a default and an explicit reset through update validation', () => {
    expect(agentUpdateSchema.parse({ code_workspace_id: 'primary' }).code_workspace_id).toBe(
      'primary',
    );
    expect(agentUpdateSchema.parse({ code_workspace_id: '' }).code_workspace_id).toBe('');
    expect(agentUpdateSchema.parse({}).code_workspace_id).toBeUndefined();
  });

  it('rejects unbounded or non-string defaults', () => {
    expect(agentUpdateSchema.safeParse({ code_workspace_id: 'x'.repeat(129) }).success).toBe(false);
    expect(agentUpdateSchema.safeParse({ code_workspace_id: {} }).success).toBe(false);
  });
});
