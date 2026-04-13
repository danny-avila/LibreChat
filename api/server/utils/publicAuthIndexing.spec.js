const {
  getPublicAuthRouteMeta,
  injectPublicAuthRouteHtml,
  shouldApplyNoIndex,
} = require('./publicAuthIndexing');

describe('publicAuthIndexing', () => {
  const originalEnv = {
    ENABLE_PUBLIC_AUTH_INDEXING: process.env.ENABLE_PUBLIC_AUTH_INDEXING,
    DOMAIN_CLIENT: process.env.DOMAIN_CLIENT,
    NO_INDEX: process.env.NO_INDEX,
  };

  const indexHtml = `
    <!DOCTYPE html>
    <html lang="en-US">
      <head>
        <meta name="description" content="Default description" />
        <title>CodeCan AI</title>
      </head>
      <body>
        <div id="root"><div id="loading-container"></div></div>
      </body>
    </html>
  `;

  afterEach(() => {
    if (originalEnv.ENABLE_PUBLIC_AUTH_INDEXING == null) {
      delete process.env.ENABLE_PUBLIC_AUTH_INDEXING;
    } else {
      process.env.ENABLE_PUBLIC_AUTH_INDEXING = originalEnv.ENABLE_PUBLIC_AUTH_INDEXING;
    }

    if (originalEnv.DOMAIN_CLIENT == null) {
      delete process.env.DOMAIN_CLIENT;
    } else {
      process.env.DOMAIN_CLIENT = originalEnv.DOMAIN_CLIENT;
    }

    if (originalEnv.NO_INDEX == null) {
      delete process.env.NO_INDEX;
    } else {
      process.env.NO_INDEX = originalEnv.NO_INDEX;
    }
  });

  it('should return metadata for indexable public auth routes', () => {
    expect(getPublicAuthRouteMeta('/login')).toMatchObject({
      canonicalPath: '/login',
      fallbackHeading: 'Sign in to CodeCan AI',
    });
    expect(getPublicAuthRouteMeta('/reset-password')).toBeNull();
  });

  it('should inject route-specific SEO metadata and fallback content', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    process.env.DOMAIN_CLIENT = 'https://example.com';

    const html = injectPublicAuthRouteHtml(indexHtml, { method: 'GET', path: '/register' });

    expect(html).toContain('<title>Create Account | CodeCan AI</title>');
    expect(html).toContain(
      '<meta name="description" content="Create a CodeCan AI account to start using building code guidance and account features." />',
    );
    expect(html).toContain('<meta name="robots" content="index,follow" />');
    expect(html).toContain('<link rel="canonical" href="https://example.com/register" />');
    expect(html).toContain('data-public-auth-fallback="true"');
    expect(html).toContain('Create your CodeCan AI account');
    expect(html).toContain('Already have an account? Sign in');
  });

  it('should skip canonical injection when DOMAIN_CLIENT is invalid or missing', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    process.env.DOMAIN_CLIENT = '://bad-url';

    const html = injectPublicAuthRouteHtml(indexHtml, { method: 'GET', path: '/login' });

    expect(html).not.toContain('rel="canonical"');
  });

  it('should noindex non-allowlisted routes even when public auth indexing is enabled', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    delete process.env.NO_INDEX;

    expect(shouldApplyNoIndex({ method: 'GET', path: '/search' })).toBe(true);
    expect(shouldApplyNoIndex({ method: 'GET', path: '/login' })).toBe(false);
  });

  it('should force noindex when NO_INDEX=true', () => {
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    process.env.NO_INDEX = 'true';

    expect(shouldApplyNoIndex({ method: 'GET', path: '/login' })).toBe(true);
  });
});
