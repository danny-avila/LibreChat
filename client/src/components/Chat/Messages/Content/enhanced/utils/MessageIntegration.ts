/**
 * MessageIntegration - Utilities for integrating enhanced content with existing LibreChat features
 */

import type { TMessage } from 'librechat-data-provider';
import { ContentParser } from '../ContentParser';
import type { ContentBlock } from '../types';

export class MessageIntegration {
  /**
   * Process a message to add enhanced content metadata
   */
  static processMessageForEnhancedContent(message: TMessage): TMessage {
    // Skip if already processed or if user message
    if (message.enhancedContent || message.isCreatedByUser) {
      return message;
    }

    try {
      const parsedContent = ContentParser.parse(message.text || '');
      
      if (parsedContent.hasEnhancedContent) {
        return {
          ...message,
          enhancedContent: {
            hasEnhancedContent: true,
            contentBlocks: parsedContent.blocks.map(block => ({
              id: block.id,
              type: block.type,
              content: block.content,
              metadata: block.metadata,
              position: block.position,
            })),
          },
        };
      }
    } catch (error) {
      console.warn('Error processing message for enhanced content:', error);
    }

    return message;
  }

  /**
   * Check if a message has enhanced content (cached or parsed)
   */
  static hasEnhancedContent(message: TMessage): boolean {
    console.log('MessageIntegration.hasEnhancedContent called with:', {
      messageId: message.messageId,
      isCreatedByUser: message.isCreatedByUser,
      text: message.text?.substring(0, 100)
    });

    // TEMPORARILY allow user messages for testing
    // if (message.isCreatedByUser) {
    //   return false;
    // }

    if (message.enhancedContent?.hasEnhancedContent) {
      console.log('Enhanced content found in cache:', message.enhancedContent);
      return true;
    }

    const hasEnhanced = ContentParser.hasEnhancedContent(message.text || '');
    console.log('ContentParser.hasEnhancedContent result:', {
      hasEnhanced,
      text: message.text?.substring(0, 100),
      isCreatedByUser: message.isCreatedByUser
    });

    if (hasEnhanced) {
      console.log('Enhanced content detected in message:', message.text);
    } else {
      console.log('No enhanced content detected in message:', message.text?.substring(0, 100));
    }

    return hasEnhanced;
  }

  /**
   * Get enhanced content blocks from a message
   */
  static getEnhancedContentBlocks(message: TMessage): ContentBlock[] {
    if (message.enhancedContent?.contentBlocks) {
      return message.enhancedContent.contentBlocks.map(block => ({
        id: block.id,
        type: block.type as any,
        content: block.content,
        metadata: block.metadata || {},
        position: block.position,
      }));
    }

    const parsedContent = ContentParser.parse(message.text || '');
    return parsedContent.blocks;
  }

  /**
   * Clear enhanced content cache from a message
   */
  static clearEnhancedContentCache(message: TMessage): TMessage {
    if (message.enhancedContent) {
      const { enhancedContent, ...messageWithoutCache } = message;
      return messageWithoutCache;
    }
    return message;
  }

  /**
   * Prepare message for regeneration (clears cache)
   */
  static prepareMessageForRegeneration(message: TMessage): TMessage {
    return this.clearEnhancedContentCache(message);
  }

  /**
   * Check if enhanced content is compatible with artifacts
   */
  static isCompatibleWithArtifacts(message: TMessage): boolean {
    const blocks = this.getEnhancedContentBlocks(message);
    
    // Enhanced content with code blocks might conflict with artifacts
    const hasCodeBlocks = blocks.some(block => block.type === 'code');
    
    // For now, allow both but this could be refined based on specific use cases
    return true;
  }

  /**
   * Check if enhanced content is compatible with file uploads
   */
  static isCompatibleWithFileUploads(message: TMessage): boolean {
    // Enhanced content should be compatible with file uploads
    // The content might reference uploaded files
    return true;
  }

  /**
   * Extract plain text from enhanced content for search/indexing
   */
  static extractPlainText(message: TMessage): string {
    const blocks = this.getEnhancedContentBlocks(message);
    
    return blocks
      .filter(block => block.type === 'text')
      .map(block => block.content)
      .join(' ') || message.text || '';
  }

  /**
   * Get content summary for enhanced messages
   */
  static getContentSummary(message: TMessage): string {
    if (!this.hasEnhancedContent(message)) {
      return message.text || '';
    }

    const blocks = this.getEnhancedContentBlocks(message);
    const contentTypes = [...new Set(blocks.map(block => block.type))];
    
    return `Enhanced content with ${blocks.length} blocks: ${contentTypes.join(', ')}`;
  }
}