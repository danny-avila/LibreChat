import { FileContext, projectFileSources, codeInterpreterMimeTypes } from 'librechat-data-provider';
import type { FilterQuery } from 'mongoose';
import type { IMongoFile } from '~/types/file';

/** Eligibility is shared by association, hydration, and the project file picker. */
export function projectFileFilter(codeExecution = false): FilterQuery<IMongoFile> {
  const searchable = { embedded: true, context: FileContext.message_attachment };
  if (!codeExecution) {
    return searchable;
  }
  return {
    $or: [
      searchable,
      {
        context: {
          $in: [FileContext.message_attachment, FileContext.execute_code, FileContext.run_artifact],
        },
        source: { $in: projectFileSources },
        type: { $in: codeInterpreterMimeTypes },
      },
    ],
  };
}
