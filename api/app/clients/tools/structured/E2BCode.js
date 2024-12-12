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
    logger.debug(
      '[E2BCode] Initialized with API key ' + `*****${keySuffix}`
    );

    this.name = 'E2BCode';
    this.description =
      'Use E2B to execute code, shell commands, manage files, and install packages in an isolated sandbox environment. **Important:** You must provide a unique `sessionId` string to maintain session state between calls.';

    this.schema = z.object({
      sessionId: z
        .string()
        .min(1)
        .describe(
          'A unique identifier for the session. Use the same `sessionId` to maintain state across multiple calls.'
        ),
      action: z
        .enum(['execute', 'shell', 'write_file', 'read_file', 'install'])
        .describe(
          'The action to perform: execute code, run shell command, write file, read file, or install package.'
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
        .describe('Shell command to execute (required for `shell` action).'),
      filePath: z
        .string()
        .optional()
        .describe(
          'Path where to read/write file (required for file operations).'
        ),
      fileContent: z
        .string()
        .optional()
        .describe(
          'Content to write to file (required for `write_file` action).'
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
    } = input;

    if (!sessionId) {
      logger.error('[E2BCode] `sessionId` is missing in the input');
      throw new Error('`sessionId` is required to maintain session state.');
    }

    logger.debug('[E2BCode] Processing request', {
      action,
      language,
      sessionId,
      hasCode: !!code,
      hasCommand: !!command,
      hasFilePath: !!filePath,
    });

    try {
      const sandbox = await this.getSandbox(sessionId);
      logger.debug('[E2BCode] Sandbox retrieved/created for session', {
        sessionId,
      });

      switch (action) {
        case 'execute':
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

        case 'write_file':
          if (!filePath || !fileContent) {
            logger.error(
              '[E2BCode] Missing parameters for write_file action',
              {
                sessionId,
                hasFilePath: !!filePath,
                hasContent: !!fileContent,
              }
            );
            throw new Error(
              '`filePath` and `fileContent` are required for `write_file` action.'
            );
          }
          logger.debug('[E2BCode] Writing file', { sessionId, filePath });
          await sandbox.files.write(filePath, fileContent);
          logger.debug('[E2BCode] File written successfully', {
            sessionId,
            filePath,
          });
          return JSON.stringify({
            sessionId,
            success: true,
            message: `File written to ${filePath}`,
          });

        case 'read_file':
          if (!filePath) {
            logger.error(
              '[E2BCode] `filePath` missing for read_file action',
              { sessionId }
            );
            throw new Error('`filePath` is required for `read_file` action.');
          }
          logger.debug('[E2BCode] Reading file', { sessionId, filePath });
          const content = await sandbox.files.read(filePath);
          logger.debug('[E2BCode] File read successfully', {
            sessionId,
            filePath,
          });
          return JSON.stringify({
            sessionId,
            content: content.toString(),
            success: true,
          });

        case 'install':
          if (!code) {
            logger.error(
              '[E2BCode] Package name missing for install action',
              {
                sessionId,
                language,
              }
            );
            throw new Error('Package name is required for `install` action.');
          }
          logger.debug('[E2BCode] Installing package', {
            sessionId,
            language,
            package: code,
          });

          if (language === 'python') {
            const pipResult = await sandbox.commands.run(
              `pip install ${code}`
            );
            logger.debug(
              '[E2BCode] Python package installation completed',
              {
                sessionId,
                success: pipResult.exitCode === 0,
              }
            );
            return JSON.stringify({
              sessionId,
              success: pipResult.exitCode === 0,
              output: pipResult.stdout,
              error: pipResult.stderr,
            });
          } else if (language === 'javascript' || language === 'typescript') {
            const npmResult = await sandbox.commands.run(
              `npm install ${code}`
            );
            logger.debug(
              '[E2BCode] Node package installation completed',
              {
                sessionId,
                success: npmResult.exitCode === 0,
              }
            );
            return JSON.stringify({
              sessionId,
              success: npmResult.exitCode === 0,
              output: npmResult.stdout,
              error: npmResult.stderr,
            });
          }
          logger.error(
            '[E2BCode] Unsupported language for package installation',
            { sessionId, language }
          );
          throw new Error(
            `Unsupported language for package installation: ${language}`
          );

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

  // Method to get or create a sandbox based on sessionId
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