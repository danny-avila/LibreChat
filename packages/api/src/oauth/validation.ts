import { AuthTypeEnum } from 'librechat-data-provider';

import { isSSRFTarget, resolveHostnameSSRF } from '~/auth';

type ActionOAuthEndpointField = 'authorization_url' | 'client_url';

interface ActionOAuthAuthMetadata {
  type?: AuthTypeEnum | string | null;
  authorization_url?: string | null;
  client_url?: string | null;
}

function getHttpsPort(url: URL): string {
  return url.port || '443';
}

function invalidActionOAuth(fieldName: ActionOAuthEndpointField, message: string): never {
  throw new Error(`Invalid action OAuth ${fieldName}: ${message}`);
}

export async function validateActionOAuthEndpoint(
  url: string | null | undefined,
  fieldName: ActionOAuthEndpointField,
): Promise<void> {
  if (!url || typeof url !== 'string') {
    invalidActionOAuth(fieldName, 'endpoint URL is required.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    invalidActionOAuth(fieldName, 'unable to parse endpoint URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    invalidActionOAuth(fieldName, 'only HTTPS endpoint URLs are permitted.');
  }

  const port = getHttpsPort(parsedUrl);
  if (isSSRFTarget(parsedUrl.hostname, null, port)) {
    invalidActionOAuth(fieldName, 'endpoint targets a restricted address.');
  }

  if (await resolveHostnameSSRF(parsedUrl.hostname, null, port)) {
    invalidActionOAuth(fieldName, 'endpoint resolves to a restricted address.');
  }
}

export async function validateActionOAuthMetadata(
  auth?: ActionOAuthAuthMetadata | null,
): Promise<void> {
  if (!auth || auth.type !== AuthTypeEnum.OAuth) {
    return;
  }

  await validateActionOAuthEndpoint(auth.authorization_url, 'authorization_url');
  await validateActionOAuthEndpoint(auth.client_url, 'client_url');
}
