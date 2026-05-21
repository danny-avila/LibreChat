const { z } = require('zod');

const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH, 10) || 8;

const allowedCharactersRegex = new RegExp(
  '^[' +
    'a-zA-Z0-9_.@#$%&*()' + // Basic Latin characters and symbols
    '\\p{Script=Latin}' + // Latin script characters
    '\\p{Script=Common}' + // Characters common across scripts
    '\\p{Script=Cyrillic}' + // Cyrillic script for Russian, etc.
    '\\p{Script=Devanagari}' + // Devanagari script for Hindi, etc.
    '\\p{Script=Han}' + // Han script for Chinese characters, etc.
    '\\p{Script=Arabic}' + // Arabic script
    '\\p{Script=Hiragana}' + // Hiragana script for Japanese
    '\\p{Script=Katakana}' + // Katakana script for Japanese
    '\\p{Script=Hangul}' + // Hangul script for Korean
    ']+$', // End of string
  'u', // Use Unicode mode
);
const injectionPatternsRegex = /('|--|\$ne|\$gt|\$lt|\$or|\{|\}|\*|;|<|>|\/|=)/i;

const usernameSchema = z
  .string()
  .min(2)
  .max(80)
  .refine((value) => allowedCharactersRegex.test(value), {
    message: 'Invalid characters in username',
  })
  .refine((value) => !injectionPatternsRegex.test(value), {
    message: 'Potential injection attack detected',
  });

/**
 * The wire field is still named `email` for both login and register requests
 * (synthesized `<username>@${SPE_USERNAME_DOMAIN}` at the frontend before submit
 * for login; synthesized at AuthService.registerUser for register).
 * loginSchema accepts any non-empty short string so the synthesized email passes
 * without an email-format check.
 */
const loginSchema = z.object({
  email: z.string().min(2).max(80),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(128)
    .refine((value) => value.trim().length > 0, {
      message: 'Password cannot be only spaces',
    }),
});

const registerSchema = z
  .object({
    name: z.string().min(3).max(80),
    username: usernameSchema,
    /** Optional on the wire — the Registration form sends only the username.
     *  AuthService.registerUser synthesizes the stored email from the username. */
    email: usernameSchema.optional(),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .max(128)
      .refine((value) => value.trim().length > 0, {
        message: 'Password cannot be only spaces',
      }),
    confirm_password: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .max(128)
      .refine((value) => value.trim().length > 0, {
        message: 'Password cannot be only spaces',
      }),
  })
  .superRefine(({ confirm_password, password }, ctx) => {
    if (confirm_password !== password) {
      ctx.addIssue({
        code: 'custom',
        message: 'The passwords did not match',
      });
    }
  });

const DEFAULT_USERNAME_DOMAIN = 'spe.local';

/**
 * Build the synthetic email stored on the User record from a bare username.
 * Used by AuthService.registerUser; the login path synthesizes client-side.
 */
function synthesizeEmail(username) {
  const domain = process.env.SPE_USERNAME_DOMAIN || DEFAULT_USERNAME_DOMAIN;
  return `${username}@${domain}`;
}

module.exports = {
  loginSchema,
  registerSchema,
  synthesizeEmail,
};
