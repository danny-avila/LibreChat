const axios = require('axios');
const { RagScopes, isEnabled, logAxiosError, generateShortLivedToken } = require('@librechat/api');

const footer = `Use the context as your learned knowledge to better answer the user.

In your response, remember to follow these guidelines:
- If you don't know the answer, simply say that you don't know.
- If you are unsure how to answer, ask for clarification.
- Avoid mentioning that you obtained the information from the context.
`;

function createContextHandlers(req, userMessageContent) {
  if (!process.env.RAG_API_URL) {
    return;
  }

  const queryPromises = [];
  const processedFiles = [];
  const processedIds = new Set();
  const useFullContext = isEnabled(process.env.RAG_USE_FULL_CONTEXT);

  /**
   * Chunks of a knowledge-base file are owned by the agent it was embedded
   * under, so both the token and the request have to name that entity. Message
   * attachments carry none, and stay scoped to the user alone.
   *
   * The two branches reach different planes of the RAG service and so mint
   * different scopes: reading a file's stored context needs document access and
   * no inference, while a retrieval query embeds the user's message and needs
   * exactly the reverse.
   *
   * @param {MongoFile & { entity_id?: string }} file
   */
  const query = async (file) => {
    const entity_id = file.entity_id;
    const mintToken = (scope) =>
      generateShortLivedToken({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        entityIds: entity_id ? [entity_id] : [],
        scopes: [scope],
      });

    if (useFullContext) {
      return axios.get(`${process.env.RAG_API_URL}/documents/${file.file_id}/context`, {
        headers: {
          Authorization: `Bearer ${mintToken(RagScopes.documents)}`,
        },
        params: entity_id ? { entity_id } : undefined,
      });
    }

    return axios.post(
      `${process.env.RAG_API_URL}/query`,
      {
        file_id: file.file_id,
        query: userMessageContent,
        k: 4,
        ...(entity_id ? { entity_id } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${mintToken(RagScopes.embed)}`,
          'Content-Type': 'application/json',
        },
      },
    );
  };

  const processFile = async (file) => {
    if (file.embedded && !processedIds.has(file.file_id)) {
      try {
        const promise = query(file);
        queryPromises.push(promise);
        processedFiles.push(file);
        processedIds.add(file.file_id);
      } catch (error) {
        logAxiosError({ message: `Error processing file ${file.filename}`, error });
      }
    }
  };

  const createContext = async () => {
    try {
      if (!queryPromises.length || !processedFiles.length) {
        return '';
      }

      const oneFile = processedFiles.length === 1;
      const header = `The user has attached ${oneFile ? 'a' : processedFiles.length} file${
        !oneFile ? 's' : ''
      } to the conversation:`;

      const files = `${
        oneFile
          ? ''
          : `
      <files>`
      }${processedFiles
        .map(
          (file) => `
              <file>
                <filename>${file.filename}</filename>
                <type>${file.type}</type>
              </file>`,
        )
        .join('')}${
        oneFile
          ? ''
          : `
        </files>`
      }`;

      const resolvedQueries = await Promise.all(queryPromises);

      const context =
        resolvedQueries.length === 0
          ? '\n\tThe semantic search did not return any results.'
          : resolvedQueries
              .map((queryResult, index) => {
                const file = processedFiles[index];
                let contextItems = queryResult.data;

                const generateContext = (currentContext) =>
                  `
          <file>
            <filename>${file.filename}</filename>
            <context>${currentContext}
            </context>
          </file>`;

                if (useFullContext) {
                  return generateContext(`\n${contextItems}`);
                }

                contextItems = queryResult.data
                  .map((item) => {
                    const pageContent = item[0].page_content;
                    return `
            <contextItem>
              <![CDATA[${pageContent?.trim()}]]>
            </contextItem>`;
                  })
                  .join('');

                return generateContext(contextItems);
              })
              .join('');

      if (useFullContext) {
        const prompt = `${header}
          ${context}
          ${footer}`;

        return prompt;
      }

      const prompt = `${header}
        ${files}

        A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

        <context>${context}
        </context>

        ${footer}`;

      return prompt;
    } catch (error) {
      logAxiosError({ message: 'Error creating context', error });
      throw error;
    }
  };

  return {
    processFile,
    createContext,
  };
}

module.exports = createContextHandlers;
