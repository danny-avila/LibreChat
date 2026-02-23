/**
 * Configuration for predefined agent provider and model values
 * This allows setting fixed values that users cannot change
 */

export interface AgentDefaultsConfig {
  /** Whether to use predefined values (true) or allow user selection (false) */
  usePredefined: boolean;
  /** Predefined provider value */
  provider: string;
  /** Predefined model value */
  model: string;
  /** Display name for the provider (optional, defaults to provider value) */
  providerDisplayName?: string;
  /** Display name for the model (optional, defaults to model value) */
  modelDisplayName?: string;
  /** Show agent buttons on landing page */
  showAgentButtons: boolean;
  /** Show predefined model selector */
  showModelSelector: boolean;
}

/**
 * Default configuration - can be modified to set your preferred values
 * 
 * Examples:
 * - Use predefined: { usePredefined: true, provider: 'openai', model: 'gpt-4' }
 * - Allow selection: { usePredefined: false, provider: '', model: '' }
 */
export const AGENT_DEFAULTS: AgentDefaultsConfig = {
  usePredefined: false, // Set to true to lock provider and model
  provider: 'openai', // Change this to your preferred provider
  model: 'gpt-4o', // Change this to your preferred model
  providerDisplayName: 'OpenAI',
  modelDisplayName: 'GPT-4o',
  showAgentButtons: true, // Show available agents on landing page
  showModelSelector: true, // Show model selector in header
};

/**
 * Helper function to get the current agent defaults configuration
 * In a real application, this could be loaded from environment variables or a config file
 */
export const getAgentDefaults = (): AgentDefaultsConfig => {
  return AGENT_DEFAULTS;
};

/**
 * Helper function to check if predefined values should be used
 */
export const shouldUsePredefinedValues = (): boolean => {
  return getAgentDefaults().usePredefined;
};

/**
 * Helper function to check if agent buttons should be shown
 */
export const shouldShowAgentButtons = (): boolean => {
  return getAgentDefaults().showAgentButtons;
};

/**
 * Helper function to check if model selector should be shown
 */
export const shouldShowModelSelector = (): boolean => {
  return getAgentDefaults().showModelSelector;
};
