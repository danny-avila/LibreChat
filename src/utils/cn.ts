import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

export default function cn(...inputs: string[]) {
  return twMerge(clsx(inputs));
}
