const request = require('supertest');
const express = require('express');
const { getLdapConfig } = require('~/server/services/Config/ldap');
const { isEnabled } = require('~/server/utils');

jest.mock('~/server/services/Config/ldap');
jest.mock('~/server/utils');

const app = express();

// Mock the route handler
app.get('/api/config', (req, res) => {
  const ldapConfig = getLdapConfig();
  res.json({ ldap: ldapConfig });
});

describe('LDAP Config Tests', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return LDAP config with username property when LDAP_LOGIN_USES_USERNAME is enabled', async () => {
    getLdapConfig.mockReturnValue({ enabled: true, username: true });
    isEnabled.mockReturnValue(true);

    const response = await request(app).get('/api/config');

    expect(response.statusCode).toBe(200);
    expect(response.body.ldap).toEqual({
      enabled: true,
      username: true,
    });
  });

  it('should return LDAP config without username property when LDAP_LOGIN_USES_USERNAME is not enabled', async () => {
    getLdapConfig.mockReturnValue({ enabled: true });
    isEnabled.mockReturnValue(false);

    const response = await request(app).get('/api/config');

    expect(response.statusCode).toBe(200);
    expect(response.body.ldap).toEqual({
      enabled: true,
    });
  });

  it('should not return LDAP config when LDAP is not enabled', async () => {
    getLdapConfig.mockReturnValue(undefined);

    const response = await request(app).get('/api/config');

    expect(response.statusCode).toBe(200);
    expect(response.body.ldap).toBeUndefined();
  });
});
