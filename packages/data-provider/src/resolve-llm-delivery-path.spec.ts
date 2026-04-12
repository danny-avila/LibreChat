import { resolveDefaultLLMDeliveryPath, SYSTEM_LLM_DELIVERY_DEFAULTS } from './resolve-llm-delivery-path';
import type { TDefaultLLMDeliveryPathConfig } from './file-config';

describe('resolveDefaultLLMDeliveryPath', () => {
  it('should return system default for images when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('image/png')).toBe('provider');
  });

  it('should return system default for PDFs when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf')).toBe('provider');
  });

  it('should return system fallback for unknown mime types', () => {
    expect(resolveDefaultLLMDeliveryPath('text/plain')).toBe('text');
  });

  it('should match exact mime type before wildcard', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/png': 'text', 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', config)).toBe('text');
  });

  it('should match wildcard when no exact match', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'none' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/jpeg', config)).toBe('none');
  });

  it('should use config fallback when no override matches', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      fallback: 'none',
      overrides: { 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('text/plain', config)).toBe('none');
  });

  it('should resolve endpoint config before global config', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'text' },
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe('text');
  });

  it('should fall through to global config when endpoint has no match', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'audio/*': 'none' },
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'text' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe('text');
  });

  it('should use endpoint fallback before global overrides', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      fallback: 'none',
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'text/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('text/plain', endpointConfig, globalConfig)).toBe('none');
  });

  it('should fall through entire chain to system defaults', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {};
    const globalConfig: TDefaultLLMDeliveryPathConfig = {};
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe('provider');
    expect(resolveDefaultLLMDeliveryPath('application/pdf', endpointConfig, globalConfig)).toBe('provider');
    expect(resolveDefaultLLMDeliveryPath('text/csv', endpointConfig, globalConfig)).toBe('text');
  });

  it('should resolve none destination correctly', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'audio/*': 'none' },
    };
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', config)).toBe('none');
  });

  it('should prefer exact match over wildcard in the same config', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'provider', 'image/svg+xml': 'text' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/svg+xml', config)).toBe('text');
    expect(resolveDefaultLLMDeliveryPath('image/png', config)).toBe('provider');
  });

  it('should handle undefined configs gracefully', () => {
    expect(resolveDefaultLLMDeliveryPath('text/plain', undefined, undefined)).toBe('text');
  });

  it('should export SYSTEM_LLM_DELIVERY_DEFAULTS with correct shape', () => {
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.fallback).toBe('text');
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.overrides).toEqual({
      'image/*': 'provider',
      'application/pdf': 'provider',
    });
  });
});
