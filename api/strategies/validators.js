const loginSchema = Joi.object().keys({
  email: Joi.string().trim().email().required().messages({
    'string.email': 'Please enter a valid email address',
    'string.empty': 'Email address is required',
    'any.required': 'Email address is required'
  }),
  password: Joi.string().trim().min(6).max(20).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'string.max': 'Password cannot be longer than 20 characters',
    'string.empty': 'Password is required',
    'any.required': 'Password is required'
  })
});
