/**
 * Icon button sitting beside a section heading — the Projects actions, and the
 * bookmark filter next to Chats. Shared so the two headings cannot drift apart
 * in size, radius or hover treatment.
 */
export const sectionActionClassName =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary';

/** Icon size that sits correctly inside `sectionActionClassName`. */
export const sectionActionIconClassName = 'h-4 w-4';
