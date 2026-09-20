import type { MediaPreset } from 'librechat-data-provider';
import type { MediaPresetMethods, MediaStoredPreset } from '~/types/mediaPreset';
import type { MediaMethods, MediaOwnerScope } from '~/types/media';
import { mediaScopeFilter as scopeFilter, positiveMediaLimit as positive } from '~/utils/media';
import { createMediaMethods, MediaPersistenceError } from './media';
import { createMediaPresetModel } from '~/models/media';
import { createIndexesWithRetry } from '~/utils/retry';

import { durable, duplicate } from './media/scope';

function presetView(preset: MediaStoredPreset): MediaPreset {
  return {
    schemaVersion: 1,
    presetId: preset.presetId,
    title: preset.title,
    isDefault: preset.isDefault,
    settings: preset.settings,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
  };
}

/** Saved Studio generation settings. One preset per owner may be the default. */
export function createMediaPresetMethods(
  mongoose: typeof import('mongoose'),
  deps: Pick<MediaMethods, 'assertMediaOwnerActive'> = createMediaMethods(mongoose),
): MediaPresetMethods {
  const Preset = createMediaPresetModel(mongoose);
  let indexPromise: Promise<void> | undefined;

  async function ensureMediaPresetIndexes(): Promise<void> {
    indexPromise ??= createIndexesWithRetry(Preset)
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
    now: Date,
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
    await deps.assertMediaOwnerActive(owner);
    if ((await Preset.countDocuments(owner)) >= positive(maxPresets)) {
      throw new MediaPersistenceError('capacity', 'Media preset limit reached');
    }
    const now = new Date();
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
    const document = new Preset(record);
    try {
      await document.save(durable);
    } catch (error) {
      if (!duplicate(error)) {
        throw error;
      }
      throw new MediaPersistenceError('conflict', 'Media preset identity already exists');
    }
    try {
      await deps.assertMediaOwnerActive(owner);
    } catch (error) {
      // Fence a delayed insert after account cleanup without removing a replacement writer's row.
      await Preset.deleteOne({ ...owner, _id: document._id }, { writeConcern: durable });
      throw error;
    }
    return presetView(record);
  };

  const updateMediaPreset: MediaPresetMethods['updateMediaPreset'] = async ({
    scope,
    presetId,
    update,
  }) => {
    const owner = scopeFilter(scope);
    await deps.assertMediaOwnerActive(owner);
    const now = new Date();
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
    try {
      await deps.assertMediaOwnerActive(owner);
    } catch (error) {
      await Preset.deleteOne(
        { ...owner, presetId, version: preset.version, updatedAt: preset.updatedAt },
        { writeConcern: durable },
      );
      throw error;
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
