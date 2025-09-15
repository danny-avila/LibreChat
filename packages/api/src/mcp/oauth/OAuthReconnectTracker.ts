/**
 * Tracks OAuth MCP reconnection attempts to prevent automatic retries
 * and to show connecting state during reconnection
 */
export class OAuthReconnectTracker {
  // Map of userId -> Set of serverNames that have failed reconnection
  private failedReconnections: Map<string, Set<string>> = new Map();
  // Map of userId -> Set of serverNames that are actively reconnecting
  private activeReconnections: Map<string, Set<string>> = new Map();

  /**
   * Records a failed reconnection attempt
   */
  public recordFailedReconnect(userId: string, serverName: string): void {
    if (!this.failedReconnections.has(userId)) {
      this.failedReconnections.set(userId, new Set());
    }

    this.failedReconnections.get(userId)?.add(serverName);
  }

  /**
   * Checks if a reconnection should be attempted
   */
  public shouldAttemptReconnect(userId: string, serverName: string): boolean {
    return !this.failedReconnections.get(userId)?.has(serverName);
  }

  /**
   * Clears a failed attempt record
   */
  public clearFailedReconnect(userId: string, serverName: string): void {
    const userServers = this.failedReconnections.get(userId);
    userServers?.delete(serverName);
    if (userServers?.size === 0) {
      this.failedReconnections.delete(userId);
    }
  }

  /**
   * Marks a server as actively reconnecting
   */
  public markAsReconnecting(userId: string, serverName: string): void {
    if (!this.activeReconnections.has(userId)) {
      this.activeReconnections.set(userId, new Set());
    }

    this.activeReconnections.get(userId)?.add(serverName);
  }

  /**
   * Checks if a server is actively reconnecting
   */
  public isReconnecting(userId: string, serverName: string): boolean {
    return this.activeReconnections.get(userId)?.has(serverName) ?? false;
  }

  /**
   * Clears the reconnecting state for a server
   */
  public clearReconnectingState(userId: string, serverName: string): void {
    const userServers = this.activeReconnections.get(userId);
    userServers?.delete(serverName);
    if (userServers?.size === 0) {
      this.activeReconnections.delete(userId);
    }
  }
}
