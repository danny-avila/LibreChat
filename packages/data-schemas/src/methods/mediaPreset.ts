import type { MediaPreset } from 'librechat-data-provider';
import type { MediaPresetMethods, MediaStoredPreset } from '~/types/mediaPreset';
import type { MediaOwnerScope } from '~/types/media';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createMediaPresetModel } from '~/models/media';
import { MediaPersistenceError } from './media';

const durable = { w: 'majority' as const, j: true };
function scopeFilter(scope: MediaOwnerScope): MediaOwnerScope {
  const current = tenantStorage.getStore()?.tenantId;
  if (
    !scope.ownerId ||
    scope.tenantId === '' ||
    scope.tenantId === SYSTEM_TENANT_ID ||
    (current && current !== SYSTEM_TENANT_ID && current !== scope.tenantId)
  ) {
    throw new MediaPersistenceError('not_found', 'Media preset owner scope is unavailable');
  }
  return { ownerId: scope.ownerId, tenantId: scope.tenantId ?? null };
}
function duplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
}
function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MediaPersistenceError('invalid_input', 'A positive media limit is required');
  }
  return value;
}
function presetView(preset: MediaStoredPreset): MediaPreset {
  return {
    schemaVersion: 1,
    presetId: preset.presetId,
    title: preset.title,
    isDefault: preset.isDefault,
    settings: preset.settings,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

/** Saved Studio generation settings. One preset per owner may be the default. */
export function createMediaPresetMethods(mongoose: typeof import('mongoose')): MediaPresetMethods {
  const Preset = createMediaPresetModel(mongoose);
  let indexPromise: Promise<void> | undefined;

  async function ensureMediaPresetIndexes(): Promise<void> {
    indexPromise ??= Preset.createIndexes()
      .then(() => undefined)
      .catch((error: unknown) => {
        indexPromise = undefined;
        throw error;
      });
    await indexPromise;
  }

  async function clearOtherDefaults(
    owner: MediaOwnerScope,
    presetId: string,
    now: string,
  ): Promise<void> {
    await Preset.updateMany(
      { ...owner, presetId: { $ne: presetId }, isDefault: true },
      { $set: { isDefault: false, updatedAt: now }, $inc: { version: 1 } },
      { writeConcern: durable },
    );
  }

  const listMediaPresets: MediaPresetMethods['listMediaPresets'] = async (scope) => {
    const rows = await Preset.find(scopeFilter(scope))
      .sort({ isDefault: -1, title: 1, presetId: 1 })
      .lean<MediaStoredPreset[]>();
    return rows.map(presetView);
  };

  const createMediaPreset: MediaPresetMethods['createMediaPreset'] = async ({
    scope,
    presetId,
    write,
    maxPresets,
  }) => {
    const owner = scopeFilter(scope);
    if ((await Preset.countDocuments(owner)) >= positive(maxPresets)) {
      throw new MediaPersistenceError('capacity', 'Media preset limit reached');
    }
    const now = new Date().toISOString();
    if (write.isDefault === true) {
      await clearOtherDefaults(owner, presetId, now);
    }
    const record: MediaStoredPreset = {
      ...owner,
      schemaVersion: 1,
      presetId,
      title: write.title,
      isDefault: write.isDefault === true,
      settings: structuredClone(write.settings),
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    try {
      await new Preset(record).save(durable);
    } catch (error) {
      if (!duplicate(error)) {
        throw error;
      }
      throw new MediaPersistenceError('conflict', 'Media preset identity already exists');
    }
    return presetView(record);
  };

  const updateMediaPreset: MediaPresetMethods['updateMediaPreset'] = async ({
    scope,
    presetId,
    update,
  }) => {
    const owner = scopeFilter(scope);
    const now = new Date().toISOString();
    const preset = await Preset.findOneAndUpdate(
      { ...owner, presetId },
      {
        $set: {
          updatedAt: now,
          ...(update.title !== undefined ? { title: update.title } : {}),
          ...(update.isDefault !== undefined ? { isDefault: update.isDefault } : {}),
          ...(update.settings !== undefined ? { settings: structuredClone(update.settings) } : {}),
        },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredPreset | null>();
    if (!preset) {
      return null;
    }
    if (update.isDefault === true) {
      await clearOtherDefaults(owner, presetId, now);
    }
    return presetView(preset);
  };

  const deleteMediaPreset: MediaPresetMethods['deleteMediaPreset'] = async (scope, presetId) => {
    const result = await Preset.deleteOne(
      { ...scopeFilter(scope), presetId },
      { writeConcern: durable },
    );
    return result.deletedCount > 0;
  };

  const deleteMediaPresetsForOwner: MediaPresetMethods['deleteMediaPresetsForOwner'] = async (
    scope,
  ) => {
    await Preset.deleteMany(scopeFilter(scope), { writeConcern: durable });
  };

  return {
    ensureMediaPresetIndexes,
    listMediaPresets,
    createMediaPreset,
    updateMediaPreset,
    deleteMediaPreset,
    deleteMediaPresetsForOwner,
  };
}
