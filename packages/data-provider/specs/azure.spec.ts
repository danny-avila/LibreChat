import type { TAzureGroups } from '../src/config';
import { validateAzureGroups, mapModelToAzureConfig } from '../src/azure';

describe('validateAzureGroups', () => {
  it('should validate a correct configuration', () => {
    const configs = [
      {
        group: 'us-east',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
    ];
    const { isValid, modelNames, modelGroupMap, groupMap } = validateAzureGroups(configs);
    expect(isValid).toBe(true);
    expect(modelNames).toEqual(['gpt-4-turbo']);

    const { azureOptions, baseURL, headers } = mapModelToAzureConfig({
      modelName: 'gpt-4-turbo',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions).toEqual({
      azureOpenAIApiKey: 'prod-1234',
      azureOpenAIApiInstanceName: 'prod-instance',
      azureOpenAIApiDeploymentName: 'gpt-4-turbo-deployment',
      azureOpenAIApiVersion: '2023-11-06',
    });
    expect(baseURL).toBe('https://prod.example.com');
    expect(headers).toEqual({
      'X-Custom-Header': 'value',
    });
  });

  it('should return invalid for a configuration missing deploymentName at the model level where required', () => {
    const configs = [
      {
        group: 'us-west',
        apiKey: 'us-west-key-5678',
        instanceName: 'us-west-instance',
        models: {
          'gpt-5': {
            version: '2023-12-01', // Missing deploymentName
          },
        },
      },
    ];
    const { isValid, errors } = validateAzureGroups(configs);
    expect(isValid).toBe(false);
    expect(errors.length).toBe(1);
  });

  it('should return invalid for a configuration with a boolean model where group lacks deploymentName and version', () => {
    const configs = [
      {
        group: 'sweden-central',
        apiKey: 'sweden-central-9012',
        instanceName: 'sweden-central-instance',
        models: {
          'gpt-35-turbo': true, // The group lacks deploymentName and version
        },
      },
    ];
    const { isValid, errors } = validateAzureGroups(configs);
    expect(isValid).toBe(false);
    expect(errors.length).toBe(1);
  });

  it('should allow a boolean model when group has both deploymentName and version', () => {
    const configs = [
      {
        group: 'japan-east',
        apiKey: 'japan-east-3456',
        instanceName: 'japan-east-instance',
        deploymentName: 'default-deployment',
        version: '2023-04-01',
        models: {
          'gpt-5-turbo': true,
        },
      },
    ];
    const { isValid, modelNames, modelGroupMap, groupMap } = validateAzureGroups(configs);
    expect(isValid).toBe(true);
    const modelGroup = modelGroupMap['gpt-5-turbo'];
    expect(modelGroup).toBeDefined();
    expect(modelGroup.group).toBe('japan-east');
    expect(groupMap[modelGroup.group]).toBeDefined();
    expect(modelNames).toContain('gpt-5-turbo');
    const { azureOptions } = mapModelToAzureConfig({
      modelName: 'gpt-5-turbo',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions).toEqual({
      azureOpenAIApiKey: 'japan-east-3456',
      azureOpenAIApiInstanceName: 'japan-east-instance',
      azureOpenAIApiDeploymentName: 'default-deployment',
      azureOpenAIApiVersion: '2023-04-01',
    });
  });

  it('should validate correctly when optional fields are missing', () => {
    const configs = [
      {
        group: 'canada-central',
        apiKey: 'canada-key',
        instanceName: 'canada-instance',
        models: {
          'gpt-6': {
            deploymentName: 'gpt-6-deployment',
            version: '2023-01-01',
          },
        },
      },
    ];
    const { isValid, modelNames, modelGroupMap, groupMap } = validateAzureGroups(configs);
    expect(isValid).toBe(true);
    expect(modelNames).toEqual(['gpt-6']);
    const { azureOptions } = mapModelToAzureConfig({ modelName: 'gpt-6', modelGroupMap, groupMap });
    expect(azureOptions).toEqual({
      azureOpenAIApiKey: 'canada-key',
      azureOpenAIApiInstanceName: 'canada-instance',
      azureOpenAIApiDeploymentName: 'gpt-6-deployment',
      azureOpenAIApiVersion: '2023-01-01',
    });
  });

  it('should return invalid for configurations with incorrect types', () => {
    const configs = [
      {
        group: 123, // incorrect type
        apiKey: 'key123',
        instanceName: 'instance123',
        models: {
          'gpt-7': true,
        },
      },
    ];
    // @ts-expect-error This error is expected because the 'group' property should be a string.
    const { isValid, errors } = validateAzureGroups(configs);
    expect(isValid).toBe(false);
    expect(errors.length).toBe(1);
  });

  it('should correctly handle a mix of valid and invalid model configurations', () => {
    const configs = [
      {
        group: 'australia-southeast',
        apiKey: 'australia-key',
        instanceName: 'australia-instance',
        models: {
          'valid-model': {
            deploymentName: 'valid-deployment',
            version: '2023-02-02',
          },
          'invalid-model': true, // Invalid because the group lacks deploymentName and version
        },
      },
    ];
    const { isValid, modelNames, errors } = validateAzureGroups(configs);
    expect(isValid).toBe(false);
    expect(modelNames).toEqual(expect.arrayContaining(['valid-model', 'invalid-model']));
    expect(errors.length).toBe(1);
  });

  it('should return invalid for configuration missing required fields at the group level', () => {
    const configs = [
      {
        group: 'brazil-south',
        apiKey: 'brazil-key',
        // Missing instanceName
        models: {
          'gpt-8': {
            deploymentName: 'gpt-8-deployment',
            version: '2023-03-03',
          },
        },
      },
    ];
    // @ts-expect-error This error is expected because the 'instanceName' property is intentionally left out.
    const { isValid, errors } = validateAzureGroups(configs);
    expect(isValid).toBe(false);
    expect(errors.length).toBe(1);
  });
});

describe('validateAzureGroups with modelGroupMap and groupMap', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should provide a valid modelGroupMap and groupMap for a correct configuration', () => {
    const validConfigs: TAzureGroups = [
      {
        group: 'us-east',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
      {
        group: 'us-west',
        apiKey: 'prod-12345',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-5-turbo': {
            deploymentName: 'gpt-5-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
    ];
    const { isValid, modelGroupMap, groupMap } = validateAzureGroups(validConfigs);
    expect(isValid).toBe(true);
    expect(modelGroupMap['gpt-4-turbo']).toBeDefined();
    expect(modelGroupMap['gpt-4-turbo'].group).toBe('us-east');
    expect(groupMap['us-east']).toBeDefined();
    expect(groupMap['us-east'].apiKey).toBe('prod-1234');
    expect(groupMap['us-east'].models['gpt-4-turbo']).toBeDefined();
    const { azureOptions, baseURL, headers } = mapModelToAzureConfig({
      modelName: 'gpt-4-turbo',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions).toEqual({
      azureOpenAIApiKey: 'prod-1234',
      azureOpenAIApiInstanceName: 'prod-instance',
      azureOpenAIApiDeploymentName: 'gpt-4-turbo-deployment',
      azureOpenAIApiVersion: '2023-11-06',
    });
    expect(baseURL).toBe('https://prod.example.com');
    expect(headers).toEqual({
      'X-Custom-Header': 'value',
    });
  });

  it('should not allow duplicate group names', () => {
    const duplicateGroups: TAzureGroups = [
      {
        group: 'us-east',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
      {
        group: 'us-east',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-5-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
    ];
    const { isValid } = validateAzureGroups(duplicateGroups);
    expect(isValid).toBe(false);
  });
  it('should not allow duplicate models across groups', () => {
    const duplicateGroups: TAzureGroups = [
      {
        group: 'us-east',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
      {
        group: 'us-west',
        apiKey: 'prod-1234',
        instanceName: 'prod-instance',
        deploymentName: 'v1-deployment',
        version: '2023-12-31',
        baseURL: 'https://prod.example.com',
        additionalHeaders: {
          'X-Custom-Header': 'value',
        },
        models: {
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
    ];
    const { isValid } = validateAzureGroups(duplicateGroups);
    expect(isValid).toBe(false);
  });

  it('should throw an error if environment variables are set but not configured', () => {
    const validConfigs: TAzureGroups = [
      {
        group: 'librechat-westus',
        apiKey: '${WESTUS_API_KEY}',
        instanceName: 'librechat-westus',
        version: '2023-12-01-preview',
        models: {
          'gpt-4-vision-preview': {
            deploymentName: 'gpt-4-vision-preview',
            version: '2024-02-15-preview',
          },
          'gpt-3.5-turbo': {
            deploymentName: 'gpt-35-turbo',
          },
          'gpt-3.5-turbo-1106': {
            deploymentName: 'gpt-35-turbo-1106',
          },
          'gpt-4': {
            deploymentName: 'gpt-4',
          },
          'gpt-4-1106-preview': {
            deploymentName: 'gpt-4-1106-preview',
          },
        },
      },
      {
        group: 'librechat-eastus',
        apiKey: '${EASTUS_API_KEY}',
        instanceName: 'librechat-eastus',
        deploymentName: 'gpt-4-turbo',
        version: '2024-02-15-preview',
        models: {
          'gpt-4-turbo': true,
        },
      },
    ];
    const { isValid, modelGroupMap, groupMap } = validateAzureGroups(validConfigs);
    expect(isValid).toBe(true);
    expect(() =>
      mapModelToAzureConfig({ modelName: 'gpt-4-turbo', modelGroupMap, groupMap }),
    ).toThrow();
  });

  it('should list all expected models in both modelGroupMap and groupMap', () => {
    process.env.WESTUS_API_KEY = 'westus-key';
    process.env.EASTUS_API_KEY = 'eastus-key';

    const validConfigs: TAzureGroups = [
      {
        group: 'librechat-westus',
        apiKey: '${WESTUS_API_KEY}',
        instanceName: 'librechat-westus',
        version: '2023-12-01-preview',
        models: {
          'gpt-4-vision-preview': {
            deploymentName: 'gpt-4-vision-preview',
            version: '2024-02-15-preview',
          },
          'gpt-3.5-turbo': {
            deploymentName: 'gpt-35-turbo',
          },
          'gpt-3.5-turbo-1106': {
            deploymentName: 'gpt-35-turbo-1106',
          },
          'gpt-4': {
            deploymentName: 'gpt-4',
          },
          'gpt-4-1106-preview': {
            deploymentName: 'gpt-4-1106-preview',
          },
        },
      },
      {
        group: 'librechat-eastus',
        apiKey: '${EASTUS_API_KEY}',
        instanceName: 'librechat-eastus',
        deploymentName: 'gpt-4-turbo',
        version: '2024-02-15-preview',
        models: {
          'gpt-4-turbo': true,
        },
        baseURL: 'https://eastus.example.com',
        additionalHeaders: {
          'x-api-key': 'x-api-key-value',
        },
      },
    ];
    const { isValid, modelGroupMap, groupMap, modelNames } = validateAzureGroups(validConfigs);
    expect(isValid).toBe(true);
    expect(modelNames).toEqual([
      'gpt-4-vision-preview',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-1106',
      'gpt-4',
      'gpt-4-1106-preview',
      'gpt-4-turbo',
    ]);

    // Check modelGroupMap
    modelNames.forEach((modelName) => {
      expect(modelGroupMap[modelName]).toBeDefined();
    });

    // Check groupMap for 'librechat-westus'
    expect(groupMap).toHaveProperty('librechat-westus');
    expect(groupMap['librechat-westus']).toEqual(
      expect.objectContaining({
        apiKey: '${WESTUS_API_KEY}',
        instanceName: 'librechat-westus',
        version: '2023-12-01-preview',
        models: expect.objectContaining({
          'gpt-4-vision-preview': expect.any(Object),
          'gpt-3.5-turbo': expect.any(Object),
          'gpt-3.5-turbo-1106': expect.any(Object),
          'gpt-4': expect.any(Object),
          'gpt-4-1106-preview': expect.any(Object),
        }),
      }),
    );

    // Check groupMap for 'librechat-eastus'
    expect(groupMap).toHaveProperty('librechat-eastus');
    expect(groupMap['librechat-eastus']).toEqual(
      expect.objectContaining({
        apiKey: '${EASTUS_API_KEY}',
        instanceName: 'librechat-eastus',
        deploymentName: 'gpt-4-turbo',
        version: '2024-02-15-preview',
        models: expect.objectContaining({
          'gpt-4-turbo': true,
        }),
      }),
    );

    const { azureOptions: azureOptions1 } = mapModelToAzureConfig({
      modelName: 'gpt-4-vision-preview',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions1).toEqual({
      azureOpenAIApiKey: 'westus-key',
      azureOpenAIApiInstanceName: 'librechat-westus',
      azureOpenAIApiDeploymentName: 'gpt-4-vision-preview',
      azureOpenAIApiVersion: '2024-02-15-preview',
    });

    const {
      azureOptions: azureOptions2,
      baseURL,
      headers,
    } = mapModelToAzureConfig({
      modelName: 'gpt-4-turbo',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions2).toEqual({
      azureOpenAIApiKey: 'eastus-key',
      azureOpenAIApiInstanceName: 'librechat-eastus',
      azureOpenAIApiDeploymentName: 'gpt-4-turbo',
      azureOpenAIApiVersion: '2024-02-15-preview',
    });
    expect(baseURL).toBe('https://eastus.example.com');
    expect(headers).toEqual({
      'x-api-key': 'x-api-key-value',
    });

    const { azureOptions: azureOptions3 } = mapModelToAzureConfig({
      modelName: 'gpt-4',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions3).toEqual({
      azureOpenAIApiKey: 'westus-key',
      azureOpenAIApiInstanceName: 'librechat-westus',
      azureOpenAIApiDeploymentName: 'gpt-4',
      azureOpenAIApiVersion: '2023-12-01-preview',
    });

    const { azureOptions: azureOptions4 } = mapModelToAzureConfig({
      modelName: 'gpt-3.5-turbo',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions4).toEqual({
      azureOpenAIApiKey: 'westus-key',
      azureOpenAIApiInstanceName: 'librechat-westus',
      azureOpenAIApiDeploymentName: 'gpt-35-turbo',
      azureOpenAIApiVersion: '2023-12-01-preview',
    });

    const { azureOptions: azureOptions5 } = mapModelToAzureConfig({
      modelName: 'gpt-3.5-turbo-1106',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions5).toEqual({
      azureOpenAIApiKey: 'westus-key',
      azureOpenAIApiInstanceName: 'librechat-westus',
      azureOpenAIApiDeploymentName: 'gpt-35-turbo-1106',
      azureOpenAIApiVersion: '2023-12-01-preview',
    });

    const { azureOptions: azureOptions6 } = mapModelToAzureConfig({
      modelName: 'gpt-4-1106-preview',
      modelGroupMap,
      groupMap,
    });
    expect(azureOptions6).toEqual({
      azureOpenAIApiKey: 'westus-key',
      azureOpenAIApiInstanceName: 'librechat-westus',
      azureOpenAIApiDeploymentName: 'gpt-4-1106-preview',
      azureOpenAIApiVersion: '2023-12-01-preview',
    });
  });
});
