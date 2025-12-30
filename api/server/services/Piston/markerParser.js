/**
 * Markers used to delimit file content in stdout
 */
const FILE_START_MARKER = '===LIBRECHAT_FILE_START===';
const FILE_END_MARKER = '===LIBRECHAT_FILE_END===';
const MAX_FILE_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB per extracted file
const MAX_STDOUT_SIZE = 50 * 1024 * 1024; // 50MB total stdout

/**
 * Sanitizes a filename to prevent path traversal and filesystem issues
 * @param {string} filename - Raw filename from user code output
 * @returns {string} Sanitized filename safe for filesystem operations
 */
function sanitizeFilename(filename) {
  if (!filename) {
    return 'untitled';
  }

  // Remove dangerous characters and path components
  const cleaned = filename
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1f\\/]/g, '_') // Replace dangerous chars with underscore
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.{2,}/g, '.') // Replace multiple consecutive dots with single dot
    .trim();

  // Limit length (filesystem limit is usually 255, leave room for prefix)
  const maxLength = 200;
  const truncated = cleaned.slice(0, maxLength);

  // Ensure not empty after sanitization
  return truncated || 'untitled';
}

/**
 * Extracts files embedded in stdout by the executed code.
 *
 * Expected format in stdout:
 * ===LIBRECHAT_FILE_START===
 * filename.ext
 * base64|utf8
 * <file content>
 * ===LIBRECHAT_FILE_END===
 *
 * @param {string} stdout - The stdout output from Piston execution
 * @returns {{cleanedOutput: string, files: Array}} Object containing cleaned output and extracted files
 */
function extractFilesFromStdout(stdout) {
  // Handle empty input
  if (!stdout || stdout.length === 0) {
    return { cleanedOutput: '', files: [] };
  }

  // Prevent ReDoS attacks with pathologically large inputs
  if (stdout.length > MAX_STDOUT_SIZE) {
    const { logger } = require('@librechat/data-schemas');
    const sizeMB = (stdout.length / 1024 / 1024).toFixed(2);
    logger.warn(
      `[Piston] Stdout size (${sizeMB}MB) exceeds ${MAX_STDOUT_SIZE / 1024 / 1024}MB limit. ` +
        `Skipping file extraction to prevent regex performance issues.`,
    );
    // Return truncated output for display, but no files
    return {
      cleanedOutput:
        stdout.slice(0, 100000) + '\n\n[Output truncated - too large for file extraction]',
      files: [],
    };
  }

  const files = [];
  const { logger } = require('@librechat/data-schemas');

  // Track which marker blocks to remove (including oversized ones)
  const markersToRemove = [];

  // Use string methods instead of regex to avoid catastrophic backtracking
  // with very large content
  let searchStart = 0;
  while (true) {
    // Find next start marker
    const startMarkerIndex = stdout.indexOf(FILE_START_MARKER, searchStart);
    if (startMarkerIndex === -1) {
      break; // No more files
    }

    // Find the end marker after the start marker
    const endMarkerIndex = stdout.indexOf(
      FILE_END_MARKER,
      startMarkerIndex + FILE_START_MARKER.length,
    );
    if (endMarkerIndex === -1) {
      break; // No matching end marker, malformed
    }

    // Extract the block between markers
    const blockStart = startMarkerIndex + FILE_START_MARKER.length + 1; // +1 for newline
    const blockEnd = endMarkerIndex - 1; // -1 for newline before end marker
    const block = stdout.substring(blockStart, blockEnd);

    // Parse the block: line 1 = filename, line 2 = encoding, rest = content
    const firstNewline = block.indexOf('\n');
    const secondNewline = block.indexOf('\n', firstNewline + 1);

    if (firstNewline === -1 || secondNewline === -1) {
      // Malformed block, skip it but track for removal
      searchStart = endMarkerIndex + FILE_END_MARKER.length;
      markersToRemove.push({
        start: startMarkerIndex,
        end: endMarkerIndex + FILE_END_MARKER.length,
        filename: 'malformed',
      });
      continue;
    }

    const filename = block.substring(0, firstNewline).trim();
    const encoding = block.substring(firstNewline + 1, secondNewline).trim();
    const content = block.substring(secondNewline + 1).trim();

    // Validate encoding
    if (encoding !== 'base64' && encoding !== 'utf8') {
      searchStart = endMarkerIndex + FILE_END_MARKER.length;
      markersToRemove.push({
        start: startMarkerIndex,
        end: endMarkerIndex + FILE_END_MARKER.length,
        filename: filename,
      });
      continue;
    }

    // Always track this match for removal from output
    markersToRemove.push({
      start: startMarkerIndex,
      end: endMarkerIndex + FILE_END_MARKER.length,
      filename: filename,
    });

    // Check size before adding to prevent memory exhaustion
    if (content.length > MAX_FILE_CONTENT_SIZE) {
      logger.warn(
        `[Piston] File "${filename}" exceeds ${MAX_FILE_CONTENT_SIZE / 1024 / 1024}MB limit ` +
          `(${content.length} bytes), skipping extraction but removing from output`,
      );
      searchStart = endMarkerIndex + FILE_END_MARKER.length;
      continue;
    }

    files.push({
      filename: sanitizeFilename(filename),
      encoding: encoding,
      content: content,
    });

    // Move search position past this marker block
    searchStart = endMarkerIndex + FILE_END_MARKER.length;
  }

  // Remove all marker blocks from output (including oversized ones)
  // Build cleaned output by skipping marker block ranges
  let cleanedOutput = '';
  let lastIndex = 0;

  for (const marker of markersToRemove) {
    // Add content before this marker
    cleanedOutput += stdout.slice(lastIndex, marker.start);
    lastIndex = marker.end;
  }
  // Add any remaining content after last marker
  cleanedOutput += stdout.slice(lastIndex);

  cleanedOutput = cleanedOutput.trim();

  return { cleanedOutput, files };
}

/**
 * Validates that a file extraction result is valid
 * @param {Object} file - Extracted file object
 * @returns {boolean} True if valid
 */
function validateExtractedFile(file) {
  if (!file.filename || file.filename.length === 0) {
    return false;
  }

  if (file.encoding !== 'base64' && file.encoding !== 'utf8') {
    return false;
  }

  if (!file.content || file.content.length === 0) {
    return false;
  }

  // Validate base64 content if encoding is base64
  if (file.encoding === 'base64') {
    try {
      Buffer.from(file.content, 'base64');
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

module.exports = {
  FILE_START_MARKER,
  FILE_END_MARKER,
  MAX_FILE_CONTENT_SIZE,
  MAX_STDOUT_SIZE,
  extractFilesFromStdout,
  validateExtractedFile,
  sanitizeFilename,
};
