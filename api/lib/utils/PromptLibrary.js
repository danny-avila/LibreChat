const Search = require('../../utils/Search');
const glob = require('glob');

// Set the name of the index in MeiliSearch
const indexName = 'prompt-library';

/**
 * Get the search key for the index
 * > Create the index if it doesn't exist
 *
 * @returns {Promise<string>}
 */
async function getSearchKey() {
  await Search.findOrCreateIndex(indexName, createSearchIndex);
  return Search.getSearchKey(indexName);
}

/**
 * Get the tags from the filename
 *
 * @param file
 * @param existingTags string[]
 * @returns string[]
 */
function getTagsFromFilename(file, existingTags = []) {
  const tags = file.split('/');
  tags.splice(0, 4);
  const filename = tags.pop();
  // You can group prompts by adding the tagname then a dash. ie "coding-LaravelGPT.json"
  if (filename.includes('-')) {
    tags.push(filename.split('-')[0]);
  }
  return [...new Set([...tags, ...existingTags])];
}

/**
 * Collate the prompt library from the /prompts/ folder
 * @returns {*[]}
 */
function collatePromptLibrary() {
  // Glob all .json files from the folder /prompts/
  const globPattern = '../../../prompts/**/*.json'; // Relative to this file
  const files = glob.sync(globPattern, { cwd: __dirname, realpath: true });
  const library = [];
  files.forEach((file) => {
    // Create a Unique ID for each prompt based on the filename but without the extension, or slashes
    const uid = file.replace(/\\/g, '/').split('/').pop().split('.').shift();

    // Compile File Data
    const preset = require(file);
    const data = {
      id: uid,
      presetId: null,
      tags: getTagsFromFilename(file, preset.tags || []),
      open: false,
      path: file,
    };
    // Compile the prompt object, merging the preset with the main data, with the main data taking precedence
    const prompt = Object.assign({}, preset, data);
    library.push(prompt);
  });
  return library;
}

/**
 * Create the search index in MeiliSearch
 *
 * @param index
 */
function createSearchIndex(index) {
  // Collate the prompt library
  index.addDocuments(collatePromptLibrary());
  // Configure the index to search the tags field and the title field
  index.updateSettings({
    searchableAttributes: ['title', 'tags'],
    displayedAttributes: ['title', 'promptPrefix', 'tags', 'prompt'],
  });
}

module.exports = {
  getSearchKey,
  collatePromptLibrary,
};
