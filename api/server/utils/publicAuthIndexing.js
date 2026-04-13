const INDEXABLE_PUBLIC_AUTH_ROUTES = {
  '/login': {
    title: 'Login | CodeCan AI',
    description:
      'Sign in to CodeCan AI to access your account, conversations, and building code guidance.',
    canonicalPath: '/login',
    fallbackHeading: 'Sign in to CodeCan AI',
    fallbackBody:
      'Access your account to continue existing conversations and use CodeCan AI building code guidance.',
    fallbackLinks: [
      { href: '/register', label: 'Create an account' },
      { href: '/forgot-password', label: 'Forgot your password?' },
    ],
  },
  '/register': {
    title: 'Create Account | CodeCan AI',
    description:
      'Create a CodeCan AI account to start using building code guidance and account features.',
    canonicalPath: '/register',
    fallbackHeading: 'Create your CodeCan AI account',
    fallbackBody:
      'Register for a new account to start using CodeCan AI and save your conversations.',
    fallbackLinks: [
      { href: '/login', label: 'Already have an account? Sign in' },
      { href: '/forgot-password', label: 'Need password help?' },
    ],
  },
  '/forgot-password': {
    title: 'Forgot Password | CodeCan AI',
    description:
      'Request a password reset link for your CodeCan AI account and regain access securely.',
    canonicalPath: '/forgot-password',
    fallbackHeading: 'Reset your password',
    fallbackBody:
      'Request a secure password reset link to regain access to your CodeCan AI account.',
    fallbackLinks: [
      { href: '/login', label: 'Back to login' },
      { href: '/register', label: 'Create an account' },
    ],
  },
};

function isPublicAuthIndexingEnabled() {
  return process.env.ENABLE_PUBLIC_AUTH_INDEXING === 'true';
}

function isNoIndexForced() {
  return process.env.NO_INDEX === 'true';
}

function getNormalizedPath(input) {
  if (typeof input === 'string') {
    return input.split('?')[0];
  }

  return input?.path ?? input?.originalUrl?.split('?')[0] ?? '';
}

function getPublicAuthRouteMeta(input) {
  const pathname = getNormalizedPath(input);
  return INDEXABLE_PUBLIC_AUTH_ROUTES[pathname] ?? null;
}

function isIndexablePublicAuthRequest(req) {
  return req?.method === 'GET' && getPublicAuthRouteMeta(req) != null;
}

function shouldApplyNoIndex(req) {
  if (isNoIndexForced()) {
    return true;
  }

  if (isPublicAuthIndexingEnabled() && isIndexablePublicAuthRequest(req)) {
    return false;
  }

  return true;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCanonicalUrl(metadata) {
  if (!metadata?.canonicalPath || !process.env.DOMAIN_CLIENT) {
    return null;
  }

  try {
    return new URL(metadata.canonicalPath, process.env.DOMAIN_CLIENT).toString();
  } catch {
    return null;
  }
}

function replaceTagContents(html, pattern, replacement) {
  if (!pattern.test(html)) {
    return html;
  }

  pattern.lastIndex = 0;
  return html.replace(pattern, replacement);
}

function buildFallbackMarkup(metadata) {
  const links = metadata.fallbackLinks
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`,
    )
    .join('');

  return `
    <section data-public-auth-fallback="true">
      <h1>${escapeHtml(metadata.fallbackHeading)}</h1>
      <p>${escapeHtml(metadata.fallbackBody)}</p>
      <nav aria-label="Authentication links">
        <ul>${links}</ul>
      </nav>
    </section>
  `;
}

function injectPublicAuthRouteHtml(html, req) {
  if (!isPublicAuthIndexingEnabled()) {
    return html;
  }

  const metadata = getPublicAuthRouteMeta(req);
  if (!metadata) {
    return html;
  }

  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = buildCanonicalUrl(metadata);
  const fallbackMarkup = buildFallbackMarkup(metadata);

  let updatedHtml = replaceTagContents(
    html,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${title}</title>`,
  );

  if (updatedHtml.includes('name="description"')) {
    updatedHtml = updatedHtml.replace(
      /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="description" content="${description}" />`,
    );
  } else {
    updatedHtml = updatedHtml.replace(
      /<\/head>/i,
      `  <meta name="description" content="${description}" />\n</head>`,
    );
  }

  const headTags = [`<meta name="robots" content="index,follow" />`];
  if (canonicalUrl) {
    headTags.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);
  }
  updatedHtml = updatedHtml.replace(/<\/head>/i, `  ${headTags.join('\n  ')}\n</head>`);

  updatedHtml = updatedHtml.replace(
    /<div id="root">/i,
    `<div id="root">${fallbackMarkup}`,
  );

  return updatedHtml;
}

module.exports = {
  INDEXABLE_PUBLIC_AUTH_ROUTES,
  getPublicAuthRouteMeta,
  injectPublicAuthRouteHtml,
  isPublicAuthIndexingEnabled,
  shouldApplyNoIndex,
};
