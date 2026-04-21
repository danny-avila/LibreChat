const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, generateShortLivedToken } = require('@librechat/api');
const { validateVisionModel } = require('librechat-data-provider');

const footer = `Use the context as your learned knowledge to better answer the user.

In your response, remember to follow these guidelines:
- If you don't know the answer, simply say that you don't know.
- If you are unsure how to answer, ask for clarification.
- Avoid mentioning that you obtained the information from the context.
`;

// Multimodal-RAG: visual matches we collected from rag-api. Exposed back to
// the caller via getVisualImageURLs() so client.js can attach them as
// image_urls on the latest message when the model supports vision.
//
// Soft-fail policy matches the rest of this file: if anything throws (axios,
// fs.readFile, missing validateVisionModel) we log a warning and continue
// with the text-only path.

/**
 * Determine whether the currently-selected model can accept image inputs.
 * We look up the model name from req.body.model (what the user picked in
 * the UI) and fall back to req.endpointOption.model. If neither is set we
 * assume no — safer to skip attachments than to crash the provider call.
 */
function resolveIsVisionModel(req) {
  const model = req?.body?.model || req?.endpointOption?.model;
  if (!model) {
    return false;
  }
  try {
    return validateVisionModel({ model });
  } catch (err) {
    logger.warn('[createContextHandlers] validateVisionModel threw, assuming no', err);
    return false;
  }
}

async function loadVisualImageURLsFromDisk(visualMatches) {
  // Small helper so the test can mock just this bit. Reads each page PNG from
  // disk and base64-encodes it. Matches the shape that encodeAndFormat /
  // LibreChat's provider adapters expect for inline image parts.
  const image_urls = [];
  for (const match of visualMatches) {
    try {
      // Sanity: image_path must be an absolute path — rag-api writes them
      // as `/var/rag-visual/<file_id>/page-N.png`. Reject anything else to
      // avoid accidental path traversal from a compromised sidecar.
      if (!path.isAbsolute(match.image_path)) {
        continue;
      }
      const buf = await fs.promises.readFile(match.image_path);
      image_urls.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${buf.toString('base64')}`,
          detail: 'auto',
        },
      });
    } catch (err) {
      logger.warn(
        `[createContextHandlers] visual attachment: cannot read ${match.image_path}: ${err.message}`,
      );
    }
  }
  return image_urls;
}

function createContextHandlers(req, userMessageContent) {
  if (!process.env.RAG_API_URL) {
    return;
  }

  const queryPromises = [];
  const processedFiles = [];
  const processedIds = new Set();
  const jwtToken = generateShortLivedToken(req.user.id);
  const useFullContext = isEnabled(process.env.RAG_USE_FULL_CONTEXT);
  const multimodalEnabled = isEnabled(process.env.RAG_INCLUDE_VISUAL ?? 'true');
  const isVisionModel = resolveIsVisionModel(req);

  // Collected across all /query responses. One entry per visual match across
  // all files the user attached to this message.
  /** @type {Array<{file_id:string,page_number:number,image_path:string,score:number}>} */
  const visualMatches = [];

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
        k: 4,
        include_visual: multimodalEnabled,
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

  /**
   * Normalise the /query response. Old rag-api returns a flat list of
   * [Document, score] tuples; the multimodal-ingest fork returns
   * `{ chunks: [...], visual_matches: [...] }` when include_visual is true.
   * We accept both so we never break when rag-api is older than LibreChat.
   */
  const normaliseQueryData = (data) => {
    if (Array.isArray(data)) {
      return { chunks: data, visual_matches: [] };
    }
    if (data && typeof data === 'object') {
      return {
        chunks: Array.isArray(data.chunks) ? data.chunks : [],
        visual_matches: Array.isArray(data.visual_matches) ? data.visual_matches : [],
      };
    }
    return { chunks: [], visual_matches: [] };
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

                const { chunks, visual_matches } = normaliseQueryData(queryResult.data);
                if (visual_matches.length) {
                  visualMatches.push(...visual_matches);
                }

                contextItems = chunks
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

      // Multimodal-RAG: when visual hits exist but the current model can
      // only read text, nudge the LLM to acknowledge rather than claim it
      // inspected the page visually.
      const visualHint =
        multimodalEnabled && visualMatches.length && !isVisionModel
          ? `\n[Hinweis: ${visualMatches.length} visuelle Treffer auf Seiten ${visualMatches
              .map((v) => v.page_number)
              .join(', ')} verfügbar, aber das aktuell gewählte Modell kann keine Bilder auswerten — Antwort basiert nur auf dem Text-Kontext.]`
          : '';

      const prompt = `${header}
        ${files}

        A semantic search was executed with the user's message as the query, retrieving the following context inside <context></context> XML tags.

        <context>${context}
        </context>
        ${visualHint}
        ${footer}`;

      return prompt;
    } catch (error) {
      logger.error('Error creating context:', error);
      throw error;
    }
  };

  /**
   * Returns the collected visual matches (populated by createContext).
   * Callers that support vision inputs can convert these to image_urls
   * via getVisualImageURLs(). Must be called after createContext().
   */
  const getVisualMatches = () => [...visualMatches];

  /**
   * Load page PNGs from disk and return them in the image_urls shape the
   * downstream provider adapters expect. Only returns entries when the
   * current model is vision-capable; otherwise the hint in createContext
   * covers the text-only case.
   */
  const getVisualImageURLs = async () => {
    if (!multimodalEnabled || !isVisionModel || visualMatches.length === 0) {
      return [];
    }
    try {
      return await loadVisualImageURLsFromDisk(visualMatches);
    } catch (err) {
      logger.warn('[createContextHandlers] could not load visual image urls:', err);
      return [];
    }
  };

  return {
    processFile,
    createContext,
    getVisualMatches,
    getVisualImageURLs,
  };
}

module.exports = createContextHandlers;
// Exposed for unit tests only.
module.exports.__test__ = { loadVisualImageURLsFromDisk, resolveIsVisionModel };
