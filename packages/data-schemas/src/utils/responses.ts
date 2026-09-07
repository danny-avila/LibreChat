import type { FilterQuery, Model, PipelineStage } from 'mongoose';
import type { IMessage } from '~/types';

/** Resolve turn publication inside MongoDB, before pagination or projection. */
export function committedMessageStages(collection = 'messages'): PipelineStage[] {
  return [
    {
      $addFields: {
        _responsesTurnId: { $ifNull: ['$metadata.responsesTurn.responseId', []] },
      },
    },
    {
      $lookup: {
        from: collection,
        localField: '_responsesTurnId',
        foreignField: 'messageId',
        as: '_responseOutputs',
      },
    },
    {
      $addFields: {
        _committedResponseOutput: {
          $filter: {
            input: '$_responseOutputs',
            as: 'output',
            cond: {
              $and: [
                { $eq: ['$$output.isCreatedByUser', false] },
                { $eq: ['$$output.isUserSubmitted', false] },
                { $eq: [{ $ifNull: ['$$output.metadata.responsesInput', null] }, null] },
                { $eq: ['$$output.metadata.responsesTurn.version', 1] },
                { $eq: ['$$output.metadata.responsesResponse.version', 1] },
                { $eq: ['$$output.metadata.responsesResponse.commitState', 'committed'] },
                { $eq: ['$$output.metadata.responsesTurn.responseId', '$_responsesTurnId'] },
                { $eq: ['$$output.user', '$user'] },
                { $eq: ['$$output.conversationId', '$conversationId'] },
                {
                  $eq: [{ $ifNull: ['$$output.tenantId', null] }, { $ifNull: ['$tenantId', null] }],
                },
              ],
            },
          },
        },
      },
    },
    {
      $match: {
        $or: [
          { 'metadata.responsesTurn': { $exists: false } },
          {
            'metadata.responsesTurn.version': 1,
            'metadata.responsesTurn.responseId': { $gt: '' },
            '_committedResponseOutput.0': { $exists: true },
          },
        ],
      },
    },
    { $project: { _responsesTurnId: 0, _responseOutputs: 0, _committedResponseOutput: 0 } },
  ];
}

/** Preserve find's casting and schema-private fields when reading through aggregation. */
export async function readVisibleMessages(
  Message: Model<IMessage>,
  filter: FilterQuery<IMessage>,
  select?: string,
  options: { sort?: Record<string, 1 | -1> | false; limit?: number } = {},
): Promise<IMessage[]> {
  const query = Message.find(filter);
  const castFilter = query.cast(Message, filter);
  const projection: Record<string, 0 | 1> = {};
  const selected = new Set<string>();
  const forced = new Set<string>();
  let inclusive = false;
  for (const field of select?.split(/\s+/).filter(Boolean) ?? []) {
    const name = field.replace(/^[-+]/, '');
    selected.add(name);
    if (field.startsWith('+')) {
      forced.add(name);
      continue;
    }
    const include = field.startsWith('-') ? 0 : 1;
    projection[name] = include;
    inclusive ||= include === 1;
  }
  if (inclusive) {
    for (const name of forced) {
      projection[name] = 1;
    }
  } else {
    Message.schema.eachPath((name, schemaType) => {
      if (schemaType.options.select === false && !selected.has(name)) {
        projection[name] = 0;
      }
    });
  }
  const pipeline: PipelineStage[] = [{ $match: castFilter }];
  if (options.sort !== false) {
    pipeline.push({ $sort: options.sort ?? { createdAt: 1 } });
  }
  // eslint-disable-next-line no-restricted-syntax -- Reads the collection name, not the raw driver.
  pipeline.push(...committedMessageStages(Message.collection.name));
  if (options.limit != null && options.limit > 0) {
    pipeline.push({ $limit: options.limit });
  }
  if (Object.keys(projection).length > 0) {
    pipeline.push({ $project: projection });
  }
  return Message.aggregate<IMessage>(pipeline);
}
