const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml');
const { findUser, createUser, updateUser } = require('~/models');
const { setupSaml, getCertificateContent } = require('./samlStrategy');

// --- Mocks ---
jest.mock('fs');
jest.mock('path');
jest.mock('node-fetch');
jest.mock('@node-saml/passport-saml');
jest.mock('~/models', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({
  config: {
    registration: {
      socialLogins: ['saml'],
    },
  },
  getBalanceConfig: jest.fn().mockResolvedValue({
    tokenCredits: 1000,
    startingBalance: 1000,
  }),
}));
jest.mock('~/server/services/Config/EndpointService', () => ({
  config: {},
}));
jest.mock('~/server/utils', () => ({
  isEnabled: jest.fn(() => false),
  isUserProvided: jest.fn(() => false),
}));
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: jest.fn().mockResolvedValue('/fake/path/to/avatar.png'),
  })),
}));
jest.mock('~/server/utils/crypto', () => ({
  hashToken: jest.fn().mockResolvedValue('hashed-token'),
}));
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// To capture the verify callback from the strategy, we grab it from the mock constructor
let verifyCallback;
SamlStrategy.mockImplementation((options, verify) => {
  verifyCallback = verify;
  return { name: 'saml', options, verify };
});

describe('getCertificateContent', () => {
  const certWithHeader = `-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUKhXaFJGJJPx466rlwYORIsqCq7MwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNTAzMDQwODUxNTJaFw0yNjAz
MDQwODUxNTJaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCWP09NZg0xaRiLpNygCVgV3M+4RFW2S0c5X/fg/uFT
O5MfaVYzG5GxzhXzWRB8RtNPsxX/nlbPsoUroeHbz+SABkOsNEv6JuKRH4VXRH34
VzjazVkPAwj+N4WqsC/Wo4EGGpKIGeGi8Zed4yvMqoTyE3mrS19fY0nMHT62wUwS
GMm2pAQdAQePZ9WY7A5XOA1IoxW2Zh2Oxaf1p59epBkZDhoxSMu8GoSkvK27Km4A
4UXftzdg/wHNPrNirmcYouioHdmrOtYxPjrhUBQ74AmE1/QK45B6wEgirKH1A1AW
6C+ApLwpBMvy9+8Gbyvc8G18W3CjdEVKmAeWb9JUedSXAgMBAAGjUzBRMB0GA1Ud
DgQWBBRxpaqBx8VDLLc8IkHATujj8IOs6jAfBgNVHSMEGDAWgBRxpaqBx8VDLLc8
IkHATujj8IOs6jAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBc
Puk6i+yowwGccB3LhfxZ+Fz6s6/Lfx6bP/Hy4NYOxmx2/awGBgyfp1tmotjaS9Cf
FWd67LuEru4TYtz12RNMDBF5ypcEfibvb3I8O6igOSQX/Jl5D2pMChesZxhmCift
Qp09T41MA8PmHf1G9oMG0A3ZnjKDG5ebaJNRFImJhMHsgh/TP7V3uZy7YHTgopKX
Hv63V3Uo3Oihav29Q7urwmf7Ly7X7J2WE86/w3vRHi5dhaWWqEqxmnAXl+H+sG4V
meeVRI332bg1Nuy8KnnX8v3ZeJzMBkAhzvSr6Ri96R0/Un/oEFwVC5jDTq8sXVn6
u7wlOSk+oFzDIO/UILIA
-----END CERTIFICATE-----`;

  const certWithoutHeader = certWithHeader
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  it('should throw an error if SAML_CERT is not set', () => {
    process.env.SAML_CERT;
    expect(() => getCertificateContent(process.env.SAML_CERT)).toThrow(
      'Invalid input: SAML_CERT must be a string.',
    );
  });

  it('should throw an error if SAML_CERT is empty', () => {
    process.env.SAML_CERT = '';
    expect(() => getCertificateContent(process.env.SAML_CERT)).toThrow(
      'Invalid cert: SAML_CERT must be a valid file path or certificate string.',
    );
  });

  it('should load cert from an environment variable if it is a single-line string(with header)', () => {
    process.env.SAML_CERT = certWithHeader;

    const actual = getCertificateContent(process.env.SAML_CERT);
    expect(actual).toBe(certWithHeader);
  });

  it('should load cert from an environment variable if it is a single-line string(with no header)', () => {
    process.env.SAML_CERT = certWithoutHeader;

    const actual = getCertificateContent(process.env.SAML_CERT);
    expect(actual).toBe(certWithoutHeader);
  });

  it('should throw an error if SAML_CERT is a single-line string (with header, no newline characters)', () => {
    process.env.SAML_CERT = certWithHeader.replace(/\n/g, '');
    expect(() => getCertificateContent(process.env.SAML_CERT)).toThrow(
      'Invalid cert: SAML_CERT must be a valid file path or certificate string.',
    );
  });

  it('should load cert from a relative file path if SAML_CERT is valid', () => {
    process.env.SAML_CERT = 'test.pem';
    const resolvedPath = '/absolute/path/to/test.pem';

    path.isAbsolute.mockReturnValue(false);
    path.join.mockReturnValue(resolvedPath);
    path.normalize.mockReturnValue(resolvedPath);

    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockReturnValue(certWithHeader);

    const actual = getCertificateContent(process.env.SAML_CERT);
    expect(actual).toBe(certWithHeader);
  });

  it('should load cert from an absolute file path if SAML_CERT is valid', () => {
    process.env.SAML_CERT = '/absolute/path/to/test.pem';

    path.isAbsolute.mockReturnValue(true);
    path.normalize.mockReturnValue(process.env.SAML_CERT);

    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockReturnValue(certWithHeader);

    const actual = getCertificateContent(process.env.SAML_CERT);
    expect(actual).toBe(certWithHeader);
  });

  it('should throw an error if the file does not exist', () => {
    process.env.SAML_CERT = 'missing.pem';
    const resolvedPath = '/absolute/path/to/missing.pem';

    path.isAbsolute.mockReturnValue(false);
    path.join.mockReturnValue(resolvedPath);
    path.normalize.mockReturnValue(resolvedPath);

    fs.existsSync.mockReturnValue(false);

    expect(() => getCertificateContent(process.env.SAML_CERT)).toThrow(
      'Invalid cert: SAML_CERT must be a valid file path or certificate string.',
    );
  });

  it('should throw an error if the file is not readable', () => {
    process.env.SAML_CERT = 'unreadable.pem';
    const resolvedPath = '/absolute/path/to/unreadable.pem';

    path.isAbsolute.mockReturnValue(false);
    path.join.mockReturnValue(resolvedPath);
    path.normalize.mockReturnValue(resolvedPath);

    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    expect(() => getCertificateContent(process.env.SAML_CERT)).toThrow(
      'Error reading certificate file: Permission denied',
    );
  });
});

