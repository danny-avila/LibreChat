export type FileDownloadResult = {
  url: string;
  filename?: string;
};

const getParameterValue = (match: RegExpMatchArray | null): string | undefined => {
  const value = match?.[1] ?? match?.[2];
  return value?.trim() || undefined;
};

/**
 * Extracts a filename from Content-Disposition, preferring RFC 5987's
 * UTF-8-aware filename* parameter over the ASCII filename fallback.
 */
export const getDownloadFilename = (contentDisposition: unknown): string | undefined => {
  if (typeof contentDisposition !== 'string') {
    return undefined;
  }

  const extendedValue = getParameterValue(
    contentDisposition.match(/(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i),
  );
  if (extendedValue) {
    const encodedFilename = extendedValue.match(/^[^']*'[^']*'(.*)$/)?.[1] ?? extendedValue;
    try {
      const decodedFilename = decodeURIComponent(encodedFilename);
      if (decodedFilename) {
        return decodedFilename;
      }
    } catch {
      // Fall through to the plain filename parameter.
    }
  }

  const filename = getParameterValue(
    contentDisposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/i),
  );
  return filename?.replace(/\\(["\\])/g, '$1') || undefined;
};
