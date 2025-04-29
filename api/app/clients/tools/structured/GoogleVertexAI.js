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
            if (this.apiKey) {
                // Use API key authentication.  No authOptions needed for Vertex AI initialization in this case.
                console.log('Using apiKey for authentication.');

            } else if (this.client_email && this.private_key && this.project_id) {
                // Use Service Account authentication
                authOptions.credentials = {
                    client_email: this.client_email,
                    private_key: this.private_key,
                };
                authOptions.projectId = this.project_id;
                console.log('Using Service Account for authentication.');
            }
            // Initialize the Vertex AI client, passing in the authentication options
            this.vertexAI = new VertexAI({
                project: this.projectId,
                location: this.location,
                googleAuthOptions: authOptions,
            });

            this.search = this.vertexAI.getSearch();
            this.dataStore = this.search.dataStore({ id: this.dataStoreId });
        } catch (error) {
            logger.error('Error initializing Vertex AI client:', error);
            throw new Error(
                'Failed to initialize Vertex AI client.  Check your project ID, location, and authentication details.',
            );
        }
    }

    // Improved error handling and logging
    async _call(data) {
        const { query } = data;
        try {
            const parameters = {
                query: query,
                pageSize: typeof this.top === 'string' ? Number(this.top) : this.top, // Number of results
            };

            const searchResponse = await this.dataStore.search(parameters);

            const resultDocuments = [];
            if (searchResponse.results && searchResponse.results.length > 0) {
                searchResponse.results.forEach((result) => {
                    resultDocuments.push({
                        id: result.id,
                        title: result.document.title,
                        content: result.document.content, // Adjust to match your data structure
                    });
                });
            }

            return JSON.stringify(resultDocuments); // Return a JSON string of the results
        } catch (error) {
            logger.error('Vertex AI Search request failed', error);
            return 'There was an error with Vertex AI Search.';
        }
    }

    async getAccessToken() {
        // Prioritize API Key if provided
        if (this.apiKey) {
            console.log("Using apiKey for authentication");
            return this.apiKey;
        }

        try {
            const { GoogleAuth } = require('google-auth-library');
            const auth = new GoogleAuth({
                credentials: {
                    client_email: this.client_email,
                    private_key: this.private_key,
                },
            });
            const client = await auth.getClient({
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            });
            const accessToken = await client.getAccessToken();
            return accessToken;
        } catch (error) {
            logger.error('Error getting access token:', error);
            throw new Error(
                'Error getting access token. Ensure you have the correct credentials configured.',
            );
        }
    }
}

module.exports = GoogleVertexAI;