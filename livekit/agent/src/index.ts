import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, ServerOptions } from '@livekit/agents';

import { DEFAULT_AGENT_NAME } from './env.js';

/**
 * `agentName` must be set: without it LiveKit falls back to automatic dispatch and joins an
 * agent to every new room, with no way to pass the session metadata we depend on.
 *
 * `ServerOptions`/`AgentServer` are the 1.5.x names; `WorkerOptions`/`Worker` are deprecated
 * aliases still shown in the upstream README.
 */
cli.runApp(
  new ServerOptions({
    agent: join(dirname(fileURLToPath(import.meta.url)), 'agent.js'),
    agentName: process.env.LIVEKIT_AGENT_NAME ?? DEFAULT_AGENT_NAME,
  }),
);
