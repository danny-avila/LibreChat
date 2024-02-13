/**
 * @namespace typedefs
 */

/**
 * @exports OpenAI
 * @typedef {import('openai').OpenAI} OpenAI
 * @memberof typedefs
 */

/**
 * @exports Assistant
 * @typedef {import('librechat-data-provider').Assistant} Assistant
 * @memberof typedefs
 */

/**
 * @exports AssistantDocument
 * @typedef {import('librechat-data-provider').AssistantDocument} AssistantDocument
 * @memberof typedefs
 */

/**
 * @exports OpenAIFile
 * @typedef {import('librechat-data-provider').File} OpenAIFile
 * @memberof typedefs
 */

/**
 * @exports TConfig
 * @typedef {import('librechat-data-provider').TConfig} TConfig
 * @memberof typedefs
 */

/**
 * @exports TPlugin
 * @typedef {import('librechat-data-provider').TPlugin} TPlugin
 * @memberof typedefs
 */

/**
 * @exports TCustomConfig
 * @typedef {import('librechat-data-provider').TCustomConfig} TCustomConfig
 * @memberof typedefs
 */

/**
 * @exports TMessage
 * @typedef {import('librechat-data-provider').TMessage} TMessage
 * @memberof typedefs
 */

/**
 * @exports TPlugin
 * @typedef {import('librechat-data-provider').TPlugin} TPlugin
 * @memberof typedefs
 */

/**
 * @exports FileSources
 * @typedef {import('librechat-data-provider').FileSources} FileSources
 * @memberof typedefs
 */

/**
 * @exports TMessage
 * @typedef {import('librechat-data-provider').TMessage} TMessage
 * @memberof typedefs
 */

/**
 * @exports ImageFile
 * @typedef {import('librechat-data-provider').ImageFile} ImageFile
 * @memberof typedefs
 */

/**
 * @exports ActionRequest
 * @typedef {import('librechat-data-provider').ActionRequest} ActionRequest
 * @memberof typedefs
 */

/**
 * @exports Action
 * @typedef {import('librechat-data-provider').Action} Action
 * @memberof typedefs
 */

/**
 * @exports ActionMetadata
 * @typedef {import('librechat-data-provider').ActionMetadata} ActionMetadata
 * @memberof typedefs
 */

/**
 * @exports ActionAuth
 * @typedef {import('librechat-data-provider').ActionAuth} ActionAuth
 * @memberof typedefs
 */

/**
 * @exports DeleteFilesBody
 * @typedef {import('librechat-data-provider').DeleteFilesBody} DeleteFilesBody
 * @memberof typedefs
 */

/**
 * @exports FileMetadata
 * @typedef {Object} FileMetadata
 * @property {string} file_id - The identifier of the file.
 * @property {string} [temp_file_id] - The temporary identifier of the file.
 * @property {string} endpoint - The conversation endpoint origin for the file upload.
 * @property {string} [assistant_id] - The assistant ID if file upload is in the `knowledge` context.
 * @memberof typedefs
 */

/**
 * @typedef {Object} ImageOnlyMetadata
 * @property {number} width - The width of the image.
 * @property {number} height - The height of the image.
 *
 * @typedef {FileMetadata & ImageOnlyMetadata} ImageMetadata
 * @memberof typedefs
 */

/**
 * @exports MongoFile
 * @typedef {import('~/models/schema/fileSchema.js').MongoFile} MongoFile
 * @memberof typedefs
 */

/**
 * @exports AssistantCreateParams
 * @typedef {import('librechat-data-provider').AssistantCreateParams} AssistantCreateParams
 * @memberof typedefs
 */

/**
 * @exports AssistantUpdateParams
 * @typedef {import('librechat-data-provider').AssistantUpdateParams} AssistantUpdateParams
 * @memberof typedefs
 */

/**
 * @exports AssistantListParams
 * @typedef {import('librechat-data-provider').AssistantListParams} AssistantListParams
 * @memberof typedefs
 */

/**
 * @exports AssistantListResponse
 * @typedef {import('librechat-data-provider').AssistantListResponse} AssistantListResponse
 * @memberof typedefs
 */

