const Joi = require('joi');

const loginSchema = Joi.object().keys({
  email: Joi.string().trim().email().required(),
  password: Joi.string().trim().min(8).max(128).required(),
});

const registerSchema = Joi.object().keys({
  name: Joi.string().trim().min(2).max(30).required(),
  username: Joi.string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_.-]+$/)
    .required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().trim().min(8).max(128).required(),
  confirm_password: Joi.string().trim().min(8).max(128).required(),
});

module.exports = {
  loginSchema,
  registerSchema,
};
