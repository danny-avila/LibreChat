import { ErrorTypes, EModelEndpoint } from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  InitializeResultBase,
  OpenAIConfigOptions,
  UserKeyValues,
} from '~/types';
import { isUserProvided, checkUserKeyExpiry } from '~/utils';
import { getNovitaConfig } from './config';

export async function initializeNovita({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  const appConfig = req.config;
  const { PROXY, NOVITA_API_KEY } = process.env;

  const { key: expiresAt } = req.body;
  const modelName = model_parameters?.model as string | undefined;

  const credentials = { [EModelEndpoint.novita]: NOVITA_API_KEY };

  const userProvidesKey = isUserProvided(credentials[endpoint as keyof typeof credentials]);

  let userValues: UserKeyValues | null = null;
  if (expiresAt && userProvidesKey) {
    checkUserKeyExpiry(expiresAt, endpoint);
    userValues = await db.getUserKeyValues({ userId: req.user?.id ?? '', name: endpoint });
  }

  const apiKey = userProvidesKey
    ? userValues?.apiKey
    : credentials[endpoint as keyof typeof credentials];

  const clientOptions: OpenAIConfigOptions = {
    proxy: PROXY ?? undefined,
    reverseProxyUrl: userValues?.baseURL ?? undefined,
    streaming: true,
  };

  if (userProvidesKey && !apiKey) {
    throw new Error(JSON.stringify({ type: ErrorTypes.NO_USER_KEY }));
  }

  if (!apiKey) {
    throw new Error('novita API Key not provided.');
  }

  const modelOptions = { ...(model_parameters ?? {}), model: modelName, user: req.user?.id ?? '' };
  const finalClientOptions: OpenAIConfigOptions = { ...clientOptions, modelOptions };

  const options = getNovitaConfig(apiKey, finalClientOptions, endpoint);

  const novitaConfig = appConfig?.endpoints?.[EModelEndpoint.novita];
  const allConfig = appConfig?.endpoints?.all;

  let streamRate: number | undefined;

  if (novitaConfig) {
    streamRate = novitaConfig.streamRate;
  }

  if (allConfig?.streamRate) {
    streamRate = allConfig.streamRate;
  }

  if (streamRate) {
    options.llmConfig._lc_stream_delay = streamRate;
  }

  return options;
}
