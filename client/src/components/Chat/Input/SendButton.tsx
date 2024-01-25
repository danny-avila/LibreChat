import { SendIcon } from '~/components/svg';
import { cn } from '~/utils';

export default function SendButton({ text, disabled }) {
  return (
    <button
      disabled={!text || disabled}
      className={cn(
        'absolute bottom-1.5 right-2 rounded-lg border border-black p-0.5 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:hover:bg-gray-900 dark:disabled:bg-white dark:disabled:hover:bg-transparent md:bottom-3 md:right-3',
      )}
      data-testid="send-button"
      type="submit"
    >
      <span className="" data-state="closed">
        <SendIcon size={24} />
      </span>
    </button>
  );
}
