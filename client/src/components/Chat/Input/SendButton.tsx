import { SendIcon } from '~/components/svg';
import { cn } from '~/utils';

export default function SendButton({ text, disabled }) {
  return (
    <button
      disabled={!text || disabled}
      className={cn(
        'absolute md:bottom-3 md:right-3 dark:hover:bg-gray-900 dark:disabled:hover:bg-transparent right-2 dark:disabled:bg-white disabled:bg-black disabled:opacity-10 disabled:text-gray-400 enabled:bg-black text-white p-0.5 border border-black rounded-lg dark:border-white dark:bg-white bottom-1.5 transition-colors',
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
