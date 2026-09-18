import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  mediaPresetSchema,
  mediaPresetWriteSchema,
  mediaPresetSettingsSchema,
} from 'librechat-data-provider';
import type { MediaPresetWriteInput } from 'librechat-data-provider';
import type { MediaMethods, MediaOwnerScope } from '~/types/media';
import type { MediaPresetMethods } from '~/types/mediaPreset';
import { createMediaPresetMethods } from './mediaPreset';
import { tenantStorage } from '~/config/tenantContext';
import { createMediaMethods } from './media';

describe('media presets on standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let media: MediaMethods;
  let presets: MediaPresetMethods;
  let scope: MediaOwnerScope;
  const settings = mediaPresetSettingsSchema.parse({
    operation: 'image.generate',
    connectionId: 'images',
    modelId: 'model-a',
    parameters: { quality: 'high' },
  });
  const write = (title: string, extra: Partial<MediaPresetWriteInput> = {}) =>
    mediaPresetWriteSchema.parse({ title, settings, ...extra });
  const create = (presetId: string, title: string, extra?: Partial<MediaPresetWriteInput>) =>
    presets.createMediaPreset({ scope, presetId, write: write(title, extra), maxPresets: 5 });
  const ids = async (owner = scope) =>
    (await presets.listMediaPresets(owner)).map((preset) => [preset.presetId, preset.isDefault]);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    media = createMediaMethods(mongoose);
    presets = createMediaPresetMethods(mongoose);
    await media.ensureMediaIndexes();
    await presets.ensureMediaPresetIndexes();
  }, 60000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
  });

  it('creates, lists, updates and deletes presets while keeping one default per owner', async () => {
    const first = await create('p1', 'Bright', { isDefault: true });
    expect(mediaPresetSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({ presetId: 'p1', title: 'Bright', isDefault: true, settings });
    expect(first).not.toHaveProperty('ownerId');
    await create('p2', 'Alpha', { isDefault: true });
    expect(await ids()).toEqual([
      ['p2', true],
      ['p1', false],
    ]);
    const third = await create('p3', 'Zed');
    expect(third.isDefault).toBe(false);
    expect(await ids()).toEqual([
      ['p2', true],
      ['p1', false],
      ['p3', false],
    ]);

    const updated = await presets.updateMediaPreset({
      scope,
      presetId: 'p3',
      update: { title: 'Aardvark', isDefault: true },
    });
    expect(updated).toMatchObject({ presetId: 'p3', title: 'Aardvark', isDefault: true });
    expect(updated!.updatedAt >= third.updatedAt).toBe(true);
    expect(updated!.createdAt).toBe(third.createdAt);
    expect(await ids()).toEqual([
      ['p3', true],
      ['p2', false],
      ['p1', false],
    ]);
    expect(await mongoose.models.MediaPreset.findOne({ presetId: 'p3' }).lean()).toMatchObject({
      version: 2,
    });

    const settingsOnly = await presets.updateMediaPreset({
      scope,
      presetId: 'p2',
      update: { settings: { ...settings, modelId: 'model-b' } },
    });
    expect(settingsOnly).toMatchObject({ isDefault: false, title: 'Alpha' });
    expect(settingsOnly?.settings.modelId).toBe('model-b');
    expect(await ids()).toEqual([
      ['p3', true],
      ['p2', false],
      ['p1', false],
    ]);

    const cleared = await presets.updateMediaPreset({
      scope,
      presetId: 'p3',
      update: { isDefault: false },
    });
    expect(cleared?.isDefault).toBe(false);
    expect(
      await presets.updateMediaPreset({ scope, presetId: 'missing', update: { title: 'Ghost' } }),
    ).toBeNull();
    expect(await ids()).toEqual([
      ['p3', false],
      ['p2', false],
      ['p1', false],
    ]);

    expect(await presets.deleteMediaPreset(scope, 'p1')).toBe(true);
    expect(await presets.deleteMediaPreset(scope, 'p1')).toBe(false);
    expect(await ids()).toEqual([
      ['p3', false],
      ['p2', false],
    ]);
  });

  it('rejects a preset beyond the configured capacity without touching other owners', async () => {
    await presets.createMediaPreset({ scope, presetId: 'p1', write: write('One'), maxPresets: 2 });
    await presets.createMediaPreset({ scope, presetId: 'p2', write: write('Two'), maxPresets: 2 });
    await expect(
      presets.createMediaPreset({ scope, presetId: 'p3', write: write('Three'), maxPresets: 2 }),
    ).rejects.toMatchObject({ code: 'capacity' });
    expect((await presets.listMediaPresets(scope)).map((preset) => preset.presetId)).toEqual([
      'p1',
      'p2',
    ]);
    const other = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    await presets.createMediaPreset({
      scope: other,
      presetId: 'p3',
      write: write('Three'),
      maxPresets: 2,
    });
    expect(await ids(other)).toEqual([['p3', false]]);
  });

  it('isolates presets by owner, tenant and tenant context', async () => {
    await create('shared-id', 'Mine', { isDefault: true });
    const stranger = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    const tenant = { ...scope, tenantId: 'tenant-a' };
    expect(await presets.listMediaPresets(stranger)).toEqual([]);
    expect(await presets.listMediaPresets(tenant)).toEqual([]);
    expect(
      await presets.updateMediaPreset({
        scope: stranger,
        presetId: 'shared-id',
        update: { title: 'Stolen' },
      }),
    ).toBeNull();
    expect(await presets.deleteMediaPreset(stranger, 'shared-id')).toBe(false);
    await presets.createMediaPreset({
      scope: stranger,
      presetId: 'shared-id',
      write: write('Theirs', { isDefault: true }),
      maxPresets: 5,
    });
    await presets.createMediaPreset({
      scope: tenant,
      presetId: 'shared-id',
      write: write('Tenant', { isDefault: true }),
      maxPresets: 5,
    });
    expect(await ids()).toEqual([['shared-id', true]]);
    expect(await ids(stranger)).toEqual([['shared-id', true]]);
    expect(await ids(tenant)).toEqual([['shared-id', true]]);
    await expect(
      tenantStorage.run({ tenantId: 'other' }, () => presets.listMediaPresets(scope)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      presets.createMediaPreset({
        scope,
        presetId: 'shared-id',
        write: write('Again'),
        maxPresets: 5,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await presets.deleteMediaPresetsForOwner(stranger);
    expect(await ids(stranger)).toEqual([]);
    expect(await ids()).toEqual([['shared-id', true]]);
  });

  it('removes presets when media account deletion completes', async () => {
    await create('p1', 'Keep me');
    const other = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    await presets.createMediaPreset({
      scope: other,
      presetId: 'p1',
      write: write('Other owner'),
      maxPresets: 5,
    });
    expect(await media.prepareMediaAccountDeletion({ scope, token: 'delete' })).toBe(true);
    await media.completeMediaAccountDeletion({ scope, token: 'delete' });
    expect(await presets.listMediaPresets(scope)).toEqual([]);
    expect(await ids(other)).toEqual([['p1', false]]);
  });
});
