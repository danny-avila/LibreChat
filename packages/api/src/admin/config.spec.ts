import { isValidFieldPath, getTopLevelSection, assertOverridePathsAllowed } from './config';
import { PrincipalType } from 'librechat-data-provider';

describe('isValidFieldPath', () => {
  it('accepts simple dot paths', () => {
    expect(isValidFieldPath('interface.modelSelect')).toBe(true);
    expect(isValidFieldPath('registration.socialLogins')).toBe(true);
    expect(isValidFieldPath('a')).toBe(true);
    expect(isValidFieldPath('a.b.c.d')).toBe(true);
  });

  it('rejects empty and non-string', () => {
    expect(isValidFieldPath('')).toBe(false);
    // @ts-expect-error testing invalid input
    expect(isValidFieldPath(undefined)).toBe(false);
    // @ts-expect-error testing invalid input
    expect(isValidFieldPath(null)).toBe(false);
    // @ts-expect-error testing invalid input
    expect(isValidFieldPath(42)).toBe(false);
  });

  it('rejects __proto__ and dunder-prefixed segments', () => {
    expect(isValidFieldPath('__proto__')).toBe(false);
    expect(isValidFieldPath('a.__proto__')).toBe(false);
    expect(isValidFieldPath('__proto__.polluted')).toBe(false);
    expect(isValidFieldPath('a.__proto__.b')).toBe(false);
    expect(isValidFieldPath('__defineGetter__')).toBe(false);
    expect(isValidFieldPath('a.__lookupSetter__')).toBe(false);
    expect(isValidFieldPath('__')).toBe(false);
    expect(isValidFieldPath('a.__.b')).toBe(false);
  });

  it('rejects constructor and prototype segments', () => {
    expect(isValidFieldPath('constructor')).toBe(false);
    expect(isValidFieldPath('a.constructor')).toBe(false);
    expect(isValidFieldPath('constructor.a')).toBe(false);
    expect(isValidFieldPath('prototype')).toBe(false);
    expect(isValidFieldPath('a.prototype')).toBe(false);
    expect(isValidFieldPath('prototype.a')).toBe(false);
  });

  it('allows segments containing but not matching reserved words', () => {
    expect(isValidFieldPath('constructorName')).toBe(true);
    expect(isValidFieldPath('prototypeChain')).toBe(true);
    expect(isValidFieldPath('a.myConstructor')).toBe(true);
  });
});

describe('getTopLevelSection', () => {
  it('returns first segment of a dot path', () => {
    expect(getTopLevelSection('interface.modelSelect')).toBe('interface');
    expect(getTopLevelSection('registration.socialLogins.github')).toBe('registration');
  });

  it('returns the whole string when no dots', () => {
    expect(getTopLevelSection('interface')).toBe('interface');
  });
});

describe('assertOverridePathsAllowed', () => {
  it('allows any path on base config principal', () => {
    const result = assertOverridePathsAllowed(PrincipalType.ROLE, '__base__', [
      'modelSpecs.enforce',
      'interface.parameters',
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('allows skills and prompts on tenant scope', () => {
    expect(
      assertOverridePathsAllowed(PrincipalType.TENANT, 'tenant-1', ['interface.skills.use']),
    ).toEqual({ ok: true });
    expect(
      assertOverridePathsAllowed(PrincipalType.TENANT, 'tenant-1', ['interface.prompts.create']),
    ).toEqual({ ok: true });
  });

  it('rejects modelSpecs and parameters on non-base scopes', () => {
    expect(assertOverridePathsAllowed(PrincipalType.GROUP, 'g1', ['modelSpecs.enforce']).ok).toBe(
      false,
    );
    expect(assertOverridePathsAllowed(PrincipalType.USER, 'u1', ['interface.parameters']).ok).toBe(
      false,
    );
  });

  it('rejects paths outside skills and prompts on non-base scopes', () => {
    const result = assertOverridePathsAllowed(PrincipalType.TENANT, 't1', [
      'interface.modelSelect',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFIG_SCOPE_FORBIDDEN');
    }
  });
});
