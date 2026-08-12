import { cn } from '~/utils';

type HoverButtonStyleOptions = {
  isActive?: boolean;
  isLast?: boolean;
  className?: string;
};

/**
 * Shared appearance for the message hover actions.
 *
 * The actions fade in with the row on pointer devices. A button that opened a
 * surface (the editor, the fork popover, a submitted rating) reports
 * `isActive` and keeps full opacity, so its trigger stays on screen once the
 * pointer leaves the row for whatever it opened.
 */
export const hoverButtonClasses = ({
  isActive = false,
  isLast = false,
  className,
}: HoverButtonStyleOptions = {}) =>
  cn(
    'hover-button size-auto rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'group-hover:visible group-focus-within:visible group-[.final-completion]:visible',
    !isLast &&
      !isActive &&
      'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0',
    'focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:outline-none',
    isActive && 'active text-text-primary bg-surface-hover',
    className,
  );
