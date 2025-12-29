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
    .replace(/[<>:"|?*\x00-\x1f\\/]/g, '_')  // Replace dangerous chars with underscore
    .replace(/^\.+/, '')                      // Remove leading dots
    .replace(/\.{2,}/g, '.')                  // Replace multiple consecutive dots with single dot
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
      `Skipping file extraction to prevent regex performance issues.`
    );
    // Return truncated output for display, but no files
    return { 
      cleanedOutput: stdout.slice(0, 100000) + '\n\n[Output truncated - too large for file extraction]',
      files: [] 
    };
  }
  
  const files = [];
  const { logger } = require('@librechat/data-schemas');

  // Match marker blocks: START -> filename -> encoding -> content -> END
  const filePattern = new RegExp(
    `${FILE_START_MARKER}\\n` +
      `(.+?)\\n` + // filename (line 1)
      `(base64|utf8)\\n` + // encoding (line 2)
      `([\\s\\S]+?)\\n` + // content (line 3+, can be multiline)
      `${FILE_END_MARKER}`,
    'g',
  );

  // Track which marker blocks to remove (including oversized ones)
  const markersToRemove = [];
  
  let match;
  while ((match = filePattern.exec(stdout)) !== null) {
    const content = match[3].trim();
    const filename = match[1].trim();
    
    // Always track this match for removal from output
    markersToRemove.push({
      start: match.index,
      end: match.index + match[0].length,
      filename: filename,
    });
    
    // Check size before adding to prevent memory exhaustion
    if (content.length > MAX_FILE_CONTENT_SIZE) {
      logger.warn(
        `[Piston] File "${filename}" exceeds ${MAX_FILE_CONTENT_SIZE / 1024 / 1024}MB limit ` +
        `(${content.length} bytes), skipping extraction but removing from output`
      );
      continue;
    }
    
    files.push({
      filename: sanitizeFilename(filename),
      encoding: match[2],
      content: content,
    });
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