/**
 * @exports ContentPart
 * @typedef {import('librechat-data-provider').ContentPart} ContentPart
 * @memberof typedefs
 */

/**
 * @exports StepTypes
 * @typedef {import('librechat-data-provider').StepTypes} StepTypes
 * @memberof typedefs
 */

/**
 * @exports TContentData
 * @typedef {import('librechat-data-provider').TContentData} TContentData
 * @memberof typedefs
 */

/**
 * @exports ContentPart
 * @typedef {import('librechat-data-provider').ContentPart} ContentPart
 * @memberof typedefs
 */

/**
 * @exports PartMetadata
 * @typedef {import('librechat-data-provider').PartMetadata} PartMetadata
 * @memberof typedefs
 */

/**
 * @exports ThreadMessage
 * @typedef {import('openai').OpenAI.Beta.Threads.ThreadMessage} ThreadMessage
 * @memberof typedefs
 */

/**
 * @exports TAssistantEndpoint
 * @typedef {import('librechat-data-provider').TAssistantEndpoint} TAssistantEndpoint
 * @memberof typedefs
 */

/**
 * Represents details of the message creation by the run step, including the ID of the created message.
 *
 * @exports MessageCreationStepDetails
 * @typedef {Object} MessageCreationStepDetails
 * @property {Object} message_creation - Details of the message creation.
 * @property {string} message_creation.message_id - The ID of the message that was created by this run step.
 * @property {'message_creation'} type - Always 'message_creation'.
 * @memberof typedefs
 */

/**
 * Represents a text log output from the Code Interpreter tool call.
 * @typedef {Object} CodeLogOutput
 * @property {'logs'} type - Always 'logs'.
 * @property {string} logs - The text output from the Code Interpreter tool call.
 */

/**
 * Represents an image output from the Code Interpreter tool call.
 * @typedef {Object} CodeImageOutput
 * @property {'image'} type - Always 'image'.
 * @property {Object} image - The image object.
 * @property {string} image.file_id - The file ID of the image.
 */

/**
 * Details of the Code Interpreter tool call the run step was involved in.
 * Includes the tool call ID, the code interpreter definition, and the type of tool call.
 *
 * @typedef {Object} CodeToolCall
 * @property {string} id - The ID of the tool call.
 * @property {Object} code_interpreter - The Code Interpreter tool call definition.
 * @property {string} code_interpreter.input - The input to the Code Interpreter tool call.
 * @property {Array<(CodeLogOutput | CodeImageOutput)>} code_interpreter.outputs - The outputs from the Code Interpreter tool call.
 * @property {'code_interpreter'} type - The type of tool call, always 'code_interpreter'.
 * @memberof typedefs
 */

/**
 * Details of a Function tool call the run step was involved in.
 * Includes the tool call ID, the function definition, and the type of tool call.
 *
 * @typedef {Object} FunctionToolCall
 * @property {string} id - The ID of the tool call object.
 * @property {Object} function - The definition of the function that was called.
 * @property {string} function.arguments - The arguments passed to the function.
 * @property {string} function.name - The name of the function.
 * @property {string|null} function.output - The output of the function, null if not submitted.
 * @property {'function'} type - The type of tool call, always 'function'.
 * @memberof typedefs
 */

/**
 * Details of a Retrieval tool call the run step was involved in.
 * Includes the tool call ID and the type of tool call.
 *
 * @typedef {Object} RetrievalToolCall
 * @property {string} id - The ID of the tool call object.
 * @property {unknown} retrieval - An empty object for now.
 * @property {'retrieval'} type - The type of tool call, always 'retrieval'.
 * @memberof typedefs
 */

/**
 * Details of the tool calls involved in a run step.
 * Can be associated with one of three types of tools: `code_interpreter`, `retrieval`, or `function`.
 *
 * @typedef {Object} ToolCallsStepDetails
 * @property {Array<CodeToolCall | RetrievalToolCall | FunctionToolCall>} tool_calls - An array of tool calls the run step was involved in.
 * @property {'tool_calls'} type - Always 'tool_calls'.
 * @memberof typedefs
 */

