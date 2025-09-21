const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { saveMessage, saveConvo } = require('~/models');
const { EModelEndpoint } = require('librechat-data-provider');

/**
 * A2A Agent Client that integrates with LibreChat's conversation system
 * This client uses A2A protocol but maintains compatibility with LibreChat's agents system
 */
class A2AAgentClient {
  constructor({
    req,
    res,
    contentParts,
    eventHandlers,
    collectedUsage,
    aggregateContent,
    artifactPromises,
    agent,
    spec,
    iconURL,
    endpointType,
    endpoint = EModelEndpoint.agents,
  }) {
    this.req = req;
    this.res = res;
    this.contentParts = contentParts;
    this.eventHandlers = eventHandlers;
    this.collectedUsage = collectedUsage;
    this.aggregateContent = aggregateContent;
    this.artifactPromises = artifactPromises;
    this.agent = agent;
    this.spec = spec;
    this.iconURL = iconURL;
    this.endpointType = endpointType;
    this.endpoint = endpoint;
    this.savedMessageIds = new Set();
    this.skipSaveUserMessage = false;
    
    // Add options for compatibility with LibreChat's agents system
    this.options = {
      titleConvo: true, // Enable title generation for A2A conversations
    };
  }

  async sendMessage(text, messageOptions = {}) {
    const {
      user,
      onStart,
      getReqData,
      isContinued,
      isRegenerate,
      editedContent,
      conversationId,
      parentMessageId,
      abortController,
      overrideParentMessageId,
      isEdited,
      responseMessageId: editedResponseMessageId,
      progressOptions,
    } = messageOptions;

    try {
      // Generate message IDs
      const userMessageId = uuidv4();
      const responseMessageId = editedResponseMessageId || uuidv4();
      const contextId = conversationId || uuidv4();

      logger.debug(`A2A Agent Client - sending message to ${this.agent.name} (${this.agent.id})`);
      logger.debug(`A2A Agent Client - contextId: ${contextId}`);

      // Create user message
      const userMessage = {
        messageId: userMessageId,
        conversationId: contextId,
        parentMessageId: parentMessageId,
        role: 'user',
        text: text,
        user: user,
        endpoint: 'a2a',
        model: this.agent.id,
        isCreatedByUser: true,
      };

      // Notify start if callback provided
      if (onStart) {
        getReqData({
          userMessage,
          userMessagePromise: Promise.resolve(userMessage),
          responseMessageId,
          sender: this.agent.name,
          conversationId: contextId,
        });
        onStart(userMessage);
      }

      // Detect if this should be a task-based workflow
      const shouldUseTask = this.shouldUseTaskBasedWorkflow(text);
      
      logger.info(`A2A Agent Client - message analysis: shouldUseTask=${shouldUseTask}, textLength=${text.length}`);
      logger.debug(`A2A Agent Client - using task-based workflow: ${shouldUseTask}`);

      // Send message to A2A agent (task-based or direct)
      const response = await this.agent.a2aClient.sendMessage(text, contextId, shouldUseTask);
      
      if (!response.success) {
        throw new Error(response.error || 'A2A agent returned error');
      }

      let responseText;
      let metadata = {
        agentId: this.agent.id,
        agentName: this.agent.name,
        transport: 'a2a',
      };

      if (shouldUseTask && response.task) {
        logger.info(`A2A Agent Client - Task created: ${response.task.id}, status: ${response.task.status}`);
        
        // Handle task-based response
        responseText = `🔄 **Task Created:** ${response.task.statusMessage || 'Processing your request...'}\n\n` +
                      `**Task ID:** \`${response.task.id}\`\n\n` +
                      `I've started working on your request. You can check the progress or I'll update you when it's complete.`;
        
        metadata.taskId = response.task.id;
        metadata.taskStatus = response.task.status;
        metadata.isTaskBased = true;

        // Start polling task status in background
        logger.info(`A2A Agent Client - Starting background polling for task: ${response.task.id}`);
        this.startTaskPolling(response.task.id, contextId, user, responseMessageId);
      } else {
        // Handle direct message response
        responseText = response.data?.parts?.[0]?.content || 
                      response.message?.parts?.[0]?.content || 
                      response.message?.content || 
                      response.parts?.[0]?.content || 
                      response.content || 
                      'Response received from A2A agent';
      }

      // Create response message
      const responseMessage = {
        messageId: responseMessageId,
        conversationId: contextId,
        parentMessageId: userMessageId,
        role: 'assistant',
        text: responseText,
        user: user,
        endpoint: 'a2a',
        model: this.agent.id,
        metadata: metadata,
      };

      // Mark messages as saved to avoid duplicate saves
      this.savedMessageIds.add(userMessageId);
      this.savedMessageIds.add(responseMessageId);

      // Save user message
      await saveMessage(this.req, userMessage, {
        context: 'A2A Agent Client - User Message',
      });

      // Save agent response message
      await saveMessage(this.req, responseMessage, {
        context: 'A2A Agent Client - Agent Response',
      });

      logger.debug(`A2A Agent Client - response: ${responseText.substring(0, 100)}...`);

      // Save conversation to database with task metadata
      const conversationData = {
        conversationId: contextId,
        title: `A2A Chat with ${this.agent.name}`,
        endpoint: 'a2a',
        model: this.agent.id,
        user: user,
      };

      // Add task information to conversation metadata if this is a task
      if (shouldUseTask && response.task) {
        conversationData.metadata = {
          activeTaskId: response.task.id,
          lastTaskStatus: response.task.status,
          lastTaskUpdate: new Date(),
          agentId: this.agent.id,
        };
      }

      // Return response in LibreChat's expected format
      return {
        ...responseMessage,
        sender: this.agent.name,
        databasePromise: this.saveConversation(conversationData).then(savedConvo => ({
          conversation: savedConvo || conversationData
        })),
      };

    } catch (error) {
      logger.error('A2A Agent Client error:', error);
      throw error;
    }
  }

