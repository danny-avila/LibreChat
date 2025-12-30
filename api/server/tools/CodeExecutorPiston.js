const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');
const { DEFAULT_PISTON_URL } = require('@librechat/data-schemas');
const { PistonClient } = require('~/server/services/Piston/PistonClient');
const { extractFilesFromStdout } = require('~/server/services/Piston/markerParser');
const { prepareFilesForPiston } = require('~/server/services/Piston/fileHandlers');
const { saveExtractedFiles } = require('~/server/services/Piston/fileSaver');
const { getLanguageConfig } = require('~/server/services/Piston/languageMapping');

/**
 * Tool description for Piston code executor.
 * This description is added to the agent's system prompt automatically
 * by LangChain's tool integration mechanism.
 * 
 * The agent MUST follow the marker format described here, or generated files will be lost.
 */
const PISTON_TOOL_DESCRIPTION = `
Executes code using Piston API (stateless execution environment).

**CRITICAL: File Output Format**

To make generated files available for download, you MUST print them to stdout using this EXACT format:

**For BINARY files (images, PDFs, Excel):**

\`\`\`python
import base64

# Create your file (e.g., image, PDF, etc.)
# ... your code to generate the file ...

# Then print with markers for LibreChat to capture
with open('chart.png', 'rb') as f:
    data = base64.b64encode(f.read()).decode('utf-8')

print('===LIBRECHAT_FILE_START===')
print('chart.png')
print('base64')
print(data)
print('===LIBRECHAT_FILE_END===')
\`\`\`

**For TEXT files (CSV, JSON, TXT):**

\`\`\`python
# Create your file
# ... your code to generate the file ...

# Then print with markers
with open('report.csv', 'r') as f:
    content = f.read()

print('===LIBRECHAT_FILE_START===')
print('report.csv')
print('utf8')
print(content)
print('===LIBRECHAT_FILE_END===')
\`\`\`

**JavaScript/Node.js example:**

\`\`\`javascript
const fs = require('fs');

// Create your file
fs.writeFileSync('data.json', JSON.stringify({result: "success"}));

// Print with markers
const content = fs.readFileSync('data.json', 'utf8');
console.log('===LIBRECHAT_FILE_START===');
console.log('data.json');
console.log('utf8');
console.log(content);
console.log('===LIBRECHAT_FILE_END===');
\`\`\`

**Multiple files:** Repeat the marker block for each file.

**WITHOUT THESE MARKERS, FILES WILL NOT BE CAPTURED!** The markers are how LibreChat extracts files from the execution output.

**Execution in one run:**
- Unlike Jupyter Notebooks, you don't have acces to files from previous runs. You must finish everything required in one run.

**Limitations:**
- No network access available
- No persistent filesystem between executions (stateless)
- Limited library availability - contact your administrator for support.
- Most filetypes are supported, but if you get errors, contact your administrator.
- If you encounter execution errors, contact your administrator.
- All generated files MUST use the marker format above

**CRITICAL - File Availability:**
- **Files uploaded in this conversation ARE available across all turns**
- **Files persist throughout the conversation and can be reused**
- You can access files from previous messages within the same conversation without asking the user to re-upload
- However, each code execution starts fresh - you must read files each time you need them
- The Piston execution environment itself is stateless (no persistent variables/state between runs)

**For uploaded input files:**
- Files uploaded during the conversation are available in the working directory
- Use relative paths to access them: \`./filename.ext\`
- Files are READ-ONLY in the Piston environment
- For Files uploaded for code execution, the LLM does not get the content of the file, only the filename. If content is required, the user shall upload it as text before, or paste the text.

**IMPORTANT - UI File Handling:**
- Generated files automatically appear as clickable download badges in the UI
- DO NOT output fake download URLs like "sandbox:/file.txt" or markdown links to files
- DO NOT mention download links in your response text
- Simply inform the user that you've created the file (e.g., "I've created report.csv with your results")
- The UI automatically renders all generated files as downloadable attachments

**CRITICAL - User Response Guidelines:**
- NEVER include base64-encoded content in your response to the user
- NEVER show raw file marker blocks (===LIBRECHAT_FILE_START===, etc.) to the user
- DO NOT display the actual base64 string or file contents in your message
- Only mention the filename and what it contains (e.g., "I created image.png with your QR code")
- The user will see files as download badges automatically - you don't need to show them the data
`.trim();

/**
 * Get tool context for uploaded files
 * This is added to the agent's system prompt via toolContextMap
 * @param {Array} files - Array of file objects
 * @returns {string} Tool context message
 */
function getPistonToolContext(files) {
  if (!files || files.length === 0) {
    return `
⚠️ CODE EXECUTION WARNING:
- NO files are currently available for code execution
- If you need to work with a file, ask the user to upload it with their message
- Once uploaded, files persist throughout the conversation
`.trim();
  }

  return `
📁 FILES AVAILABLE FOR CODE EXECUTION:
${files.map((f) => `  - ${f.name}`).join('\n')}

✅ FILE PERSISTENCE:
- These files remain available throughout the entire conversation
- You can access them in future turns without re-upload
- Each execution starts fresh, so read files each time you need them
- Generated output files must use the marker format (see tool description)
`.trim();
}

const PistonCodeExecutionSchema = z.object({
  lang: z
    .string()
    .describe(
      'Programming language (e.g., python, javascript, typescript, java, cpp, bash, r, go, rust, php, ruby)',
    ),
  code: z.string().describe('Complete code to execute - must be self-contained'),
});

