import { extractEnvVariable } from '../src/utils';

describe('Environment Variable Extraction', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TEST_API_KEY: 'test-api-key-value',
      ANOTHER_SECRET: 'another-secret-value',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('extractEnvVariable (original tests)', () => {
    test('should return the value of the environment variable', () => {
      process.env.TEST_VAR = 'test_value';
      expect(extractEnvVariable('${TEST_VAR}')).toBe('test_value');
    });

    test('should return the original string if the envrionment variable is not defined correctly', () => {
      process.env.TEST_VAR = 'test_value';
      expect(extractEnvVariable('${ TEST_VAR }')).toBe('${ TEST_VAR }');
    });

    test('should return the original string if environment variable is not set', () => {
      expect(extractEnvVariable('${NON_EXISTENT_VAR}')).toBe('${NON_EXISTENT_VAR}');
    });

    test('should return the original string if it does not contain an environment variable', () => {
      expect(extractEnvVariable('some_string')).toBe('some_string');
    });

    test('should handle empty strings', () => {
      expect(extractEnvVariable('')).toBe('');
    });

    test('should handle strings without variable format', () => {
      expect(extractEnvVariable('no_var_here')).toBe('no_var_here');
    });

    /** No longer the expected behavior; keeping for reference */
    test.skip('should not process multiple variable formats', () => {
      process.env.FIRST_VAR = 'first';
      process.env.SECOND_VAR = 'second';
      expect(extractEnvVariable('${FIRST_VAR} and ${SECOND_VAR}')).toBe(
        '${FIRST_VAR} and ${SECOND_VAR}',
      );
    });
  });

  describe('extractEnvVariable function', () => {
    it('should extract environment variables from exact matches', () => {
      expect(extractEnvVariable('${TEST_API_KEY}')).toBe('test-api-key-value');
      expect(extractEnvVariable('${ANOTHER_SECRET}')).toBe('another-secret-value');
    });

    it('should extract environment variables from strings with prefixes', () => {
      expect(extractEnvVariable('prefix-${TEST_API_KEY}')).toBe('prefix-test-api-key-value');
    });

    it('should extract environment variables from strings with suffixes', () => {
      expect(extractEnvVariable('${TEST_API_KEY}-suffix')).toBe('test-api-key-value-suffix');
    });

    it('should extract environment variables from strings with both prefixes and suffixes', () => {
      expect(extractEnvVariable('prefix-${TEST_API_KEY}-suffix')).toBe(
        'prefix-test-api-key-value-suffix',
      );
    });

    it('should not match invalid patterns', () => {
      expect(extractEnvVariable('$TEST_API_KEY')).toBe('$TEST_API_KEY');
      expect(extractEnvVariable('{TEST_API_KEY}')).toBe('{TEST_API_KEY}');
      expect(extractEnvVariable('TEST_API_KEY')).toBe('TEST_API_KEY');
    });
  });

  describe('extractEnvVariable', () => {
    it('should extract environment variable values', () => {
      expect(extractEnvVariable('${TEST_API_KEY}')).toBe('test-api-key-value');
      expect(extractEnvVariable('${ANOTHER_SECRET}')).toBe('another-secret-value');
    });

    it('should return the original string if environment variable is not found', () => {
      expect(extractEnvVariable('${NON_EXISTENT_VAR}')).toBe('${NON_EXISTENT_VAR}');
    });

    it('should return the original string if no environment variable pattern is found', () => {
      expect(extractEnvVariable('plain-string')).toBe('plain-string');
    });
  });

  describe('extractEnvVariable space trimming', () => {
    beforeEach(() => {
      process.env.HELLO = 'world';
      process.env.USER = 'testuser';
    });

    it('should extract the value when string contains only an environment variable with surrounding whitespace', () => {
      expect(extractEnvVariable('        ${HELLO}        ')).toBe('world');
      expect(extractEnvVariable('  ${HELLO}  ')).toBe('world');
      expect(extractEnvVariable('\t${HELLO}\n')).toBe('world');
    });

    it('should preserve content when variable is part of a larger string', () => {
      expect(extractEnvVariable('Hello ${USER}!')).toBe('Hello testuser!');
      expect(extractEnvVariable('  Hello ${USER}!  ')).toBe('Hello testuser!');
    });

    it('should not handle multiple variables', () => {
      expect(extractEnvVariable('${HELLO} ${USER}')).toBe('${HELLO} ${USER}');
      expect(extractEnvVariable('  ${HELLO}   ${USER}  ')).toBe('${HELLO}   ${USER}');
    });

    it('should handle undefined variables', () => {
      expect(extractEnvVariable('        ${UNDEFINED_VAR}        ')).toBe('${UNDEFINED_VAR}');
    });

    it('should handle mixed content correctly', () => {
      expect(extractEnvVariable('Welcome, ${USER}!\nYour message: ${HELLO}')).toBe(
        'Welcome, testuser!\nYour message: world',
      );
    });
  });
});