  // Method to save conversation (called by agents controller)
  async saveConversation(conversationData) {
    try {
      return await saveConvo(this.req, {
        ...conversationData,
        endpoint: 'a2a',
        model: this.agent.id,
      }, { context: 'A2A Agent Client - Conversation' });
    } catch (error) {
      logger.error('Error saving A2A conversation:', error);
      throw error;
    }
  }

  // Title generation method for A2A conversations
  async titleConvo({ text }) {
    try {
      // Generate a simple title based on the first user message
      // A more sophisticated approach could use the A2A agent to generate titles
      const words = text.trim().split(/\s+/);
      if (words.length <= 6) {
        return text.trim();
      }
      return words.slice(0, 6).join(' ') + '...';
    } catch (error) {
      logger.error('A2A title generation error:', error);
      return `A2A Chat with ${this.agent.name}`;
    }
  }

  /**
   * Determine if a message should trigger task-based workflow
   * @param {string} text - User message text
   * @returns {boolean}
   */
  shouldUseTaskBasedWorkflow(text) {
    const taskTriggers = [
      // Direct task keywords
      'create task', 'start task', 'task:', '/task',
      
      // Analysis keywords
      'analyze', 'analysis', 'examine', 'investigate', 'research',
      
      // Creation/generation keywords
      'create', 'generate', 'build', 'make', 'develop', 'design',
      'write a', 'compose', 'draft',
      
      // Processing keywords
      'process', 'calculate', 'compute', 'transform', 'convert',
      
      // Complex request indicators
      'step by step', 'detailed', 'comprehensive', 'thorough',
      'multiple', 'several steps', 'workflow'
    ];

    const lowerText = text.toLowerCase();
    
    // Check for explicit task triggers
    if (taskTriggers.some(trigger => lowerText.includes(trigger))) {
      return true;
    }

    // Check for long, complex requests (likely tasks)
    if (text.length > 200) {
      return true;
    }

    // Check for questions that might benefit from structured processing
    if (lowerText.includes('how to') && text.length > 50) {
      return true;
    }

    return false;
  }

