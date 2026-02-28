import { CANCEL_RATE } from '@librechat/data-schemas';
import {
  prepareTokenSpend,
  prepareStructuredTokenSpend,
  bulkWriteTransactions,
} from './transactions';
import type { PricingFns, BulkWriteDeps, TxMetadata, PreparedEntry } from './transactions';

const baseTxData: TxMetadata = {
  user: 'user-123',
  context: 'message',
  conversationId: 'convo-123',
  model: 'gpt-4',
  messageId: 'msg-123',
  balance: { enabled: true },
  transactions: { enabled: true },
};

const mockPricing: PricingFns = {
  getMultiplier: jest.fn().mockReturnValue(2),
  getCacheMultiplier: jest.fn().mockReturnValue(null),
};

describe('prepareTokenSpend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should prepare prompt + completion entries', () => {
    const entries = prepareTokenSpend(
      baseTxData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].doc.tokenType).toBe('prompt');
    expect(entries[1].doc.tokenType).toBe('completion');
  });

  it('should return empty array when transactions disabled', () => {
    const txData = { ...baseTxData, transactions: { enabled: false } };
    const entries = prepareTokenSpend(
      txData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    expect(entries).toHaveLength(0);
  });

  it('should filter out NaN rawAmount entries', () => {
    const entries = prepareTokenSpend(
      baseTxData,
      { promptTokens: NaN, completionTokens: 50 },
      mockPricing,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].doc.tokenType).toBe('completion');
  });

  it('should handle promptTokens only', () => {
    const entries = prepareTokenSpend(baseTxData, { promptTokens: 100 }, mockPricing);
    expect(entries).toHaveLength(1);
    expect(entries[0].doc.tokenType).toBe('prompt');
  });

  it('should handle completionTokens only', () => {
    const entries = prepareTokenSpend(baseTxData, { completionTokens: 50 }, mockPricing);
    expect(entries).toHaveLength(1);
    expect(entries[0].doc.tokenType).toBe('completion');
  });

  it('should handle zero tokens', () => {
    const entries = prepareTokenSpend(
      baseTxData,
      { promptTokens: 0, completionTokens: 0 },
      mockPricing,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].doc.rawAmount).toBe(0);
    expect(entries[1].doc.rawAmount).toBe(0);
  });

  it('should calculate tokenValue using pricing multiplier', () => {
    (mockPricing.getMultiplier as jest.Mock).mockReturnValue(3);
    const entries = prepareTokenSpend(
      baseTxData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    expect(entries[0].doc.rate).toBe(3);
    expect(entries[0].doc.tokenValue).toBe(-100 * 3);
    expect(entries[1].doc.rate).toBe(3);
    expect(entries[1].doc.tokenValue).toBe(-50 * 3);
  });

  it('should pass valueKey to getMultiplier', () => {
    const txData = { ...baseTxData };
    prepareTokenSpend(txData, { promptTokens: 100 }, mockPricing);
    expect(mockPricing.getMultiplier).toHaveBeenCalledWith(
      expect.objectContaining({ tokenType: 'prompt', model: 'gpt-4' }),
    );
  });

  it('should carry balance config on each entry', () => {
    const entries = prepareTokenSpend(
      baseTxData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    for (const entry of entries) {
      expect(entry.balance).toEqual({ enabled: true });
    }
  });
});

describe('prepareTokenSpend — CANCEL_RATE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPricing.getMultiplier as jest.Mock).mockReturnValue(2);
  });

  it('should apply CANCEL_RATE to completion tokens with incomplete context', () => {
    const txData: TxMetadata = { ...baseTxData, context: 'incomplete' };
    const entries = prepareTokenSpend(
      txData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    const completion = entries.find((e) => e.doc.tokenType === 'completion');
    expect(completion).toBeDefined();
    expect(completion!.doc.rate).toBe(2 * CANCEL_RATE);
    expect(completion!.doc.tokenValue).toBe(Math.ceil(-50 * 2 * CANCEL_RATE));
  });

  it('should NOT apply CANCEL_RATE to prompt tokens with incomplete context', () => {
    const txData: TxMetadata = { ...baseTxData, context: 'incomplete' };
    const entries = prepareTokenSpend(
      txData,
      { promptTokens: 100, completionTokens: 50 },
      mockPricing,
    );
    const prompt = entries.find((e) => e.doc.tokenType === 'prompt');
    expect(prompt!.doc.rate).toBe(2);
  });

  it('should NOT apply CANCEL_RATE for abort context', () => {
    const txData: TxMetadata = { ...baseTxData, context: 'abort' };
    const entries = prepareTokenSpend(txData, { completionTokens: 50 }, mockPricing);
    expect(entries[0].doc.rate).toBe(2);
  });
});

