import type { IndexDefinition, IndexOptions } from 'mongoose';
import messageSchema from './message';

describe('Subagent task indexes', () => {
  it('indexes bounded terminal lookups by parent run and recency', () => {
    const indexes = messageSchema.indexes() as Array<[IndexDefinition, IndexOptions]>;
    expect(indexes).toContainEqual([
      {
        user: 1,
        'subagentTask.parentRunId': 1,
        'subagentTask.status': 1,
        updatedAt: -1,
        _id: -1,
      },
      expect.objectContaining({
        name: 'subagent_parent_run_status_updated',
        partialFilterExpression: { 'subagentTask.parentRunId': { $exists: true } },
      }),
    ]);
  });
});
