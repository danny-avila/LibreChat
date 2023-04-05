const cleanupPreset = _preset => {
  const { endpoint } = _preset;

  let preset = {};
  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model: _preset?.model ?? 'gpt-3.5-turbo',
      chatGptLabel: _preset?.chatGptLabel ?? null,
      promptPrefix: _preset?.promptPrefix ?? null,
      temperature: _preset?.temperature ?? 1,
      top_p: _preset?.top_p ?? 1,
      presence_penalty: _preset?.presence_penalty ?? 0,
      frequency_penalty: _preset?.frequency_penalty ?? 0,
      title: _preset?.title ?? 'New Preset'
    };
  } else if (endpoint === 'bingAI') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      jailbreak: _preset?.jailbreak ?? false,
      context: _preset?.context ?? null,
      systemMessage: _preset?.systemMessage ?? null,
      toneStyle: _preset?.toneStyle ?? 'fast',
      title: _preset?.title ?? 'New Preset'
    };
  } else if (endpoint === 'chatGPTBrowser') {
    preset = {
      endpoint,
      presetId: _preset?.presetId ?? null,
      model: _preset?.model ?? 'Default (GPT-3.5)',
      title: _preset?.title ?? 'New Preset'
    };
  } else if (endpoint === null) {
    preset = {
      endpoint,
      presetId: _preset?.presetId || null,
      title: _preset?.title ?? 'New Preset'
    };
  } else {
    console.error(`Unknown endpoint ${endpoint}`);
    preset = {
      endpoint: null,
      presetId: _preset?.presetId ?? null,
      title: _preset?.title ?? 'New Preset'
    };
  }

  return preset;
};

export default cleanupPreset;
