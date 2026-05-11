import { TranslationKeys } from '~/hooks/useLocalize';

export interface AgentCategory {
  label: TranslationKeys;
  description?: TranslationKeys;
  value: string;
}

// The empty category placeholder - used for form defaults
export const EMPTY_AGENT_CATEGORY: AgentCategory = {
  value: '',
  label: 'com_ui_agent_category_general',
};

// Vermeer V1 categories — single source of truth for the builder + Marketplace.
// Labels include the emoji prefix directly in the i18n value for simplicity.
export const VERMEER_AGENT_CATEGORIES: AgentCategory[] = [
  {
    value: 'creative',
    label: 'com_agents_category_creative',
    description: 'com_agents_category_creative_description',
  },
  {
    value: 'strategic',
    label: 'com_agents_category_strategic',
    description: 'com_agents_category_strategic_description',
  },
  {
    value: 'production',
    label: 'com_agents_category_production',
    description: 'com_agents_category_production_description',
  },
  {
    value: 'media',
    label: 'com_agents_category_media',
    description: 'com_agents_category_media_description',
  },
  {
    value: 'general',
    label: 'com_agents_category_general',
    description: 'com_agents_category_general_description',
  },
];

// Legacy IDs kept in DB on existing agents (pre-Vermeer V1). Remapped to
// 'general' at render time via getCategoryLabel — see useAgentCategories.
export const LEGACY_AGENT_CATEGORY_IDS = [
  'hr',
  'finance',
  'rd',
  'it',
  'sales',
  'aftersales',
];
