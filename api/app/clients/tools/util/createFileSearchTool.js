const { z } = require('zod');
const axios = require('axios');
const { tool } = require('@langchain/core/tools');
const { Tools, EToolResources } = require('librechat-data-provider');
const { getFiles } = require('~/models/File');
const { logger } = require('~/config');

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @returns
 */
const createFileSearchTool = async (options) => {
  const { req, tool_resources } = options;
  const file_ids = tool_resources?.[EToolResources.file_search]?.file_ids ?? [];
  const files = (await getFiles({ file_id: { $in: file_ids } })).map((file) => ({
    file_id: file.file_id,
    filename: file.filename,
  }));

  const fileList = files.map((file) => `- ${file.filename}`).join('\n');
  const toolDescription = `Performs a semantic search based on a natural language query across the following files:\n${fileList}`;

  const FileSearch = tool(
    async ({ query }) => {
      if (files.length === 0) {
        return 'No files to search. Instruct the user to add files for the search.';
      }
      const jwtToken = req.headers.authorization.split(' ')[1];
      if (!jwtToken) {
        return 'There was an error authenticating the file search request.';
      }
      const queryPromises = files.map((file) =>
        axios
          .post(
            `${process.env.RAG_API_URL}/query`,
            {
              file_id: file.file_id,
              query,
              k: 5,
            },
            {
              headers: {
                Authorization: `Bearer ${jwtToken}`,
                'Content-Type': 'application/json',
              },
            },
          )
          .catch((error) => {
            logger.error(
              `Error encountered in \`file_search\` while querying file_id ${file._id}:`,
              error,
            );
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
          result.data.map(([docInfo, relevanceScore]) => ({
            filename: docInfo.metadata.source.split('/').pop(),
            content: docInfo.page_content,
            relevanceScore,
          })),
        )
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      const formattedString = formattedResults
        .map(
          (result) =>
            `File: ${result.filename}\nRelevance: ${result.relevanceScore.toFixed(4)}\nContent: ${
              result.content
            }\n`,
        )
        .join('\n---\n');

      return formattedString;
    },
    {
      name: Tools.file_search,
      description: toolDescription,
      schema: z.object({
        query: z
          .string()
          .describe(
            'A natural language query to search for relevant information in the files. Be specific and use keywords related to the information you\'re looking for. The query will be used for semantic similarity matching against the file contents.',
          ),
      }),
    },
  );

  return FileSearch;
};

module.exports = createFileSearchTool;
