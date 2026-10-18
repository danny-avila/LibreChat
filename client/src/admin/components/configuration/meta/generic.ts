import type * as t from '~/admin/types';
import {
  PERMISSION_SUB_KEYS,
  INTERFACE_PERMISSION_FIELDS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
} from '~/admin/utils';
import { READ_ONLY_CONFIG_SECTIONS } from '~/admin/constants';

/** Parents of the fields every endpoint shares (`endpoints.openAI.titleConvo`, custom entries). */
const ENDPOINT_PARENTS = ['endpoints.{}', 'endpoints.custom[]'];

/** Endpoint fields with one shared description key, `com_admin_config_desc_endpoint_<key>`. */
const SHARED_ENDPOINT_FIELDS = [
  'streamRate',
  'headers',
  'titleConvo',
  'titleModel',
  'titleMethod',
  'titlePrompt',
  'titlePromptTemplate',
  'titleEndpoint',
  'titleTiming',
  'activityLabel',
  'activityModel',
  'activityEndpoint',
  'activityPrompt',
  'activityMaxPerRun',
  'activityCharLimit',
  'activityPhaseLabel',
  'activityPhaseMaxPerRun',
  'reasoningLabel',
  'reasoningLabelModel',
  'reasoningLabelMaxPerRun',
  'maxToolResultChars',
  'models.default',
  'models.fetch',
  'models.userIdQuery',
];

/** Values LibreChat applies to unset endpoint fields (documented in the endpoint schema). */
const ENDPOINT_RUNTIME_DEFAULTS: Record<string, t.ConfigValue> = {
  titleConvo: true,
  titleMethod: 'completion',
  activityLabel: false,
  activityPhaseLabel: false,
  reasoningLabel: false,
  'models.fetch': false,
  'models.userIdQuery': false,
  titleTiming: 'immediate',
  activityMaxPerRun: 20,
  activityCharLimit: 600,
  activityPhaseMaxPerRun: 5,
  reasoningLabelMinChars: 500,
  reasoningLabelUpdateChars: 400,
  reasoningLabelUpdateIntervalMs: 3000,
  reasoningLabelMaxPerRun: 8,
};

/** Endpoint fields that name another endpoint. */
const ENDPOINT_REFERENCES = [
  'titleEndpoint',
  'activityEndpoint',
  'activityPhaseEndpoint',
  'reasoningLabelEndpoint',
];

/** Labels that need their parent for context (`models.default` is not just "Default"). */
const ENDPOINT_LABELS: Record<string, string> = {
  'models.default': 'com_admin_config_label_models_default',
  'models.fetch': 'com_admin_config_label_models_fetch',
  'models.userIdQuery': 'com_admin_config_label_models_userIdQuery',
};

/** `.env` fallbacks LibreChat's rate limiters use when librechat.yaml sets none. */
const RATE_LIMIT_DEFAULTS: Record<string, { ip: number; user: number; window: number }> = {
  fileUploads: { ip: 100, user: 50, window: 15 },
  conversationsImport: { ip: 100, user: 50, window: 15 },
  tts: { ip: 100, user: 50, window: 1 },
  stt: { ip: 100, user: 50, window: 1 },
};

const UNITS: Record<string, t.FieldUnit> = {
  'fileConfig.serverFileSizeLimit': 'MB',
  'fileConfig.avatarSizeLimit': 'MB',
  'fileConfig.fileContextSizeLimit': 'MB',
  'fileConfig.skills.fileSizeLimit': 'MB',
  'fileConfig.endpoints.{}.fileSizeLimit': 'MB',
  'fileConfig.endpoints.{}.totalSizeLimit': 'MB',
  'fileConfig.clientImageResize.maxWidth': 'px',
  'fileConfig.clientImageResize.maxHeight': 'px',
  'fileConfig.imageGeneration.px': 'px',
  'cloudfront.urlExpiry': 's',
  'cloudfront.cookieExpiry': 's',
  'interface.temporaryChatRetention': 'hours',
  'interface.generalChatRetention': 'hours',
  'balance.startBalance': 'credits',
  'balance.refillAmount': 'credits',
  'mcpServers.{}.timeout': 'ms',
  'mcpServers.{}.initTimeout': 'ms',
  'mcpServers.{}.sseReadTimeout': 'ms',
  'mcpServers.{}.oauthRefreshWaitTimeout': 'ms',
  'mcpServers.{}.oauthPersistenceWaitTimeout': 'ms',
  'endpoints.{}.streamRate': 'ms',
  'endpoints.custom[].streamRate': 'ms',
};

