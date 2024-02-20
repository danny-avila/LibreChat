// import type { TAzureGroupConfigs } from '../src/config';
import { validateAzureGroupConfigs } from '../src/azure';

describe('validateAzureGroupConfigs', () => {
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
    const { isValid, modelNames } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(true);
    expect(modelNames).toEqual(['gpt-4-turbo']);
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
    const { isValid } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(false);
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
    const { isValid } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(false);
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
    const { isValid, modelNames } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(true);
    expect(modelNames).toContain('gpt-5-turbo');
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
    const { isValid, modelNames } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(true);
    expect(modelNames).toEqual(['gpt-6']);
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
    const { isValid } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(false);
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
    const { isValid, modelNames } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(false);
    expect(modelNames).toEqual(expect.arrayContaining(['valid-model', 'invalid-model']));
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
    const { isValid } = validateAzureGroupConfigs(configs);
    expect(isValid).toBe(false);
  });
});

describe('validateAzureGroupConfigs with modelGroupMap and regionMap', () => {
  it('should provide a valid modelGroupMap and regionMap for a correct configuration', () => {
    const validConfigs = [
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
          'gpt-4-turbo': {
            deploymentName: 'gpt-4-turbo-deployment',
            version: '2023-11-06',
          },
        },
      },
    ];
    const { isValid, modelGroupMap, groupMap } = validateAzureGroupConfigs(validConfigs);
    expect(isValid).toBe(true);
    expect(modelGroupMap['gpt-4-turbo']).toBeDefined();
    expect(modelGroupMap['gpt-4-turbo'].group).toBe('us-east');
    expect(groupMap['us-east']).toBeDefined();
    expect(groupMap['us-east'].apiKey).toBe('prod-1234');
    expect(groupMap['us-east'].models['gpt-4-turbo']).toBeDefined();
    console.dir(modelGroupMap, { depth: null });
    console.dir(groupMap, { depth: null });
  });
});
