import { createElement } from 'react';
import { MessageSquare } from 'lucide-react';
import { SettingsTabValues } from 'librechat-data-provider';
import { GearIcon, DataIcon, UserIcon, SpeechIcon, PersonalizationIcon } from '@librechat/client';
import type { ComponentType, ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';

export type SettingsTab =
  | SettingsTabValues.GENERAL
  | SettingsTabValues.CHAT
  | SettingsTabValues.SPEECH
  | SettingsTabValues.PERSONALIZATION
  | SettingsTabValues.DATA
  | SettingsTabValues.ACCOUNT;

export type SectionId =
  | 'appearance'
  | 'layout'
  | 'input'
  | 'commands'
  | 'conversations'
  | 'rendering'
  | 'stt'
  | 'tts'
  | 'memory'
  | 'history'
  | 'shared'
  | 'profile'
  | 'security'
  | 'billing';

export interface SettingsContextValue {
  balanceEnabled: boolean;
  hasAnyPersonalizationFeature: boolean;
  hasMemoryOptOut: boolean;
  hasRemoteAgents: boolean;
  hasMultiConvo: boolean;
  hasPrompts: boolean;
  isLocalProvider: boolean;
  twoFactorEnabled: boolean;
  allowAccountDeletion: boolean;
}

export interface SettingEntry {
  id: string;
  tab: SettingsTab;
  section: SectionId;
  labelKey: TranslationKeys;
  keywords?: string[];
  Component: ComponentType;
  advanced?: boolean;
  show?: (ctx: SettingsContextValue) => boolean;
}

export interface SectionMeta {
  id: SectionId;
  labelKey: TranslationKeys;
  danger?: boolean;
}

export interface TabMeta {
  id: SettingsTab;
  labelKey: TranslationKeys;
  icon: ReactNode;
  sections: SectionMeta[];
  show?: (ctx: SettingsContextValue) => boolean;
}

export const TABS: TabMeta[] = [
  {
    id: SettingsTabValues.GENERAL,
    labelKey: 'com_nav_setting_general',
    icon: createElement(GearIcon),
    sections: [
      { id: 'appearance', labelKey: 'com_ui_settings_section_appearance' },
      { id: 'layout', labelKey: 'com_ui_settings_section_layout' },
    ],
  },
  {
    id: SettingsTabValues.CHAT,
    labelKey: 'com_nav_setting_chat',
    icon: createElement(MessageSquare, { className: 'icon-sm', 'aria-hidden': true }),
    sections: [
      { id: 'input', labelKey: 'com_ui_settings_section_input' },
      { id: 'commands', labelKey: 'com_ui_settings_section_commands' },
      { id: 'conversations', labelKey: 'com_ui_settings_section_conversations' },
      { id: 'rendering', labelKey: 'com_ui_settings_section_rendering' },
    ],
  },
  {
    id: SettingsTabValues.SPEECH,
    labelKey: 'com_nav_setting_speech',
    icon: createElement(SpeechIcon, { className: 'icon-sm' }),
    sections: [
      { id: 'stt', labelKey: 'com_ui_settings_section_stt' },
      { id: 'tts', labelKey: 'com_ui_settings_section_tts' },
    ],
  },
  {
    id: SettingsTabValues.PERSONALIZATION,
    labelKey: 'com_nav_setting_personalization',
    icon: createElement(PersonalizationIcon),
    sections: [{ id: 'memory', labelKey: 'com_ui_settings_section_memory' }],
    show: (ctx) => ctx.hasAnyPersonalizationFeature,
  },
  {
    id: SettingsTabValues.DATA,
    labelKey: 'com_ui_settings_tab_data',
    icon: createElement(DataIcon),
    sections: [
      { id: 'history', labelKey: 'com_ui_settings_section_history' },
      { id: 'shared', labelKey: 'com_ui_settings_section_shared' },
    ],
  },
  {
    id: SettingsTabValues.ACCOUNT,
    labelKey: 'com_nav_setting_account',
    icon: createElement(UserIcon),
    sections: [
      { id: 'profile', labelKey: 'com_ui_settings_section_profile' },
      { id: 'security', labelKey: 'com_ui_settings_section_security' },
      { id: 'billing', labelKey: 'com_ui_settings_section_billing' },
    ],
  },
];

export const ADVANCED_LABEL_KEY: TranslationKeys = 'com_ui_settings_section_advanced';
export const DANGER_LABEL_KEY: TranslationKeys = 'com_ui_settings_section_danger_zone';
