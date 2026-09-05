import { tool } from '@librechat/agents/langchain/tools';
import { BashExecutionToolDefinition, BashToolOutputReferencesGuide } from '@librechat/agents';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { AgentGitIdentity } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { WorkspaceExecuteCommandResult } from './workspace';
import type { CodeBridgeFetch } from './bridge';
import { executeWorkspaceTool } from './workspace';

const DEFAULT_WORKSPACE_ID = 'primary';
const DEFAULT_OUTPUT_BYTES = 256 * 1024;

export const ATTACHED_WORKSPACE_BASH_DESCRIPTION = `Runs bash commands inside the selected attached environment and returns stdout/stderr. The workspace may be an existing project, a Git repository, or an empty directory; Git is not required.

Session behavior:
- Files in the registered workspace persist between calls.
- Each call runs in a fresh sandboxed process; shell variables, the working directory, temporary files, and background processes do not survive the call.
- Network access follows the sandbox policy configured on the worker and may be unavailable.
- Commands and file access remain confined by the worker's runtime policy.
- Input code is already displayed to the user; do not repeat it unless asked.
- Explicitly print every result the user should see.
- Never use this tool to execute malicious commands.`;

const bashSchema = BashExecutionToolDefinition.schema as {
  properties?: NonNullable<LCTool['parameters']>['properties'];
};
const attachedCommandSchema: NonNullable<LCTool['parameters']> = {
  ...bashSchema.properties?.command,
  type: 'string',
  description:
    'The bash command or script to execute from the attached workspace root. Files written in the workspace persist between calls, but each call starts a fresh process.',
};

/**
 * This definition is shared with agent metadata. LangChain's JSON Schema
 * dereferencer annotates schemas during validation, so each tool receives an
 * isolated mutable clone instead of mutating this shared definition.
 */
export const ATTACHED_WORKSPACE_BASH_SCHEMA: NonNullable<LCTool['parameters']> = Object.freeze({
  type: 'object',
  properties: {
    ...bashSchema.properties,
    command: attachedCommandSchema,
  },
  required: ['command'],
});

export function buildAttachedWorkspaceBashDescription(enableToolOutputReferences: boolean): string {
  return enableToolOutputReferences
    ? `${ATTACHED_WORKSPACE_BASH_DESCRIPTION}\n\n${BashToolOutputReferencesGuide}`
    : ATTACHED_WORKSPACE_BASH_DESCRIPTION;
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function commandWithArguments(command: string, args: string[] | undefined): string {
  if (!args?.length) return command;
  return `bash -c ${quoteShellArgument(command)} -- ${args.map(quoteShellArgument).join(' ')}`;
}

function commandWithGitIdentity(
  command: string,
  identity: AgentGitIdentity | null | undefined,
): string {
  if (identity == null) return command;
  const name = identity.name.trim();
  const email = identity.email.trim();
  if (
    name.length === 0 ||
    name.length > 128 ||
    email.length === 0 ||
    email.length > 254 ||
    /[\0\r\n]/.test(name) ||
    /[\0\r\n]/.test(email)
  ) {
    throw new Error('Invalid agent Git identity');
  }
  return `export GIT_AUTHOR_NAME=${quoteShellArgument(name)} GIT_AUTHOR_EMAIL=${quoteShellArgument(email)} GIT_COMMITTER_NAME=${quoteShellArgument(name)} GIT_COMMITTER_EMAIL=${quoteShellArgument(email)}; ${command}`;
}

function formatCommandResult(result: WorkspaceExecuteCommandResult): string {
  let output = '';
  if (result.stdout.length > 0) output += `stdout:\n${result.stdout}\n`;
  if (result.stderr.length > 0) output += `stderr:\n${result.stderr}\n`;
  if (output.length === 0) output = 'Command completed with no output.\n';
  if (result.exitCode != null) output += `[exit code: ${result.exitCode}]`;
  if (result.signal != null) output += `[terminated by ${result.signal}]`;
  if (result.timedOut) output += '[timed out]';
  if (result.truncated) output += '[output truncated]';
  return output;
}

export function createAttachedWorkspaceBashTool({
  baseUrl,
  authHeaders,
  workspaceId = DEFAULT_WORKSPACE_ID,
  gitIdentity,
  fetchImpl,
}: {
  baseUrl: string;
  authHeaders: () => Promise<Record<string, string>> | Record<string, string>;
  workspaceId?: string;
  gitIdentity?: AgentGitIdentity | null;
  fetchImpl?: CodeBridgeFetch;
}): DynamicStructuredTool {
  return tool(
    async (
      rawInput: { command: string; args?: string[]; intent?: string },
      config,
    ): Promise<[string, Record<string, never>]> => {
      const command = commandWithGitIdentity(
        commandWithArguments(rawInput.command, rawInput.args),
        gitIdentity,
      );
      const result = await executeWorkspaceTool({
        baseURL: baseUrl,
        authHeaders: await authHeaders(),
        request: {
          protocolVersion: 1,
          operation: 'execute_command',
          workspaceId,
          command,
          maxOutputBytes: DEFAULT_OUTPUT_BYTES,
        },
        signal: config?.signal,
        fetchImpl,
      });
      if (result.operation !== 'execute_command') {
        throw new Error('Attached workspace returned an unexpected command result.');
      }
      return [formatCommandResult(result), {}];
    },
    {
      name: BashExecutionToolDefinition.name,
      description: ATTACHED_WORKSPACE_BASH_DESCRIPTION,
      schema: structuredClone(ATTACHED_WORKSPACE_BASH_SCHEMA),
      responseFormat: 'content_and_artifact',
    },
  ) as unknown as DynamicStructuredTool;
}
