import type { Agents } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';
import type { IContentStateManager } from '../interfaces/IJobStore';

/**
 * Content state entry - volatile, in-memory only.
 * Uses WeakRef to allow garbage collection of graph when no longer needed.
 */
interface ContentState {
  contentParts: Agents.MessageContentComplex[];
  graphRef: WeakRef<StandardGraph> | null;
}

/**
 * In-memory content state manager.
 * Manages volatile references to graph content that should NOT be persisted.
 * Uses WeakRef for graph to allow garbage collection.
 */
export class InMemoryContentState implements IContentStateManager {
  private state = new Map<string, ContentState>();

  /** Cleanup interval for orphaned entries */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup orphaned content state every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphaned();
    }, 300000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    const existing = this.state.get(streamId);
    if (existing) {
      existing.contentParts = contentParts;
    } else {
      this.state.set(streamId, { contentParts, graphRef: null });
    }
  }

  getContentParts(streamId: string): Agents.MessageContentComplex[] | null {
    return this.state.get(streamId)?.contentParts ?? null;
  }

  setGraph(streamId: string, graph: StandardGraph): void {
    const existing = this.state.get(streamId);
    if (existing) {
      existing.graphRef = new WeakRef(graph);
    } else {
      this.state.set(streamId, {
        contentParts: [],
        graphRef: new WeakRef(graph),
      });
    }
  }

  getRunSteps(streamId: string): Agents.RunStep[] {
    const state = this.state.get(streamId);
    if (!state?.graphRef) {
      return [];
    }

    // Dereference WeakRef - may return undefined if GC'd
    const graph = state.graphRef.deref();
    return graph?.contentData ?? [];
  }

  clearContentState(streamId: string): void {
    this.state.delete(streamId);
  }

  /**
   * Cleanup entries where graph has been garbage collected.
   * These are orphaned states that are no longer useful.
   */
  private cleanupOrphaned(): void {
    const toDelete: string[] = [];

    for (const [streamId, state] of this.state) {
      // If graphRef exists but has been GC'd, this state is orphaned
      if (state.graphRef && !state.graphRef.deref()) {
        toDelete.push(streamId);
      }
    }

    for (const id of toDelete) {
      this.state.delete(id);
    }
  }

  /** Get count of tracked streams (for monitoring) */
  getStateCount(): number {
    return this.state.size;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.state.clear();
  }
}
