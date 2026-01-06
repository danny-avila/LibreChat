const registerLdapStrategies = (passportInstance, ldapLoginStrategy) => {
  if (!process.env.LDAP_URL || !process.env.LDAP_USER_SEARCH_BASE || !ldapLoginStrategy) {
    return;
  }

  const ldapUrls = ldapLoginStrategy.getLdapUrls?.() ?? [];
  if (ldapUrls.length > 1) {
    ldapUrls.forEach((url, index) => {
      const strategyName = index === 0 ? 'ldapauth' : `ldapauth-${index}`;
      passportInstance.use(strategyName, ldapLoginStrategy.create(url));
    });
    return;
  }

  passportInstance.use(ldapLoginStrategy);
};

module.exports = registerLdapStrategies;
