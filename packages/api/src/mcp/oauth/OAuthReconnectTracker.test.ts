import { OAuthReconnectTracker } from './OAuthReconnectTracker';

describe('OAuthReconnectTracker', () => {
  let tracker: OAuthReconnectTracker;
  const userId = 'user123';
  const serverName = 'test-server';
  const anotherServer = 'another-server';

  beforeEach(() => {
    tracker = new OAuthReconnectTracker();
  });

  describe('recordFailedReconnect', () => {
    it('should record a failed reconnection attempt', () => {
      tracker.recordFailedReconnect(userId, serverName);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);
    });

    it('should track multiple servers for the same user', () => {
      tracker.recordFailedReconnect(userId, serverName);
      tracker.recordFailedReconnect(userId, anotherServer);

      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);
      expect(tracker.shouldAttemptReconnect(userId, anotherServer)).toBe(false);
    });

    it('should track different users independently', () => {
      const anotherUserId = 'user456';

      tracker.recordFailedReconnect(userId, serverName);
      tracker.recordFailedReconnect(anotherUserId, serverName);

      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);
      expect(tracker.shouldAttemptReconnect(anotherUserId, serverName)).toBe(false);
    });
  });

  describe('shouldAttemptReconnect', () => {
    it('should return true when no failed attempt is recorded', () => {
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);
    });

    it('should return false after a failed attempt is recorded', () => {
      tracker.recordFailedReconnect(userId, serverName);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);
    });

    it('should return true for different server even after another server failed', () => {
      tracker.recordFailedReconnect(userId, serverName);
      expect(tracker.shouldAttemptReconnect(userId, anotherServer)).toBe(true);
    });
  });

  describe('clearFailedReconnect', () => {
    it('should clear a failed reconnect record', () => {
      tracker.recordFailedReconnect(userId, serverName);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);

      tracker.clearFailedReconnect(userId, serverName);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);
    });

    it('should only clear the specific server for the user', () => {
      tracker.recordFailedReconnect(userId, serverName);
      tracker.recordFailedReconnect(userId, anotherServer);

      tracker.clearFailedReconnect(userId, serverName);

      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);
      expect(tracker.shouldAttemptReconnect(userId, anotherServer)).toBe(false);
    });

    it('should handle clearing non-existent records gracefully', () => {
      expect(() => tracker.clearFailedReconnect(userId, serverName)).not.toThrow();
    });
  });

  describe('markAsReconnecting', () => {
    it('should mark a server as reconnecting', () => {
      tracker.markAsReconnecting(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(true);
    });

    it('should track multiple reconnecting servers', () => {
      tracker.markAsReconnecting(userId, serverName);
      tracker.markAsReconnecting(userId, anotherServer);

      expect(tracker.isReconnecting(userId, serverName)).toBe(true);
      expect(tracker.isReconnecting(userId, anotherServer)).toBe(true);
    });
  });

  describe('isReconnecting', () => {
    it('should return false when server is not reconnecting', () => {
      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
    });

    it('should return true when server is marked as reconnecting', () => {
      tracker.markAsReconnecting(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(true);
    });

    it('should handle non-existent user gracefully', () => {
      expect(tracker.isReconnecting('non-existent-user', serverName)).toBe(false);
    });
  });

  describe('clearReconnectingState', () => {
    it('should clear reconnecting state for a server', () => {
      tracker.markAsReconnecting(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(true);

      tracker.clearReconnectingState(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
    });

    it('should only clear specific server state', () => {
      tracker.markAsReconnecting(userId, serverName);
      tracker.markAsReconnecting(userId, anotherServer);

      tracker.clearReconnectingState(userId, serverName);

      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
      expect(tracker.isReconnecting(userId, anotherServer)).toBe(true);
    });

    it('should handle clearing non-existent state gracefully', () => {
      expect(() => tracker.clearReconnectingState(userId, serverName)).not.toThrow();
    });
  });

  describe('cleanup behavior', () => {
    it('should clean up empty user sets for failed reconnects', () => {
      tracker.recordFailedReconnect(userId, serverName);
      tracker.clearFailedReconnect(userId, serverName);

      // Record and clear another user to ensure internal cleanup
      const anotherUserId = 'user456';
      tracker.recordFailedReconnect(anotherUserId, serverName);

      // Original user should still be able to reconnect
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);
    });

    it('should clean up empty user sets for active reconnections', () => {
      tracker.markAsReconnecting(userId, serverName);
      tracker.clearReconnectingState(userId, serverName);

      // Mark another user to ensure internal cleanup
      const anotherUserId = 'user456';
      tracker.markAsReconnecting(anotherUserId, serverName);

      // Original user should not be reconnecting
      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
    });
  });

  describe('combined state management', () => {
    it('should handle both failed and reconnecting states independently', () => {
      // Mark as reconnecting
      tracker.markAsReconnecting(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(true);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);

      // Record failed attempt
      tracker.recordFailedReconnect(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(true);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);

      // Clear reconnecting state
      tracker.clearReconnectingState(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(false);

      // Clear failed state
      tracker.clearFailedReconnect(userId, serverName);
      expect(tracker.isReconnecting(userId, serverName)).toBe(false);
      expect(tracker.shouldAttemptReconnect(userId, serverName)).toBe(true);
    });
  });
});
