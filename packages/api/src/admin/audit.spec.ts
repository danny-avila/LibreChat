import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import { recordSystemAuditEntry } from './audit';

const input = { action: 'role.synced' } as unknown as RecordAuditEntryInput;

describe('recordSystemAuditEntry', () => {
  it('returns without waiting for the audit store', async () => {
    const record = jest.fn(() => new Promise<never>(() => undefined));

    await recordSystemAuditEntry(record, input, '[test]');

    expect(record).toHaveBeenCalledWith(input);
  });

  it('swallows a rejected or throwing write', async () => {
    await expect(
      recordSystemAuditEntry(jest.fn().mockRejectedValue(new Error('down')), input, '[test]'),
    ).resolves.toBeUndefined();
    await expect(
      recordSystemAuditEntry(
        jest.fn(() => {
          throw new Error('sync');
        }),
        input,
        '[test]',
      ),
    ).resolves.toBeUndefined();
  });
});
