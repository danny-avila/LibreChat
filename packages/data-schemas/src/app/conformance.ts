/* eslint-disable jest/no-export -- This file is a shared contract-test suite, not a
   spec: it exports the harness interface and the suite factory that each engine's
   own spec imports. The rule guards against accidental exports from spec files. */
/**
 * The portable admin-config store contract, as tests.
 *
 * `./store` defines the contract and the operations built on it. This suite checks what only
 * an engine can be asked: that it stores override documents verbatim whatever their keys, that
 * every write is a compare-and-swap on a revision, and that listing is deterministic. An
 * engine satisfies the contract by implementing `ConfigStoreHarness` and calling
 * `describeConfigStoreConformance` from a spec: Mongoose against mongodb-memory-server today
 * (`conformance.mongoose.spec.ts`, and `misc/ferretdb` against FerretDB or a real mongod), a
 * PostgreSQL/JSONB engine later.
 *
 * Engine-specific behaviour (key encoding at rest, legacy documents) stays in the engine's own
 * spec. Tenant isolation has its own contract in `~/tenant/conformance`.
 */

import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { ConfigDraft, ConfigStore, ConfigRecord, ConfigPrincipal } from './store';
import {
  ABSENT_CONFIG_REVISION,
  createConfigOperations,
  isConfigRevisionConflict,
  getConfigRevision,
} from './store';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import { toConfigOverrideState } from './mutations';
import { applyConfigChanges } from './changes';

export interface ConfigStoreHarness {
  readonly name: string;
  /** Prepares the engine and returns the store under test. */
  setup(): Promise<ConfigStore>;
  teardown(): Promise<void>;
  /** Removes every document. */
  reset(): Promise<void>;
}

const role = (principalId: string): ConfigPrincipal => ({
  principalType: PrincipalType.ROLE,
  principalId,
});

const group = (principalId: string): ConfigPrincipal => ({
  principalType: PrincipalType.GROUP,
  principalId,
});

function draft(
  overrides: Record<string, unknown> = {},
  extra: Partial<ConfigDraft> = {},
): ConfigDraft {
  return {
    principalModel: PrincipalModel.ROLE,
    priority: 10,
    overrides: overrides as Partial<TCustomConfig>,
    tombstones: [],
    isActive: true,
    ...extra,
  };
}

/** Keys that MongoDB-compatible engines cannot address or store as field names, at every depth. */
const AWKWARD_KEYS = [
  'us.anthropic.claude-sonnet-4-5',
  'gpt-4.1',
  '.leading',
  'trailing.',
  'a..b',
  '$set',
  '$',
  'price$',
  'mid$dle',
  '%',
  '%25',
  '%2E',
  '%2e',
  '%24',
  '%00',
  '%%',
  '100%',
  'ünïcödé',
  '模型.名称',
  '🔑.emoji',
  'é',
  'image/*',
  'text/plain; charset=utf-8',
];

function keyedObject(depth: number): Record<string, unknown> {
  const leaf = Object.fromEntries(AWKWARD_KEYS.map((key, index) => [key, index]));
  let value: Record<string, unknown> = leaf;
  for (let level = 0; level < depth; level++) {
    value = { [AWKWARD_KEYS[level % AWKWARD_KEYS.length]]: value, plain: level };
  }
  return value;
}

