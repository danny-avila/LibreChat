import type { MediaPreset, MediaPresetUpdate, MediaPresetWrite } from 'librechat-data-provider';
import type { MediaOwnerScope } from './media';

export type MediaStoredPreset = Omit<MediaPreset, 'createdAt' | 'updatedAt'> &
  MediaOwnerScope & { version: number; createdAt: Date; updatedAt: Date };

export interface MediaPresetMethods {
  ensureMediaPresetIndexes(): Promise<void>;
  /** Default presets sort first, then titles ascending. */
  listMediaPresets(scope: MediaOwnerScope): Promise<MediaPreset[]>;
  createMediaPreset(input: {
    scope: MediaOwnerScope;
    presetId: string;
    write: MediaPresetWrite;
    maxPresets: number;
  }): Promise<MediaPreset>;
  updateMediaPreset(input: {
    scope: MediaOwnerScope;
    presetId: string;
    update: MediaPresetUpdate;
  }): Promise<MediaPreset | null>;
  deleteMediaPreset(scope: MediaOwnerScope, presetId: string): Promise<boolean>;
  deleteMediaPresetsForOwner(scope: MediaOwnerScope): Promise<void>;
}
