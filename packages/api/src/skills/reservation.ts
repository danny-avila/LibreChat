import { FileContext, FileSources } from 'librechat-data-provider';
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
  getStrategyFunctions: (source: string) => {
    saveBuffer?: unknown;
    deleteFile?: unknown;
    getFileURL?: FutureURL | null;
  };
}) {
  return async (
    config: TConfig | Promise<TConfig>,
    params: { userId: string; fileName: string; isImage: boolean; tenantId?: string },
  ): Promise<SkillBlobReservation & { source: string }> => {
    const source = deps.getFileStrategy(await config, {
      context: FileContext.skill_file,
      isImage: params.isImage,
    });
    const strategy = deps.getStrategyFunctions(source);
    if (!strategy.saveBuffer || !strategy.deleteFile) {
      throw new Error('Skill storage cannot guarantee cleanup');
    }
    return {
      source,
      ...(await reserveSkillBlob({
        source,
        userId: params.userId,
        fileName: params.fileName,
        tenantId: params.tenantId,
        getFileURL: strategy.getFileURL,
      })),
    };
  };
}