export function describeConfigStoreConformance(harness: ConfigStoreHarness): void {
  describe(`config store conformance: ${harness.name}`, () => {
    let store: ConfigStore;

    beforeAll(async () => {
      store = await harness.setup();
    });
    afterAll(() => harness.teardown());
    beforeEach(() => harness.reset());

    const conflictOf = async (promise: Promise<unknown>): Promise<unknown> => {
      try {
        await promise;
      } catch (error) {
        return error;
      }
      throw new Error('expected a revision conflict');
    };

    describe('documents', () => {
      it('reads nothing for a principal without a document', async () => {
        expect(await store.read(role('nobody'))).toBeNull();
      });

      it('creates a document at version 1 and reads back exactly what was written', async () => {
        const written = await store.write(
          role('editor'),
          draft({ interface: { customWelcome: 'hi' } }, { tombstones: ['memory.agent'] }),
          ABSENT_CONFIG_REVISION,
        );

        expect(written).toEqual(
          expect.objectContaining({
            principalType: PrincipalType.ROLE,
            principalId: 'editor',
            principalModel: PrincipalModel.ROLE,
            priority: 10,
            isActive: true,
            configVersion: 1,
            overrides: { interface: { customWelcome: 'hi' } },
            tombstones: ['memory.agent'],
          }),
        );
        expect(typeof written._id).toBe('string');
        expect(getConfigRevision(written)).toBe(`${written._id}:1`);
        expect(await store.read(role('editor'))).toEqual(written);
      });

      it('round-trips dotted, `$`, escape-like and unicode keys at every depth', async () => {
        const overrides = {
          ...Object.fromEntries(AWKWARD_KEYS.map((key) => [key, { nested: key }])),
          endpoints: {
            bedrock: { inferenceProfiles: keyedObject(0) },
            azureOpenAI: {
              groups: [{ group: 'g', models: { 'gpt-4.1': true, '$x.y': { 'a.b': 1 } } }],
            },
            custom: [
              {
                name: 'c',
                headers: { 'X.Trace': '${TRACE}', $ref: 'v' },
                addParams: keyedObject(3),
              },
            ],
          },
          fileConfig: { endpoints: { 'agents.v2': { supportedMimeTypes: ['image/.*', '$'] } } },
          deep: keyedObject(12),
        };

        const written = await store.write(role('keys'), draft(overrides), ABSENT_CONFIG_REVISION);

        expect(written.overrides).toEqual(overrides);
        expect((await store.read(role('keys')))?.overrides).toEqual(overrides);
        expect((await store.list())[0].overrides).toEqual(overrides);
        expect((await store.listActive([role('keys')]))[0].overrides).toEqual(overrides);
      });

      it('never rewrites values, only keys', async () => {
        const overrides = {
          interface: { customWelcome: 'a.b $c %2E %25 %24 ${VAR} 模型' },
          list: ['a.b', '$c', '%2E', { 'k.k': ['%24', null, true, 1.5] }],
        };

        await store.write(role('values'), draft(overrides), ABSENT_CONFIG_REVISION);

        expect((await store.read(role('values')))?.overrides).toEqual(overrides);
      });

      it('keeps empty objects and arrays, which carry meaning (an empty theme replaces the base one)', async () => {
        const overrides = {
          interface: { theme: {} },
          endpoints: { custom: [] },
          list: [{}, []],
          deep: { a: { b: {} } },
        };

        await store.write(role('empty'), draft(overrides), ABSENT_CONFIG_REVISION);

        expect((await store.read(role('empty')))?.overrides).toEqual(overrides);
      });

      it('keeps tombstones as written', async () => {
        const tombstones = ['mcpServers.github', 'memory.agent.id', 'endpoints.custom'];

        await store.write(role('hidden'), draft({}, { tombstones }), ABSENT_CONFIG_REVISION);

        expect((await store.read(role('hidden')))?.tombstones).toEqual(tombstones);
      });

      it('reads inactive documents', async () => {
        await store.write(role('off'), draft({}, { isActive: false }), ABSENT_CONFIG_REVISION);

        expect((await store.read(role('off')))?.isActive).toBe(false);
      });
    });

    describe('compare-and-swap', () => {
      it('replaces the whole document at the current revision and bumps the version', async () => {
        const first = await store.write(
          role('cas'),
          draft({ a: { b: 1 }, keep: true }, { tombstones: ['x.y'] }),
          ABSENT_CONFIG_REVISION,
        );

        const second = await store.write(
          role('cas'),
          draft({ a: { c: 2 } }, { priority: 30, isActive: false }),
          getConfigRevision(first),
        );

        expect(second._id).toBe(first._id);
        expect(second.configVersion).toBe(2);
        expect(second.overrides).toEqual({ a: { c: 2 } });
        expect(second.tombstones).toEqual([]);
        expect(second.priority).toBe(30);
        expect(second.isActive).toBe(false);
      });

      it('refuses a create when the principal already has a document', async () => {
        const first = await store.write(role('dup'), draft({ a: 1 }), ABSENT_CONFIG_REVISION);

        const error = await conflictOf(
          store.write(role('dup'), draft({ a: 2 }), ABSENT_CONFIG_REVISION),
        );

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect(await store.read(role('dup'))).toEqual(first);
      });

      it('refuses a stale revision and leaves the document unchanged', async () => {
        const first = await store.write(role('stale'), draft({ a: 1 }), ABSENT_CONFIG_REVISION);
        const second = await store.write(role('stale'), draft({ a: 2 }), getConfigRevision(first));

        const error = await conflictOf(
          store.write(role('stale'), draft({ a: 3 }), getConfigRevision(first)),
        );

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect(await store.read(role('stale'))).toEqual(second);
      });

      it('never creates a document when a write names a revision of one that does not exist', async () => {
        const gone = await store.write(role('gone'), draft(), ABSENT_CONFIG_REVISION);
        await store.remove(role('gone'));

        const error = await conflictOf(store.write(role('gone'), draft(), getConfigRevision(gone)));

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect(await store.read(role('gone'))).toBeNull();
      });

      it('refuses a revision of a deleted document after the principal is recreated (ABA)', async () => {
        const original = await store.write(
          role('aba'),
          draft({ v: 'old' }),
          ABSENT_CONFIG_REVISION,
        );
        await store.remove(role('aba'));
        const recreated = await store.write(
          role('aba'),
          draft({ v: 'new' }),
          ABSENT_CONFIG_REVISION,
        );
        expect(recreated.configVersion).toBe(original.configVersion);

        const error = await conflictOf(
          store.write(role('aba'), draft({ v: 'stale' }), getConfigRevision(original)),
        );

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect((await store.read(role('aba')))?.overrides).toEqual({ v: 'new' });
      });

      it('lets exactly one of two concurrent writes at the same revision win', async () => {
        const base = await store.write(role('race'), draft({ n: 0 }), ABSENT_CONFIG_REVISION);

        const results = await Promise.allSettled([
          store.write(role('race'), draft({ n: 1 }), getConfigRevision(base)),
          store.write(role('race'), draft({ n: 2 }), getConfigRevision(base)),
        ]);

        const fulfilled = results.filter((result) => result.status === 'fulfilled');
        const rejected = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(isConfigRevisionConflict(rejected[0].reason)).toBe(true);
        const stored = await store.read(role('race'));
        expect(stored?.configVersion).toBe(2);
        expect(stored).toEqual((fulfilled[0] as PromiseFulfilledResult<ConfigRecord>).value);
      });

      it('lets exactly one of two concurrent creates win', async () => {
        const results = await Promise.allSettled([
          store.write(role('first'), draft({ n: 1 }), ABSENT_CONFIG_REVISION),
          store.write(role('first'), draft({ n: 2 }), ABSENT_CONFIG_REVISION),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect((await store.list()).length).toBe(1);
      });

      it('rejects a malformed revision as a conflict without writing', async () => {
        await store.write(role('odd'), draft({ a: 1 }), ABSENT_CONFIG_REVISION);

        const error = await conflictOf(store.write(role('odd'), draft({ a: 2 }), 'not-a-revision'));

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect((await store.read(role('odd')))?.overrides).toEqual({ a: 1 });
      });
    });

    describe('remove and restore', () => {
      it('removes and returns the document; a missing one is null', async () => {
        const written = await store.write(role('rm'), draft({ a: 1 }), ABSENT_CONFIG_REVISION);

        expect(await store.remove(role('rm'))).toEqual(written);
        expect(await store.remove(role('rm'))).toBeNull();
        expect(await store.read(role('rm'))).toBeNull();
      });

      it('removes only at the expected revision', async () => {
        const first = await store.write(role('rmcas'), draft({ a: 1 }), ABSENT_CONFIG_REVISION);
        const second = await store.write(role('rmcas'), draft({ a: 2 }), getConfigRevision(first));

        const error = await conflictOf(store.remove(role('rmcas'), getConfigRevision(first)));
        expect(isConfigRevisionConflict(error)).toBe(true);
        expect(await store.read(role('rmcas'))).toEqual(second);

        expect(await store.remove(role('rmcas'), getConfigRevision(second))).toEqual(second);
        expect(await store.remove(role('rmcas'), ABSENT_CONFIG_REVISION)).toBeNull();
      });

      it('restores a removed document as it was, and never over a newer one', async () => {
        const written = await store.write(
          role('restore'),
          draft({ 'gpt-4.1': { $x: 1 } }, { tombstones: ['a.b'], isActive: false, priority: 7 }),
          ABSENT_CONFIG_REVISION,
        );
        const removed = await store.remove(role('restore'));

        expect(await store.restore(removed as ConfigRecord)).toBe(true);
        const restored = await store.read(role('restore'));
        expect(restored).toEqual(written);
        expect(getConfigRevision(restored as ConfigRecord)).toBe(getConfigRevision(written));

        const newer = await store.write(
          role('restore'),
          draft({ v: 2 }),
          getConfigRevision(written),
        );
        expect(await store.restore(removed as ConfigRecord)).toBe(false);
        expect(await store.read(role('restore'))).toEqual(newer);
      });
    });

    describe('listing', () => {
      async function seed(): Promise<ConfigRecord[]> {
        const records: ConfigRecord[] = [];
        for (const [principal, priority, isActive] of [
          [role('b'), 20, true],
          [role(BASE_CONFIG_PRINCIPAL_ID), 0, true],
          [group('g2'), 20, true],
          [role('a'), 20, true],
          [group('g1'), 5, false],
          [role('c'), 100, true],
        ] as Array<[ConfigPrincipal, number, boolean]>) {
          records.push(
            await store.write(principal, draft({}, { priority, isActive }), ABSENT_CONFIG_REVISION),
          );
        }
        return records;
      }

      const ids = (records: ConfigRecord[]): string[] =>
        records.map((record) => `${record.principalType}:${record.principalId}`);

      it('orders by priority, then identity, the same way every time', async () => {
        const records = await seed();
        const tied = records
          .filter((record) => record.priority === 20)
          .sort((left, right) => (left._id < right._id ? -1 : 1));

        const listed = await store.list();
        expect(listed.map((record) => record.priority)).toEqual([0, 5, 20, 20, 20, 100]);
        expect(listed.slice(2, 5).map((record) => record._id)).toEqual(
          tied.map((record) => record._id),
        );
        expect(ids(await store.list())).toEqual(ids(listed));
      });

      it('filters the full list by active state', async () => {
        await seed();

        expect(ids(await store.list({ isActive: false }))).toEqual(['group:g1']);
        expect(await store.list({ isActive: true })).toHaveLength(5);
      });

      it('lists only the active documents of the requested principals, in store order', async () => {
        await seed();

        const listed = await store.listActive([
          role('c'),
          group('g1'),
          role(BASE_CONFIG_PRINCIPAL_ID),
          role('a'),
          group('missing'),
        ]);

        expect(ids(listed)).toEqual([`role:${BASE_CONFIG_PRINCIPAL_ID}`, 'role:a', 'role:c']);
        expect(await store.listActive([])).toEqual([]);
      });
    });

    describe('operations on this engine', () => {
      it('tombstones remove the override subtree, prune emptied parents, and are cleared by a write', async () => {
        const operations = createConfigOperations(store);
        await operations.setFields(role('ops'), PrincipalModel.ROLE, {
          'mcpServers.github.title': 'GitHub',
          'balance.enabled': true,
        });

        const hidden = await operations.tombstoneFields(role('ops'), PrincipalModel.ROLE, [
          'mcpServers.github',
          'memory.agent',
        ]);
        expect(hidden.overrides).toEqual({ balance: { enabled: true } });
        expect(hidden.tombstones).toEqual(['mcpServers.github', 'memory.agent']);

        const reset = await operations.unsetFields(role('ops'), 'balance.enabled');
        expect(reset?.overrides).toEqual({});
        expect(reset?.tombstones).toEqual(['mcpServers.github', 'memory.agent']);

        const shown = await operations.setFields(role('ops'), PrincipalModel.ROLE, {
          'mcpServers.github.title': 'Again',
        });
        expect(shown.tombstones).toEqual(['memory.agent']);
        expect(shown.configVersion).toBe(4);
      });

      it('lists the active documents tombstoned at or below a path, in store order, without overrides', async () => {
        const operations = createConfigOperations(store);
        const tombstone = (principalId: string, fieldPath: string, priority?: number) =>
          operations.tombstoneFields(role(principalId), PrincipalModel.ROLE, fieldPath, priority);
        await operations.setFields(
          role('hides'),
          PrincipalModel.ROLE,
          { 'mcpServers.docs.title': 'Docs', 'balance.enabled': true },
          20,
        );
        await tombstone('hides', 'mcpServers.github');
        await tombstone('section', 'mcpServers', 10);
        await tombstone('field', 'mcpServers.github.headers', 30);
        await tombstone('other', 'webSearch', 5);
        await tombstone('prefix', 'mcpServersArchive', 5);
        await tombstone('off', 'mcpServers.github', 5);
        await operations.setActive(role('off'), false);

        expect(await operations.listTombstones('mcpServers')).toEqual([
          { principalType: PrincipalType.ROLE, principalId: 'section', tombstones: ['mcpServers'] },
          {
            principalType: PrincipalType.ROLE,
            principalId: 'hides',
            tombstones: ['mcpServers.github'],
          },
          {
            principalType: PrincipalType.ROLE,
            principalId: 'field',
            tombstones: ['mcpServers.github.headers'],
          },
        ]);
        expect(await operations.listTombstones('mcpServers.docs')).toEqual([]);
      });

      it('stores a batch of changes, renames and awkward keys included, as one write', async () => {
        const headers = keyedObject(2);
        const created = await store.write(
          role('batch'),
          draft({
            endpoints: {
              custom: [{ name: 'old', apiKey: 'v3:cipher', baseURL: 'https://old.example.com' }],
            },
            mcpServers: { a: { url: 'https://a.example.com', headers } },
          }),
          ABSENT_CONFIG_REVISION,
        );

        const { state, changed } = applyConfigChanges(toConfigOverrideState(created), [
          { op: 'rename', segments: ['endpoints', 'custom'], from: 'old', to: 'new' },
          { op: 'rename', segments: ['mcpServers'], from: 'a', to: 'b' },
          {
            op: 'set',
            segments: ['mcpServers', 'b', 'headers', '$set'],
            value: { 'x.y': '$', 'ünï.cödé': 1 },
          },
          {
            op: 'set',
            segments: [
              'endpoints',
              'bedrock',
              'inferenceProfiles',
              'us.anthropic.claude-sonnet-4-5',
            ],
            value: 'arn:aws:bedrock:us-east-1:1:inference-profile/x',
          },
          { op: 'tombstone', segments: ['memory', 'agent'] },
          { op: 'unset', segments: ['mcpServers', 'missing'] },
        ]);
        expect(changed).toEqual([true, true, true, true, true, false]);

        const written = await store.write(
          role('batch'),
          draft(state.overrides as Record<string, unknown>, { tombstones: state.tombstones }),
          getConfigRevision(created),
        );

        expect(written.configVersion).toBe(2);
        const stored = await store.read(role('batch'));
        expect(stored?.overrides).toEqual({
          endpoints: {
            custom: [{ name: 'new', apiKey: 'v3:cipher', baseURL: 'https://old.example.com' }],
            bedrock: {
              inferenceProfiles: {
                'us.anthropic.claude-sonnet-4-5': 'arn:aws:bedrock:us-east-1:1:inference-profile/x',
              },
            },
          },
          mcpServers: {
            b: {
              url: 'https://a.example.com',
              headers: { ...headers, $set: { 'x.y': '$', 'ünï.cödé': 1 } },
            },
          },
        });
        expect(stored?.tombstones).toEqual(['memory.agent']);
      });

      it('surfaces a conflict when a caller-supplied revision is stale', async () => {
        const operations = createConfigOperations(store);
        const first = await operations.setFields(role('stale-op'), PrincipalModel.ROLE, {
          'a.b': 1,
        });
        await operations.setFields(role('stale-op'), PrincipalModel.ROLE, { 'a.b': 2 });

        const error = await conflictOf(
          operations.setFields(role('stale-op'), PrincipalModel.ROLE, { 'a.b': 3 }, undefined, {
            expectedRevision: getConfigRevision(first),
          }),
        );

        expect(isConfigRevisionConflict(error)).toBe(true);
        expect((await store.read(role('stale-op')))?.overrides).toEqual({ a: { b: 2 } });
      });

      it('absorbs concurrent writes without a revision so none is lost', async () => {
        const operations = createConfigOperations(store);
        await operations.setFields(role('merge'), PrincipalModel.ROLE, { seed: true });

        await Promise.all(
          ['a', 'b'].map((key) =>
            operations.setFields(role('merge'), PrincipalModel.ROLE, { [`fields.${key}`]: key }),
          ),
        );

        const stored = await store.read(role('merge'));
        expect(stored?.overrides).toEqual({ seed: true, fields: { a: 'a', b: 'b' } });
        expect(stored?.configVersion).toBe(3);
      });
    });
  });
}
