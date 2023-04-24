const express = require('express');
const Joi = require('joi');

const User = require('../../../models/User');
const requireLocalAuth = require('../../../middleware/requireLocalAuth');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const { registerSchema } = require('../../../strategies/validators');
const DebugControl = require('../../../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const router = express.Router();

router.get('/user', requireJwtAuth, (req, res) => {
  res.status(200).send(req.user);
});

router.post('/login', requireLocalAuth, (req, res) => {
  const token = req.user.generateJWT();
  const user = req.user.toJSON();
  res.status(200).send({ token, user });
});

router.post('/register', async (req, res, next) => {
  const { error } = Joi.validate(req.body, registerSchema);
  if (error) {
    log({
      title: 'Route: register - Joi Validation Error',
      parameters: [
        { name: 'Request params:', value: req.body },
        { name: 'Validation error:', value: error.details }
      ]
    });
    return res.status(422).send({ message: error.details[0].message });
  }

  const { email, password, name, username } = req.body;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      log({
        title: 'Register User - Email in use',
        parameters: [
          { name: 'Request params:', value: req.body },
          { name: 'Existing user:', value: existingUser }
        ]
      });
      return res.status(422).send({ message: 'Email is in use' });
    }

    try {
      const newUser = await new User({
        auth_provider: 'email',
        email,
        password,
        username,
        name,
        avatar: null
      });

      newUser.registerUser(newUser, (err, user) => {
        if (err) throw err;
        //TODO: send email verification, automatically login user
        //on auto-login should check if email verified and display message to verify to continue to app
        res.status(200).send();
      });
    } catch (err) {
      return next(err);
    }
  } catch (err) {
    return next(err);
  }
});

// logout
router.post('/logout', (req, res) => {
  req.logout();
  res.status(200).send(false);
});

module.exports = router;
