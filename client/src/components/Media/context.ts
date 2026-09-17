import type { MediaAsset, MediaOperation, MediaTurn } from 'librechat-data-provider';
import type { MediaDraft } from './state';

export type MediaEditTarget = { turnId: string; asset: MediaAsset };

const compareTurns = (left: MediaTurn, right: MediaTurn) =>
  (left.sequence ?? 0) - (right.sequence ?? 0) || left.createdAt.localeCompare(right.createdAt);

export function mediaThreadContext(turns: MediaTurn[]) {
  let latestTurn: MediaTurn | undefined;
  let imageTurn: MediaTurn | undefined;
  let image: MediaEditTarget | undefined;
  for (const turn of turns) {
    if (!latestTurn || compareTurns(turn, latestTurn) > 0) latestTurn = turn;
    if (imageTurn && compareTurns(turn, imageTurn) <= 0) continue;
    let asset =
      turn.kind === 'import'
        ? turn.assets.find((item) => item.type.startsWith('image/'))
        : undefined;
    let attemptAt = '';
    for (const job of turn.jobs) {
      if (job.phase !== 'succeeded' || job.createdAt < attemptAt) continue;
      let ordinal = Infinity;
      let result: MediaAsset | undefined;
      for (const output of job.outputs) {
        if (output.kind === 'image' && output.state === 'ready' && output.ordinal < ordinal) {
          ordinal = output.ordinal;
          result = output.asset;
        }
      }
      if (result) {
        asset = result;
        attemptAt = job.createdAt;
      }
    }
    if (asset) {
      imageTurn = turn;
      image = { turnId: turn.turnId, asset };
    }
  }
  return { latestTurn, image };
}

export function withImageContext(
  draft: MediaDraft,
  image?: MediaEditTarget,
  operation: MediaOperation = draft.operation,
): MediaDraft {
  if (
    !image ||
    draft.autoEdit === false ||
    draft.inputs.length > 0 ||
    draft.parentTurnId ||
    draft.operation === 'video.generate' ||
    operation === 'video.generate'
  )
    return draft;
  return {
    ...draft,
    operation: 'image.edit',
    parentTurnId: image.turnId,
    inputs: [{ role: 'reference', file_id: image.asset.file_id }],
    assets: [image.asset],
  };
}
