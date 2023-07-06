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

Note: The Plugins endpoint may not work as expected with Azure OpenAI, which may not support OpenAI Functions yet. Even when results were generated, they were not great compared to the regular OpenAI endpoint. You should set the "Functions" off in the Agent settings, and it's recommend to not skip completion with functions off.

To use Azure with the Plugins endpoint, there are some extra steps to take as the langchain library is particular with envrionment variables:

* `PLUGINS_USE_AZURE`: If set to "true" or any truthy value, this will enable the program to use Azure with the Plugins endpoint. 
* `AZURE_OPENAI_API_KEY`: Your Azure API key must be set to this environment variable, not to be confused with `AZURE_API_KEY`, which can remain as before.
* `OPENAI_API_KEY`: Must be omitted or commented to use Azure with Plugins

These steps are quick workarounds as other solutions would require renaming environment variables. This is due to langchain overriding environment variables, and will have to be solved with a later solution.
