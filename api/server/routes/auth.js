const express = require('express');
const router = express.Router();
const authYourLogin = require('./authYourLogin');
const userSystemEnabled = !!process.env.ENABLE_USER_SYSTEM || false;

router.get('/login', function (req, res) {
  if (userSystemEnabled) {
    res.redirect('/auth/your_login_page');
  } else {
    res.redirect('/');
  }
});

router.get('/logout', function (req, res) {
  // clear the session
  req.session.user = null;

  req.session.save(function () {
    if (userSystemEnabled) {
      res.redirect('/auth/your_login_page/logout');
    } else {
      res.redirect('/');
    }
  });
});

const authenticatedOr401 = (req, res, next) => {
  if (userSystemEnabled) {
    const user = req?.session?.user;

    if (user) {
      next();
    } else {
      res.status(401).end();
    }
  } else {
    next();
  }
};

const authenticatedOrRedirect = (req, res, next) => {
  if (userSystemEnabled) {
    const user = req?.session?.user;

    if (user) {
      next();
    } else {
      res.redirect('/auth/login').end();
    }
  } else next();
};

if (userSystemEnabled) {
  router.use('/your_login_page', authYourLogin);
}

module.exports = { router, authenticatedOr401, authenticatedOrRedirect };
