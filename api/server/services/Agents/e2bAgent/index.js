const { logger } = require('@librechat/data-schemas');
const { ContentTypes } = require('librechat-data-provider');
const { sendEvent } = require('@librechat/api');
const { getToolFunctions } = require('./tools');
const { getSystemPrompt, getToolsDefinitions } = require('./prompts');
const ContextManager = require('./contextManager');
const e2bClientManager = require('~/server/services/Endpoints/e2bAssistants/initialize').e2bClientManager;
const fileHandler = require('~/server/services/Sandbox/fileHandler');

/**
 * E2B Data Analyst Agent
 * 负责管理与 LLM 的多轮对话、沙箱生命周期以及工具执行循环。
 */
class E2BDataAnalystAgent {
  /**
   * @param {Object} params
   * @param {Object} params.req - Express 请求对象
   * @param {Object} params.res - Express 响应对象
   * @param {Object} params.openai - 初始化好的 OpenAI 客户端
   * @param {string} params.userId - 用户 ID
   * @param {string} params.conversationId - 对话 ID
   * @param {string} params.responseMessageId - 响应消息 ID
   * @param {Array} params.contentParts - Content parts 数组（用于累积 TOOL_CALL）
   * @param {Function} params.getContentIndex - 获取下一个 content index 的函数
   * @param {Function} params.startNewTextPart - 开始新的 TEXT part 的函数
   * @param {Object} params.assistant - E2BAssistant 数据库文档对象
   * @param {Array} params.files - 附加的文件列表
   */
  constructor({ req, res, openai, userId, conversationId, responseMessageId, contentParts, getContentIndex, startNewTextPart, assistant, files = [] }) {
    this.req = req;
    this.res = res;
    this.openai = openai;
    this.userId = userId;
    this.conversationId = conversationId;
    this.responseMessageId = responseMessageId;
    this.contentParts = contentParts || [];  // Reference to shared array
    this.getContentIndex = getContentIndex || (() => this.contentParts.length);  // Function to get next index
    this.startNewTextPart = startNewTextPart;  // Function to start new TEXT part
    this.assistant = assistant;
    this.files = files; // Store files
    
    // Initialize Context Manager for session state
    this.contextManager = new ContextManager({
      userId: this.userId,
      conversationId: this.conversationId
    });
    
    this.tools = getToolFunctions(userId, conversationId, req, this.contextManager);
    this.maxIterations = 20; // 防止无限循环，允许更复杂的分析
  }

