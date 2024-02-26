import { extractEnvVariable } from '../src/parsers';

describe('extractEnvVariable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

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

  test('should not process multiple variable formats', () => {
    process.env.FIRST_VAR = 'first';
    process.env.SECOND_VAR = 'second';
    expect(extractEnvVariable('${FIRST_VAR} and ${SECOND_VAR}')).toBe(
      '${FIRST_VAR} and ${SECOND_VAR}',
    );
  });
});
