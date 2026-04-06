import type { FilterQuery, Model } from 'mongoose';
import type { IConversation } from '~/types';

const AGE_DAYS = 60;

/**
 * Archives all non-archived conversations with no activity in the last 60 days.
 * @returns The number of conversations that were archived.
 */
export async function archiveOldConversations(
  mongoose: typeof import('mongoose'),
): Promise<number> {
  const Conversation = mongoose.models.Conversation as Model<IConversation>;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AGE_DAYS);

  const filter: FilterQuery<IConversation> = {
    updatedAt: { $lt: cutoff },
    $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
  };

  const { modifiedCount } = await Conversation.updateMany(filter, { $set: { isArchived: true } });
  return modifiedCount;
}
