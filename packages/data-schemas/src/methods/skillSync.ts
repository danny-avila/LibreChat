import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import { encryptV2, decryptV2 } from '~/crypto';
import type {
  ISkillSyncStatus,
  SkillSyncProvider,
  SkillSyncRunStatus,
  ISkillSyncStatusDocument,
  ISkillSyncCredential,
  ISkillSyncCredentialDocument,
} from '~/types/skillSync';

const LOCK_SOURCE_ID = '__global_lock__';

export type SkillSyncCredentialSummary = {
  provider: SkillSyncProvider;
  credentialKey: string;
  credentialPresent: boolean;
  tokenFingerprint?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpsertSkillSyncCredentialInput = {
  provider: SkillSyncProvider;
  credentialKey: string;
  token: string;
  userId?: Types.ObjectId;
};

export type SkillSyncStatusInput = {
  provider: SkillSyncProvider;
  sourceId: string;
  status: SkillSyncRunStatus;
  credentialKey?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  paths?: string[];
  startedAt?: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  syncedSkillCount?: number;
  syncedFileCount?: number;
  deletedSkillCount?: number;
  deletedFileCount?: number;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function summarizeCredential(
  credential: Pick<
    ISkillSyncCredential,
    'provider' | 'credentialKey' | 'tokenHash' | 'createdAt' | 'updatedAt'
  >,
): SkillSyncCredentialSummary {
  return {
    provider: credential.provider,
    credentialKey: credential.credentialKey,
    credentialPresent: true,
    tokenFingerprint: credential.tokenHash.slice(0, 12),
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

export function createSkillSyncMethods(mongoose: typeof import('mongoose')) {
  async function upsertSkillSyncCredential(
    input: UpsertSkillSyncCredentialInput,
  ): Promise<SkillSyncCredentialSummary> {
    const Credential = mongoose.models.SkillSyncCredential as Model<ISkillSyncCredentialDocument>;
    const encryptedToken = await encryptV2(input.token);
    const tokenHash = hashToken(input.token);
    const update = {
      $set: {
        encryptedToken,
        tokenHash,
        updatedBy: input.userId,
      },
      $setOnInsert: {
        provider: input.provider,
        credentialKey: input.credentialKey,
        createdBy: input.userId,
      },
    };
    const credential = await Credential.findOneAndUpdate(
      { provider: input.provider, credentialKey: input.credentialKey },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .select('+tokenHash')
      .lean();
    return summarizeCredential(credential as ISkillSyncCredential);
  }

  async function deleteSkillSyncCredential(
    provider: SkillSyncProvider,
    credentialKey: string,
  ): Promise<{ deleted: boolean }> {
    const Credential = mongoose.models.SkillSyncCredential as Model<ISkillSyncCredentialDocument>;
    const result = await Credential.deleteOne({ provider, credentialKey });
    return { deleted: (result.deletedCount ?? 0) > 0 };
  }

  async function listSkillSyncCredentials(
    provider: SkillSyncProvider,
  ): Promise<SkillSyncCredentialSummary[]> {
    const Credential = mongoose.models.SkillSyncCredential as Model<ISkillSyncCredentialDocument>;
    const rows = await Credential.find({ provider }).select('+tokenHash').sort({ credentialKey: 1 }).lean();
    return rows.map((row) => summarizeCredential(row as ISkillSyncCredential));
  }

  async function getSkillSyncCredentialToken(
    provider: SkillSyncProvider,
    credentialKey: string,
  ): Promise<string | null> {
    const Credential = mongoose.models.SkillSyncCredential as Model<ISkillSyncCredentialDocument>;
    const credential = await Credential.findOne({ provider, credentialKey })
      .select('+encryptedToken')
      .lean();
    if (!credential) {
      return null;
    }
    return decryptV2((credential as ISkillSyncCredential).encryptedToken);
  }

  async function getSkillSyncCredentialSummary(
    provider: SkillSyncProvider,
    credentialKey: string,
  ): Promise<SkillSyncCredentialSummary | null> {
    const Credential = mongoose.models.SkillSyncCredential as Model<ISkillSyncCredentialDocument>;
    const credential = await Credential.findOne({ provider, credentialKey })
      .select('+tokenHash')
      .lean();
    if (!credential) {
      return null;
    }
    return summarizeCredential(credential as ISkillSyncCredential);
  }

  async function listSkillSyncStatuses(provider: SkillSyncProvider): Promise<ISkillSyncStatus[]> {
    const Status = mongoose.models.SkillSyncStatus as Model<ISkillSyncStatusDocument>;
    const rows = await Status.find({ provider, sourceId: { $ne: LOCK_SOURCE_ID } })
      .sort({ sourceId: 1 })
      .lean<ISkillSyncStatus[]>();
    return rows;
  }

  async function getSkillSyncStatus(
    provider: SkillSyncProvider,
    sourceId: string,
  ): Promise<ISkillSyncStatus | null> {
    const Status = mongoose.models.SkillSyncStatus as Model<ISkillSyncStatusDocument>;
    const row = await Status.findOne({ provider, sourceId }).lean<ISkillSyncStatus | null>();
    return row ?? null;
  }

  async function upsertSkillSyncStatus(input: SkillSyncStatusInput): Promise<ISkillSyncStatus> {
    const Status = mongoose.models.SkillSyncStatus as Model<ISkillSyncStatusDocument>;
    const now = new Date();
    const success = input.status === 'succeeded';
    const failure = input.status === 'failed';
    const setPayload: Partial<ISkillSyncStatus> = {
      status: input.status,
      credentialKey: input.credentialKey,
      owner: input.owner,
      repo: input.repo,
      ref: input.ref,
      paths: input.paths,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      syncedSkillCount: input.syncedSkillCount ?? 0,
      syncedFileCount: input.syncedFileCount ?? 0,
      deletedSkillCount: input.deletedSkillCount ?? 0,
      deletedFileCount: input.deletedFileCount ?? 0,
      ...(success ? { lastSuccessAt: input.finishedAt ?? now } : {}),
      ...(failure ? { lastFailureAt: input.finishedAt ?? now } : {}),
    };
    const row = await Status.findOneAndUpdate(
      { provider: input.provider, sourceId: input.sourceId },
      {
        $set: setPayload,
        $setOnInsert: {
          provider: input.provider,
          sourceId: input.sourceId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<ISkillSyncStatus>();
    return row;
  }

  async function tryAcquireSkillSyncLock(params: {
    provider: SkillSyncProvider;
    lockOwner: string;
    leaseMs: number;
  }): Promise<boolean> {
    const Status = mongoose.models.SkillSyncStatus as Model<ISkillSyncStatusDocument>;
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + params.leaseMs);
    const existing = await Status.findOne({
      provider: params.provider,
      sourceId: LOCK_SOURCE_ID,
    }).lean<ISkillSyncStatus | null>();
    if (
      existing?.lockOwner &&
      existing.lockOwner !== params.lockOwner &&
      existing.lockExpiresAt &&
      existing.lockExpiresAt > now
    ) {
      return false;
    }
    if (!existing) {
      try {
        await Status.create({
          provider: params.provider,
          sourceId: LOCK_SOURCE_ID,
          status: 'running',
          lockOwner: params.lockOwner,
          lockExpiresAt,
          startedAt: now,
        });
        return true;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          return false;
        }
        throw error;
      }
    }
    try {
      const row = await Status.findOneAndUpdate(
        {
          provider: params.provider,
          sourceId: LOCK_SOURCE_ID,
          $or: [
            { lockExpiresAt: { $exists: false } },
            { lockExpiresAt: { $lte: now } },
            { lockOwner: params.lockOwner },
          ],
        },
        {
          $set: {
            status: 'running',
            lockOwner: params.lockOwner,
            lockExpiresAt,
            startedAt: now,
          },
          $setOnInsert: {
            provider: params.provider,
            sourceId: LOCK_SOURCE_ID,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      return (row as ISkillSyncStatus | null)?.lockOwner === params.lockOwner;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return false;
      }
      throw error;
    }
  }

  async function releaseSkillSyncLock(params: {
    provider: SkillSyncProvider;
    lockOwner: string;
  }): Promise<void> {
    const Status = mongoose.models.SkillSyncStatus as Model<ISkillSyncStatusDocument>;
    await Status.updateOne(
      { provider: params.provider, sourceId: LOCK_SOURCE_ID, lockOwner: params.lockOwner },
      {
        $set: {
          status: 'idle',
          finishedAt: new Date(),
        },
        $unset: {
          lockOwner: '',
          lockExpiresAt: '',
        },
      },
    );
  }

  return {
    upsertSkillSyncCredential,
    deleteSkillSyncCredential,
    listSkillSyncCredentials,
    getSkillSyncCredentialToken,
    getSkillSyncCredentialSummary,
    listSkillSyncStatuses,
    getSkillSyncStatus,
    upsertSkillSyncStatus,
    tryAcquireSkillSyncLock,
    releaseSkillSyncLock,
  };
}

export type SkillSyncMethods = ReturnType<typeof createSkillSyncMethods>;
