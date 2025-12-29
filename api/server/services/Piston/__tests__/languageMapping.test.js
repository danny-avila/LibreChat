/**
 * Unit tests for languageMapping.js
 * Tests language configuration and mapping
 */

const { getLanguageConfig, LANGUAGE_MAP } = require('../languageMapping');

describe('languageMapping', () => {
  describe('getLanguageConfig', () => {
    describe('Python support', () => {
      it('should return config for "python"', () => {
        const config = getLanguageConfig('python');

        expect(config).toBeDefined();
        expect(config.pistonName).toBe('python');
        expect(config.extension).toBe('py');
        expect(config.defaultVersion).toBe('*');
      });

      it('should return config for "py" alias', () => {
        const config = getLanguageConfig('py');

        expect(config).toBeDefined();
        expect(config.pistonName).toBe('python');
        expect(config.extension).toBe('py');
        expect(config.defaultVersion).toBe('*');
      });

      it('should handle case-insensitive input', () => {
        const config1 = getLanguageConfig('PYTHON');
        const config2 = getLanguageConfig('Python');
        const config3 = getLanguageConfig('PY');

        expect(config1.pistonName).toBe('python');
        expect(config2.pistonName).toBe('python');
        expect(config3.pistonName).toBe('python');
      });
    });

    describe('Other supported languages', () => {
      it('should support JavaScript', () => {
        const config = getLanguageConfig('javascript');
        expect(config.pistonName).toBe('javascript');
        expect(config.extension).toBe('js');
      });

      it('should support JavaScript alias "js"', () => {
        const config = getLanguageConfig('js');
        expect(config.pistonName).toBe('javascript');
        expect(config.extension).toBe('js');
      });

      it('should support TypeScript', () => {
        const config = getLanguageConfig('typescript');
        expect(config.pistonName).toBe('typescript');
        expect(config.extension).toBe('ts');
      });

      it('should support Java', () => {
        const config = getLanguageConfig('java');
        expect(config.pistonName).toBe('java');
        expect(config.extension).toBe('java');
      });

      it('should support C++', () => {
        const config = getLanguageConfig('cpp');
        expect(config.pistonName).toBe('cpp');
        expect(config.extension).toBe('cpp');
      });

      it('should support C++ alias "c++"', () => {
        const config = getLanguageConfig('c++');
        expect(config.pistonName).toBe('cpp');
        expect(config.extension).toBe('cpp');
      });

      it('should support C', () => {
        const config = getLanguageConfig('c');
        expect(config.pistonName).toBe('c');
        expect(config.extension).toBe('c');
      });

      it('should support Bash', () => {
        const config = getLanguageConfig('bash');
        expect(config.pistonName).toBe('bash');
        expect(config.extension).toBe('sh');
      });

      it('should support shell aliases', () => {
        const config1 = getLanguageConfig('sh');
        const config2 = getLanguageConfig('shell');

        expect(config1.pistonName).toBe('bash');
        expect(config2.pistonName).toBe('bash');
      });

      it('should support R', () => {
        const config = getLanguageConfig('r');
        expect(config.pistonName).toBe('r');
        expect(config.extension).toBe('r');
      });

      it('should support Go', () => {
        const config = getLanguageConfig('go');
        expect(config.pistonName).toBe('go');
        expect(config.extension).toBe('go');
      });

      it('should support Rust', () => {
        const config = getLanguageConfig('rust');
        expect(config.pistonName).toBe('rust');
        expect(config.extension).toBe('rs');
      });

      it('should support Rust alias "rs"', () => {
        const config = getLanguageConfig('rs');
        expect(config.pistonName).toBe('rust');
        expect(config.extension).toBe('rs');
      });

      it('should support PHP', () => {
        const config = getLanguageConfig('php');
        expect(config.pistonName).toBe('php');
        expect(config.extension).toBe('php');
      });

      it('should support Ruby', () => {
        const config = getLanguageConfig('ruby');
        expect(config.pistonName).toBe('ruby');
        expect(config.extension).toBe('rb');
      });

      it('should support Ruby alias "rb"', () => {
        const config = getLanguageConfig('rb');
        expect(config.pistonName).toBe('ruby');
        expect(config.extension).toBe('rb');
      });
    });

    describe('Error handling', () => {
      it('should throw error for unsupported language', () => {
        expect(() => getLanguageConfig('cobol')).toThrow();
        expect(() => getLanguageConfig('fortran')).toThrow();
        expect(() => getLanguageConfig('nonexistent')).toThrow();
      });

      it('should throw descriptive error message', () => {
        expect(() => getLanguageConfig('unsupported-lang')).toThrow(/Unsupported language/);
        expect(() => getLanguageConfig('unsupported-lang')).toThrow(/unsupported-lang/);
      });

      it('should suggest supported languages in error', () => {
        try {
          getLanguageConfig('invalid');
          fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('Supported languages');
          expect(error.message).toContain('python');
        }
      });

      it('should handle empty string', () => {
        expect(() => getLanguageConfig('')).toThrow();
      });

      it('should handle null/undefined', () => {
        expect(() => getLanguageConfig(null)).toThrow();
        expect(() => getLanguageConfig(undefined)).toThrow();
      });

      it('should handle numeric input', () => {
        expect(() => getLanguageConfig(123)).toThrow();
      });
    });

    describe('Default version', () => {
      it('should use "*" as default version for all languages', () => {
        const languages = ['python', 'javascript', 'java', 'cpp', 'go'];
        
        languages.forEach(lang => {
          const config = getLanguageConfig(lang);
          expect(config.defaultVersion).toBe('*');
        });
      });
    });
  });

  describe('LANGUAGE_MAP', () => {
    it('should be an object', () => {
      expect(typeof LANGUAGE_MAP).toBe('object');
      expect(LANGUAGE_MAP).not.toBeNull();
    });

    it('should contain Python mapping', () => {
      expect(LANGUAGE_MAP.python).toBeDefined();
      expect(LANGUAGE_MAP.py).toBeDefined();
    });

    it('should have consistent structure for all entries', () => {
      Object.keys(LANGUAGE_MAP).forEach(key => {
        const entry = LANGUAGE_MAP[key];
        expect(entry).toHaveProperty('pistonName');
        expect(entry).toHaveProperty('extension');
        expect(entry).toHaveProperty('defaultVersion');
        
        expect(typeof entry.pistonName).toBe('string');
        expect(typeof entry.extension).toBe('string');
        expect(typeof entry.defaultVersion).toBe('string');
      });
    });

    it('should have lowercase keys', () => {
      Object.keys(LANGUAGE_MAP).forEach(key => {
        expect(key).toBe(key.toLowerCase());
      });
    });
  });
});

