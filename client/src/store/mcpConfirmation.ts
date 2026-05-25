import { atom } from 'recoil';

export type PresentationFormat = 'text' | 'code' | 'json' | 'markdown';
export type PresentationImportance = 'primary' | 'detail';

export interface PresentationField {
  label: string;
  value: unknown;
  format?: PresentationFormat;
  importance?: PresentationImportance;
}

export interface MCPConfirmationPresentation {
  title?: string;
  summary?: string;
  fields: PresentationField[];
}

export interface MCPPendingConfirmation {
  confirmationId: string;
  serverName: string;
  toolName: string;
  preview: string;
  expiresInSeconds: number;
  /** Server-supplied; informational only. Use `deadline` for the countdown — server clocks may drift. */
  expiresAt: number;
  /**
   * Optional structured rendering hints from the gateway. When present, the
   * dialog renders these directly; when absent, it falls back to parsing
   * `preview`. Loosely modelled on MCP elicitation:
   * https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
   */
  presentation?: MCPConfirmationPresentation;
  /**
   * Client-computed epoch-ms deadline, set on SSE arrival. Used by the dialog
   * so an entry queued for N seconds before becoming the head still has the
   * correct remaining time when it surfaces. Replaces the previous in-dialog
   * `deadlineRef` mechanism.
   */
  deadline: number;
}

/**
 * FIFO queue of pending MCP tool-call confirmations. The dialog renders the
 * head; on resolve (accept / cancel / auto-cancel) the head is popped and the
 * next item (if any) becomes visible. Each entry carries its own deadline so
 * popping doesn't reset the countdown for items that were queued earlier.
 *
 * Why an array (not a single value): the LLM may issue multiple tool calls
 * in parallel, each producing its own confirmation envelope. The previous
 * single-slot atom silently overwrote the first when the second SSE arrived,
 * leaving one confirmation invisible and the agent loop stuck on its
 * `awaitConfirmationDecision` until the 120s server-side TTL.
 */
export const pendingMCPConfirmationsAtom = atom<MCPPendingConfirmation[]>({
  key: 'pendingMCPConfirmations',
  default: [],
});
