const fs = require('fs');
const fetch = require('node-fetch');
const { Strategy: SamlStrategy } = require('passport-saml');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { setupSaml, getMetadata } = require('./samlStrategy');

// --- Mocks ---
jest.mock('fs');
jest.mock('node-fetch');
jest.mock('passport-saml');
jest.mock('~/models/userMethods', () => ({
  findUser: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}));
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    saveBuffer: jest.fn().mockResolvedValue('/fake/path/to/avatar.png'),
  })),
}));
jest.mock('~/server/utils/crypto', () => ({
  hashToken: jest.fn().mockResolvedValue('hashed-token'),
}));
jest.mock('~/server/utils', () => ({
  isEnabled: jest.fn(() => false),
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

describe('getMetadata', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SAML_METADATA;
  });

  it('should throw an error if SAML_METADATA is not set', () => {
    expect(() => getMetadata()).toThrow('SAML_METADATA environment variable is not set.');
  });

  it('should throw an error if SAML_METADATA is empty', () => {
    process.env.SAML_METADATA = '';
    expect(() => getMetadata()).toThrow('SAML_METADATA environment variable is not set.');
  });

  it('should load metadata from a file if SAML_METADATA is a valid file path', () => {
    process.env.SAML_METADATA = 'metadata.xml';
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockReturnValue('<EntityDescriptor entityID="test"></EntityDescriptor>');

    const metadata = getMetadata();
    expect(metadata).toBe('<EntityDescriptor entityID="test"></EntityDescriptor>');
  });

  it('should load metadata from an environment variable if it is a valid XML string', () => {
    process.env.SAML_METADATA = '<EntityDescriptor entityID="test"></EntityDescriptor>';

    const metadata = getMetadata();
    expect(metadata).toBe('<EntityDescriptor entityID="test"></EntityDescriptor>');
  });

  it('should throw an error if the file does not exist', () => {
    process.env.SAML_METADATA = 'nonexistent.xml';
    fs.existsSync.mockReturnValue(false);

    expect(() => getMetadata()).toThrow(
      'Error: Invalid SAML metadata.\n' +
        'The content provided is not valid XML.\n' +
        'Ensure that SAML_METADATA contains either a valid XML file path or a correct XML string.',
    );
  });

  it('should throw an error if SAML_METADATA contains invalid XML', () => {
    process.env.SAML_METADATA = 'invalid metadata';
    expect(() => getMetadata()).toThrow(
      'Error: Invalid SAML metadata.\n' +
        'The content provided is not valid XML.\n' +
        'Ensure that SAML_METADATA contains either a valid XML file path or a correct XML string.',
    );
  });

  it('should log messages when loading metadata from file', () => {
    process.env.SAML_METADATA = 'metadata.xml';
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ isFile: () => true });
    fs.readFileSync.mockReturnValue('<EntityDescriptor entityID="test"></EntityDescriptor>');

    getMetadata();
    expect(require('~/config').logger.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^(\[samlStrategy\] Loading SAML metadata from file: .*metadata\.xml)$/,
      ),
    );
  });

  it('should log messages when using inline metadata', () => {
    process.env.SAML_METADATA = '<EntityDescriptor entityID="test"></EntityDescriptor>';
    fs.existsSync.mockReturnValue(false);
    fs.statSync.mockReturnValue({ isFile: () => false });
    getMetadata();
    expect(require('~/config').logger.info).toHaveBeenCalledWith(
      '[samlStrategy] SAML metadata provided as an inline XML string.',
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

    const metadata = `
<EntityDescriptor entityID="urn:test-xxxxxxxxxxxx.example.com" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
    <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <KeyDescriptor use="signing">
        <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
            <X509Data>
            <X509Certificate>xxxxxCERTxxxxxxx</X509Certificate>
            </X509Data>
        </KeyInfo>
        </KeyDescriptor>
        <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://test-xxxxxxxxxxxx.example.com/samlp/aaaaaaaaaaaaaaaaa/logout"/>
        <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://test-xxxxxxxxxxxx.example.com/samlp/aaaaaaaaaaaaaaaaa/logout"/>
        <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
        <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</NameIDFormat>
        <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</NameIDFormat>
        <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://test-xxxxxxxxxxxx.example.com/samlp/aaaaaaaaaaaaaaaaa"/>
        <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://test-xxxxxxxxxxxx.example.com/samlp/aaaaaaaaaaaaaaaaa"/>
        <Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="E-Mail Address" xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>
        <Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="Given Name" xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>
        <Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="Name" xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>
        <Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="Surname" xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>
        <Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="Name ID" xmlns="urn:oasis:names:tc:SAML:2.0:assertion"/>
    </IDPSSODescriptor>
</EntityDescriptor>
    `;

    // Reset environment variables
    process.env.SAML_METADATA = metadata;
    process.env.SAML_CALLBACK_URL = '/oauth/saml/callback';
    delete process.env.SAML_EMAIL_CLAIM;
    delete process.env.SAML_USERNAME_CLAIM;
    delete process.env.SAML_GIVEN_NAME_CLAIM;
    delete process.env.SAML_FAMILY_NAME_CLAIM;
    delete process.env.SAML_PICTURE_CLAIM;
    delete process.env.SAML_NAME_CLAIM;

    findUser.mockResolvedValue(null);
    createUser.mockImplementation(async (userData) => ({
      _id: 'newUserId',
      ...userData,
    }));
    updateUser.mockImplementation(async (id, userData) => ({
      _id: id,
      ...userData,
    }));

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
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'saml',
        samlId: profile.nameID,
        username: profile.username,
        email: profile.email,
        name: `${profile.given_name} ${profile.family_name}`,
      }),
      true,
      true,
    );
  });

  it('should use given_name as username when username claim is missing', async () => {
    const profile = { ...baseProfile };
    delete profile.username;
    const expectUsername = profile.given_name;

    const { user } = await validate(profile);

    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should use email as username when username and given_name are missing', async () => {
    const profile = { ...baseProfile };
    delete profile.username;
    delete profile.given_name;
    const expectUsername = profile.email;

    const { user } = await validate(profile);

    expect(user.username).toBe(expectUsername);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: expectUsername }),
      true,
      true,
    );
  });

  it('should override username with SAML_USERNAME_CLAIM when set', async () => {
    process.env.SAML_USERNAME_CLAIM = 'nameID';
    const profile = { ...baseProfile };

    const { user } = await validate(profile);

    expect(user.username).toBe(profile.nameID);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: profile.nameID }),
      true,
      true,
    );
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
    const existingUser = {
      _id: 'existingUserId',
      provider: 'local',
      email: baseProfile.email,
      samlId: '',
      username: '',
      name: '',
    };

    findUser.mockImplementation(async (query) => {
      if (query.samlId === baseProfile.nameID || query.email === baseProfile.email) {
        return existingUser;
      }
      return null;
    });

    const profile = { ...baseProfile };
    await validate(profile);

    expect(updateUser).toHaveBeenCalledWith(
      existingUser._id,
      expect.objectContaining({
        provider: 'saml',
        samlId: baseProfile.nameID,
        username: baseProfile.username,
        name: `${baseProfile.given_name} ${baseProfile.family_name}`,
      }),
    );
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
