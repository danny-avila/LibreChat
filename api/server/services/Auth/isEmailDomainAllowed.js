'use strict';

/**
 * Checks if an email domain is allowed based on the ALLOWED_EMAIL_DOMAINS environment variable.
 * If ALLOWED_EMAIL_DOMAINS is not set, all domains are allowed.
 * 
 * @param {string|null|undefined} email - The email address to check
 * @returns {Promise<boolean>} Returns true if the email domain is allowed, false otherwise
 * @throws {Error} If the email format is invalid
 */
async function isEmailDomainAllowed(email) {
  if (!email) {
    return false;
  }

  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!allowedDomains) {
    return true;
  }

  const domain = email.split('@')[1];
  if (!domain) {
    return false;
  }

  const domains = allowedDomains.split(',').map((d) => d.trim().toLowerCase());
  return domains.includes(domain.toLowerCase());
}

module.exports = { isEmailDomainAllowed };