  /**
   * 处理用户消息并返回最终响应。
   * 
   * @param {string} userText - 用户输入的文本
   * @param {Array} history - 历史消息数组 (可选)
   * @param {Function} onToken - 流式传输回调函数 (可选)
   * @returns {Promise<Object>} 包含结果消息和元数据的对象
   */
  async processMessage(userText, history = [], onToken = null) {
    try {
      logger.info(`[E2BAgent] Starting message processing for conversation ${this.conversationId}`);

      // 1. 初始化沙箱（如果不存在则创建，否则复用）
      let sandbox = await e2bClientManager.getSandbox(this.userId, this.conversationId);
      if (!sandbox) {
        logger.info(`[E2BAgent] No existing sandbox, creating new one`);
        await e2bClientManager.createSandbox(
          this.assistant.e2b_sandbox_template || 'xed696qfsyzpaei3ulh5',
          this.userId,
          this.conversationId,
          this.assistant.e2b_config
        );
        
        // CRITICAL: After creating new sandbox, check if we need to restore files
        // This handles the case where sandbox expired and needs to be recreated
        const existingFiles = this.contextManager.sessionState.uploadedFiles;
        if (existingFiles && existingFiles.length > 0) {
          logger.info(`[E2BAgent] New sandbox created, but Context Manager has ${existingFiles.length} files from previous session`);
          logger.info(`[E2BAgent] Attempting to restore files from history...`);
          
          try {
            // Extract file IDs that we need to restore
            const fileIdsToRestore = existingFiles
              .map(f => f.file_id)
              .filter(id => id);
            
            if (fileIdsToRestore.length > 0) {
              logger.info(`[E2BAgent] Restoring ${fileIdsToRestore.length} files to new sandbox`);
              
              const restoredFiles = await fileHandler.syncFilesToSandbox({
                req: this.req,
                userId: this.userId,
                conversationId: this.conversationId,
                fileIds: fileIdsToRestore
              });
              
              logger.info(`[E2BAgent] ✓ Successfully restored ${restoredFiles.length} files after sandbox recreation`);
              
              // Update Context Manager with restored files (refresh file info)
              if (restoredFiles.length > 0) {
                this.contextManager.updateUploadedFiles(restoredFiles);
              }
            }
          } catch (restoreError) {
            logger.error(`[E2BAgent] Failed to restore files to new sandbox:`, restoreError);
            // Don't throw - continue with empty sandbox, let error recovery handle it later
          }
        }
      } else {
        logger.info(`[E2BAgent] Reusing existing sandbox ${sandbox.id}`);
      }

      // 2. 同步文件到沙箱
      let uploadedFiles = [];
      
      // Collect all file IDs to sync: both from message attachments AND assistant persistent files
      const fileIdsToSync = [];
      
      // Add message attachment files
      if (this.files && this.files.length > 0) {
        logger.info(`[E2BAgent] Found ${this.files.length} message attachment files`);
        fileIdsToSync.push(...this.files.map(f => f.file_id));
      }
      
      // Add assistant persistent files from tool_resources.code_interpreter.file_ids
      if (this.assistant?.tool_resources?.code_interpreter?.file_ids) {
        const assistantFileIds = this.assistant.tool_resources.code_interpreter.file_ids;
        logger.info(`[E2BAgent] Found ${assistantFileIds.length} persistent files in assistant configuration (tool_resources)`);
        fileIdsToSync.push(...assistantFileIds);
      }

      // Add assistant persistent files from file_ids (root level - V1 style)
      if (this.assistant?.file_ids && Array.isArray(this.assistant.file_ids)) {
        const rootFileIds = this.assistant.file_ids;
        logger.info(`[E2BAgent] Found ${rootFileIds.length} persistent files in assistant configuration (root file_ids)`);
        fileIdsToSync.push(...rootFileIds);
      }
      
      // Remove duplicates
      const uniqueFileIds = [...new Set(fileIdsToSync)];
      
      if (uniqueFileIds.length > 0) {
        logger.info(`[E2BAgent] Syncing ${uniqueFileIds.length} total files to sandbox (${this.files?.length || 0} attachments + ${this.assistant?.tool_resources?.code_interpreter?.file_ids?.length || 0} persistent)`);
        
        uploadedFiles = await fileHandler.syncFilesToSandbox({
          req: this.req,
          userId: this.userId,
          conversationId: this.conversationId,
          fileIds: uniqueFileIds,
          openai: this.openai, // For fetching files from OpenAI/Azure if needed
        });
        
        if (uploadedFiles.length > 0) {
          logger.info(`[E2BAgent] Successfully synced files: ${uploadedFiles.map(f => f.filename).join(', ')}`);
          
          // Update Context Manager with uploaded files
          logger.info(`[E2BAgent] Calling contextManager.updateUploadedFiles with:`, JSON.stringify(uploadedFiles.map(f => ({ filename: f.filename, size: f.size, type: f.type }))));
          this.contextManager.updateUploadedFiles(uploadedFiles);
          logger.info(`[E2BAgent] Context Manager updated. Current state:`, JSON.stringify(this.contextManager.getSummary()));
        }
      } else {
        logger.info(`[E2BAgent] No files to sync (neither attachments nor assistant persistent files)`);
      }

      // 3. 构建初始消息列表
      // 使用Context Manager生成结构化的动态上下文
      // Context Manager是LLM获取会话状态的唯一真实来源
      
      // CRITICAL: If no files were uploaded in THIS request but files exist in history,
      // we need to restore them to Context Manager for multi-turn conversations
      logger.info(`[E2BAgent] File restoration check: uploadedFiles.length=${uploadedFiles.length}, history.length=${history.length}`);
      
      if (uploadedFiles.length === 0 && history.length > 0) {
        logger.info(`[E2BAgent] Attempting to restore files from database history...`);
        // Try to get file info from first message in database
        try {
          const { getMessages } = require('~/models/Message');
          const dbMessages = await getMessages({ conversationId: this.conversationId });
          logger.info(`[E2BAgent] Retrieved ${dbMessages.length} messages from database`);
          
          const firstUserMessage = dbMessages.find(msg => msg.isCreatedByUser && msg.files && msg.files.length > 0);
          logger.info(`[E2BAgent] First user message with files: ${firstUserMessage ? 'Found' : 'Not found'}`);
          
          if (firstUserMessage && firstUserMessage.files) {
            logger.info(`[E2BAgent] First message has ${firstUserMessage.files.length} files:`, JSON.stringify(firstUserMessage.files.map(f => ({ filename: f.filename, file_id: f.file_id, filepath: f.filepath }))));
            
            // Extract file_ids to restore actual files to the new sandbox
            const fileIdsToRestore = firstUserMessage.files
              .map(f => f.file_id)
              .filter(id => id); // Filter out null/undefined
            
            logger.info(`[E2BAgent] Found ${fileIdsToRestore.length} file IDs to restore`);
            
            if (fileIdsToRestore.length > 0) {
              // CRITICAL: Actually sync files to the new sandbox
              logger.info(`[E2BAgent] Restoring ${fileIdsToRestore.length} files to new sandbox...`);
              const restoredFiles = await fileHandler.syncFilesToSandbox({
                req: this.req,
                userId: this.userId,
                conversationId: this.conversationId,
                fileIds: fileIdsToRestore,
                openai: this.openai,
              });
              
              logger.info(`[E2BAgent] Successfully restored ${restoredFiles.length} files: ${restoredFiles.map(f => f.filename).join(', ')}`);
              
              if (restoredFiles.length > 0) {
                this.contextManager.updateUploadedFiles(restoredFiles);
                logger.info(`[E2BAgent] ✓ Files restored to sandbox and Context Manager updated`);
              }
            } else {
              logger.warn(`[E2BAgent] No file_ids found in database to restore`);
            }
          } else {
            logger.warn(`[E2BAgent] No user message with files found in database`);
          }
        } catch (error) {
          logger.error(`[E2BAgent] Failed to restore files from history: ${error.message}`, error.stack);
        }
      } else {
        logger.info(`[E2BAgent] Skipping file restoration: ${uploadedFiles.length > 0 ? 'Files already uploaded' : 'No history available'}`);
      }
      
      const dynamicContext = this.contextManager.generateSystemContext();
      
      const systemPrompt = getSystemPrompt(this.assistant) + dynamicContext;
      
      logger.debug(`[E2BAgent] Context Manager state: ${JSON.stringify(this.contextManager.getSummary())}`);
      logger.info(`[E2BAgent] Dynamic context length: ${dynamicContext.length} chars`);
      logger.info(`[E2BAgent] ===== FULL SYSTEM PROMPT START =====`);
      logger.info(systemPrompt);
      logger.info(`[E2BAgent] ===== FULL SYSTEM PROMPT END (${systemPrompt.length} chars) =====`);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userText }
      ];

