import { z } from 'zod';
import type { TFile } from '../types/files';

export const updateFileSchema = z
  .object({
    file_id: z.string().min(1),
    pinned: z.boolean().optional(),
    filename: z.string().min(1).optional(),
  })
  .refine((data) => data.pinned !== undefined || data.filename !== undefined, {
    message: 'At least one of pinned or filename must be provided',
  });

export type UpdateFileMetadataBody = {
  file_id: string;
  pinned?: boolean;
  filename?: string;
};

export type UpdateFileMutationOptions = {
  onSuccess?: (data: TFile, variables: UpdateFileMetadataBody, context?: unknown) => void;
  onMutate?: (variables: UpdateFileMetadataBody) => void | Promise<unknown>;
  onError?: (error: unknown, variables: UpdateFileMetadataBody, context?: unknown) => void;
};
