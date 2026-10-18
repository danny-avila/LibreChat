import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  toSafeRedirect,
  scopeParamKey,
  parseScopeParam,
  findScopeByParam,
  formatScopeParam,
} from './navigation';

describe('toSafeRedirect', () => {
  it('keeps in-app paths with their search string', () => {
    expect(toSafeRedirect('/configuration?tab=system&scope=role:USER')).toBe(
      '/configuration?tab=system&scope=role:USER',
    );
    expect(toSafeRedirect('/')).toBe('/');
  });

  it('falls back to / for anything that could leave the app', () => {
    for (const value of [
      undefined,
      '',
      'https://evil.example',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      'configuration',
    ]) {
      expect(toSafeRedirect(value)).toBe('/');
    }
  });
});

const scopes: t.ConfigScope[] = [
  {
    _id: '6ac389091d80b33fce8dfe8e',
    principalType: PrincipalType.ROLE,
    principalId: 'USER',
    name: 'USER',
    priority: 10,
    isActive: true,
  },
  {
    _id: '6ac38909aaaaaaaaaaaaaaaa',
    principalType: PrincipalType.GROUP,
    principalId: 'g1',
    name: 'Engineering',
    priority: 20,
    isActive: true,
  },
];

describe('scope params', () => {
  it('parses principal forms and legacy ids', () => {
    expect(parseScopeParam('role:USER')).toEqual({
      kind: 'principal',
      principalType: 'role',
      principalId: 'USER',
    });
    expect(parseScopeParam('group:a:b')).toEqual({
      kind: 'principal',
      principalType: 'group',
      principalId: 'a:b',
    });
    expect(parseScopeParam('6ac389091d80b33fce8dfe8e')).toEqual({
      kind: 'id',
      id: '6ac389091d80b33fce8dfe8e',
    });
    expect(parseScopeParam('public:x')).toEqual({ kind: 'id', id: 'public:x' });
    expect(parseScopeParam(undefined)).toBeNull();
    expect(parseScopeParam('')).toBeNull();
  });

  it('formats a profile as type:id and finds it by either form', () => {
    expect(formatScopeParam(scopes[1])).toBe('group:g1');
    expect(findScopeByParam(scopes, parseScopeParam('role:USER')!)?.name).toBe('USER');
    expect(findScopeByParam(scopes, parseScopeParam('6ac38909aaaaaaaaaaaaaaaa')!)?.name).toBe(
      'Engineering',
    );
    expect(findScopeByParam(scopes, parseScopeParam('role:ADMIN')!)).toBeUndefined();
  });

  it('compares scope params canonically', () => {
    expect(scopeParamKey('role:USER')).toBe(scopeParamKey('role:USER'));
    expect(scopeParamKey(undefined)).toBeUndefined();
    expect(scopeParamKey('role:USER')).not.toBe(scopeParamKey('role:ADMIN'));
  });
});
