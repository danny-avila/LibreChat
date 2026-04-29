const BINARY_CHECK_BYTES = 8192;
const BINARY_THRESHOLD = 0.1;

/**
 * Determine whether a buffer contains binary (non-text) content.
 * Scans the first 8 KB for null bytes and non-printable character ratio.
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_CHECK_BYTES);
  if (len === 0) {
    return false;
  }
  let nonPrintable = 0;
  for (let i = 0; i < len; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    }
  }
  return nonPrintable / len > BINARY_THRESHOLD;
}
