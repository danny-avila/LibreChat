import { z } from 'zod';

export const updateFileSchema = z
  .object({
    file_id: z.string().min(1),
    pinned: z.boolean().optional(),
    filename: z.string().min(1).optional(),
  })
  .refine((data) => data.pinned !== undefined || data.filename !== undefined, {
    message: 'At least one of pinned or filename must be provided',
  });
