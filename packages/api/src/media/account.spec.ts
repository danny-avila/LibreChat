import type { MediaMethods, MediaAccountingMethods } from '@librechat/data-schemas';
import {
  prepareMediaAccountDeletion,
  completeMediaAccountDeletion,
  cancelMediaAccountDeletion,
} from './account';
import { sendAccountDeletionError } from '~/user/deletion';
import { MediaServiceError } from './errors';

describe('media account deletion preflight', () => {
  const scope = { ownerId: 'owner', tenantId: null };
  const session = { scope, token: 'deletion-token' };

  it('returns actionable media errors and preserves the generic response for other failures', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    sendAccountDeletionError(
      response,
      new MediaServiceError(
        'not_ready',
        409,
        'Media work or accounting must finish before account deletion.',
      ),
    );
    expect(response.status).toHaveBeenLastCalledWith(409);
    expect(response.json).toHaveBeenLastCalledWith({
      code: 'not_ready',
      message: 'Media work or accounting must finish before account deletion.',
    });
    sendAccountDeletionError(response, new Error('Private database details'));
    expect(response.status).toHaveBeenLastCalledWith(500);
    expect(response.json).toHaveBeenLastCalledWith({ message: 'Something went wrong.' });
  });
  let repository: jest.Mocked<
    Pick<
      MediaMethods,
      'prepareMediaAccountDeletion' | 'cancelMediaAccountDeletion' | 'completeMediaAccountDeletion'
    > &
      Pick<MediaAccountingMethods, 'hasMediaAccountingObligations'>
  >;
  beforeEach(() => {
    repository = {
      prepareMediaAccountDeletion: jest.fn().mockResolvedValue(true),
      cancelMediaAccountDeletion: jest.fn().mockResolvedValue(undefined),
      completeMediaAccountDeletion: jest.fn().mockResolvedValue(undefined),
      hasMediaAccountingObligations: jest.fn().mockResolvedValue(false),
    };
  });
  it('holds an admission fence before validating financial obligations', async () => {
    expect(await prepareMediaAccountDeletion({ repository, ...session })).toEqual(session);
    expect(repository.prepareMediaAccountDeletion.mock.invocationCallOrder[0]).toBeLessThan(
      repository.hasMediaAccountingObligations.mock.invocationCallOrder[0],
    );
    expect(repository.cancelMediaAccountDeletion).not.toHaveBeenCalled();
  });
  it.each(['work', 'accounting', 'database'])(
    'releases its fence and aborts before cascade on %s failure',
    async (failure) => {
      if (failure === 'work') {
        repository.prepareMediaAccountDeletion.mockResolvedValue(false);
      }
      if (failure === 'accounting') {
        repository.hasMediaAccountingObligations.mockResolvedValue(true);
      }
      if (failure === 'database') {
        repository.hasMediaAccountingObligations.mockRejectedValue(
          new Error('Database unavailable'),
        );
      }
      await expect(prepareMediaAccountDeletion({ repository, ...session })).rejects.toThrow();
      expect(repository.cancelMediaAccountDeletion).toHaveBeenCalledWith(session);
      expect(repository.completeMediaAccountDeletion).not.toHaveBeenCalled();
    },
  );
  it('delegates completion to the durable protocol and preserves the fence after User deletion', async () => {
    await completeMediaAccountDeletion({ repository, session });
    expect(repository.completeMediaAccountDeletion).toHaveBeenCalledWith(session);
    const log = jest.fn();
    await cancelMediaAccountDeletion({ repository, session, userDeleted: true, log });
    expect(repository.cancelMediaAccountDeletion).not.toHaveBeenCalled();
    await cancelMediaAccountDeletion({ repository, session, userDeleted: false, log });
    expect(repository.cancelMediaAccountDeletion).toHaveBeenCalledWith(session);
  });
});
