describe('isEmailDomainAllowed', () => {
  it('should return false if email is falsy', async () => {
    expect(await isEmailDomainAllowed(null)).toBe(false);
    expect(await isEmailDomainAllowed(undefined)).toBe(false);
    expect(await isEmailDomainAllowed('')).toBe(false);
  });
}); 