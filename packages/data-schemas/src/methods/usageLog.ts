import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { IUsageLog } from '~/types/usageLog';
import type { Types } from 'mongoose';

/** Returns the start of the current UTC day (00:00:00.000 UTC). */
function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function createUsageLogMethods(mongoose: typeof import('mongoose')) {
  /**
   * Upserts a UsageLog entry for the given user + model + day, accumulating
   * token counts and cost. Day is always truncated to 00:00:00 UTC.
   */
  async function recordUsage(args: {
    userId: Types.ObjectId;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    costCents: number;
  }): Promise<void> {
    const UsageLog = mongoose.models.UsageLog as Model<IUsageLog>;
    const day = startOfDayUtc(new Date());

    const filter: FilterQuery<IUsageLog> = {
      user_id: args.userId,
      model_id: args.modelId,
      day,
    };
    const update: UpdateQuery<IUsageLog> = {
      $inc: {
        prompt_tokens: args.promptTokens,
        completion_tokens: args.completionTokens,
        call_count: 1,
        estimated_cost_cents: args.costCents,
      },
      $set: { updated_at: new Date() },
      $setOnInsert: {
        user_id: args.userId,
        model_id: args.modelId,
        day,
      },
    };

    await UsageLog.findOneAndUpdate(filter, update, { upsert: true });
  }

  return { recordUsage };
}

export type UsageLogMethods = ReturnType<typeof createUsageLogMethods>;
