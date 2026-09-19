import type {
  MediaAccountingMethods,
  MediaMethods,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import { MediaServiceError } from './errors';

export function sendMediaAccountDeletionError(
  res: Pick<Response, 'status'>,
  error: Error,
): Response {
  if (error instanceof MediaServiceError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  return res.status(500).json({ message: 'Something went wrong.' });
}

export interface MediaAccountDeletion {
  scope: MediaOwnerScope;
  token: string;
}
export type MediaAccountDeletionRepository = Pick<
  MediaMethods,
  'prepareMediaAccountDeletion' | 'cancelMediaAccountDeletion' | 'completeMediaAccountDeletion'
> &
  Pick<MediaAccountingMethods, 'hasMediaAccountingObligations'>;

/** Called under the existing account deletion fence, before deleting any account data. */
export async function prepareMediaAccountDeletion({
  repository,
  scope,
  token,
}: {
  repository: MediaAccountDeletionRepository;
  scope: MediaOwnerScope;
  token: string;
}): Promise<MediaAccountDeletion> {
  const session = { scope, token };
  try {
    if (
      !(await repository.prepareMediaAccountDeletion(session)) ||
      (await repository.hasMediaAccountingObligations(scope))
    ) {
      throw new MediaServiceError(
        'not_ready',
        409,
        'Media work or accounting must finish before account deletion.',
      );
    }
    return session;
  } catch (error) {
    await repository.cancelMediaAccountDeletion(session);
    throw error;
  }
}

export async function completeMediaAccountDeletion({
  repository,
  session,
}: {
  repository: MediaAccountDeletionRepository;
  session: MediaAccountDeletion;
}): Promise<void> {
  await repository.completeMediaAccountDeletion(session);
}

export async function cancelMediaAccountDeletion({
  repository,
  session,
  userDeleted,
  log,
}: {
  repository: MediaAccountDeletionRepository;
  session?: MediaAccountDeletion;
  userDeleted: boolean;
  log(error: Error): void;
}): Promise<void> {
  if (!session || userDeleted) {
    return;
  }
  try {
    await repository.cancelMediaAccountDeletion(session);
  } catch (error) {
    log(
      error instanceof Error
        ? error
        : new Error('Media account deletion fence could not be released.'),
    );
  }
}
