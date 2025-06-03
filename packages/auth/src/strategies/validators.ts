import { z } from 'zod';

const allowedCharactersRegex = new RegExp(
  '^[' +
    'a-zA-Z0-9_.@#$%&*()' + // Basic Latin characters and symbols
    '\\p{Script=Latin}' + // Latin script characters
    '\\p{Script=Common}' + // Characters common across scripts
    '\\p{Script=Cyrillic}' + // Cyrillic script
    '\\p{Script=Devanagari}' + // Devanagari script
    '\\p{Script=Han}' + // Han script
    '\\p{Script=Arabic}' + // Arabic script
    '\\p{Script=Hiragana}' + // Hiragana
    '\\p{Script=Katakana}' + // Katakana
    '\\p{Script=Hangul}' + // Hangul
    ']+$', // End
  'u', // Unicode mode
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value) => value.trim().length > 0, {
      message: 'Password cannot be only spaces',
    }),
});

const registerSchema = z
  .object({
    name: z.string().min(3).max(80),
    username: z
      .union([z.literal(''), usernameSchema])
      .transform((value) => (value === '' ? null : value))
      .optional()
      .nullable(),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .max(128)
      .refine((value) => value.trim().length > 0, {
        message: 'Password cannot be only spaces',
      }),
    confirm_password: z
      .string()
      .min(8)
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

export { usernameSchema, loginSchema, registerSchema };
