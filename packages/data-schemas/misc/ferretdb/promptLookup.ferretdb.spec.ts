import mongoose, { Schema, Types } from 'mongoose';

/**
 * Integration tests for the Prompt $lookup → find + attach replacement.
 *
 * These verify that prompt group listing with production prompt
 * resolution works identically on both MongoDB and FerretDB
 * using only standard find/countDocuments (no $lookup).
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/prompt_lookup_test" npx jest promptLookup.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/prompt_lookup_test" npx jest promptLookup.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;
const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

const promptGroupSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    numberOfGenerations: { type: Number, default: 0 },
    oneliner: { type: String, default: '' },
    category: { type: String, default: '', index: true },
    productionId: { type: Schema.Types.ObjectId, ref: 'FDBPrompt', index: true },
    author: { type: Schema.Types.ObjectId, required: true, index: true },
    authorName: { type: String, required: true },
    command: { type: String },
  },
  { timestamps: true },
);

const promptSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'FDBPromptGroup', required: true },
    author: { type: Schema.Types.ObjectId, required: true },
    prompt: { type: String, required: true },
    type: { type: String, enum: ['text', 'chat'], required: true },
  },
  { timestamps: true },
);

type PromptGroupDoc = mongoose.Document & {
  name: string;
  productionId: Types.ObjectId;
  author: Types.ObjectId;
  authorName: string;
  category: string;
  oneliner: string;
  numberOfGenerations: number;
  command?: string;
  createdAt: Date;
  updatedAt: Date;
};

type PromptDoc = mongoose.Document & {
  groupId: Types.ObjectId;
  author: Types.ObjectId;
  prompt: string;
  type: string;
};

/** Mirrors the attachProductionPrompts helper from api/models/Prompt.js */
async function attachProductionPrompts(
  groups: Array<Record<string, unknown>>,
  PromptModel: mongoose.Model<PromptDoc>,
): Promise<Array<Record<string, unknown>>> {
  const productionIds = groups.map((g) => g.productionId as Types.ObjectId).filter(Boolean);

  if (productionIds.length === 0) {
    return groups.map((g) => ({ ...g, productionPrompt: null }));
  }

  const prompts = await PromptModel.find({ _id: { $in: productionIds } })
    .select('prompt')
    .lean();
  const promptMap = new Map(prompts.map((p) => [p._id.toString(), p]));

  return groups.map((g) => ({
    ...g,
    productionPrompt: g.productionId
      ? (promptMap.get((g.productionId as Types.ObjectId).toString()) ?? null)
      : null,
  }));
}

