export class OAuthReconnectionTracker {
  // Map of userId -> Set of serverNames that have failed reconnection
  private failed: Map<string, Set<string>> = new Map();
  // Map of userId -> Set of serverNames that are actively reconnecting
  private active: Map<string, Set<string>> = new Map();

  public isFailed(userId: string, serverName: string): boolean {
    return this.failed.get(userId)?.has(serverName) ?? false;
  }

  public isActive(userId: string, serverName: string): boolean {
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
  }
}
