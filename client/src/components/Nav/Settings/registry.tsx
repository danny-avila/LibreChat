import { SettingsTabValues } from 'librechat-data-provider';
import { showThinkingAtom } from '~/store/showThinking';
import store from '~/store';
import type { SettingEntry } from './types';
import { toggleControl, ThemeSetting, LangSetting } from './controls';
import FontSizeSelector from '../SettingsTabs/Chat/FontSizeSelector';
import ChatDirection from '../SettingsTabs/Chat/ChatDirection';
import AdvancedPrompts from '../SettingsTabs/Chat/AdvancedPrompts';
import { ForkSettings } from '../SettingsTabs/Chat/ForkSettings';
import ArchivedChats from '../SettingsTabs/General/ArchivedChats';
import ImportConversations from '../SettingsTabs/Data/ImportConversations';
import SharedLinks from '../SettingsTabs/Data/SharedLinks';
import { AgentApiKeys } from '../SettingsTabs/Data/AgentApiKeys';
import { RevokeKeys } from '../SettingsTabs/Data/RevokeKeys';
import { DeleteCache } from '../SettingsTabs/Data/DeleteCache';
import { ClearChats } from '../SettingsTabs/Data/ClearChats';
import DisplayUsernameMessages from '../SettingsTabs/Account/DisplayUsernameMessages';
import Avatar from '../SettingsTabs/Account/Avatar';
import EnableTwoFactorItem from '../SettingsTabs/Account/TwoFactorAuthentication';
import BackupCodesItem from '../SettingsTabs/Account/BackupCodesItem';
import DeleteAccount from '../SettingsTabs/Account/DeleteAccount';
import {
  SpeechToTextSwitch,
  LanguageSTTDropdown,
  AutoTranscribeAudioSwitch,
  AutoSendTextSelector,
  DecibelSelector,
} from '../SettingsTabs/Speech/STT';
import {
  TextToSpeechSwitch,
  VoiceDropdown,
  CacheTTSSwitch,
  AutomaticPlaybackSwitch,
  CloudBrowserVoicesSwitch,
  PlaybackRate,
} from '../SettingsTabs/Speech/TTS';
import ConversationModeSwitch from '../SettingsTabs/Speech/ConversationModeSwitch';
import { EngineSTTSetting, EngineTTSSetting } from './SpeechControls';
import MemoryToggle from './MemoryToggle';
import { TokenCredits, AutoRefill } from './BillingControls';

const { GENERAL, CHAT, SPEECH, PERSONALIZATION, DATA, ACCOUNT } = SettingsTabValues;

