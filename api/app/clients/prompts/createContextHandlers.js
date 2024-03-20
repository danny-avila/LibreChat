const axios = require('axios');

function createContextHandlers(req, userMessageContent) {
  if (!process.env.RAG_API_URL) {
    return;
  }

  const queryPromises = [];
  const processedFiles = [];
  const processedIds = new Set();
  const jwtToken = req.headers.authorization.split(' ')[1];

  const processFile = async (file) => {
    if (file.embedded && !processedIds.has(file.file_id)) {
      try {
        const promise = axios.post(
          `${process.env.RAG_API_URL}/query`,
          {
            file_id: file.file_id,
            query: userMessageContent,
            k: 4,
          },
          {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        queryPromises.push(promise);
        processedFiles.push(file);
        processedIds.add(file.file_id);
      } catch (error) {
        console.error(`Error processing file ${file.filename}:`, error);
      }
    }
  };

  const createContext = async () => {
    try {
      if (!queryPromises.length || !processedFiles.length) {
        return '';
      }

      const resolvedQueries = await Promise.all(queryPromises);

      const context = resolvedQueries
        .map((queryResult, index) => {
          const file = processedFiles[index];
          const contextItems = queryResult.data
            .map((item) => {
              const pageContent = item[0].page_content;
              return `
            <contextItem>
              <![CDATA[${pageContent}]]>
            </contextItem>
          `;
            })
            .join('');

          return `
          <file>
            <filename>${file.filename}</filename>
            <context>
              ${contextItems}
            </context>
          </file>
        `;
        })
        .join('');

      const template = `The user has attached ${
        processedFiles.length === 1 ? 'a' : processedFiles.length
      } file${processedFiles.length !== 1 ? 's' : ''} to the conversation:

        <files>
          ${processedFiles
    .map(
      (file) => `
            <file>
              <filename>${file.filename}</filename>
              <type>${file.type}</type>
            </file>
          `,
    )
    .join('')}
        </files>

        A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

        <context>
          ${context}
        </context>

        Use the context as your learned knowledge to better answer the user.

        In your response, remember to follow these guidelines:
        - If you don't know the answer, simply say that you don't know.
        - If you are unsure how to answer, ask for clarification.
        - Avoid mentioning that you obtained the information from the context.

        Answer appropriately in the user's language.
      `;

      return template;
    } catch (error) {
      console.error('Error creating context:', error);
      throw error; // Re-throw the error to propagate it to the caller
    }
  };

  return {
    processFile,
    createContext,
  };
}

module.exports = createContextHandlers;
