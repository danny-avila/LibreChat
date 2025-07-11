const { z } = require('zod');
const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { Tools, EToolResources, FileSources } = require('librechat-data-provider');
const { generateShortLivedToken } = require('~/server/services/AuthService');
const { getFiles, updateFile } = require('~/models/File');
const { uploadVectors } = require('~/server/services/Files/VectorDB/crud');

/**
 * Embed files that need embedding (typically YAML agent files)
 * @param {ServerRequest} req - The request object
 * @param {Array<{ file_id: string; filename: string }>} files - Files to check for embedding
 * @param {string} entity_id - Entity ID for the embedding
 */
const embedPendingFiles = async (req, files, entity_id) => {
  if (!process.env.RAG_API_URL) {
    logger.debug('RAG_API_URL not configured, skipping embedding check');
    return;
  }

  try {
    // Get full file details for files that may need embedding
    const fileIds = files.map((f) => f.file_id);
    logger.info(
      `[embedPendingFiles] Checking ${fileIds.length} files for embedding status. File IDs: ${fileIds.join(', ')}`,
    );

    const dbFiles = await getFiles({
      file_id: { $in: fileIds },
      embedded: true, // Files marked for embedding
    });

    logger.info(`[embedPendingFiles] Found ${dbFiles.length} files marked for embedding`);

    for (const dbFile of dbFiles) {
      logger.debug(
        `[embedPendingFiles] Checking file: ${dbFile.filename}, filepath: ${dbFile.filepath}, source: ${dbFile.source}`,
      );
    }

    for (const dbFile of dbFiles) {
      // Check if this is a file that needs embedding (marked as embedded but not in vectordb)
      const isAlreadyEmbedded = dbFile.source === FileSources.vectordb;
      const needsEmbedding = dbFile.embedded === true && !isAlreadyEmbedded;

      logger.debug(
        `[embedPendingFiles] Evaluating ${dbFile.filename}: embedded=${dbFile.embedded}, isAlreadyEmbedded=${isAlreadyEmbedded}, needsEmbedding=${needsEmbedding}`,
      );

      if (needsEmbedding) {
        logger.info(
          `[embedPendingFiles] ✓ File ${dbFile.filename} needs embedding - attempting now`,
        );

        try {
          logger.debug(
            `[embedPendingFiles] Creating file object for embedding ${dbFile.filename}...`,
          );

          // Create a file object for the uploadVectors function
          const fakeFile = {
            path: dbFile.filepath,
            size: dbFile.bytes,
            originalname: dbFile.filename,
            mimetype: dbFile.type,
          };

          logger.info(`[embedPendingFiles] Starting embedding for ${dbFile.filename}...`);

          await uploadVectors({
            req,
            file: fakeFile,
            file_id: dbFile.file_id,
            entity_id,
          });

          // Mark file as embedded by updating its source
          await updateFile({
            file_id: dbFile.file_id,
            source: FileSources.vectordb,
            filepath: FileSources.vectordb, // Update filepath to indicate it's now in vector DB
          });

          logger.info(
            `[embedPendingFiles] ✅ Successfully embedded YAML agent file: ${dbFile.filename}`,
          );
        } catch (embedError) {
          logger.error(
            `[embedPendingFiles] ❌ Failed to embed file ${dbFile.filename}:`,
            embedError.message,
          );
          if (embedError.response) {
            logger.error(`[embedPendingFiles] Response details:`, embedError.response.data);
          }

          // Don't fail the search if embedding fails - file might already be embedded
          logger.info(
            `[embedPendingFiles] Continuing with search despite embedding error for ${dbFile.filename}`,
          );
        }
      } else if (isAlreadyEmbedded) {
        logger.debug(`[embedPendingFiles] ✓ File ${dbFile.filename} already embedded, skipping`);
      }
    }
  } catch (error) {
    logger.warn('Error checking for pending file embeddings:', error.message);
    // Don't fail the search if embedding check fails
  }
};

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @returns {Promise<{
 *   files: Array<{ file_id: string; filename: string }>,
 *   toolContext: string
 * }>}
 */
