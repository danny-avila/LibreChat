import type { FilterQuery, Model } from 'mongoose';
import type { IAssistant } from '~/types';

export function createAssistantMethods(mongoose: typeof import('mongoose')) {
  /**
   * Update an assistant with new data without overwriting existing properties,
   * or create a new assistant if it doesn't exist.
   */
  async function updateAssistantDoc(
    searchParams: FilterQuery<IAssistant>,
    updateData: Partial<IAssistant>,
  ): Promise<IAssistant | null> {
    const Assistant = mongoose.models.Assistant as Model<IAssistant>;
    const options = { new: true, upsert: true };
    return (await Assistant.findOneAndUpdate(
      searchParams,
      updateData,
      options,
    ).lean()) as IAssistant | null;
  }

  /**
   * Retrieves an assistant document based on the provided search params.
   */
  async function getAssistant(searchParams: FilterQuery<IAssistant>): Promise<IAssistant | null> {
    const Assistant = mongoose.models.Assistant as Model<IAssistant>;
    return (await Assistant.findOne(searchParams).lean()) as IAssistant | null;
  }

  /**
   * Retrieves all assistants that match the given search parameters.
   */
  async function getAssistants(
    searchParams: FilterQuery<IAssistant>,
    select: string | Record<string, number> | null = null,
  ): Promise<IAssistant[]> {
    const Assistant = mongoose.models.Assistant as Model<IAssistant>;
    const query = Assistant.find(searchParams);

    return (await (select ? query.select(select) : query).lean()) as IAssistant[];
  }

  /**
   * Deletes an assistant based on the provided search params.
   */
  async function deleteAssistant(searchParams: FilterQuery<IAssistant>) {
    const Assistant = mongoose.models.Assistant as Model<IAssistant>;
    return await Assistant.findOneAndDelete(searchParams);
  }

  /**
   * Deletes all assistants matching the given search parameters.
   */
  async function deleteAssistants(searchParams: FilterQuery<IAssistant>): Promise<number> {
    const Assistant = mongoose.models.Assistant as Model<IAssistant>;
    const result = await Assistant.deleteMany(searchParams);
    return result.deletedCount;
  }

  return {
    updateAssistantDoc,
    deleteAssistant,
    deleteAssistants,
    getAssistants,
    getAssistant,
  };
}

export type AssistantMethods = ReturnType<typeof createAssistantMethods>;