  /**
   * Start polling task status in background
   * @param {string} taskId - Task identifier
   * @param {string} contextId - Context identifier
   * @param {Object} user - User object
   * @param {string} initialResponseMessageId - Initial response message ID
   */
  startTaskPolling(taskId, contextId, user, initialResponseMessageId) {
    logger.info(`A2A Task Polling - Starting polling for task: ${taskId} in conversation: ${contextId}`);
    
    const pollInterval = 3000; // Poll every 3 seconds
    const maxPollTime = 300000; // Max 5 minutes
    const startTime = Date.now();
    let pollCount = 0;
    
    const poll = async () => {
      try {
        pollCount++;
        const elapsedTime = Date.now() - startTime;
        
        // Check if we've exceeded max poll time
        if (elapsedTime > maxPollTime) {
          logger.warn(`A2A Task Polling - Timeout reached for task: ${taskId} after ${Math.round(elapsedTime/1000)}s`);
          return;
        }

        logger.debug(`A2A Task Polling - Poll #${pollCount} for task: ${taskId} (elapsed: ${Math.round(elapsedTime/1000)}s)`);

        // Get task status
        const taskStatus = await this.agent.a2aClient.getTaskStatus(taskId);
        
        logger.info(`A2A Task Polling - Task ${taskId} status: ${taskStatus.status}, message: ${taskStatus.statusMessage}`);

        // If task is completed, send update message
        if (taskStatus.status === 'completed') {
          logger.info(`A2A Task Polling - Task completed, sending completion message: ${taskId}`);
          await this.sendTaskCompletionMessage(taskId, taskStatus, contextId, user);
        } else if (taskStatus.status === 'failed') {
          logger.info(`A2A Task Polling - Task failed, sending failure message: ${taskId}`);
          await this.sendTaskFailureMessage(taskId, taskStatus, contextId, user);
        } else if (taskStatus.status === 'working') {
          logger.debug(`A2A Task Polling - Task still working, continuing to poll: ${taskId}`);
          // Continue polling for working tasks
          setTimeout(poll, pollInterval);
        } else {
          logger.warn(`A2A Task Polling - Unexpected task status: ${taskStatus.status} for task: ${taskId}`);
        }
        
      } catch (error) {
        logger.error(`A2A Task Polling - Error polling task ${taskId}:`, error);
        // Stop polling on error
      }
    };

    // Start polling after a short delay
    logger.debug(`A2A Task Polling - Scheduling first poll for task ${taskId} in ${pollInterval}ms`);
    setTimeout(poll, pollInterval);
  }

  /**
   * Send task completion message
   * @param {string} taskId - Task identifier
   * @param {Object} taskStatus - Task status object
   * @param {string} contextId - Context identifier
   * @param {Object} user - User object
   */
  async sendTaskCompletionMessage(taskId, taskStatus, contextId, user) {
    try {
      logger.info(`A2A Task Completion - Sending completion message for task: ${taskId}`);

      // Extract final response from task history
      const finalResponse = taskStatus.history
        ?.filter(msg => msg.role === 'agent')
        ?.pop()?.parts?.[0]?.content || 'Task completed successfully!';

      logger.debug(`A2A Task Completion - Final response length: ${finalResponse.length}`);

      // Format artifacts if available
      let artifactsText = '';
      if (taskStatus.artifacts && taskStatus.artifacts.length > 0) {
        logger.info(`A2A Task Completion - Formatting ${taskStatus.artifacts.length} artifacts for task: ${taskId}`);
        artifactsText = '\n\n**Generated Artifacts:**\n';
        taskStatus.artifacts.forEach(artifact => {
          artifactsText += `- **${artifact.name}** (${artifact.type})\n`;
          if (artifact.content && typeof artifact.content === 'object') {
            artifactsText += `  ${JSON.stringify(artifact.content, null, 2)}\n`;
          }
        });
      }

      const completionText = `✅ **Task Completed:** \`${taskId}\`\n\n${finalResponse}${artifactsText}`;

      const completionMessage = {
        messageId: uuidv4(),
        conversationId: contextId,
        parentMessageId: null, // This will be a new message in the conversation
        role: 'assistant',
        text: completionText,
        user: user,
        endpoint: 'a2a',
        model: this.agent.id,
        metadata: {
          agentId: this.agent.id,
          agentName: this.agent.name,
          transport: 'a2a',
          taskId: taskId,
          taskStatus: 'completed',
          isTaskCompletion: true,
          artifacts: taskStatus.artifacts,
        },
      };

      // Save completion message
      await saveMessage(this.req, completionMessage, {
        context: 'A2A Agent Client - Task Completion',
      });

      // Update conversation metadata to mark task as completed
      await this.updateConversationTaskStatus(contextId, taskId, 'completed', user);

      logger.info(`A2A Task Completion - Completion message saved for task: ${taskId}`);
      
    } catch (error) {
      logger.error(`Failed to send task completion message for ${taskId}:`, error);
    }
  }

