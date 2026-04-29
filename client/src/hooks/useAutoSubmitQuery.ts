import { useEffect, useRef } from 'react';

/**
 * useAutoSubmitQuery
 *
 * Reads ?query= from the URL on mount and auto-submits it as if the user
 * typed and sent the message. Call this once inside your new-chat page
 * component (the one that renders at /c/new).
 *
 * @param submitMessage - the function your chat input uses to send a message
 *                        (e.g. the same one wired to the Send button)
 *
 * Usage:
 *   import { useAutoSubmitQuery } from '~/hooks/useAutoSubmitQuery';
 *
 *   // Inside your chat page component:
 *   useAutoSubmitQuery((text) => {
 *     // set the input value and submit — adapt to however your chat sends messages
 *     methods.setValue('text', text);
 *     submitMessage({ text });
 *   });
 */
export function useAutoSubmitQuery(submitMessage: (text: string) => void) {
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;

    const params = new URLSearchParams(window.location.search);
    const query = params.get('query');

    if (!query || !query.trim()) return;

    submitted.current = true;

    // Small delay so the chat input and conversation are fully mounted
    const timer = setTimeout(() => {
      submitMessage(query.trim());

      // Clean the URL so refreshing doesn't re-submit
      const url = new URL(window.location.href);
      url.searchParams.delete('query');
      window.history.replaceState({}, '', url.toString());
    }, 300);

    return () => clearTimeout(timer);
  }, [submitMessage]);
}