const { logger } = require('@librechat/data-schemas');
const { getToolFunctions } = require('./tools');
const { getSystemPrompt, getToolsDefinitions } = require('./prompts');
const e2bClientManager = require('~/server/services/Endpoints/e2bAssistants/initialize').e2bClientManager;

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
   */
  constructor({ req, res, openai, userId, conversationId, assistant }) {
    this.req = req;
    this.res = res;
    this.openai = openai;
    this.userId = userId;
    this.conversationId = conversationId;
    this.assistant = assistant;
    
    this.tools = getToolFunctions(userId, conversationId, req);
    this.maxIterations = 10; // 防止无限循环
  }

  /**
   * 处理用户消息并返回最终响应。
   * 
   * @param {string} userText - 用户输入的文本
   * @param {Array} history - 历史消息数组 (可选)
   * @returns {Promise<Object>} 包含结果消息和元数据的对象
   */
  async processMessage(userText, history = []) {
    try {
      logger.info(`[E2BAgent] Starting message processing for conversation ${this.conversationId}`);

      // 1. 初始化沙箱（如果不存在）
      await e2bClientManager.createSandbox(
        this.assistant.e2b_sandbox_template || 'python3-data-analysis',
        this.userId,
        this.conversationId,
        this.assistant.e2b_config
      );

      // 2. 构建初始消息列表
      const messages = [
        { role: 'system', content: getSystemPrompt(this.assistant) },
        ...history,
        { role: 'user', content: userText }
      ];

      let iteration = 0;
      let finalContent = '';
      const intermediateSteps = [];

      while (iteration < this.maxIterations) {
        iteration++;
        logger.debug(`[E2BAgent] Loop iteration ${iteration}`);

        // 3. 调用 LLM
        const model = this.assistant.model || 'gpt-4o';
        logger.info(`[E2BAgent] Calling OpenAI with model: ${model}`);
        try {
          const response = await this.openai.chat.completions.create({
            model,
            messages,
            tools: getToolsDefinitions(),
            tool_choice: 'auto',
            temperature: this.assistant.model_parameters?.temperature ?? 0,
          });

          const message = response.choices[0].message;
          messages.push(message);

          // 如果没有工具调用，说明已得到最终答案
          if (!message.tool_calls || message.tool_calls.length === 0) {
            finalContent = message.content;
            break;
          }

          // 4. 执行工具调用 (ReAct 模式)
          for (const toolCall of message.tool_calls) {
            const { id, function: func } = toolCall;
            const name = func.name;
            const args = JSON.parse(func.arguments);

            logger.info(`[E2BAgent] Calling tool: ${name}`);
            
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
        } catch (llmError) {
           logger.error(`[E2BAgent] OpenAI call failed. Model: ${model}. Error:`, llmError);
           throw llmError;
        }
      }

      if (iteration >= this.maxIterations) {
        logger.warn(`[E2BAgent] Reached max iterations (${this.maxIterations})`);
      }

      return {
        text: finalContent,
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
