import type { Model } from 'mongoose';
import type {
  IOpenIDRefreshFlight,
  OpenIDRefreshFlightCreateData,
  OpenIDRefreshFlightCompleteData,
  OpenIDRefreshFlightRenewData,
  OpenIDRefreshFlightFailData,
  OpenIDRefreshFlightQuery,
  OpenIDRefreshFlightAcquireResult,
} from '~/types';
import { createIndexesWithRetry } from '~/utils/retry';
import logger from '~/config/winston';

function hasErrorCode(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return hasErrorCode(error) && error.code === 11000;
}

export function createOpenIDRefreshFlightMethods(mongoose: typeof import('mongoose')): {
  acquireOpenIDRefreshFlight: (
    data: OpenIDRefreshFlightCreateData,
  ) => Promise<OpenIDRefreshFlightAcquireResult>;
  completeOpenIDRefreshFlight: (
    data: OpenIDRefreshFlightCompleteData,
  ) => Promise<IOpenIDRefreshFlight | null>;
  renewOpenIDRefreshFlight: (
    data: OpenIDRefreshFlightRenewData,
  ) => Promise<IOpenIDRefreshFlight | null>;
  failOpenIDRefreshFlight: (
    data: OpenIDRefreshFlightFailData,
  ) => Promise<IOpenIDRefreshFlight | null>;
  findOpenIDRefreshFlight: (
    query: OpenIDRefreshFlightQuery,
  ) => Promise<IOpenIDRefreshFlight | null>;
} {
  let indexesPromise: Promise<void> | null = null;

  function ensureIndexes(): Promise<void> {
    if (!indexesPromise) {
      const OpenIDRefreshFlight = mongoose.models
        .OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
      indexesPromise = createIndexesWithRetry(OpenIDRefreshFlight).catch((error) => {
        indexesPromise = null;
        throw error;
      });
    }
    return indexesPromise;
  }

  async function acquireOpenIDRefreshFlight(
    data: OpenIDRefreshFlightCreateData,
  ): Promise<OpenIDRefreshFlightAcquireResult> {
    const OpenIDRefreshFlight = mongoose.models.OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
    const now = new Date();

    await ensureIndexes();

    try {
      const flight = await OpenIDRefreshFlight.create({
        ...data,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      return { acquired: true, flight };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        logger.debug('[acquireOpenIDRefreshFlight] Error creating flight:', error);
        throw error;
      }
    }

    try {
      const reclaimed = await OpenIDRefreshFlight.findOneAndUpdate(
        {
          key: data.key,
          $or: [
            { status: 'failed' },
            { expiresAt: { $lte: now } },
            { status: 'pending', lockExpiresAt: { $lte: now } },
          ],
        },
        {
          $set: {
            ownerId: data.ownerId,
            status: 'pending',
            lockExpiresAt: data.lockExpiresAt,
            expiresAt: data.expiresAt,
            updatedAt: now,
          },
          $unset: {
            encryptedResult: '',
            errorMessage: '',
          },
        },
        { new: true },
      ).lean<IOpenIDRefreshFlight>();

      if (reclaimed) {
        return { acquired: true, flight: reclaimed };
      }

      const existing = await OpenIDRefreshFlight.findOne({
        key: data.key,
        expiresAt: { $gt: now },
      }).lean<IOpenIDRefreshFlight>();

      return { acquired: false, flight: existing };
    } catch (error) {
      logger.debug('[acquireOpenIDRefreshFlight] Error acquiring flight:', error);
      throw error;
    }
  }

  async function completeOpenIDRefreshFlight(
    data: OpenIDRefreshFlightCompleteData,
  ): Promise<IOpenIDRefreshFlight | null> {
    try {
      const OpenIDRefreshFlight = mongoose.models
        .OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
      return await OpenIDRefreshFlight.findOneAndUpdate(
        {
          key: data.key,
          ownerId: data.ownerId,
          status: 'pending',
        },
        {
          $set: {
            status: 'completed',
            encryptedResult: data.encryptedResult,
            expiresAt: data.expiresAt,
            updatedAt: new Date(),
          },
          $unset: {
            errorMessage: '',
          },
        },
        { new: true },
      ).lean<IOpenIDRefreshFlight>();
    } catch (error) {
      logger.debug('[completeOpenIDRefreshFlight] Error completing flight:', error);
      throw error;
    }
  }

  async function renewOpenIDRefreshFlight(
    data: OpenIDRefreshFlightRenewData,
  ): Promise<IOpenIDRefreshFlight | null> {
    try {
      const OpenIDRefreshFlight = mongoose.models
        .OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
      return await OpenIDRefreshFlight.findOneAndUpdate(
        {
          key: data.key,
          ownerId: data.ownerId,
          status: 'pending',
        },
        {
          $set: {
            lockExpiresAt: data.lockExpiresAt,
            expiresAt: data.expiresAt,
            updatedAt: new Date(),
          },
        },
        { new: true },
      ).lean<IOpenIDRefreshFlight>();
    } catch (error) {
      logger.debug('[renewOpenIDRefreshFlight] Error renewing flight:', error);
      throw error;
    }
  }

  async function failOpenIDRefreshFlight(
    data: OpenIDRefreshFlightFailData,
  ): Promise<IOpenIDRefreshFlight | null> {
    try {
      const OpenIDRefreshFlight = mongoose.models
        .OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
      return await OpenIDRefreshFlight.findOneAndUpdate(
        {
          key: data.key,
          ownerId: data.ownerId,
          status: 'pending',
        },
        {
          $set: {
            status: 'failed',
            errorMessage: data.errorMessage,
            expiresAt: data.expiresAt,
            updatedAt: new Date(),
          },
          $unset: {
            encryptedResult: '',
          },
        },
        { new: true },
      ).lean<IOpenIDRefreshFlight>();
    } catch (error) {
      logger.debug('[failOpenIDRefreshFlight] Error failing flight:', error);
      throw error;
    }
  }

  async function findOpenIDRefreshFlight(
    query: OpenIDRefreshFlightQuery,
  ): Promise<IOpenIDRefreshFlight | null> {
    try {
      const OpenIDRefreshFlight = mongoose.models
        .OpenIDRefreshFlight as Model<IOpenIDRefreshFlight>;
      return await OpenIDRefreshFlight.findOne({
        key: query.key,
        expiresAt: { $gt: new Date() },
      }).lean<IOpenIDRefreshFlight>();
    } catch (error) {
      logger.debug('[findOpenIDRefreshFlight] Error finding flight:', error);
      throw error;
    }
  }

  return {
    acquireOpenIDRefreshFlight,
    renewOpenIDRefreshFlight,
    completeOpenIDRefreshFlight,
    failOpenIDRefreshFlight,
    findOpenIDRefreshFlight,
  };
}

export type OpenIDRefreshFlightMethods = ReturnType<typeof createOpenIDRefreshFlightMethods>;
