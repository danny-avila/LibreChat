const { loginSchema, registerSchema, errorsToString } = require('./validators');

describe('Zod Schemas', () => {
  describe('loginSchema', () => {
    it('should validate a correct login object', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should invalidate an incorrect email', () => {
      const result = loginSchema.safeParse({
        email: 'testexample.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should invalidate a short password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'pass',
      });

      expect(result.success).toBe(false);
    });

    it('should handle email with unusual characters', () => {
      const emails = ['test+alias@example.com', 'test@subdomain.example.co.uk'];
      emails.forEach((email) => {
        const result = loginSchema.safeParse({
          email,
          password: 'password123',
        });
        expect(result.success).toBe(true);
      });
    });

    it('should invalidate email without a domain', () => {
      const result = loginSchema.safeParse({
        email: 'test@.com',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should invalidate password with only spaces', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '        ',
      });
      expect(result.success).toBe(false);
    });

    it('should invalidate password that is too long', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });

    it('should invalidate empty email or password', () => {
      const result = loginSchema.safeParse({
        email: '',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate a correct register object', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should allow the username to be omitted', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should invalidate a short name', () => {
      const result = registerSchema.safeParse({
        name: 'Jo',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should handle empty username by transforming to null', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: '',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.data.username).toBe(null);
    });

    it('should handle name with special characters', () => {
      const names = ['Jöhn Dœ', 'John <Doe>'];
      names.forEach((name) => {
        const result = registerSchema.safeParse({
          name,
          username: 'john_doe',
          email: 'john@example.com',
          password: 'password123',
          confirm_password: 'password123',
        });
        expect(result.success).toBe(true);
      });
    });

    it('should handle username with special characters', () => {
      const usernames = ['john.doe@', 'john..doe'];
      usernames.forEach((username) => {
        const result = registerSchema.safeParse({
          name: 'John Doe',
          username,
          email: 'john@example.com',
          password: 'password123',
          confirm_password: 'password123',
        });
        expect(result.success).toBe(true);
      });
    });

    it('should invalidate mismatched password and confirm_password', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password124',
      });
      expect(result.success).toBe(false);
    });

    it('should handle email without a TLD', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@domain',
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle email with multiple @ symbols', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@domain@com',
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle name that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'a'.repeat(81),
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle username that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'a'.repeat(81),
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle password or confirm_password that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'a'.repeat(129),
        confirm_password: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });

    it('should handle password or confirm_password that is just spaces', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@example.com',
        password: '        ',
        confirm_password: '        ',
      });
      expect(result.success).toBe(false);
    });

    it('should handle null values for fields', () => {
      const result = registerSchema.safeParse({
        name: null,
        username: null,
        email: null,
        password: null,
        confirm_password: null,
      });
      expect(result.success).toBe(false);
    });

    it('should handle undefined values for fields', () => {
      const result = registerSchema.safeParse({
        name: undefined,
        username: undefined,
        email: undefined,
        password: undefined,
        confirm_password: undefined,
      });
      expect(result.success).toBe(false);
    });

    it('should handle extra fields not defined in the schema', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
        extraField: 'I shouldn\'t be here',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('errorsToString', () => {
    it('should convert errors to string', () => {
      const { error } = registerSchema.safeParse({
        name: 'Jo',
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
        confirm_password: 'password123',
      });

      const result = errorsToString(error.errors);
      expect(result).toBe('name: String must contain at least 3 character(s)');
    });
  });
});
