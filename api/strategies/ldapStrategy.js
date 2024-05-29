const LdapStrategy = require('passport-ldapauth');
const User = require('~/models/User');
const fs = require('fs');

const ldapOptions = {
  server: {
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_BIND_DN,
    bindCredentials: process.env.LDAP_BIND_CREDENTIALS,
    searchBase: process.env.LDAP_USER_SEARCH_BASE,
    searchFilter: process.env.LDAP_SEARCH_FILTER || 'mail={{username}}',
    searchAttributes: ['displayName', 'mail', 'uid', 'cn', 'name', 'commonname', 'givenName', 'sn'],
    ...(process.env.LDAP_CA_CERT_PATH && {
      tlsOptions: { ca: [fs.readFileSync(process.env.LDAP_CA_CERT_PATH)] },
    }),
  },
  usernameField: 'email',
  passwordField: 'password',
};

const ldapLogin = new LdapStrategy(ldapOptions, async (userinfo, done) => {
  if (!userinfo) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  try {
    const firstName = userinfo.givenName;
    const familyName = userinfo.surname || userinfo.sn;
    const fullName =
      firstName && familyName
        ? `${firstName} ${familyName}`
        : userinfo.cn ||
          userinfo.name ||
          userinfo.commonname ||
          userinfo.displayName ||
          userinfo.mail;

    const username = userinfo.givenName || userinfo.mail;
    let user = await User.findOne({ email: userinfo.mail });
    if (user && user.provider !== 'ldap') {
      return done(null, false, { message: 'Invalid credentials' });
    }
    if (!user) {
      user = new User({
        provider: 'ldap',
        ldapId: userinfo.uid,
        username,
        email: userinfo.mail || '',
        emailVerified: true,
        name: fullName,
      });
    } else {
      user.provider = 'ldap';
      user.ldapId = userinfo.uid;
      user.username = username;
      user.name = fullName;
    }

    await user.save();

    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = ldapLogin;
