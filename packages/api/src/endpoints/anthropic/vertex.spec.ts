import { AuthKeys } from 'librechat-data-provider';
import { createAnthropicVertexClient, getVertexRegion } from './vertex';

describe('getVertexRegion', () => {
  it('should return undefined when vertexConfig is undefined', () => {
    expect(getVertexRegion('model-a', undefined)).toBeUndefined();
  });

  it('should return undefined when models is an array', () => {
    const config = {
      models: ['model-a', 'model-b'],
    };
    expect(getVertexRegion('model-a', config)).toBeUndefined();
  });

  it('should return undefined when model config is a boolean', () => {
    const config = {
      models: {
        'model-a': true,
        'model-b': false,
      },
    };
    expect(getVertexRegion('model-a', config)).toBeUndefined();
  });

  it('should return undefined when model config exists but has no region', () => {
    const config = {
      models: {
        'model-a': { deploymentName: 'deploy-a' },
      },
    };
    expect(getVertexRegion('model-a', config)).toBeUndefined();
  });

  it('should return overridden region when model config has region', () => {
    const config = {
      models: {
        'model-a': { deploymentName: 'deploy-a', region: 'europe-west1' },
      },
    };
    expect(getVertexRegion('model-a', config)).toBe('europe-west1');
  });
});

describe('createAnthropicVertexClient', () => {
  const credentials = {
    [AuthKeys.GOOGLE_SERVICE_KEY]: {
      project_id: 'test-project',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: 'test-private-key',
    },
  };

  it('should use Vertex AI multi-region base URLs for Anthropic', () => {
    const testCases = [
      { region: 'eu', baseURL: 'https://aiplatform.eu.rep.googleapis.com/v1' },
      { region: 'us', baseURL: 'https://aiplatform.us.rep.googleapis.com/v1' },
      { region: 'global', baseURL: 'https://aiplatform.googleapis.com/v1' },
    ];

    testCases.forEach(({ region, baseURL }) => {
      const client = createAnthropicVertexClient(credentials, undefined, {
        region,
        projectId: 'test-project',
      });

      expect(client.region).toBe(region);
      expect(client.baseURL).toBe(baseURL);
    });
  });
});