const primeFiles = async (options) => {
  const { tool_resources } = options;
  const file_ids = tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
  const agentResourceIds = new Set(file_ids);
  const resourceFiles = tool_resources?.[EToolResources.file_search]?.files ?? [];
  const dbFiles = ((await getFiles({ file_id: { $in: file_ids } })) ?? []).concat(resourceFiles);

  let toolContext = `- Note: Semantic search is available through the ${Tools.file_search} tool but no files are currently loaded. Request the user to upload documents to search through.`;

  const files = [];
  for (let i = 0; i < dbFiles.length; i++) {
    const file = dbFiles[i];
    if (!file) {
      continue;
    }
    if (i === 0) {
      toolContext = `- Note: Use the ${Tools.file_search} tool to find relevant information within:`;
    }
    toolContext += `\n\t- ${file.filename}${
      agentResourceIds.has(file.file_id) ? '' : ' (just attached by user)'
    }`;
    files.push({
      file_id: file.file_id,
      filename: file.filename,
    });
  }

  return { files, toolContext };
};

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Array<{ file_id: string; filename: string }>} options.files
 * @param {string} [options.entity_id]
 * @returns
 */
const createFileSearchTool = async ({ req, files, entity_id }) => {
  return tool(
    async ({ query }) => {
      if (files.length === 0) {
        return 'No files to search. Instruct the user to add files for the search.';
      }
      const jwtToken = generateShortLivedToken(req.user.id);
      if (!jwtToken) {
        return 'There was an error authenticating the file search request.';
      }

      // Check if any files need embedding (for YAML agent files)
      logger.info(
        `[file_search] About to check ${files.length} files for embedding. Files: ${files.map((f) => f.filename).join(', ')}`,
      );
      await embedPendingFiles(req, files, entity_id);
      logger.info(`[file_search] Completed embedding check`);

      /**
       *
       * @param {import('librechat-data-provider').TFile} file
       * @returns {{ file_id: string, query: string, k: number, entity_id?: string }}
       */
      const createQueryBody = (file) => {
        const body = {
          file_id: file.file_id,
          query,
          k: 5,
        };
        if (!entity_id) {
          return body;
        }
        body.entity_id = entity_id;
        logger.debug(`[${Tools.file_search}] RAG API /query body`, body);
        return body;
      };

      const queryPromises = files.map((file) =>
        axios
          .post(`${process.env.RAG_API_URL}/query`, createQueryBody(file), {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          })
          .catch((error) => {
            logger.error('Error encountered in `file_search` while querying file:', error);
            return null;
          }),
      );

      const results = await Promise.all(queryPromises);
      const validResults = results.filter((result) => result !== null);

      if (validResults.length === 0) {
        return 'No results found or errors occurred while searching the files.';
      }

      const formattedResults = validResults
        .flatMap((result) =>
          result.data.map(([docInfo, distance]) => ({
            filename: docInfo.metadata.source.split('/').pop(),
            content: docInfo.page_content,
            distance,
          })),
        )
        // TODO: results should be sorted by relevance, not distance
        .sort((a, b) => a.distance - b.distance)
        // TODO: make this configurable
        .slice(0, 10);

      const formattedString = formattedResults
        .map(
          (result) =>
            `File: ${result.filename}\nRelevance: ${1.0 - result.distance.toFixed(4)}\nContent: ${
              result.content
            }\n`,
        )
        .join('\n---\n');

      return formattedString;
    },
    {
      name: Tools.file_search,
      description: `Performs semantic search across attached "${Tools.file_search}" documents using natural language queries. This tool analyzes the content of uploaded files to find relevant information, quotes, and passages that best match your query. Use this to extract specific information or find relevant sections within the available documents.`,
      schema: z.object({
        query: z
          .string()
          .describe(
            "A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you're looking for. The query will be used for semantic similarity matching against the file contents.",
          ),
      }),
    },
  );
};

module.exports = { createFileSearchTool, primeFiles };
