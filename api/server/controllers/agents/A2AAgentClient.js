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

      // Send message to A2A agent
      const response = await this.agent.a2aClient.sendMessage(text, contextId, false);
      
      if (!response.success) {
        throw new Error(response.error || 'A2A agent returned error');
      }

      // Extract response content with proper fallback logic
      const responseText = response.data?.parts?.[0]?.content || 
                          response.message?.parts?.[0]?.content || 
                          response.message?.content || 
                          response.parts?.[0]?.content || 
                          response.content || 
                          'Response received from A2A agent';

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
        metadata: {
          agentId: this.agent.id,
          agentName: this.agent.name,
          transport: 'a2a',
        },
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

      // Save conversation to database
      const conversationData = {
        conversationId: contextId,
        title: `A2A Chat with ${this.agent.name}`,
        endpoint: 'a2a',
        model: this.agent.id,
        user: user,
      };

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
}

module.exports = A2AAgentClient;