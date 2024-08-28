const { isEnabled } = require('~/server/utils');

/** @returns {TStartupConfig['ldap'] | undefined} */
const getLdapConfig = () => {
  const ldapLoginEnabled = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;

  const ldap = {
    enabled: ldapLoginEnabled,
  };
  const ldapLoginUsesUsername = isEnabled(process.env.LDAP_LOGIN_USES_USERNAME);
  if (!ldapLoginEnabled) {
    return ldap;
  }

  if (ldapLoginUsesUsername) {
    ldap.username = true;
  }

  return ldap;
};

module.exports = {
  getLdapConfig,
};
