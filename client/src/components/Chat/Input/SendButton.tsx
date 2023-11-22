import { SendIcon } from '~/components/svg';
import { cn } from '~/utils';

export default function SendButton({ text, disabled }) {
  return (
    <button
      disabled={!text || disabled}
      className={cn(
        'enabled:bg-brand-purple absolute rounded-lg rounded-md border border-black p-0.5 p-1 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:disabled:bg-white ',
        'bottom-1.5 right-1.5 md:bottom-2.5 md:right-3 md:p-[2px]',
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
