// file deepcode ignore NoHardcodedPasswords: No hard-coded passwords in tests
const { errorsToString } = require('librechat-data-provider');
const { loginSchema, registerSchema, synthesizeEmail } = require('./validators');

describe('Zod Schemas', () => {
  describe('loginSchema', () => {
    it('should validate a synthesized email (login form output)', () => {
      const result = loginSchema.safeParse({
        email: 'alice@spe.local',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should validate a bare username (no @ required)', () => {
      const result = loginSchema.safeParse({
        email: 'alice',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should invalidate a single-character identifier', () => {
      const result = loginSchema.safeParse({
        email: 'a',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should invalidate an identifier longer than 80 chars', () => {
      const result = loginSchema.safeParse({
        email: 'a'.repeat(81),
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should invalidate a short password', () => {
      const result = loginSchema.safeParse({
        email: 'alice@spe.local',
        password: 'pass',
      });

      expect(result.success).toBe(false);
    });

    it('should invalidate password with only spaces', () => {
      const result = loginSchema.safeParse({
        email: 'alice@spe.local',
        password: '        ',
      });
      expect(result.success).toBe(false);
    });

    it('should invalidate password that is too long', () => {
      const result = loginSchema.safeParse({
        email: 'alice@spe.local',
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
    it('should validate a correct register object (no email field)', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject when username is omitted (username is now required)', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject an empty username', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: '',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should invalidate a short name', () => {
      const result = registerSchema.safeParse({
        name: 'Jo',
        username: 'john_doe',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should handle name with special characters', () => {
      const names = ['Jöhn Dœ', 'John <Doe>'];
      names.forEach((name) => {
        const result = registerSchema.safeParse({
          name,
          username: 'john_doe',
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
        password: 'password123',
        confirm_password: 'password124',
      });
      expect(result.success).toBe(false);
    });

    it('should handle name that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'a'.repeat(81),
        username: 'john_doe',
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle username that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'a'.repeat(81),
        password: 'password123',
        confirm_password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should handle password or confirm_password that is too long', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        password: 'a'.repeat(129),
        confirm_password: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });

    it('should handle password or confirm_password that is just spaces', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        password: '        ',
        confirm_password: '        ',
      });
      expect(result.success).toBe(false);
    });

    it('should handle null values for fields', () => {
      const result = registerSchema.safeParse({
        name: null,
        username: null,
        password: null,
        confirm_password: null,
      });
      expect(result.success).toBe(false);
    });

    it('should handle undefined values for fields', () => {
      const result = registerSchema.safeParse({
        name: undefined,
        username: undefined,
        password: undefined,
        confirm_password: undefined,
      });
      expect(result.success).toBe(false);
    });

    it('should ignore extra fields not defined in the schema', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        password: 'password123',
        confirm_password: 'password123',
        extraField: "I shouldn't be here",
      });
      expect(result.success).toBe(true);
    });

    it('should handle username with special characters from various languages', () => {
      const usernames = [
        'éèäöü',
        'Jöhn.Döe',
        'Jöhn_Ü',
        'Jöhnß',
        'Jéan-Piérre',
        'Élève',
        'Fiançée',
        'Mère',
        'Niño',
        'Señor',
        'Muñoz',
        'João',
        'Coração',
        'Pão',
        'Pietro',
        'Bambino',
        'Forlì',
        'Mâncare',
        'Școală',
        'Țară',
        'Niç',
        'Màquina',
        'Çap',
        'Fjärran',
        'Skål',
        'Öland',
        'Blåbær',
        'Fjord',
        'Årstid',
        'Flød',
        'Søster',
        'Århus',
        'Þór',
        'Ætt',
        'Öx',
        'Şehir',
        'Çocuk',
        'Gözlük',
        'Łódź',
        'Część',
        'Świat',
        'Čaj',
        'Řeka',
        'Život',
        'Kočka',
        'Ľudia',
        'Žaba',
        'Čovjek',
        'Šuma',
        'Tűz',
        'Ősz',
        'Ünnep',
        'Mäki',
        'Yö',
        'Äiti',
        'Tänav',
        'Öö',
        'Ülikool',
        'Ēka',
        'Ūdens',
        'Čempions',
        'Ūsas',
        'Ąžuolas',
        'Čia',
        'Maïs',
        'Geërfd',
        'Coördinatie',
      ];

      const failingUsernames = usernames.reduce((acc, username) => {
        const result = registerSchema.safeParse({
          name: 'John Doe',
          username,
          password: 'password123',
          confirm_password: 'password123',
        });

        if (!result.success) {
          acc.push({ username, error: result.error });
        }

        return acc;
      }, []);

      if (failingUsernames.length > 0) {
        console.log('Failing Usernames:', failingUsernames);
      }
      expect(failingUsernames).toEqual([]);
    });

    it('should reject invalid usernames', () => {
      const invalidUsernames = [
        'john{doe}',
        'j',
        'a'.repeat(81),
        "' OR '1'='1'; --",
        '{$ne: null}',
        '<script>alert("XSS")</script>',
        '"><script>alert("XSS")</script>',
        '"><img src=x onerror=alert("XSS")>',
      ];

      const failingUsernames = invalidUsernames.reduce((acc, username) => {
        const result = registerSchema.safeParse({
          name: 'John Doe',
          username,
          password: 'password123',
          confirm_password: 'password123',
        });

        if (!result.success) {
          acc.push({ username, error: result.error });
        }

        return acc;
      }, []);

      expect(failingUsernames.length).toEqual(invalidUsernames.length);
    });
  });

  describe('errorsToString', () => {
    it('should convert errors to string', () => {
      const { error } = registerSchema.safeParse({
        name: 'Jo',
        username: 'john_doe',
        password: 'password123',
        confirm_password: 'password123',
      });

      const result = errorsToString(error.errors);
      expect(result).toBe('name: String must contain at least 3 character(s)');
    });
  });

  describe('synthesizeEmail', () => {
    const originalDomain = process.env.SPE_USERNAME_DOMAIN;

    afterEach(() => {
      if (originalDomain == null) {
        delete process.env.SPE_USERNAME_DOMAIN;
      } else {
        process.env.SPE_USERNAME_DOMAIN = originalDomain;
      }
    });

    it('appends the default domain when SPE_USERNAME_DOMAIN is unset', () => {
      delete process.env.SPE_USERNAME_DOMAIN;
      expect(synthesizeEmail('alice')).toBe('alice@spe.local');
    });

    it('honours the configured SPE_USERNAME_DOMAIN', () => {
      process.env.SPE_USERNAME_DOMAIN = 'example.test';
      expect(synthesizeEmail('bob')).toBe('bob@example.test');
    });
  });

  describe('MIN_PASSWORD_LENGTH environment variable', () => {
    // Note: These tests verify the behavior based on whatever MIN_PASSWORD_LENGTH
    // was set when the validators module was loaded
    const minLength = parseInt(process.env.MIN_PASSWORD_LENGTH, 10) || 8;

    it('should respect the configured minimum password length for login', () => {
      const resultValid = loginSchema.safeParse({
        email: 'alice@spe.local',
        password: 'a'.repeat(minLength),
      });
      expect(resultValid.success).toBe(true);

      if (minLength > 1) {
        const resultInvalid = loginSchema.safeParse({
          email: 'alice@spe.local',
          password: 'a'.repeat(minLength - 1),
        });
        expect(resultInvalid.success).toBe(false);
      }
    });

    it('should respect the configured minimum password length for registration', () => {
      const resultValid = registerSchema.safeParse({
        name: 'John Doe',
        username: 'john_doe',
        password: 'a'.repeat(minLength),
        confirm_password: 'a'.repeat(minLength),
      });
      expect(resultValid.success).toBe(true);

      if (minLength > 1) {
        const resultInvalid = registerSchema.safeParse({
          name: 'John Doe',
          username: 'john_doe',
          password: 'a'.repeat(minLength - 1),
          confirm_password: 'a'.repeat(minLength - 1),
        });
        expect(resultInvalid.success).toBe(false);
      }
    });

    it('should handle edge case of very short minimum password length', () => {
      if (minLength <= 3) {
        const result = loginSchema.safeParse({
          email: 'alice@spe.local',
          password: 'abc',
        });
        expect(result.success).toBe(minLength <= 3);
      } else {
        expect(true).toBe(true);
      }
    });
  });
});
