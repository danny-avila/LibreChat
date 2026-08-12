import { cn } from '~/utils';

type HoverButtonStyleOptions = {
  isActive?: boolean;
  isLast?: boolean;
  className?: string;
};

/**
 * Shared appearance for the message hover actions.
 *
 * The actions fade in with the row on pointer devices. When a button opens a
 * surface (the editor, the fork popover, a submitted rating) it reports
 * `isActive`, and the whole toolbar stays opaque for as long as that surface is
 * open, so the pointer can leave the row without the actions vanishing out from
 * under whatever it opened.
 *
 * The marker is deliberately not the legacy `active` class: `HoverButtons`
 * pins that one to the edit button of every assistant message, which would
 * hold the entire toolbar open on every assistant row.
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
      'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0',
    'group-has-[.hover-button-active]:visible group-has-[.hover-button-active]:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:outline-none',
    isActive && 'hover-button-active active text-text-primary bg-surface-hover',
    className,
  );
