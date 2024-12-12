const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { Sandbox } = require('@e2b/code-interpreter');
const { logger } = require('~/config');

// Store active sandboxes with their session IDs
const sandboxes = new Map();

class E2BCode extends Tool {
  constructor(fields = {}) {
    super();

    const envVar = 'E2B_API_KEY';
    const override = fields.override ?? false;
    this.apiKey = fields.apiKey ?? this.getApiKey(envVar, override);

    const keySuffix = this.apiKey ? this.apiKey.slice(-5) : 'none';
    logger.debug('[E2BCode] Initialized with API key ' + `*****${keySuffix}`);

    this.name = 'E2BCode';
    this.description =
      'Use E2B to execute code, manage sandboxes, run shell commands, manage files, install packages, and more in an isolated sandbox environment. **Important:** You must provide a unique `sessionId` string to maintain session state between calls.';

    this.schema = z.object({
      sessionId: z
        .string()
        .min(1)
        .optional()
        .describe(
          'A unique identifier for the session. Use the same `sessionId` to maintain state across multiple calls. Required for most actions except `list_sandboxes` and `kill_sandbox`.'
        ),
      action: z
        .enum([
          'execute',
          'shell',
          'write_file',
          'read_file',
          'install',
          'get_public_url',
          'connect_command',
          'kill_command',
          'list_commands',
          'run_command',
          'send_stdin',
          'create_pty',
          'kill_pty',
          'resize_pty',
          'send_input_pty',
          'list_sandboxes',
          'kill_sandbox',
          'set_timeout',
          'download_url',
        ])
        .describe(
          'The action to perform: execute code, run shell command, write file, read file, install package, manage sandboxes, and more.'
        ),
      code: z
        .string()
        .optional()
        .describe(
          'The code to execute or package to install (required for `execute` and `install` actions).'
        ),
      language: z
        .enum(['python', 'javascript', 'typescript', 'shell'])
        .optional()
        .describe('The programming language to use. Defaults to `python`.'),
      command: z
        .string()
        .optional()
        .describe(
          'Command to execute (required for `shell` and `run_command` actions).'
        ),
      filePath: z
        .string()
        .optional()
        .describe('Path where to read/write file (required for file operations).'),
      fileContent: z
        .string()
        .optional()
        .describe(
          'Content to write to file (required for `write_file` action).'
        ),
      port: z
        .number()
        .optional()
        .describe(
          'The port number for which to retrieve the public URL (required for `get_public_url` action).'
        ),
      pid: z
        .number()
        .optional()
        .describe(
          'The process ID (required for process-specific actions like `kill_command`, `send_stdin`, `kill_pty`, `resize_pty`, `send_input_pty`).'
        ),
      data: z
        .string()
        .optional()
        .describe(
          'Data to send to stdin or PTY (required for `send_stdin` and `send_input_pty` actions).'
        ),
      size: z
        .object({
          cols: z.number(),
          rows: z.number(),
        })
        .optional()
        .describe(
          'New size for the PTY (required for `resize_pty` action).'
        ),
      background: z
        .boolean()
        .optional()
        .describe(
          'Whether to run the command in the background (optional for `run_command` action).'
        ),
      envs: z
        .record(z.string())
        .optional()
        .describe(
          'Environment variables for the command (optional for `run_command` and `create_pty` actions).'
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          'Working directory for the command (optional for `run_command` and `create_pty` actions).'
        ),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          'Custom timeout in milliseconds (required for `set_timeout` action).'
        ),
      sandboxId: z
        .string()
        .optional()
        .describe(
          'The ID of the sandbox to act upon (required for `kill_sandbox` action).'
        ),
      path: z
        .string()
        .optional()
        .describe(
          'Path to the file for which to get a download URL (required for `download_url` action).'
        ),
    });
  }

  getApiKey(envVar, override) {
    const key = getEnvironmentVariable(envVar);
    if (!key && !override) {
      logger.error(`[E2BCode] Missing ${envVar} environment variable`);
      throw new Error(`Missing ${envVar} environment variable.`);
    }
    return key;
  }

  async _call(input) {
    const {
      sessionId,
      code,
      language = 'python',
      action,
      command,
      filePath,
      fileContent,
      port,
      pid,
      data,
      size,
      background = false,
      envs = {},
      cwd,
      timeoutMs,
      sandboxId,
      path,
    } = input;

    logger.debug('[E2BCode] Processing request', {
      action,
      sessionId,
      sandboxId,
    });

    try {
      let sandbox;

      // Handle actions that do not require a sessionId
      if (['list_sandboxes', 'kill_sandbox'].includes(action)) {
        switch (action) {
          case 'list_sandboxes':
            logger.debug('[E2BCode] Listing sandboxes');
            const sandboxList = await Sandbox.list({ apiKey: this.apiKey });
            logger.debug('[E2BCode] Sandboxes retrieved', {
              count: sandboxList.length,
            });
            return JSON.stringify({
              success: true,
              sandboxes: sandboxList,
            });

          case 'kill_sandbox':
            if (!sandboxId) {
              logger.error('[E2BCode] `sandboxId` is missing for kill_sandbox action');
              throw new Error('`sandboxId` is required for `kill_sandbox` action.');
            }
            logger.debug('[E2BCode] Killing sandbox', { sandboxId });
            const killResult = await Sandbox.kill(sandboxId, { apiKey: this.apiKey });
            logger.debug('[E2BCode] Sandbox killed', {
              sandboxId,
              success: killResult,
            });
            return JSON.stringify({
              success: killResult,
              message: killResult
                ? `Sandbox with ID ${sandboxId} killed`
                : `Sandbox with ID ${sandboxId} not found`,
            });
        }
      } else {
        // For actions that require a sandbox
        if (!sessionId) {
          logger.error(
            '[E2BCode] `sessionId` is missing in the input for action requiring a sandbox'
          );
          throw new Error('`sessionId` is required to maintain session state.');
        }

        sandbox = await this.getSandbox(sessionId);
        logger.debug('[E2BCode] Sandbox retrieved/created for session', {
          sessionId,
        });
      }

      switch (action) {
        // Include existing actions here (execute, shell, etc.)
        case 'execute':
          // ... existing 'execute' action code ...
          if (!code) {
            logger.error('[E2BCode] Code missing for execute action', {
              sessionId,
            });
            throw new Error('Code is required for `execute` action.');
          }
          logger.debug('[E2BCode] Executing code', { language, sessionId });
          const result = await sandbox.runCode(code, { language });
          logger.debug('[E2BCode] Code execution completed', {
            sessionId,
            hasError: !!result.error,
          });
          return JSON.stringify({
            sessionId,
            output: result.text,
            logs: result.logs,
            error: result.error,
          });

        case 'shell':
          // ... existing 'shell' action code ...
          if (!command) {
            logger.error('[E2BCode] Command missing for shell action', {
              sessionId,
            });
            throw new Error('Command is required for `shell` action.');
          }
          logger.debug('[E2BCode] Executing shell command', {
            sessionId,
            command,
          });
          const shellResult = await sandbox.commands.run(command);
          logger.debug('[E2BCode] Shell command completed', {
            sessionId,
            exitCode: shellResult.exitCode,
          });
          return JSON.stringify({
            sessionId,
            output: shellResult.stdout,
            error: shellResult.stderr,
            exitCode: shellResult.exitCode,
          });

        // ... include other existing actions (write_file, read_file, etc.) ...

        case 'set_timeout':
          if (timeoutMs === undefined) {
            logger.error('[E2BCode] `timeoutMs` is missing for set_timeout action', {
              sessionId,
            });
            throw new Error('`timeoutMs` is required for `set_timeout` action.');
          }
          logger.debug('[E2BCode] Setting sandbox timeout', {
            sessionId,
            timeoutMs,
          });
          await sandbox.setTimeout(timeoutMs);
          logger.debug('[E2BCode] Sandbox timeout set', { sessionId, timeoutMs });
          return JSON.stringify({
            sessionId,
            success: true,
            message: `Sandbox timeout set to ${timeoutMs} milliseconds`,
          });

        case 'download_url':
          if (!path) {
            logger.error('[E2BCode] `path` is missing for download_url action', {
              sessionId,
            });
            throw new Error('`path` is required for `download_url` action.');
          }
          logger.debug('[E2BCode] Getting download URL', { sessionId, path });
          const downloadUrl = sandbox.downloadUrl(path);
          logger.debug('[E2BCode] Download URL retrieved', {
            sessionId,
            downloadUrl,
          });
          return JSON.stringify({
            sessionId,
            success: true,
            downloadUrl,
          });

        // ... include other actions as previously implemented ...

        default:
          logger.error('[E2BCode] Unknown action requested', {
            sessionId,
            action,
          });
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error('[E2BCode] Error during execution', {
        sessionId,
        action,
        error: error.message,
      });
      return JSON.stringify({
        sessionId,
        error: error.message,
        success: false,
      });
    }
  }

  async getSandbox(sessionId) {
    if (sandboxes.has(sessionId)) {
      logger.debug('[E2BCode] Reusing existing sandbox', { sessionId });
      const sandboxInfo = sandboxes.get(sessionId);
      sandboxInfo.lastAccessed = Date.now();
      await sandboxInfo.sandbox.setTimeout(5 * 60 * 1000); // Reset timeout to 5 minutes
      return sandboxInfo.sandbox;
    }

    logger.debug('[E2BCode] Creating new sandbox', {
      sessionId,
      currentSandboxCount: sandboxes.size,
    });

    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs: 5 * 60 * 1000, // 5-minute timeout
    });

    sandboxes.set(sessionId, {
      sandbox,
      lastAccessed: Date.now(),
    });

    return sandbox;
  }
}

// Function to clean up inactive sandboxes
async function cleanupInactiveSandboxes() {
  const now = Date.now();
  logger.debug('[E2BCode] Starting sandbox cleanup');

  for (const [sessionId, { sandbox, lastAccessed }] of sandboxes.entries()) {
    if (now - lastAccessed > 10 * 60 * 1000) {
      logger.debug('[E2BCode] Cleaning up inactive sandbox', {
        sessionId,
        inactiveDuration: `${Math.floor((now - lastAccessed) / 1000)}s`,
      });
      try {
        await sandbox.kill();
      } catch (err) {
        logger.error('[E2BCode] Error killing sandbox', {
          sessionId,
          error: err.message,
        });
      }
      sandboxes.delete(sessionId);
    }
  }

  logger.debug('[E2BCode] Sandbox cleanup completed', {
    remainingSandboxes: sandboxes.size,
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupInactiveSandboxes, 5 * 60 * 1000);

module.exports = E2BCode;