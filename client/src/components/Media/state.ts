import { z } from 'zod';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import {
  mediaAssetSchema,
  mediaInputSchema,
  mediaOperationSchema,
  mediaImportRequestSchema,
  mediaImageParametersSchema,
  mediaVideoParametersSchema,
  mediaSubmissionRequestSchema,
  mediaRetryRequestSchema,
} from 'librechat-data-provider';
import type { SetStateAction } from 'react';

const prefix = 'librechat:media:';
const draftSchema = z.object({
  prompt: z.string(),
  operation: mediaOperationSchema,
  offering: z.string(),
  parentTurnId: z.string().optional(),
  inputs: z.array(mediaInputSchema),
  assets: z.array(mediaAssetSchema),
  parameters: mediaImageParametersSchema.merge(mediaVideoParametersSchema),
  revision: z.number(),
});
export type MediaDraft = z.infer<typeof draftSchema>;
export const emptyDraft = (): MediaDraft => ({
  prompt: '',
  operation: 'image.generate',
  offering: '',
  inputs: [],
  assets: [],
  parameters: { count: 1 },
  revision: 0,
});

const pendingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('retry'),
    request: mediaRetryRequestSchema,
    jobId: z.string(),
    draftKey: z.string(),
    draftRevision: z.number(),
  }),
  z.object({
    kind: z.literal('submission'),
    request: mediaSubmissionRequestSchema,
    draftKey: z.string(),
    draftRevision: z.number(),
  }),
  z.object({
    kind: z.literal('import'),
    request: mediaImportRequestSchema,
    draftKey: z.string(),
    draftRevision: z.number(),
  }),
]);
export type PendingMedia = z.infer<typeof pendingSchema>;

function storedAtom<T>(key: string, fallback: T, schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  let initial = fallback;
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (raw) {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) initial = parsed.data;
    }
  } catch {
    initial = fallback;
  }
  const base = atom(initial);
  return atom(
    (get) => get(base),
    (get, set, update: SetStateAction<T>) => {
      const next =
        typeof update === 'function' ? (update as (previous: T) => T)(get(base)) : update;
      set(base, next);
      try {
        sessionStorage.setItem(prefix + key, JSON.stringify(next));
      } catch {
        // In-memory state remains usable when browser storage is unavailable.
      }
    },
  );
}

export const mediaDraftFamily = atomFamily((key: string) =>
  storedAtom(key, emptyDraft(), draftSchema),
);
export const mediaPendingFamily = atomFamily((scope: string) =>
  storedAtom<PendingMedia[]>(`${scope}:pending`, [], z.array(pendingSchema)),
);
const librarySchema = z.object({
  filter: z.enum(['all', 'pending', 'completed']),
  search: z.string(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  view: z.enum(['thread', 'gallery']).default('thread'),
  threadId: z.string().optional(),
});
export type MediaLibrary = z.infer<typeof librarySchema>;
export const mediaLibraryFamily = atomFamily((scope: string) =>
  storedAtom(
    `${scope}:library`,
    { filter: 'all', search: '', columns: 2, view: 'thread' } as MediaLibrary,
    librarySchema,
  ),
);

export function clearMediaSessionStorage() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    // Browser storage may be unavailable.
  }
  mediaDraftFamily.setShouldRemove(() => true);
  mediaPendingFamily.setShouldRemove(() => true);
  mediaLibraryFamily.setShouldRemove(() => true);
  mediaDraftFamily.setShouldRemove(null);
  mediaPendingFamily.setShouldRemove(null);
  mediaLibraryFamily.setShouldRemove(null);
}
