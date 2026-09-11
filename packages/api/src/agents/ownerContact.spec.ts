import { AGENT_OWNER_CONTACT_RESOLVED_FIELD } from '@librechat/data-schemas';
import type { AgentOwnerContactDeps, AgentOwnerContactRow } from './ownerContact';
import { attachAgentOwnerContacts } from './ownerContact';

describe('attachAgentOwnerContacts', () => {
  const getFirstOwnerIdsByResource = jest.fn<Promise<Map<string, string>>, [string, string[]]>();
  const findUsers = jest.fn();
  const deps = {
    getFirstOwnerIdsByResource,
    findUsers,
    logger: { warn: jest.fn() },
  } as unknown as AgentOwnerContactDeps;

  beforeEach(() => {
    getFirstOwnerIdsByResource.mockReset().mockResolvedValue(new Map());
    findUsers.mockReset().mockResolvedValue([]);
  });

  test('keeps a contact the list query already resolved and queries nothing for it', async () => {
    const agent: AgentOwnerContactRow = {
      _id: 'agent_resolved_id',
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };

    const [result] = await attachAgentOwnerContacts([agent], deps);

    expect(result.owner_contact).toEqual({ name: 'Ada Owner' });
    /* The marker is a handoff between the list query and this helper, never a response field. */
    expect(result).not.toHaveProperty(AGENT_OWNER_CONTACT_RESOLVED_FIELD);
    expect(getFirstOwnerIdsByResource).not.toHaveBeenCalled();
    expect(findUsers).not.toHaveBeenCalled();
  });

  test('a support contact still wins over an owner contact on a resolved row', async () => {
    const agent: AgentOwnerContactRow = {
      _id: 'agent_supported_id',
      support_contact: { name: 'Support Desk' },
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };

    const [result] = await attachAgentOwnerContacts([agent], deps);

    expect(result).not.toHaveProperty('owner_contact');
    expect(result).not.toHaveProperty(AGENT_OWNER_CONTACT_RESOLVED_FIELD);
  });

  test('resolves only the rows that arrive without a contact', async () => {
    const resolved: AgentOwnerContactRow = {
      _id: 'agent_resolved_id',
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };
    const pending: AgentOwnerContactRow = { _id: 'agent_pending_id', author: 'owner_id' };
    findUsers.mockResolvedValue([{ _id: 'owner_id', name: 'Bob Owner' }]);

    const results = await attachAgentOwnerContacts([resolved, pending], deps);

    expect(results.map((agent) => agent.owner_contact)).toEqual([
      { name: 'Ada Owner' },
      { name: 'Bob Owner' },
    ]);
    /* The resolved row's resource must not reach the ACL lookup again. */
    expect(getFirstOwnerIdsByResource).toHaveBeenCalledTimes(1);
    expect(getFirstOwnerIdsByResource).toHaveBeenCalledWith('agent', ['agent_pending_id']);
    expect(findUsers).toHaveBeenCalledTimes(1);
  });

  test('prefers the ACL owner over the stored author when both are present', async () => {
    getFirstOwnerIdsByResource.mockResolvedValue(new Map([['agent_id', 'acl_owner_id']]));
    findUsers.mockResolvedValue([
      { _id: 'acl_owner_id', name: 'Current Owner' },
      { _id: 'stale_author_id', name: 'Former Owner' },
    ]);
    const rows: AgentOwnerContactRow[] = [{ _id: 'agent_id', author: 'stale_author_id' }];
    const [result] = await attachAgentOwnerContacts(rows, deps);

    expect(result.owner_contact).toEqual({ name: 'Current Owner' });
  });

  test('serves the page without a contact when the owner lookup fails', async () => {
    getFirstOwnerIdsByResource.mockRejectedValue(new Error('acl unavailable'));

    const [result] = await attachAgentOwnerContacts([{ _id: 'agent_id' }], deps);

    expect(result).not.toHaveProperty('owner_contact');
    expect(deps.logger.warn).toHaveBeenCalled();
  });
});