describeIfFerretDB('Prompt $lookup replacement - FerretDB compatibility', () => {
  let PromptGroup: mongoose.Model<PromptGroupDoc>;
  let Prompt: mongoose.Model<PromptDoc>;

  const authorId = new Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);
    PromptGroup =
      (mongoose.models.FDBPromptGroup as mongoose.Model<PromptGroupDoc>) ||
      mongoose.model<PromptGroupDoc>('FDBPromptGroup', promptGroupSchema);
    Prompt =
      (mongoose.models.FDBPrompt as mongoose.Model<PromptDoc>) ||
      mongoose.model<PromptDoc>('FDBPrompt', promptSchema);
    await PromptGroup.createCollection();
    await Prompt.createCollection();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await PromptGroup.deleteMany({});
    await Prompt.deleteMany({});
  });

  async function seedGroupWithPrompt(
    name: string,
    promptText: string,
    extra: Record<string, unknown> = {},
  ) {
    const group = await PromptGroup.create({
      name,
      author: authorId,
      authorName: 'Test User',
      productionId: new Types.ObjectId(),
      ...extra,
    });

    const prompt = await Prompt.create({
      groupId: group._id,
      author: authorId,
      prompt: promptText,
      type: 'text',
    });

    await PromptGroup.updateOne({ _id: group._id }, { productionId: prompt._id });
    return {
      group: (await PromptGroup.findById(group._id).lean()) as Record<string, unknown>,
      prompt,
    };
  }

  describe('attachProductionPrompts', () => {
    it('should attach production prompt text to groups', async () => {
      await seedGroupWithPrompt('Group 1', 'Hello {{name}}');
      await seedGroupWithPrompt('Group 2', 'Summarize this: {{text}}');

      const groups = await PromptGroup.find({}).sort({ name: 1 }).lean();
      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Group 1');
      expect((result[0].productionPrompt as Record<string, unknown>).prompt).toBe('Hello {{name}}');
      expect(result[1].name).toBe('Group 2');
      expect((result[1].productionPrompt as Record<string, unknown>).prompt).toBe(
        'Summarize this: {{text}}',
      );
    });

    it('should handle groups with no productionId', async () => {
      await PromptGroup.create({
        name: 'Empty Group',
        author: authorId,
        authorName: 'Test User',
        productionId: null as unknown as Types.ObjectId,
      });

      const groups = await PromptGroup.find({}).lean();
      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect(result).toHaveLength(1);
      expect(result[0].productionPrompt).toBeNull();
    });

    it('should handle deleted production prompts gracefully', async () => {
      await seedGroupWithPrompt('Orphaned', 'old text');
      await Prompt.deleteMany({});

      const groups = await PromptGroup.find({}).lean();
      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect(result).toHaveLength(1);
      expect(result[0].productionPrompt).toBeNull();
    });

    it('should preserve productionId as the ObjectId (not overwritten)', async () => {
      const { prompt } = await seedGroupWithPrompt('Preserved', 'keep id');

      const groups = await PromptGroup.find({}).lean();
      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect((result[0].productionId as Types.ObjectId).toString()).toBe(
        (prompt._id as Types.ObjectId).toString(),
      );
      expect((result[0].productionPrompt as Record<string, unknown>).prompt).toBe('keep id');
    });
  });

  describe('paginated query pattern (getPromptGroups replacement)', () => {
    it('should return paginated groups with production prompts', async () => {
      for (let i = 0; i < 5; i++) {
        await seedGroupWithPrompt(`Prompt ${i}`, `Content ${i}`);
      }

      const query = { author: authorId };
      const skip = 0;
      const limit = 3;

      const [groups, total] = await Promise.all([
        PromptGroup.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(
            'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
          )
          .lean(),
        PromptGroup.countDocuments(query),
      ]);

      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect(total).toBe(5);
      expect(result).toHaveLength(3);
      for (const group of result) {
        expect(group.productionPrompt).toBeDefined();
        expect(group.productionPrompt).not.toBeNull();
      }
    });

    it('should correctly compute page count', async () => {
      for (let i = 0; i < 7; i++) {
        await seedGroupWithPrompt(`Page ${i}`, `Content ${i}`);
      }

      const total = await PromptGroup.countDocuments({ author: authorId });
      const pageSize = 3;
      const pages = Math.ceil(total / pageSize);

      expect(pages).toBe(3);
    });
  });

  describe('cursor-based pagination pattern (getListPromptGroupsByAccess replacement)', () => {
    it('should return groups filtered by accessible IDs with has_more', async () => {
      const seeded = [];
      for (let i = 0; i < 5; i++) {
        const { group } = await seedGroupWithPrompt(`Access ${i}`, `Content ${i}`);
        seeded.push(group);
      }

      const accessibleIds = seeded.slice(0, 3).map((g) => g._id as Types.ObjectId);
      const normalizedLimit = 2;

      const groups = await PromptGroup.find({ _id: { $in: accessibleIds } })
        .sort({ updatedAt: -1, _id: 1 })
        .limit(normalizedLimit + 1)
        .select(
          'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
        )
        .lean();

      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      const hasMore = result.length > normalizedLimit;
      const data = result.slice(0, normalizedLimit);

      expect(hasMore).toBe(true);
      expect(data).toHaveLength(2);
      for (const group of data) {
        expect(group.productionPrompt).not.toBeNull();
      }
    });

    it('should return all groups when no limit is set', async () => {
      const seeded = [];
      for (let i = 0; i < 4; i++) {
        const { group } = await seedGroupWithPrompt(`NoLimit ${i}`, `Content ${i}`);
        seeded.push(group);
      }

      const accessibleIds = seeded.map((g) => g._id as Types.ObjectId);
      const groups = await PromptGroup.find({ _id: { $in: accessibleIds } })
        .sort({ updatedAt: -1, _id: 1 })
        .select(
          'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
        )
        .lean();

      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      expect(result).toHaveLength(4);
    });
  });

  describe('output shape matches original $lookup pipeline', () => {
    it('should produce the same field structure as the aggregation', async () => {
      await seedGroupWithPrompt('Shape Test', 'Check all fields', {
        category: 'testing',
        oneliner: 'A test prompt',
        numberOfGenerations: 5,
      });

      const groups = await PromptGroup.find({})
        .select(
          'name numberOfGenerations oneliner category productionId author authorName createdAt updatedAt',
        )
        .lean();
      const result = await attachProductionPrompts(
        groups as Array<Record<string, unknown>>,
        Prompt,
      );

      const item = result[0];
      expect(item.name).toBe('Shape Test');
      expect(item.numberOfGenerations).toBe(5);
      expect(item.oneliner).toBe('A test prompt');
      expect(item.category).toBe('testing');
      expect(item.productionId).toBeDefined();
      expect(item.author).toBeDefined();
      expect(item.authorName).toBe('Test User');
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
      expect(item.productionPrompt).toBeDefined();
      expect((item.productionPrompt as Record<string, unknown>).prompt).toBe('Check all fields');
      expect((item.productionPrompt as Record<string, unknown>)._id).toBeDefined();
    });
  });
});