describe('prepareStructuredTokenSpend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPricing.getMultiplier as jest.Mock).mockReturnValue(2);
    (mockPricing.getCacheMultiplier as jest.Mock).mockReturnValue(null);
  });

  it('should prepare prompt + completion for structured tokens', () => {
    const entries = prepareStructuredTokenSpend(
      baseTxData,
      { promptTokens: { input: 100, write: 50, read: 30 }, completionTokens: 80 },
      mockPricing,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].doc.tokenType).toBe('prompt');
    expect(entries[0].doc.inputTokens).toBe(-100);
    expect(entries[0].doc.writeTokens).toBe(-50);
    expect(entries[0].doc.readTokens).toBe(-30);
    expect(entries[1].doc.tokenType).toBe('completion');
  });

  it('should use cache multipliers when available', () => {
    (mockPricing.getCacheMultiplier as jest.Mock).mockImplementation(({ cacheType }) => {
      if (cacheType === 'write') {
        return 5;
      }
      if (cacheType === 'read') {
        return 0.5;
      }
      return null;
    });

    const entries = prepareStructuredTokenSpend(
      baseTxData,
      { promptTokens: { input: 100, write: 50, read: 30 }, completionTokens: 0 },
      mockPricing,
    );
    const prompt = entries.find((e) => e.doc.tokenType === 'prompt');
    expect(prompt).toBeDefined();
    expect(prompt!.doc.rateDetail).toEqual({ input: 2, write: 5, read: 0.5 });
  });

  it('should return empty when transactions disabled', () => {
    const txData = { ...baseTxData, transactions: { enabled: false } };
    const entries = prepareStructuredTokenSpend(
      txData,
      { promptTokens: { input: 100 }, completionTokens: 50 },
      mockPricing,
    );
    expect(entries).toHaveLength(0);
  });

  it('should handle zero totalPromptTokens (fallback rate)', () => {
    const entries = prepareStructuredTokenSpend(
      baseTxData,
      { promptTokens: { input: 0, write: 0, read: 0 }, completionTokens: 50 },
      mockPricing,
    );
    const prompt = entries.find((e) => e.doc.tokenType === 'prompt');
    expect(prompt).toBeDefined();
    expect(prompt!.doc.rate).toBe(2);
  });
});

describe('bulkWriteTransactions', () => {
  let mockDbOps: BulkWriteDeps;

  beforeEach(() => {
    mockDbOps = {
      insertMany: jest.fn().mockResolvedValue(undefined),
      updateBalance: jest.fn().mockResolvedValue({}),
    };
  });

  it('should return early for empty docs', async () => {
    await bulkWriteTransactions({ user: 'user-123', docs: [] }, mockDbOps);
    expect(mockDbOps.insertMany).not.toHaveBeenCalled();
    expect(mockDbOps.updateBalance).not.toHaveBeenCalled();
  });

  it('should call insertMany with extracted docs', async () => {
    const docs: PreparedEntry[] = [
      {
        doc: { user: 'user-123', conversationId: 'c1', tokenType: 'prompt', tokenValue: -100 },
        tokenValue: -100,
        balance: { enabled: true },
      },
      {
        doc: { user: 'user-123', conversationId: 'c1', tokenType: 'completion', tokenValue: -50 },
        tokenValue: -50,
        balance: { enabled: true },
      },
    ];
    await bulkWriteTransactions({ user: 'user-123', docs }, mockDbOps);
    expect(mockDbOps.insertMany).toHaveBeenCalledWith([docs[0].doc, docs[1].doc]);
  });

  it('should sum tokenValue only for balance-enabled docs', async () => {
    const docs: PreparedEntry[] = [
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'prompt', tokenValue: -100 },
        tokenValue: -100,
        balance: { enabled: true },
      },
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'completion', tokenValue: -50 },
        tokenValue: -50,
        balance: { enabled: false },
      },
    ];
    await bulkWriteTransactions({ user: 'u', docs }, mockDbOps);
    expect(mockDbOps.updateBalance).toHaveBeenCalledWith({ user: 'u', incrementValue: -100 });
  });

  it('should NOT call updateBalance when no docs have balance enabled', async () => {
    const docs: PreparedEntry[] = [
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'prompt', tokenValue: -100 },
        tokenValue: -100,
        balance: { enabled: false },
      },
    ];
    await bulkWriteTransactions({ user: 'u', docs }, mockDbOps);
    expect(mockDbOps.insertMany).toHaveBeenCalled();
    expect(mockDbOps.updateBalance).not.toHaveBeenCalled();
  });

  it('should call updateBalance with total from all balance-enabled docs', async () => {
    const docs: PreparedEntry[] = [
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'prompt', tokenValue: -200 },
        tokenValue: -200,
        balance: { enabled: true },
      },
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'completion', tokenValue: -100 },
        tokenValue: -100,
        balance: { enabled: true },
      },
    ];
    await bulkWriteTransactions({ user: 'u', docs }, mockDbOps);
    expect(mockDbOps.updateBalance).toHaveBeenCalledWith({ user: 'u', incrementValue: -300 });
  });

  it('should handle null balance gracefully', async () => {
    const docs: PreparedEntry[] = [
      {
        doc: { user: 'u', conversationId: 'c', tokenType: 'prompt', tokenValue: -100 },
        tokenValue: -100,
        balance: null,
      },
    ];
    await bulkWriteTransactions({ user: 'u', docs }, mockDbOps);
    expect(mockDbOps.updateBalance).not.toHaveBeenCalled();
  });
});
