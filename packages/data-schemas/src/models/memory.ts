import memorySchema from '~/schema/memory';
import type { IMemoryEntry } from '~/types/memory';

export function createMemoryModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.MemoryEntry || mongoose.model<IMemoryEntry>('MemoryEntry', memorySchema);
}
