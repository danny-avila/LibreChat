import type { Response } from 'express';
import {
  prepareMediaAccountDeletion,
  completeMediaAccountDeletion,
  cancelMediaAccountDeletion,
} from '../media/account';
import { MediaServiceError } from '../media/errors';

export function sendAccountDeletionError(res: Pick<Response, 'status'>, error: Error): Response {
  if (error instanceof MediaServiceError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  return res.status(500).json({ message: 'Something went wrong.' });
}

/** Account-deletion phases compose subsystem fences before the legacy data cascade. */
export function prepareAccountDeletion(
  input: Parameters<typeof prepareMediaAccountDeletion>[0],
): ReturnType<typeof prepareMediaAccountDeletion> {
  return prepareMediaAccountDeletion(input);
}
export function completeAccountDeletion(
  input: Parameters<typeof completeMediaAccountDeletion>[0],
): ReturnType<typeof completeMediaAccountDeletion> {
  return completeMediaAccountDeletion(input);
}
export function cancelAccountDeletion(
  input: Parameters<typeof cancelMediaAccountDeletion>[0],
): ReturnType<typeof cancelMediaAccountDeletion> {
  return cancelMediaAccountDeletion(input);
}