export const registry: SettingEntry[] = [
  {
    id: 'theme',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_theme',
    keywords: ['dark', 'light', 'appearance', 'color'],
    Component: ThemeSetting,
  },
  {
    id: 'language',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_language',
    keywords: ['locale', 'translation'],
    Component: LangSetting,
  },
  {
    id: 'fontSize',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_font_size',
    keywords: ['text', 'zoom'],
    Component: FontSizeSelector,
  },
  {
    id: 'chatDirection',
    tab: GENERAL,
    section: 'appearance',
    labelKey: 'com_nav_chat_direction',
    keywords: ['rtl', 'ltr'],
    Component: ChatDirection,
  },
  {
    id: 'maximizeChatSpace',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_maximize_chat_space',
    Component: toggleControl({
      stateAtom: store.maximizeChatSpace,
      localizationKey: 'com_nav_maximize_chat_space',
      switchId: 'maximizeChatSpace',
    }),
  },
  {
    id: 'centerFormOnLanding',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_center_chat_input',
    Component: toggleControl({
      stateAtom: store.centerFormOnLanding,
      localizationKey: 'com_nav_center_chat_input',
      switchId: 'centerFormOnLanding',
    }),
  },
  {
    id: 'showScrollButton',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_scroll_button',
    Component: toggleControl({
      stateAtom: store.showScrollButton,
      localizationKey: 'com_nav_scroll_button',
      switchId: 'showScrollButton',
    }),
  },
  {
    id: 'keepScreenAwake',
    tab: GENERAL,
    section: 'layout',
    labelKey: 'com_nav_keep_screen_awake',
    advanced: true,
    Component: toggleControl({
      stateAtom: store.keepScreenAwake,
      localizationKey: 'com_nav_keep_screen_awake',
      switchId: 'keepScreenAwake',
    }),
  },

  {
    id: 'enterToSend',
    tab: CHAT,
    section: 'input',
    labelKey: 'com_nav_enter_to_send',
    keywords: ['return', 'newline'],
    Component: toggleControl({
      stateAtom: store.enterToSend,
      localizationKey: 'com_nav_enter_to_send',
      switchId: 'enterToSend',
      hoverCardText: 'com_nav_info_enter_to_send',
    }),
  },
  {
    id: 'saveDrafts',
    tab: CHAT,
    section: 'input',
    labelKey: 'com_nav_save_drafts',
    Component: toggleControl({
      stateAtom: store.saveDrafts,
      localizationKey: 'com_nav_save_drafts',
      switchId: 'saveDrafts',
      hoverCardText: 'com_nav_info_save_draft',
    }),
  },
  {
    id: 'saveBadgesState',
    tab: CHAT,
    section: 'input',
    labelKey: 'com_nav_save_badges_state',
    Component: toggleControl({
      stateAtom: store.saveBadgesState,
      localizationKey: 'com_nav_save_badges_state',
      switchId: 'showBadges',
      hoverCardText: 'com_nav_info_save_badges_state',
    }),
  },
  {
    id: 'atCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_at_command_description',
    Component: toggleControl({
      stateAtom: store.atCommand,
      localizationKey: 'com_nav_at_command_description',
      switchId: 'atCommand',
    }),
  },
  {
    id: 'plusCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_plus_command_description',
    show: (ctx) => ctx.hasMultiConvo,
    Component: toggleControl({
      stateAtom: store.plusCommand,
      localizationKey: 'com_nav_plus_command_description',
      switchId: 'plusCommand',
    }),
  },
  {
    id: 'slashCommand',
    tab: CHAT,
    section: 'commands',
    labelKey: 'com_nav_slash_command_description',
    show: (ctx) => ctx.hasPrompts,
    Component: toggleControl({
      stateAtom: store.slashCommand,
      localizationKey: 'com_nav_slash_command_description',
      switchId: 'slashCommand',
    }),
  },
  {
    id: 'newChatSwitchToHistory',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_new_chat_switch_to_history',
    Component: toggleControl({
      stateAtom: store.newChatSwitchToHistory,
      localizationKey: 'com_nav_new_chat_switch_to_history',
      switchId: 'newChatSwitchToHistory',
    }),
  },
  {
    id: 'autoScroll',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_auto_scroll',
    Component: toggleControl({
      stateAtom: store.autoScroll,
      localizationKey: 'com_nav_auto_scroll',
      switchId: 'autoScroll',
    }),
  },
  {
    id: 'modularChat',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_modular_chat',
    Component: toggleControl({
      stateAtom: store.modularChat,
      localizationKey: 'com_nav_modular_chat',
      switchId: 'modularChat',
    }),
  },
  {
    id: 'defaultTemporaryChat',
    tab: CHAT,
    section: 'conversations',
    labelKey: 'com_nav_default_temporary_chat',
    Component: toggleControl({
      stateAtom: store.defaultTemporaryChat,
      localizationKey: 'com_nav_default_temporary_chat',
      switchId: 'defaultTemporaryChat',
      hoverCardText: 'com_nav_info_default_temporary_chat',
    }),
  },
  {
    id: 'enableUserMsgMarkdown',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_user_msg_markdown',
    Component: toggleControl({
      stateAtom: store.enableUserMsgMarkdown,
      localizationKey: 'com_nav_user_msg_markdown',
      switchId: 'enableUserMsgMarkdown',
    }),
  },
  {
    id: 'latexParsing',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_latex_parsing',
    Component: toggleControl({
      stateAtom: store.LaTeXParsing,
      localizationKey: 'com_nav_latex_parsing',
      switchId: 'latexParsing',
      hoverCardText: 'com_nav_info_latex_parsing',
    }),
  },
  {
    id: 'showThinking',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_show_thinking',
    Component: toggleControl({
      stateAtom: showThinkingAtom,
      localizationKey: 'com_nav_show_thinking',
      switchId: 'showThinking',
    }),
  },
  {
    id: 'autoExpandTools',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_auto_expand_tools',
    advanced: true,
    Component: toggleControl({
      stateAtom: store.autoExpandTools,
      localizationKey: 'com_nav_auto_expand_tools',
      switchId: 'autoExpandTools',
    }),
  },
  {
    id: 'advancedPrompts',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_advanced_prompts',
    advanced: true,
    keywords: ['prompt'],
    Component: AdvancedPrompts,
  },
  {
    id: 'alwaysMakeProd',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_always_make_prod',
    advanced: true,
    Component: toggleControl({
      stateAtom: store.alwaysMakeProd,
      localizationKey: 'com_nav_always_make_prod',
      switchId: 'alwaysMakeProd',
    }),
  },
  {
    id: 'autoSendPrompts',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_nav_auto_send_prompts',
    advanced: true,
    Component: toggleControl({
      stateAtom: store.autoSendPrompts,
      localizationKey: 'com_nav_auto_send_prompts',
      switchId: 'autoSendPrompts',
      hoverCardText: 'com_nav_auto_send_prompts_desc',
    }),
  },
  {
    id: 'forkSettings',
    tab: CHAT,
    section: 'rendering',
    labelKey: 'com_ui_fork_default',
    advanced: true,
    keywords: ['fork', 'branch', 'split'],
    Component: ForkSettings,
  },

  {
    id: 'speechToText',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_nav_speech_to_text',
    Component: SpeechToTextSwitch,
  },
  {
    id: 'engineSTT',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_ui_settings_label_engine_stt',
    Component: EngineSTTSetting,
  },
  {
    id: 'languageSTT',
    tab: SPEECH,
    section: 'stt',
    labelKey: 'com_ui_settings_label_language_stt',
    Component: LanguageSTTDropdown,
  },
  {
    id: 'textToSpeech',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_text_to_speech',
    Component: TextToSpeechSwitch,
  },
  {
    id: 'engineTTS',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_engine_tts',
    Component: EngineTTSSetting,
  },
  {
    id: 'voice',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_voice',
    Component: VoiceDropdown,
  },
  {
    id: 'conversationMode',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_conversation_mode',
    advanced: true,
    Component: ConversationModeSwitch,
  },
  {
    id: 'autoTranscribeAudio',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_auto_transcribe_audio',
    advanced: true,
    Component: AutoTranscribeAudioSwitch,
  },
  {
    id: 'decibelValue',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_decibel',
    advanced: true,
    Component: DecibelSelector,
  },
  {
    id: 'autoSendText',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_auto_send_text',
    advanced: true,
    Component: AutoSendTextSelector,
  },
  {
    id: 'automaticPlayback',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_automatic_playback',
    advanced: true,
    Component: AutomaticPlaybackSwitch,
  },
  {
    id: 'cloudBrowserVoices',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_enable_cloud_browser_voice',
    advanced: true,
    Component: CloudBrowserVoicesSwitch,
  },
  {
    id: 'playbackRate',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_ui_settings_label_playback_rate',
    advanced: true,
    Component: PlaybackRate,
  },
  {
    id: 'cacheTTS',
    tab: SPEECH,
    section: 'tts',
    labelKey: 'com_nav_enable_cache_tts',
    advanced: true,
    Component: CacheTTSSwitch,
  },

  {
    id: 'referenceSavedMemories',
    tab: PERSONALIZATION,
    section: 'memory',
    labelKey: 'com_ui_reference_saved_memories',
    keywords: ['memory'],
    show: (ctx) => ctx.hasMemoryOptOut,
    Component: MemoryToggle,
  },

  {
    id: 'importConversations',
    tab: DATA,
    section: 'history',
    labelKey: 'com_ui_settings_label_import',
    Component: ImportConversations,
  },
  {
    id: 'archivedChats',
    tab: DATA,
    section: 'history',
    labelKey: 'com_ui_settings_label_archived',
    keywords: ['archive'],
    Component: ArchivedChats,
  },
  {
    id: 'sharedLinks',
    tab: DATA,
    section: 'shared',
    labelKey: 'com_ui_settings_label_shared_links',
    Component: SharedLinks,
  },
  {
    id: 'agentApiKeys',
    tab: DATA,
    section: 'shared',
    labelKey: 'com_ui_settings_label_agent_api_keys',
    advanced: true,
    show: (ctx) => ctx.hasRemoteAgents,
    Component: AgentApiKeys,
  },
  {
    id: 'revokeKeys',
    tab: DATA,
    section: 'shared',
    labelKey: 'com_ui_settings_label_revoke_keys',
    advanced: true,
    Component: RevokeKeys,
  },
  {
    id: 'deleteCache',
    tab: DATA,
    section: 'shared',
    labelKey: 'com_ui_settings_label_delete_cache',
    advanced: true,
    Component: DeleteCache,
  },
  {
    id: 'clearChats',
    tab: DATA,
    section: 'shared',
    labelKey: 'com_ui_settings_label_clear_chats',
    advanced: true,
    Component: ClearChats,
  },

  {
    id: 'usernameDisplay',
    tab: ACCOUNT,
    section: 'profile',
    labelKey: 'com_nav_user_name_display',
    Component: DisplayUsernameMessages,
  },
  {
    id: 'avatar',
    tab: ACCOUNT,
    section: 'profile',
    labelKey: 'com_ui_settings_label_avatar',
    Component: Avatar,
  },
  {
    id: 'twoFactor',
    tab: ACCOUNT,
    section: 'security',
    labelKey: 'com_ui_settings_label_2fa',
    show: (ctx) => ctx.isLocalProvider,
    Component: EnableTwoFactorItem,
  },
  {
    id: 'backupCodes',
    tab: ACCOUNT,
    section: 'security',
    labelKey: 'com_ui_settings_label_backup_codes',
    show: (ctx) => ctx.isLocalProvider && ctx.twoFactorEnabled,
    Component: BackupCodesItem,
  },
  {
    id: 'tokenCredits',
    tab: ACCOUNT,
    section: 'billing',
    labelKey: 'com_ui_settings_label_credits',
    show: (ctx) => ctx.balanceEnabled,
    Component: TokenCredits,
  },
  {
    id: 'autoRefill',
    tab: ACCOUNT,
    section: 'billing',
    labelKey: 'com_ui_settings_label_auto_refill',
    show: (ctx) => ctx.balanceEnabled,
    Component: AutoRefill,
  },
  {
    id: 'deleteAccount',
    tab: ACCOUNT,
    section: 'profile',
    labelKey: 'com_ui_settings_label_delete_account',
    advanced: true,
    show: (ctx) => ctx.allowAccountDeletion,
    Component: DeleteAccount,
  },
];