/**
 * Details of the tool calls involved in a run step.
 * Can be associated with one of three types of tools: `code_interpreter`, `retrieval`, or `function`.
 *
 * @exports StepToolCall
 * @typedef {(CodeToolCall | RetrievalToolCall | FunctionToolCall) & PartMetadata} StepToolCall
 * @memberof typedefs
 */

/**
 * Represents a tool call object required for certain actions in the OpenAI API,
 * including the function definition and type of the tool call.
 *
 * @exports RequiredActionFunctionToolCall
 * @typedef {Object} RequiredActionFunctionToolCall
 * @property {string} id - The ID of the tool call, referenced when submitting tool outputs.
 * @property {Object} function - The function definition associated with the tool call.
 * @property {string} function.arguments - The arguments that the model expects to be passed to the function.
 * @property {string} function.name - The name of the function.
 * @property {'function'} type - The type of tool call the output is required for, currently always 'function'.
 * @memberof typedefs
 */

/**
 * @exports RunManager
 * @typedef {import('./server/services/Runs/RunManager.js').RunManager} RunManager
 * @memberof typedefs
 */

/**
 * @exports Thread
 * @typedef {Object} Thread
 * @property {string} id - The identifier of the thread.
 * @property {'thread'} object - The object type, always 'thread'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the thread was created.
 * @property {Object} [metadata] - Optional metadata associated with the thread.
 * @property {Message[]} [messages] - An array of messages associated with the thread.
 * @memberof typedefs
 */

/**
 * @exports Message
 * @typedef {Object} Message
 * @property {string} id - The identifier of the message.
 * @property {'thread.message'} object - The object type, always 'thread.message'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the message was created.
 * @property {string} thread_id - The thread ID that this message belongs to.
 * @property {'user'|'assistant'} role - The entity that produced the message. One of 'user' or 'assistant'.
 * @property {Object[]} content - The content of the message in an array of text and/or images.
 * @property {'text'|'image_file'} content[].type - The type of content, either 'text' or 'image_file'.
 * @property {Object} [content[].text] - The text content, present if type is 'text'.
 * @property {string} content[].text.value - The data that makes up the text.
 * @property {Object[]} [content[].text.annotations] - Annotations for the text content.
 * @property {Object} [content[].image_file] - The image file content, present if type is 'image_file'.
 * @property {string} content[].image_file.file_id - The File ID of the image in the message content.
 * @property {string[]} [file_ids] - Optional list of File IDs for the message.
 * @property {string|null} [assistant_id] - If applicable, the ID of the assistant that authored this message.
 * @property {string|null} [run_id] - If applicable, the ID of the run associated with the authoring of this message.
 * @property {Object} [metadata] - Optional metadata for the message, a map of key-value pairs.
 * @memberof typedefs
 */

/**
 * @exports UserMessageContent
 * @typedef {Object} UserMessageContent
 * @property {Object[]} content - The content of the message in an array of text and/or images.
 * @property {string} content[].type - The type of content, either 'text' or 'image_file'.
 * @property {Object} [content[].text] - The text content, present if type is 'text'.
 * @property {string} content[].text.value - The data that makes up the text.
 * @property {Object} [content[].image_url] - The image file content, present if type is 'image_file'.
 * @property {string} content[].image_url.url - The File ID of the image in the message content.
 * @property {'auto' | 'low' | 'high'} content[].image_url.detail: 'auto' - the quality to use for the image, either 'auto', 'low', or 'high'.
 * @memberof typedefs
 */

/**
 * Represents a message payload with various potential properties,
 * including roles, sender information, and content.
 *
 * @typedef {Object} PayloadMessage
 * @property {string} [role] - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} [name] - The name associated with the message.
 * @property {string} [sender] - The sender of the message.
 * @property {string} [text] - The text content of the message.
 * @property {(string|Array<UserMessageContent>)} [content] - The content of the message, which could be a string or an array of the 'content' property from the Message type.
 * @memberof typedefs
 */

