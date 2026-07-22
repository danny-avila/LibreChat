export interface BackgroundHandle {
  background_task_id: string;
  tool: string;
  status?: string;
}

/**
 * Detects the synthetic "dispatched in background" handle a backgrounded tool
 * call returns as its output, so code cards can show a background state
 * instead of rendering the handle JSON as stdout. The handle is a small
 * single-object JSON payload; anything large or non-JSON is real output.
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
      typeof parsed.background_task_id === 'string' &&
      typeof parsed.tool === 'string'
    ) {
      return parsed as BackgroundHandle;
    }
  } catch {
    return null;
  }
  return null;
}
