import type { IntegrationAttachedFile } from 'librechat-data-provider';

export function integrationAttachedFilesToFiles(attached: IntegrationAttachedFile[]): File[] {
  return attached.map(({ fileName, mimeType, contentBase64 }) => {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mimeType, lastModified: Date.now() });
  });
}
