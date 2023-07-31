const cleanupPreset = ({ preset: _preset, endpointsConfig = {} }) => {
  const { endpoint } = _preset;

  let preset = {};
  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model: _preset?.model ?? endpointsConfig[endpoint]?.availableModels?.[0] ?? 'gpt-3.5-turbo',
      chatGptLabel: _preset?.chatGptLabel ?? null,
      promptPrefix: _preset?.promptPrefix ?? null,
      temperature: _preset?.temperature ?? 1,
      top_p: _preset?.top_p ?? 1,
      presence_penalty: _preset?.presence_penalty ?? 0,
      frequency_penalty: _preset?.frequency_penalty ?? 0,
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === 'google') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model: _preset?.model ?? endpointsConfig[endpoint]?.availableModels?.[0] ?? 'chat-bison',
      modelLabel: _preset?.modelLabel ?? null,
      examples: _preset?.examples ?? [{ input: { content: '' }, output: { content: '' } }],
      promptPrefix: _preset?.promptPrefix ?? null,
      temperature: _preset?.temperature ?? 0.2,
      maxOutputTokens: _preset?.maxOutputTokens ?? 1024,
      topP: _preset?.topP ?? 0.95,
      topK: _preset?.topK ?? 5,
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === 'anthropic') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model: _preset?.model ?? endpointsConfig[endpoint]?.availableModels?.[0] ?? 'claude-1',
      modelLabel: _preset?.modelLabel ?? null,
      promptPrefix: _preset?.promptPrefix ?? null,
      temperature: _preset?.temperature ?? 1,
      maxOutputTokens: _preset?.maxOutputTokens ?? 1024,
      topP: _preset?.topP ?? 0.7,
      topK: _preset?.topK ?? 5,
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === 'bingAI') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      jailbreak: _preset?.jailbreak ?? false,
      context: _preset?.context ?? null,
      systemMessage: _preset?.systemMessage ?? null,
      toneStyle: _preset?.toneStyle ?? 'creative',
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === 'chatGPTBrowser') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model:
        _preset?.model ??
        endpointsConfig[endpoint]?.availableModels?.[0] ??
        'text-davinci-002-render-sha',
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === 'gptPlugins') {
    const agentOptions = _preset?.agentOptions ?? {
      agent: 'functions',
      skipCompletion: true,
      model: 'gpt-3.5-turbo',
      temperature: 0,
      // top_p: 1,
      // presence_penalty: 0,
      // frequency_penalty: 0
    };
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      tools: _preset?.tools ?? [],
      model: _preset?.model ?? endpointsConfig[endpoint]?.availableModels?.[0] ?? 'gpt-3.5-turbo',
      chatGptLabel: _preset?.chatGptLabel ?? null,
      promptPrefix: _preset?.promptPrefix ?? null,
      temperature: _preset?.temperature ?? 0.8,
      top_p: _preset?.top_p ?? 1,
      presence_penalty: _preset?.presence_penalty ?? 0,
      frequency_penalty: _preset?.frequency_penalty ?? 0,
      agentOptions,
      title: _preset?.title ?? 'New Preset',
    };
  } else if (endpoint === null) {
    preset = {
      endpoint,
      presetId: _preset?.presetId || null,
      title: _preset?.title ?? 'New Preset',
    };
  } else {
    console.error(`Unknown endpoint ${endpoint}`);
    preset = {
      endpoint: null,
      presetId: _preset?.presetId ?? null,
      title: _preset?.title ?? 'New Preset',
    };
  }

  return preset;
};

export default cleanupPreset;
