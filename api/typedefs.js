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
 * @exports OpenAIFile
 * @typedef {import('librechat-data-provider').File} OpenAIFile
 * @memberof typedefs
 */

/**
 * @exports ImageMetadata
 * @typedef {Object} ImageMetadata
 * @property {string} file_id - The identifier of the file.
 * @property {string} [temp_file_id] - The temporary identifier of the file.
 * @property {number} width - The width of the image.
 * @property {number} height - The height of the image.
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
 * @exports ThreadMessage
 * @typedef {import('openai').OpenAI.Beta.Threads.ThreadMessage} ThreadMessage
 * @memberof typedefs
 */

/**
 * @exports RequiredActionFunctionToolCall
 * @typedef {import('openai').OpenAI.Beta.Threads.RequiredActionFunctionToolCall} RequiredActionFunctionToolCall
 * @memberof typedefs
 */

/**
 * @exports RunManager
 * @typedef {import('./server/services/Runs/RunMananger.js').RunManager} RunManager
 * @memberof typedefs
 */

/**
 * @exports Thread
 * @typedef {Object} Thread
 * @property {string} id - The identifier of the thread.
 * @property {string} object - The object type, always 'thread'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the thread was created.
 * @property {Object} [metadata] - Optional metadata associated with the thread.
 * @property {Message[]} [messages] - An array of messages associated with the thread.
 * @memberof typedefs
 */

/**
 * @exports Message
 * @typedef {Object} Message
 * @property {string} id - The identifier of the message.
 * @property {string} object - The object type, always 'thread.message'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the message was created.
 * @property {string} thread_id - The thread ID that this message belongs to.
 * @property {string} role - The entity that produced the message. One of 'user' or 'assistant'.
 * @property {Object[]} content - The content of the message in an array of text and/or images.
 * @property {string} content[].type - The type of content, either 'text' or 'image_file'.
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
 * @exports FunctionTool
 * @typedef {Object} FunctionTool
 * @property {string} type - The type of tool, 'function'.
 * @property {Object} function - The function definition.
 * @property {string} function.description - A description of what the function does.
 * @property {string} function.name - The name of the function to be called.
 * @property {Object} function.parameters - The parameters the function accepts, described as a JSON Schema object.
 * @memberof typedefs
 */

/**
 * @exports Tool
 * @typedef {Object} Tool
 * @property {string} type - The type of tool, can be 'code_interpreter', 'retrieval', or 'function'.
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
 * @property {string} status - The status of the run (e.g., 'queued', 'completed').
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
 * @property {Tool[]} [tools] - The list of tools used for this run.
 * @property {string[]} [file_ids] - The list of File IDs used for this run.
 * @property {Object} [metadata] - Metadata associated with this run.
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
 * @property {string} type - The type of run step, either 'message_creation' or 'tool_calls'.
 * @property {string} status - The status of the run step, can be 'in_progress', 'cancelled', 'failed', 'completed', or 'expired'.
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
 * @exports StepMessage
 * @typedef {Object} StepMessage
 * @property {Message} message - The complete message object created by the step.
 * @property {string} id - The identifier of the run step.
 * @property {string} object - The object type, always 'thread.run.step'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run step was created.
 * @property {string} assistant_id - The ID of the assistant associated with the run step.
 * @property {string} thread_id - The ID of the thread that was run.
 * @property {string} run_id - The ID of the run that this run step is a part of.
 * @property {string} type - The type of run step, either 'message_creation' or 'tool_calls'.
 * @property {string} status - The status of the run step, can be 'in_progress', 'cancelled', 'failed', 'completed', or 'expired'.
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
