import { createRun } from '~/agents/run';

/**
 * Guards the code-tool eager/session wiring in `createRun`. The whole
 * create_file -> bash_tool sandbox-sharing chain depends on run.ts passing
 * `codeSessionToolNames` (so file-authoring tools share the code session) and
 * `excludeToolNames` (so side-effecting/large-arg tools aren't eager-executed).
 * These were silently missing before and only surfaced with both the
 * file-authoring and code-execution capabilities enabled — assert they're wired
 * so a future edit can't drop them without failing CI.
 */

jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  })),
  format: Object.assign(
    jest.fn((fn) => () => ({ transform: fn })),
    {
      combine: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn(),
      label: jest.fn(),
      timestamp: jest.fn(),
      printf: jest.fn(),
      errors: jest.fn(),
      splat: jest.fn(),
      json: jest.fn(),
    },
  ),
  addColors: jest.fn(),
  transports: { Console: jest.fn(), DailyRotateFile: jest.fn(), File: jest.fn() },
}));

jest.mock('~/utils/env', () => ({
  resolveHeaders: jest.fn((opts: { headers: unknown }) => opts?.headers ?? {}),
  createSafeUser: jest.fn(() => ({})),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@librechat/agents', () => {
  const actual = jest.requireActual('@librechat/agents');
  return {
    ...actual,
    Run: {
      create: jest.fn().mockResolvedValue({
        processStream: jest.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

jest.mock('~/agents/checkpointer', () => ({
  getAgentCheckpointer: jest.fn().mockResolvedValue({}),
}));

import { Run } from '@librechat/agents';

function makeAgent(overrides?: Record<string, unknown>) {
  return {
    id: 'agent_1',
    provider: 'openAI',
    endpoint: 'openAI',
    model: 'gpt-4o',
    tools: [],
    model_parameters: { model: 'gpt-4o' },
    maxContextTokens: 100_000,
    toolContextMap: {},
    ...overrides,
  };
}

async function captureRunConfig(): Promise<Record<string, unknown>> {
  await createRun({
    agents: [makeAgent()] as never,
    signal: new AbortController().signal,
    streaming: true,
    streamUsage: true,
  });
  const createMock = Run.create as jest.Mock;
  expect(createMock).toHaveBeenCalledTimes(1);
  return createMock.mock.calls[0][0] as Record<string, unknown>;
}

describe('createRun code-tool eager/session wiring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('excludes side-effecting/large-arg tools from eager execution', async () => {
    const runConfig = await captureRunConfig();
    const eager = runConfig.eagerEventToolExecution as {
      enabled?: boolean;
      excludeToolNames?: string[];
    };
    expect(eager.enabled).toBe(true);
    expect(eager.excludeToolNames).toEqual(
      expect.arrayContaining(['create_file', 'edit_file', 'execute_code', 'bash_tool']),
    );
  });

  it('declares create_file/edit_file as code-session participants', async () => {
    const runConfig = await captureRunConfig();
    expect(runConfig.codeSessionToolNames).toEqual(
      expect.arrayContaining(['create_file', 'edit_file']),
    );
  });
});
