import type { IMemoryEntry } from '~/types/memory';
import memorySchema from '~/schema/memory';

export function createMemoryModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.MemoryEntry || mongoose.model<IMemoryEntry>('MemoryEntry', memorySchema);
}
