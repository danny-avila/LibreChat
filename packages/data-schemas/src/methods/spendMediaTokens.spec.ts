import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { matchModelName, findMatchingPattern } from './test-helpers';
import { createModels } from '~/models';
import { createTxMethods, mediaTokenValues } from './tx';
import { createTransactionMethods } from './transaction';
import { createSpendTokensMethods } from './spendTokens';
import type { ITransaction } from '~/schema/transaction';
import type { IBalance } from '..';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let spendMediaTokens: ReturnType<typeof createSpendTokensMethods>['spendMediaTokens'];
let getMultiplier: ReturnType<typeof createTxMethods>['getMultiplier'];

describe('spendMediaTokens + media pricing', () => {
  let userId: mongoose.Types.ObjectId;
  let Transaction: mongoose.Model<ITransaction>;
  let Balance: mongoose.Model<IBalance>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    Object.assign(mongoose.models, models);

    Transaction = mongoose.models.Transaction as mongoose.Model<ITransaction>;
    Balance = mongoose.models.Balance as mongoose.Model<IBalance>;

    const txMethods = createTxMethods(mongoose, { matchModelName, findMatchingPattern });
    getMultiplier = txMethods.getMultiplier;

    const transactionMethods = createTransactionMethods(mongoose, {
      getMultiplier: txMethods.getMultiplier,
      getCacheMultiplier: txMethods.getCacheMultiplier,
    });

    const spendMethods = createSpendTokensMethods(mongoose, {
      createTransaction: transactionMethods.createTransaction,
      createStructuredTransaction: transactionMethods.createStructuredTransaction,
    });
    spendMediaTokens = spendMethods.spendMediaTokens;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Transaction.deleteMany({});
    await Balance.deleteMany({});
    userId = new mongoose.Types.ObjectId();
  });

  describe('Schema enum extension', () => {
    it.each(['audio_input', 'audio_output', 'ocr_pages', 'image_count'])(
      'accepts %s as tokenType',
      async (tokenType) => {
        const doc = await Transaction.create({
          user: userId,
          tokenType,
          model: 'test',
          rawAmount: -10,
        });
        expect(doc.tokenType).toBe(tokenType);
      },
    );

    it('still accepts legacy prompt/completion/credits', async () => {
      for (const t of ['prompt', 'completion', 'credits']) {
        const doc = await Transaction.create({
          user: userId,
          tokenType: t,
          model: 'gpt-4o',
          rawAmount: -100,
        });
        expect(doc.tokenType).toBe(t);
      }
    });

    it('rejects an invalid tokenType', async () => {
      await expect(
        Transaction.create({
          user: userId,
          tokenType: 'garbage' as never,
          model: 'test',
          rawAmount: -10,
        }),
      ).rejects.toThrow();
    });
  });

  describe('getMultiplier — media branch', () => {
    it.each([
      ['whisper-1', 'audio_input', 100],
      ['whisper', 'audio_input', 100],
      ['azure-whisper', 'audio_input', 100],
      ['tts-1', 'audio_output', 15],
      ['tts', 'audio_output', 15],
      ['azure-tts', 'audio_output', 15],
      ['tts-1-hd', 'audio_output', 30],
      ['gpt-4o-mini-tts', 'audio_output', 12],
      ['eleven_multilingual_v2', 'audio_output', 30],
      ['eleven_turbo_v2', 'audio_output', 15],
      ['mistral-ocr-2505', 'ocr_pages', 1000],
      ['mistral-ocr', 'ocr_pages', 1000],
      ['dall-e-3', 'image_count', 40000],
      ['dall-e-3-hd', 'image_count', 80000],
      ['flux-pro', 'image_count', 50000],
      ['flux-pro-1.1', 'image_count', 40000],
      ['flux-pro-1.1-ultra', 'image_count', 60000],
      ['flux-pro-finetuned', 'image_count', 60000],
      ['flux-pro-1.1-ultra-finetuned', 'image_count', 70000],
      ['flux-dev', 'image_count', 25000],
      ['gpt-image-1', 'image_count', 20000],
    ] as Array<[string, 'audio_input' | 'audio_output' | 'ocr_pages' | 'image_count', number]>)(
      'returns %s × %s = %d µ$/unit',
      (model, tokenType, expected) => {
        expect(getMultiplier({ model, tokenType })).toBe(expected);
      },
    );

    it('returns 0 (not defaultRate=6) for unknown audio model', () => {
      const m = getMultiplier({ model: 'unknown-audio-deployment', tokenType: 'audio_input' });
      expect(m).toBe(0);
    });

    it('returns 0 for unknown image model', () => {
      const m = getMultiplier({ model: 'completely-unknown', tokenType: 'image_count' });
      expect(m).toBe(0);
    });

    it('respects endpointTokenConfig override', () => {
      const m = getMultiplier({
        model: 'custom-whisper',
        tokenType: 'audio_input',
        endpointTokenConfig: { 'custom-whisper': { audio_input: 250 } },
      });
      expect(m).toBe(250);
    });

    it('matches Azure-style deployment names via findMatchingPattern', () => {
      const m = getMultiplier({ model: 'whisper-azureXY-prod', tokenType: 'audio_input' });
      expect(m).toBe(100);
    });

    it('does not regress text-token multipliers (gpt-4o.prompt)', () => {
      const m = getMultiplier({ model: 'gpt-4o', tokenType: 'prompt' });
      expect(m).toBeGreaterThan(0);
      expect(m).not.toBe(0);
    });

    it('still applies defaultRate for unknown TEXT models (regression-guard)', () => {
      const m = getMultiplier({ model: 'totally-made-up-text', tokenType: 'prompt' });
      expect(m).toBe(6);
    });
  });

  describe('mediaTokenValues export', () => {
    it('contains the canonical pricing entries', () => {
      expect(mediaTokenValues['whisper-1']?.audio_input).toBe(100);
      expect(mediaTokenValues['tts-1']?.audio_output).toBe(15);
      expect(mediaTokenValues['mistral-ocr-2505']?.ocr_pages).toBe(1000);
      expect(mediaTokenValues['dall-e-3']?.image_count).toBe(40000);
    });

    it('covers all 6 Flux endpoint pricing tiers', () => {
      expect(mediaTokenValues['flux-pro']?.image_count).toBe(50000);
      expect(mediaTokenValues['flux-pro-1.1']?.image_count).toBe(40000);
      expect(mediaTokenValues['flux-pro-1.1-ultra']?.image_count).toBe(60000);
      expect(mediaTokenValues['flux-pro-finetuned']?.image_count).toBe(60000);
      expect(mediaTokenValues['flux-pro-1.1-ultra-finetuned']?.image_count).toBe(70000);
      expect(mediaTokenValues['flux-dev']?.image_count).toBe(25000);
    });
  });

  describe('spendMediaTokens — happy path', () => {
    it('writes audio_input transaction and debits balance', async () => {
      await Balance.create({ user: userId, tokenCredits: 1_000_000 });
      const result = await spendMediaTokens(
        {
          user: userId,
          model: 'whisper-1',
          context: 'stt',
          balance: { enabled: true },
        },
        { type: 'audio_input', amount: 30 },
      );
      expect(result).toBeDefined();
      const tx = await Transaction.findOne({ user: userId });
      expect(tx?.tokenType).toBe('audio_input');
      expect(tx?.rawAmount).toBe(-30);
      expect(tx?.tokenValue).toBe(-3000); // 30 sec × 100 µ$/sec
      expect(tx?.rate).toBe(100);

      const bal = await Balance.findOne({ user: userId });
      expect(bal?.tokenCredits).toBe(997_000);
    });

    it('records OCR pages_processed', async () => {
      await Balance.create({ user: userId, tokenCredits: 100_000 });
      await spendMediaTokens(
        {
          user: userId,
          model: 'mistral-ocr-2505',
          context: 'ocr',
          balance: { enabled: true },
        },
        { type: 'ocr_pages', amount: 5 },
      );
      const tx = await Transaction.findOne({ user: userId });
      expect(tx?.tokenType).toBe('ocr_pages');
      expect(tx?.tokenValue).toBe(-5000); // 5 pages × 1000 µ$/page
    });

    it('records dall-e-3 image_count', async () => {
      await Balance.create({ user: userId, tokenCredits: 1_000_000 });
      await spendMediaTokens(
        {
          user: userId,
          model: 'dall-e-3',
          context: 'image_gen',
          balance: { enabled: true },
        },
        { type: 'image_count', amount: 1 },
      );
      const tx = await Transaction.findOne({ user: userId });
      expect(tx?.tokenValue).toBe(-40000);
    });
  });

  describe('spendMediaTokens — guards', () => {
    it('treats amount=0 as no-op', async () => {
      await spendMediaTokens(
        { user: userId, model: 'whisper-1', context: 'stt' },
        { type: 'audio_input', amount: 0 },
      );
      expect(await Transaction.countDocuments({ user: userId })).toBe(0);
    });

    it('treats negative amount as no-op', async () => {
      await spendMediaTokens(
        { user: userId, model: 'whisper-1', context: 'stt' },
        { type: 'audio_input', amount: -5 },
      );
      expect(await Transaction.countDocuments({ user: userId })).toBe(0);
    });

    it('treats NaN amount as no-op (Number.isFinite guard)', async () => {
      await spendMediaTokens(
        { user: userId, model: 'whisper-1', context: 'stt' },
        { type: 'audio_input', amount: NaN },
      );
      expect(await Transaction.countDocuments({ user: userId })).toBe(0);
    });

    it('treats Infinity amount as no-op', async () => {
      await spendMediaTokens(
        { user: userId, model: 'whisper-1', context: 'stt' },
        { type: 'audio_input', amount: Infinity },
      );
      expect(await Transaction.countDocuments({ user: userId })).toBe(0);
    });

    it('skips silently when user is missing', async () => {
      const result = await spendMediaTokens({ model: 'whisper-1', context: 'stt' } as never, {
        type: 'audio_input',
        amount: 10,
      });
      expect(result).toBeUndefined();
      expect(await Transaction.countDocuments({})).toBe(0);
    });

    it('records doc with tokenValue=0 for unknown model (under-bill, not over-bill)', async () => {
      await Balance.create({ user: userId, tokenCredits: 1000 });
      await spendMediaTokens(
        { user: userId, model: 'unknown-xyz', context: 'stt', balance: { enabled: true } },
        { type: 'audio_input', amount: 60 },
      );
      const tx = await Transaction.findOne({ user: userId });
      expect(tx).toBeDefined();
      expect(tx?.rate).toBe(0);
      // tokenValue is -0 because rawAmount=-60 × multiplier=0 — that's a JS
      // signed-zero artefact; what matters is the balance isn't debited.
      expect(Math.abs(tx?.tokenValue ?? Infinity)).toBe(0);
      const bal = await Balance.findOne({ user: userId });
      expect(bal?.tokenCredits).toBe(1000);
    });
  });
});
