const {
  sanitizeModelName,
  genAzureEndpoint,
  genAzureChatCompletion,
  getAzureCredentials,
  constructAzureURL,
} = require('./azureUtils');

describe('sanitizeModelName', () => {
  test('removes periods from the model name', () => {
    const sanitized = sanitizeModelName('model.name');
    expect(sanitized).toBe('modelname');
  });

  test('leaves model name unchanged if no periods are present', () => {
    const sanitized = sanitizeModelName('modelname');
    expect(sanitized).toBe('modelname');
  });
});

describe('genAzureEndpoint', () => {
  test('generates correct endpoint URL', () => {
    const url = genAzureEndpoint({
      azureOpenAIApiInstanceName: 'instanceName',
      azureOpenAIApiDeploymentName: 'deploymentName',
    });
    expect(url).toBe('https://instanceName.openai.azure.com/openai/deployments/deploymentName');
  });
});

describe('genAzureChatCompletion', () => {
  // Test with both deployment name and model name provided
  test('prefers model name over deployment name when both are provided and feature enabled', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiDeploymentName: 'deploymentName',
        azureOpenAIApiVersion: 'v1',
      },
      'modelName',
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/modelName/chat/completions?api-version=v1',
    );
  });

  // Test with only deployment name provided
  test('uses deployment name when model name is not provided', () => {
    const url = genAzureChatCompletion({
      azureOpenAIApiInstanceName: 'instanceName',
      azureOpenAIApiDeploymentName: 'deploymentName',
      azureOpenAIApiVersion: 'v1',
    });
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/deploymentName/chat/completions?api-version=v1',
    );
  });

  // Test with only model name provided
  test('uses model name when deployment name is not provided and feature enabled', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiVersion: 'v1',
      },
      'modelName',
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/modelName/chat/completions?api-version=v1',
    );
  });

  // Test with neither deployment name nor model name provided
  test('throws error if neither deployment name nor model name is provided', () => {
    expect(() => {
      genAzureChatCompletion({
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiVersion: 'v1',
      });
    }).toThrow(
      'Either a model name with the `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` setting or a deployment name must be provided if `AZURE_OPENAI_BASEURL` is omitted.',
    );
  });

  // Test with feature disabled but model name provided
  test('ignores model name and uses deployment name when feature is disabled', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'false';
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiDeploymentName: 'deploymentName',
        azureOpenAIApiVersion: 'v1',
      },
      'modelName',
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/deploymentName/chat/completions?api-version=v1',
    );
  });

  // Test with sanitized model name
  test('sanitizes model name when used in URL', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiVersion: 'v1',
      },
      'model.name',
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/modelname/chat/completions?api-version=v1',
    );
  });

  // Test with client parameter and model name
  test('updates client with sanitized model name when provided and feature enabled', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
    const clientMock = { azure: {} };
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiVersion: 'v1',
      },
      'model.name',
      clientMock,
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/modelname/chat/completions?api-version=v1',
    );
    expect(clientMock.azure.azureOpenAIApiDeploymentName).toBe('modelname');
  });

  // Test with client parameter but without model name
  test('does not update client when model name is not provided', () => {
    const clientMock = { azure: {} };
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiDeploymentName: 'deploymentName',
        azureOpenAIApiVersion: 'v1',
      },
      undefined,
      clientMock,
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/deploymentName/chat/completions?api-version=v1',
    );
    expect(clientMock.azure.azureOpenAIApiDeploymentName).toBeUndefined();
  });

  // Test with client parameter and deployment name when feature is disabled
  test('does not update client when feature is disabled', () => {
    process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'false';
    const clientMock = { azure: {} };
    const url = genAzureChatCompletion(
      {
        azureOpenAIApiInstanceName: 'instanceName',
        azureOpenAIApiDeploymentName: 'deploymentName',
        azureOpenAIApiVersion: 'v1',
      },
      'modelName',
      clientMock,
    );
    expect(url).toBe(
      'https://instanceName.openai.azure.com/openai/deployments/deploymentName/chat/completions?api-version=v1',
    );
    expect(clientMock.azure.azureOpenAIApiDeploymentName).toBeUndefined();
  });

  // Reset environment variable after tests
  afterEach(() => {
    delete process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
  });
});

describe('getAzureCredentials', () => {
  beforeEach(() => {
    process.env.AZURE_API_KEY = 'testApiKey';
    process.env.AZURE_OPENAI_API_INSTANCE_NAME = 'instanceName';
    process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME = 'deploymentName';
    process.env.AZURE_OPENAI_API_VERSION = 'v1';
  });

  test('retrieves Azure OpenAI API credentials from environment variables', () => {
    const credentials = getAzureCredentials();
    expect(credentials).toEqual({
      azureOpenAIApiKey: 'testApiKey',
      azureOpenAIApiInstanceName: 'instanceName',
      azureOpenAIApiDeploymentName: 'deploymentName',
      azureOpenAIApiVersion: 'v1',
    });
  });
});

describe('constructAzureURL', () => {
  test('replaces both placeholders when both properties are provided', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}',
      azureOptions: {
        azureOpenAIApiInstanceName: 'instance1',
        azureOpenAIApiDeploymentName: 'deployment1',
      },
    });
    expect(url).toBe('https://example.com/instance1/deployment1');
  });

  test('replaces only INSTANCE_NAME when only azureOpenAIApiInstanceName is provided', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}',
      azureOptions: {
        azureOpenAIApiInstanceName: 'instance2',
      },
    });
    expect(url).toBe('https://example.com/instance2/');
  });

  test('replaces only DEPLOYMENT_NAME when only azureOpenAIApiDeploymentName is provided', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}',
      azureOptions: {
        azureOpenAIApiDeploymentName: 'deployment2',
      },
    });
    expect(url).toBe('https://example.com//deployment2');
  });

  test('does not replace any placeholders when azure object is empty', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}',
      azureOptions: {},
    });
    expect(url).toBe('https://example.com//');
  });

  test('returns baseURL as is when `azureOptions` object is not provided', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}',
    });
    expect(url).toBe('https://example.com/${INSTANCE_NAME}/${DEPLOYMENT_NAME}');
  });

  test('returns baseURL as is when no placeholders are set', () => {
    const url = constructAzureURL({
      baseURL: 'https://example.com/my_custom_instance/my_deployment',
      azureOptions: {
        azureOpenAIApiInstanceName: 'instance1',
        azureOpenAIApiDeploymentName: 'deployment1',
      },
    });
    expect(url).toBe('https://example.com/my_custom_instance/my_deployment');
  });

  test('returns regular Azure OpenAI baseURL with placeholders set', () => {
    const baseURL =
      'https://${INSTANCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_NAME}';
    const url = constructAzureURL({
      baseURL,
      azureOptions: {
        azureOpenAIApiInstanceName: 'instance1',
        azureOpenAIApiDeploymentName: 'deployment1',
      },
    });
    expect(url).toBe('https://instance1.openai.azure.com/openai/deployments/deployment1');
  });
});
