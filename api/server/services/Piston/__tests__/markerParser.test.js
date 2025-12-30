/**
 * Unit tests for markerParser.js
 * Tests file extraction from stdout, validation, and filename sanitization
 */

const {
  extractFilesFromStdout,
  validateExtractedFile,
  sanitizeFilename,
  FILE_START_MARKER,
  FILE_END_MARKER,
  MAX_FILE_CONTENT_SIZE,
  MAX_STDOUT_SIZE,
} = require('../markerParser');

describe('markerParser', () => {
  describe('extractFilesFromStdout', () => {
    it('should extract a single UTF-8 text file', () => {
      const stdout = `Some output before
${FILE_START_MARKER}
test.txt
utf8
Hello, World!
${FILE_END_MARKER}
Some output after`;

      const { cleanedOutput, files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('test.txt');
      expect(files[0].encoding).toBe('utf8');
      expect(files[0].content).toBe('Hello, World!');

      expect(cleanedOutput).toContain('Some output before');
      expect(cleanedOutput).toContain('Some output after');
      expect(cleanedOutput).not.toContain(FILE_START_MARKER);
    });

    it('should extract a single base64 binary file', () => {
      const base64Content =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const stdout = `${FILE_START_MARKER}
image.png
base64
${base64Content}
${FILE_END_MARKER}`;

      const { cleanedOutput, files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('image.png');
      expect(files[0].encoding).toBe('base64');
      expect(files[0].content).toBe(base64Content);
      expect(cleanedOutput).toBe('');
    });

    it('should extract multiple files', () => {
      const stdout = `${FILE_START_MARKER}
file1.txt
utf8
Content 1
${FILE_END_MARKER}
Middle output
${FILE_START_MARKER}
file2.csv
utf8
a,b,c
1,2,3
${FILE_END_MARKER}`;

      const { cleanedOutput, files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(2);
      expect(files[0].filename).toBe('file1.txt');
      expect(files[0].content).toBe('Content 1');
      expect(files[1].filename).toBe('file2.csv');
      expect(files[1].content).toBe('a,b,c\n1,2,3');
      expect(cleanedOutput).toContain('Middle output');
    });

    it('should handle multiline content in files', () => {
      const multilineContent = `Line 1
Line 2
Line 3
Line 4`;
      const stdout = `${FILE_START_MARKER}
multiline.txt
utf8
${multilineContent}
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      expect(files[0].content).toBe(multilineContent);
      expect(files[0].content.split('\n')).toHaveLength(4);
    });

    it('should handle empty stdout', () => {
      const { cleanedOutput, files } = extractFilesFromStdout('');

      expect(files).toHaveLength(0);
      expect(cleanedOutput).toBe('');
    });

    it('should handle stdout with no markers', () => {
      const stdout = 'Just regular output\nNo files here';
      const { cleanedOutput, files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(0);
      expect(cleanedOutput).toBe(stdout.trim());
    });

    it('should handle malformed markers (missing end marker)', () => {
      const stdout = `${FILE_START_MARKER}
incomplete.txt
utf8
This file has no end marker
Some other output`;

      const { cleanedOutput, files } = extractFilesFromStdout(stdout);

      // Should not extract incomplete file
      expect(files).toHaveLength(0);
      // Original output should be preserved
      expect(cleanedOutput).toContain('Some other output');
    });

    it('should handle malformed markers (missing encoding)', () => {
      const stdout = `${FILE_START_MARKER}
bad.txt
This is content without encoding marker
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      // Malformed - won't match the pattern (expects encoding on line 2)
      expect(files).toHaveLength(0);
    });

    it('should skip files exceeding size limit', () => {
      // Create content larger than MAX_FILE_CONTENT_SIZE
      const largeContent = 'x'.repeat(MAX_FILE_CONTENT_SIZE + 1000);
      const stdout = `${FILE_START_MARKER}
huge.txt
utf8
${largeContent}
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      // File should be skipped due to size
      expect(files).toHaveLength(0);
    });

    it('should handle very large stdout by skipping extraction', () => {
      // Create stdout larger than MAX_STDOUT_SIZE
      const largeStdout = 'x'.repeat(MAX_STDOUT_SIZE + 1000);

      const { cleanedOutput, files } = extractFilesFromStdout(largeStdout);

      // Should skip extraction and return truncated output
      expect(files).toHaveLength(0);
      expect(cleanedOutput).toContain('[Output truncated - too large for file extraction]');
    });

    it('should sanitize filenames when extracting', () => {
      const stdout = `${FILE_START_MARKER}
../../etc/passwd
utf8
malicious content
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      // Filename should be sanitized (path traversal removed)
      expect(files[0].filename).not.toContain('..');
      expect(files[0].filename).not.toContain('/');
    });

    it('should trim whitespace from filenames', () => {
      const stdout = `${FILE_START_MARKER}
  file with spaces.txt  
utf8
content
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('file with spaces.txt');
    });

    it('should preserve content exactly (including trailing whitespace)', () => {
      const contentWithWhitespace = 'Line 1  \nLine 2\t\n  Line 3';
      const stdout = `${FILE_START_MARKER}
test.txt
utf8
${contentWithWhitespace}
${FILE_END_MARKER}`;

      const { files } = extractFilesFromStdout(stdout);

      expect(files).toHaveLength(1);
      // Content should be trimmed (as per the implementation)
      expect(files[0].content).toBe(contentWithWhitespace.trim());
    });
  });

  describe('validateExtractedFile', () => {
    it('should validate a correct UTF-8 file', () => {
      const file = {
        filename: 'test.txt',
        encoding: 'utf8',
        content: 'Hello World',
      };

      expect(validateExtractedFile(file)).toBe(true);
    });

    it('should validate a correct base64 file', () => {
      const file = {
        filename: 'image.png',
        encoding: 'base64',
        content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
      };

      expect(validateExtractedFile(file)).toBe(true);
    });

    it('should reject file with empty filename', () => {
      const file = {
        filename: '',
        encoding: 'utf8',
        content: 'content',
      };

      expect(validateExtractedFile(file)).toBe(false);
    });

    it('should reject file with missing filename', () => {
      const file = {
        encoding: 'utf8',
        content: 'content',
      };

      expect(validateExtractedFile(file)).toBe(false);
    });

    it('should reject file with invalid encoding', () => {
      const file = {
        filename: 'test.txt',
        encoding: 'invalid-encoding',
        content: 'content',
      };

      expect(validateExtractedFile(file)).toBe(false);
    });

    it('should reject file with empty content', () => {
      const file = {
        filename: 'test.txt',
        encoding: 'utf8',
        content: '',
      };

      expect(validateExtractedFile(file)).toBe(false);
    });

    it('should reject file with missing content', () => {
      const file = {
        filename: 'test.txt',
        encoding: 'utf8',
      };

      expect(validateExtractedFile(file)).toBe(false);
    });

    it('should accept any base64-like content (Buffer.from is lenient)', () => {
      // Note: Buffer.from(content, 'base64') doesn't throw errors for invalid base64
      // It just decodes what it can, so this validation is lenient
      const file = {
        filename: 'image.png',
        encoding: 'base64',
        content: 'This is not valid base64!!!@@##',
      };

      // The implementation accepts this because Buffer.from doesn't throw
      expect(validateExtractedFile(file)).toBe(true);
    });

    it('should accept base64 with padding', () => {
      const file = {
        filename: 'data.bin',
        encoding: 'base64',
        content: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
      };

      expect(validateExtractedFile(file)).toBe(true);
    });
  });

  describe('sanitizeFilename', () => {
    it('should leave clean filenames unchanged', () => {
      expect(sanitizeFilename('file.txt')).toBe('file.txt');
      expect(sanitizeFilename('my-file_v2.csv')).toBe('my-file_v2.csv');
      expect(sanitizeFilename('data.json')).toBe('data.json');
    });

    it('should remove path traversal attempts', () => {
      // Process: 1) Replace slashes, 2) Remove leading dots, 3) Collapse consecutive dots
      expect(sanitizeFilename('../etc/passwd')).toBe('_etc_passwd');
      // '../../secret.txt' → '.._.._secret.txt' → '_.._secret.txt' → '_._secret.txt'
      expect(sanitizeFilename('../../secret.txt')).toBe('_._secret.txt');
      expect(sanitizeFilename('./file.txt')).toBe('_file.txt');
    });

    it('should replace dangerous characters with underscore', () => {
      expect(sanitizeFilename('file<name>.txt')).toBe('file_name_.txt');
      expect(sanitizeFilename('bad:file|name?.txt')).toBe('bad_file_name_.txt');
      expect(sanitizeFilename('file"with"quotes.txt')).toBe('file_with_quotes.txt');
    });

    it('should handle forward and backward slashes', () => {
      expect(sanitizeFilename('path/to/file.txt')).toBe('path_to_file.txt');
      expect(sanitizeFilename('path\\to\\file.txt')).toBe('path_to_file.txt');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('hidden');
      expect(sanitizeFilename('..double')).toBe('double');
      expect(sanitizeFilename('...triple')).toBe('triple');
    });

    it('should collapse multiple consecutive dots', () => {
      expect(sanitizeFilename('file...txt')).toBe('file.txt');
      expect(sanitizeFilename('bad....name.csv')).toBe('bad.name.csv');
    });

    it('should trim whitespace', () => {
      expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
      // Control characters like \t and \n are replaced with _ first (they're in \x00-\x1f range)
      expect(sanitizeFilename('\tfile.txt\n')).toBe('_file.txt_');
    });

    it('should handle empty or whitespace-only filenames', () => {
      expect(sanitizeFilename('')).toBe('untitled');
      expect(sanitizeFilename('   ')).toBe('untitled');
      expect(sanitizeFilename(null)).toBe('untitled');
      expect(sanitizeFilename(undefined)).toBe('untitled');
    });

    it('should truncate very long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName);

      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toContain('a');
    });

    it('should handle filenames that become empty after sanitization', () => {
      expect(sanitizeFilename('...')).toBe('untitled');
      // '<>:|?*' = 6 dangerous characters → 6 underscores
      expect(sanitizeFilename('<>:|?*')).toBe('______');
    });

    it('should preserve file extensions', () => {
      expect(sanitizeFilename('my file.txt')).toBe('my file.txt');
      expect(sanitizeFilename('data.2024.csv')).toBe('data.2024.csv');
    });

    it('should handle unicode characters', () => {
      expect(sanitizeFilename('файл.txt')).toBe('файл.txt');
      expect(sanitizeFilename('文件.csv')).toBe('文件.csv');
      expect(sanitizeFilename('🎉test.json')).toBe('🎉test.json');
    });

    it('should handle control characters', () => {
      const withControlChars = 'file\x00name\x1F.txt';
      const result = sanitizeFilename(withControlChars);

      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x1F');
      expect(result).toContain('_');
    });
  });
});
