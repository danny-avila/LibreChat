import { memo, useCallback } from 'react';
import { useSubmitMessage } from '~/hooks';

/**
 * Clickable reply chips rendered after the latest assistant message, sourced
 * from a model-emitted `<suggestions>` block (parsed via `extractSuggestions`).
 * Clicking a chip submits it as the user's next message.
 */
const SuggestedReplies = memo(function SuggestedReplies({
  suggestions,
}: {
  suggestions: string[];
}) {
  const { submitMessage } = useSubmitMessage();
  const send = useCallback((text: string) => submitMessage({ text }), [submitMessage]);

  if (!suggestions.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested replies">
      {suggestions.map((text, index) => (
        <button
          key={index}
          type="button"
          onClick={() => send(text)}
          className="rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-secondary transition-colors duration-200 hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          {text}
        </button>
      ))}
    </div>
  );
});

export default SuggestedReplies;
