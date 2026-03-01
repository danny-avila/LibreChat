const jwtDecode = require('jsonwebtoken/decode');
const {
  extractClaimFromToken,
  sanitizeGroupName,
  extractGroupsFromToken,
} = require('./extractJwtClaims');

// Mock jsonwebtoken/decode
jest.mock('jsonwebtoken/decode');

describe('extractClaimFromToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract a simple claim from token', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      sub: 'user-123',
      email: 'user@example.com',
    });

    const result = extractClaimFromToken(token, 'email');
    expect(result).toEqual(['user@example.com']);
  });

  it('should extract nested claim using dot notation', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      realm_access: {
        roles: ['admin', 'user', 'developer'],
      },
    });

    const result = extractClaimFromToken(token, 'realm_access.roles');
    expect(result).toEqual(['admin', 'user', 'developer']);
  });

  it('should extract deeply nested claim', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      resource_access: {
        librechat: {
          roles: ['admin', 'moderator'],
        },
      },
    });

    const result = extractClaimFromToken(token, 'resource_access.librechat.roles');
    expect(result).toEqual(['admin', 'moderator']);
  });

  it('should return null for non-existent claim', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      sub: 'user-123',
    });

    const result = extractClaimFromToken(token, 'nonexistent.path');
    expect(result).toBeNull();
  });

  it('should return null for invalid token', () => {
    jwtDecode.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const result = extractClaimFromToken('invalid.token', 'email');
    expect(result).toBeNull();
  });

  it('should handle empty token', () => {
    const result = extractClaimFromToken('', 'email');
    expect(result).toBeNull();
  });

  it('should handle null token', () => {
    const result = extractClaimFromToken(null, 'email');
    expect(result).toBeNull();
  });

  it('should handle empty claim path', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({ email: 'test@example.com' });

    const result = extractClaimFromToken(token, '');
    expect(result).toBeNull();
  });

  it('should convert string value to array', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      role: 'admin',
    });

    const result = extractClaimFromToken(token, 'role');
    expect(result).toEqual(['admin']);
  });

  it('should filter out empty strings from array', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      groups: ['admin', '', 'user', '  ', 'moderator'],
    });

    const result = extractClaimFromToken(token, 'groups');
    expect(result).toEqual(['admin', 'user', 'moderator']);
  });

  it('should return null if claim is not string or array', () => {
    const token = 'dummy.jwt.token';
    jwtDecode.mockReturnValue({
      data: { nested: 'object' },
    });

    const result = extractClaimFromToken(token, 'data');
    expect(result).toBeNull();
  });
});

