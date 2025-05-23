import { TranslationKeys } from '~/hooks/useLocalize';

export interface AgentCategory {
  label: TranslationKeys;
  value: string;
}

// Category values - must match the backend values in Agent.js
export const CATEGORY_VALUES = {
  GENERAL: 'general',
  HR: 'hr',
  RD: 'rd',
  FINANCE: 'finance',
  IT: 'it',
  SALES: 'sales',
  AFTERSALES: 'aftersales',
} as const;

// Type for category values to ensure type safety
export type AgentCategoryValue = (typeof CATEGORY_VALUES)[keyof typeof CATEGORY_VALUES];

// Display labels for each category
const CATEGORY_LABELS = {
  [CATEGORY_VALUES.GENERAL]: 'com_ui_agent_category_general',
  [CATEGORY_VALUES.HR]: 'com_ui_agent_category_hr',
  [CATEGORY_VALUES.RD]: 'com_ui_agent_category_rd', // R&D
  [CATEGORY_VALUES.FINANCE]: 'com_ui_agent_category_finance',
  [CATEGORY_VALUES.IT]: 'com_ui_agent_category_it',
  [CATEGORY_VALUES.SALES]: 'com_ui_agent_category_sales',
  [CATEGORY_VALUES.AFTERSALES]: 'com_ui_agent_category_aftersales',
} as const;

// The categories array used in the UI
export const AGENT_CATEGORIES: AgentCategory[] = [
  { value: CATEGORY_VALUES.GENERAL, label: CATEGORY_LABELS[CATEGORY_VALUES.GENERAL] },
  { value: CATEGORY_VALUES.HR, label: CATEGORY_LABELS[CATEGORY_VALUES.HR] },
  { value: CATEGORY_VALUES.RD, label: CATEGORY_LABELS[CATEGORY_VALUES.RD] },
  { value: CATEGORY_VALUES.FINANCE, label: CATEGORY_LABELS[CATEGORY_VALUES.FINANCE] },
  { value: CATEGORY_VALUES.IT, label: CATEGORY_LABELS[CATEGORY_VALUES.IT] },
  { value: CATEGORY_VALUES.SALES, label: CATEGORY_LABELS[CATEGORY_VALUES.SALES] },
  { value: CATEGORY_VALUES.AFTERSALES, label: CATEGORY_LABELS[CATEGORY_VALUES.AFTERSALES] },
];

// The empty category placeholder
export const EMPTY_AGENT_CATEGORY: AgentCategory = {
  value: '',
  label: 'com_ui_agent_category_general',
};
