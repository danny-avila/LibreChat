import { logger } from '@librechat/data-schemas';
import { channel } from 'node:diagnostics_channel';
import type { ContentTraversalDiagnostics } from './adapters/nested';

export interface LocatorTraversalFailure extends ContentTraversalDiagnostics {
  readonly messageCount: number;
  readonly resolvedFileCount: number;
}

export const locatorTraversalFailures = channel('librechat.content_filter.locator_traversal');

export function recordLocatorTraversalFailure(failure: LocatorTraversalFailure): void {
  logger.warn(`[content-filter] Locator traversal incomplete ${JSON.stringify(failure)}`, failure);
  locatorTraversalFailures.publish(failure);
}
