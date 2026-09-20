import type { MediaAsset } from 'librechat-data-provider';
import type { MediaDraft } from './state';

/** Seed an explicit edit while preserving the user's prompt and generation preferences. */
export function seedMediaEditDraft(previous: MediaDraft, assets: MediaAsset[]): MediaDraft {
  return {
    ...previous,
    revision: previous.revision + 1,
    operation: 'image.edit',
    autoEdit: false,
    parentTurnId: undefined,
    assets,
    inputs: assets.map((asset) => ({ role: 'reference', file_id: asset.file_id })),
  };
}