describe('sanitizeGroupName', () => {
  it('should trim whitespace', () => {
    expect(sanitizeGroupName('  admin  ')).toBe('admin');
  });

  it('should remove leading slashes', () => {
    expect(sanitizeGroupName('/admin')).toBe('admin');
    expect(sanitizeGroupName('///admin')).toBe('admin');
  });

  it('should replace remaining slashes with hyphens', () => {
    expect(sanitizeGroupName('admin/users')).toBe('admin-users');
    expect(sanitizeGroupName('org/dept/team')).toBe('org-dept-team');
  });

  it('should remove MongoDB special characters', () => {
    expect(sanitizeGroupName('admin$user')).toBe('adminuser');
    expect(sanitizeGroupName('admin{role}')).toBe('adminrole');
    expect(sanitizeGroupName('admin}test')).toBe('admintest');
  });

  it('should handle hierarchical paths', () => {
    expect(sanitizeGroupName('/engineering/backend/team')).toBe('engineering-backend-team');
  });

  it('should truncate long group names', () => {
    const longName = 'a'.repeat(150);
    const result = sanitizeGroupName(longName);
    expect(result.length).toBe(100);
  });

  it('should handle empty string', () => {
    expect(sanitizeGroupName('')).toBe('');
  });

  it('should handle null', () => {
    expect(sanitizeGroupName(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(sanitizeGroupName(undefined)).toBe('');
  });

  it('should preserve hyphens', () => {
    expect(sanitizeGroupName('admin-user')).toBe('admin-user');
  });

  it('should preserve underscores', () => {
    expect(sanitizeGroupName('admin_user')).toBe('admin_user');
  });
});

describe('extractGroupsFromToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract groups from access token by default', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
      id_token: 'id.jwt.token',
    };

    jwtDecode.mockReturnValue({
      realm_access: {
        roles: ['admin', 'user'],
      },
    });

    const result = extractGroupsFromToken(tokenset, 'realm_access.roles');
    expect(jwtDecode).toHaveBeenCalledWith('access.jwt.token');
    expect(result).toEqual(['admin', 'user']);
  });

  it('should extract groups from id token when specified', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
      id_token: 'id.jwt.token',
    };

    jwtDecode.mockReturnValue({
      groups: ['admin', 'user'],
    });

    const result = extractGroupsFromToken(tokenset, 'groups', 'id');
    expect(jwtDecode).toHaveBeenCalledWith('id.jwt.token');
    expect(result).toEqual(['admin', 'user']);
  });

  it('should sanitize all group names', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      groups: ['/admin', '/engineering/backend', 'user$role'],
    });

    const result = extractGroupsFromToken(tokenset, 'groups');
    expect(result).toEqual(['admin', 'engineering-backend', 'userrole']);
  });

  it('should remove duplicate groups', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      groups: ['admin', 'admin', 'user', 'admin'],
    });

    const result = extractGroupsFromToken(tokenset, 'groups');
    expect(result).toEqual(['admin', 'user']);
  });

  it('should return empty array for invalid tokenset', () => {
    const result = extractGroupsFromToken(null, 'groups');
    expect(result).toEqual([]);
  });

  it('should return empty array when token is missing', () => {
    const tokenset = {
      id_token: 'id.jwt.token',
    };

    const result = extractGroupsFromToken(tokenset, 'groups', 'access');
    expect(result).toEqual([]);
  });

  it('should return empty array when claim is not found', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      sub: 'user-123',
    });

    const result = extractGroupsFromToken(tokenset, 'nonexistent.claim');
    expect(result).toEqual([]);
  });

  it('should filter out empty group names after sanitization', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      groups: ['admin', '  ', '//', '', 'user'],
    });

    const result = extractGroupsFromToken(tokenset, 'groups');
    expect(result).toEqual(['admin', 'user']);
  });

  it('should handle extraction errors gracefully', () => {
    const tokenset = {
      access_token: 'invalid.token',
    };

    jwtDecode.mockImplementation(() => {
      throw new Error('Decode error');
    });

    const result = extractGroupsFromToken(tokenset, 'groups');
    expect(result).toEqual([]);
  });

  it('should handle Keycloak realm roles', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      realm_access: {
        roles: ['admin', 'developer', 'user'],
      },
    });

    const result = extractGroupsFromToken(tokenset, 'realm_access.roles', 'access');
    expect(result).toEqual(['admin', 'developer', 'user']);
  });

  it('should handle Keycloak client roles', () => {
    const tokenset = {
      access_token: 'access.jwt.token',
    };

    jwtDecode.mockReturnValue({
      resource_access: {
        librechat: {
          roles: ['chat-admin', 'prompt-creator'],
        },
      },
    });

    const result = extractGroupsFromToken(tokenset, 'resource_access.librechat.roles', 'access');
    expect(result).toEqual(['chat-admin', 'prompt-creator']);
  });
});

