const DEFAULT_ASSISTANT_DISPLAY_NAME = 'CodeCan';
const DEFAULT_ASSISTANT_MODEL_LABEL = DEFAULT_ASSISTANT_DISPLAY_NAME;

/**
 * Centralized assistant/app display name for UI copy.
 * Falls back to the current branded name but can be overridden via Vite env.
 */
export const ASSISTANT_DISPLAY_NAME =
  (import.meta.env.VITE_ASSISTANT_DISPLAY_NAME?.trim() as string | undefined) ??
  DEFAULT_ASSISTANT_DISPLAY_NAME;

/**
 * Label used when the model name would otherwise show GPT-5/ChatGPT.
 */
export const ASSISTANT_MODEL_LABEL =
  (import.meta.env.VITE_ASSISTANT_MODEL_LABEL?.trim() as string | undefined) ??
  DEFAULT_ASSISTANT_MODEL_LABEL;

/**
 * Optional icon URL for the assistant; falls back to provider-specific icon when not set.
 */
export const ASSISTANT_ICON_URL = import.meta.env.VITE_ASSISTANT_ICON_URL?.trim() ?? '';
