import type { TFile, TMessage } from 'librechat-data-provider';

export type FileDeliveryMetadataMap = Readonly<
  Record<string, Pick<TFile, 'llmDeliveryPath'> | undefined>
>;

/** Restores display-only delivery metadata that an older replica may have
 * omitted from a persisted attachment ref. The persisted ref wins, followed
 * by the matching process-local ref, then the owner-scoped stored file map. */
export function hydrateFileDeliveryMetadata(
  persistedFiles: TMessage['files'],
  localFiles?: TMessage['files'],
  storedFiles?: FileDeliveryMetadataMap,
): TMessage['files'] {
  if (persistedFiles == null || persistedFiles.length === 0) {
    return persistedFiles;
  }
  const localById = new Map(
    (localFiles ?? []).flatMap((file) =>
      file.file_id != null ? [[file.file_id, file] as const] : [],
    ),
  );
  let changed = false;
  const hydrated = persistedFiles.map((file) => {
    const local = file.file_id == null ? undefined : localById.get(file.file_id);
    const stored = file.file_id == null ? undefined : storedFiles?.[file.file_id];
    const llmDeliveryPath = local?.llmDeliveryPath ?? stored?.llmDeliveryPath;
    if (file.llmDeliveryPath != null || llmDeliveryPath == null) {
      return file;
    }
    changed = true;
    return { ...file, llmDeliveryPath };
  });
  return changed ? hydrated : persistedFiles;
}
