# Azure OpenAI

In order to use Azure OpenAI with this project, specific environment variables must be set in your `.env` file. These variables will be used for constructing the API URLs. 

The variables needed are outlined below:

## Required Variables

* `AZURE_API_KEY`: Your Azure OpenAI API key.
* `AZURE_OPENAI_API_INSTANCE_NAME`: The instance name of your Azure OpenAI API.
* `AZURE_OPENAI_API_DEPLOYMENT_NAME`: The deployment name of your Azure OpenAI API. 
* `AZURE_OPENAI_API_VERSION`: The version of your Azure OpenAI API.

For example, with these variables, the URL for chat completion would look something like:
```plaintext
https://{AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/deployments/{AZURE_OPENAI_API_DEPLOYMENT_NAME}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}
```
You should also consider changing the `AZURE_OPENAI_MODELS` variable to the models available in your deployment.

## Optional Variables

* `AZURE_OPENAI_API_COMPLETIONS_DEPLOYMENT_NAME`: The deployment name for completion. This is currently not in use but may be used in future.
* `AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME`: The deployment name for embedding. This is currently not in use but may be used in future.

These two variables are optional but may be used in future updates of this project.

## Plugin Endpoint Variables

To use Azure with the Plugins endpoint, you need to uncomment the following variable:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint. 
    * Omit it or leave it commented to use the default OpenAI API for Plugins

Please note that this feature may not work as expected with the Plugins endpoint as Azure OpenAI may not support OpenAI Functions yet. You should set the "Functions" off in the Agent settings, and it's recommend to not skip completion with functions off. Leave it commented to use the default OpenAI API.