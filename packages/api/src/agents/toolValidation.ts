const TOOL_INPUT_SCHEMA_ERROR = 'Received tool input did not match expected schema';
const SCHEMA_ERROR_PATH_PATTERN = /(?:→|->)\s+at\s+([A-Za-z0-9_.[\]-]{1,120})/;
const ASK_OPTION_LABEL_PATH_PATTERN = /^options\[\d+\]\.label$/;
const OPTION_LABEL_LIMIT_PATTERN = /(?:at most \d+|\d+ characters or fewer)/i;

interface CompletedToolCall {
  tool_call?: {
    name?: unknown;
    output?: unknown;
  };
}

export type ToolInputValidationReason = 'invalid_tool_input' | 'option_label_too_long';

export interface ToolInputValidationDetails {
  toolName: string;
  reason: ToolInputValidationReason;
  fieldPath?: string;
}

/**
 * Reduce a tool input validation failure to privacy-safe structured fields for
 * observability. Tool arguments and the raw validation message can contain
 * user/model content, so callers should log only the returned details.
 */
export function getToolInputValidationDetails(
  result: CompletedToolCall | null | undefined,
): ToolInputValidationDetails | null {
  const toolName = result?.tool_call?.name;
  const output = result?.tool_call?.output;
  if (
    typeof toolName !== 'string' ||
    typeof output !== 'string' ||
    !output.includes(TOOL_INPUT_SCHEMA_ERROR)
  ) {
    return null;
  }

  const fieldPath = output.match(SCHEMA_ERROR_PATH_PATTERN)?.[1];
  const optionLabelTooLong =
    toolName === 'ask_user_question' &&
    fieldPath != null &&
    ASK_OPTION_LABEL_PATH_PATTERN.test(fieldPath) &&
    OPTION_LABEL_LIMIT_PATTERN.test(output);

  return {
    toolName,
    reason: optionLabelTooLong ? 'option_label_too_long' : 'invalid_tool_input',
    ...(fieldPath != null ? { fieldPath } : {}),
  };
}
