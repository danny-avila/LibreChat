import { resolveAgentOwnerContact } from './contact';

describe('resolveAgentOwnerContact', () => {
  it('omits owner fallback when support contact has a name', () => {
    const result = resolveAgentOwnerContact(
      { support_contact: { name: 'Support Team' } },
      { name: 'Agent Owner', email: 'owner@example.com' },
    );

    expect(result).toBeUndefined();
  });

  it('omits owner fallback when support contact has an email', () => {
    const result = resolveAgentOwnerContact(
      { support_contact: { email: 'support@example.com' } },
      { name: 'Agent Owner', email: 'owner@example.com' },
    );

    expect(result).toBeUndefined();
  });

  it('uses owner name and email when support contact is empty', () => {
    const result = resolveAgentOwnerContact(
      { support_contact: { name: '  ', email: '' } },
      { name: ' Agent Owner ', email: ' owner@example.com ' },
    );

    expect(result).toEqual({ name: 'Agent Owner', email: 'owner@example.com' });
  });

  it('falls back to username for owner display name', () => {
    const result = resolveAgentOwnerContact({}, { username: 'owner.user' });

    expect(result).toEqual({ name: 'owner.user' });
  });

  it('falls back to authorName when owner has no display name', () => {
    const result = resolveAgentOwnerContact(
      { authorName: 'Legacy Author' },
      { email: 'owner@example.com' },
    );

    expect(result).toEqual({ name: 'Legacy Author', email: 'owner@example.com' });
  });

  it('omits owner contact when no owner can be resolved', () => {
    const result = resolveAgentOwnerContact({ authorName: 'Legacy Author' }, null);

    expect(result).toBeUndefined();
  });

  it('omits owner contact when all candidate fields are empty', () => {
    const result = resolveAgentOwnerContact(
      { authorName: ' ' },
      { name: '', username: ' ', email: '  ' },
    );

    expect(result).toBeUndefined();
  });
});