  /**
   * Send task failure message
   * @param {string} taskId - Task identifier
   * @param {Object} taskStatus - Task status object
   * @param {string} contextId - Context identifier
   * @param {Object} user - User object
   */
  async sendTaskFailureMessage(taskId, taskStatus, contextId, user) {
    try {
      logger.debug(`Sending task failure message for task: ${taskId}`);

      const failureText = `❌ **Task Failed:** \`${taskId}\`\n\n` +
                         `**Error:** ${taskStatus.statusMessage || 'Unknown error occurred'}\n\n` +
                         `The task could not be completed. You can try rephrasing your request or contact support if the issue persists.`;

      const failureMessage = {
        messageId: uuidv4(),
        conversationId: contextId,
        parentMessageId: null,
        role: 'assistant', 
        text: failureText,
        user: user,
        endpoint: 'a2a',
        model: this.agent.id,
        metadata: {
          agentId: this.agent.id,
          agentName: this.agent.name,
          transport: 'a2a',
          taskId: taskId,
          taskStatus: 'failed',
          isTaskFailure: true,
        },
      };

      // Save failure message
      await saveMessage(this.req, failureMessage, {
        context: 'A2A Agent Client - Task Failure',
      });

      // Update conversation metadata to mark task as failed
      await this.updateConversationTaskStatus(contextId, taskId, 'failed', user);

      logger.debug(`Task failure message saved for task: ${taskId}`);
      
    } catch (error) {
      logger.error(`Failed to send task failure message for ${taskId}:`, error);
    }
  }

