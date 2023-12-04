const fs = require('fs');
const { validateJson, loadSpecs, ManifestDefinition } = require('./loadSpecs');
const { createOpenAPIPlugin } = require('../dynamic/OpenAPIPlugin');

jest.mock('../dynamic/OpenAPIPlugin');

describe('ManifestDefinition', () => {
  it('should validate correct json', () => {
    const json = {
      name_for_human: 'Test',
      name_for_model: 'Test',
      description_for_human: 'Test',
      description_for_model: 'Test',
      api: {
        url: 'http://test.com',
      },
    };

    expect(() => ManifestDefinition.parse(json)).not.toThrow();
  });

  it('should not validate incorrect json', () => {
    const json = {
      name_for_human: 'Test',
      name_for_model: 'Test',
      description_for_human: 'Test',
      description_for_model: 'Test',
      api: {
        url: 123, // incorrect type
      },
    };

    expect(() => ManifestDefinition.parse(json)).toThrow();
  });
});

describe('validateJson', () => {
  it('should return parsed json if valid', () => {
    const json = {
      name_for_human: 'Test',
      name_for_model: 'Test',
      description_for_human: 'Test',
      description_for_model: 'Test',
      api: {
        url: 'http://test.com',
      },
    };

    expect(validateJson(json)).toEqual(json);
  });

  it('should return false if json is not valid', () => {
    const json = {
      name_for_human: 'Test',
      name_for_model: 'Test',
      description_for_human: 'Test',
      description_for_model: 'Test',
      api: {
        url: 123, // incorrect type
      },
    };

    expect(validateJson(json)).toEqual(false);
  });
});

describe('loadSpecs', () => {
  beforeEach(() => {
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(['test.json']);
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify({
        name_for_human: 'Test',
        name_for_model: 'Test',
        description_for_human: 'Test',
        description_for_model: 'Test',
        api: {
          url: 'http://test.com',
        },
      }),
    );
    createOpenAPIPlugin.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return plugins', async () => {
    const plugins = await loadSpecs({ llm: true, verbose: false });

    expect(plugins).toHaveLength(1);
    expect(createOpenAPIPlugin).toHaveBeenCalledTimes(1);
  });

  it('should return constructorMap if map is true', async () => {
    const plugins = await loadSpecs({ llm: {}, map: true, verbose: false });

    expect(plugins).toHaveProperty('Test');
    expect(createOpenAPIPlugin).not.toHaveBeenCalled();
  });
});
