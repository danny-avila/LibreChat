const { z } = require('zod');

function errorsToString(errors) {
  return errors
    .map((error) => {
      let field = error.path.join('.');
      let message = error.message;

      return `${field}: ${message}`;
    })
    .join(' ');
}

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
      .union([
        z.literal(''),
        z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-zA-Z0-9_.-@#$%&*() ]+$/),
      ])
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

module.exports = {
  loginSchema,
  registerSchema,
  errorsToString,
};
