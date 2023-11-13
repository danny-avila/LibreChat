import { SendIcon } from '~/components/svg';

export default function SendButton({ text }) {
  return (
    <button
      disabled={!text}
      className="enabled:bg-brand-purple absolute bottom-1.5 right-2 rounded-lg rounded-md border border-black p-0.5 p-1 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 disabled:opacity-40 dark:border-white dark:bg-white dark:hover:bg-gray-900 dark:disabled:bg-white dark:disabled:hover:bg-transparent md:bottom-3 md:right-3 md:p-[2px]"
      data-testid="send-button"
      type="submit"
    >
      <span className="" data-state="closed">
        <SendIcon size={24} />
      </span>
    </button>
  );
}
