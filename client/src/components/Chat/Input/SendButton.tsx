import { SendIcon, ListeningIcon } from '~/components/svg';
import { cn } from '~/utils';
import { useEffect, useState } from 'react';

export default function SendButton({ text, disabled, isListening }) {
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer;
    if (isListening) {
      setCountdown(3);
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isListening]);

  return (
    <>
      {isListening ? (
        <button
          className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500"
          disabled={true}
        >
          <span className="" data-state="closed">
            {countdown > 0 ? (
              <div className="text-xl  text-white">{countdown}</div>
            ) : (
              <ListeningIcon />
            )}
          </span>
        </button>
      ) : (
        <button
          disabled={!text || disabled}
          className={cn(
            'absolute rounded-lg rounded-md border border-black p-0.5 p-1 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white enabled:dark:bg-white dark:disabled:bg-white ',
            'bottom-1.5 right-1.5 md:bottom-2.5 md:right-3 md:p-[2px]',
          )}
          data-testid="send-button"
          type="submit"
        >
          <span className="" data-state="closed">
            <SendIcon size={24} />
          </span>
        </button>
      )}
    </>
  );
}
