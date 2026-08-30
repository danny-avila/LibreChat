import { cn } from './utils';

/**
 * Shared composer-surface appearance: every input surface that should read as
 * "the composer" (main chat form, subagent control footer) draws its border,
 * background, and text colors from this one semantic decision. Layout, radius,
 * padding, and feature-specific overrides stay with each owner.
 */
export const composerSurfaceClasses = (): string =>
  cn('border border-border-light bg-surface-chat text-text-primary transition-all duration-200');

/** Elevation states for the composer surface. `within` is the CSS-only
 *  equivalent of the managed focused/blurred pair for surfaces that do not
 *  track focus in state. */
export const composerSurfaceShadow = {
  focused: 'shadow-lg',
  blurred: 'shadow-md',
  within: 'shadow-md focus-within:shadow-lg',
} as const;
