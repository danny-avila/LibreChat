export const DEFAULT_AGENT_NAME = 'librechat-voice';

export interface WorkerEnv {
  librechatUrl: string;
  workerSecret: string;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[livekit-agent] ${name} is required`);
  }
  return value;
};

/**
 * `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are read by the LiveKit SDK
 * itself, so they are deliberately absent here.
 */
export const readWorkerEnv = (): WorkerEnv => ({
  librechatUrl: required('LIBRECHAT_API_URL'),
  workerSecret: required('LIVEKIT_WORKER_SECRET'),
});
