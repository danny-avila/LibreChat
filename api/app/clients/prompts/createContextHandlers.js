const axios = require('axios');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');
const { getRagK } = require('~/config/ragk');

// const footer =
//  '**Important:** Use the content within these formatted documents to answer the question. Ensure that the answer to each question is a combination of the relevant information from the context.';

const footer =
  'Crucial Instruction: Thoroughly utilize the content within these formatted documents to provide comprehensive answers. Ensure that each response integrates all relevant information from the context to address the question fully.';

function createContextHandlers(req, userMessageContent) {
  if (!process.env.RAG_API_URL) {
    return;
  }

  const queryPromises = [];
  const processedFiles = [];
  const processedIds = new Set();
  const jwtToken = req.headers.authorization.split(' ')[1];
  const useFullContext = isEnabled(process.env.RAG_USE_FULL_CONTEXT);

  const ragK = getRagK();
  if (!ragK) {
    logger.error('RagK is not defined');
    return;
  }
  logger.info('Fetched ragK:', ragK);

  const query = async (file) => {
    if (useFullContext) {
      return axios.get(`${process.env.RAG_API_URL}/documents/${file.file_id}/context`, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });
    }

    return axios.post(
      `${process.env.RAG_API_URL}/query`,
      {
        file_id: file.file_id,
        query: userMessageContent,
        k: ragK,
      },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
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
        logger.error(`Error processing file ${file.filename}:`, error);
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

        You are an expert tasked with answering questions based on the information provided in a knowledge base. Your objective is to deliver comprehensive and informative answers that incorporate the relevant context directly. When working with a series of formatted documents, adhere to these guidelines:

1. **Comprehensive Answers:** Provide detailed and thorough responses that fully address the user's question.
2. **Seamless Integration:** Skillfully weave information from the documents into your answers.
3. **No External Knowledge:** Rely exclusively on the information within the documents. Do not introduce any external knowledge or assumptions.
4. **Unbiased and Journalistic Tone:** Maintain an objective and neutral tone, avoiding personal opinions or interpretations.
5. **Disambiguation:** If multiple entities with the same name are mentioned, clearly differentiate and address each one in your response.
6. **Clarity and Coherence:** Ensure your answers are clear and coherent, avoiding unnecessary repetition while still being thorough.
7. **No Hallucination:** If the documents lack the necessary information to answer the question, state, "I could not find enough information in the document to determine.." Do not invent or guess information.

Retrieve the context within the <context></context> XML tags.

        <context>${context}
        </context>

        ${footer}`;
      return prompt;
    } catch (error) {
      logger.error('Error creating context:', error);
      throw error;
    }
  };

  return {
    processFile,
    createContext,
  };
}

module.exports = createContextHandlers;
