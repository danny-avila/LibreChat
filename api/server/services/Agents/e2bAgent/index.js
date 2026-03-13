const { logger } = require('@librechat/data-schemas');
const { ContentTypes } = require('librechat-data-provider');
const { sendEvent, countTokens } = require('@librechat/api');
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
  constructor({ req, res, openai, userId, conversationId, responseMessageId, contentParts, getContentIndex, startNewTextPart, assistant, contextConfig = {}, files = [] }) {
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
    this.contextConfig = {
      historyMaxTokens: Number(contextConfig?.historyMaxTokens) || 12000,
      reserveOutputTokens: Number(contextConfig?.reserveOutputTokens) || 3000,
      toolObservationMaxChars: Number(contextConfig?.toolObservationMaxChars) || 6000,
    };
    
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
        
        // CRITICAL: If ALL file uploads failed, the cached sandbox reference is stale/expired.
        // Kill the stale reference, recreate the sandbox, and retry file sync.
        if (uploadedFiles.length === 0 && uniqueFileIds.length > 0) {
          logger.warn(`[E2BAgent] All ${uniqueFileIds.length} file uploads failed — sandbox likely expired. Removing stale reference and recreating...`);
          try {
            e2bClientManager.removeSandbox(this.userId, this.conversationId);
            await e2bClientManager.createSandbox(
              this.assistant.e2b_sandbox_template || 'xed696qfsyzpaei3ulh5',
              this.userId,
              this.conversationId,
              this.assistant.e2b_config
            );
            logger.info(`[E2BAgent] Sandbox recreated after stale reference, retrying file sync...`);
            uploadedFiles = await fileHandler.syncFilesToSandbox({
              req: this.req,
              userId: this.userId,
              conversationId: this.conversationId,
              fileIds: uniqueFileIds,
              openai: this.openai,
            });
            logger.info(`[E2BAgent] Retry sync result: ${uploadedFiles.length}/${uniqueFileIds.length} files restored`);
          } catch (recreateError) {
            logger.error(`[E2BAgent] Failed to recreate sandbox during file sync:`, recreateError);
          }
        }

        if (uploadedFiles.length > 0) {
          logger.info(`[E2BAgent] Successfully synced files: ${uploadedFiles.map(f => f.filename).join(', ')}`);
          
          // Update Context Manager with uploaded files
          logger.info(`[E2BAgent] Calling contextManager.updateUploadedFiles with:`, JSON.stringify(uploadedFiles.map(f => ({ filename: f.filename, size: f.size, type: f.type }))));
          this.contextManager.updateUploadedFiles(uploadedFiles);
          logger.info(`[E2BAgent] Context Manager updated. Current state:`, JSON.stringify(this.contextManager.getSummary()));
        }
        
        // Log partial sync failures but DO NOT remove file IDs from the assistant config.
        // Sync failures are often caused by sandbox expiry or transient E2B errors, NOT by
        // files being deleted from the DB. Permanently deleting persistent file IDs here
        // would destroy the assistant's file configuration on every sandbox timeout.
        if (uploadedFiles.length < uniqueFileIds.length) {
          const failedCount = uniqueFileIds.length - uploadedFiles.length;
          logger.warn(`[E2BAgent] ${failedCount} file(s) failed to sync to sandbox (transient error - preserving assistant file_ids in DB)`);
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

      // Phase1 instrumentation: token budget visibility before entering the ReAct loop.
      try {
        const tokenModel = this.openai.azureDeployment || this.assistant.model || 'gpt-4o';
        const systemTokens = await countTokens(systemPrompt, tokenModel);
        const userTokens = await countTokens(userText || '', tokenModel);
        let historyTokens = 0;
        for (const msg of history) {
          historyTokens += await countTokens(msg?.content || '', tokenModel);
        }
        const estimatedPromptTokens = systemTokens + historyTokens + userTokens;
        logger.info(
          `[E2BAgent][TokenMetrics] model=${tokenModel}, system=${systemTokens}, history=${historyTokens}, user=${userTokens}, estimatedPrompt=${estimatedPromptTokens}, historyBudget=${this.contextConfig.historyMaxTokens}, reserveOutput=${this.contextConfig.reserveOutputTokens}, toolObservationMaxChars=${this.contextConfig.toolObservationMaxChars}`,
        );
      } catch (tokenError) {
        logger.warn(`[E2BAgent][TokenMetrics] failed to estimate tokens: ${tokenError.message}`);
      }
      
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
      let consecutiveNoToolCallCount = 0; // Track how many times LLM skips tool calls in a row
      let lastToolFailed = false;    // Did the last tool call produce an error?
      let lastToolName = null;       // Which tool was last called?

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
              let finishReason = null; // Capture finish_reason
              
              for await (const chunk of response) {
                const delta = chunk.choices[0]?.delta;
                const choice = chunk.choices[0];
              
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
              
              // Capture finish_reason from the last chunk
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }
            
            if (tokenCount > 0) {
              logger.info(`[E2BAgent] ✓ Streamed ${tokenCount} tokens, total content: ${message.content.length} chars, finish_reason: ${finishReason}`);
            }
            
            // Store finish_reason on message for later use
            message.finish_reason = finishReason;
            
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

            // 如果没有工具调用，基于上一步工具状态做精准决策
            if (!message.tool_calls || message.tool_calls.length === 0) {
              consecutiveNoToolCallCount++;
              logger.info(`[E2BAgent] LLM returned text without tool calls (finish_reason: ${message.finish_reason}, lastToolFailed=${lastToolFailed}, consecutiveCount=${consecutiveNoToolCallCount})`);

              // 硬上限：连续3次无工具调用直接终止，无论原因
              if (consecutiveNoToolCallCount >= 3) {
                logger.warn(`[E2BAgent] Hard limit: ${consecutiveNoToolCallCount} consecutive text-only responses — terminating loop.`);
                shouldExitMainLoop = true;
                break;
              }

              // 上一步工具执行失败 → LLM 应该立即重试工具，不应输出文本
              if (lastToolFailed) {
                logger.warn(`[E2BAgent] Last tool (${lastToolName}) failed but LLM produced text instead of retrying — injecting retry directive.`);
                messages.push({
                  role: 'user',
                  content: `The last \`${lastToolName}\` call failed. Call \`execute_code\` now to fix and retry — do NOT produce text explanations.`
                });
              } else {
                // 无工具失败背景 → 正常推进或总结
                messages.push({
                  role: 'user',
                  content: 'Continue with the next step using `execute_code`. If all steps are done, call `complete_task`.'
                });
              }
              continue;
            }
            
            // Reset counter when LLM successfully calls a tool
            consecutiveNoToolCallCount = 0;
            // (lastToolFailed will be set accurately per-tool inside the tool loop below)

            // 5. 执行工具调用 (ReAct 模式)
            for (const toolCall of message.tool_calls) {
              const { id, function: func } = toolCall;
              const name = func.name;
              const args = JSON.parse(func.arguments);

              logger.info(`[E2BAgent] Calling tool: ${name}`);
              logger.debug(`[E2BAgent] Tool arguments:`, JSON.stringify(args, null, 2));
              
              // ✨ 优化流式体验：在执行前立即发送 "Pending" 状态的 TOOL_CALL 事件
              // 这会让前端立即显示代码块 loading 状态，而不是等待执行完成
              let toolCallIndex = -1;
              if (onToken && name === 'execute_code') {
                toolCallIndex = this.getContentIndex();
                const argsString = JSON.stringify(args);
                
                // 构造初始 Tool Call 对象（PENDING 不发送 startTime，避免客户端/服务器时钟不同步）
                const pendingToolCall = {
                  id: id,
                  name: name,
                  args: argsString,
                  input: args.code || argsString,
                  output: '', // 暂时为空
                  progress: 0.1, // 表示开始执行
                };
                
                // 占位到 contentParts
                this.contentParts[toolCallIndex] = {
                  type: ContentTypes.TOOL_CALL,
                  [ContentTypes.TOOL_CALL]: pendingToolCall,
                };
                
                // 按照 Azure Assistant 的格式发送事件
                const pendingEvent = {
                  index: toolCallIndex,
                  type: ContentTypes.TOOL_CALL,
                  [ContentTypes.TOOL_CALL]: pendingToolCall,
                  messageId: this.responseMessageId,
                  conversationId: this.conversationId,
                };
                
                // 🐛 调试：打印完整事件结构
                logger.info(`[E2BAgent] 📤 Pending event structure: ${JSON.stringify({
                  index: pendingEvent.index,
                  type: pendingEvent.type,
                  has_tool_call: 'tool_call' in pendingEvent,
                  tool_call_id: pendingEvent.tool_call?.id,
                  tool_call_name: pendingEvent.tool_call?.name,
                  tool_call_progress: pendingEvent.tool_call?.progress,
                  messageId: pendingEvent.messageId,
                  conversationId: pendingEvent.conversationId,
                })}`);
                
                // 🐛 检查 sendEvent 底层实现
                logger.info(`[E2BAgent] 📤 Full pending event keys: ${Object.keys(pendingEvent).join(', ')}`);
                
                sendEvent(this.res, pendingEvent);
                // FLUSH: Critical for real-time streaming when compression is enabled
                if (this.res.flush) {
                  this.res.flush();
                }
                logger.info(`[E2BAgent] Sent PENDING TOOL_CALL event (index=${toolCallIndex})`);
                
                // ✨ 通知 controller 切断当前 TEXT part，确保 UI 顺序正确
                if (this.startNewTextPart) {
                  this.startNewTextPart();
                }
              }

              // 记录开始时间（用于计算 elapsedTime）
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
              
              // Track last tool state for no-tool-call decision logic
              lastToolFailed = !result.success;
              lastToolName = name;
              
              // 计算执行时间
              const elapsedTime = Date.now() - startTime;

              logger.debug(`[E2BAgent] Tool result:`, JSON.stringify(result, null, 2));
              
              // 🔧 更新工具执行结果 (Completed)
              if (onToken && name === 'execute_code' && result.success && toolCallIndex !== -1) {
                const argsString = JSON.stringify(args);
                logger.info(`[E2BAgent] TOOL_CALL args: ${argsString.substring(0, 150)}...`);
                
                // result 是 observation 对象，已包含 stdout/stderr
                let output = result.stdout || result.stderr || '';
                
                // ✨ 如果是恢复后的成功执行，添加恢复提示
                if (result._recovery_note) {
                  output = '✅ ' + result._recovery_note + '\n\n' + output;
                  logger.info(`[E2BAgent] Code execution succeeded after sandbox recovery`);
                }
                
                const completedToolCall = {
                  id: id,
                  name: name,
                  args: argsString,
                  input: args.code || argsString,
                  output: output,
                  progress: 1.0, // 完成
                  startTime: startTime,       // ✨ 前端计时器
                  elapsedTime: elapsedTime,   // ✨ 实际执行时间（毫秒）
                };
                
                // 更新 contentParts
                this.contentParts[toolCallIndex] = {
                  type: ContentTypes.TOOL_CALL,
                  [ContentTypes.TOOL_CALL]: completedToolCall,
                };
                
                // 按照 Azure Assistant 的格式发送事件
                const completedEvent = {
                  index: toolCallIndex,
                  type: ContentTypes.TOOL_CALL,
                  [ContentTypes.TOOL_CALL]: completedToolCall,
                  messageId: this.responseMessageId,
                  conversationId: this.conversationId,
                };
                
                sendEvent(this.res, completedEvent);
                // FLUSH: Critical for real-time streaming
                if (this.res.flush) {
                  this.res.flush();
                }
                logger.info(`[E2BAgent] Sent COMPLETED TOOL_CALL event (index=${toolCallIndex}, output=${output.length} chars, elapsedTime=${elapsedTime}ms)`);

                // ✨ 再次确认切断 Text Part (通常在 Pending 时已切断，但为了保险)
                if (this.startNewTextPart) {
                  // logger.info(`[E2BAgent] Triggering new TEXT part after tool execution: ${name}`);
                  // this.startNewTextPart(); 
                  // 注释掉：因为在 pending 阶段已经切断过了，不需要重复切断空 part
                }
              } else if (name === 'execute_code' && !result.success) {
                logger.info(`[E2BAgent] Code execution FAILED - Updating frontend status`);
                
                // ✨ 关键修复：即使失败，也要更新前端状态，防止 Infinite Loading
                if (onToken && toolCallIndex !== -1) {
                  const argsString = JSON.stringify(args);
                  
                  // Check if it's a recoverable sandbox timeout error
                  const isRecovering = result._recovery_note || 
                                      (result.error && result.error.includes('Sandbox expired'));
                  
                  const output = isRecovering 
                    ? '🔄 Sandbox expired, recovering and retrying...\n' + (result.stdout || result.stderr || '')
                    : (result.stderr || result.error || 'Execution failed');
                  
                  const failedToolCall = {
                    id: id,
                    name: name,
                    args: argsString,
                    input: args.code || argsString,
                    output: output,
                    progress: isRecovering ? 0.5 : 1.0, // 恢复中显示 50%，失败显示 100%
                    startTime: startTime,
                    elapsedTime: Date.now() - startTime,
                  };

                  this.contentParts[toolCallIndex] = {
                    type: ContentTypes.TOOL_CALL,
                    [ContentTypes.TOOL_CALL]: failedToolCall,
                  };

                  // 按照 Azure Assistant 的格式发送事件
                  const failedEvent = {
                    index: toolCallIndex,
                    type: ContentTypes.TOOL_CALL,
                    [ContentTypes.TOOL_CALL]: failedToolCall,
                    messageId: this.responseMessageId,
                    conversationId: this.conversationId,
                  };

                  sendEvent(this.res, failedEvent);
                  // FLUSH: Critical for real-time streaming
                  if (this.res.flush) {
                    this.res.flush();
                  }
                  logger.info(`[E2BAgent] Sent ${isRecovering ? 'RECOVERING' : 'FAILED'} TOOL_CALL event (index=${toolCallIndex})`);
                  
                  // 确保切断 Text Part，为 LLM 的解释或重试做准备
                  if (this.startNewTextPart) {
                    this.startNewTextPart();
                  }
                }
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
