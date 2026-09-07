import { Providers } from '@librechat/agents';
import type { ServerRequest } from '~/types';
import { isConfiguredProviderMediaType } from './utils';

/** Uses the real data-provider merge logic so the "inherited default" identity check is exercised. */
const reqWith = (fileConfig: unknown): ServerRequest =>
  ({ config: fileConfig === undefined ? undefined : { fileConfig } }) as unknown as ServerRequest;

describe('isConfiguredProviderMediaType', () => {
  const params = { provider: Providers.OPENAI, endpoint: 'MyGateway' };

  it('is false without any fileConfig', () => {
    expect(isConfiguredProviderMediaType(reqWith(undefined), params, 'video/mp4')).toBe(false);
  });

  it('is false when the endpoint only inherits the built-in default list', () => {
    const req = reqWith({ endpoints: { OtherEndpoint: { fileLimit: 3 } } });
    expect(isConfiguredProviderMediaType(req, params, 'video/mp4')).toBe(false);
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(false);
  });

  it('is true when the endpoint config explicitly lists the media type', () => {
    const req = reqWith({
      endpoints: { MyGateway: { supportedMimeTypes: ['image/.*', 'application/pdf', 'video/.*'] } },
    });
    expect(isConfiguredProviderMediaType(req, params, 'video/mp4')).toBe(true);
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(false);
  });

  it('is true for a permissive config', () => {
    const req = reqWith({ endpoints: { MyGateway: { supportedMimeTypes: ['.*'] } } });
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(true);
  });

  it('falls back to the provider key when no endpoint is given', () => {
    const req = reqWith({ endpoints: { openAI: { supportedMimeTypes: ['audio/.*'] } } });
    expect(isConfiguredProviderMediaType(req, { provider: Providers.OPENAI }, 'audio/wav')).toBe(
      true,
    );
  });
});
