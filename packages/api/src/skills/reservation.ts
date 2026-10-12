import { FileContext, FileSources } from 'librechat-data-provider';
import type { SaveBufferParams } from '~/storage/types';
import { getStorageMetadata } from '~/storage/metadata';

type FutureURL = (params: {
  userId: string;
  fileName: string;
  basePath: string;
  tenantId?: string;
}) => Promise<string>;

export interface SkillBlobReservation {
  filepath: string;
  storageKey?: string;
  storageRegion?: string;
}

type SkillStorageStrategy = {
  saveBuffer?: (params: SaveBufferParams) => Promise<string>;
  deleteFile?: unknown;
  getFileURL?: FutureURL | null;
};

type ResolvedSkillStorage = {
  source: string;
  saveBuffer: (params: SaveBufferParams) => Promise<string>;
  getFileURL?: FutureURL | null;
};

type SavedSkillBuffer = {
  filepath: string;
  source: string;
  storageKey?: string;
  storageRegion?: string;
};

/** Select and validate one Skill store; callers keep its writer for this upload. */
export function createSkillStorageResolver<TConfig>(deps: {
  getFileStrategy: (config: TConfig, options: { context: FileContext; isImage: boolean }) => string;
  getStrategyFunctions: (source: string) => SkillStorageStrategy;
}): (config: TConfig, options: { isImage: boolean }) => ResolvedSkillStorage {
  return (config: TConfig, options: { isImage: boolean }) => {
    const source = deps.getFileStrategy(config, {
      context: FileContext.skill_file,
      isImage: options.isImage,
    });
    const strategy = deps.getStrategyFunctions(source);
    if (!strategy.saveBuffer || !strategy.deleteFile) {
      throw new Error('Skill storage cannot guarantee cleanup');
    }
    return { source, saveBuffer: strategy.saveBuffer, getFileURL: strategy.getFileURL };
  };
}

/** Write with the already-reserved provider, even if live configuration changes. */
export function createSkillBufferWriter(deps: {
  getStrategyFunctions: (source: string) => SkillStorageStrategy;
}): (params: SaveBufferParams & { expectedSource: string }) => Promise<SavedSkillBuffer> {
  return async (params: SaveBufferParams & { expectedSource: string }) => {
    const { expectedSource, ...saveParams } = params;
    const strategy = deps.getStrategyFunctions(expectedSource);
    if (!strategy.saveBuffer || !strategy.deleteFile) {
      throw new Error('Skill storage cannot guarantee cleanup');
    }
    const filepath = await strategy.saveBuffer(saveParams);
    return {
      filepath,
      source: expectedSource,
      ...getStorageMetadata({ filepath, source: expectedSource }),
    };
  };
}

/**
 * All supported Skill stores can name the future object before writing it.
 * This reference goes into Mongo first, closing the upload-before-row gap.
 */
export async function reserveSkillBlob(params: {
  source: string;
  userId: string;
  fileName: string;
  tenantId?: string;
  getFileURL?: FutureURL | null;
}): Promise<SkillBlobReservation> {
  const { source, userId, fileName, tenantId, getFileURL } = params;
  if (!userId || !fileName || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Invalid Skill storage identity');
  }
  if (source === FileSources.local) {
    return { filepath: `/uploads/${userId}/${fileName}` };
  }
  if (source === FileSources.firebase) {
    const key = `uploads/${userId}/${fileName}`;
    return { filepath: `https://firebase.invalid/o/${encodeURIComponent(key)}` };
  }
  if (
    source !== FileSources.s3 &&
    source !== FileSources.cloudfront &&
    source !== FileSources.azure_blob
  ) {
    throw new Error('Unsupported Skill storage strategy');
  }
  if (!getFileURL) throw new Error('Skill storage strategy cannot reserve an object');
  const filepath = await getFileURL({ userId, fileName, basePath: 'uploads', tenantId });
  if (!filepath) throw new Error('Skill storage strategy returned no reserved object');
  return { filepath, ...getStorageMetadata({ filepath, source }) };
}

/** Selects and validates the provider before reserving a future Skill object. */
export function createSkillBlobReserver<TConfig>(deps: {
  getFileStrategy: (config: TConfig, options: { context: FileContext; isImage: boolean }) => string;
  getStrategyFunctions: (source: string) => SkillStorageStrategy;
}) {
  const resolveStorage = createSkillStorageResolver(deps);
  return async (
    config: TConfig | Promise<TConfig>,
    params: { userId: string; fileName: string; isImage: boolean; tenantId?: string },
  ): Promise<SkillBlobReservation & { source: string }> => {
    const { source, getFileURL } = resolveStorage(await config, params);
    return {
      source,
      ...(await reserveSkillBlob({
        source,
        userId: params.userId,
        fileName: params.fileName,
        tenantId: params.tenantId,
        getFileURL,
      })),
    };
  };
}
