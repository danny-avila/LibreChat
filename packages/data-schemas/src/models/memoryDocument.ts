import memoryDocumentSchema from '~/schema/memoryDocument';
import type { IMemoryDocument } from '~/types/memoryDocument';

export function createMemoryDocumentModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.MemoryDocument || mongoose.model<IMemoryDocument>('MemoryDocument', memoryDocumentSchema);
}
