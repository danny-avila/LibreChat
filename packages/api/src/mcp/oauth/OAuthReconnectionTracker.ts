export class OAuthReconnectionTracker {
  /** Map of userId -> Set of serverNames that have failed reconnection */
  private failed: Map<string, Set<string>> = new Map();
  /** Map of userId -> Set of serverNames that are actively reconnecting */
  private active: Map<string, Set<string>> = new Map();
  /** Map of userId:serverName -> timestamp when reconnection started */
  private activeTimestamps: Map<string, number> = new Map();
  /** Maximum time (ms) a server can be in reconnecting state before auto-cleanup */
  private readonly RECONNECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  public isFailed(userId: string, serverName: string): boolean {
    return this.failed.get(userId)?.has(serverName) ?? false;
  }

  public isActive(userId: string, serverName: string): boolean {
    const key = `${userId}:${serverName}`;
    const startTime = this.activeTimestamps.get(key);

    // Check if reconnection has timed out
    if (startTime && Date.now() - startTime > this.RECONNECTION_TIMEOUT_MS) {
      // Auto-cleanup timed out reconnection
      this.removeActive(userId, serverName);
      return false;
    }

    return this.active.get(userId)?.has(serverName) ?? false;
  }

  public setFailed(userId: string, serverName: string): void {
    if (!this.failed.has(userId)) {
      this.failed.set(userId, new Set());
    }

    this.failed.get(userId)?.add(serverName);
  }

  public setActive(userId: string, serverName: string): void {
    if (!this.active.has(userId)) {
      this.active.set(userId, new Set());
    }

    this.active.get(userId)?.add(serverName);

    /** Track when reconnection started */
    const key = `${userId}:${serverName}`;
    this.activeTimestamps.set(key, Date.now());
  }

  public removeFailed(userId: string, serverName: string): void {
    const userServers = this.failed.get(userId);
    userServers?.delete(serverName);
    if (userServers?.size === 0) {
      this.failed.delete(userId);
    }
  }

  public removeActive(userId: string, serverName: string): void {
    const userServers = this.active.get(userId);
    userServers?.delete(serverName);
    if (userServers?.size === 0) {
      this.active.delete(userId);
    }

    /** Clear timestamp tracking */
    const key = `${userId}:${serverName}`;
    this.activeTimestamps.delete(key);
  }
}