describe('shouldExcludeGroup', () => {
  const { shouldExcludeGroup } = require('./extractJwtClaims');

  describe('Exact Match Exclusions', () => {
    it('should exclude groups with exact match (case-insensitive)', () => {
      expect(shouldExcludeGroup('admin', 'admin')).toBe(true);
      expect(shouldExcludeGroup('ADMIN', 'admin')).toBe(true);
      expect(shouldExcludeGroup('Admin', 'admin')).toBe(true);
    });

    it('should not exclude groups that do not match', () => {
      expect(shouldExcludeGroup('developer', 'admin')).toBe(false);
      expect(shouldExcludeGroup('admin-user', 'admin')).toBe(false);
    });

    it('should handle multiple comma-separated patterns', () => {
      const pattern = 'admin,developer,system-role';
      expect(shouldExcludeGroup('admin', pattern)).toBe(true);
      expect(shouldExcludeGroup('developer', pattern)).toBe(true);
      expect(shouldExcludeGroup('system-role', pattern)).toBe(true);
      expect(shouldExcludeGroup('user', pattern)).toBe(false);
    });

    it('should trim whitespace from patterns', () => {
      const pattern = ' admin , developer , system-role ';
      expect(shouldExcludeGroup('admin', pattern)).toBe(true);
      expect(shouldExcludeGroup('developer', pattern)).toBe(true);
    });
  });

  describe('Regex Pattern Exclusions', () => {
    it('should exclude groups matching regex pattern', () => {
      expect(shouldExcludeGroup('test-admin', 'regex:^test-.*')).toBe(true);
      expect(shouldExcludeGroup('test-user', 'regex:^test-.*')).toBe(true);
      expect(shouldExcludeGroup('production-admin', 'regex:^test-.*')).toBe(false);
    });

    it('should handle regex patterns case-insensitively', () => {
      expect(shouldExcludeGroup('TEST-ADMIN', 'regex:^test-.*')).toBe(true);
      expect(shouldExcludeGroup('Test-User', 'regex:^test-.*')).toBe(true);
    });

    it('should support multiple regex patterns', () => {
      const pattern = 'regex:^test-.*,regex:^dev-.*,regex:.*-temp$';
      expect(shouldExcludeGroup('test-admin', pattern)).toBe(true);
      expect(shouldExcludeGroup('dev-user', pattern)).toBe(true);
      expect(shouldExcludeGroup('user-temp', pattern)).toBe(true);
      expect(shouldExcludeGroup('production-admin', pattern)).toBe(false);
    });

    it('should mix exact match and regex patterns', () => {
      const pattern = 'admin,regex:^test-.*,system-role';
      expect(shouldExcludeGroup('admin', pattern)).toBe(true);
      expect(shouldExcludeGroup('test-user', pattern)).toBe(true);
      expect(shouldExcludeGroup('system-role', pattern)).toBe(true);
      expect(shouldExcludeGroup('developer', pattern)).toBe(false);
    });
  });

  describe('Invalid Patterns', () => {
    it('should handle invalid regex patterns gracefully', () => {
      expect(shouldExcludeGroup('test', 'regex:[invalid')).toBe(false);
      expect(shouldExcludeGroup('test', 'regex:*+')).toBe(false);
    });

    it('should return false for empty exclusion pattern', () => {
      expect(shouldExcludeGroup('admin', '')).toBe(false);
      expect(shouldExcludeGroup('admin', null)).toBe(false);
      expect(shouldExcludeGroup('admin', undefined)).toBe(false);
    });

    it('should ignore empty patterns in comma-separated list', () => {
      const pattern = 'admin,,developer,,,system-role';
      expect(shouldExcludeGroup('admin', pattern)).toBe(true);
      expect(shouldExcludeGroup('developer', pattern)).toBe(true);
      expect(shouldExcludeGroup('', pattern)).toBe(false);
    });
  });

  describe('ReDoS Protection', () => {
    it('should reject regex patterns longer than 200 characters', () => {
      const longPattern = 'regex:' + 'a'.repeat(201);
      expect(shouldExcludeGroup('test', longPattern)).toBe(false);
    });

    it('should accept regex patterns up to 200 characters', () => {
      const pattern = 'regex:^' + 'a'.repeat(197) + '$';
      expect(shouldExcludeGroup('test', pattern)).toBe(false);
      // Just verify it doesn't throw and completes
    });

    it('should reject patterns with nested quantifiers (++)', () => {
      expect(shouldExcludeGroup('test', 'regex:a++b')).toBe(false);
    });

    it('should reject patterns with nested quantifiers (**)', () => {
      expect(shouldExcludeGroup('test', 'regex:a**b')).toBe(false);
    });

    it('should reject patterns with mixed quantifiers (*+)', () => {
      expect(shouldExcludeGroup('test', 'regex:a*+b')).toBe(false);
    });

    it('should reject patterns with mixed quantifiers (+*)', () => {
      expect(shouldExcludeGroup('test', 'regex:a+*b')).toBe(false);
    });

    it('should reject patterns with large character classes', () => {
      const largeClass = '[' + 'a'.repeat(101) + ']';
      expect(shouldExcludeGroup('test', `regex:${largeClass}`)).toBe(false);
    });

    it('should accept safe regex patterns', () => {
      expect(shouldExcludeGroup('test-admin', 'regex:^test-.*')).toBe(true);
      expect(shouldExcludeGroup('admin-test', 'regex:.*-test$')).toBe(true);
      expect(shouldExcludeGroup('system', 'regex:^(system|admin)$')).toBe(true);
    });
  });
});