/**
 * @exports FunctionTool
 * @typedef {Object} FunctionTool
 * @property {'function'} type - The type of tool, 'function'.
 * @property {Object} function - The function definition.
 * @property {string} function.description - A description of what the function does.
 * @property {string} function.name - The name of the function to be called.
 * @property {Object} function.parameters - The parameters the function accepts, described as a JSON Schema object.
 * @memberof typedefs
 */

/**
 * @exports Tool
 * @typedef {Object} Tool
 * @property {'code_interpreter'|'retrieval'|'function'} type - The type of tool, can be 'code_interpreter', 'retrieval', or 'function'.
 * @property {FunctionTool} [function] - The function tool, present if type is 'function'.
 * @memberof typedefs
 */

/**
 * @exports Run
 * @typedef {Object} Run
 * @property {string} id - The identifier of the run.
 * @property {string} object - The object type, always 'thread.run'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run was created.
 * @property {string} thread_id - The ID of the thread that was executed on as a part of this run.
 * @property {string} assistant_id - The ID of the assistant used for execution of this run.
 * @property {'queued'|'in_progress'|'requires_action'|'cancelling'|'cancelled'|'failed'|'completed'|'expired'} status - The status of the run: queued, in_progress, requires_action, cancelling, cancelled, failed, completed, or expired.
 * @property {Object} [required_action] - Details on the action required to continue the run.
 * @property {string} required_action.type - The type of required action, always 'submit_tool_outputs'.
 * @property {Object} required_action.submit_tool_outputs - Details on the tool outputs needed for the run to continue.
 * @property {Object[]} required_action.submit_tool_outputs.tool_calls - A list of the relevant tool calls.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].id - The ID of the tool call.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].type - The type of tool call the output is required for, always 'function'.
 * @property {Object} required_action.submit_tool_outputs.tool_calls[].function - The function definition.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].function.name - The name of the function.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].function.arguments - The arguments that the model expects you to pass to the function.
 * @property {Object} [last_error] - The last error associated with this run.
 * @property {string} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expires_at] - The Unix timestamp (in seconds) for when the run will expire.
 * @property {number} [started_at] - The Unix timestamp (in seconds) for when the run was started.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run was completed.
 * @property {string} [model] - The model that the assistant used for this run.
 * @property {string} [instructions] - The instructions that the assistant used for this run.
 * @property {string} [additional_instructions] - Optional. Appends additional instructions
 * at theend of the instructions for the run. This is useful for modifying
 * @property {Tool[]} [tools] - The list of tools used for this run.
 * @property {string[]} [file_ids] - The list of File IDs used for this run.
 * @property {Object} [metadata] - Metadata associated with this run.
 * @property {Object} [usage] -  Usage statistics related to the run. This value will be `null` if the run is not in a terminal state (i.e. `in_progress`, `queued`, etc.).
 * @property {number} [usage.completion_tokens] - Number of completion tokens used over the course of the run.
 * @property {number} [usage.prompt_tokens] - Number of prompt tokens used over the course of the run.
 * @property {number} [usage.total_tokens] - Total number of tokens used (prompt + completion).
 * @memberof typedefs
 */

/**
 * @exports RunStep
 * @typedef {Object} RunStep
 * @property {string} id - The identifier of the run step.
 * @property {string} object - The object type, always 'thread.run.step'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run step was created.
 * @property {string} assistant_id - The ID of the assistant associated with the run step.
 * @property {string} thread_id - The ID of the thread that was run.
 * @property {string} run_id - The ID of the run that this run step is a part of.
 * @property {'message_creation' | 'tool_calls'} type - The type of run step.
 * @property {'in_progress' | 'cancelled' | 'failed' | 'completed' | 'expired'} status - The status of the run step.
 * @property {MessageCreationStepDetails | ToolCallsStepDetails} step_details - The details of the run step.
 * @property {Object} [last_error] - The last error associated with this run step.
 * @property {'server_error' | 'rate_limit_exceeded'} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expired_at] - The Unix timestamp (in seconds) for when the run step expired.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run step was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run step failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run step completed.
 * @property {Object} [metadata] - Metadata associated with this run step, a map of up to 16 key-value pairs.
 * @memberof typedefs
 */

