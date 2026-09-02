import type { AttachedCodeEnvironmentPolicySettings } from './byom';
import {
  assertAttachedCodeEnvironmentApprovalSupported,
  buildAttachedCodeEnvironmentAdmissionHooks,
  collectAttachedCodeEnvironmentAgentIds,
  collectAttachedCodeEnvironmentPolicySettings,
  createAttachedCodeEnvironmentPolicyHook,
} from './byom';
import { canAgentGraphPause } from './admission';

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
      decision: 'deny',
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
  test('applies admin-exposed environment settings by permission category', async () => {
    const hook = createAttachedCodeEnvironmentPolicyHook(
      new Set(['attached-agent']),
      new Map([
        [
          'attached-agent',
          {
            configSchema: {
              permissions: {
                fileWrite: { allowed: ['allow', 'ask', 'deny'], default: 'ask' },
                commandExecution: { allowed: ['ask', 'deny'], default: 'ask' },
              },
            },
            settings: {
              permissions: { fileWrite: 'allow' as const, commandExecution: 'deny' as const },
            },
          },
        ],
      ]),
    );

    await expect(
      hook({ toolName: 'write_file', executingAgentId: 'attached-agent' } as never, signal),
    ).resolves.toEqual({ decision: 'allow' });
    await expect(
      hook({ toolName: 'bash_tool', executingAgentId: 'attached-agent' } as never, signal),
    ).resolves.toMatchObject({ decision: 'deny' });
  });

  test.each(['create_file', 'edit_file'])(
    'keeps persistent skill write %s approval-gated when BYOM file writes are allowed',
    async (toolName) => {
      const hook = createAttachedCodeEnvironmentPolicyHook(
        new Set(['attached-agent']),
        new Map([
          [
            'attached-agent',
            {
              configSchema: {
                permissions: {
                  fileWrite: { allowed: ['allow', 'ask'], default: 'ask' },
                },
              },
              settings: { permissions: { fileWrite: 'allow' as const } },
              skillAuthoringAvailable: true,
            },
          ],
        ]),
      );

      await expect(
        hook(
          {
            toolName,
            toolInput: { path: 'skills/reviewer/SKILL.md' },
            executingAgentId: 'attached-agent',
          } as never,
          signal,
        ),
      ).resolves.toEqual({
        decision: 'ask',
        reason: `${toolName} can modify a persistent LibreChat skill`,
      });
      await expect(
        hook(
          {
            toolName,
            toolInput: { path: '/mnt/data/output.txt' },
            executingAgentId: 'attached-agent',
          } as never,
          signal,
        ),
      ).resolves.toEqual({ decision: 'allow' });
    },
  );

  test.each([
    '/skills/reviewer/SKILL.md',
    './skills/reviewer/SKILL.md',
    'skills\\reviewer\\SKILL.md',
    'workspace/../skills/reviewer/SKILL.md',
  ])('applies the BYOM file policy to sandbox-routed path %s', async (filePath) => {
    const hook = createAttachedCodeEnvironmentPolicyHook(
      new Set(['attached-agent']),
      new Map([
        [
          'attached-agent',
          {
            configSchema: {
              permissions: { fileWrite: { allowed: ['ask', 'deny'], default: 'deny' } },
            },
            settings: { permissions: { fileWrite: 'deny' as const } },
            skillAuthoringAvailable: true,
          },
        ],
      ]),
    );

    await expect(
      hook(
        {
          toolName: 'create_file',
          toolInput: { path: filePath },
          executingAgentId: 'attached-agent',
        } as never,
        signal,
      ),
    ).resolves.toMatchObject({ decision: 'deny' });
  });
});

