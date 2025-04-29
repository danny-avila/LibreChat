const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { VertexAI } = require('@google-cloud/vertexai');
const { logger } = require('~/config');

class GoogleVertexAI extends Tool {

    // Helper function for initializing properties
    _initializeField(field, envVar, defaultValue) {
        return field || process.env[envVar] || defaultValue;
    }

    constructor(fields = {}) {
        super();
        this.name = 'vertex_ai';
        this.description =
            'Use the \'vertex-ai\' tool to retrieve search results from a Vertex AI Search data store relevant to your input.';

        /* Used to initialize the Tool without necessary variables. */
        this.override = fields.override ?? false;

        let serviceKey = {};
        try {
            serviceKey = require('~/data/auth.json');
        } catch (e) {
            // Do nothing
        }

        this.serviceKey =
            serviceKey && typeof serviceKey === 'string' ? JSON.parse(serviceKey) : (serviceKey ?? {});

        /** @type {string | null | undefined} */
        this.project_id = this.serviceKey.project_id;
        this.client_email = this.serviceKey.client_email;
        this.private_key = this.serviceKey.private_key;
        this.access_token = null;


        // Define schema
        this.schema = z.object({
            query: z.string().describe('Search word or phrase to Vertex AI Search'),
        });

        // Initialize properties using helper function
        this.projectId = this._initializeField(
            fields.GOOGLE_CLOUD_PROJECT_ID,
            'GOOGLE_CLOUD_PROJECT_ID',
        );
        this.location = this._initializeField(
            fields.GOOGLE_CLOUD_LOCATION,
            'GOOGLE_CLOUD_LOCATION',
            'us-central1',
        );
        this.dataStoreId = this._initializeField(
            fields.VERTEX_AI_DATASTORE_ID,
            'VERTEX_AI_DATASTORE_ID',
        );

        // Check for required fields
        if (
            !this.override &&
            (!this.projectId || !this.location || !this.dataStoreId)
        ) {
            throw new Error(
                'Missing GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_LOCATION, or VERTEX_AI_DATASTORE_ID.',
            );
        }

        if (!this.client_email && !this.private_key) {
            console.warn(
                'Warning: No Service Account credentials provided.  Ensure the Compute Engine default service account has the Vertex AI User role if running on a Compute Engine instance.',
            );
        }

        if (this.override) {
            return;
        }

        // Create Vertex AI client
        try {
            const authOptions = {};
            if (this.client_email && this.private_key && this.project_id) {
                // Use Service Account authentication
                authOptions.credentials = {
                    client_email: this.client_email,
                    private_key: this.private_key,
                };
                authOptions.projectId = this.project_id;
                logger.debug('Using Service Account for authentication.');
            }
            // Initialize the Vertex AI client, passing in the authentication options
            this.vertexAI = new VertexAI({
                project: this.projectId,
                location: this.location,
                googleAuthOptions: authOptions,
            });

            const retrievalTool = this.createGroundingTool()

            this.generativeModel = this.vertexAI.preview.getGenerativeModel({
                model: "gemini-2.0-flash-001",
                tools: [retrievalTool]
            });

        } catch (error) {
            logger.error('Error initializing Vertex AI client:', error);
            throw new Error(
                'Failed to initialize Vertex AI client.  Check your project ID, location, and authentication details.',
            );
        }
    }

    createGroundingTool() {
        return {
            retrieval: {
                vertexAiSearch: {
                    datastore: this.dataStoreId,
                },
                disableAttribution: false,
            },
        }
    }

    async _call(data) {
        const { query } = data;

        try {
            const streamingResult = await this.generativeModel.generateContentStream({
                contents: [{role: 'user', parts: [{text: query}]}]
            })
            const aggregatedResponse = await streamingResult.response;
            return JSON.stringify(aggregatedResponse);
        } catch (error) {
            logger.error('Vertex AI Search request failed', error);
            return 'There was an error with Vertex AI Search.';
        }
    }
}

module.exports = GoogleVertexAI;