/**
 * @exports StepMessage
 * @typedef {Object} StepMessage
 * @property {Message} message - The complete message object created by the step.
 * @property {string} id - The identifier of the run step.
 * @property {string} object - The object type, always 'thread.run.step'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run step was created.
 * @property {string} assistant_id - The ID of the assistant associated with the run step.
 * @property {string} thread_id - The ID of the thread that was run.
 * @property {string} run_id - The ID of the run that this run step is a part of.
 * @property {'message_creation'|'tool_calls'} type - The type of run step, either 'message_creation' or 'tool_calls'.
 * @property {'in_progress'|'cancelled'|'failed'|'completed'|'expired'} status - The status of the run step, can be 'in_progress', 'cancelled', 'failed', 'completed', or 'expired'.
 * @property {Object} step_details - The details of the run step.
 * @property {Object} [last_error] - The last error associated with this run step.
 * @property {string} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expired_at] - The Unix timestamp (in seconds) for when the run step expired.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run step was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run step failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run step completed.
 * @property {Object} [metadata] - Metadata associated with this run step, a map of up to 16 key-value pairs.
 * @memberof typedefs
 */

/**
 * @exports AgentAction
 * @typedef {Object} AgentAction
 * @property {string} tool - The name of the tool used.
 * @property {string} toolInput - The input provided to the tool.
 * @property {string} log - A log or message associated with the action.
 * @memberof typedefs
 */

/**
 * @exports AgentFinish
 * @typedef {Object} AgentFinish
 * @property {Record<string, any>} returnValues - The return values of the agent's execution.
 * @property {string} log - A log or message associated with the finish.
 * @memberof typedefs
 */

/**
 * @exports OpenAIAssistantFinish
 * @typedef {AgentFinish & { run_id: string; thread_id: string; }} OpenAIAssistantFinish
 * @memberof typedefs
 */

/**
 * @exports OpenAIAssistantAction
 * @typedef {AgentAction & { toolCallId: string; run_id: string; thread_id: string; }} OpenAIAssistantAction
 * @memberof typedefs
 */

/**
 * @exports EndpointServiceConfig
 * @typedef {Object} EndpointServiceConfig
 * @property {string} openAIApiKey - The API key for OpenAI.
 * @property {string} azureOpenAIApiKey - The API key for Azure OpenAI.
 * @property {boolean} useAzurePlugins - Flag to indicate if Azure plugins are used.
 * @property {boolean} userProvidedOpenAI - Flag to indicate if OpenAI API key is user provided.
 * @property {string} googleKey - The Palm key.
 * @property {boolean|{userProvide: boolean}} [openAI] - Flag to indicate if OpenAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [assistant] - Flag to indicate if Assistant endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [azureOpenAI] - Flag to indicate if Azure OpenAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [chatGPTBrowser] - Flag to indicate if ChatGPT Browser endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [anthropic] - Flag to indicate if Anthropic endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [bingAI] - Flag to indicate if BingAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [google] - Flag to indicate if BingAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean, userProvideURL: boolean, name: string}} [custom] - Custom Endpoint configuration.
 * @memberof typedefs
 */

/**
 * @exports Plugin
 * @typedef {Object} Plugin
 * @property {string} pluginKey - The key of the plugin.
 * @property {string} name - The name of the plugin.
 * @memberof typedefs
 */

/**
 * @exports GptPlugins
 * @typedef {Object} GptPlugins
 * @property {Plugin[]} plugins - An array of plugins available.
 * @property {string[]} availableAgents - Available agents, 'classic' or 'functions'.
 * @property {boolean} userProvide - A flag indicating if the user has provided the data.
 * @property {boolean} azure - A flag indicating if azure plugins are used.
 * @memberof typedefs
 */

