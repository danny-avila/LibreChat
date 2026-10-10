const LOGIN_PATH_RE = /(?:^|\/)login(?:\/|$)/i;

function safeOAuthRedirect(value, clientDomain) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) {
      return null;
    }
  }

  try {
    const clientUrl = new URL(clientDomain);
    const target = new URL(value, clientUrl);
    if (target.origin !== clientUrl.origin || LOGIN_PATH_RE.test(target.pathname)) {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

module.exports = { safeOAuthRedirect };
