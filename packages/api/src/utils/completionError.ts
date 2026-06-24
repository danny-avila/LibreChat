interface ProviderErrorBody {
  type?: string;
  message?: string;
}

interface CompletionErrorLike {
  message?: string;
  type?: string;
  status?: number;
  request_id?: string;
  error?: ProviderErrorBody;
}

const PROVIDER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  overloaded_error:
    'The AI provider is temporarily overloaded. Please wait a moment and try again.',
  rate_limit_error: 'Rate limit exceeded. Please wait a moment and try again.',
};

function parseMessageAsError(message: string): CompletionErrorLike | null {
  try {
    const parsed = JSON.parse(message) as CompletionErrorLike;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function extractProviderErrorType(error: CompletionErrorLike): string | undefined {
  const nestedType = error.error?.type;
  if (nestedType && nestedType !== 'error') {
    return nestedType;
  }

  if (error.type && error.type !== 'error') {
    return error.type;
  }

  if (error.status === 529) {
    return 'overloaded_error';
  }

  const message = error.message;
  if (!message) {
    return undefined;
  }

  const parsed = parseMessageAsError(message);
  if (parsed) {
    const parsedType = extractProviderErrorType(parsed);
    if (parsedType) {
      return parsedType;
    }
  }

  if (/^overloaded$/i.test(message.trim())) {
    return 'overloaded_error';
  }

  return undefined;
}

/**
 * Resolves a user-facing completion error message from a provider or runtime error.
 * Maps known provider error types (e.g. Anthropic overloaded_error) to friendly copy.
 */
export function resolveCompletionErrorMessage(
  error: CompletionErrorLike | null | undefined,
  defaultMessage = 'An error occurred while processing the request',
): string {
  if (!error) {
    return defaultMessage;
  }

  const errorType = extractProviderErrorType(error);
  if (errorType) {
    const friendlyMessage = PROVIDER_ERROR_MESSAGES[errorType];
    if (friendlyMessage) {
      return friendlyMessage;
    }
  }

  const message = error.message;
  if (message) {
    return `${defaultMessage}: ${message}`;
  }

  return defaultMessage;
}