/**
 * @exports DefaultConfig
 * @typedef {Object} DefaultConfig
 * @property {boolean|{userProvide: boolean}} [openAI] - Flag to indicate if OpenAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [assistant] - Flag to indicate if Assistant endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [azureOpenAI] - Flag to indicate if Azure OpenAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [chatGPTBrowser] - Flag to indicate if ChatGPT Browser endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [anthropic] - Flag to indicate if Anthropic endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [bingAI] - Flag to indicate if BingAI endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean}} [google] - Flag to indicate if Google endpoint is user provided, or its configuration.
 * @property {boolean|{userProvide: boolean, userProvideURL: boolean, name: string}} [custom] - Custom Endpoint configuration.
 * @property {boolean|GptPlugins} [gptPlugins] - Configuration for GPT plugins.
 * @memberof typedefs
 */

/**
 * @exports EndpointConfig
 * @typedef {boolean|TConfig} EndpointConfig
 * @memberof typedefs
 */

/**
 * @exports EndpointWithOrder
 * @typedef {Object} EndpointWithOrder
 * @property {EndpointConfig} config - The configuration of the endpoint.
 * @property {number} order - The order of the endpoint.
 * @memberof typedefs
 */

/**
 * @exports RequiredAction
 * @typedef {Object} RequiredAction
 * @property {string} tool - The name of the function.
 * @property {Object} toolInput - The args to invoke the function with.
 * @property {string} toolCallId - The ID of the tool call.
 * @property {Run['id']} run_id - Run identifier.
 * @property {Thread['id']} thread_id - Thread identifier.
 * @memberof typedefs
 */

/**
 * @exports StructuredTool
 * @typedef {Object} StructuredTool
 * @property {string} name - The name of the function.
 * @property {string} description - The description of the function.
 * @property {import('zod').ZodTypeAny} schema - The structured zod schema.
 * @memberof typedefs
 */

/**
 * @exports ToolOutput
 * @typedef {Object} ToolOutput
 * @property {string} tool_call_id - The ID of the tool call.
 * @property {Object} output - The output of the tool, which can vary in structure.
 * @memberof typedefs
 */

/**
 * @exports ToolOutputs
 * @typedef {Object} ToolOutputs
 * @property {ToolOutput[]} tool_outputs - Array of tool outputs.
 * @memberof typedefs
 */

/**
 * @typedef {Object} ModelOptions
 * @property {string} modelName - The name of the model.
 * @property {number} [temperature] - The temperature setting for the model.
 * @property {number} [presence_penalty] - The presence penalty setting.
 * @property {number} [frequency_penalty] - The frequency penalty setting.
 * @property {number} [max_tokens] - The maximum number of tokens to generate.
 * @memberof typedefs
 */

/**
 * @typedef {Object} ConfigOptions
 * @property {string} [basePath] - The base path for the API requests.
 * @property {Object} [baseOptions] - Base options for the API requests, including headers.
 * @property {Object} [httpAgent] - The HTTP agent for the request.
 * @property {Object} [httpsAgent] - The HTTPS agent for the request.
 * @memberof typedefs
 */

/**
 * @typedef {Object} Callbacks
 * @property {Function} [handleChatModelStart] - A callback function for handleChatModelStart
 * @property {Function} [handleLLMEnd] - A callback function for handleLLMEnd
 * @property {Function} [handleLLMError] - A callback function for handleLLMError
 * @memberof typedefs
 */

/**
 * @typedef {Object} AzureOptions
 * @property {string} [azureOpenAIApiKey] - The Azure OpenAI API key.
 * @property {string} [azureOpenAIApiInstanceName] - The Azure OpenAI API instance name.
 * @property {string} [azureOpenAIApiDeploymentName] - The Azure OpenAI API deployment name.
 * @property {string} [azureOpenAIApiVersion] - The Azure OpenAI API version.
 * @memberof typedefs
 */

/**
 * @typedef {Object} TokenConfig
 * A configuration object mapping model keys to their respective prompt, completion rates, and context limit.
 * @property {number} prompt - The prompt rate
 * @property {number} completion - The completion rate
 * @property {number} context - The maximum context length supported by the model.
 * @memberof typedefs
 */

/**
 * @typedef {Record<string, TokenConfig>} EndpointTokenConfig
 * An endpoint's config object mapping model keys to their respective prompt, completion rates, and context limit.
 * @memberof typedefs
 */

