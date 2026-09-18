type SessionCleanup = () => void;

const cleanups = new Set<SessionCleanup>();

/** Client state that belongs to one signed-in account registers how it is cleared here, so the
 * auth boundary can end a session without importing every feature that keeps such state. The
 * returned function unregisters, for tests and for modules that are torn down. */
export function registerSessionCleanup(cleanup: SessionCleanup): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

/** Runs every registered cleanup; one that throws does not stop the others. */
export function runSessionCleanups(): void {
  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      console.error('Session cleanup failed', error);
    }
  });
}
