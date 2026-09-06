const { nanoid } = require('nanoid');
const { checkAccess } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  Tools,
  Permissions,
  FileSources,
  EModelEndpoint,
  PermissionTypes,
} = require('librechat-data-provider');
const { getRoleByName, getFiles } = require('~/models');

/**
 * Process file search results from tool calls
 * @param {Object} options
 * @param {IUser} options.user - The user object
 * @param {AppConfig} options.appConfig - The app configuration object
 * @param {GraphRunnableConfig['configurable']} options.metadata - The metadata
 * @param {{ [Tools.file_search]: { sources: Object[]; fileCitations: boolean } }} options.toolArtifact - The tool artifact containing structured data
 * @param {string} options.toolCallId - The tool call ID
 * @returns {Promise<Object|null>} The file search attachment or null
 */
async function processFileCitations({ user, appConfig, toolArtifact, toolCallId, metadata }) {
  try {
    if (!toolArtifact?.[Tools.file_search]?.sources) {
      return null;
    }

    if (user) {
      try {
        const hasFileCitationsAccess =
          toolArtifact?.[Tools.file_search]?.fileCitations ??
          (await checkAccess({
            user,
            permissionType: PermissionTypes.FILE_CITATIONS,
            permissions: [Permissions.USE],
            getRoleByName,
          }));

        if (!hasFileCitationsAccess) {
          logger.debug(
            `[processFileCitations] User ${user.id} does not have FILE_CITATIONS permission`,
          );
          return null;
        }
      } catch (error) {
        logger.error(
          `[processFileCitations] Permission check failed for FILE_CITATIONS: ${error.message}`,
        );
        logger.warn(
          '[processFileCitations] Returning null citations due to permission check error — citations will not be shown for this message',
        );
        return null;
      }
    }

    const selectedSources = selectFileCitationSources(
      toolArtifact[Tools.file_search].sources,
      appConfig,
    );
    if (selectedSources.length === 0) {
      return null;
    }

    const enhancedSources = await enhanceSourcesWithMetadata(selectedSources, appConfig);

    if (enhancedSources.length > 0) {
      const fileSearchAttachment = {
        type: Tools.file_search,
        [Tools.file_search]: { sources: enhancedSources },
        toolCallId: toolCallId,
        messageId: metadata.run_id,
        conversationId: metadata.thread_id,
        name: `${Tools.file_search}_file_search_results_${nanoid()}`,
      };

      return fileSearchAttachment;
    }

    return null;
  } catch (error) {
    logger.error('[processFileCitations] Error processing file citations:', error);
    return null;
  }
}

/** Select the passages used by both model anchors and citation attachments. */
function selectFileCitationSources(sources, appConfig) {
  const config = appConfig?.endpoints?.[EModelEndpoint.agents];
  return applyCitationLimits(
    sources.filter((source) => source.relevance >= (config?.minRelevanceScore ?? 0.45)),
    config?.maxCitations ?? 30,
    config?.maxCitationsPerFile ?? 5,
  );
}

/**
 * Apply citation limits to sources
 * @param {Array} sources - All sources
 * @param {number} maxCitations - Maximum total citations
 * @param {number} maxCitationsPerFile - Maximum citations per file
 * @returns {Array} Selected sources
 */
function applyCitationLimits(sources, maxCitations, maxCitationsPerFile) {
  const byFile = {};
  sources.forEach((source) => {
    if (!byFile[source.fileId]) {
      byFile[source.fileId] = [];
    }
    byFile[source.fileId].push(source);
  });

  const representatives = [];
  for (const fileId in byFile) {
    const fileSources = byFile[fileId].sort((a, b) => b.relevance - a.relevance);
    const selectedFromFile = fileSources.slice(0, maxCitationsPerFile);
    representatives.push(...selectedFromFile);
  }

  return representatives.sort((a, b) => b.relevance - a.relevance).slice(0, maxCitations);
}

/**
 * Enhance sources with file metadata from database
 * @param {Array} sources - Selected sources
 * @param {AppConfig} appConfig - Custom configuration
 * @returns {Promise<Array>} Enhanced sources
 */
async function enhanceSourcesWithMetadata(sources, appConfig) {
  const fileIds = [...new Set(sources.map((source) => source.fileId))];

  let fileMetadataMap = {};
  try {
    const files = await getFiles({ file_id: { $in: fileIds } });
    fileMetadataMap = files.reduce((map, file) => {
      map[file.file_id] = file;
      return map;
    }, {});
  } catch (error) {
    logger.error('[enhanceSourcesWithMetadata] Error looking up file metadata:', error);
  }

  return sources.map((source) => {
    const fileRecord = fileMetadataMap[source.fileId] || {};
    const configuredStorageType = fileRecord.source || appConfig?.fileStrategy || FileSources.local;

    return {
      ...source,
      fileName: fileRecord.filename || source.fileName || 'Unknown File',
      metadata: {
        ...source.metadata,
        storageType: configuredStorageType,
        fileType: fileRecord.type || undefined,
        fileBytes: fileRecord.bytes || undefined,
      },
    };
  });
}

module.exports = {
  selectFileCitationSources,
  applyCitationLimits,
  processFileCitations,
  enhanceSourcesWithMetadata,
};
