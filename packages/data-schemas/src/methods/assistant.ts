import type { FilterQuery, Model, ProjectionType } from 'mongoose';
import type { AssistantQuery, IAssistant } from '~/types';
import { buildFilter, type FieldMap } from '~/utils/criteria';
import { createIndexesWithRetry } from '~/utils/retry';

const ASSISTANT_FIELDS: FieldMap<AssistantQuery> = {
  assistantId: 'assistant_id',
  user: 'user',
  avatarFilepath: 'avatar.filepath',
};

/** Translates domain assistant criteria into a Mongo filter. */
function assistantFilter(query: AssistantQuery): FilterQuery<IAssistant> {
  return buildFilter<AssistantQuery, FilterQuery<IAssistant>>(query, ASSISTANT_FIELDS);
}

export function createAssistantMethods(mongoose: typeof import('mongoose')): {
  updateAssistantDoc: (
    query: AssistantQuery,
    updateData: Partial<IAssistant>,
  ) => Promise<IAssistant | null>;
  updateAssistantAvatar: (
    query: { assistantId: string; user?: string },
    avatar: NonNullable<IAssistant['avatar']>,
    onInsert?: { user: string; endpoint: string },
  ) => Promise<IAssistant | null>;
  deleteAssistant: (query: AssistantQuery) => Promise<IAssistant | null>;
  deleteAssistants: (query: AssistantQuery) => Promise<number>;
  getAssistants: (
    query: AssistantQuery,
    select?: string | Record<string, number> | null,
  ) => Promise<IAssistant[]>;
  getAssistant: (
    query: AssistantQuery,
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
    query: AssistantQuery,
    updateData: Partial<IAssistant>,
  ): Promise<IAssistant | null> {
    const options = { new: true, upsert: true };
    return await Assistant()
      .findOneAndUpdate(assistantFilter(query), updateData, options)
      .lean<IAssistant>();
  }

  /** Updates the authorized avatar, initializing only absent identity fields. */
  async function updateAssistantAvatar(
    query: { assistantId: string; user?: string },
    avatar: NonNullable<IAssistant['avatar']>,
    onInsert?: { user: string; endpoint: string },
  ): Promise<IAssistant | null> {
    if (
      typeof query?.assistantId !== 'string' ||
      query.assistantId.trim().length === 0 ||
      !Object.prototype.hasOwnProperty.call(query, 'assistantId')
    ) {
      throw new TypeError('assistantId must be a nonempty string');
    }
    if (
      query.user !== undefined &&
      (typeof query.user !== 'string' ||
        query.user.trim().length === 0 ||
        !Object.prototype.hasOwnProperty.call(query, 'user'))
    ) {
      throw new TypeError('user must be a nonempty string');
    }

    if (
      onInsert !== undefined &&
      (typeof onInsert?.user !== 'string' ||
        onInsert.user.trim().length === 0 ||
        typeof onInsert.endpoint !== 'string' ||
        onInsert.endpoint.trim().length === 0 ||
        (query.user !== undefined && query.user !== onInsert.user))
    ) {
      throw new TypeError('Avatar insert data must identify the authorized user and endpoint');
    }

    const insertData = onInsert && { user: onInsert.user, endpoint: onInsert.endpoint };
    const upsert = insertData !== undefined && query.user === undefined;
    let reference = await Assistant()
      .findOneAndUpdate(
        assistantFilter(query),
        { $set: { avatar }, ...(upsert ? { $setOnInsert: insertData } : {}) },
        { new: true, upsert },
      )
      .lean<IAssistant>();
    if (!insertData) {
      return reference;
    }
    if (!reference) {
      // An owner-scoped upsert could duplicate another owner's existing assistant.
      reference = await Assistant()
        .findOneAndUpdate(
          assistantFilter({ assistantId: query.assistantId }),
          { $setOnInsert: { ...insertData, avatar } },
          { new: true, upsert: true },
        )
        .lean<IAssistant>();
    }
    if (
      !reference ||
      (query.user !== undefined &&
        reference.user != null &&
        reference.user.toString() !== query.user)
    ) {
      throw new Error('Assistant ownership changed before the avatar update');
    }

    const missingUser = reference.user == null;
    const missingEndpoint = reference.endpoint == null || reference.endpoint === '';
    if (
      !missingUser &&
      !missingEndpoint &&
      reference.avatar?.filepath === avatar.filepath &&
      reference.avatar.source === avatar.source
    ) {
      return reference;
    }

    // Compare-and-set prevents backfill from overwriting a concurrent identity assignment.
    const updated = await Assistant()
      .findOneAndUpdate(
        {
          _id: reference._id,
          user: reference.user ?? null,
          endpoint: reference.endpoint ?? null,
        },
        {
          $set: {
            avatar,
            ...(missingUser ? { user: insertData.user } : {}),
            ...(missingEndpoint ? { endpoint: insertData.endpoint } : {}),
          },
        },
        { new: true },
      )
      .lean<IAssistant>();
    if (!updated) {
      throw new Error('Assistant identity changed before the avatar update');
    }
    return updated;
  }

  /**
   * Retrieves an assistant document based on the provided search params.
   */
  async function getAssistant(
    query: AssistantQuery,
    projection?: ProjectionType<IAssistant>,
  ): Promise<IAssistant | null> {
    await ensureAssistantIndexes();
    return await Assistant().findOne(assistantFilter(query), projection).lean<IAssistant>();
  }

  /**
   * Retrieves all assistants that match the given search parameters.
   */
  async function getAssistants(
    query: AssistantQuery,
    select: string | Record<string, number> | null = null,
  ): Promise<IAssistant[]> {
    const search = Assistant().find(assistantFilter(query));

    return await (select ? search.select(select) : search).lean<IAssistant[]>();
  }

  /**
   * Deletes an assistant based on the provided search params.
   */
  async function deleteAssistant(query: AssistantQuery): Promise<IAssistant | null> {
    return await Assistant().findOneAndDelete(assistantFilter(query));
  }

  /**
   * Deletes all assistants matching the given search parameters.
   */
  async function deleteAssistants(query: AssistantQuery): Promise<number> {
    const result = await Assistant().deleteMany(assistantFilter(query));
    return result.deletedCount;
  }

  return {
    updateAssistantDoc,
    updateAssistantAvatar,
    deleteAssistant,
    deleteAssistants,
    getAssistants,
    getAssistant,
    ensureAssistantIndexes,
  };
}

export type AssistantMethods = ReturnType<typeof createAssistantMethods>;
