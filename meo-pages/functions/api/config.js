const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;

  return Response.json(
    {
      appTitle: 'Meo AI',
      serverDomain: origin,
      openidLoginEnabled: true,
      openidAutoRedirect: false,
      openidLabel: 'Meo Account',
      openidImageUrl: null,
      emailLoginEnabled: false,
      registrationEnabled: false,
      passwordResetEnabled: false,
      socialLoginEnabled: false,
      socialLogins: [],
      passkeyLoginEnabled: false,
      discordLoginEnabled: false,
      facebookLoginEnabled: false,
      githubLoginEnabled: false,
      googleLoginEnabled: false,
      appleLoginEnabled: false,
      samlLoginEnabled: false,
      samlLabel: '',
      samlImageUrl: null,
      minPasswordLength: 8,
      turnstile: null,
      ldap: null,
    },
    { status: 200, headers },
  );
}

export function onRequest() {
  return Response.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { ...headers, Allow: 'GET' } },
  );
}
