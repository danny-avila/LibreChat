import { matchPath } from 'react-router-dom';

const matchesRouteStart = (pathname: string, pattern: string) =>
  matchPath({ path: pattern, end: false }, pathname) != null;

export const isArtifactRoute = (pathname: string) =>
  matchesRouteStart(pathname, '/c/*') || matchesRouteStart(pathname, '/share/*');

/**
 * Navigation options for switching between chats.
 *
 * Commits the location update in the caller's own task rather than React's
 * transition lane. A transition keeps the OUTGOING route painted until the
 * incoming one finishes rendering, so switching conversations left the
 * previous transcript on screen under the new URL for as long as the next
 * thread took to render. Nothing here reads route data through router
 * loaders, so the transition bought no pending UI — and conversation state
 * still lives in Recoil, whose transition-safe reads are gated behind
 * `_TRANSITION_SUPPORT_UNSTABLE` hooks this app does not use.
 *
 * Deliberately per-navigation rather than `useTransitions={false}` on the
 * provider: the lazily loaded prompts, skills, insights and project screens
 * keep the transition, where yielding to input during a large first render is
 * worth more than swapping atomically.
 */
export const chatNavigation = { flushSync: true } as const;
