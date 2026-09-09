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

/**
 * Shared appearance for a labeled control in the composer's action row — the
 * capability checkboxes, the MCP selector, the code-approval selector. Border,
 * radius, height, spacing and elevation are one decision here so a row of them
 * reads as a single set of controls no matter which primitive each is built
 * from. Width, responsive label collapsing and selected/open fills stay with
 * each owner.
 */
export const composerControlClasses = (): string =>
  cn(
    'group relative inline-flex items-center justify-center gap-theme-compact',
    'h-theme-control rounded-theme-control-round border border-border-medium',
    'bg-transparent text-sm font-medium text-text-primary shadow-sm transition-all',
    'hover:bg-surface-hover hover:shadow-md active:shadow-inner',
  );
