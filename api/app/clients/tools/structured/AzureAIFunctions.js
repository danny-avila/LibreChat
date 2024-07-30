const { z } = require('zod');
const { StructuredTool } = require('langchain/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('~/config');
const { Tool } = require('langchain/tools');

class AzureAIFunctions extends Tool {
    
    constructor(fields = {}) {
        super(fields);
        /** @type {boolean} Used to initialize the Tool without necessary variables. */
        this.override = fields.override ?? false;
        /** @type {boolean} Necessary for output to contain all image metadata. */
        this.returnMetadata = fields.returnMetadata ?? false;

        this.name = 'azure-ai-functions';
        this.description = 'Use the \'azure-ai-functions\' tool to retrieve search results relevant to your input';
        let apiKey = process.env.AZURE_ASSISTANTS_API_KEY;
        this.apiKey = apiKey?? undefined;
        this.override = fields.override ?? false;
        const config = {apiKey};

        if(process.env.OPENAI_API_KEY && process.env.AZURE_ASSISTANTS_API_KEY){
            config.baseUrl = `https://${process.env.INSTANCE_NAME}.openai.azure.com/openai/deployments/${process.env.DEPLOYMENT_NAME}`
            config.defaultHeaders = {
                'api-key': process.env.AZURE_ASSISTANTS_API_KEY,
                'Content-Type': 'application/json'
            }
            config.apiKey = process.env.AZURE_ASSISTANTS_API_KEY
        }

        if (!this.override && !this.apiKey) {
            throw new Error(
              'Missing AZURE_ASSISTANTS_API_KEY, INSTANCE_NAME, or AZURE_ASSISTANTS_FUNCTIONS_URL environment variable.',
            );
          }
      
          if (this.override) {
            return;
          }
        // this.openai = new OpenAI(config);
    }
    
    async _call(data) { 
      // TO-DO cambiar data para que traiga los datos de la funcion
        const url = `https://${process.env.AZURE_RESOURSE_NAME}.openai.azure.com/openai/assistants?api-version=2024-02-15-preview`;
        const headers = {
            'Content-Type': 'application/json',
            'api-key': `${process.env.AZURE_ASSISTANTS_API_KEY}`
        }
        
        const body = {
          "tools":[ data.functionInfo ],
          "model": "gpt4"
        }
        const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
        });

        const json = await response.json();

        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}: ${json.error.message}`);
        }
        return JSON.stringify(json);
    }
}

module.exports = AzureAIFunctions;