/**
 * Creates a Piston code execution tool for LibreChat agents.
 * This tool executes code using the Piston API and handles file uploads/downloads
 * via base64 encoding and stdout marker parsing.
 * 
 * @param {Object} params - Tool parameters
 * @param {string} params.user_id - User ID
 * @param {Array} params.files - Array of files for upload
 * @param {string} params.pistonUrl - Piston API URL
 * @param {Object} params.req - Server request object
 * @param {string} params.conversationId - Conversation ID
 * @returns {Object} LangChain tool instance
 */
function createPistonCodeExecutionTool(params) {
  const pistonUrl = params.pistonUrl || DEFAULT_PISTON_URL;
  const pistonClient = new PistonClient(pistonUrl);

  return tool(
    async ({ lang, code }) => {
      try {
        // 1. Get language configuration
        const langConfig = getLanguageConfig(lang);

        // 2. Prepare input files (if any)
        const inputFiles =
          params.files && params.files.length > 0
            ? await prepareFilesForPiston(params.req, params.files)
            : [];

        // 3. Add main code file as the first file (Piston executes the first file)
        inputFiles.unshift({
          name: `main.${langConfig.extension}`,
          content: code,
        });

        logger.info(
          `[Piston] Executing ${langConfig.pistonName} code with ${inputFiles.length} file(s)`,
        );

        // 4. Execute on Piston
        const result = await pistonClient.execute({
          language: langConfig.pistonName,
          version: langConfig.defaultVersion,
          files: inputFiles,
        });

        logger.info(
          `[Piston] Execution completed - exit code: ${result.run.code}, stdout length: ${result.run.stdout?.length || 0}`,
        );

        // 5. Extract output files from stdout using marker system
        const { cleanedOutput, files } = extractFilesFromStdout(result.run.stdout);

        // 5.5. Validate extracted files before saving
        const { validateExtractedFile } = require('~/server/services/Piston/markerParser');
        const validFiles = files.filter(validateExtractedFile);
        
        if (validFiles.length < files.length) {
          logger.warn(
            `[Piston] Filtered out ${files.length - validFiles.length} invalid file(s) with malformed data`
          );
        }

        // 6. Save extracted files to LibreChat storage
        const savedFiles = await saveExtractedFiles(
          validFiles,
          params.user_id,
          params.conversationId,
          params.req,
        );

        if (savedFiles.length > 0) {
          logger.info(`[Piston] Saved ${savedFiles.length} generated file(s)`);
        }

        // 6.5. Log execution metrics for monitoring and alerting
        logger.info('[Piston Metrics]', {
          language: langConfig.pistonName,
          exitCode: result.run.code,
          stdoutLength: result.run.stdout?.length || 0,
          stderrLength: result.run.stderr?.length || 0,
          inputFileCount: inputFiles.length - 1, // Subtract main code file
          outputFileCount: savedFiles.length,
          hasErrors: result.run.code !== 0 || result.run.stderr?.length > 0,
          userId: params.user_id,
          conversationId: params.conversationId,
          timestamp: new Date().toISOString(),
        });

        // 7. Format output similar to LibreChat Code API
        let output = '';

        if (cleanedOutput) {
          output += `stdout:\n${cleanedOutput}\n`;
        } else if (!savedFiles.length && !result.run.stderr) {
          // If no output at all, add a note
          output += 'stdout: (empty)\n';
        }

        if (result.run.stderr) {
          output += `stderr:\n${result.run.stderr}\n`;
        }

        if (savedFiles.length > 0) {
          output += `\nGenerated files:\n`;
          savedFiles.forEach((file) => {
            output += `- ${file.filename}\n`;
          });
        }

        if (result.run.code !== 0) {
          output += `\nExit code: ${result.run.code}`;
          if (result.run.signal) {
            output += ` (signal: ${result.run.signal})`;
          }
        }

        // 8. Return in format expected by LibreChat: [content, artifact]
        // Construct full download URLs for frontend
        // Use DOMAIN_CLIENT or fallback to localhost
        const domain = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
        const filesForFrontend = savedFiles.map((file) => {
          const downloadUrl = `${domain}/api/files/download/${params.user_id}/${file.file_id}`;
          logger.info(`[Piston] Setting file download URL: ${downloadUrl}`);
          return {
            ...file,
            filepath: downloadUrl,
          };
        });

        return [
          output.trim(),
          {
            files: filesForFrontend,
            // Note: No session_id for Piston (stateless execution)
          },
        ];
      } catch (error) {
        const errorMessage = error.message || 'Unknown error during code execution';
        
        // Enhanced error logging for monitoring
        logger.error('[Piston Error]', {
          error: errorMessage,
          errorType: error.name,
          language: lang,
          userId: params.user_id,
          conversationId: params.conversationId,
          timestamp: new Date().toISOString(),
          // Include stack trace in development only
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
        });

        return [
          `Execution error:\n${errorMessage}\n\nPlease check your code and try again.`,
          { files: [] },
        ];
      }
    },
    {
      name: 'execute_code',
      description: PISTON_TOOL_DESCRIPTION,
      schema: PistonCodeExecutionSchema,
      responseFormat: 'content_and_artifact',
    },
  );
}

module.exports = {
  createPistonCodeExecutionTool,
  getPistonToolContext,
};

