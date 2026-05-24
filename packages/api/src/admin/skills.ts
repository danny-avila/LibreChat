import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type {
  TGitHubSkillSyncStatusResponse,
  TGitHubSkillSyncSourceStatus,
  TGitHubSkillSyncCredentialSummary,
  TGitHubSkillSyncManualRunResponse,
} from 'librechat-data-provider';
import type {
  ISkillSyncStatus,
  SkillSyncProvider,
  SkillSyncCredentialSummary,
  UpsertSkillSyncCredentialInput,
} from '@librechat/data-schemas';
import type { GitHubSkillSyncRunner } from '~/skills/sync';

type AdminSkillsRequest = Request & {
  user?: {
    _id?: Types.ObjectId;
    id?: string;
  };
};

export type AdminSkillSyncDeps = {
  runner: GitHubSkillSyncRunner;
  upsertCredential: (
    input: UpsertSkillSyncCredentialInput,
  ) => Promise<SkillSyncCredentialSummary>;
  deleteCredential: (
    provider: SkillSyncProvider,
    credentialKey: string,
  ) => Promise<{ deleted: boolean }>;
};

const CREDENTIAL_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function toIso(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function serializeCredential(
  credential: SkillSyncCredentialSummary,
): TGitHubSkillSyncCredentialSummary {
  return {
    provider: credential.provider,
    credentialKey: credential.credentialKey,
    credentialPresent: credential.credentialPresent,
    tokenFingerprint: credential.tokenFingerprint,
    createdAt: toIso(credential.createdAt),
    updatedAt: toIso(credential.updatedAt),
  };
}

function serializeSourceStatus(
  status: ISkillSyncStatus & { credentialPresent?: boolean },
): TGitHubSkillSyncSourceStatus {
  return {
    provider: status.provider,
    sourceId: status.sourceId,
    status: status.status,
    credentialKey: status.credentialKey,
    credentialPresent: status.credentialPresent ?? false,
    owner: status.owner,
    repo: status.repo,
    ref: status.ref,
    paths: status.paths,
    startedAt: toIso(status.startedAt),
    finishedAt: toIso(status.finishedAt),
    lastSuccessAt: toIso(status.lastSuccessAt),
    lastFailureAt: toIso(status.lastFailureAt),
    errorCode: status.errorCode,
    errorMessage: status.errorMessage,
    syncedSkillCount: status.syncedSkillCount,
    syncedFileCount: status.syncedFileCount,
    deletedSkillCount: status.deletedSkillCount,
    deletedFileCount: status.deletedFileCount,
    createdAt: toIso(status.createdAt),
    updatedAt: toIso(status.updatedAt),
  };
}

function isCredentialKey(value: unknown): value is string {
  return typeof value === 'string' && CREDENTIAL_KEY_PATTERN.test(value);
}

function getUserObjectId(req: AdminSkillsRequest): Types.ObjectId | undefined {
  return req.user?._id;
}

export function createAdminSkillsSyncHandlers(deps: AdminSkillSyncDeps) {
  async function getSyncStatus(_req: Request, res: Response) {
    const status = await deps.runner.getStatus();
    const response: TGitHubSkillSyncStatusResponse = {
      enabled: status.enabled,
      intervalMinutes: status.intervalMinutes,
      runOnStartup: status.runOnStartup,
      sources: status.sources.map(serializeSourceStatus),
      credentials: status.credentials.map(serializeCredential),
      fineGrainedTokenRecommendation: status.fineGrainedTokenRecommendation,
    };
    return res.status(200).json(response);
  }

  async function runSync(_req: Request, res: Response) {
    const result = await deps.runner.runOnce();
    const response: TGitHubSkillSyncManualRunResponse = {
      status: result.status,
      message: result.message,
      sources: result.sources.map(serializeSourceStatus),
    };
    return res.status(result.status === 'skipped' ? 202 : 200).json(response);
  }

  async function setCredential(req: AdminSkillsRequest, res: Response) {
    const { credentialKey } = req.params;
    if (!isCredentialKey(credentialKey)) {
      return res.status(400).json({ error: 'Invalid credential key' });
    }
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'GitHub token is required' });
    }
    const credential = await deps.upsertCredential({
      provider: 'github',
      credentialKey,
      token: token.trim(),
      userId: getUserObjectId(req),
    });
    return res.status(200).json(serializeCredential(credential));
  }

  async function deleteCredential(req: Request, res: Response) {
    const { credentialKey } = req.params;
    if (!isCredentialKey(credentialKey)) {
      return res.status(400).json({ error: 'Invalid credential key' });
    }
    const result = await deps.deleteCredential('github', credentialKey);
    return res.status(200).json({ credentialKey, deleted: result.deleted });
  }

  return {
    getSyncStatus,
    runSync,
    setCredential,
    deleteCredential,
  };
}
