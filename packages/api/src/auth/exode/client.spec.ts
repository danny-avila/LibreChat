import { exchangeExodeBootstrap } from './client';
import type { ExodeAuthConfig } from './config';

const config: ExodeAuthConfig = {
  mainUrl: 'https://api.exode.biz/',
  serviceId: 'LibreChatBridge',
  serviceSecret: 'secret',
  issuer: 'exode-backend-main',
  allowedOrigins: ['https://exode.biz'],
  embedJwtTtlMs: 300000,
  mcpServerName: 'exode',
};

const input = {
  token: 'bootstrap-token-with-enough-length',
  handshakeId: 'ec150ba8-01a4-4db3-b61e-a1ca22d021ba',
  parentOrigin: 'https://exode.biz',
};

describe('exchangeExodeBootstrap', () => {
  it('authenticates the server-to-server exchange and validates its response', async () => {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            payload: {
              identity: {
                subject: 'principal-subject-with-enough-length',
                userId: 9021,
                userUuid: 'f49635f4-e814-4d66-a535-73229b949253',
                name: 'Aslan Orlov',
                schoolId: 17,
                sellerId: 42,
              },
              token: 'access-token-with-enough-length',
              expiresAt: '2026-07-20T14:30:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await exchangeExodeBootstrap(input, config, fetcher);

    expect(result.identity.userId).toBe(9021);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.exode.biz/api/v2/auth/ai-chat/exchange',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-service-id': 'LibreChatBridge',
          'x-service-secret': 'secret',
        }),
      }),
    );
  });

  it.each([
    [401, 'BOOTSTRAP_INVALID'],
    [403, 'AI_CHAT_FORBIDDEN'],
    [429, 'AI_CHAT_LIMIT'],
    [500, 'EXODE_UNAVAILABLE'],
  ])('maps upstream status %s to %s', async (status, code) => {
    const fetcher = jest.fn(async () => new Response(null, { status }));
    await expect(exchangeExodeBootstrap(input, config, fetcher)).rejects.toMatchObject({ code });
  });

  it('rejects a successful response with an invalid payload', async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ payload: {} })));
    await expect(exchangeExodeBootstrap(input, config, fetcher)).rejects.toMatchObject({
      code: 'EXODE_UNAVAILABLE',
      status: 502,
    });
  });
});
