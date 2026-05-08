import mongoose, { Schema, Types } from 'mongoose';

/**
 * Integration tests for $sample → app-level shuffle replacement.
 *
 * The original getRandomPromptGroups used a $sample aggregation stage
 * (unsupported by FerretDB). It was replaced with:
 *   1. PromptGroup.distinct('category', { category: { $ne: '' } })
 *   2. Fisher-Yates shuffle of the categories array
 *   3. PromptGroup.find({ category: { $in: selectedCategories } })
 *   4. Deduplicate (one group per category) and order by shuffled categories
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/random_prompts_test" npx jest randomPrompts.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/random_prompts_test" npx jest randomPrompts.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;

const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

const promptGroupSchema = new Schema({
  name: { type: String, required: true },
  category: { type: String, default: '' },
  author: { type: Schema.Types.ObjectId, required: true },
  authorName: { type: String, default: '' },
});

/** Reproduces the refactored getRandomPromptGroups logic */
async function getRandomPromptGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PromptGroup: mongoose.Model<any>,
  filter: { limit: number; skip: number },
) {
  const categories: string[] = await PromptGroup.distinct('category', { category: { $ne: '' } });

  for (let i = categories.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [categories[i], categories[j]] = [categories[j], categories[i]];
  }

  const skip = +filter.skip;
  const limit = +filter.limit;
  const selectedCategories = categories.slice(skip, skip + limit);

  if (selectedCategories.length === 0) {
    return { prompts: [] };
  }

  const groups = await PromptGroup.find({ category: { $in: selectedCategories } }).lean();

  const groupByCategory = new Map();
  for (const group of groups) {
    const cat = (group as Record<string, unknown>).category;
    if (!groupByCategory.has(cat)) {
      groupByCategory.set(cat, group);
    }
  }

  const prompts = selectedCategories.map((cat: string) => groupByCategory.get(cat)).filter(Boolean);

  return { prompts };
}

describeIfFerretDB('Random prompts $sample replacement - FerretDB compatibility', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PromptGroup: mongoose.Model<any>;
  const authorId = new Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);
    PromptGroup = mongoose.model('TestRandPromptGroup', promptGroupSchema);
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PromptGroup.deleteMany({});
  });

  describe('distinct categories + $in query', () => {
    it('should return one group per category', async () => {
      await PromptGroup.insertMany([
        { name: 'Code A', category: 'code', author: authorId, authorName: 'User' },
        { name: 'Code B', category: 'code', author: authorId, authorName: 'User' },
        { name: 'Write A', category: 'writing', author: authorId, authorName: 'User' },
        { name: 'Write B', category: 'writing', author: authorId, authorName: 'User' },
        { name: 'Math A', category: 'math', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
      expect(result.prompts).toHaveLength(3);

      const categories = result.prompts.map((p: Record<string, unknown>) => p.category).sort();
      expect(categories).toEqual(['code', 'math', 'writing']);
    });

    it('should exclude groups with empty category', async () => {
      await PromptGroup.insertMany([
        { name: 'Has Category', category: 'code', author: authorId, authorName: 'User' },
        { name: 'Empty Category', category: '', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
      expect(result.prompts).toHaveLength(1);
      expect((result.prompts[0] as Record<string, unknown>).name).toBe('Has Category');
    });

    it('should return empty array when no groups have categories', async () => {
      await PromptGroup.insertMany([
        { name: 'No Cat 1', category: '', author: authorId, authorName: 'User' },
        { name: 'No Cat 2', category: '', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
      expect(result.prompts).toHaveLength(0);
    });

    it('should return empty array when collection is empty', async () => {
      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
      expect(result.prompts).toHaveLength(0);
    });
  });

  describe('pagination (skip + limit)', () => {
    it('should respect limit', async () => {
      await PromptGroup.insertMany([
        { name: 'A', category: 'cat1', author: authorId, authorName: 'User' },
        { name: 'B', category: 'cat2', author: authorId, authorName: 'User' },
        { name: 'C', category: 'cat3', author: authorId, authorName: 'User' },
        { name: 'D', category: 'cat4', author: authorId, authorName: 'User' },
        { name: 'E', category: 'cat5', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 3, skip: 0 });
      expect(result.prompts).toHaveLength(3);
    });

    it('should respect skip', async () => {
      await PromptGroup.insertMany([
        { name: 'A', category: 'cat1', author: authorId, authorName: 'User' },
        { name: 'B', category: 'cat2', author: authorId, authorName: 'User' },
        { name: 'C', category: 'cat3', author: authorId, authorName: 'User' },
        { name: 'D', category: 'cat4', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 2 });
      expect(result.prompts).toHaveLength(2);
    });

    it('should return empty when skip exceeds total categories', async () => {
      await PromptGroup.insertMany([
        { name: 'A', category: 'cat1', author: authorId, authorName: 'User' },
        { name: 'B', category: 'cat2', author: authorId, authorName: 'User' },
      ]);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 5 });
      expect(result.prompts).toHaveLength(0);
    });
  });

  describe('randomness', () => {
    it('should produce varying orderings across multiple calls', async () => {
      const categories = Array.from({ length: 10 }, (_, i) => `cat_${i}`);
      await PromptGroup.insertMany(
        categories.map((cat) => ({
          name: cat,
          category: cat,
          author: authorId,
          authorName: 'User',
        })),
      );

      const orderings = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
        const order = result.prompts.map((p: Record<string, unknown>) => p.category).join(',');
        orderings.add(order);
      }

      expect(orderings.size).toBeGreaterThan(1);
    });
  });

  describe('deduplication correctness', () => {
    it('should return exactly one group per category even with many duplicates', async () => {
      const docs = [];
      for (let i = 0; i < 50; i++) {
        docs.push({
          name: `Group ${i}`,
          category: `cat_${i % 5}`,
          author: authorId,
          authorName: 'User',
        });
      }
      await PromptGroup.insertMany(docs);

      const result = await getRandomPromptGroups(PromptGroup, { limit: 10, skip: 0 });
      expect(result.prompts).toHaveLength(5);

      const categories = result.prompts.map((p: Record<string, unknown>) => p.category).sort();
      expect(categories).toEqual(['cat_0', 'cat_1', 'cat_2', 'cat_3', 'cat_4']);
    });
  });
});
