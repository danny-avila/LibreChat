jest.mock('librechat-data-provider', () => ({
  dataService: {},
  MutationKeys: {},
  PermissionBits: {
    VIEW: 1,
    EDIT: 2,
  },
  QueryKeys: {},
}));

import { preserveOwnerContactFallback } from '../mutations';

const agent = {
  id: 'agent-1',
  name: 'Agent One',
  provider: 'openai',
  model: 'gpt-4',
  model_parameters: {},
} as any;

describe('preserveOwnerContactFallback', () => {
  it('keeps cached owner contact when an update response omits fallback contact', () => {
    const previousAgent = {
      ...agent,
      owner_contact: { name: 'Owner User', email: 'owner@example.com' },
    };
    const updatedAgent = {
      ...agent,
      name: 'Updated Agent',
      support_contact: undefined,
      owner_contact: undefined,
    };

    expect(preserveOwnerContactFallback(updatedAgent, previousAgent)).toEqual({
      ...updatedAgent,
      owner_contact: previousAgent.owner_contact,
    });
  });

  it('does not keep owner contact when support contact is present', () => {
    const previousAgent = {
      ...agent,
      owner_contact: { name: 'Owner User', email: 'owner@example.com' },
    };
    const updatedAgent = {
      ...agent,
      support_contact: { name: 'Support Team' },
      owner_contact: undefined,
    };

    expect(preserveOwnerContactFallback(updatedAgent, previousAgent)).toBe(updatedAgent);
  });

  it('uses the updated owner contact when provided', () => {
    const previousAgent = {
      ...agent,
      owner_contact: { name: 'Owner User', email: 'owner@example.com' },
    };
    const updatedAgent = {
      ...agent,
      owner_contact: { name: 'New Owner', email: 'new@example.com' },
    };

    expect(preserveOwnerContactFallback(updatedAgent, previousAgent)).toBe(updatedAgent);
  });
});
