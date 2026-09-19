import { FileSources } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { resolveMediaHostConfig } from './host';
import { mediaAccountingMode } from './service';

const base: AppConfig = { config: {}, fileStrategy: FileSources.local, imageOutputType: 'png' };

test('Studio inherits legacy balance enforcement and starting credits before freezing a job', () => {
  const config = resolveMediaHostConfig(base, { CHECK_BALANCE: 'true', START_BALANCE: '250000' });
  expect(mediaAccountingMode(config)).toBe('balance');
  expect(config.balance).toEqual({ enabled: true, startBalance: 250000 });
  expect(config.transactions).toEqual({ enabled: true });
  expect(base.balance).toBeUndefined();
});

test('explicit YAML policy takes precedence over legacy balance environment settings', () => {
  const config = resolveMediaHostConfig(
    { ...base, balance: { enabled: false, startBalance: 100 }, transactions: { enabled: false } },
    { CHECK_BALANCE: 'true', START_BALANCE: '250000' },
  );
  expect(mediaAccountingMode(config)).toBe('none');
  expect(config.balance).toEqual({ enabled: false, startBalance: 100 });
  expect(config.transactions).toEqual({ enabled: false });
});

test('an unconfigured deployment keeps ordinary transaction recording without balance enforcement', () => {
  expect(mediaAccountingMode(resolveMediaHostConfig(base, {}))).toBe('transactions');
});
