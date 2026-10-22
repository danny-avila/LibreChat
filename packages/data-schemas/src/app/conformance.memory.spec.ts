import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { ConfigStore, ConfigRecord, ConfigPrincipal } from './store';
import type { ConfigStoreHarness } from './conformance';
import {
  ABSENT_CONFIG_REVISION,
  ConfigRevisionConflictError,
  createConfigOperations,
  compareConfigRecords,
  getConfigRevision,
} from './store';
import { describeConfigStoreConformance } from './conformance';

/**
 * A reference engine with no storage behind it: a map of JSON strings. It proves the suite
 * asks only for the contract (nothing Mongo-shaped leaks into it) and documents the minimum a
 * new engine implements. Each operation finishes its compare-and-swap without yielding, which
 * is the atomicity a real engine gets from a conditional update.
 */
function createMemoryConfigStore(): ConfigStore & { clear(): void } {
  const documents = new Map<string, string>();
  let sequence = 0;

  const keyOf = ({ principalType, principalId }: ConfigPrincipal): string =>
    `${principalType}\u0000${principalId}`;
  const load = (key: string): ConfigRecord | null => {
    const stored = documents.get(key);
    return stored ? (JSON.parse(stored) as ConfigRecord) : null;
  };
  const save = (record: ConfigRecord): ConfigRecord => {
    documents.set(keyOf(record), JSON.stringify(record));
    return load(keyOf(record)) as ConfigRecord;
  };
  const all = (): ConfigRecord[] =>
    [...documents.keys()].map((key) => load(key) as ConfigRecord).sort(compareConfigRecords);

  return {
    clear: () => documents.clear(),

    async read(principal) {
      return load(keyOf(principal));
    },

    async list(filter) {
      return all().filter(
        (record) => filter?.isActive === undefined || record.isActive === filter.isActive,
      );
    },

    async listActive(principals) {
      const wanted = new Set(principals.map(keyOf));
      return all().filter((record) => record.isActive && wanted.has(keyOf(record)));
    },

    async write(principal, draft, expected) {
      const current = load(keyOf(principal));
      if (expected !== (current ? getConfigRevision(current) : ABSENT_CONFIG_REVISION)) {
        throw new ConfigRevisionConflictError();
      }
      sequence += 1;
      return save({
        ...draft,
        principalType: principal.principalType,
        principalId: principal.principalId,
        _id: current?._id ?? sequence.toString(16).padStart(24, '0'),
        configVersion: (current?.configVersion ?? 0) + 1,
      });
    },

    async remove(principal, expected) {
      const current = load(keyOf(principal));
      if (expected !== undefined) {
        const revision = current ? getConfigRevision(current) : ABSENT_CONFIG_REVISION;
        if (expected !== revision) {
          throw new ConfigRevisionConflictError(current ? revision : null);
        }
      }
      documents.delete(keyOf(principal));
      return current;
    },

    async restore(snapshot) {
      if (documents.has(keyOf(snapshot))) {
        return false;
      }
      save(snapshot);
      return true;
    },
  };
}

const store = createMemoryConfigStore();

const harness: ConfigStoreHarness = {
  name: 'memory reference engine',
  setup: async () => store,
  teardown: async () => undefined,
  reset: async () => store.clear(),
};

describeConfigStoreConformance(harness);

describe('unconditioned writes on the memory reference engine', () => {
  it('lands a burst of concurrent writers by pausing between retries', async () => {
    const operations = createConfigOperations(createMemoryConfigStore());
    const principal = { principalType: PrincipalType.ROLE, principalId: 'burst' };
    const fields = Array.from({ length: 8 }, (_, index) => `field${index}`);

    await Promise.all(
      fields.map((field) =>
        operations.setFields(principal, PrincipalModel.ROLE, { [`interface.${field}`]: field }),
      ),
    );

    const stored = await operations.findConfig(principal);
    expect(stored?.configVersion).toBe(fields.length);
    expect(stored?.overrides).toEqual({
      interface: Object.fromEntries(fields.map((field) => [field, field])),
    });
  });
});
