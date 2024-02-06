const path = require("path");
const express = require("express");
const passport = require('passport');
const Strategies = require("passport-http");
const DigestStrategy = Strategies.DigestStrategy;
const BasicStrategy = Strategies.BasicStrategy;

module.exports = { getApp(method) {
  const app = express();

  const User = {
    findOne(user, callback) {
      return callback(null, { password: "test", username: user.username });
    }
  }

  passport.use(new BasicStrategy(
    function(userid, password, done) {
      User.findOne({ username: userid }, function (err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        if (user.password != password) { return done(null, false); }
        return done(null, user);
      });
    }
  ));

  const options = {}
  if (method) options.qop = method
  passport.use(new DigestStrategy(options,
    function(username, done) {
      User.findOne({ username: username }, function (err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        return done(null, user, user.password);
      });
    },
    function(params, done) {
      // validate nonces as necessary
      done(null, true)
    }
  ));

  // http basic authentication
  app.get('/basic',
    passport.authenticate('basic', { session: false }),
    function(req, res) {
      res.json(req.user);
  });
  // http digest authentication
  app.get('/auth',
    passport.authenticate('digest', { session: false }),
    function(req, res) {
      res.json(req.user);
  });


  // app.use("/static", express.static(path.join(__dirname, './static')));
  // app.get('/', (req, res) => res.sendFile("/home/stefan/digest/main.html") );
  // app.listen(3222, "0.0.0.0");
  return app
}}
