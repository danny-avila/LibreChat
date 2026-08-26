// ESM utility functions
import { twMerge } from 'tailwind-merge';
import { type ClassValue, clsx } from 'clsx';

export const cn = (...inputs: ClassValue[]): string => {
  return twMerge(clsx(inputs));
};
