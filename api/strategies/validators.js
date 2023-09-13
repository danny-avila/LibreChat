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
  password: z.string().min(8).max(128),
});

const registerSchema = z.object({
  name: z.string().min(3).max(80),
  username: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-@#$%&*() ]+$/)
    .optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  confirm_password: z.string().min(8).max(128),
});

module.exports = {
  loginSchema,
  registerSchema,
  errorsToString,
};
