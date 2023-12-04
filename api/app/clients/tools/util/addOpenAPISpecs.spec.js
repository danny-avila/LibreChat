const { addOpenAPISpecs, transformSpec } = require('./addOpenAPISpecs');
const { loadSpecs } = require('./loadSpecs');
const { createOpenAPIPlugin } = require('../dynamic/OpenAPIPlugin');

jest.mock('./loadSpecs');
jest.mock('../dynamic/OpenAPIPlugin');

describe('transformSpec', () => {
  it('should transform input spec to a desired format', () => {
    const input = {
      name_for_human: 'Human Name',
      name_for_model: 'Model Name',
      description_for_human: 'Human Description',
      logo_url: 'https://example.com/logo.png',
    };

    const expectedOutput = {
      name: 'Human Name',
      pluginKey: 'Model Name',
      description: 'Human Description',
      icon: 'https://example.com/logo.png',
      isAuthRequired: 'false',
      authConfig: [],
    };

    expect(transformSpec(input)).toEqual(expectedOutput);
  });

  it('should use default icon if logo_url is not provided', () => {
    const input = {
      name_for_human: 'Human Name',
      name_for_model: 'Model Name',
      description_for_human: 'Human Description',
    };

    const expectedOutput = {
      name: 'Human Name',
      pluginKey: 'Model Name',
      description: 'Human Description',
      icon: 'https://placehold.co/70x70.png',
      isAuthRequired: 'false',
      authConfig: [],
    };

    expect(transformSpec(input)).toEqual(expectedOutput);
  });
});

describe('addOpenAPISpecs', () => {
  it('should add specs to available tools', async () => {
    const availableTools = ['Tool1', 'Tool2'];
    const specs = [
      {
        name_for_human: 'Human Name',
        name_for_model: 'Model Name',
        description_for_human: 'Human Description',
        logo_url: 'https://example.com/logo.png',
      },
    ];

    loadSpecs.mockResolvedValue(specs);
    createOpenAPIPlugin.mockReturnValue('Plugin');

    const result = await addOpenAPISpecs(availableTools);
    expect(result).toEqual([...specs.map(transformSpec), ...availableTools]);
  });

  it('should return available tools if specs loading fails', async () => {
    const availableTools = ['Tool1', 'Tool2'];

    loadSpecs.mockRejectedValue(new Error('Failed to load specs'));

    const result = await addOpenAPISpecs(availableTools);
    expect(result).toEqual(availableTools);
  });
});
