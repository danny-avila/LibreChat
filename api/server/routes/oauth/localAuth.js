const express = require('express');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const User = require('../../../models/User');
const requireLocalAuth = require('../../../middleware/requireLocalAuth');
const requireJwtAuth = require('../../../middleware/requireJwtAuth');
const { registerSchema } = require('../../../strategies/validators');
const DebugControl = require('../../../utils/debug.js');


// token refresh code not yet being used
// const { serialize, parse } = require('cookie');


// function setTokenCookie(res, token) {
//   const cookie = serialize('refresh_token', token, {
//     maxAge: eval(process.env.REFRESH_TOKEN_EXPIRY) * 1000,
//     httpOnly: true,
//     secure: process.env.NODE_ENV === 'production',
//     path: '/',
//     sameSite: 'none'
//   });

//   res.setHeader('Set-Cookie', cookie);
// }

// function removeTokenCookie(res) {
//   const cookie = serialize('refresh_token', '', {
//     maxAge: -1,
//     path: '/'
//   });

//   res.setHeader('Set-Cookie', cookie);
// }

// function parseCookies(req) {
//   const cookie = req.headers?.cookie;
//   return parse(cookie || '');
// }

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.get('/user', requireJwtAuth, (req, res) => {
  res.status(200).send(req.user);
});

router.post('/login', requireLocalAuth, (req, res, next) => {
  const token = req.user.generateToken();
  // const refreshToken = req.user.generateRefreshToken();
  User.findById(req.user._id).then(
    (dbUser) => {
      // dbUser.refreshToken.push({ refreshToken });
      dbUser.save((err, dbUser) => {
        if (err) {
          log({
            title: 'Route: login - user save error',
            parameters: [
              { name: 'Error:', value: err.message },
              { name: 'User:', value: dbUser }
            ]
          });
          res.status(500).json({ message: err.message });
        } else {
          //setTokenCookie(res, refreshToken);
          res.cookie('token', token, {
            expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
            httpOnly: false,
            secure: isProduction
          });
          const user = dbUser.toJSON();
          res.status(200).send({ token, user });
        }
      });
    },
    err => next(err)
  );
});

router.post('/refresh', (req, res, next) => {
  const { signedCookies = {} } = req;
  const { refreshToken } = signedCookies;

  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      const userId = payload._id;
      User.findOne({ _id: userId }).then(
        (user) => {
          if (user) {
            // Find the refresh token against the user record in database
            const tokenIndex = user.refreshToken.findIndex(item => item.refreshToken === refreshToken);

            if (tokenIndex === -1) {
              res.statusCode = 401;
              res.send('Unauthorized');
            } else {
              const token = req.user.generateToken();
              // If the refresh token exists, then create new one and replace it.
              const newRefreshToken = req.user.generateRefreshToken();
              user.refreshToken[tokenIndex] = { refreshToken: newRefreshToken };
              user.save((err) => {
                if (err) {
                  res.statusCode = 500;
                  res.send(err);
                } else {
                //  setTokenCookie(res, newRefreshToken);
                  const user = req.user.toJSON();
                  res.status(200).send({ token, user });
                }
              });
            }
          } else {
            res.statusCode = 401;
            res.send('Unauthorized');
          }
        },
        err => next(err)
      );
    } catch (err) {
      res.statusCode = 401;
      res.send('Unauthorized');
    }
  } else {
    res.statusCode = 401;
    res.send('Unauthorized');
  }
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
        provider: 'email',
        email,
        password,
        username,
        name,
        avatar: null
      });

      const token = newUser.generateToken();
      // const refreshToken = newUser.generateRefreshToken();
      // newUser.refreshToken.push({ refreshToken });

      newUser.registerUser(newUser, (err, user) => {
        if (err) {
          res.status(500).json({ message: err.message });
        }
        //send token for automatic login
        res.cookie('token', token, {
          expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
          httpOnly: false,
          secure: isProduction
        });
        res.status(200).send({ user });
      });
    } catch (err) {
      return next(err);
    }
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', requireJwtAuth, (req, res, next) => {
  const { signedCookies = {} } = req;
  const { refreshToken } = signedCookies;
  User.findById(req.user._id).then(
    (user) => {
      const tokenIndex = user.refreshToken.findIndex(item => item.refreshToken === refreshToken);

      if (tokenIndex !== -1) {
        user.refreshToken.id(user.refreshToken[tokenIndex]._id).remove();
      }

      user.save((err) => {
        if (err) {
          res.status(500).json({ message: err.message });
        } else {
          //res.clearCookie('refreshToken', COOKIE_OPTIONS);
          // removeTokenCookie(res);
          res.status(200).send();
        }
      });
    },
    err => next(err)
  );
});

module.exports = router;