/**
 * What LibreChat does with an optional switch nobody sets, read from the code
 * that consumes each flag, so its Default choice says "Default (Off)" rather
 * than "Not set". A flag LibreChat passes on unset to an outside service is
 * labelled as that service's choice; `toolApproval.enabled` unset is neither
 * On nor Off (Off is a kill switch), so it stays "Not set (LibreChat decides)".
 */
const TRISTATE_RUNTIME_DEFAULTS: t.FieldMetaRegistry = {
  /** `shouldReplayReasoningContent`: only `true` opts in (DeepSeek reasoning replays on its own). */
  'endpoints.custom[].customParams.includeReasoningHistory': { runtimeDefault: false },
  /** Parameter panel dropdown and combobox: `showLabel = true`. */
  'endpoints.custom[].customParams.paramDefinitions[].showLabel': { runtimeDefault: true },
  /** The policy links never open in a new tab (removed for WCAG). */
  'interface.privacyPolicy.openNewTab': { runtimeDefault: false },
  'interface.termsOfService.openNewTab': { runtimeDefault: false },
  /** File retention keeps agent files only for `retainAgentFiles === true`. */
  'interface.retainAgentFiles': { runtimeDefault: false },
  /** `DEFAULT_SCHEDULE_LIMITS.requireProject` (a pinned project implies it). */
  'interface.schedules.requireProject': { runtimeDefault: false },
  /** `traceViewerDefaults.showToolNames`. */
  'interface.traceViewer.showToolNames': { runtimeDefault: false },
  /** The chat's speech settings start from these until a user changes them. */
  'speech.speechTab.advancedMode': { runtimeDefault: false },
  'speech.speechTab.conversationMode': { runtimeDefault: false },
  'speech.speechTab.speechToText': { runtimeDefault: true },
  'speech.speechTab.speechToText.engineSTT': { runtimeDefault: 'browser' },
  'speech.speechTab.speechToText.autoTranscribeAudio': { runtimeDefault: false },
  'speech.speechTab.speechToText.decibelValue': { runtimeDefault: -45 },
  'speech.speechTab.speechToText.autoSendText': { runtimeDefault: -1 },
  'speech.speechTab.textToSpeech': { runtimeDefault: true },
  'speech.speechTab.textToSpeech.engineTTS': { runtimeDefault: 'browser' },
  'speech.speechTab.textToSpeech.automaticPlayback': { runtimeDefault: false },
  'speech.speechTab.textToSpeech.cacheTTS': { runtimeDefault: true },
  /** Sent to ElevenLabs only when set. */
  'speech.tts.elevenlabs.voice_settings.use_speaker_boost': {
    defaultLabelKey: 'com_admin_config_default_elevenlabs_decides',
  },
  /** Context pruning runs only for `enabled === true`. */
  'summarization.contextPruning.enabled': { runtimeDefault: false },
  /** Firecrawl options are sent only when set; Firecrawl applies its own defaults. */
  ...Object.fromEntries(
    [
      'blockAds',
      'mobile',
      'onlyMainContent',
      'parsePDF',
      'removeBase64Images',
      'skipTlsVerification',
      'storeInCache',
      'zeroDataRetention',
    ].map((key) => [
      `webSearch.firecrawlOptions.${key}`,
      { defaultLabelKey: 'com_admin_config_default_firecrawl_decides' },
    ]),
  ),
  /** The Tavily scraper sends `includeImages`/`includeFavicon` as `false` unless set. */
  'webSearch.tavilyScraperOptions.includeImages': { runtimeDefault: false },
  'webSearch.tavilyScraperOptions.includeFavicon': { runtimeDefault: false },
  /** Tavily search options are sent only when set; Tavily applies its own defaults. */
  ...Object.fromEntries(
    ['includeFavicon', 'includeImageDescriptions', 'includeImages', 'safeSearch'].map((key) => [
      `webSearch.tavilySearchOptions.${key}`,
      { defaultLabelKey: 'com_admin_config_default_tavily_decides' },
    ]),
  ),
  /** Users keep their own image-resize setting (off until they turn it on). */
  'fileConfig.clientImageResize.enabled': { runtimeDefault: false },
  /** Upload fallback text runs only for `textFallbackWithoutTools === true`. */
  'fileConfig.textFallbackWithoutTools': { runtimeDefault: false },
  'fileConfig.endpoints.{}.textFallbackWithoutTools': { runtimeDefault: false },
  /** OAuth handler: `skip_code_challenge_check === true` (or `MCP_SKIP_CODE_CHALLENGE_CHECK`). */
  'mcpServers.{}.oauth.skip_code_challenge_check': { runtimeDefault: false },
  /** Unset, LibreChat uses OAuth when the server has an `oauth` block or asks for it. */
  'mcpServers.{}.requiresOAuth': { defaultLabelKey: 'com_admin_config_default_auto_detect' },
  /** `resolveRetainedAnswersConfig`: on unless `enabled: false`. */
  'endpoints.agents.askUserQuestion.retainedAnswers.enabled': { runtimeDefault: true },
  /** Conversation moves are on only for `enabled === true`. */
  'endpoints.agents.statefulCodeSessions.conversationMoves.enabled': { runtimeDefault: false },
  /** Personal worker enrollment is off only for `enabled: false`. */
  'endpoints.agents.statefulCodeSessions.principalWorkers.enabled': { runtimeDefault: true },
  /** Subagents share files only for `shareFiles === true`. */
  'modelSpecs.list[].subagents.shareFiles': { runtimeDefault: false },
  /** `resolveServerInstructions`: unset (like `false`) gives the model no server instructions. */
  'mcpServers.{}.serverInstructions': { runtimeDefault: false },
  /** The chat applies a spec's `artifacts || ''`: unset leaves artifacts off. */
  'modelSpecs.list[].artifacts': { runtimeDefault: false },
};