      let iteration = 0;
      let finalContent = ''; // Will accumulate all assistant content
      const intermediateSteps = [];
      let shouldExitMainLoop = false; // Flag to exit both loops

      while (iteration < this.maxIterations && !shouldExitMainLoop) {
        iteration++;
        logger.debug(`[E2BAgent] Loop iteration ${iteration}`);

        // 4. 调用 LLM with retry logic for rate limits
        // For Azure OpenAI, use deployment name as model
        const model = this.openai.azureDeployment || this.assistant.model || 'gpt-4o';
        const streamingEnabled = !!onToken;
        
        logger.info(`[E2BAgent] LLM call - streaming: ${streamingEnabled}, iteration: ${iteration}`);
        
        let message;
        let retryCount = 0;
        const maxRetries = 3;
        
        // Retry loop wraps entire LLM call + processing
        while (retryCount <= maxRetries) {
          try {
            // Check if we're using Azure OpenAI
            const isAzureOpenAI = !!this.openai.locals?.azureOptions;
            const requestedTemperature = this.assistant.model_parameters?.temperature ?? 0;
            
            // Azure OpenAI's gpt-5 models (including gpt-5-mini) don't support temperature=0
            // They only support default value (1). So we omit the parameter entirely.
            const temperature = (isAzureOpenAI && requestedTemperature === 0) 
              ? undefined 
              : requestedTemperature;
            
            const completionParams = {
              model,
              messages,
              tools: getToolsDefinitions(),
              tool_choice: 'auto',
              stream: streamingEnabled, // Enable streaming if callback provided
            };
            
            // Only add temperature if it's defined
            if (temperature !== undefined) {
              completionParams.temperature = temperature;
            }
            
            const response = await this.openai.chat.completions.create(completionParams);

            // Handle streaming response
            if (streamingEnabled) {
              logger.info(`[E2BAgent] ✓ Processing streaming response`);
              message = { role: 'assistant', content: '' };
              // Don't initialize tool_calls as empty array - only add it if needed
              let tokenCount = 0;
              
              for await (const chunk of response) {
                const delta = chunk.choices[0]?.delta;
              
              if (delta?.content) {
                message.content += delta.content;
                tokenCount++;
                
                // ✅ 添加调试：确认正在调用 onToken
                if (tokenCount <= 3 || tokenCount % 50 === 0) {
                  logger.info(`[E2BAgent] Calling onToken #${tokenCount} with content: "${delta.content.substring(0, 20).replace(/\n/g, '\\n')}..."`);
                }
                
                onToken(delta.content); // Send token to client
              }
              
              if (delta?.tool_calls) {
                // Initialize tool_calls array only when we have actual tool calls
                if (!message.tool_calls) {
                  message.tool_calls = [];
                }
                
                for (const toolCallDelta of delta.tool_calls) {
                  const index = toolCallDelta.index;
                  
                  if (!message.tool_calls[index]) {
                    message.tool_calls[index] = {
                      id: toolCallDelta.id || '',
                      type: 'function',
                      function: { name: '', arguments: '' }
                    };
                  }
                  
                  if (toolCallDelta.id) {
                    message.tool_calls[index].id = toolCallDelta.id;
                  }
                  if (toolCallDelta.function?.name) {
                    message.tool_calls[index].function.name = toolCallDelta.function.name;
                  }
                  if (toolCallDelta.function?.arguments) {
                    message.tool_calls[index].function.arguments += toolCallDelta.function.arguments;
                  }
                }
              }
            }
            
            if (tokenCount > 0) {
              logger.info(`[E2BAgent] ✓ Streamed ${tokenCount} tokens, total content: ${message.content.length} chars`);
            }
            
            messages.push(message);
            
            // Accumulate all assistant content (build complete response across iterations)
            if (message.content) {
              finalContent += message.content;
            }

            // 检查是否调用了complete_task工具（唯一的主动停止条件）
            const hasCompleteTask = message.tool_calls?.some(tc => tc.function.name === 'complete_task');
            if (hasCompleteTask) {
              logger.info(`[E2BAgent] LLM called complete_task - task finished by LLM decision`);
              shouldExitMainLoop = true; // LLM主动决定完成，立即停止
            }

            // 如果没有工具调用，跳过工具执行，继续下一次迭代
            if (!message.tool_calls || message.tool_calls.length === 0) {
              logger.info(`[E2BAgent] No tool calls in this iteration. LLM returned text only. Continuing to next iteration (${iteration}/${this.maxIterations})`);
              // 跳过工具执行部分，直接进入下一次迭代
              continue; // Skip to next iteration
            }

            // 5. 执行工具调用 (ReAct 模式)
            for (const toolCall of message.tool_calls) {
              const { id, function: func } = toolCall;
              const name = func.name;
              const args = JSON.parse(func.arguments);

              logger.info(`[E2BAgent] Calling tool: ${name}`);
              logger.debug(`[E2BAgent] Tool arguments:`, JSON.stringify(args, null, 2));
              
              // 记录开始时间（用于前端计时器）
              const startTime = Date.now();
              
              // 先执行工具，判断是否成功
              let result;
              try {
                if (this.tools[name]) {
                  // Pass context with assistant info and files for potential sandbox recovery
                  const toolContext = {
                    assistant_id: this.assistant.id,
                    assistant_config: this.assistant,
                    assistant: this.assistant,
                    files: this.files  // Pass current request's files for recovery
                  };
                  result = await this.tools[name](args, toolContext);
                } else {
                  result = { success: false, error: `Tool ${name} not found` };
                }
              } catch (err) {
                logger.error(`[E2BAgent] Error executing tool ${name}:`, err);
                result = { success: false, error: err.message };
              }
              
              // 计算执行时间
              const elapsedTime = Date.now() - startTime;

              logger.debug(`[E2BAgent] Tool result:`, JSON.stringify(result, null, 2));
              
              // 🔧 只在执行成功时发送 TOOL_CALL 事件到前端
              let toolCallIndex = -1;
              if (onToken && name === 'execute_code' && result.success) {
                toolCallIndex = this.getContentIndex();
                const argsString = JSON.stringify(args);
                logger.info(`[E2BAgent] TOOL_CALL args: ${argsString.substring(0, 150)}...`);
                
                // result 是 observation 对象，已包含 stdout/stderr
                const output = result.stdout || result.stderr || '';
                
                const toolCallPart = {
                  type: ContentTypes.TOOL_CALL,
                  [ContentTypes.TOOL_CALL]: {
                    id: id,
                    name: name,
                    args: argsString,
                    input: args.code || argsString,
                    output: output,
                    progress: 1.0,
                    startTime: startTime,       // ✨ 前端计时器
                    elapsedTime: elapsedTime,   // ✨ 实际执行时间（毫秒）
                  },
                };
                
                this.contentParts[toolCallIndex] = toolCallPart;
                
                const toolCallEvent = {
                  ...toolCallPart,
                  index: toolCallIndex,
                  messageId: this.responseMessageId,
                  conversationId: this.conversationId,
                };
                
                // 🐛 调试：打印完整的事件对象
                logger.info(`[E2BAgent] 📤 toolCallEvent.tool_call has startTime: ${toolCallEvent.tool_call.startTime}`);
                logger.info(`[E2BAgent] 📤 toolCallEvent.tool_call has elapsedTime: ${toolCallEvent.tool_call.elapsedTime}`);
                
                sendEvent(this.res, toolCallEvent);
                logger.info(`[E2BAgent] Sent TOOL_CALL event (index=${toolCallIndex}, output=${output.length} chars) - SUCCESS ONLY`);
                logger.info(`[E2BAgent] 🕒 Timer data sent: startTime=${startTime}, elapsedTime=${elapsedTime}ms`);

                // ✨ 通知 controller 切断当前 TEXT part，为后续文本创建新 part
                if (this.startNewTextPart) {
                  logger.info(`[E2BAgent] Triggering new TEXT part after tool execution: ${name}`);
                  this.startNewTextPart();
                }
              } else if (name === 'execute_code' && !result.success) {
                logger.info(`[E2BAgent] Code execution FAILED - NOT sending to frontend, LLM will retry`);
              }

              // 记录中间步骤
              intermediateSteps.push({
                tool: name,
                arguments: args,
                observation: result
              });

              // 如果是 complete_task，将 summary 添加到最终输出并通过 streaming 发送
              if (name === 'complete_task' && result.summary) {
                logger.info(`[E2BAgent] Adding complete_task summary to final content (${result.summary.length} chars)`);
                const summaryText = '\n\n' + result.summary;
                finalContent += summaryText;
                
                // 在 streaming 模式下，通过 onToken 发送 summary
                if (onToken) {
                  logger.info(`[E2BAgent] Streaming complete_task summary to client`);
                  onToken(summaryText);
                }
              }

              // 将工具结果反馈给 LLM
              // If approaching max iterations, remind LLM to provide final answer
              let toolResponseContent = JSON.stringify(result);
              if (iteration >= this.maxIterations - 3) {
                toolResponseContent = JSON.stringify(result) + `\n\n⚠️ IMPORTANT: You have ${this.maxIterations - iteration} iterations remaining. Please provide your final analysis and conclusions now, instead of executing more code.`;
                logger.info(`[E2BAgent] Approaching max iterations (${iteration}/${this.maxIterations}), added reminder to LLM`);
              }
              
              messages.push({
                role: 'tool',
                tool_call_id: id,
                content: toolResponseContent
              });
            }
          } else {
            // Non-streaming mode (original behavior)
            message = response.choices[0].message;
            messages.push(message);
            
            // Accumulate all assistant content
            if (message.content) {
              finalContent += message.content;
            }

            // 检查是否调用了complete_task工具（唯一的主动停止条件）
            const hasCompleteTask = message.tool_calls?.some(tc => tc.function.name === 'complete_task');
            if (hasCompleteTask) {
              logger.info(`[E2BAgent] LLM called complete_task - task finished by LLM decision`);
              shouldExitMainLoop = true;
            }

            // 如果没有工具调用，跳过工具执行，继续下一次迭代
            if (!message.tool_calls || message.tool_calls.length === 0) {
              logger.info(`[E2BAgent] No tool calls in this iteration. LLM returned text only. Continuing to next iteration (${iteration}/${this.maxIterations})`);
              // 跳过工具执行部分，直接进入下一次迭代
              continue; // Skip to next iteration
            }

            // 5. 执行工具调用 (ReAct 模式)
            for (const toolCall of message.tool_calls) {
              const { id, function: func } = toolCall;
              const name = func.name;
              const args = JSON.parse(func.arguments);

              logger.info(`[E2BAgent] Calling tool: ${name}`);
              logger.debug(`[E2BAgent] Tool call arguments:`, JSON.stringify(args, null, 2));
              
              let result;
              try {
                if (this.tools[name]) {
                  result = await this.tools[name](args);
                } else {
                  result = { success: false, error: `Tool ${name} not found` };
                }
              } catch (err) {
                logger.error(`[E2BAgent] Error executing tool ${name}:`, err);
                result = { success: false, error: err.message };
              }

              logger.debug(`[E2BAgent] Non-streaming tool result:`, JSON.stringify(result, null, 2));

              // 记录中间步骤
              intermediateSteps.push({
                tool: name,
                arguments: args,
                observation: result
              });

              // 如果是 complete_task，将 summary 添加到最终输出
              if (name === 'complete_task' && result.summary) {
                logger.info(`[E2BAgent] Adding complete_task summary to final content (${result.summary.length} chars)`);
                const summaryText = '\n\n' + result.summary;
                finalContent += summaryText;
                // Non-streaming mode: summary will be included in final response
              }

              // 将工具结果反馈给 LLM
              // If approaching max iterations, remind LLM to provide final answer
              let toolResponseContent = JSON.stringify(result);
              if (iteration >= this.maxIterations - 3) {
                toolResponseContent = JSON.stringify(result) + `\n\n⚠️ IMPORTANT: You have ${this.maxIterations - iteration} iterations remaining. Please provide your final analysis and conclusions now, instead of executing more code.`;
                logger.info(`[E2BAgent] Approaching max iterations (${iteration}/${this.maxIterations}), added reminder to LLM`);
              }
              
              messages.push({
                role: 'tool',
                tool_call_id: id,
                content: toolResponseContent
              });
            }
          }
          
          // Success - exit retry loop
          break;
          
        } catch (llmError) {
          // Check if it's a rate limit error (429) and we can still retry
          if (llmError.status === 429 && retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
            logger.warn(`[E2BAgent] Rate limit hit (429). Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue; // Retry the entire LLM call + processing
          } else {
            // Not a rate limit error, or max retries reached
            logger.error(`[E2BAgent] OpenAI call failed. Model: ${model}. Error:`, llmError.message || llmError);
            throw llmError;
          }
        }
      } // end of retry while loop
      } // end of main iteration loop

      if (iteration >= this.maxIterations) {
        logger.warn(`[E2BAgent] Reached max iterations (${this.maxIterations})`);
      }

      // Log the raw final content for debugging
      logger.info(`[E2BAgent] Raw final content length: ${finalContent?.length} chars`);
      
      // Clean up error descriptions from accumulated content
      finalContent = this._cleanErrorDescriptions(finalContent);
      logger.info(`[E2BAgent] After cleanup: ${finalContent.length} chars`);
      
      // Ensure we have content
      if (!finalContent) {
        logger.warn(`[E2BAgent] No final content generated after ${iteration} iterations`);
        finalContent = 'No response generated.';
      }

      // No path replacement needed - LLM uses paths from observation.image_paths and observation.images_markdown
      // These are already correct /images/userId/timestamp-filename.png paths
      let processedText = finalContent;
      
      logger.info(`[E2BAgent] Skipping path replacement - using direct paths from observation`);
      
      // Log all image markdown patterns in the final text for debugging
      const imageMarkdownPattern = /!\[[^\]]*\]\([^)]+\)/g;
      const imageMarkdowns = processedText.match(imageMarkdownPattern) || [];
      if (imageMarkdowns.length > 0) {
        logger.info(`[E2BAgent] Found ${imageMarkdowns.length} image markdown entries in final text:`);
        imageMarkdowns.forEach((md, idx) => {
          logger.info(`[E2BAgent]   Image ${idx + 1}: ${md}`);
        });
      }

      return {
        text: processedText,
        intermediateSteps,
        messages: messages.slice(1) // 返回不含系统提示词的消息历史
      };

    } catch (error) {
      logger.error(`[E2BAgent] Critical error in processMessage:`, error);
      throw error;
    }
  }

  /**
   * Clean up error descriptions from accumulated content.
   * Removes sentences/paragraphs that describe execution errors or issues.
   * Preserves code blocks and their content.
   * @private
   */
  _cleanErrorDescriptions(content) {
    if (!content) return content;
    
    // Step 1: Extract and protect code blocks (python, javascript, etc.)
    const codeBlocks = [];
    let protectedContent = content.replace(/(```[\s\S]*?```)/g, (match, block) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(block);
      return placeholder;
    });
    
    // Step 2: Clean error descriptions (only in non-code text)
    const errorPatterns = [
      /It seems there (?:was|is) (?:an? )?(?:issue|error|problem)[^.!?]*[.!?]/gi,
      /Let me try (?:again|a different approach)[^.!?]*[.!?]/gi,
      /(?:I'll|I will) (?:attempt|try) (?:again|once more|a different)[^.!?]*[.!?]/gi,
      /(?:Unfortunately|Apologies),? (?:the|there|I)[^.!?]*(?:error|issue|problem|failed)[^.!?]*[.!?]/gi,
      /There (?:was|is) (?:an? )?(?:error|issue|problem) (?:with|in|during)[^.!?]*[.!?]/gi,
      // ❌ Removed: /The (?:code|execution|output) (?:failed|did not work|returned no)[^.!?]*[.!?]/gi,
      // This could match code comments, so we remove it
      /No output was returned[^.!?]*[.!?]/gi,
    ];
    
    let cleaned = protectedContent;
    errorPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Step 3: Restore code blocks
    codeBlocks.forEach((block, index) => {
      cleaned = cleaned.replace(`__CODE_BLOCK_${index}__`, block);
    });
    
    // Step 4: Clean up excessive line breaks (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Step 5: Trim leading/trailing whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  /**
   * 显式清理资源（如果需要）
   */
  async cleanup() {
    await e2bClientManager.killSandbox(this.userId, this.conversationId);
  }
}

module.exports = E2BDataAnalystAgent;
