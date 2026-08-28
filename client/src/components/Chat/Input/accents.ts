/**
 * Checked-state accent classes for the chat input tool badges.
 * Written out in full because Tailwind cannot resolve interpolated class names.
 */
export const badgeAccents = {
  amber: 'border-amber-600/40 bg-amber-500/10 hover:bg-amber-700/10',
  blue: 'border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10',
  cyan: 'border-cyan-600/40 bg-cyan-500/10 hover:bg-cyan-700/10',
  green: 'border-green-600/40 bg-green-500/10 hover:bg-green-700/10',
  purple: 'border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10',
} as const;
