const fs = require('fs');
const { createOpenAPIPlugin, getSpec, readSpecFile } = require('./OpenAPIPlugin');

jest.mock('node-fetch');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
  existsSync: jest.fn(),
}));

describe('readSpecFile', () => {
  it('reads JSON file correctly', async () => {
    fs.promises.readFile.mockResolvedValue(JSON.stringify({ test: 'value' }));
    const result = await readSpecFile('test.json');
    expect(result).toEqual({ test: 'value' });
  });

  it('reads YAML file correctly', async () => {
    fs.promises.readFile.mockResolvedValue('test: value');
    const result = await readSpecFile('test.yaml');
    expect(result).toEqual({ test: 'value' });
  });

  it('handles error correctly', async () => {
    fs.promises.readFile.mockRejectedValue(new Error('test error'));
    const result = await readSpecFile('test.json');
    expect(result).toBe(false);
  });
});

describe('getSpec', () => {
  it('fetches spec from url correctly', async () => {
    const parsedJson = await getSpec('https://www.instacart.com/.well-known/ai-plugin.json');
    const isObject = typeof parsedJson === 'object';
    expect(isObject).toEqual(true);
  });

  it('reads spec from file correctly', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.promises.readFile.mockResolvedValue(JSON.stringify({ test: 'value' }));
    const result = await getSpec('test.json');
    expect(result).toEqual({ test: 'value' });
  });

  it('returns false when file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await getSpec('test.json');
    expect(result).toBe(false);
  });
});

describe('createOpenAPIPlugin', () => {
  it('returns null when getSpec throws an error', async () => {
    const result = await createOpenAPIPlugin({ data: { api: { url: 'invalid' } } });
    expect(result).toBe(null);
  });

  it('returns null when no spec is found', async () => {
    const result = await createOpenAPIPlugin({});
    expect(result).toBe(null);
  });

  // Add more tests here for different scenarios
});
