import { logger } from '@librechat/data-schemas';
import type { SubagentResolutionDiagnostic } from '@librechat/agents';
import {
  describeErrorCauses,
  findMCPAuthenticationFailure,
  reportSubagentResolutionFailure,
} from './subagent';
import { ReauthenticationRequiredError } from '~/mcp/oauth/tokens';
import { MCPAuthenticationRejectedError } from '~/mcp/errors';

const SECRET = 'provider-secret-value';

function diagnostic(
  overrides: Partial<SubagentResolutionDiagnostic> = {},
): SubagentResolutionDiagnostic {
  return {
    phase: 'config',
    subagentType: 'pr-reviewer',
    aborted: false,
    type: 'Error',
    cause: 'unknown',
    message: 'Subagent error: Unable to initialize the selected subagent.',
    parentRunId: 'run-1',
    childRunId: 'child-run-1',
    taskId: 'task-1',
    ...overrides,
  };
}

describe('describeErrorCauses', () => {
  it('describes each cause by name, code, status and redacted message, never a stack', () => {
    const root = Object.assign(new Error(`Token refresh failed: Bearer ${SECRET}`), {
      code: 'invalid_grant',
      status: 400,
    });
    const error = new Error(
      `Could not load tools from https://mcp.example.com/sse?token=${SECRET}`,
      { cause: root },
    );

    const causes = describeErrorCauses(error);

    expect(causes).toEqual([
      { name: 'Error', message: 'Could not load tools from https://mcp.example.com/[redacted]' },
      {
        name: 'Error',
        code: 'invalid_grant',
        status: 400,
        message: 'Token refresh failed: Bearer [redacted]',
      },
    ]);
    expect(JSON.stringify(causes)).not.toContain(SECRET);
    expect(JSON.stringify(causes)).not.toContain('at ');
  });

  it('stops at a cycle and at its depth bound', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    Object.assign(first, { cause: second });
    expect(describeErrorCauses(first).map((cause) => cause.message)).toEqual(['first', 'second']);

    let deep: unknown = new Error('0');
    for (let index = 1; index < 10; index++) {
      deep = new Error(String(index), { cause: deep });
    }
    expect(describeErrorCauses(deep)).toHaveLength(4);
  });

  it('describes values that are not errors without echoing objects', () => {
    expect(describeErrorCauses('plain failure')).toEqual([
      { name: 'string', message: 'plain failure' },
    ]);
    expect(describeErrorCauses(undefined)).toEqual([]);
    expect(describeErrorCauses({ name: 'bad name with spaces', code: { nested: SECRET } })).toEqual(
      [{ name: 'UnknownError' }],
    );
  });
});

describe('findMCPAuthenticationFailure', () => {
  it('names the MCP server that needs re-authentication anywhere in the cause chain', () => {
    expect(
      findMCPAuthenticationFailure(
        new Error('child init failed', {
          cause: new ReauthenticationRequiredError('clickhouse-docs', 'expired'),
        }),
      ),
    ).toEqual({ serverName: 'clickhouse-docs' });
    expect(
      findMCPAuthenticationFailure(new MCPAuthenticationRejectedError('github', false)),
    ).toEqual({ serverName: 'github' });
  });

  it('does not treat a model provider or other HTTP 401 as an MCP sign-in', () => {
    expect(
      findMCPAuthenticationFailure(Object.assign(new Error('401 invalid_grant'), { status: 401 })),
    ).toBeUndefined();
    expect(findMCPAuthenticationFailure(new Error('Model not found'))).toBeUndefined();
  });
});

describe('reportSubagentResolutionFailure', () => {
  it('logs the underlying cause and the MCP server, and keeps the SDK classification', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const error = new Error(`Initialization failed for ${SECRET.length} tools`, {
      cause: new ReauthenticationRequiredError('clickhouse-docs', 'expired'),
    });

    const cause = reportSubagentResolutionFailure(diagnostic(), error);

    expect(cause).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[subagents] Subagent could not start: an MCP server it uses needs re-authentication',
      {
        phase: 'config',
        subagentType: 'pr-reviewer',
        cause: 'unknown',
        errorType: 'Error',
        aborted: false,
        taskId: 'task-1',
        childRunId: 'child-run-1',
        parentRunId: 'run-1',
        mcpAuthentication: { serverName: 'clickhouse-docs' },
        causes: [
          { name: 'Error', message: 'Initialization failed for 21 tools' },
          {
            name: 'ReauthenticationRequiredError',
            message:
              'Re-authentication required for "clickhouse-docs": access token expired and no refresh token available',
          },
        ],
      },
    );
    warn.mockRestore();
  });

  it('logs other failures without an MCP reason', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    reportSubagentResolutionFailure(
      diagnostic({ phase: 'identity', taskId: undefined }),
      new Error('Agent not found'),
    );

    expect(warn).toHaveBeenCalledWith('[subagents] Subagent could not start', {
      phase: 'identity',
      subagentType: 'pr-reviewer',
      cause: 'unknown',
      errorType: 'Error',
      aborted: false,
      childRunId: 'child-run-1',
      parentRunId: 'run-1',
      causes: [{ name: 'Error', message: 'Agent not found' }],
    });
    warn.mockRestore();
  });
});