/**
 * @typedef {Object} ResponseMessage
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} thread_id - The ID of the thread.
 * @property {string} messageId - The ID of the message (from LibreChat).
 * @property {string} parentMessageId - The ID of the parent message.
 * @property {string} user - The ID of the user.
 * @property {string} assistant_id - The ID of the assistant.
 * @property {string} role - The role of the response.
 * @property {string} model - The model used in the response.
 * @property {ContentPart[]} content - The content parts accumulated from the run.
 * @memberof typedefs
 */

/**
 * @typedef {Object} RunResponse
 * @property {Run} run - The detailed information about the run.
 * @property {RunStep[]} steps - An array of steps taken during the run.
 * @property {StepMessage[]} messages - An array of messages related to the run.
 * @memberof typedefs
 */

/**
 * @callback InProgressFunction
 * @param {Object} params - The parameters for the in progress step.
 * @param {RunStep} params.step - The step object with details about the message creation.
 * @returns {Promise<void>} - A promise that resolves when the step is processed.
 * @memberof typedefs
 */

// /**
//  * @typedef {OpenAI & {
// * req: Express.Request,
// * res: Express.Response
// * getPartialText: () => string,
// * processedFileIds: Set<string>,
// * mappedOrder: Map<string, number>,
// * completeToolCallSteps: Set<string>,
// * seenCompletedMessages: Set<string>,
// * seenToolCalls: Map<string, StepToolCall>,
// * progressCallback: (options: Object) => void,
// * addContentData: (data: TContentData) => void,
// * responseMessage: ResponseMessage,
// * }} OpenAIClient - for reference only
// */

/**
 * @typedef {Object} OpenAIClientType
 *
 * @property {Express.Request} req - The Express request object.
 * @property {Express.Response} res - The Express response object.
 * @property {?import('https-proxy-agent').HttpsProxyAgent} httpAgent - An optional HTTP proxy agent for the request.

 * @property {() => string} getPartialText - Retrieves the current tokens accumulated by `progressCallback`.
 *
 * Note: not used until real streaming is implemented by OpenAI.
 *
 * @property {string} responseText -The accumulated text values for the current run.
 * @property {Set<string>} processedFileIds - A set of IDs for processed files.
 * @property {Map<string, number>} mappedOrder - A map to maintain the order of individual `tool_calls` and `steps`.
 * @property {Set<string>} [attachedFileIds] - A set of user attached file ids; necessary to track which files are downloadable.
 * @property {Set<string>} completeToolCallSteps - A set of completed tool call steps.
 * @property {Set<string>} seenCompletedMessages - A set of completed messages that have been seen/processed.
 * @property {Map<string, StepToolCall>} seenToolCalls - A map of tool calls that have been seen/processed.
 * @property {(data: TContentData) => void} addContentData - Updates the response message's relevant
 * @property {InProgressFunction} in_progress - Updates the response message's relevant
 * content array with the part by index & sends intermediate SSE message with content data.
 *
 * Note: does not send intermediate SSE message for messages, which are streamed
 * (may soon be streamed) directly from OpenAI API.
 *
 * @property {ResponseMessage} responseMessage - A message object for responses.
 *
 * @typedef {OpenAI & OpenAIClientType} OpenAIClient
 */

/**
 * The body of the request to create a run, specifying the assistant, model,
 * instructions, and any additional parameters needed for the run.
 *
 * @typedef {Object} CreateRunBody
 * @property {string} assistant_id - The ID of the assistant to use for this run.
 * @property {string} [model] - Optional. The ID of the model to be used for this run.
 * @property {string} [instructions] - Optional. Override the default system message of the assistant.
 * @property {string} [additional_instructions] - Optional. Appends additional instructions
 * at the end of the instructions for the run. Useful for modifying behavior on a per-run basis without overriding other instructions.
 * @property {Object[]} [tools] - Optional. Override the tools the assistant can use for this run. Should include tool call ID and the type of tool call.
 * @property {string[]} [file_ids] - Optional. List of File IDs the assistant can use for this run.
 * **Note:** The API seems to prefer files added to messages, not runs.
 * @property {Object} [metadata] - Optional. Metadata for the run.
 * @memberof typedefs
 */
