const { getCustomConfig } = require('~/server/services/Config');
const { isFakeDomain } = require('fakefilter')

async function isDomainAllowed(email) {
  if (!email) {
    return false;
  }

  const domain = email.split('@')[1];

  if (!domain) {
    return false;
  }

  const customConfig = await getCustomConfig();
  
  // If no custom config or no registration restrictions, allow all domains
  if (!customConfig || !customConfig.registration) {
    return true;
  }

  const { allowedDomains, disableFakeEmails } = customConfig.registration;

  // If no domain restrictions are configured, allow all non-fake domains
  if (!allowedDomains && !disableFakeEmails) {
    return true;
  }

  // Check for fake domains if that restriction is enabled
  if (disableFakeEmails && isFakeDomain(domain)) {
    return false;
  }

  // If allowed domains is configured, check against the list
  // Otherwise allow the domain (assuming it passed the fake domain check)
  return allowedDomains ? allowedDomains.includes(domain) : true;
}

module.exports = isDomainAllowed;
