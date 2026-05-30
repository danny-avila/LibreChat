import type { MCPPendingConfirmation } from '~/store/mcpConfirmation';

/**
 * Enqueue an incoming MCP confirmation envelope onto the existing queue.
 *
 * - Dedups by `confirmationId` so an SSE reconnect that re-fires the same
 *   event mid-confirmation doesn't double-register the same entry.
 * - Computes the per-entry `deadline` at receipt time so an entry queued
 *   behind another for N seconds still has the correct remaining time when
 *   it surfaces as the head.
 *
 * Returns the same `prev` reference on a dedup hit so React/Recoil can skip
 * the re-render.
 *
 * Used by the SSE listeners (`useSSE.ts`, `useResumableSSE.ts`) — both the
 * live `message` branch and the `pendingEvents` replay loop.
 */
export function enqueueMCPConfirmation(
  prev: MCPPendingConfirmation[],
  incoming: Omit<MCPPendingConfirmation, 'deadline'>,
): MCPPendingConfirmation[] {
  if (prev.some((p) => p.confirmationId === incoming.confirmationId)) {
    return prev;
  }
  return [
    ...prev,
    {
      ...incoming,
      deadline: Date.now() + incoming.expiresInSeconds * 1000,
    },
  ];
}