const STATIC_META: t.FieldMetaRegistry = {
  balance: {
    order: [
      'enabled',
      'startBalance',
      'display',
      'autoRefillEnabled',
      'refillMode',
      'refillAmount',
      'refillIntervalValue',
      'refillIntervalUnit',
      'reservationTtlMs',
    ],
    groups: [
      {
        key: 'autoRefill',
        toggle: 'autoRefillEnabled',
        fields: [
          'autoRefillEnabled',
          'refillMode',
          'refillAmount',
          'refillIntervalValue',
          'refillIntervalUnit',
        ],
      },
    ],
  },
  registration: { order: ['socialLogins', 'allowedDomains'] },
  cloudfront: {
    order: [
      'domain',
      'distributionId',
      'storageRegion',
      'includeRegionInPath',
      'invalidateOnDelete',
      'imageSigning',
      'urlExpiry',
      'cookieDomain',
      'cookieExpiry',
      'requireSignedAccess',
    ],
  },
  'interface.privacyPolicy': { order: ['externalUrl', 'openNewTab'] },
  'interface.termsOfService': {
    order: ['externalUrl', 'openNewTab', 'modalAcceptance', 'modalTitle', 'modalContent'],
  },
  memory: {
    order: [
      'disabled',
      'personalize',
      'validKeys',
      'tokenLimit',
      'charLimit',
      'maxInputTokens',
      'messageWindowSize',
    ],
  },
  summarization: {
    order: ['enabled', 'trigger', 'provider', 'model', 'parameters', 'reserveRatio'],
  },
  webSearch: {
    order: ['searchProvider', 'scraperProvider', 'rerankerType', 'safeSearch', 'scraperTimeout'],
  },
  'webSearch.tavilySearchOptions.timeRange': { hiddenOptions: ['d', 'w', 'm', 'y'] },
  'endpoints.agents.checkpointer.type': {
    enumLabels: { memory: 'com_admin_config_enum_inMemory' },
  },
  'modelSpecs.list[]': {
    order: ['name', 'label', 'description', 'iconURL', 'group', 'groupIcon', 'order', 'default'],
  },
  'modelSpecs.list[].preset': { order: ['endpoint', 'model', 'modelLabel'] },
  'modelSpecs.list[].showInMenu': { runtimeDefault: true },
  'modelSpecs.list[].showIconInMenu': { runtimeDefault: true },
  'modelSpecs.list[].showIconInHeader': { runtimeDefault: true },
  'mcpServers.{}.startup': { runtimeDefault: true },
  'mcpServers.{}.chatMenu': { runtimeDefault: true },
  'mcpServers.{}.sseReadTimeout': { runtimeDefault: 300_000 },
  'mcpServers.{}.oauthRefreshWaitTimeout': { runtimeDefault: 15_000 },
  'mcpServers.{}.oauthPersistenceWaitTimeout': { runtimeDefault: 15_000 },
  'mcpServers.{}.oauthRefreshCoordination': { runtimeDefault: false },
  'mcpServers.{}.oauth.forward_audience_on_refresh': { runtimeDefault: true },
  'mcpServers.{}.oauth.send_resource_parameter': { runtimeDefault: true },
  'mcpServers.{}.customUserVars.{}.sensitive': { runtimeDefault: true },
  'modelSpecs.list[].default': { runtimeDefault: false },
  'modelSpecs.list[].softDefault': { runtimeDefault: false },
  'modelSpecs.list[].showOnLanding': { runtimeDefault: false },
  'modelSpecs.list[].hideBadgeRow': { runtimeDefault: false },
  'modelSpecs.list[].webSearch': { runtimeDefault: false },
  'modelSpecs.list[].fileSearch': { runtimeDefault: false },
  'modelSpecs.list[].executeCode': { runtimeDefault: false },
  'modelSpecs.list[].memory': { runtimeDefault: false },
  'endpoints.custom[].directEndpoint': { runtimeDefault: false },
  'endpoints.{}.disableBuilder': { runtimeDefault: false },
  'endpoints.{}.privateAssistants': { runtimeDefault: false },
  'memory.agent.enabled': { runtimeDefault: false },
  'summarization.enabled': { runtimeDefault: true },
  'openapi.enabled': { runtimeDefault: false },
  'fileConfig.legacyFileUploadUX': { runtimeDefault: false },
  'fileConfig.endpoints.{}.legacyFileUploadUX': { runtimeDefault: false },
  'interface.temporaryChatRetention': { runtimeDefault: 720 },
  'transactions.enabled': { runtimeDefault: true },
  'memory.disabled': { labelKey: 'com_admin_config_label_memory_disabled', runtimeDefault: false },
  'speech.speechTab.speechToText': { labelKey: 'com_admin_config_label_speechTab_speechToText' },
  'speech.speechTab.textToSpeech': { labelKey: 'com_admin_config_label_speechTab_textToSpeech' },
  includedTools: { labelKey: 'com_admin_config_label_includedTools' },
  filteredTools: { labelKey: 'com_admin_config_label_filteredTools' },
  'endpoints.custom[].customParams.paramDefinitions[].default': {
    labelKey: 'com_admin_config_label_paramDefinitions_default',
  },
  'endpoints.custom[].provider': { labelKey: 'com_admin_config_label_custom_provider' },
  'endpoints.custom[].customParams.defaultParamsEndpoint': { optionSource: 'endpoints' },
  'endpoints.agents.allowedProviders': { optionSource: 'endpoints' },
  'endpoints.agents.capabilities': { emptyListIsValue: true },
  'endpoints.assistants.capabilities': { emptyListIsValue: true },
  'endpoints.azureAssistants.capabilities': { emptyListIsValue: true },
  'modelSpecs.addedEndpoints': { optionSource: 'endpoints' },
  'modelSpecs.list[].preset.endpoint': { optionSource: 'endpoints' },
  'modelSpecs.list[].group': { optionSource: 'specGroups' },
  'modelSpecs.list[].mcpServers': { optionSource: 'mcpServers' },
  'summarization.provider': { optionSource: 'endpoints' },
  'memory.agent.provider': { optionSource: 'endpoints' },
  'memory.agent': {
    enumLabels: {
      id: 'com_admin_config_variant_memory_agent_id',
      provider: 'com_admin_config_variant_memory_agent_provider',
    },
  },
  'mcpServers.{}.apiKey.key': { secret: true },
  'mcpServers.{}.serverInstructions': { multiline: true },
  'mcpServers.{}.customUserVars.{}.description': { multiline: true },
  fileStrategy: { confirmChange: true },
  'fileStrategies.default': {
    confirmChange: true,
    defaultLabelKey: 'com_admin_config_default_same_as_file_strategy',
  },
  'fileStrategies.avatar': {
    confirmChange: true,
    defaultLabelKey: 'com_admin_config_default_same_as_strategies_default',
  },
  'fileStrategies.image': {
    confirmChange: true,
    defaultLabelKey: 'com_admin_config_default_same_as_strategies_default',
  },
  'fileStrategies.document': {
    confirmChange: true,
    defaultLabelKey: 'com_admin_config_default_same_as_strategies_default',
  },
  'fileStrategies.skills': {
    confirmChange: true,
    defaultLabelKey: 'com_admin_config_default_skills_strategy',
  },
  'endpoints.custom[].customParams.includeReasoningContent': { runtimeDefault: false },
  'interface.termsOfService.modalAcceptance': { runtimeDefault: false },
};

