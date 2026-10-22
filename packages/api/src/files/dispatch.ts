import type { FileStorageUploadObserver } from './operations';
import { isDefinitiveFileStorageFailure } from './operations';

/** Definitive rejection closes this attempt before an outer retry can wait or cancel. */
export async function dispatchFileStorageOperation<T>(
  onStart: FileStorageUploadObserver | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  onStart?.();
  try {
    return await operation();
  } catch (error) {
    if (isDefinitiveFileStorageFailure(error)) onStart?.('rejected');
    throw error;
  }
}
