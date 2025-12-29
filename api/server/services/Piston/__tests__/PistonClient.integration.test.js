/**
 * Integration tests for Piston Code Executor
 * These tests run against the REAL public Piston API
 * 
 * Note: Tests will skip gracefully if the API is unreachable
 */

const { PistonClient } = require('../PistonClient');
const { extractFilesFromStdout } = require('../markerParser');

const PUBLIC_PISTON_URL = 'https://emkc.org/api/v2/piston';

describe('PistonClient Integration Tests (Real API)', () => {
  let client;
  let apiAvailable = false;
  let rateLimited = false;

  beforeAll(async () => {
    client = new PistonClient(PUBLIC_PISTON_URL);
    
    // Check if API is available
    try {
      await client.getRuntimes();
      apiAvailable = true;
      console.log('✓ Piston API is available, running integration tests');
    } catch (error) {
      console.warn('⚠ Piston API unavailable, skipping integration tests:', error.message);
    }
  }, 10000);

  // Helper to check if we should skip test
  const shouldSkip = () => {
    if (!apiAvailable) {
      console.warn('Skipping test - API unavailable');
      return true;
    }
    if (rateLimited) {
      console.warn('Skipping test - Rate limited by API');
      return true;
    }
    return false;
  };

  // Helper to handle rate limiting
  const handleRateLimit = (error) => {
    if (error.response && error.response.status === 429) {
      rateLimited = true;
      console.warn('⚠ Rate limited by Piston API (429) - skipping remaining tests');
      return;
    }
    throw error;
  };

  describe('Basic Python Execution', () => {
    it('should execute simple Python print statement', async () => {
      if (shouldSkip()) return;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: 'print("Hello from Piston!")',
            },
          ],
        });

        expect(result).toBeDefined();
        expect(result.run).toBeDefined();
        expect(result.run.stdout).toContain('Hello from Piston!');
        expect(result.run.code).toBe(0); // Success exit code
      } catch (error) {
        handleRateLimit(error);
      }
    });

    it('should capture stderr output', async () => {
      if (shouldSkip()) return;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: `import sys
print("stdout message")
print("stderr message", file=sys.stderr)`,
            },
          ],
        });

        expect(result.run.stdout).toContain('stdout message');
        expect(result.run.stderr).toContain('stderr message');
        expect(result.run.code).toBe(0);
      } catch (error) {
        handleRateLimit(error);
      }
    });

    it('should handle Python errors with non-zero exit code', async () => {
      if (shouldSkip()) return;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: 'raise Exception("Test error")',
            },
          ],
        });

        expect(result.run.stderr).toContain('Exception');
        expect(result.run.stderr).toContain('Test error');
        expect(result.run.code).not.toBe(0); // Non-zero exit code for error
      } catch (error) {
        handleRateLimit(error);
      }
    });
  });

  describe('File Generation - Text Files', () => {
    it('should generate and extract a simple CSV file', async () => {
      if (shouldSkip()) return;

      const pythonCode = `
# Generate a CSV file
csv_content = """name,age,city
Alice,30,New York
Bob,25,London
Charlie,35,Paris"""

# Print with markers for LibreChat to capture
print('===LIBRECHAT_FILE_START===')
print('data.csv')
print('utf8')
print(csv_content)
print('===LIBRECHAT_FILE_END===')
`;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: pythonCode,
            },
          ],
        });

        expect(result.run.code).toBe(0);
        
        // Extract files using our marker parser
        const { cleanedOutput, files } = extractFilesFromStdout(result.run.stdout);
        
        expect(files).toHaveLength(1);
        expect(files[0].filename).toBe('data.csv');
        expect(files[0].encoding).toBe('utf8');
        expect(files[0].content).toContain('Alice,30,New York');
        expect(files[0].content).toContain('Bob,25,London');
        expect(cleanedOutput).not.toContain('===LIBRECHAT_FILE_START===');
      } catch (error) {
        handleRateLimit(error);
      }
    });

    it('should generate and extract a JSON file', async () => {
      if (shouldSkip()) return;

      const pythonCode = `
import json

data = {"status": "success", "count": 42}
json_str = json.dumps(data, indent=2)

print('===LIBRECHAT_FILE_START===')
print('output.json')
print('utf8')
print(json_str)
print('===LIBRECHAT_FILE_END===')
`;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: pythonCode,
            },
          ],
        });

        expect(result.run.code).toBe(0);
        
        const { files } = extractFilesFromStdout(result.run.stdout);
        
        expect(files).toHaveLength(1);
        expect(files[0].filename).toBe('output.json');
        expect(files[0].encoding).toBe('utf8');
        
        const parsedJson = JSON.parse(files[0].content);
        expect(parsedJson.status).toBe('success');
        expect(parsedJson.count).toBe(42);
      } catch (error) {
        handleRateLimit(error);
      }
    });
  });

  describe('File Generation - Binary Files', () => {
    it('should generate and extract a simple PNG image (base64)', async () => {
      if (shouldSkip()) return;

      const pythonCode = `
import base64

# Create a minimal 1x1 red PNG (valid PNG format)
# PNG header + IHDR chunk + IDAT chunk + IEND chunk
png_bytes = bytes([
    # PNG signature
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    # IHDR chunk (1x1 image, 8-bit RGB)
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE,
    # IDAT chunk (compressed pixel data - red pixel)
    0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54,
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
    0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4,
    # IEND chunk
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82
])

# Encode to base64
png_base64 = base64.b64encode(png_bytes).decode('utf-8')

print('===LIBRECHAT_FILE_START===')
print('image.png')
print('base64')
print(png_base64)
print('===LIBRECHAT_FILE_END===')
`;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: pythonCode,
            },
          ],
        });

        expect(result.run.code).toBe(0);
        
        const { files } = extractFilesFromStdout(result.run.stdout);
        
        expect(files).toHaveLength(1);
        expect(files[0].filename).toBe('image.png');
        expect(files[0].encoding).toBe('base64');
        
        // Verify base64 content is valid
        expect(files[0].content).toMatch(/^[A-Za-z0-9+/=]+$/);
        
        // Verify we can decode it back to bytes
        const decoded = Buffer.from(files[0].content, 'base64');
        expect(decoded.length).toBeGreaterThan(0);
        
        // Verify PNG signature
        expect(decoded[0]).toBe(0x89);
        expect(decoded[1]).toBe(0x50); // 'P'
        expect(decoded[2]).toBe(0x4E); // 'N'
        expect(decoded[3]).toBe(0x47); // 'G'
      } catch (error) {
        handleRateLimit(error);
      }
    });
  });

  describe('File Generation - Multiple Files', () => {
    it('should generate and extract multiple files in one execution', async () => {
      if (shouldSkip()) return;

      const pythonCode = `
import base64

# Generate text file
print('===LIBRECHAT_FILE_START===')
print('report.txt')
print('utf8')
print('This is a test report.\\nLine 2 of the report.')
print('===LIBRECHAT_FILE_END===')

print('Processing...')

# Generate CSV file
print('===LIBRECHAT_FILE_START===')
print('data.csv')
print('utf8')
print('id,value\\n1,100\\n2,200')
print('===LIBRECHAT_FILE_END===')

# Generate binary file (tiny PNG)
png_bytes = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82
])

print('===LIBRECHAT_FILE_START===')
print('chart.png')
print('base64')
print(base64.b64encode(png_bytes).decode('utf-8'))
print('===LIBRECHAT_FILE_END===')

print('Done!')
`;

      try {
        const result = await client.execute({
          language: 'python',
          version: '*',
          files: [
            {
              name: 'main.py',
              content: pythonCode,
            },
          ],
        });

        expect(result.run.code).toBe(0);
        
        const { cleanedOutput, files } = extractFilesFromStdout(result.run.stdout);
        
        // Should extract 3 files
        expect(files).toHaveLength(3);
        
        // Verify each file
        const txtFile = files.find(f => f.filename === 'report.txt');
        expect(txtFile).toBeDefined();
        expect(txtFile.encoding).toBe('utf8');
        expect(txtFile.content).toContain('test report');
      
        const csvFile = files.find(f => f.filename === 'data.csv');
        expect(csvFile).toBeDefined();
        expect(csvFile.encoding).toBe('utf8');
        expect(csvFile.content).toContain('id,value');
        
        const pngFile = files.find(f => f.filename === 'chart.png');
        expect(pngFile).toBeDefined();
        expect(pngFile.encoding).toBe('base64');
        
        // Cleaned output should still have regular print statements
        expect(cleanedOutput).toContain('Processing...');
        expect(cleanedOutput).toContain('Done!');
        expect(cleanedOutput).not.toContain('===LIBRECHAT_FILE_START===');
      } catch (error) {
        handleRateLimit(error);
      }
    });
  });

  describe('API Error Handling', () => {
    it('should throw error for invalid language', async () => {
      if (shouldSkip()) return;

      try {
        await expect(
          client.execute({
            language: 'nonexistent-language',
            version: '*',
            files: [{ name: 'main.txt', content: 'test' }],
          })
        ).rejects.toThrow();
      } catch (error) {
        handleRateLimit(error);
      }
    });
  });
});