/** Merges registries entry by entry; later entries win per property. */
function mergeRegistries(registries: t.FieldMetaRegistry[]): t.FieldMetaRegistry {
  const merged: t.FieldMetaRegistry = {};
  for (const registry of registries) {
    for (const [pattern, meta] of Object.entries(registry)) {
      merged[pattern] = { ...merged[pattern], ...meta };
    }
  }
  return merged;
}

function endpointMeta(): t.FieldMetaRegistry {
  const entries: t.FieldMetaRegistry = {};
  for (const parent of ENDPOINT_PARENTS) {
    for (const key of SHARED_ENDPOINT_FIELDS) {
      const labelKey = ENDPOINT_LABELS[key];
      entries[`${parent}.${key}`] = {
        descriptionKey: `com_admin_config_desc_endpoint_${key.replace('.', '_')}`,
        ...(labelKey ? { labelKey } : {}),
      };
    }
    for (const [key, runtimeDefault] of Object.entries(ENDPOINT_RUNTIME_DEFAULTS)) {
      entries[`${parent}.${key}`] = { ...entries[`${parent}.${key}`], runtimeDefault };
    }
    for (const key of ENDPOINT_REFERENCES) {
      entries[`${parent}.${key}`] = { ...entries[`${parent}.${key}`], optionSource: 'endpoints' };
    }
  }
  return entries;
}

