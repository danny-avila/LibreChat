const multer = require('multer');
const express = require('express');
const controllers = require('~/server/controllers/assistants/v1');
const actions = require('./actions');
const tools = require('./tools');

const upload = multer();
const router = express.Router();

/**
 * Assistant actions route.
 * @route GET|POST /assistants/actions
 */
router.use('/actions', actions);

/**
 * Create an assistant.
 * @route GET /assistants/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.use('/tools', tools);

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
router.post('/', controllers.createAssistant);

/**
 * Retrieves an assistant.
 * @route GET /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.get('/:id', controllers.retrieveAssistant);

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
router.patch('/:id', controllers.patchAssistant);

/**
 * Deletes an assistant.
 * @route DELETE /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.delete('/:id', controllers.deleteAssistant);

/**
 * Returns a list of assistants.
 * @route GET /assistants
 * @param {AssistantListParams} req.query - The assistant list parameters for pagination and sorting.
 * @returns {AssistantListResponse} 200 - success response - application/json
 */
router.get('/', controllers.listAssistants);

/**
 * Returns a list of the user's assistant documents (metadata saved to database).
 * @route GET /assistants/documents
 * @returns {AssistantDocument[]} 200 - success response - application/json
 */
router.get('/documents', controllers.getAssistantDocuments);

/**
 * Uploads and updates an avatar for a specific assistant.
 * @route POST /avatar/:assistant_id
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the assistant's avatar.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/avatar/:assistant_id', upload.single('file'), controllers.uploadAssistantAvatar);

module.exports = router;
