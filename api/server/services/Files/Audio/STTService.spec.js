// Mock all external dependencies so we can test getFileExtensionFromMime in isolation
jest.mock('axios');
jest.mock('form-data');
jest.mock('https-proxy-agent');
jest.mock('@librechat/data-schemas', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('@librechat/api', () => ({ genAzureEndpoint: jest.fn(), logAxiosError: jest.fn() }));
jest.mock('librechat-data-provider', () => ({
  extractEnvVariable: jest.fn(),
  STTProviders: {},
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));

const { getFileExtensionFromMime, MIME_TO_EXTENSION_MAP } = require('./STTService');

describe('getFileExtensionFromMime', () => {
  it('should normalize audio/x-m4a to m4a', () => {
    expect(getFileExtensionFromMime('audio/x-m4a')).toBe('m4a');
  });

  it('should normalize audio/mp4 to m4a', () => {
    expect(getFileExtensionFromMime('audio/mp4')).toBe('m4a');
  });

  it('should normalize audio/x-wav to wav', () => {
    expect(getFileExtensionFromMime('audio/x-wav')).toBe('wav');
  });

  it('should normalize audio/x-flac to flac', () => {
    expect(getFileExtensionFromMime('audio/x-flac')).toBe('flac');
  });

  it('should normalize audio/mpeg to mp3', () => {
    expect(getFileExtensionFromMime('audio/mpeg')).toBe('mp3');
  });

  it('should return webm for audio/webm', () => {
    expect(getFileExtensionFromMime('audio/webm')).toBe('webm');
  });

  it('should return ogg for audio/ogg', () => {
    expect(getFileExtensionFromMime('audio/ogg')).toBe('ogg');
  });

  it('should fall back to webm for unknown MIME types', () => {
    expect(getFileExtensionFromMime('audio/somethingelse')).toBe('webm');
  });

  it('should return webm for null/undefined input', () => {
    expect(getFileExtensionFromMime(null)).toBe('webm');
    expect(getFileExtensionFromMime(undefined)).toBe('webm');
  });
});

describe('STT audio format validation with MIME normalization', () => {
  const acceptedFormats = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

  /**
   * Mirrors the format validation logic in azureOpenAIProvider.
   * Only uses MIME_TO_EXTENSION_MAP for normalization so unknown audio
   * subtypes are not silently accepted via the webm default fallback.
   * Raw subtype matching is gated on audio/video prefix to prevent
   * non-audio types like text/webm from passing.
   */
  function isFormatAccepted(mimetype) {
    const [mimePrefix, rawFormat = ''] = mimetype.split('/');
    const isAudioMime = mimePrefix === 'audio' || mimePrefix === 'video';
    const isKnownMime = mimetype in MIME_TO_EXTENSION_MAP;
    const normalizedFormat = isKnownMime ? MIME_TO_EXTENSION_MAP[mimetype] : null;
    return (
      acceptedFormats.includes(normalizedFormat) ||
      (isAudioMime && acceptedFormats.includes(rawFormat))
    );
  }

  it('should accept audio/x-m4a (browser MIME for .m4a files)', () => {
    expect(isFormatAccepted('audio/x-m4a')).toBe(true);
  });

  it('should accept audio/x-wav', () => {
    expect(isFormatAccepted('audio/x-wav')).toBe(true);
  });

  it('should accept audio/x-flac', () => {
    expect(isFormatAccepted('audio/x-flac')).toBe(true);
  });

  it('should accept standard formats directly', () => {
    expect(isFormatAccepted('audio/mpeg')).toBe(true);
    expect(isFormatAccepted('audio/wav')).toBe(true);
    expect(isFormatAccepted('audio/ogg')).toBe(true);
    expect(isFormatAccepted('audio/webm')).toBe(true);
    expect(isFormatAccepted('audio/flac')).toBe(true);
    expect(isFormatAccepted('audio/mp3')).toBe(true);
    expect(isFormatAccepted('audio/mp4')).toBe(true);
    expect(isFormatAccepted('audio/mpga')).toBe(true);
  });

  it('should reject unknown audio subtypes', () => {
    expect(isFormatAccepted('audio/aac')).toBe(false);
    expect(isFormatAccepted('audio/somethingelse')).toBe(false);
    expect(isFormatAccepted('video/unknown')).toBe(false);
  });

  it('should accept application/ogg (valid Ogg container MIME type in the map)', () => {
    expect(isFormatAccepted('application/ogg')).toBe(true);
  });

  it('should reject non-audio types even if subtype matches an accepted format', () => {
    expect(isFormatAccepted('text/webm')).toBe(false);
    expect(isFormatAccepted('text/plain')).toBe(false);
    expect(isFormatAccepted('application/json')).toBe(false);
  });
});
