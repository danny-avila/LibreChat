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
