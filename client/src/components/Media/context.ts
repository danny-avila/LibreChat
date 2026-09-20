import type {
  MediaAsset,
  MediaAssetContext,
  MediaOperation,
  MediaTurn,
} from 'librechat-data-provider';
import type { MediaDraft } from './state';

export type MediaEditTarget = MediaAssetContext;

export const compareTurns = (left: MediaTurn, right: MediaTurn) =>
  (left.sequence ?? 0) - (right.sequence ?? 0) || left.createdAt.localeCompare(right.createdAt);

function latestAssetContext(turns: MediaTurn[], kind: 'image' | 'video') {
  let contextTurn: MediaTurn | undefined;
  let context: MediaEditTarget | undefined;
  for (const turn of turns) {
    if (contextTurn && compareTurns(turn, contextTurn) <= 0) continue;
    let asset =
      turn.kind === 'import'
        ? turn.assets.find((item) => item.type.startsWith(`${kind}/`))
        : undefined;
    let attemptAt = '';
    for (const job of turn.jobs) {
      if (job.phase !== 'succeeded' || job.createdAt < attemptAt) continue;
      let ordinal = Infinity;
      let result: MediaAsset | undefined;
      for (const output of job.outputs) {
        if (output.kind === kind && output.state === 'ready' && output.ordinal < ordinal) {
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
      contextTurn = turn;
      context = { turnId: turn.turnId, asset };
    }
  }
  return context;
}

export function mediaThreadContext(turns: MediaTurn[]) {
  let latestTurn: MediaTurn | undefined;
  for (const turn of turns) {
    if (!latestTurn || compareTurns(turn, latestTurn) > 0) latestTurn = turn;
  }
  return {
    latestTurn,
    image: latestAssetContext(turns, 'image'),
    video: latestAssetContext(turns, 'video'),
  };
}

export function withMediaContext(
  draft: MediaDraft,
  context: { image?: MediaEditTarget; video?: MediaEditTarget },
  operation: MediaOperation = draft.operation,
): MediaDraft {
  const target = operation === 'video.generate' ? context.video : context.image;
  if (!target || draft.autoEdit === false || draft.inputs.length > 0 || draft.parentTurnId)
    return draft;
  return {
    ...draft,
    operation: operation === 'video.generate' ? operation : 'image.edit',
    parentTurnId: target.turnId,
    inputs: [
      {
        role: operation === 'video.generate' ? 'video' : 'reference',
        file_id: target.asset.file_id,
      },
    ],
    assets: [target.asset],
  };
}
