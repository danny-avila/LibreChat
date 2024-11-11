const { getCustomConfig } = require('~/server/services/Config');

async function isDomainAllowed(email) {
  if (!email) {
    return false;
  }

  const domain = email.split('@')[1];

  if (!domain) {
    return false;
  }

  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return true;
  } else if (!customConfig?.registration?.allowedDomains) {
    return true;
  }

  return customConfig.registration.allowedDomains.includes(domain);
}

module.exports = isDomainAllowed;