describe('setupSaml', () => {
  // Helper to wrap the verify callback in a promise
  const validate = (profile) =>
    new Promise((resolve, reject) => {
      verifyCallback(profile, (err, user, details) => {
        if (err) {
          reject(err);
        } else {
          resolve({ user, details });
        }
      });
    });

  const baseProfile = {
    nameID: 'saml-1234',
    email: 'test@example.com',
    given_name: 'First',
    family_name: 'Last',
    name: 'My Full Name',
    username: 'flast',
    picture: 'https://example.com/avatar.png',
    custom_name: 'custom',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Configure mocks
    const { findUser, createUser, updateUser } = require('~/models');
    findUser.mockResolvedValue(null);
    createUser.mockImplementation(async (userData) => ({
      _id: 'mock-user-id',
      ...userData,
    }));
    updateUser.mockImplementation(async (id, userData) => ({
      _id: id,
      ...userData,
    }));

    const cert = `
-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUKhXaFJGJJPx466rlwYORIsqCq7MwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNVBAoM
GEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNTAzMDQwODUxNTJaFw0yNjAz
MDQwODUxNTJaMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEw
HwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCWP09NZg0xaRiLpNygCVgV3M+4RFW2S0c5X/fg/uFT
O5MfaVYzG5GxzhXzWRB8RtNPsxX/nlbPsoUroeHbz+SABkOsNEv6JuKRH4VXRH34
VzjazVkPAwj+N4WqsC/Wo4EGGpKIGeGi8Zed4yvMqoTyE3mrS19fY0nMHT62wUwS
GMm2pAQdAQePZ9WY7A5XOA1IoxW2Zh2Oxaf1p59epBkZDhoxSMu8GoSkvK27Km4A
4UXftzdg/wHNPrNirmcYouioHdmrOtYxPjrhUBQ74AmE1/QK45B6wEgirKH1A1AW
6C+ApLwpBMvy9+8Gbyvc8G18W3CjdEVKmAeWb9JUedSXAgMBAAGjUzBRMB0GA1Ud
DgQWBBRxpaqBx8VDLLc8IkHATujj8IOs6jAfBgNVHSMEGDAWgBRxpaqBx8VDLLc8
IkHATujj8IOs6jAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBc
Puk6i+yowwGccB3LhfxZ+Fz6s6/Lfx6bP/Hy4NYOxmx2/awGBgyfp1tmotjaS9Cf
FWd67LuEru4TYtz12RNMDBF5ypcEfibvb3I8O6igOSQX/Jl5D2pMChesZxhmCift
Qp09T41MA8PmHf1G9oMG0A3ZnjKDG5ebaJNRFImJhMHsgh/TP7V3uZy7YHTgopKX
Hv63V3Uo3Oihav29Q7urwmf7Ly7X7J2WE86/w3vRHi5dhaWWqEqxmnAXl+H+sG4V
meeVRI332bg1Nuy8KnnX8v3ZeJzMBkAhzvSr6Ri96R0/Un/oEFwVC5jDTq8sXVn6
u7wlOSk+oFzDIO/UILIA
-----END CERTIFICATE-----
    `;

    // Reset environment variables
    process.env.SAML_ENTRY_POINT = 'https://example.com/saml';
    process.env.SAML_ISSUER = 'saml-issuer';
    process.env.SAML_CERT = cert;
    process.env.SAML_CALLBACK_URL = '/oauth/saml/callback';
    delete process.env.SAML_EMAIL_CLAIM;
    delete process.env.SAML_USERNAME_CLAIM;
    delete process.env.SAML_GIVEN_NAME_CLAIM;
    delete process.env.SAML_FAMILY_NAME_CLAIM;
    delete process.env.SAML_PICTURE_CLAIM;
    delete process.env.SAML_NAME_CLAIM;

    // Simulate image download
    const fakeBuffer = Buffer.from('fake image');
    fetch.mockResolvedValue({
      ok: true,
      buffer: jest.fn().mockResolvedValue(fakeBuffer),
    });

    await setupSaml();
  });

  it('should create a new user with correct username when username claim exists', async () => {
    const profile = { ...baseProfile };
    const { user } = await validate(profile);

    expect(user.username).toBe(profile.username);
    expect(user.provider).toBe('saml');
    expect(user.samlId).toBe(profile.nameID);
    expect(user.email).toBe(profile.email);
    expect(user.name).toBe(`${profile.given_name} ${profile.family_name}`);
  });

  it('should use given_name as username when username claim is missing', async () => {
    const profile = { ...baseProfile };
    delete profile.username;
    const expectUsername = profile.given_name;

    const { user } = await validate(profile);

    expect(user.username).toBe(expectUsername);
    expect(user.provider).toBe('saml');
  });

  it('should use email as username when username and given_name are missing', async () => {
    const profile = { ...baseProfile };
    delete profile.username;
    delete profile.given_name;
    const expectUsername = profile.email;

    const { user } = await validate(profile);

    expect(user.username).toBe(expectUsername);
    expect(user.provider).toBe('saml');
  });

  it('should override username with SAML_USERNAME_CLAIM when set', async () => {
    process.env.SAML_USERNAME_CLAIM = 'nameID';
    const profile = { ...baseProfile };

    const { user } = await validate(profile);

    expect(user.username).toBe(profile.nameID);
    expect(user.provider).toBe('saml');
  });

  it('should set the full name correctly when given_name and family_name exist', async () => {
    const profile = { ...baseProfile };
    const expectedFullName = `${profile.given_name} ${profile.family_name}`;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should set the full name correctly when given_name exist', async () => {
    const profile = { ...baseProfile };
    delete profile.family_name;
    const expectedFullName = profile.given_name;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should set the full name correctly when family_name exist', async () => {
    const profile = { ...baseProfile };
    delete profile.given_name;
    const expectedFullName = profile.family_name;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should set the full name correctly when username exist', async () => {
    const profile = { ...baseProfile };
    delete profile.family_name;
    delete profile.given_name;
    const expectedFullName = profile.username;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should set the full name correctly when email only exist', async () => {
    const profile = { ...baseProfile };
    delete profile.family_name;
    delete profile.given_name;
    delete profile.username;
    const expectedFullName = profile.email;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should set the full name correctly with SAML_NAME_CLAIM when set', async () => {
    process.env.SAML_NAME_CLAIM = 'custom_name';
    const profile = { ...baseProfile };
    const expectedFullName = profile.custom_name;

    const { user } = await validate(profile);

    expect(user.name).toBe(expectedFullName);
  });

  it('should update an existing user on login', async () => {
    // Set up findUser to return an existing user
    const { findUser } = require('~/models');
    const existingUser = {
      _id: 'existing-user-id',
      provider: 'local',
      email: baseProfile.email,
      samlId: '',
      username: 'oldusername',
      name: 'Old Name',
    };
    findUser.mockResolvedValue(existingUser);

    const profile = { ...baseProfile };
    const { user } = await validate(profile);

    expect(user.provider).toBe('saml');
    expect(user.samlId).toBe(baseProfile.nameID);
    expect(user.username).toBe(baseProfile.username);
    expect(user.name).toBe(`${baseProfile.given_name} ${baseProfile.family_name}`);
    expect(user.email).toBe(baseProfile.email);
  });

  it('should attempt to download and save the avatar if picture is provided', async () => {
    const profile = { ...baseProfile };

    const { user } = await validate(profile);

    expect(fetch).toHaveBeenCalled();
    expect(user.avatar).toBe('/fake/path/to/avatar.png');
  });

  it('should not attempt to download avatar if picture is not provided', async () => {
    const profile = { ...baseProfile };
    delete profile.picture;

    await validate(profile);

    expect(fetch).not.toHaveBeenCalled();
  });
});
