const { extractEnvVariable, RealtimeVoiceProviders } = require('librechat-data-provider');
const { getCustomConfig } = require('~/server/services/Config');
const { logger } = require('~/config');

class RealtimeService {
  constructor(customConfig) {
    this.customConfig = customConfig;
    this.providerStrategies = {
      [RealtimeVoiceProviders.OPENAI]: this.openaiProvider.bind(this),
    };
  }

  static async getInstance() {
    const customConfig = await getCustomConfig();
    if (!customConfig) {
      throw new Error('Custom config not found');
    }
    return new RealtimeService(customConfig);
  }

  async getProviderSchema() {
    const realtimeSchema = this.customConfig.speech.realtime;
    if (!realtimeSchema) {
      throw new Error('No Realtime schema is set in config');
    }

    const providers = Object.entries(realtimeSchema).filter(
      ([, value]) => Object.keys(value).length > 0,
    );

    if (providers.length !== 1) {
      throw new Error(providers.length > 1 ? 'Multiple providers set' : 'No provider set');
    }

    return providers[0];
  }

  async openaiProvider(schema, voice) {
    const defaultRealtimeUrl = 'https://api.openai.com/v1/realtime';
    const allowedVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

    if (!voice) {
      throw new Error('Voice not specified');
    }

    if (!allowedVoices.includes(voice)) {
      throw new Error(`Invalid voice: ${voice}`);
    }

    const apiKey = extractEnvVariable(schema.apiKey);
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        modalities: ['audio', 'text'],
        voice: voice,
      }),
    });

    const token = response.json();

    return {
      provider: RealtimeVoiceProviders.OPENAI,
      token: token,
      url: schema.url || defaultRealtimeUrl,
    };
  }

  async getRealtimeConfig(req, res) {
    try {
      const [provider, schema] = await this.getProviderSchema();
      const strategy = this.providerStrategies[provider];

      if (!strategy) {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const voice = req.query.voice;

      const config = strategy(schema, voice);
      res.json(config);
    } catch (error) {
      logger.error('[RealtimeService] Config generation failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

async function getRealtimeConfig(req, res) {
  const service = await RealtimeService.getInstance();
  await service.getRealtimeConfig(req, res);
}

module.exports = getRealtimeConfig;
