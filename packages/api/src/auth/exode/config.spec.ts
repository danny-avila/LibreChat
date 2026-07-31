import {
  getExodeAuthConfig,
  getExodeEmbedConfig,
  getExodeFrameAncestors,
  isExodeEmbedRequest,
} from './config';

const ORIGINAL_ENV = process.env;

describe('Exode auth config', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      EXODE_MAIN_URL: 'https://api.exode.biz',
      EXODE_MAIN_SERVICE_ID: 'LibreChatBridge',
      EXODE_MAIN_SERVICE_SECRET: 'service-secret',
      EXODE_MAIN_ISSUER: 'exode-backend-main',
      EXODE_EMBED_ORIGINS: 'https://exode.biz, https://school.example.com',
      EXODE_EMBED_JWT_TTL_MS: '300000',
      EXODE_MCP_SERVER_NAME: 'exode',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns private and public configuration with normalized origins', () => {
    expect(getExodeAuthConfig()).toEqual({
      mainUrl: 'https://api.exode.biz/',
      serviceId: 'LibreChatBridge',
      serviceSecret: 'service-secret',
      issuer: 'exode-backend-main',
      allowedOrigins: ['https://exode.biz', 'https://school.example.com'],
      embedJwtTtlMs: 300000,
      mcpServerName: 'exode',
    });
    expect(getExodeEmbedConfig()).toEqual({
      enabled: true,
      protocol: 1,
      allowedOrigins: ['https://exode.biz', 'https://school.example.com'],
    });
    expect(getExodeFrameAncestors()).toBe('https://exode.biz https://school.example.com');
  });

  it('is disabled until all private settings are configured', () => {
    delete process.env.EXODE_MAIN_SERVICE_SECRET;
    expect(getExodeEmbedConfig().enabled).toBe(false);
  });

  it('rejects origins containing paths and invalid token lifetimes', () => {
    process.env.EXODE_EMBED_ORIGINS = 'https://exode.biz/path';
    expect(() => getExodeAuthConfig()).toThrow('only scheme, host, and port');

    process.env.EXODE_EMBED_ORIGINS = 'https://exode.biz';
    process.env.EXODE_EMBED_JWT_TTL_MS = '30000';
    expect(() => getExodeAuthConfig()).toThrow('between 60000 and 900000');
  });

  it('recognizes only the dedicated path or query marker', () => {
    expect(isExodeEmbedRequest('/embed/exode')).toBe(true);
    expect(isExodeEmbedRequest('/c/new', 'exode')).toBe(true);
    expect(isExodeEmbedRequest('/c/new', 'other')).toBe(false);
  });
});
