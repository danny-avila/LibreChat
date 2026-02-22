/**
 * Enum for the possible tools that can be enabled on an assistant.
 * @readonly
 * @enum {string}
 */
// eslint-disable-next-line no-unused-vars
const Tools = {
  code_interpreter: 'code_interpreter',
  retrieval: 'retrieval',
  function: 'function',
};

/**
 * Represents a tool with its type.
 * @typedef {Object} Tool
 * @property {Tools} toolName - The name of the tool and its corresponding type from the Tools enum.
 */

/**
 * @typedef {Object} Assistant
 * @property {string} id - The identifier, which can be referenced in API endpoints.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the assistant was created.
 * @property {string|null} description - The maximum length is 512 characters.
 * @property {Array<string>} file_ids - A list of file IDs attached to this assistant.
 * @property {string|null} instructions - The system instructions that the assistant uses. The maximum length is 32768 characters.
 * @property {Object|null} metadata - Set of 16 key-value pairs that can be attached to an object.
 * @property {string} model - ID of the model to use.
 * @property {string|null} name - The name of the assistant. The maximum length is 256 characters.
 * @property {string} object - The object type, which is always 'assistant'.
 * @property {Tool[]} tools - A list of tools enabled on the assistant.
 */

/**
 * @typedef {Object} AssistantCreateParams
 * @property {string} model - ID of the model to use.
 * @property {string|null} [description] - The description of the assistant.
 * @property {Array<string>} [file_ids] - A list of file IDs attached to this assistant.
 * @property {string|null} [instructions] - The system instructions that the assistant uses.
 * @property {Object|null} [metadata] - Set of 16 key-value pairs that can be attached to an object.
 * @property {string|null} [name] - The name of the assistant.
 * @property {Tool[]} tools - A list of tools enabled on the assistant.
 */

/**
 * @typedef {Object} AssistantUpdateParams
 * // Similar properties to AssistantCreateParams, but all optional
 */

/**
 * @typedef {Object} AssistantListParams
 * @property {string|null} [before] - A cursor for use in pagination.
 * @property {'asc'|'desc'} [order] - Sort order by the created_at timestamp of the objects.
 */
