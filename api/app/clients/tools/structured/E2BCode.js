const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { Sandbox } = require('@e2b/code-interpreter');
const { logger } = require('~/config');
const fs = require('fs');
const YAML = require('yaml');
const { createSandbox, findSandboxById, deleteSandboxBySessionId, getActiveSandboxes, setTimeoutForSandbox } = require('../../../../models/Sandbox');
const MAX_OUTPUT_LENGTH = 10000; // 10k characters
const MAX_TAIL_LINES = 20;
const MAX_TAIL_BYTES = 2000; // ~2KB

// Store active sandboxes with their session IDs
const sandboxes = (global.sandboxes = global.sandboxes || new Map());

class E2BCode extends Tool {
  constructor(fields = {}) {
    super();
    const envVar = 'E2B_API_KEY';
    const override = fields.override ?? false;
    this.userId = fields.userId;
    // Attempt to get or validate the API key
    const maybeKey = this.getApiKey(envVar, override);

    // If getApiKey returned an error in JSON format, store it; otherwise it's a valid key
    if (typeof maybeKey === 'string' && maybeKey.startsWith('{') && maybeKey.endsWith('}')) {
      // It's the JSON error object returned from getApiKey
      this.apiKey = null;
      this.apiKeyErrorJSON = maybeKey;
    } else {
      this.apiKey = maybeKey;
      this.apiKeyErrorJSON = null;
    }

    const keySuffix = this.apiKey ? this.apiKey.slice(-5) : 'none';
    logger.debug('[E2BCode] Initialized with API key ' + `*****${keySuffix}`);

    const fs = require('fs');
    const YAML = require('yaml');

    // Potential paths to check
    const potentialPaths = [
      '/app/e2btemplates.yml',
      '/workspaces/e2btemplates.yml',
      '/app/e2btemplates.yaml',
      '/workspaces/e2btemplates.yaml',
    ];

    let loadedTemplates = [];

    try {
      // Log every path we check
      for (const p of potentialPaths) {
        logger.debug(`[E2BCode][DEBUG] Checking file existence for: ${p}`);
        // If you see these logs in the output, you know the loop is running
        const doesExist = fs.existsSync(p);
        logger.debug(`[E2BCode][DEBUG] existsSync result for ${p}: ${doesExist}`);
      }

      // Find the first path that actually exists
      const yamlPath = potentialPaths.find((p) => fs.existsSync(p));
      logger.debug(`[E2BCode][DEBUG] Found path: ${yamlPath}`);

      if (yamlPath) {
        // Optional: check read permissions
        // fs.accessSync(yamlPath, fs.constants.R_OK);

        logger.debug(`[E2BCode] Attempting to read file at: ${yamlPath}`);
        const file = fs.readFileSync(yamlPath, 'utf8');

        logger.debug(`[E2BCode] Parsing YAML data...`);
        loadedTemplates = YAML.parse(file);

        logger.debug(`[E2BCode] Successfully loaded template data from ${yamlPath}`);
        // Optional: log the parsed templates to verify they look correct
        logger.debug('[E2BCode] loadedTemplates:', JSON.stringify(loadedTemplates, null, 2));
      } else {
        logger.debug(
          '[E2BCode] No e2btemplates.yml or e2btemplates.yaml found; skipping template load',
        );
      }
    } catch (err) {
      logger.warn('[E2BCode] Error loading e2btemplates.yml or e2btemplates.yaml:', err);
    }

    // Store in `this.loadedTemplates` (or however you’re managing state)
    this.loadedTemplates = loadedTemplates;

    this.name = 'E2BCode';
    this.description = `
    Use E2B to execute code, run shell commands, manage files, install packages, and manage sandbox environments in an isolated sandbox environment.

    YOU CANNOT RUN MORE THAN 25 COMMANDS SEQUENTIALLY WITHOUT OUTPUT TO THE USER!

    Sessions: You must provide a unique \`sessionId\` string to maintain session state between calls. Use the same \`sessionId\` for related actions.

    Use the help action before executing anything else to understand the available actions and parameters. Before you run a command for the first
    time, use the help action for that command to understand the parameters required for that action.

    To copy files from one sandbox to another is to gzip them, then use the get_download_url action to get a link,
    and then use wget on the new sandbox to download.
    `;

    this.schema = z.object({
      sessionId: z
        .string()
        .optional()
        .describe(
          'A unique identifier for the session. Use the same `sessionId` to maintain state across multiple calls.',
        ),
      sandboxId: z
        .string()
        .optional()
        .describe(
          'The sandbox ID to use for the kill_sandbox action. If not provided, the sandbox associated with the `sessionId` will be used.',
        ),
      action: z
        .enum([
          'help',
          'create',
          'list_sandboxes',
          'kill',
          'set_timeout',
          'shell',
          'kill_command',
          'write_file',
          'read_file',
          'install',
          'get_file_downloadurl',
          'get_host',
          'command_run',
          'start_server',
          'command_list',
          'command_kill',
          'processinfo',
          'system_install',
          // New action for listing templates from the optional YAML file
          'list_templates',
        ])
        .describe('The action to perform.'),
      template: z
        .string()
        .optional()
        .describe(
          'Sandbox template name or ID to create the sandbox from (used with `create` action).',
        ),
      language: z
        .enum(['python', 'javascript', 'typescript', 'shell'])
        .optional()
        .describe('The programming language environment for installs. Defaults to `python`.'),
      cmd: z
        .string()
        .optional()
        .describe(
          'Command to execute (used with `shell`, `command_run` and `start_server` actions).',
        ),
      background: z
        .boolean()
        .optional()
        .describe(
          'Whether to run the command in the background (for `command_run`, `shell` actions). Defaults to `false`.',
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          'Working directory for the command (used with `command_run` and `start_server` actions).',
        ),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .default(60 * 1000)
        .optional()
        .describe(
          'Timeout in milliseconds for the command (used with `command_run` and `start_server` actions).',
        ),
      user: z
        .string()
        .optional()
        .describe(
          'User to run the command as (used with `command_run` and `start_server` actions).',
        ),
      commandId: z
        .string()
        .optional()
        .describe('The ID of the background command to kill (required for `kill_command` action).'),
      filePath: z
        .string()
        .optional()
        .describe(
          'Path for read/write operations (used with `write_file`, `read_file`, and `get_file_downloadurl` actions).',
        ),
      fileContent: z
        .string()
        .optional()
        .describe('Content to write to file (required for `write_file` action).'),
      port: z
        .number()
        .int()
        .optional()
        .describe(
          'Port number to use for the host (used with `get_host` and `start_server` actions).',
        ),
      logFile: z
        .string()
        .optional()
        .describe(
          'Path to the log file where stdout and stderr will be redirected (required for `start_server` action).',
        ),
      timeout: z
        .number()
        .int()
        .optional()
        .default(60)
        .describe('Timeout in minutes for the sandbox environment. Defaults to 60 minutes.'),
      envs: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Environment variables to set when creating the sandbox (used with `create` action) and for other actions that run commands.',
        ),
      command_name: z
        .string()
        .optional()
        .describe(
          'The name of the command to get detailed help about (used with the `help` action).',
        ),
      pid: z
        .number()
        .int()
        .optional()
        .describe(
          'Process ID of the command to kill (required for `command_kill` action) or get info (required for `processinfo` action).',
        ),
      packages: z
        .array(z.string())
        .optional()
        .describe(
          'List of packages to install (used with `install` and `system_install` actions).',
        ),
    });
  }

  /**
   * Helper to both log an error and return a JSON error to the LLM,
   * including a hint to use the 'help' action.
   */
  errorResponse(sessionId, errorMessage, context = {}) {
    logger.error('[E2BCode] ' + errorMessage, context);
    return JSON.stringify({
      // If sessionId is falsy, default to empty string
      sessionId: sessionId || '',
      error: errorMessage,
      success: false,
      helpHint: "You can use the 'help' action to learn how to properly use a specific action.",
    });
  }

  /**
   * Attempts to read API Key from environment variable. If not found, returns
   * a JSON error string so that the constructor knows there's no valid API key.
   */
  getApiKey(envVar, override) {
    const key = getEnvironmentVariable(envVar);
    if (!key && !override) {
      // We don't have a sessionId in the constructor, so just pass ''
      return this.errorResponse('', `Missing ${envVar} environment variable`);
    }
    return key;
  }

  // Method to retrieve hidden environment variables starting with E2B_CODE_EV_
  getHiddenEnvVars() {
    const hiddenEnvVars = {};
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('E2B_CODE_EV_')) {
        hiddenEnvVars[key.substring('E2B_CODE_EV_'.length)] = process.env[key];
      }
    });
    return hiddenEnvVars;
  }

  // If the output is too large, return an error message and the last 20 lines (up to 2KB).
  safeReturn(obj) {
    let str = JSON.stringify(obj);
    if (str.length > MAX_OUTPUT_LENGTH) {
      // Extract last 20 lines of the JSON output (based on newline).
      const lines = str.split('\n');
      const tailLines = lines.slice(-MAX_TAIL_LINES).join('\n');

      // Truncate to 2KB if needed
      let truncated = tailLines;
      if (Buffer.byteLength(truncated, 'utf8') > MAX_TAIL_BYTES) {
        truncated = truncated.slice(0, 2000);
      }

      // Return error message with truncated output
      return JSON.stringify({
        error:
          'Output too long. We are truncating the output. If you need more, please rerun the command and redirect the output to a log file that you can tail if needed.',
        truncated_tail: truncated,
        success: false,
        helpHint: "You can use the 'help' action to learn how to properly use a specific action.",
      });
    }
    return str;
  }

  getDetailedHelp(commandName) {
    const helpTexts = {
      help: `
      Returns information about every possible action that can be performed using the E2BCode tool.
      `,
      create: `
  **create**
  
  - **Description:** Create a new E2B sandbox environment from a template.
  
  - **Required Parameters:**
    - \`sessionId\`: A unique identifier for the session. Use the same \`sessionId\` to maintain state across multiple calls.
  
  - **Optional Parameters:**
    - \`template\`: The sandbox template name or ID to create the environment from.
    - \`timeout\`: Timeout in minutes for the sandbox environment. Defaults to 60 minutes.
    - \`envs\`: A key-value object of environment variables to set when creating the sandbox.
  `,
      list_sandboxes: `
  **list_sandboxes**
  
  - **Description:** List all active E2B sandboxes for the current session.
  
  - **Parameters:** None (include \`sessionId\` for consistency).
  `,
      kill: `
  **kill**
  
  - **Description:** Terminate the E2B sandbox environment associated with the provided \`sessionId\` or \`sandboxId\`.
  
  - **Required Parameters:**
    - Either \`sessionId\` or \`sandboxId\` must be provided. If both are provided \`sandboxId\` will take precedence.
  `,
      set_timeout: `
  **set_timeout**
  
  - **Description:** Update the timeout for the sandbox environment to keep it alive for the specified duration.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`timeout\`: Timeout in minutes for the sandbox environment.
  `,
      shell: `
  **shell**
  
  - **Description:** Run a shell command inside the sandbox environment.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`cmd\`: The shell command to execute.
  
  - **Optional Parameters:**
    - \`background\`: Whether to run the shell command in the background. Boolean value; defaults to \`false\`.
    - \`envs\`: Environment variables to set for this execution.
  `,
      kill_command: `
  **kill_command**
  
  - **Description:** Terminate a background shell command that was previously started.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`commandId\`: The ID of the background command to kill.
  `,
      write_file: `
  **write_file**
  
  - **Description:** Write content to a file in the sandbox environment.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`filePath\`: The path to the file where content will be written.
    - \`fileContent\`: The content to write to the file.
  `,
      read_file: `
  **read_file**
  
  - **Description:** Read the content of a file from the sandbox environment.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`filePath\`: The path to the file to read.
  `,
      install: `
  **install**
  
  - **Description:** Install python or node packages within the sandbox environment.
  Use \`system_install\` for system packages.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`packages\`: An array of package names to install.
  
  - **Optional Parameters:**
    - \`language\`: The environment to use (\`python\` uses pip, \`javascript\` or \`typescript\` use npm). Defaults to \`python\`.
    - \`envs\`: Environment variables to set for this installation.
  `,
      get_file_downloadurl: `
  **get_file_downloadurl**
  
  - **Description:** Obtain a download URL for a file in the sandbox environment.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`filePath\`: The path to the file for which to generate a download URL.
  `,
      get_host: `
  **get_host**
  
  - **Description:** Retrieve the host and port information for accessing services running inside the sandbox.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`port\`: The port number that the service is running on inside the sandbox.
  `,
      command_run: `
  **command_run**
  
  - **Description:** Start a new command and wait until it finishes executing, or run it in the background.
  Use this for running most commands that do not require a PTY session.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`cmd\`: The command to execute.
  
  - **Optional Parameters:**
    - \`background\`: Whether to run the command in the background. Defaults to \`false\`.
    - \`cwd\`: Working directory for the command.
    - \`timeoutMs\`: Timeout in milliseconds for the command.
    - \`user\`: User to run the command as.
    - \`envs\`: Environment variables to set for this command.
  `,
      start_server: `
  **start_server**
  
  - **Description:** Start a server process (e.g., nginx, flask) in the sandbox environment by executing a command in the background, 
  redirecting stdout and stderr to a specified log file, and returning the host and port information for accessing the server.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`cmd\`: The command to execute to start the server.
    - \`port\`: The port number on which the server is expected to listen inside the sandbox.
    - \`logFile\`: The path to the log file where stdout and stderr will be redirected.
  
  - **Optional Parameters:**
    - \`cwd\`: Working directory for the command.
    - \`timeoutMs\`: Timeout in milliseconds for the command.
    - \`user\`: User to run the command as.
    - \`envs\`: Environment variables to set for this execution.
  
  - **Returns:**
    - \`sessionId\`: The session ID.
    - \`commandId\`: The ID of the background command started.
    - \`host\`: The host address to access the server.
    - \`logFile\`: The location of the log file.
    - \`message\`: Confirmation message of server start and log file location.
  `,
      command_list: `
  **command_list**
  
  - **Description:** List all running commands and PTY sessions within the sandbox environment.
  
  - **Required Parameters:**
    - \`sessionId\`
  `,
      command_kill: `
  **command_kill**
  
  - **Description:** Kill a running command specified by its process ID.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`pid\`: Process ID of the command to kill.
  `,
      processinfo: `
  **processinfo**
  
  - **Description:** Get detailed information about a running command specified by its process ID.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`pid\`: Process ID of the command to get information about.
  `,
      system_install: `
  **system_install**
  
  - **Description:** Install system packages within the sandbox environment using \`sudo apt-get install\`.
  
  - **Required Parameters:**
    - \`sessionId\`
    - \`packages\`: An array of system package names to install.
  
  - **Optional Parameters:**
    - \`envs\`: Environment variables to set for this installation.
  `,
      list_templates: `
  **list_templates**
  
  - **Description:** Lists all available sandbox templates from an optional YAML file at /app/e2btemplates.yaml.
  
  - **Parameters:** None
  `,
    };

    return helpTexts[commandName];
  }

  /**
   * Main method that handles all requests.
   * Whenever `logger.error` occurs, we call `errorResponse` and return immediately.
   */
  async _call(input) {
    // If the constructor already encountered a missing API key, return that error immediately
    if (this.apiKeyErrorJSON) {
      return this.apiKeyErrorJSON;
    }

    const {
      sessionId,
      sandboxId,
      packages,
      language = 'python',
      action,
      cmd,
      background = false,
      cwd,
      timeoutMs = 30 * 1000,
      user,
      commandId,
      filePath,
      fileContent,
      port,
      timeout = 60 * 60,
      envs,
      command_name,
      logFile,
      pid,
      template,
    } = input;
    // sessionId check for most actions (exclude those that don't need a sessionId)
    if (
      action !== 'help' &&
      action !== 'list_sandboxes' &&
      action !== 'create' &&
      action !== 'list_templates' && // allow listing templates without sessionId
      !sessionId
    ) {
      return this.errorResponse(sessionId || '', '`sessionId` is required for most actions', {
        action,
      });
    }

    let adjustedTimeoutMs = timeoutMs < 1000 ? 1000 : timeoutMs;
    let adjustedTimeout = timeout < 1 ? 1 : timeout;

    logger.debug('[E2BCode] Processing request', {
      action,
      language,
      sessionId,
    });

    // ------ ACTION SWITCH ------
    switch (action) {
      case 'help':
        if (command_name) {
          const detailedHelp = this.getDetailedHelp(command_name.trim());
          if (detailedHelp) {
            return JSON.stringify({ message: detailedHelp });
          } else {
            return JSON.stringify({
              message: `No detailed help available for command '${command_name}'.`,
            });
          }
        } else {
          const commandList = [
            'help',
            'create',
            'list_sandboxes',
            'kill',
            'set_timeout',
            'shell',
            'kill_command',
            'write_file',
            'read_file',
            'install',
            'system_install',
            'get_file_downloadurl',
            'get_host',
            'command_run',
            'start_server',
            'command_list',
            'command_kill',
            'processinfo',
            'list_templates',
          ];
          const overview = `Available actions: ${commandList.join(', ')}. Use 'help' with a command name to get detailed help about a specific command. You are HIGHLY encouraged to run help for system_install, command_run, shell and start_server to understand the differences between them and how to use them.`;
          return JSON.stringify({ message: overview });
        }

      case 'list_templates':
        logger.debug('[E2BCode] Listing available templates from config');
        if (!this.loadedTemplates || this.loadedTemplates.length === 0) {
          return JSON.stringify({
            message: 'No templates found or no config file present.',
            templates: [],
          });
        }
        return JSON.stringify({
          message: 'Available templates loaded from from config',
          templates: this.loadedTemplates,
        });

      case 'create': {
        // If we already have a sandbox for this session, that's an error
        if (sessionId && sandboxes.has(sessionId)) {
          return this.errorResponse(
            sessionId || '',
            `Sandbox with sessionId ${sessionId} already exists.`,
          );
        }

        logger.debug('[E2BCode] Creating new sandbox', {
          sessionId,
          timeout: adjustedTimeout,
        });

        const sandboxCreateOptions = {
          apiKey: this.apiKey,
          timeoutMs: adjustedTimeout * 60 * 1000,
        };

        // Merge hidden env vars with any provided envs, but do NOT expose hidden to the LLM
        const hiddenEnvVarsCreate = this.getHiddenEnvVars();
        if (Object.keys(hiddenEnvVarsCreate).length > 0 || envs) {
          sandboxCreateOptions.env = {
            ...hiddenEnvVarsCreate,
            ...envs,
          };
        }

        let sandboxCreate;
        let skippedTemplate = false;

        // Try with template if provided
        if (template) {
          try {
            sandboxCreate = await Sandbox.create(template, sandboxCreateOptions);
          } catch (error) {
            // Attempt again without template
            try {
              sandboxCreate = await Sandbox.create(sandboxCreateOptions);
              skippedTemplate = true;
            } catch (error2) {
              return this.errorResponse(
                sessionId || '',
                `Error creating sandbox: ${error2.message}`,
                { error: error2.message },
              );
            }
          }
        } else {
          // No template provided
          try {
            sandboxCreate = await Sandbox.create(sandboxCreateOptions);
          } catch (error) {
            return this.errorResponse(sessionId || '', `Error creating sandbox: ${error.message}`, {
              error: error.message,
            });
          }
        }

        sandboxes.set(sessionId, {
          sandbox: sandboxCreate,
          lastAccessed: Date.now(),
          commands: new Map(),
        });

        // Just show the user and current directory as a convenience
        const whoamiResult = await sandboxCreate.commands.run('whoami');
        const currentUser = whoamiResult.stdout.trim();

        const pwdResult = await sandboxCreate.commands.run('pwd');
        const currentDirectory = pwdResult.stdout.trim();

        const createdSandboxId = sandboxCreate.sandboxId;
        let message;
        if (!skippedTemplate) {
          message = `Sandbox created with sandboxId ${createdSandboxId} from template '${template}' with timeout ${adjustedTimeout} minutes.`;
        } else {
          message = `Sandbox created with sandboxId ${createdSandboxId} with timeout ${adjustedTimeout} minutes. There was an error attempting to use the template so none was used.`;
        }
        message += ` You are user ${currentUser} and current directory is ${currentDirectory}.`;
        await createSandbox(createdSandboxId, sessionId, this.userId, sandboxCreateOptions.timeoutMs);
        return JSON.stringify({
          sessionId,
          sandboxId: createdSandboxId,
          currentUser,
          currentDirectory,
          success: true,
          message,
        });
      }

      case 'list_sandboxes': {
        logger.debug('[E2BCode] Listing all active sandboxes');
        let sandboxesList;
        try {
          sandboxesList = await Sandbox.list({ apiKey: this.apiKey });
        } catch (error) {
          // Make sure we pass sessionId if we have it
          return this.errorResponse(sessionId || '', 'Error listing sandboxes: ' + error.message, {
            error: error.message,
          });
        }

        if (sandboxesList.length === 0) {
          logger.debug('[E2BCode] No active sandboxes found');
          return JSON.stringify({
            message: 'No active sandboxes found',
          });
        }

        const sandboxDetails = await Promise.all(
          sandboxesList.map(async (sandbox) => {
            const [id] = sandbox.sandboxId.split('-');
            const sandboxData = await findSandboxById(sandbox.sandboxId);
            if (sandboxData && sandboxData.userId === this.userId) {
              return {
                sandboxId: id,
                sessionId: sandboxData?.sessionId || undefined,
                userId: sandboxData?.userId || undefined,
                createdAt: sandbox.createdAt || sandboxData.createdAt || undefined,
                expiredAt: sandboxData.expiredAt || undefined,
                status: sandbox.status,
              };
            }
          }),
        );

        return JSON.stringify({
          message: 'Active sandboxes found',
          sandboxes: sandboxDetails,
        });
      }

      case 'kill': {
        let killSandboxId = sandboxId;
        if (!killSandboxId) {
          // Try to get it from sessionId
          if (sandboxes.has(sessionId)) {
            const sandboxInfo = sandboxes.get(sessionId);
            killSandboxId = sandboxInfo.sandbox.sandboxId;
          }
        }
        if (!killSandboxId) {
          return this.errorResponse(
            sessionId || '',
            'No sandboxId or sessionId provided. Cannot kill sandbox.',
            { sessionId },
          );
        }

        const [validSandboxId] = killSandboxId.split('-');
        logger.debug('[E2BCode] Killing sandbox', { sessionId, validSandboxId });

        let sandboxToKill;
        try {
          sandboxToKill = await Sandbox.connect(validSandboxId, {
            apiKey: this.apiKey,
          });
        } catch (error) {
          // If connect fails, we can still remove it from local map
          if (sandboxes.has(sessionId)) {
            sandboxes.delete(sessionId);
          }
          return this.errorResponse(
            sessionId || '',
            `No sandbox found with sandboxId ${validSandboxId} and sessionId ${sessionId}.`,
            { validSandboxId, error: error.message },
          );
        }

        try {
          await sandboxToKill.kill();
          await deleteSandboxBySessionId(sessionId);
        } catch (error) {
          if (sandboxes.has(sessionId)) {
            sandboxes.delete(sessionId);
          }
          return this.errorResponse(
            sessionId || '',
            `Failed to kill sandbox with sandboxId ${validSandboxId} and sessionId ${sessionId}.`,
            { validSandboxId, error: error.message },
          );
        }

        if (sandboxes.has(sessionId)) {
          sandboxes.delete(sessionId);
        }

        return JSON.stringify({
          sessionId,
          success: true,
          message: `Sandbox with sessionId ${sessionId} and sandboxId ${validSandboxId} has been killed.`,
        });
      }

      case 'set_timeout': {
        if (!sandboxes.has(sessionId)) {
          return this.errorResponse(
            sessionId || '',
            `No sandbox found with sessionId ${sessionId}.`,
          );
        }
        if (!timeout) {
          return this.errorResponse(
            sessionId || '',
            '`timeout` is required for `set_timeout` action.',
          );
        }

        logger.debug('[E2BCode] Setting sandbox timeout', {
          sessionId,
          timeout: adjustedTimeout,
        });
        const { sandbox: sandboxSetTimeout } = sandboxes.get(sessionId);
        await sandboxSetTimeout.setTimeout(adjustedTimeout * 60 * 1000);
        await setTimeoutForSandbox(sessionId, adjustedTimeout * 60 * 1000);
        return JSON.stringify({
          sessionId,
          success: true,
          message: `Sandbox timeout updated to ${adjustedTimeout} minutes.`,
        });
      }

      // ------ For all other actions, get the sandbox first ------
      default: {
        let sandboxInfo;
        try {
          sandboxInfo = await this.getSandboxInfo(sessionId);
        } catch (err) {
          // getSandboxInfo logs error; we just return error JSON
          return JSON.stringify({
            sessionId: sessionId || '',
            error: err.message,
            success: false,
            helpHint:
              "You can use the 'help' action to learn how to properly use a specific action.",
          });
        }

        const sandbox = sandboxInfo.sandbox;
        const hiddenEnvVars = this.getHiddenEnvVars();

        switch (action) {
          case 'shell': {
            if (!cmd) {
              return this.errorResponse(
                sessionId || '',
                'Command (cmd) is required for `shell` action.',
              );
            }
            logger.debug('[E2BCode] Executing shell command', {
              sessionId,
              cmd,
              background,
            });

            const shellOptions = {};
            if (Object.keys(hiddenEnvVars).length > 0 || envs) {
              shellOptions.envs = { ...hiddenEnvVars, ...envs };
            }

            if (background) {
              shellOptions.background = true;
              const backgroundCommand = await sandbox.commands.run(cmd, shellOptions);
              const cmdId = backgroundCommand.id;
              sandboxInfo.commands.set(cmdId, backgroundCommand);
              logger.debug('[E2BCode] Background command started', {
                sessionId,
                commandId: cmdId,
              });
              return JSON.stringify({
                sessionId,
                commandId: cmdId,
                success: true,
                message: `Background command started with ID ${cmdId}`,
              });
            } else {
              const shellResult = await sandbox.commands.run(cmd, shellOptions);
              logger.debug('[E2BCode] Shell command completed', {
                sessionId,
                exitCode: shellResult.exitCode,
              });
              return JSON.stringify({
                sessionId,
                output: shellResult.stdout,
                error: shellResult.stderr,
                exitCode: shellResult.exitCode,
                success: true,
              });
            }
          }

          case 'kill_command': {
            if (!commandId) {
              return this.errorResponse(
                sessionId || '',
                '`commandId` is required for `kill_command` action.',
              );
            }
            logger.debug('[E2BCode] Killing background command', {
              sessionId,
              commandId,
            });

            const commandToKill = sandboxInfo.commands.get(commandId);
            if (!commandToKill) {
              return this.errorResponse(
                sessionId || '',
                `No background command found with ID ${commandId}.`,
                { commandId },
              );
            }
            await commandToKill.kill();
            sandboxInfo.commands.delete(commandId);

            return JSON.stringify({
              sessionId,
              success: true,
              message: `Background command with ID ${commandId} has been killed.`,
            });
          }

          case 'write_file': {
            if (!filePath || !fileContent) {
              return this.errorResponse(
                sessionId || '',
                '`filePath` and `fileContent` are required for `write_file` action.',
                {
                  hasFilePath: !!filePath,
                  hasContent: !!fileContent,
                },
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
          }

          case 'read_file': {
            if (!filePath) {
              return this.errorResponse(
                sessionId || '',
                '`filePath` is required for `read_file` action.',
              );
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
          }

          case 'install': {
            if (!packages || packages.length === 0) {
              return this.errorResponse(
                sessionId || '',
                '`packages` array is required for `install` action.',
                { language },
              );
            }
            logger.debug('[E2BCode] Installing packages', {
              sessionId,
              language,
              packages,
            });

            const installOptions = {};
            if (Object.keys(hiddenEnvVars).length > 0 || envs) {
              installOptions.envs = { ...hiddenEnvVars, ...envs };
            }

            if (language === 'python') {
              const pipResult = await sandbox.commands.run(
                `pip install ${packages.join(' ')}`,
                installOptions,
              );
              return JSON.stringify({
                sessionId,
                success: pipResult.exitCode === 0,
                output: pipResult.stdout,
                error: pipResult.stderr,
              });
            } else if (language === 'javascript' || language === 'typescript') {
              const npmResult = await sandbox.commands.run(
                `npm install ${packages.join(' ')}`,
                installOptions,
              );
              return JSON.stringify({
                sessionId,
                success: npmResult.exitCode === 0,
                output: npmResult.stdout,
                error: npmResult.stderr,
              });
            } else {
              return this.errorResponse(
                sessionId || '',
                `Unsupported language for package installation: ${language}`,
              );
            }
          }

          case 'get_file_downloadurl': {
            if (!filePath) {
              return this.errorResponse(
                sessionId || '',
                '`filePath` is required for `get_file_downloadurl` action.',
              );
            }
            logger.debug('[E2BCode] Generating download URL for file', {
              sessionId,
              filePath,
            });
            const downloadUrl = await sandbox.downloadUrl(filePath);
            logger.debug('[E2BCode] Download URL generated', {
              sessionId,
              filePath,
              downloadUrl,
            });
            return JSON.stringify({
              sessionId,
              success: true,
              downloadUrl,
              message: `Download URL generated for ${filePath}`,
            });
          }

          case 'get_host': {
            if (!port) {
              return this.errorResponse(
                sessionId || '',
                '`port` is required for `get_host` action.',
              );
            }
            logger.debug('[E2BCode] Getting host+port', { sessionId, port });
            const host = await sandbox.getHost(port);
            logger.debug('[E2BCode] Host+port retrieved', { sessionId, host });

            return JSON.stringify({
              sessionId,
              host,
              port,
              message: `Host+port retrieved for port ${port}`,
              success: true,
            });
          }

          case 'system_install': {
            if (!packages || packages.length === 0) {
              return this.errorResponse(
                sessionId || '',
                '`packages` array is required for `system_install` action.',
              );
            }
            logger.debug('[E2BCode] Installing system packages', {
              sessionId,
              packages,
            });

            const aptGetInstallCommand = `sudo apt-get update && sudo apt-get install -y ${packages.join(' ')}`;
            const systemInstallOptions = {};
            if (Object.keys(hiddenEnvVars).length > 0 || envs) {
              systemInstallOptions.envs = { ...hiddenEnvVars, ...envs };
            }
            const aptGetResult = await sandbox.commands.run(
              aptGetInstallCommand,
              systemInstallOptions,
            );

            return JSON.stringify({
              sessionId,
              success: aptGetResult.exitCode === 0,
              output: aptGetResult.stdout,
              error: aptGetResult.stderr,
            });
          }

          case 'command_run': {
            if (!cmd) {
              return this.errorResponse(
                sessionId || '',
                '`cmd` is required for `command_run` action.',
              );
            }
            logger.debug('[E2BCode] Running command', {
              sessionId,
              cmd,
              background,
            });

            const commandOptions = {};
            if (background !== undefined) {
              commandOptions.background = background;
            }
            if (cwd) {
              commandOptions.cwd = cwd;
            }
            if (adjustedTimeoutMs) {
              commandOptions.timeoutMs = adjustedTimeoutMs;
            }
            if (user) {
              commandOptions.user = user;
            }
            if (Object.keys(hiddenEnvVars).length > 0 || envs) {
              commandOptions.envs = { ...hiddenEnvVars, ...envs };
            }

            if (background) {
              const commandHandle = await sandbox.commands.run(cmd, commandOptions);
              const cmdId = commandHandle.id;
              sandboxInfo.commands.set(cmdId, commandHandle);
              return JSON.stringify({
                sessionId,
                commandId: cmdId,
                success: true,
                message: `Background command started with ID ${cmdId}`,
              });
            } else {
              const commandResult = await sandbox.commands.run(cmd, commandOptions);
              return JSON.stringify({
                sessionId,
                stdout: commandResult.stdout,
                stderr: commandResult.stderr,
                exitCode: commandResult.exitCode,
                success: commandResult.exitCode === 0,
              });
            }
          }

          case 'start_server': {
            if (!cmd) {
              return this.errorResponse(
                sessionId || '',
                '`cmd` is required for `start_server` action.',
              );
            }
            if (!port) {
              return this.errorResponse(
                sessionId || '',
                '`port` is required for `start_server` action.',
              );
            }
            if (!logFile) {
              return this.errorResponse(
                sessionId || '',
                '`logFile` is required for `start_server` action.',
              );
            }

            logger.debug('[E2BCode] Starting server', {
              sessionId,
              cmd,
              port,
              logFile,
            });
            const serverCommand = `${cmd} > ${logFile} 2>&1`;
            const serverOptions = { background: true };

            if (cwd) {
              serverOptions.cwd = cwd;
            }
            if (adjustedTimeoutMs) {
              serverOptions.timeoutMs = adjustedTimeoutMs;
            }
            if (user) {
              serverOptions.user = user;
            }
            if (Object.keys(hiddenEnvVars).length > 0 || envs) {
              serverOptions.envs = { ...hiddenEnvVars, ...envs };
            }

            const serverHandle = await sandbox.commands.run(serverCommand, serverOptions);
            const serverCommandId = serverHandle.id;
            sandboxInfo.commands.set(serverCommandId, serverHandle);

            logger.debug('[E2BCode] Server started', {
              sessionId,
              commandId: serverCommandId,
            });
            const serverHost = await sandbox.getHost(port);
            return JSON.stringify({
              sessionId,
              commandId: serverCommandId,
              success: true,
              serverHost,
              logFile,
              message: `Server started with ID ${serverCommandId}, accessible at ${serverHost}:${port}. Logs are redirected to ${logFile}`,
            });
          }

          case 'command_list': {
            const processList = await sandbox.commands.list();
            logger.debug('[E2BCode] Retrieved list of commands', {
              sessionId,
              processCount: processList.length,
            });
            return JSON.stringify({
              sessionId,
              success: true,
              processes: processList,
            });
          }

          case 'command_kill': {
            if (pid === undefined) {
              return this.errorResponse(
                sessionId || '',
                '`pid` is required for `command_kill` action.',
              );
            }
            logger.debug('[E2BCode] Killing process', {
              sessionId,
              pid,
            });
            const killResult = await sandbox.commands.kill(pid);
            if (killResult) {
              logger.debug('[E2BCode] Process killed successfully', {
                sessionId,
                pid,
              });
              return JSON.stringify({
                sessionId,
                success: true,
                message: `Process with PID ${pid} has been killed.`,
              });
            } else {
              return this.errorResponse(sessionId || '', `Failed to kill process with PID ${pid}.`);
            }
          }

          case 'processinfo': {
            if (pid === undefined) {
              return this.errorResponse(
                sessionId || '',
                '`pid` is required for `processinfo` action.',
              );
            }
            logger.debug('[E2BCode] Getting process info', {
              sessionId,
              pid,
            });
            const processinfo_processList = await sandbox.commands.list();
            const processInfo = processinfo_processList.find((p) => p.pid === pid);

            if (processInfo) {
              logger.debug('[E2BCode] Process info retrieved', {
                sessionId,
                pid,
              });
              return JSON.stringify({
                sessionId,
                success: true,
                process: processInfo,
              });
            } else {
              return this.errorResponse(sessionId || '', `No process found with PID ${pid}.`);
            }
          }

          default:
            return this.errorResponse(sessionId || '', `Unknown action: ${action}`, { action });
        }
      }
    }
  }

  /**
   * Retrieves an existing sandbox and its info based on sessionId.
   * If none is found, logs error and throws an Error object.
   * The caller of this method immediately returns the error JSON.
   */
  async getSandboxInfo(sessionId) {
    const storedSandboxes = await getActiveSandboxes(this.userId);
    if (storedSandboxes.length) {
      let sandboxInfo;
      for (const sandbox of storedSandboxes) {
        try {
          const sandboxData = await Sandbox.connect(sandbox.sandboxId, {
            apiKey: this.apiKey,
          });
          sandboxes.set(sandbox.sessionId, {
            sandbox: sandboxData,
            lastAccessed: Date.now(),
            commands: new Map(),
          });
          sandboxInfo = sandboxData;
        } catch (e) {
          logger.warn(`No sandbox found with sandboxId ${sandbox.sandboxId}.`);
        }
      }
    }
    if (sandboxes.has(sessionId)) {
      logger.debug('[E2BCode] Reusing existing sandbox', { sessionId });
      const sandboxInfo = sandboxes.get(sessionId);
      sandboxInfo.lastAccessed = Date.now();
      return sandboxInfo;
    }
    logger.error('[E2BCode] No sandbox found for session', { sessionId });
    throw new Error(
      `No sandbox found for sessionId ${sessionId}. Please create one using the 'create' action.`,
    );
  }
}

module.exports = E2BCode;
