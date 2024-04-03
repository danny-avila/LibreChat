---
title: 🗃️ RAG API (Chat with Files)
description: Retrieval-Augmented Generation (RAG) API for document indexing and retrieval using Langchain and FastAPI. This API integrates with LibreChat to provide context-aware responses based on user-uploaded files.
weight: -10
---

# RAG API

The **RAG (Retrieval-Augmented Generation) API** is a powerful tool that integrates with LibreChat to provide context-aware responses based on user-uploaded files.

It leverages LangChain, PostgresQL + PGVector, and Python FastAPI to index and retrieve relevant documents, enhancing the conversational experience.

![image](https://github.com/danny-avila/LibreChat/assets/110412045/f1298f66-bf1d-4499-a582-23430b481f17)

---

**Currently, this feature is available to all Custom Endpoints, OpenAI, Azure OpenAi, Anthropic, and Google.**

OpenAI Assistants have their own implementation of RAG through the "Retrieval" capability. Learn more about it [here.](https://platform.openai.com/docs/assistants/tools/knowledge-retrieval) 

It will still be useful to implement usage of the RAG API with the Assistants API since OpenAI charges for both file storage, and use of "Retrieval," and will be introduced in a future update.

Plugins support is not enabled as the whole "plugin/tool" framework will get a complete rework soon, making tools available to most endpoints (ETA Summer 2024).

**Still confused about RAG?** [Read the section I wrote below](#what-is-rag) explaining the general concept in more detail with a link to a helpful video.

## Features

- **Document Indexing**: The RAG API indexes user-uploaded files, creating embeddings for efficient retrieval.
- **Semantic Search**: It performs semantic search over the indexed documents to find the most relevant information based on the user's input.
- **Context-Aware Responses**: By augmenting the user's prompt with retrieved information, the API enables LibreChat to generate more accurate and contextually relevant responses.
- **Asynchronous Processing**: The API supports asynchronous operations for improved performance and scalability.
- **Flexible Configuration**: It allows customization of various parameters such as chunk size, overlap, and embedding models.

## Setup

To set up the RAG API with LibreChat, follow these steps:

### Docker Setup

For Docker, the setup is configured for you in both the default `docker-compose.yml` and `deploy-compose.yml` files, and you will just need to make sure you are using the latest docker image and compose files. Make sure to read the [Updating LibreChat guide for Docker](../install/installation/docker_compose_install.md#updating-librechat) if you are unsure how to update your Docker instance.

Docker uses the "lite" image of the RAG API by default, which only supports remote embeddings, leveraging embeddings proccesses from OpenAI or a remote service you have configured for HuggingFace/Ollama.

Local embeddings are supported by changing the image used by the default compose file, from `ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest` to `ghcr.io/danny-avila/librechat-rag-api-dev:latest`.

As always, make these changes in your [Docker Compose Override File](../install/configuration/docker_override.md). You can find an example for exactly how to change the image in `docker-compose.override.yml.example` at the root of the project.

If you wish to see an example of a compose file that only includes the PostgresQL + PGVector database and the Python API, see `rag.yml` file at the root of the project.

**Important:** When using the default docker setup, the .env file, where configuration options can be set for the RAG API, is shared between LibreChat and the RAG API.

### Local Setup

Local, non-container setup is more hands-on, and for this you can refer to the [RAG API repo.](https://github.com/danny-avila/rag_api/)

In a local setup, you will need to manually set the `RAG_API_URL` in your LibreChat `.env` file to where it's available from your setup.

This contrasts Docker, where is already set in the default `docker-compose.yml` file.

## Configuration

The RAG API provides several configuration options that can be set using environment variables from an `.env` file accessible to the API. Most of them are optional, asides from the credentials/paths necessary for the provider you configured. In the default setup, only `RAG_OPENAI_API_KEY` is required.

> !!! **Important:** When using the default docker setup, the .env file is shared between LibreChat and the RAG API. For this reason, it's important to define the needed variables shown in the [RAG API readme.md](https://github.com/danny-avila/rag_api/blob/main/README.md)

Here are some notable configurations:

- `RAG_OPENAI_API_KEY`: The API key for OpenAI API Embeddings (if using default settings).
    - Note: `OPENAI_API_KEY` will work but `RAG_OPENAI_API_KEY` will override it in order to not conflict with the LibreChat credential.
- `RAG_PORT`: The port number where the API server will run. Defaults to port 8000.
- `RAG_HOST`: The hostname or IP address where the API server will run. Defaults to "0.0.0.0"
- `COLLECTION_NAME`: The name of the collection in the vector store. Default is "testcollection".
- `CHUNK_SIZE`: The size of the chunks for text processing. Default is "1500".
- `CHUNK_OVERLAP`: The overlap between chunks during text processing. Default is "100".
- `EMBEDDINGS_PROVIDER`: The embeddings provider to use. Options are "openai", "azure", "huggingface", "huggingfacetei", or "ollama". Default is "openai".
- `EMBEDDINGS_MODEL`: The specific embeddings model to use from the configured provider. Default is dependent on the provider; for "openai", the model is "text-embedding-3-small".

There are several more configuration options.

For a complete list and their descriptions, please refer to the [RAG API repo.](https://github.com/danny-avila/rag_api/)

## Usage

Once the RAG API is set up and running, it seamlessly integrates with LibreChat. When a user uploads files to a conversation, the RAG API indexes those files and uses them to provide context-aware responses.

**To utilize the RAG API effectively:**

1. Ensure that the necessary files are uploaded to the conversation in LibreChat. If `RAG_API_URL` is not configured, or is not reachable, the file upload will fail.
2. As the user interacts with the chatbot, the RAG API will automatically retrieve relevant information from the indexed files based on the user's input.
3. The retrieved information will be used to augment the user's prompt, enabling LibreChat to generate more accurate and contextually relevant responses.
4. Craft your prompts carefully when you attach files as the default behavior is to query the vector store upon every new message to a conversation with a file attached. 
    - You can disable the default behavior by toggling the "Resend Files" option to an "off" state, found in the conversation settings.
    - Doing so allows for targeted file queries, making it so that the "retrieval" will only be done when files are explicitly attached to a message.
    - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/29a2468d-85ac-40d7-90be-a945301c5729)
5. You only have to upload a file once to use it multiple times for RAG.
    - You can attach uploaded/indexed files to any new message or conversation using the Side Panel:
    - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/b40cb3d3-e6e7-46ec-bc74-65d194f55a1e)
    - Note: The files must be in the "Host" storage, as "OpenAI" files are treated differently and exclusive to Assistants. In other words, they must not have been uploaded when the Assistants endpoint was selected and active. You can view and manage your files by clicking here from the Side Panel.
    - ![image](https://github.com/danny-avila/LibreChat/assets/110412045/1f27e974-4124-4ee3-8091-13514cb4cbca)


## Troubleshooting

If you encounter any issues while setting up or using the RAG API, consider the following:

- Double-check that all the required environment variables are correctly set in your `.env` file.
- Ensure that the vector database is properly configured and accessible.
- Verify that the OpenAI API key or other necessary credentials are valid.
- Check both the LibreChat and RAG API logs for any error messages or warnings.

If the problem persists, please refer to the RAG API documentation or seek assistance from the LibreChat community on GitHub Discussions or Discord.

## What is RAG?

RAG, or Retrieval-Augmented Generation, is an AI framework designed to improve the quality and accuracy of responses generated by large language models (LLMs). It achieves this by grounding the LLM on external sources of knowledge, supplementing the model's internal representation of information.

### Key Benefits of RAG

1. **Access to up-to-date and reliable facts**: RAG ensures that the LLM has access to the most current and reliable information by retrieving relevant facts from an external knowledge base.
2. **Transparency and trust**: Users can access the model's sources, allowing them to verify the accuracy of the generated responses and build trust in the system.
3. **Reduced data leakage and hallucinations**: By grounding the LLM on a set of external, verifiable facts, RAG reduces the chances of the model leaking sensitive data or generating incorrect or misleading information.
4. **Lower computational and financial costs**: RAG reduces the need for continuous training and updating of the model's parameters, potentially lowering the computational and financial costs of running LLM-powered chatbots in an enterprise setting.

### How RAG Works

RAG consists of two main phases: retrieval and content generation.

1. **Retrieval Phase**: Algorithms search for and retrieve snippets of information relevant to the user's prompt or question from an external knowledge base. In an open-domain, consumer setting, these facts can come from indexed documents on the internet. In a closed-domain, enterprise setting, a narrower set of sources are typically used for added security and reliability.
2. **Generative Phase**: The retrieved external knowledge is appended to the user's prompt and passed to the LLM. The LLM then draws from the augmented prompt and its internal representation of its training data to synthesize a tailored, engaging answer for the user. The answer can be passed to a chatbot with links to its sources.

### Challenges and Ongoing Research

While RAG is currently one of the best-known tools for grounding LLMs on the latest, verifiable information and lowering the costs of constant retraining and updating, it's not perfect. Some challenges include:

1. **Recognizing unanswerable questions**: LLMs need to be explicitly trained to recognize questions they can't answer based on the available information. This may require fine-tuning on thousands of examples of answerable and unanswerable questions.
2. **Improving retrieval and generation**: Ongoing research focuses on innovating at both ends of the RAG process: improving the retrieval of the most relevant information possible to feed the LLM, and optimizing the structure of that information to obtain the richest responses from the LLM.

In summary, RAG is a powerful framework that enhances the capabilities of LLMs by grounding them on external, verifiable knowledge. It helps to ensure more accurate, up-to-date, and trustworthy responses while reducing the costs associated with continuous model retraining. As research in this area progresses, we can expect further improvements in the quality and efficiency of LLM-powered conversational AI systems.

For a more detailed explanation of RAG, you can watch this informative video by IBM on Youtube:

[![RAG Explained](https://img.youtube.com/vi/T-D1OfcDW1M/0.jpg)](https://www.youtube.com/watch?v=T-D1OfcDW1M)

## Conclusion

The RAG API is a powerful addition to LibreChat, enabling context-aware responses based on user-uploaded files. By leveraging Langchain and FastAPI, it provides efficient document indexing, retrieval, and generation capabilities. With its flexible configuration options and seamless integration, the RAG API enhances the conversational experience in LibreChat.

For more detailed information on the RAG API, including API endpoints, request/response formats, and advanced configuration, please refer to the official RAG API documentation.
