import { canToolResourceConsume } from './resolve-llm-delivery-path';
import { fileConfig, retrievalMimeTypes } from './file-config';
import { FileContext, FileSources } from './types/files';
import { EToolResources } from './types/tools';

/** Storage backends whose original bytes can be provisioned to Run Code. */
export const projectFileSources = [
  FileSources.local,
  FileSources.s3,
  FileSources.cloudfront,
  FileSources.azure_blob,
  FileSources.firebase,
];

export function isProjectFileSource(source?: string): source is FileSources {
  return projectFileSources.some((candidate) => candidate === source);
}

export type ProjectFileInput = {
  embedded?: boolean;
  context?: string;
  source?: string;
  type?: string;
  expiredAt?: Date | number | string | null;
};

/** Project membership authorizes reuse of owner-scoped uploads and generated outputs. */
export function getProjectFileAvailability(
  file: ProjectFileInput | null | undefined,
  codeExecution = false,
): 'ready' | 'unavailable' {
  if (file == null) {
    return 'unavailable';
  }
  const searchable = file.embedded === true && file.context === FileContext.message_attachment;
  const codeFile =
    codeExecution &&
    (file.context === FileContext.message_attachment ||
      file.context === FileContext.execute_code ||
      file.context === FileContext.run_artifact) &&
    isProjectFileSource(file.source) &&
    canToolResourceConsume(EToolResources.execute_code, file.type ?? '');
  if (!searchable && !codeFile) {
    return 'unavailable';
  }
  if (file.expiredAt != null) {
    const expiry = new Date(file.expiredAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return 'unavailable';
    }
  }
  return 'ready';
}

/** Keep searchable uploads on their existing route; data files use Run Code without indexing. */
export function getProjectUploadResource(
  mimeType: string,
  permissions: { fileSearch: boolean; codeExecution: boolean },
): EToolResources.file_search | EToolResources.execute_code | undefined {
  if (permissions.fileSearch && fileConfig.checkType(mimeType, retrievalMimeTypes)) {
    return EToolResources.file_search;
  }
  if (permissions.codeExecution && canToolResourceConsume(EToolResources.execute_code, mimeType)) {
    return EToolResources.execute_code;
  }
  if (permissions.fileSearch && canToolResourceConsume(EToolResources.file_search, mimeType)) {
    return EToolResources.file_search;
  }
  return undefined;
}
