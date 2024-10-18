const { EToolResources } = require('librechat-data-provider');
const { getFiles } = require('~/models/File');

/**
 *
 * @param {Object} options
 * @param {ServerRequest} options.req
 * @param {Agent['tool_resources']} options.tool_resources
 * @returns {Promise<Array<{ id: string; session_id: string; name: string }>>}
 */
const primeCodeFiles = async (options) => {
  const { tool_resources } = options;
  const file_ids = tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
  const dbFiles = await getFiles({ file_id: { $in: file_ids } });

  const files = [];
  for (const file of dbFiles) {
    if (file.metadata.fileIdentifier) {
      const [session_id, id] = file.metadata.fileIdentifier.split('/');
      /* TODO: Check if files are stale or not */
      files.push({
        id,
        session_id,
        name: file.filename,
      });
    }
  }

  return files;
};

module.exports = primeCodeFiles;
