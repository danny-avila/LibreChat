import { SystemRoles } from 'librechat-data-provider';
import { checkAgentUploadAuth } from './auth';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

describe('checkAgentUploadAuth', () => {
  const agent = { _id: 'agent-object-id', author: { toString: () => 'owner-id' } };
  const getAgent = jest.fn().mockResolvedValue(agent);
  const checkPermission = jest.fn().mockResolvedValue(false);

  beforeEach(() => {
    jest.clearAllMocks();
    getAgent.mockResolvedValue(agent);
    checkPermission.mockResolvedValue(false);
  });

  it('denies a permanent upload with no tool resource from a user without edit permission', async () => {
    const result = await checkAgentUploadAuth(
      { userId: 'attacker-id', userRole: SystemRoles.USER, agentId: 'victim-agent' },
      { getAgent, checkPermission },
    );

    expect(result.allowed).toBe(false);
    expect(checkPermission).toHaveBeenCalled();
  });

  it('allows a permanent upload with no tool resource when the user may edit the agent', async () => {
    checkPermission.mockResolvedValue(true);

    const result = await checkAgentUploadAuth(
      { userId: 'editor-id', userRole: SystemRoles.USER, agentId: 'shared-agent' },
      { getAgent, checkPermission },
    );

    expect(result.allowed).toBe(true);
  });

  it('allows the agent author without consulting permissions', async () => {
    const result = await checkAgentUploadAuth(
      { userId: 'owner-id', userRole: SystemRoles.USER, agentId: 'own-agent' },
      { getAgent, checkPermission },
    );

    expect(result.allowed).toBe(true);
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('skips the check for message attachments, which belong to the conversation', async () => {
    const result = await checkAgentUploadAuth(
      {
        userId: 'any-user',
        userRole: SystemRoles.USER,
        agentId: 'victim-agent',
        messageFile: 'true',
      },
      { getAgent, checkPermission },
    );

    expect(result.allowed).toBe(true);
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('still denies when a tool resource is supplied without permission', async () => {
    const result = await checkAgentUploadAuth(
      {
        userId: 'attacker-id',
        userRole: SystemRoles.USER,
        agentId: 'victim-agent',
        toolResource: 'context',
      },
      { getAgent, checkPermission },
    );

    expect(result.allowed).toBe(false);
  });
});
