const Joi = require('joi');

const loginSchema = Joi.object().keys({
  email: Joi.string().trim().email().required(),
  password: Joi.string().trim().min(8).max(128).required(),
});

const registerSchema = Joi.object().keys({
  name: Joi.string().trim().min(3).max(80).required(),
  username: Joi.string()
    .trim()
    .allow('')
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-@#$%&*() ]+$/),
  email: Joi.string().trim().email().required(),
  password: Joi.string().trim().min(8).max(128).required(),
  confirm_password: Joi.string().trim().min(8).max(128).required(),
});

module.exports = {
  loginSchema,
  registerSchema,
};