function rateLimitMeta(): t.FieldMetaRegistry {
  const entries: t.FieldMetaRegistry = {};
  for (const [limiter, limits] of Object.entries(RATE_LIMIT_DEFAULTS)) {
    entries[`rateLimits.${limiter}.ipMax`] = { runtimeDefault: limits.ip };
    entries[`rateLimits.${limiter}.userMax`] = { runtimeDefault: limits.user };
    entries[`rateLimits.${limiter}.ipWindowInMinutes`] = { runtimeDefault: limits.window };
    entries[`rateLimits.${limiter}.userWindowInMinutes`] = { runtimeDefault: limits.window };
  }
  return entries;
}

/** `baseOnly`/`yamlOnly` for sections LibreChat never reads from admin overrides. */
function applicabilityMeta(): t.FieldMetaRegistry {
  const entries: t.FieldMetaRegistry = {};
  for (const [section, reason] of READ_ONLY_CONFIG_SECTIONS) {
    entries[section] = reason === 'baseOnly' ? { baseOnly: true } : { yamlOnly: true };
  }
  entries.skillSync = { yamlOnly: true };
  return entries;
}

/** `permission` for interface paths that are role permissions (managed on the roles page). */
function permissionMeta(): t.FieldMetaRegistry {
  const entries: t.FieldMetaRegistry = {};
  for (const field of INTERFACE_PERMISSION_FIELDS) {
    if (!RUNTIME_CONFIG_INTERFACE_FIELDS.has(field)) {
      entries[`interface.${field}`] = { permission: true };
    }
    for (const subKey of PERMISSION_SUB_KEYS) {
      entries[`interface.${field}.${subKey}`] = { permission: true };
    }
  }
  return entries;
}

function unitMeta(): t.FieldMetaRegistry {
  return Object.fromEntries(Object.entries(UNITS).map(([path, unit]) => [path, { unit }]));
}

/**
 * Cross-area field metadata (WS2): enum aliases, units, runtime defaults,
 * path-scoped labels, shared endpoint descriptions, display order and
 * applicability flags, keyed by wildcard path. Area workstreams add their own
 * registry files (`providers.ts`, `endpoints.ts`, `specs.ts`, `mcp.ts`, …) and
 * list them in `META_SOURCES` in `index.ts`.
 */
export const GENERIC_FIELD_META: t.FieldMetaRegistry = mergeRegistries([
  endpointMeta(),
  rateLimitMeta(),
  applicabilityMeta(),
  permissionMeta(),
  unitMeta(),
  STATIC_META,
  TRISTATE_RUNTIME_DEFAULTS,
]);