describe('buildAttachedCodeEnvironmentAdmissionHooks', () => {
  const bypassPolicy = { enabled: true, mode: 'bypass' as const };

  test('does not classify allow/deny-only BYOM tools as pause-capable', () => {
    const attachedIds = new Set(['attached-agent']);
    const settings = new Map<string, AttachedCodeEnvironmentPolicySettings>([
      [
        'attached-agent',
        {
          configSchema: {
            permissions: {
              fileWrite: { allowed: ['allow', 'ask', 'deny'], default: 'ask' },
              commandExecution: {
                allowed: ['allow', 'ask', 'deny'],
                default: 'ask',
              },
            },
          },
          settings: {
            permissions: { fileWrite: 'allow' as const, commandExecution: 'deny' as const },
          },
          skillAuthoringAvailable: true,
        },
      ],
    ]);
    const hooks = buildAttachedCodeEnvironmentAdmissionHooks(attachedIds, settings);

    expect(
      canAgentGraphPause({
        policy: bypassPolicy,
        agents: [{ id: 'attached-agent', tools: ['write_file', 'bash_tool'] }],
        resolvedProgrammaticHooks: hooks,
      }),
    ).toBe(false);
    expect(
      canAgentGraphPause({
        policy: bypassPolicy,
        agents: [{ id: 'attached-agent', tools: ['create_file'] }],
        resolvedProgrammaticHooks: hooks,
      }),
    ).toBe(true);
  });

  test('scopes BYOM pause capability to the attached agent that can ask', () => {
    const attachedIds = new Set(['attached-agent']);
    const hooks = buildAttachedCodeEnvironmentAdmissionHooks(
      attachedIds,
      new Map<string, AttachedCodeEnvironmentPolicySettings>([
        [
          'attached-agent',
          {
            configSchema: {
              permissions: {
                commandExecution: { allowed: ['allow', 'ask'], default: 'allow' },
              },
            },
            settings: { permissions: { commandExecution: 'allow' as const } },
          },
        ],
      ]),
    );

    expect(
      canAgentGraphPause({
        policy: bypassPolicy,
        agents: [
          { id: 'attached-agent', tools: ['read_file'] },
          { id: 'managed-agent', tools: ['bash_tool'] },
        ],
        resolvedProgrammaticHooks: hooks,
      }),
    ).toBe(false);
  });

  test('keeps the safe default ask-capable when no user setting is configured', () => {
    const attachedIds = new Set(['attached-agent']);
    expect(
      canAgentGraphPause({
        policy: bypassPolicy,
        agents: [{ id: 'attached-agent', tools: ['bash_tool'] }],
        resolvedProgrammaticHooks: buildAttachedCodeEnvironmentAdmissionHooks(attachedIds),
      }),
    ).toBe(true);
  });

  test('does not add a skill pause branch when skill authoring is unavailable', () => {
    const attachedIds = new Set(['attached-agent']);
    const settings = new Map<string, AttachedCodeEnvironmentPolicySettings>([
      [
        'attached-agent',
        {
          configSchema: {
            permissions: { fileWrite: { allowed: ['allow', 'deny'], default: 'allow' } },
          },
          settings: { permissions: { fileWrite: 'allow' } },
          skillAuthoringAvailable: false,
        },
      ],
    ]);
    expect(
      canAgentGraphPause({
        policy: bypassPolicy,
        agents: [{ id: 'attached-agent', tools: ['create_file', 'edit_file'] }],
        resolvedProgrammaticHooks: buildAttachedCodeEnvironmentAdmissionHooks(
          attachedIds,
          settings,
        ),
      }),
    ).toBe(false);
  });
});

describe('collectAttachedCodeEnvironmentAgentIds', () => {
  test('finds attached agents across eager and graph subagents without including managed agents', () => {
    const agents = [
      {
        id: 'root',
        codeExecutionContext: { environmentType: 'managed' },
        subagentAgentConfigs: [
          {
            id: 'attached-child',
            codeExecutionContext: {
              environmentType: 'attached',
              codeEnvironmentSettings: { permissions: { fileWrite: 'allow' as const } },
            },
          },
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
    expect(collectAttachedCodeEnvironmentPolicySettings(agents).get('attached-child')).toEqual({
      configSchema: undefined,
      settings: { permissions: { fileWrite: 'allow' } },
      skillAuthoringAvailable: false,
    });
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
