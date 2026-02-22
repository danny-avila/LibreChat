import type { MemoriesResponse, TUserMemory, MemoryArtifact } from 'librechat-data-provider';

type HandleMemoryArtifactParams = {
  memoryArtifact: MemoryArtifact;
  currentData: MemoriesResponse;
};

/**
 * Pure function to handle memory artifact updates
 * @param params - Object containing memoryArtifact and currentData
 * @returns Updated MemoriesResponse or undefined if no update needed
 */
export function handleMemoryArtifact({
  memoryArtifact,
  currentData,
}: HandleMemoryArtifactParams): MemoriesResponse | undefined {
  const { type, key, value, tokenCount = 0 } = memoryArtifact;

  if (type === 'update' && !value) {
    return undefined;
  }

  const memories = currentData.memories;
  const existingIndex = memories.findIndex((m) => m.key === key);

  if (type === 'delete') {
    if (existingIndex === -1) {
      return undefined;
    }

    const deletedMemory = memories[existingIndex];
    const newMemories = [...memories];
    newMemories.splice(existingIndex, 1);

    const totalTokens = currentData.totalTokens - (deletedMemory.tokenCount || 0);
    const usagePercentage = currentData.tokenLimit
      ? Math.min(100, Math.round((totalTokens / currentData.tokenLimit) * 100))
      : null;

    return {
      ...currentData,
      memories: newMemories,
      totalTokens,
      usagePercentage,
    };
  }

  if (type === 'update') {
    const timestamp = new Date().toISOString();
    let totalTokens = currentData.totalTokens;
    let newMemories: TUserMemory[];

    if (existingIndex >= 0) {
      const oldTokenCount = memories[existingIndex].tokenCount || 0;
      totalTokens = totalTokens - oldTokenCount + tokenCount;

      newMemories = [...memories];
      newMemories[existingIndex] = {
        key,
        value: value!,
        tokenCount,
        updated_at: timestamp,
      };
    } else {
      totalTokens = totalTokens + tokenCount;
      newMemories = [
        ...memories,
        {
          key,
          value: value!,
          tokenCount,
          updated_at: timestamp,
        },
      ];
    }

    const usagePercentage = currentData.tokenLimit
      ? Math.min(100, Math.round((totalTokens / currentData.tokenLimit) * 100))
      : null;

    return {
      ...currentData,
      memories: newMemories,
      totalTokens,
      usagePercentage,
    };
  }

  return undefined;
}
