import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

/**
 * Merges the tailwind clases (using twMerge). Conditionally removes false values
 * @param inputs The tailwind classes to merge
 * @returns className string to apply to an element or HOC
 */
export default function cn(...inputs: Array<string | boolean>) {
  return twMerge(clsx(inputs));
}
