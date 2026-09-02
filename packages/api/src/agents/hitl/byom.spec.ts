import {
  assertAttachedCodeEnvironmentApprovalSupported,
  collectAttachedCodeEnvironmentAgentIds,
  createAttachedCodeEnvironmentPolicyHook,
} from './byom';

const signal = new AbortController().signal;

describe('createAttachedCodeEnvironmentPolicyHook', () => {
  test('asks before a shell action in an attached environment', async () => {
    const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['attached-agent']));

    await expect(
      hook({ toolName: 'bash_tool', executingAgentId: 'attached-agent' } as never, signal),
    ).resolves.toEqual({
      decision: 'ask',
      reason: 'bash_tool can modify your attached code environment',
    });
  });

  test('allows the baseline policy to auto-approve read-only coding actions', async () => {
    const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['attached-agent']));

    await expect(
      hook({ toolName: 'read_file', executingAgentId: 'attached-agent' } as never, signal),
    ).resolves.toEqual({});
  });

  test('does not apply the BYOM baseline to a managed-environment sibling agent', async () => {
    const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['attached-agent']));

    await expect(
      hook({ toolName: 'bash_tool', executingAgentId: 'managed-agent' } as never, signal),
    ).resolves.toEqual({});
  });

  test('fails closed when a risky call cannot be attributed to an agent', async () => {
    const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['attached-agent']));

    await expect(hook({ toolName: 'write_file' } as never, signal)).resolves.toMatchObject({
      decision: 'ask',
    });
  });

  test.each(['create_file', 'edit_file'])(
    'asks before the canonical host file action %s',
    async (toolName) => {
      const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['attached-agent']));

      await expect(
        hook({ toolName, executingAgentId: 'attached-agent' } as never, signal),
      ).resolves.toMatchObject({ decision: 'ask' });
    },
  );
});

describe('collectAttachedCodeEnvironmentAgentIds', () => {
  test('finds attached agents across eager and graph subagents without including managed agents', () => {
    const agents = [
      {
        id: 'root',
        codeExecutionContext: { environmentType: 'managed' },
        subagentAgentConfigs: [
          { id: 'attached-child', codeExecutionContext: { environmentType: 'attached' } },
        ],
        subagentGraphConfigs: [
          {
            memberConfigs: [
              { id: 'managed-member', codeExecutionContext: { environmentType: 'managed' } },
              { id: 'attached-member', codeExecutionContext: { environmentType: 'attached' } },
            ],
          },
        ],
      },
    ];

    expect(collectAttachedCodeEnvironmentAgentIds(agents)).toEqual(
      new Set(['attached-child', 'attached-member']),
    );
  });
});

describe('assertAttachedCodeEnvironmentApprovalSupported', () => {
  test('rejects attached environments on callers without an approval/resume surface', () => {
    expect(() =>
      assertAttachedCodeEnvironmentApprovalSupported({
        hasAttachedCodeEnvironment: true,
        hitlCapable: false,
        approvalExplicitlyDisabled: false,
      }),
    ).toThrow('Attached code environments require a tool-approval capable client');
  });

  test('allows the admin emergency override and non-attached environments', () => {
    expect(() =>
      assertAttachedCodeEnvironmentApprovalSupported({
        hasAttachedCodeEnvironment: true,
        hitlCapable: false,
        approvalExplicitlyDisabled: true,
      }),
    ).not.toThrow();
    expect(() =>
      assertAttachedCodeEnvironmentApprovalSupported({
        hasAttachedCodeEnvironment: false,
        hitlCapable: false,
        approvalExplicitlyDisabled: false,
      }),
    ).not.toThrow();
  });
});
