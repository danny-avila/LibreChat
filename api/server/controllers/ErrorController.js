const { logger } = require('~/config');

//handle duplicates
const handleDuplicateKeyError = (err, res) => {
  logger.error('Duplicate key error:', err.keyValue);
  const field = `${JSON.stringify(Object.keys(err.keyValue))}`;
  const code = 409;
  res
    .status(code)
    .send({ messages: `An document with that ${field} already exists.`, fields: field });
};

//handle validation errors
const handleValidationError = (err, res) => {
  logger.error('Validation error:', err.errors);
  let errors = Object.values(err.errors).map((el) => el.message);
  let fields = `${JSON.stringify(Object.values(err.errors).map((el) => el.path))}`;
  let code = 400;
  if (errors.length > 1) {
    errors = errors.join(' ');
    res.status(code).send({ messages: `${JSON.stringify(errors)}`, fields: fields });
  } else {
    res.status(code).send({ messages: `${JSON.stringify(errors)}`, fields: fields });
  }
};

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  try {
    if (err.name === 'ValidationError') {
      return (err = handleValidationError(err, res));
    }
    if (err.code && err.code == 11000) {
      return (err = handleDuplicateKeyError(err, res));
    }
  } catch (err) {
    logger.error('ErrorController => error', err);
    res.status(500).send('An unknown error occurred.');
  }
};
