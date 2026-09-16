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
  constructor(
    public readonly certainty: 'rejected' | 'uncertain',
    public readonly status?: number,
  ) {
    super('The media provider request could not be completed.');
    this.name = 'MediaProviderError';
  }
}
