/** The parameters an OpenID refresh grant sends, from the deployment's OpenID settings. */
export interface OpenIDRefreshParams {
  scope?: string;
  audience?: string;
}

export function buildOpenIDRefreshParams(): OpenIDRefreshParams {
  const params: OpenIDRefreshParams = {};

  if (process.env.OPENID_SCOPE) {
    params.scope = process.env.OPENID_SCOPE;
  }

  if (process.env.OPENID_REFRESH_AUDIENCE) {
    params.audience = process.env.OPENID_REFRESH_AUDIENCE;
  }

  return params;
}
