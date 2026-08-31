import type { FilterQuery, Model, ProjectionType } from 'mongoose';
import type { IAssistant } from '~/types';
import { createIndexesWithRetry } from '~/utils/retry';

export function createAssistantMethods(mongoose: typeof import('mongoose')): {
  updateAssistantDoc: (
    searchParams: FilterQuery<IAssistant>,
    updateData: Partial<IAssistant>,
  ) => Promise<IAssistant | null>;
  deleteAssistant: (searchParams: FilterQuery<IAssistant>) => Promise<IAssistant | null>;
  deleteAssistants: (searchParams: FilterQuery<IAssistant>) => Promise<number>;
  getAssistants: (
    searchParams: FilterQuery<IAssistant>,
    select?: string | Record<string, number> | null,
  ) => Promise<IAssistant[]>;
  getAssistant: (
    searchParams: FilterQuery<IAssistant>,
    projection?: ProjectionType<IAssistant>,
  ) => Promise<IAssistant | null>;
  ensureAssistantIndexes: () => Promise<void>;
} {
  const Assistant = () => mongoose.models.Assistant as Model<IAssistant>;
  let assistantIndexesPromise: Promise<void> | null = null;

  function ensureAssistantIndexes(): Promise<void> {
    if (!assistantIndexesPromise) {
      assistantIndexesPromise = createIndexesWithRetry(Assistant()).catch((error) => {
        assistantIndexesPromise = null;
        throw error;
      });
    }
    return assistantIndexesPromise;
  }

  /**
   * Update an assistant with new data without overwriting existing properties,
   * or create a new assistant if it doesn't exist.
   */
  async function updateAssistantDoc(
    searchParams: FilterQuery<IAssistant>,
    updateData: Partial<IAssistant>,
  ): Promise<IAssistant | null> {
    const options = { new: true, upsert: true };
    return await Assistant().findOneAndUpdate(searchParams, updateData, options).lean<IAssistant>();
  }

  /**
   * Retrieves an assistant document based on the provided search params.
   */
  async function getAssistant(
    searchParams: FilterQuery<IAssistant>,
    projection?: ProjectionType<IAssistant>,
  ): Promise<IAssistant | null> {
    await ensureAssistantIndexes();
    return await Assistant().findOne(searchParams, projection).lean<IAssistant>();
  }

  /**
   * Retrieves all assistants that match the given search parameters.
   */
  async function getAssistants(
    searchParams: FilterQuery<IAssistant>,
    select: string | Record<string, number> | null = null,
  ): Promise<IAssistant[]> {
    const query = Assistant().find(searchParams);

    return await (select ? query.select(select) : query).lean<IAssistant[]>();
  }

  /**
   * Deletes an assistant based on the provided search params.
   */
  async function deleteAssistant(
    searchParams: FilterQuery<IAssistant>,
  ): Promise<IAssistant | null> {
    return await Assistant().findOneAndDelete(searchParams);
  }

  /**
   * Deletes all assistants matching the given search parameters.
   */
  async function deleteAssistants(searchParams: FilterQuery<IAssistant>): Promise<number> {
    const result = await Assistant().deleteMany(searchParams);
    return result.deletedCount;
  }

  return {
    updateAssistantDoc,
    deleteAssistant,
    deleteAssistants,
    getAssistants,
    getAssistant,
    ensureAssistantIndexes,
  };
}

export type AssistantMethods = ReturnType<typeof createAssistantMethods>;
