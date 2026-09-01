/**
 * LangChain classifies a provider failure by mutating the error: it stamps `lc_error_code` and
 * appends `\n\nTroubleshooting URL: <docs url>\n` to the message. Both halves are handled here
 * because the server strips the URL before persisting the message, while the client still reads the
 * code back out of messages persisted before it did.
 */
const TROUBLESHOOTING_URL =
  /\s*Troubleshooting URL:\s*https?:\/\/\S*langchain\S*\/errors\/[A-Za-z_]+\/?\s*/g;

const ERROR_CODE_URL = /langchain\S*\/errors\/([A-Za-z_]+)/i;

/** Provider errors cross untyped boundaries, so a `message` is not guaranteed to be a string. */
function toMessageText(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  return message == null ? '' : String(message);
}

/** Removes LangChain's appended docs URL so provider text carries no third-party attribution. */
export function stripLangChainTroubleshootingUrl(message: unknown): string {
  return toMessageText(message).replace(TROUBLESHOOTING_URL, ' ').trim();
}

/** The classification LangChain encoded in the docs URL it appended, when the text carries one. */
export function parseLangChainErrorCode(message: unknown): string | undefined {
  return toMessageText(message).match(ERROR_CODE_URL)?.[1]?.toUpperCase();
}