  /**
   * Get task status for a given task ID
   * @param {string} taskId - Task identifier
   * @returns {Promise<Object>} Task status
   */
  async getTaskStatus(taskId) {
    try {
      return await this.agent.a2aClient.getTaskStatus(taskId);
    } catch (error) {
      logger.error(`Failed to get task status for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task identifier
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTask(taskId) {
    try {
      return await this.agent.a2aClient.cancelTask(taskId);
    } catch (error) {
      logger.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update conversation metadata with task status
   * @param {string} conversationId - Conversation identifier
   * @param {string} taskId - Task identifier  
   * @param {string} status - Task status
   * @param {Object} user - User object
   */
  async updateConversationTaskStatus(conversationId, taskId, status, user) {
    try {
      logger.info(`A2A Metadata Update - Updating conversation ${conversationId} for task ${taskId} -> status: ${status}`);
      
      // Update conversation metadata
      const conversationData = {
        conversationId: conversationId,
        metadata: {
          activeTaskId: status === 'completed' || status === 'failed' ? null : taskId,
          lastTaskId: taskId,
          lastTaskStatus: status,
          lastTaskUpdate: new Date(),
          agentId: this.agent.id,
        },
        user: user,
      };

      logger.debug(`A2A Metadata Update - Metadata to save:`, {
        activeTaskId: conversationData.metadata.activeTaskId,
        lastTaskId: conversationData.metadata.lastTaskId,
        lastTaskStatus: conversationData.metadata.lastTaskStatus,
        agentId: conversationData.metadata.agentId,
      });

      await this.saveConversation(conversationData);
      logger.info(`A2A Metadata Update - Successfully updated conversation task status: ${taskId} -> ${status}`);
    } catch (error) {
      logger.error(`A2A Metadata Update - Failed to update conversation task status for ${taskId}:`, error);
    }
  }

  /**
   * Check for active tasks when conversation is loaded and recover if needed
   * @param {string} conversationId - Conversation identifier
   * @param {Object} user - User object
   */
  async recoverActiveTasks(conversationId, user) {
    try {
      logger.info(`A2A Task Recovery - Starting recovery for conversation: ${conversationId}`);
      
      // Get conversation to check for active tasks
      const conversation = await this.getConversation(conversationId);
      logger.debug(`A2A Task Recovery - Retrieved conversation data:`, {
        hasMetadata: !!conversation?.metadata,
        activeTaskId: conversation?.metadata?.activeTaskId,
        lastTaskUpdate: conversation?.metadata?.lastTaskUpdate,
        agentId: conversation?.metadata?.agentId
      });
      
      if (!conversation?.metadata?.activeTaskId) {
        logger.info(`A2A Task Recovery - No active tasks found in conversation: ${conversationId}`);
        return;
      }

      const taskId = conversation.metadata.activeTaskId;
      const lastUpdate = new Date(conversation.metadata.lastTaskUpdate);
      const timeSinceUpdate = Date.now() - lastUpdate.getTime();
      
      logger.info(`A2A Task Recovery - Found active task: ${taskId}, last updated: ${lastUpdate.toISOString()}, time since: ${Math.round(timeSinceUpdate/1000)}s ago`);
      
      // If last update was more than 10 minutes ago, consider task stale
      if (timeSinceUpdate > 10 * 60 * 1000) {
        logger.warn(`A2A Task Recovery - Task ${taskId} appears stale (${Math.round(timeSinceUpdate/60000)} minutes old), skipping recovery`);
        return;
      }

      logger.info(`A2A Task Recovery - Fetching current status for task: ${taskId}`);

      // Get current task status
      const taskStatus = await this.agent.a2aClient.getTaskStatus(taskId);
      logger.info(`A2A Task Recovery - Retrieved task status: ${taskStatus.status}, message: ${taskStatus.statusMessage}`);
      
      if (taskStatus.status === 'completed') {
        logger.info(`A2A Task Recovery - Task completed, sending completion message: ${taskId}`);
        await this.sendTaskCompletionMessage(taskId, taskStatus, conversationId, user);
      } else if (taskStatus.status === 'failed') {
        logger.info(`A2A Task Recovery - Task failed, sending failure message: ${taskId}`);
        await this.sendTaskFailureMessage(taskId, taskStatus, conversationId, user);
      } else if (taskStatus.status === 'working') {
        logger.info(`A2A Task Recovery - Task still working, sending status update and resuming polling: ${taskId}`);
        // Send status update message
        await this.sendTaskStatusUpdate(taskId, taskStatus, conversationId, user);
        
        // Resume polling
        this.startTaskPolling(taskId, conversationId, user, null);
      } else {
        logger.warn(`A2A Task Recovery - Unexpected task status: ${taskStatus.status} for task: ${taskId}`);
      }

    } catch (error) {
      logger.error(`A2A Task Recovery - Failed to recover active tasks for conversation ${conversationId}:`, error);
    }
  }

  /**
   * Send task status update message
   * @param {string} taskId - Task identifier
   * @param {Object} taskStatus - Task status object
   * @param {string} contextId - Context identifier
   * @param {Object} user - User object
   */
  async sendTaskStatusUpdate(taskId, taskStatus, contextId, user) {
    try {
      const statusText = `🔄 **Task Status Update:** \`${taskId}\`\n\n` +
                        `**Status:** ${taskStatus.status}\n` +
                        `**Message:** ${taskStatus.statusMessage || 'Still processing...'}\n\n` +
                        `I'm continuing to work on your request. You'll be notified when it's complete.`;

      const statusMessage = {
        messageId: uuidv4(),
        conversationId: contextId,
        parentMessageId: null,
        role: 'assistant',
        text: statusText,
        user: user,
        endpoint: 'a2a',
        model: this.agent.id,
        metadata: {
          agentId: this.agent.id,
          agentName: this.agent.name,
          transport: 'a2a',
          taskId: taskId,
          taskStatus: taskStatus.status,
          isTaskStatusUpdate: true,
        },
      };

      await saveMessage(this.req, statusMessage, {
        context: 'A2A Agent Client - Task Status Update',
      });

      logger.debug(`Task status update sent for task: ${taskId}`);
      
    } catch (error) {
      logger.error(`Failed to send task status update for ${taskId}:`, error);
    }
  }

  /**
   * Get conversation from database
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<Object>} Conversation object
   */
  async getConversation(conversationId) {
    try {
      // This would typically use LibreChat's conversation model
      // For now, we'll use a placeholder that matches the expected structure
      const { getConvoById } = require('~/models');
      return await getConvoById(this.req, conversationId);
    } catch (error) {
      logger.error(`Failed to get conversation ${conversationId}: ${error.message}`);
      return null;
    }
  }
}

module.exports = A2AAgentClient;