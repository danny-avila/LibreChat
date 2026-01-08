const { logger } = require('@librechat/data-schemas');
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
   * @param {Object} params.assistant - E2BAssistant 数据库文档对象
   * @param {Array} params.files - 附加的文件列表
   */
  constructor({ req, res, openai, userId, conversationId, assistant, files = [] }) {
    this.req = req;
    this.res = res;
    this.openai = openai;
    this.userId = userId;
    this.conversationId = conversationId;
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
      if (this.files && this.files.length > 0) {
        logger.info(`[E2BAgent] Syncing ${this.files.length} files to sandbox...`);
        // Extract file IDs from the files array (LibreChat format)
        const fileIds = this.files.map(f => f.file_id);
        
        uploadedFiles = await fileHandler.syncFilesToSandbox({
          req: this.req,
          userId: this.userId,
          conversationId: this.conversationId,
          fileIds,
          openai: this.openai, // For fetching files from OpenAI/Azure if needed
        });
        
        if (uploadedFiles.length > 0) {
          logger.info(`[E2BAgent] Successfully synced files: ${uploadedFiles.map(f => f.filename).join(', ')}`);
          
          // Update Context Manager with uploaded files
          logger.info(`[E2BAgent] Calling contextManager.updateUploadedFiles with:`, JSON.stringify(uploadedFiles.map(f => ({ filename: f.filename, size: f.size, type: f.type }))));
          this.contextManager.updateUploadedFiles(uploadedFiles);
          logger.info(`[E2BAgent] Context Manager updated. Current state:`, JSON.stringify(this.contextManager.getSummary()));
        }
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
      logger.info(`[E2BAgent] System prompt preview (last 500 chars): ...${systemPrompt.slice(-500)}`);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userText }
      ];

      let iteration = 0;
      let finalContent = '';
      let accumulatedContent = ''; // Track accumulated content in streaming mode
      const intermediateSteps = [];

      while (iteration < this.maxIterations) {
        iteration++;
        logger.debug(`[E2BAgent] Loop iteration ${iteration}`);

        // 4. 调用 LLM
        const model = this.assistant.model || 'gpt-4o';
        const streamingEnabled = !!onToken;
        
        logger.info(`[E2BAgent] LLM call - streaming: ${streamingEnabled}, iteration: ${iteration}`);
        
        try {
          const response = await this.openai.chat.completions.create({
            model,
            messages,
            tools: getToolsDefinitions(),
            tool_choice: 'auto',
            temperature: this.assistant.model_parameters?.temperature ?? 0,
            stream: streamingEnabled, // Enable streaming if callback provided
          });

          // Handle streaming response
          if (streamingEnabled) {
            logger.info(`[E2BAgent] ✓ Processing streaming response`);
            let message = { role: 'assistant', content: '', tool_calls: [] };
            let currentToolCall = null;
            let tokenCount = 0;
            
            for await (const chunk of response) {
              const delta = chunk.choices[0]?.delta;
              
              if (delta?.content) {
                message.content += delta.content;
                accumulatedContent += delta.content; // Also accumulate for final processing
                tokenCount++;
                onToken(delta.content); // Send token to client
              }
              
              if (delta?.tool_calls) {
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

            // 如果没有工具调用，说明已得到最终答案
            if (!message.tool_calls || message.tool_calls.length === 0) {
              finalContent = message.content;
              break;
            }

            // 5. 执行工具调用 (ReAct 模式)
            for (const toolCall of message.tool_calls) {
              const { id, function: func } = toolCall;
              const name = func.name;
              const args = JSON.parse(func.arguments);

              logger.info(`[E2BAgent] Calling tool: ${name}`);
              logger.debug(`[E2BAgent] Tool arguments:`, JSON.stringify(args, null, 2));
              
              // Send tool call indicator to client
              const toolIndicator = `\n\n[执行工具: ${name}]\n`;
              accumulatedContent += toolIndicator;
              onToken(toolIndicator);
              
              let result;
              try {
                if (this.tools[name]) {
                  // Pass context with assistant_id for potential sandbox recovery
                  const toolContext = {
                    assistant_id: this.assistant.id,
                    assistant_config: this.assistant
                  };
                  result = await this.tools[name](args, toolContext);
                } else {
                  result = { success: false, error: `Tool ${name} not found` };
                }
              } catch (err) {
                logger.error(`[E2BAgent] Error executing tool ${name}:`, err);
                result = { success: false, error: err.message };
              }

              logger.debug(`[E2BAgent] Streaming tool result:`, JSON.stringify(result, null, 2));

              // 记录中间步骤
              intermediateSteps.push({
                tool: name,
                arguments: args,
                observation: result
              });

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
            const message = response.choices[0].message;
            messages.push(message);

            // 如果没有工具调用，说明已得到最终答案
            if (!message.tool_calls || message.tool_calls.length === 0) {
              finalContent = message.content;
              break;
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
        } catch (llmError) {
           logger.error(`[E2BAgent] OpenAI call failed. Model: ${model}. Error:`, llmError);
           throw llmError;
        }
      }

      if (iteration >= this.maxIterations) {
        logger.warn(`[E2BAgent] Reached max iterations (${this.maxIterations})`);
      }

      // Log the raw final content for debugging
      logger.info(`[E2BAgent] Raw final content length: ${finalContent?.length}, accumulated: ${accumulatedContent?.length}`);
      
      // In streaming mode, use accumulated content if finalContent is empty
      if (!finalContent && accumulatedContent) {
        logger.info(`[E2BAgent] Using accumulated content from streaming (${accumulatedContent.length} chars)`);
        finalContent = accumulatedContent;
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
   * 显式清理资源（如果需要）
   */
  async cleanup() {
    await e2bClientManager.killSandbox(this.userId, this.conversationId);
  }
}

module.exports = E2BDataAnalystAgent;
