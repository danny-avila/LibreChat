import { OAuthReconnectionTracker } from './OAuthReconnectionTracker';

describe('OAuthReconnectTracker', () => {
  let tracker: OAuthReconnectionTracker;
  const userId = 'user123';
  const serverName = 'test-server';
  const anotherServer = 'another-server';

  beforeEach(() => {
    tracker = new OAuthReconnectionTracker();
  });

  describe('setFailed', () => {
    it('should record a failed reconnection attempt', () => {
      tracker.setFailed(userId, serverName);
      expect(tracker.isFailed(userId, serverName)).toBe(true);
    });

    it('should track multiple servers for the same user', () => {
      tracker.setFailed(userId, serverName);
      tracker.setFailed(userId, anotherServer);

      expect(tracker.isFailed(userId, serverName)).toBe(true);
      expect(tracker.isFailed(userId, anotherServer)).toBe(true);
    });

    it('should track different users independently', () => {
      const anotherUserId = 'user456';

      tracker.setFailed(userId, serverName);
      tracker.setFailed(anotherUserId, serverName);

      expect(tracker.isFailed(userId, serverName)).toBe(true);
      expect(tracker.isFailed(anotherUserId, serverName)).toBe(true);
    });
  });

  describe('isFailed', () => {
    it('should return false when no failed attempt is recorded', () => {
      expect(tracker.isFailed(userId, serverName)).toBe(false);
    });

    it('should return true after a failed attempt is recorded', () => {
      tracker.setFailed(userId, serverName);
      expect(tracker.isFailed(userId, serverName)).toBe(true);
    });

    it('should return false for a different server even after another server failed', () => {
      tracker.setFailed(userId, serverName);
      expect(tracker.isFailed(userId, anotherServer)).toBe(false);
    });
  });

  describe('removeFailed', () => {
    it('should clear a failed reconnect record', () => {
      tracker.setFailed(userId, serverName);
      expect(tracker.isFailed(userId, serverName)).toBe(true);

      tracker.removeFailed(userId, serverName);
      expect(tracker.isFailed(userId, serverName)).toBe(false);
    });

    it('should only clear the specific server for the user', () => {
      tracker.setFailed(userId, serverName);
      tracker.setFailed(userId, anotherServer);

      tracker.removeFailed(userId, serverName);

      expect(tracker.isFailed(userId, serverName)).toBe(false);
      expect(tracker.isFailed(userId, anotherServer)).toBe(true);
    });

    it('should handle clearing non-existent records gracefully', () => {
      expect(() => tracker.removeFailed(userId, serverName)).not.toThrow();
    });
  });

  describe('setActive', () => {
    it('should mark a server as reconnecting', () => {
      tracker.setActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(true);
    });

    it('should track multiple reconnecting servers', () => {
      tracker.setActive(userId, serverName);
      tracker.setActive(userId, anotherServer);

      expect(tracker.isActive(userId, serverName)).toBe(true);
      expect(tracker.isActive(userId, anotherServer)).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should return false when server is not reconnecting', () => {
      expect(tracker.isActive(userId, serverName)).toBe(false);
    });

    it('should return true when server is marked as reconnecting', () => {
      tracker.setActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(true);
    });

    it('should handle non-existent user gracefully', () => {
      expect(tracker.isActive('non-existent-user', serverName)).toBe(false);
    });
  });

  describe('removeActive', () => {
    it('should clear reconnecting state for a server', () => {
      tracker.setActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(true);

      tracker.removeActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(false);
    });

    it('should only clear specific server state', () => {
      tracker.setActive(userId, serverName);
      tracker.setActive(userId, anotherServer);

      tracker.removeActive(userId, serverName);

      expect(tracker.isActive(userId, serverName)).toBe(false);
      expect(tracker.isActive(userId, anotherServer)).toBe(true);
    });

    it('should handle clearing non-existent state gracefully', () => {
      expect(() => tracker.removeActive(userId, serverName)).not.toThrow();
    });
  });

  describe('cleanup behavior', () => {
    it('should clean up empty user sets for failed reconnects', () => {
      tracker.setFailed(userId, serverName);
      tracker.removeFailed(userId, serverName);

      // Record and clear another user to ensure internal cleanup
      const anotherUserId = 'user456';
      tracker.setFailed(anotherUserId, serverName);

      // Original user should still be able to reconnect
      expect(tracker.isFailed(userId, serverName)).toBe(false);
    });

    it('should clean up empty user sets for active reconnections', () => {
      tracker.setActive(userId, serverName);
      tracker.removeActive(userId, serverName);

      // Mark another user to ensure internal cleanup
      const anotherUserId = 'user456';
      tracker.setActive(anotherUserId, serverName);

      // Original user should not be reconnecting
      expect(tracker.isActive(userId, serverName)).toBe(false);
    });
  });

  describe('combined state management', () => {
    it('should handle both failed and reconnecting states independently', () => {
      // Mark as reconnecting
      tracker.setActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(true);
      expect(tracker.isFailed(userId, serverName)).toBe(false);

      // Record failed attempt
      tracker.setFailed(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(true);
      expect(tracker.isFailed(userId, serverName)).toBe(true);

      // Clear reconnecting state
      tracker.removeActive(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(false);
      expect(tracker.isFailed(userId, serverName)).toBe(true);

      // Clear failed state
      tracker.removeFailed(userId, serverName);
      expect(tracker.isActive(userId, serverName)).toBe(false);
      expect(tracker.isFailed(userId, serverName)).toBe(false);
    });
  });
});
