const handleDuplicateKeyError = (err, res) => {
  const field = Object.keys(err.keyValue);
  const code = 409;
  const error = `An document with that ${field} already exists.`;
  console.log('congrats you hit the duped keys error');
  return res.status(code).send({ message: error, field: field });
};

const handleValidationError = (err, res) => {
  console.log('congrats you hit the validation middleware');
  const errors = Object.values(err.errors).map(el => el.message);
  const fields = Object.values(err.errors).map(el => el.path);
  const code = 400;
  const message = errors.join(' ');
  return res.status(code).send({ message, fields });
};

module.exports = (err, req, res, next) => {
  console.log('congrats you hit the error middleware');
  if (err.name === 'ValidationError') {
    return handleValidationError(err, res);
  }
  if (err.code && err.code == 11000) {
    return handleDuplicateKeyError(err, res);
  }
  return res.status(500).send('An unknown error occurred.');
};
