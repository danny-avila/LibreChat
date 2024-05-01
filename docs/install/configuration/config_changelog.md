---
title: 🖥️ Config Changelog
description: Changelog for the custom configuration file
weight: -10
---

# 🖥️ Config Changelog

## v1.0.8

- Added additional fields to [interface config](./custom_config.md#interface-object-structure) to toggle access to specific features:
    - `endpointsMenu`, `modelSelect`, `parameters`, `sidePanel`, `presets`
- Now ensures the following fields always have defaults set:
    - `cache`, `imageOutputType`, `fileStrategy`, `registration`
- Added [`modelSpecs`](./custom_config.md#model-specs-object-structure) for a configurable UI experience, simplifying model selection with specific presets and tools.
- Added [`filteredTools`](./custom_config.md#filteredtools) to disable specific plugins/tools without any changes to the codebase
    - Affects both `gptPlugins` and `assistants` endpoints
- [`iconURL`](./custom_config.md#iconurl) can now be to set to one of the main endpoints to use existing project icons
    - "openAI" | "azureOpenAI" | "google" | "anthropic" | "assistants" | "gptPlugins"
- Invalid YAML format is now logged for easier debugging

## v1.0.7

- Removed `stop` from OpenAI/custom endpoint default parameters
- Added `current_model` option for [`titleModel`](./custom_config.md#titlemodel) and [`summaryModel`](./custom_config.md#summarymodel) endpoint settings in order to use the active conversation's model for those methods.

## v1.0.6

- Added [`imageOutputType`](./custom_config.md#imageoutputtype) field to specify the output type for image generation.
- Added [`secureImageLinks`](./custom_config.md#secureimagelinks) to optionally lock down access to generated images.

## v1.0.5

- Added [Azure OpenAI Assistants configuration](./custom_config.md#assistants) settings
- Added initial [interface settings](./custom_config.md#interface-object-structure) (privacy policy & terms of service)
- Added the following fields to the [Azure Group Config](./custom_config.md#group-object-structure):
    - `serverless`, `addParams`, `dropParams`, `forcePrompt`

## v1.0.4

- Added initial [Azure OpenAI configuration](./custom_config.md#azure-openai-object-structure) settings

## v1.0.3

- Added [OpenAI Assistants configuration](./custom_config.md#assistants-endpoint-object-structure) settings
- Added the following fields to custom endpoint settings:
    - [`addParams`](./custom_config.md#addparams), [`dropParams`](./custom_config.md#dropparams)
- Added [Rate Limit Configuration](./custom_config.md#ratelimits) settings
- Added [File Configuration](./custom_config.md#fileconfig) settings

## v1.0.2
- Added `userIdQuery` to custom endpoint [models](./custom_config.md#models) settings
- Added [Registration Configuration](./custom_config.md#registration) settings
- Added [`headers`](./custom_config.md#headers) to custom endpoint settings

## v1.0.1
- Added [`fileStrategy`](./custom_config.md#filestrategy) to custom config

## v1.0.0

This initial release introduces a robust configuration schema using Zod for validation, designed to manage API endpoints and associated settings in a structured and type-safe manner.

Features:

1. **Endpoint Configuration Schema (`endpointSchema`)**:
   - **Name Validation**: Ensures that the endpoint name is not one of the default `EModelEndpoint` values.
   - **API Key**: Requires a string value for API key identification.
   - **Base URL**: Requires a string value for the base URL of the endpoint.
   - **Models Configuration**:
     - **Default Models**: Requires an array of strings with at least one model specified.
     - **Fetch Option**: Optional boolean to enable model fetching.
   - **Additional Optional Settings**:
     - **Title Convo**: Optional boolean to toggle conversation titles.
     - **Title Method**: Optional choice between 'completion' and 'functions' methods.
     - **Title Model**: Optional string for model specification in titles.
     - **Summarize**: Optional boolean for enabling summary features.
     - **Summary Model**: Optional string specifying the model used for summaries.
     - **Force Prompt**: Optional boolean to force prompt inclusion.
     - **Model Display Label**: Optional string for labeling the model in UI displays.

2. **Main Configuration Schema (`configSchema`)**:
   - **Version**: String to specify the config schema version.
   - **Cache**: Boolean to toggle caching mechanisms.
   - **Endpoints**:
     - **Custom Endpoints**: Array of partially applied `endpointSchema` to allow custom endpoint configurations.
   - Ensures strict object structure without additional properties.

