import type { MemoriesResponse, TUserMemory, MemoryArtifact } from 'librechat-data-provider';

type HandleMemoryArtifactParams = {
  memoryArtifact: MemoryArtifact;
  currentData: MemoriesResponse;
};

/** Usage totals track the shared personal pool only; agent-partition
 *  writes never affect the personal usage badge. */
const isPersonal = (agentId?: string) => agentId == null;

const samePartition = (memory: TUserMemory, agentId?: string) =>
  (memory.agentId ?? undefined) === (agentId ?? undefined);

/**
 * Pure function to handle memory artifact updates
 * @param params - Object containing memoryArtifact and currentData
 * @returns Updated MemoriesResponse or undefined if no update needed
 */
export function handleMemoryArtifact({
  memoryArtifact,
  currentData,
}: HandleMemoryArtifactParams): MemoriesResponse | undefined {
  const { type, key, value, tokenCount = 0, agentId } = memoryArtifact;

  if (type === 'update' && !value) {
    return undefined;
  }

  const memories = currentData.memories;
  const existingIndex = memories.findIndex((m) => m.key === key && samePartition(m, agentId));

  if (type === 'delete') {
    if (existingIndex === -1) {
      return undefined;
    }

    const deletedMemory = memories[existingIndex];
    const newMemories = [...memories];
    newMemories.splice(existingIndex, 1);

    const totalTokens = isPersonal(agentId)
      ? currentData.totalTokens - (deletedMemory.tokenCount || 0)
      : currentData.totalTokens;
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
    const updatedMemory: TUserMemory = {
      key,
      value: value!,
      tokenCount,
      updated_at: timestamp,
      ...(agentId != null ? { agentId } : {}),
    };

    if (existingIndex >= 0) {
      const oldTokenCount = memories[existingIndex].tokenCount || 0;
      if (isPersonal(agentId)) {
        totalTokens = totalTokens - oldTokenCount + tokenCount;
      }

      newMemories = [...memories];
      newMemories[existingIndex] = {
        ...updatedMemory,
        agentName: memories[existingIndex].agentName,
      };
    } else {
      if (isPersonal(agentId)) {
        totalTokens = totalTokens + tokenCount;
      }
      newMemories = [...memories, updatedMemory];
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
