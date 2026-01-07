const { logger } = require('@librechat/data-schemas');
const { getToolFunctions } = require('./tools');
const { getSystemPrompt, getToolsDefinitions } = require('./prompts');
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
    
    this.tools = getToolFunctions(userId, conversationId, req);
    this.maxIterations = 10; // 防止无限循环
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
        }
      }

      // 3. 构建初始消息列表
      // 将上传的文件信息注入到系统提示词中
      const fileContext = uploadedFiles.length > 0 
        ? `\n\nUser has uploaded the following files to /home/user/:\n${uploadedFiles.map(f => `- ${f.filename}`).join('\n')}`
        : '';

      const systemPrompt = getSystemPrompt(this.assistant) + fileContext;

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
                  result = await this.tools[name](args);
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
              messages.push({
                role: 'tool',
                tool_call_id: id,
                content: JSON.stringify(result)
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
              messages.push({
                role: 'tool',
                tool_call_id: id,
                content: JSON.stringify(result)
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
