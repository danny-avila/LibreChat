import type { TAttachment } from 'librechat-data-provider';

/**
 * `type` of the synthetic attachment the server emits on a poll turn when a
 * backgrounded code task settles — the live completion signal for the original
 * card (stdout-only runs produce no file attachments). Never persisted;
 * mirrored in `packages/api/src/agents/background.ts`.
 */
export const BACKGROUND_STATUS_ATTACHMENT_TYPE = 'background_task_status';

/**
 * Separates real file attachments from the synthetic background status marker.
 * `backgroundStatus` carries the settled task's status (`completed` | `error`)
 * when the marker is present — the backgrounded call has finished even if it
 * generated no files, and failures must not render as clean completions.
 *
 * Attachments reach each card pre-routed by `toolCallId` (`ContentParts`'
 * `mapAttachments`), but the marker is additionally scoped to `toolCallId`
 * here as defense in depth — a sibling call's marker must never flip this
 * card's status. A missing id on either side is a wildcard.
 */
export function splitBackgroundAttachments(
  attachments?: TAttachment[],
  toolCallId?: string,
): {
  fileAttachments?: TAttachment[];
  backgroundStatus?: string;
} {
  if (!attachments || attachments.length === 0) {
    return { fileAttachments: attachments };
  }
  /** The marker's `type`/`status` are host-defined, outside the `Tools` union. */
  let backgroundStatus: string | undefined;
  const fileAttachments = attachments.filter((attachment) => {
    const marker = attachment as
      | { type?: string; status?: string; toolCallId?: string }
      | undefined;
    if (marker?.type !== BACKGROUND_STATUS_ATTACHMENT_TYPE) {
      return true;
    }
    if (toolCallId == null || marker.toolCallId == null || marker.toolCallId === toolCallId) {
      backgroundStatus = typeof marker.status === 'string' ? marker.status : 'completed';
    }
    return false;
  });
  return { fileAttachments, backgroundStatus };
}

export interface BackgroundHandle {
  background_task_id: string;
  tool: string;
  status: string;
  message: string;
}

const HANDLE_KEYS: ReadonlyArray<keyof BackgroundHandle> = [
  'background_task_id',
  'tool',
  'status',
  'message',
];

/**
 * Detects the synthetic "dispatched in background" handle a backgrounded tool
 * call returns as its output, so code cards can show a background state
 * instead of rendering the handle JSON as stdout. Requires the handle's exact
 * shape — including the poll-tool instruction in `message` — so real stdout
 * that happens to be a small JSON object naming `background_task_id` is not
 * suppressed.
 */
export function parseBackgroundHandle(output?: string): BackgroundHandle | null {
  if (!output || output.length > 1000) {
    return null;
  }
  const trimmed = output.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"background_task_id"')) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<BackgroundHandle> | null;
    if (
      parsed != null &&
      Object.keys(parsed).length === HANDLE_KEYS.length &&
      HANDLE_KEYS.every((key) => typeof parsed[key] === 'string') &&
      (parsed.message as string).includes('check_background_task')
    ) {
      return parsed as BackgroundHandle;
    }
  } catch {
    return null;
  }
  return null;
}
