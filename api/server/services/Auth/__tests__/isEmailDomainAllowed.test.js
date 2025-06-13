const { isEmailDomainAllowed } = require('~/server/services/Auth/isEmailDomainAllowed');

describe('isEmailDomainAllowed', () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com,outlook.com,yahoo.com';
  });

  afterEach(() => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
  });

  it('should return false if email is falsy', async () => {
    expect(await isEmailDomainAllowed(null)).toBe(false);
    expect(await isEmailDomainAllowed(undefined)).toBe(false);
    expect(await isEmailDomainAllowed('')).toBe(false);
  });

  it('should return true if ALLOWED_EMAIL_DOMAINS is not set', async () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(await isEmailDomainAllowed('test@anydomain.com')).toBe(true);
  });

  it('should return false if email has no domain', async () => {
    expect(await isEmailDomainAllowed('test')).toBe(false);
    expect(await isEmailDomainAllowed('test@')).toBe(false);
  });

  it('should return true for allowed domains', async () => {
    expect(await isEmailDomainAllowed('test@gmail.com')).toBe(true);
    expect(await isEmailDomainAllowed('test@outlook.com')).toBe(true);
    expect(await isEmailDomainAllowed('test@yahoo.com')).toBe(true);
  });

  it('should return false for non-allowed domains', async () => {
    expect(await isEmailDomainAllowed('test@hotmail.com')).toBe(false);
    expect(await isEmailDomainAllowed('test@example.com')).toBe(false);
  });

  it('should be case insensitive', async () => {
    expect(await isEmailDomainAllowed('test@GMAIL.com')).toBe(true);
    expect(await isEmailDomainAllowed('test@Outlook.COM')).toBe(true);
  });

  it('should handle whitespace in ALLOWED_EMAIL_DOMAINS', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = ' gmail.com , outlook.com , yahoo.com ';
    expect(await isEmailDomainAllowed('test@gmail.com')).toBe(true);
    expect(await isEmailDomainAllowed('test@outlook.com')).toBe(true);
  });
}); 