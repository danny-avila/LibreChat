import type { TDefaultLLMDeliveryPathConfig } from './file-config';
import {
  resolveDefaultLLMDeliveryPath,
  SYSTEM_LLM_DELIVERY_DEFAULTS,
} from './resolve-llm-delivery-path';

describe('resolveDefaultLLMDeliveryPath', () => {
  it('should return system default for images when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('image/png')).toBe('provider');
  });

  it('should return system default for PDFs when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf')).toBe('provider');
  });

  it('should return system default for videos when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('video/mp4')).toBe('provider');
  });

  it('should return system default for audio when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg')).toBe('provider');
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
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', endpointConfig, globalConfig)).toBe(
      'provider',
    );
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

  it('routes PDFs to text for a known endpoint without native document support', () => {
    expect(
      resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'azureOpenAI'),
    ).toBe('text');
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'azureOpenAI')).toBe(
      'text',
    );
  });

  it('keeps unsupported video off the model path rather than parsing it as text', () => {
    /* Nothing extracts text from video: speech-to-text covers audio only, and the default
     * text matcher accepts any well-formed type, so a downgrade to text ends in raw bytes
     * decoded as UTF-8. */
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'azureOpenAI')).toBe(
      'none',
    );
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'anthropic')).toBe(
      'none',
    );
  });

  it('keeps archives and columnar data off the text fallback', () => {
    /* These land on the text fallback rather than the capability gate, and the default
     * text matcher accepts them, so they would be decoded as UTF-8 into the prompt. */
    for (const mimeType of [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/epub+zip',
      'application/vnd.apache.parquet',
      /* No built-in parser handles presentations or drawings, so without OCR they would
       * reach the same raw-bytes fallback. */
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'application/vnd.oasis.opendocument.graphics',
      /* Legacy DOC is absent from documentParserMimeTypes, so it has no parser either. */
      'application/msword',
    ]) {
      expect(resolveDefaultLLMDeliveryPath(mimeType, undefined, undefined, 'openAI')).toBe('none');
    }
  });

  it('keeps recoverable types on the text fallback', () => {
    for (const mimeType of [
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'message/rfc822',
    ]) {
      expect(resolveDefaultLLMDeliveryPath(mimeType, undefined, undefined, 'openAI')).toBe('text');
    }
  });

  it('still honors an explicit override for an unparsable type', () => {
    expect(
      resolveDefaultLLMDeliveryPath(
        'application/zip',
        { overrides: { 'application/zip': 'text' } },
        undefined,
        'openAI',
      ),
    ).toBe('text');
  });

  it('still honors an explicit override for video', () => {
    /* Capability gating applies to the system default only; an admin who configures a
     * destination has made the decision. */
    expect(
      resolveDefaultLLMDeliveryPath(
        'video/mp4',
        { overrides: { 'video/*': 'text' } },
        undefined,
        'anthropic',
      ),
    ).toBe('text');
  });

  it('keeps provider delivery for endpoints that do support documents', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'google')).toBe(
      'provider',
    );
  });

  it('routes transcribable media to text for providers without media encoders', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'openAI')).toBe(
      'text',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'openAI')).toBe(
      'provider',
    );
  });

  it('keeps provider delivery for endpoints with real media encoders', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'google')).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'openrouter')).toBe(
      'provider',
    );
  });

  it('keeps images on the provider path regardless of document support', () => {
    expect(resolveDefaultLLMDeliveryPath('image/png', undefined, undefined, 'azureOpenAI')).toBe(
      'provider',
    );
  });

  it('does not downgrade when the endpoint is unknown', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf')).toBe('provider');
  });

  it('lets explicit config override the capability gate', () => {
    expect(
      resolveDefaultLLMDeliveryPath(
        'application/pdf',
        { overrides: { 'application/pdf': 'provider' } },
        undefined,
        'azureOpenAI',
      ),
    ).toBe('provider');
  });

  it('routes Bedrock document types through the provider on bedrock', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, undefined, undefined, 'bedrock')).toBe('provider');
    expect(
      resolveDefaultLLMDeliveryPath('application/msword', undefined, undefined, 'bedrock'),
    ).toBe('provider');
  });

  it('keeps Bedrock document types on text for other endpoints', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, undefined, undefined, 'openAI')).toBe('text');
    expect(resolveDefaultLLMDeliveryPath(docx)).toBe('text');
  });

  it('lets explicit config override the Bedrock document default', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, { fallback: 'text' }, undefined, 'bedrock')).toBe(
      'text',
    );
  });

  it('keeps the system default when the provider is unresolved (agents container)', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'agents')).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'agents')).toBe(
      'provider',
    );
  });

  it('keeps the system default for a custom endpoint name', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'MyOpenAI')).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'MyOpenAI')).toBe(
      'provider',
    );
  });

  it('should export SYSTEM_LLM_DELIVERY_DEFAULTS with correct shape', () => {
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.fallback).toBe('text');
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.overrides).toEqual({
      'image/*': 'provider',
      'video/*': 'provider',
      'audio/*': 'provider',
      'application/pdf': 'provider',
    });
  });
});
