import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import type { PtcToolCallEvent } from 'librechat-data-provider';

/** Whole-preview budget for one inner call's arguments. */
const ARGS_PREVIEW_MAX_CHARS = 96;
/** Per-value budget, so one long string can't crowd out the other keys. */
const ARGS_VALUE_MAX_CHARS = 40;
const ERROR_PREVIEW_MAX_CHARS = 160;

const truncate = (input: string, max: number): string =>
  input.length <= max ? input : `${input.slice(0, max)}…`;

const collapse = (input: string): string => input.replace(/\s+/g, ' ').trim();

/**
 * Collapses an inner call's input into a single `key=value, key=value` line
 * for the CLI-style trace. Values are stringified and clipped individually;
 * the joined result is clipped again so the payload stays bounded no matter
 * how many keys the tool takes.
 */
export function summarizePtcArgs(input: unknown): string {
  if (input == null) {
    return '';
  }
  if (typeof input === 'string') {
    return truncate(collapse(input), ARGS_PREVIEW_MAX_CHARS);
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return truncate(collapse(String(input)), ARGS_PREVIEW_MAX_CHARS);
  }

  const entries: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value == null || value === '') {
      continue;
    }
    const rendered = typeof value === 'string' ? value : safeStringify(value);
    if (rendered === '') {
      continue;
    }
    entries.push(`${key}=${truncate(collapse(rendered), ARGS_VALUE_MAX_CHARS)}`);
  }

  return truncate(entries.join(', '), ARGS_PREVIEW_MAX_CHARS);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export interface InstrumentPtcToolMapParams {
  /** The tool map the PTC runner resolves inner calls against. */
  toolMap: Map<string, StructuredToolInterface>;
  /** The PTC run step's tool call id — the card the trace renders under. */
  toolCallId: string;
  runId?: string;
  emit: (event: PtcToolCallEvent) => void;
}

/**
 * Wraps every tool the PTC sandbox can reach so each inner invocation reports
 * its lifecycle on the live stream. The runner (`executeTools` in
 * `@librechat/agents`) resolves a tool by name and calls `invoke` on it, so a
 * `Proxy` intercepting only `invoke` is enough — `name`, `schema`, `mcp` and
 * every other property the runner reads pass straight through to the real
 * tool, and nothing about execution changes.
 */
export function instrumentPtcToolMap({
  toolMap,
  toolCallId,
  runId,
  emit,
}: InstrumentPtcToolMapParams): Map<string, StructuredToolInterface> {
  let sequence = 0;
  /** Emission is telemetry: a dead stream must never fail the program. */
  const safeEmit = (event: PtcToolCallEvent): void => {
    try {
      emit(event);
    } catch {
      /* stream closed or transport rejected — the run continues */
    }
  };

  const instrumented = new Map<string, StructuredToolInterface>();
  for (const [name, tool] of toolMap) {
    instrumented.set(
      name,
      new Proxy(tool, {
        get(target, property) {
          if (property !== 'invoke') {
            /** `target` as the receiver, not the proxy: LangChain tools read
             *  private class state through their own getters. */
            return Reflect.get(target, property, target);
          }
          return async (input: unknown, config?: unknown): Promise<unknown> => {
            const callId = `${toolCallId}:${sequence++}`;
            const startedAt = Date.now();
            safeEmit({
              tool_call_id: toolCallId,
              call_id: callId,
              name,
              status: 'running',
              args: summarizePtcArgs(input),
              ...(runId != null ? { runId } : {}),
            });
            try {
              const result = await (
                target.invoke as (input: unknown, config?: unknown) => Promise<unknown>
              ).call(target, input, config);
              safeEmit({
                tool_call_id: toolCallId,
                call_id: callId,
                name,
                status: 'success',
                durationMs: Date.now() - startedAt,
                ...(runId != null ? { runId } : {}),
              });
              return result;
            } catch (error) {
              safeEmit({
                tool_call_id: toolCallId,
                call_id: callId,
                name,
                status: 'error',
                error: truncate(
                  collapse(error instanceof Error ? error.message : String(error)),
                  ERROR_PREVIEW_MAX_CHARS,
                ),
                durationMs: Date.now() - startedAt,
                ...(runId != null ? { runId } : {}),
              });
              throw error;
            }
          };
        },
      }) as StructuredToolInterface,
    );
  }

  return instrumented;
}
