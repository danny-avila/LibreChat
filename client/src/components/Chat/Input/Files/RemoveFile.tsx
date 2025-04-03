import { useLocalize } from '~/hooks';

export default function RemoveFile({ onRemove }: { onRemove: () => void }) {
  const localize = useLocalize();
  return (
    <button
      type="button"
      className="absolute right-1 top-1 -translate-y-1/2 translate-x-1/2 rounded-full bg-surface-secondary p-0.5 transition-colors duration-200 hover:bg-surface-primary"
      onClick={onRemove}
      aria-label={localize('com_ui_attach_remove')}
    >
      <span aria-hidden="true">
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="2"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="icon-sm"
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    </button>
  );
}
