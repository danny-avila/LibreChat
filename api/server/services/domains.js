/**
 * @param {string} email
 * @param {string[]} [allowedDomains]
 * @returns {boolean}
 */
function isEmailDomainAllowed(email, allowedDomains) {
  if (!email) {
    return false;
  }

  const domain = email.split('@')[1];

  if (!domain) {
    return false;
  }

  if (!allowedDomains) {
    return true;
  } else if (!Array.isArray(allowedDomains) || !allowedDomains.length) {
    return true;
  }

  return allowedDomains.includes(domain);
}

/**
 * Normalizes a domain string
 * @param {string} domain
 * @returns {string|null}
 */
/**
 * Normalizes a domain string. If the domain is invalid, returns null.
 * Normalized === lowercase, trimmed, and protocol added if missing.
 * @param {string} domain
 * @returns {string|null}
 */
function normalizeDomain(domain) {
  try {
    let normalizedDomain = domain.toLowerCase().trim();

    // Early return for obviously invalid formats
    if (normalizedDomain === 'http://' || normalizedDomain === 'https://') {
      return null;
    }

    // If it's not already a URL, make it one
    if (!normalizedDomain.startsWith('http://') && !normalizedDomain.startsWith('https://')) {
      normalizedDomain = `https://${normalizedDomain}`;
    }

    const url = new URL(normalizedDomain);
    // Additional validation that hostname isn't just protocol
    if (!url.hostname || url.hostname === 'http:' || url.hostname === 'https:') {
      return null;
    }

    return url.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Checks if the given domain is allowed. If no restrictions are set, allows all domains.
 * @param {string} [domain]
 * @param {string[]} [allowedDomains]
 * @returns {Promise<boolean>}
 */
async function isActionDomainAllowed(domain, allowedDomains) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  if (!Array.isArray(allowedDomains) || !allowedDomains.length) {
    return true;
  }

  const normalizedInputDomain = normalizeDomain(domain);
  if (!normalizedInputDomain) {
    return false;
  }

  for (const allowedDomain of allowedDomains) {
    const normalizedAllowedDomain = normalizeDomain(allowedDomain);
    if (!normalizedAllowedDomain) {
      continue;
    }

    if (normalizedAllowedDomain.startsWith('*.')) {
      const baseDomain = normalizedAllowedDomain.slice(2);
      if (
        normalizedInputDomain === baseDomain ||
        normalizedInputDomain.endsWith(`.${baseDomain}`)
      ) {
        return true;
      }
    } else if (normalizedInputDomain === normalizedAllowedDomain) {
      return true;
    }
  }

  return false;
}

module.exports = { isEmailDomainAllowed, isActionDomainAllowed };
