import { z } from 'zod';

export const safeFieldPath = z
  .string()
  .min(1)
  .refine(
    (p) => !/(^|\.)(__proto__|constructor|prototype)($|\.)/.test(p),
    'Field path contains a disallowed segment',
  );
