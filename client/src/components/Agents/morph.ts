import type { TargetAndTransition, Transition } from 'framer-motion';

/**
 * Shared-layout morph between a marketplace card and its detail dialog.
 *
 * The card and the dialog each render their own surface layer plus their own
 * arrangement of the same identity fields. Matching `layoutId`s hand the surface
 * and those fields from one layout to the other, so the information rearranges
 * itself instead of the dialog being a scaled-up card. Everything that only
 * exists in the dialog fades in separately, after the geometry is under way.
 */

/** iOS-style ease: immediate pickup, long settle, no overshoot. */
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/** `--theme-surface-radius`'s own default, for a root that has not set it. */
const FALLBACK_SURFACE_RADIUS_REM = 1;

/**
 * The theme's surface radius in pixels.
 *
 * A scaling projection can only keep a corner from distorting if it owns the
 * radius as a number, which a `rounded-theme-surface` class cannot give it. So
 * the token is resolved once per morph — never per card, never per frame — and
 * both endpoints animate the same value the stylesheet would have painted.
 */
export const readSurfaceRadius = (): number => {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const rootFontSize = parseFloat(styles.fontSize) || 16;
  const token = styles.getPropertyValue('--theme-surface-radius').trim();
  const value = parseFloat(token);
  if (!Number.isFinite(value)) {
    return FALLBACK_SURFACE_RADIUS_REM * rootFontSize;
  }
  return token.endsWith('px') ? value : value * rootFontSize;
};

/** Card surface to dialog surface. */
export const MORPH_OPEN_TRANSITION: Transition = { duration: 0.45, ease: EASE };

/**
 * Dialog surface back into the card. Shorter than the open, and the
 * dialog-only content leaves while it runs, so the whole close lands in the
 * same budget as the open while reading as more responsive.
 */
export const MORPH_CLOSE_TRANSITION: Transition = { duration: 0.34, ease: EASE };

/**
 * How long the dialog stays mounted after Radix reports a close, so its
 * dialog-only content can fade out before the surface is handed back to the
 * card. Must cover {@link DETAIL_EXIT}'s duration.
 */
export const MORPH_HANDOFF_MS = 110;

/**
 * The page dim is animated here rather than by the dialog's own overlay: it has
 * to run its full 0 -> 1 range on open, and its full 1 -> 0 range across the
 * contraction, which outlives the dialog's mount.
 */
export const BACKDROP_ENTER_TRANSITION: Transition = { duration: 0.24, ease: EASE };
export const BACKDROP_EXIT_TRANSITION: Transition = {
  duration: MORPH_CLOSE_TRANSITION.duration,
  ease: EASE,
};

type MorphPart = 'surface' | 'avatar' | 'title' | 'category' | 'owner' | 'description';

const MORPH_PREFIX: Record<MorphPart, string> = {
  surface: 'agent-card-',
  avatar: 'agent-avatar-',
  title: 'agent-title-',
  category: 'agent-category-',
  owner: 'agent-owner-',
  description: 'agent-description-',
};

/** Stable shared-layout id for one field of one agent. */
export const agentMorphId = (part: MorphPart, agentId: string): string =>
  `${MORPH_PREFIX[part]}${agentId}`;

/**
 * `layoutDependency` for the dialog side. Layout is only measured when this
 * value changes, which keeps the virtualized grid's per-scroll rerenders from
 * measuring every card; the card side passes its `expanded` flag. The two sides
 * must never be equal, or a promoted node has nothing to resume from and the
 * morph degrades to a cut.
 */
export const DIALOG_MORPH_DEPENDENCY = 'dialog';

/**
 * Dialog-only content: introduced after the geometry animation has begun, and
 * on the way out it travels back the way it came in rather than just dropping.
 */
export const DETAIL_INITIAL: TargetAndTransition = { opacity: 0, y: 8 };
export const DETAIL_ENTER: TargetAndTransition = {
  opacity: 1,
  y: 0,
  transition: { duration: 0.2, ease: 'easeOut', delay: 0.08 },
};
export const DETAIL_EXIT: TargetAndTransition = {
  opacity: 0,
  y: 8,
  transition: { duration: 0.11, ease: 'easeIn' },
};

/** Reduced motion, or no source card to morph from: opacity only. */
export const DETAIL_FADE_INITIAL: TargetAndTransition = { opacity: 0 };
export const DETAIL_FADE_ENTER: TargetAndTransition = {
  opacity: 1,
  transition: { duration: 0.12, ease: 'linear' },
};

/**
 * Card content with no counterpart in the dialog ("View details" and the footer
 * rule). It leaves early rather than pretending to become one of the dialog's
 * controls.
 */
export const CARD_HANDOFF_VARIANTS = {
  rest: { opacity: 1, transition: { duration: 0.18, ease: 'easeOut', delay: 0.1 } },
  handoff: { opacity: 0, transition: { duration: 0.12, ease: 'easeOut' } },
} as const;
