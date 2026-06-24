import { inferMimeType } from 'librechat-data-provider';
import type { IntegrationAttachedFile } from 'librechat-data-provider';

export function integrationAttachedFilesToFiles(attached: IntegrationAttachedFile[]): File[] {
  return attached.map(({ fileName, mimeType, contentBase64 }) => {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const resolvedMimeType = inferMimeType(fileName, mimeType);
    return new File([bytes], fileName, { type: resolvedMimeType, lastModified: Date.now() });
  });
}
