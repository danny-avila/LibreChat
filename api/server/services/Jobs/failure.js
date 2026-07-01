/**
 * Detects provider / pipeline failures that LibreChat surfaces as a normal
 * assistant message (`error: true`, an `error` content part, or the standard
 * "Something went wrong" copy) instead of throwing. Without this check the job
 * planner treats the step as successful and schedules another turn — which
 * looks like endless retries in the same background task.
 */

const ERROR_CONTENT_TYPE = 'error';

const FAILURE_PREFIXES = ['Something went wrong', 'An error occurred while processing the request'];

/** Provider JSON blobs embedded in the rendered error text. */
const PROVIDER_ERROR_JSON = /"type"\s*:\s*"error"/i;

/** Common non-retryable provider failures. */
const NON_RETRYABLE_HINTS =
  /invalid_request_error|credit balance is too low|authentication_error|permission_error|billing|insufficient_quota/i;

/**
 * @param {unknown} capturedError
 * @returns {string | undefined}
 */
function formatCapturedError(capturedError) {
  if (capturedError == null || capturedError === '') {
    return undefined;
  }
  if (typeof capturedError === 'string') {
    return capturedError;
  }
  if (typeof capturedError === 'object' && capturedError !== null) {
    if (typeof capturedError.message === 'string') {
      return capturedError.message;
    }
    try {
      return JSON.stringify(capturedError);
    } catch {
      return String(capturedError);
    }
  }
  return String(capturedError);
}

/**
 * @param {string} responseText
 * @returns {string}
 */
function summarizeFailureText(responseText) {
  const trimmed = responseText.trim();
  if (trimmed.length <= 500) {
    return trimmed;
  }
  return `${trimmed.slice(0, 499)}…`;
}

/**
 * @param {Array<{ type?: string, text?: string, error?: string }> | undefined} content
 * @returns {boolean}
 */
function hasErrorContentPart(content) {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((part) => part?.type === ERROR_CONTENT_TYPE);
}

/**
 * Reads assistant output from either `text` or structured `content` parts.
 *
 * @param {{ text?: string, content?: Array<{ type?: string, text?: string, error?: string }> } | undefined} response
 * @returns {string}
 */
function extractStepResponseText(response) {
  if (typeof response?.text === 'string' && response.text.length > 0) {
    return response.text;
  }
  if (!Array.isArray(response?.content)) {
    return '';
  }

  const parts = [];
  for (const part of response.content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text);
      continue;
    }
    if (part?.type === ERROR_CONTENT_TYPE) {
      const errorText = part.error ?? part[ERROR_CONTENT_TYPE];
      if (typeof errorText === 'string' && errorText.length > 0) {
        parts.push(errorText);
      }
    }
  }
  return parts.join('\n').trim();
}

/**
 * @param {string} responseText
 * @returns {boolean}
 */
function looksLikeFailureText(responseText) {
  if (typeof responseText !== 'string' || responseText.length === 0) {
    return false;
  }

  if (FAILURE_PREFIXES.some((prefix) => responseText.includes(prefix))) {
    return true;
  }

  if (NON_RETRYABLE_HINTS.test(responseText)) {
    return true;
  }

  return PROVIDER_ERROR_JSON.test(responseText) && NON_RETRYABLE_HINTS.test(responseText);
}

/**
 * @param {{ response?: { error?: boolean, text?: string, content?: unknown[] }, responseText?: string, capturedError?: unknown }} params
 * @returns {string | null} Failure message when the step should stop the job.
 */
function detectStepFailure({ response, responseText, capturedError }) {
  const captured = formatCapturedError(capturedError);
  if (captured) {
    return captured;
  }

  const text =
    typeof responseText === 'string' && responseText.length > 0
      ? responseText
      : extractStepResponseText(response);

  if (response?.error === true || hasErrorContentPart(response?.content)) {
    return text.length > 0 ? summarizeFailureText(text) : 'Model request failed';
  }

  if (looksLikeFailureText(text)) {
    return summarizeFailureText(text);
  }

  return null;
}

module.exports = {
  detectStepFailure,
  extractStepResponseText,
  hasErrorContentPart,
  looksLikeFailureText,
};
