const mockAggregateAclEntries = jest.fn();
const mockFindUsers = jest.fn();

jest.mock('~/models', () => ({
  aggregateAclEntries: (...args) => mockAggregateAclEntries(...args),
  findUsers: (...args) => mockFindUsers(...args),
}));

const mongoose = require('mongoose');
const { AGENT_OWNER_CONTACT_RESOLVED_FIELD } = require('@librechat/data-schemas');
const { attachOwnerContacts } = require('./ownerContact');

describe('attachOwnerContacts', () => {
  beforeEach(() => {
    mockAggregateAclEntries.mockReset();
    mockFindUsers.mockReset();
    mockAggregateAclEntries.mockResolvedValue([]);
    mockFindUsers.mockResolvedValue([]);
  });

  test('keeps a contact the list query already resolved and queries nothing for it', async () => {
    const agent = {
      _id: new mongoose.Types.ObjectId(),
      id: 'agent_resolved',
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };

    const [result] = await attachOwnerContacts([agent]);

    expect(result.owner_contact).toEqual({ name: 'Ada Owner' });
    // The marker is a handoff between the list query and this service, never a response field.
    expect(result).not.toHaveProperty(AGENT_OWNER_CONTACT_RESOLVED_FIELD);
    expect(mockAggregateAclEntries).not.toHaveBeenCalled();
    expect(mockFindUsers).not.toHaveBeenCalled();
  });

  test('a support contact still wins over an owner contact on a resolved row', async () => {
    const agent = {
      _id: new mongoose.Types.ObjectId(),
      id: 'agent_supported',
      support_contact: { name: 'Support Desk' },
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };

    const [result] = await attachOwnerContacts([agent]);

    expect(result).not.toHaveProperty('owner_contact');
    expect(result).not.toHaveProperty(AGENT_OWNER_CONTACT_RESOLVED_FIELD);
  });

  test('resolves only the rows that arrive without a contact', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const resolved = {
      _id: new mongoose.Types.ObjectId(),
      id: 'agent_resolved',
      owner_contact: { name: 'Ada Owner' },
      [AGENT_OWNER_CONTACT_RESOLVED_FIELD]: true,
    };
    const pending = {
      _id: new mongoose.Types.ObjectId(),
      id: 'agent_pending',
      author: ownerId,
    };
    mockFindUsers.mockResolvedValue([{ _id: ownerId, name: 'Bob Owner' }]);

    const results = await attachOwnerContacts([resolved, pending]);

    expect(results.map((agent) => agent.owner_contact)).toEqual([
      { name: 'Ada Owner' },
      { name: 'Bob Owner' },
    ]);
    const [[pipeline]] = mockAggregateAclEntries.mock.calls;
    // The resolved row's resource must not reach the ACL aggregation again.
    expect(pipeline[0].$match.resourceId.$in.map(String)).toEqual([pending._id.toString()]);
    expect(mockFindUsers).toHaveBeenCalledTimes(1);
  });
});
