import type { MediaErrorCode } from 'librechat-data-provider';

export class MediaServiceError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MediaServiceError';
  }
}

export class MediaProviderError extends Error {
  /**
   * Redacted diagnostic: HTTP status, transport error code and a failure class, never a
   * response body or header value. Surfaces in logs only; the message stays generic.
   */
  constructor(
    public readonly certainty: 'rejected' | 'uncertain',
    public readonly status?: number,
    public readonly reason?: string,
  ) {
    super('The media provider request could not be completed.');
    this.name = 'MediaProviderError';
  }
}
