import { cn, removeFocusOutlines } from '~/utils/';

export default function Button({ children }) {
  <button
    className={cn(
      'custom-btn btn-neutral relative -z-0 whitespace-nowrap border-0 md:border',
      removeFocusOutlines,
    )}
  >
    <div className="flex w-full items-center justify-center gap-2">{children}</div>
  </button>;
}
