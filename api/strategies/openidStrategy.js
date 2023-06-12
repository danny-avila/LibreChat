const passport = require('passport');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

Issuer.discover(process.env.OPENID_ISSUER)
  .then(issuer => {
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [domains.server + process.env.OPENID_CALLBACK_URL]
    });

    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE
        }
      },
      async (tokenset, userinfo, done) => {
        try {
          let user = await User.findOne({ email: userinfo.email });
          if (!user) {
            user = new User({
              provider: 'openid',
              openidId: userinfo.sub,
              username: userinfo.given_name,
              email: userinfo.email,
              emailVerified: userinfo.email_verified,
              name: userinfo.given_name + ' ' + userinfo.family_name,
              avatar: ''
              // avatar: userinfo.picture
            });
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = userinfo.given_name;
            user.name = userinfo.given_name + ' ' + userinfo.family_name;
            user.avatar = '';
            // user.avatar = userinfo.picture;
          }  

          await user.save();
          
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    );

    passport.use('openid', openidLogin);

  })
  .catch(err => {
    console.error(err);
  });
