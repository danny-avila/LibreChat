import { exodeHostMessageSchema, isExodeEmbedLocation } from './protocol';

describe('Exode iframe protocol', () => {
  const validMessage = {
    protocol: 1,
    source: 'exode-host',
    type: 'exode-ai-chat:authenticate',
    requestId: '9936c8e3-87d8-4850-8a7d-7a91b902e74a',
    payload: {
      token: 'bootstrap-token-with-enough-length',
      handshakeId: 'ec150ba8-01a4-4db3-b61e-a1ca22d021ba',
    },
  };

  it('accepts the versioned authentication envelope', () => {
    expect(exodeHostMessageSchema.safeParse(validMessage).success).toBe(true);
  });

  it.each([
    { ...validMessage, protocol: 2 },
    { ...validMessage, source: 'exode-ai-chat' },
    { ...validMessage, requestId: 'not-a-uuid' },
    { ...validMessage, payload: { ...validMessage.payload, handshakeId: 'not-a-uuid' } },
  ])('rejects malformed cross-window input', (message) => {
    expect(exodeHostMessageSchema.safeParse(message).success).toBe(false);
  });

  it('detects only the Exode entry route and explicit query marker', () => {
    expect(isExodeEmbedLocation('/embed/exode', '')).toBe(true);
    expect(isExodeEmbedLocation('/c/new', '?embed=exode')).toBe(true);
    expect(isExodeEmbedLocation('/c/new', '?embed=other')).toBe(false);
  });
});
