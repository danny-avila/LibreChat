import { SystemCapabilities, isValidCapability } from './capabilities';

describe('isValidCapability', () => {
  it.each(Object.values(SystemCapabilities))('accepts base capability: %s', (cap) => {
    expect(isValidCapability(cap)).toBe(true);
  });

  it.each(['manage:configs:endpoints', 'read:configs:registration', 'manage:configs:speech'])(
    'accepts section-level capability: %s',
    (cap) => {
      expect(isValidCapability(cap)).toBe(true);
    },
  );

  it.each(['assign:configs:user', 'assign:configs:group', 'assign:configs:role'])(
    'accepts assignment capability: %s',
    (cap) => {
      expect(isValidCapability(cap)).toBe(true);
    },
  );

  it.each([
    '',
    'fake',
    'god:mode',
    'manage:configs:',
    'manage:configs: spaces',
    'manage:configs:a:b',
    'delete:configs:endpoints',
    'assign:configs:admin',
    'assign:configs:',
    'MANAGE:USERS',
    'manage:users:extra',
    'read:configs:end points',
  ])('rejects invalid capability: "%s"', (cap) => {
    expect(isValidCapability(cap)).toBe(false);
  });
});
