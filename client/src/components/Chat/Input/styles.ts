import { cn } from '~/utils';

/**
 * Shared composer-surface appearance: every input surface that should read as
 * "the composer" (main chat form, subagent control footer) draws its border,
 * background, and text colors from this one decision. Layout, radius, and
 * padding stay with each owner.
 */
export const composerSurfaceClasses = (options?: { temporary?: boolean }): string =>
  cn(
    'border text-text-primary transition-all duration-200',
    options?.temporary === true
      ? 'border-violet-800/60 bg-violet-950/10'
      : 'border-border-light bg-surface-chat',
  );

/** Elevation states for the composer surface. `within` is the CSS-only
 *  equivalent of the managed focused/blurred pair for surfaces that do not
 *  track focus in state. */
export const composerSurfaceShadow = {
  focused: 'shadow-lg',
  blurred: 'shadow-md',
  within: 'shadow-md focus-within:shadow-lg',
} as const;
