import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatFormContext } from '~/Providers';

export default function useQueryParams({
  textAreaRef,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const methods = useChatFormContext();
  const [searchParams] = useSearchParams();
  const attemptsRef = useRef(0);
  const processedRef = useRef(false);
  const maxAttempts = 50; // 5 seconds maximum (50 * 100ms)

  useEffect(() => {
    const decodedPrompt = searchParams.get('prompt') ?? '';
    if (!decodedPrompt) {
      return;
    }

    const intervalId = setInterval(() => {
      // If already processed or max attempts reached, clear interval and stop
      if (processedRef.current || attemptsRef.current >= maxAttempts) {
        clearInterval(intervalId);
        if (attemptsRef.current >= maxAttempts) {
          console.warn('Max attempts reached, failed to process prompt');
        }
        return;
      }

      attemptsRef.current += 1;

      if (textAreaRef.current) {
        const currentText = methods.getValues('text');

        // Only update if the textarea is empty
        if (!currentText) {
          methods.setValue('text', decodedPrompt, { shouldValidate: true });
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);

          // Remove the 'prompt' parameter from the URL
          searchParams.delete('prompt');
          const newUrl = `${window.location.pathname}${
            searchParams.toString() ? `?${searchParams.toString()}` : ''
          }`;
          window.history.replaceState({}, '', newUrl);

          processedRef.current = true;
          console.log('Prompt processed successfully');
        }

        clearInterval(intervalId);
      }
    }, 100); // Check every 100ms

    // Clean up the interval on unmount
    return () => {
      clearInterval(intervalId);
      console.log('Cleanup: interval cleared');
    };
  }, [searchParams, methods, textAreaRef]);
}
