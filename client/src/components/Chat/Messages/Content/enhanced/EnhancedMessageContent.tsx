/**
 * EnhancedMessageContent - Main component for rendering enhanced content in agent messages
 * 
 * This component replaces standard markdown rendering for agent messages that contain
 * enhanced content markup. It parses the message text and renders appropriate components
 * for each content block type.
 */

import React, { memo, useMemo, useEffect, useRef } from 'react';
import { ContentParser } from './ContentParser';
import { ContentBlockRenderer } from './ContentBlockRenderer';
import { EnhancedContentErrorBoundary } from './EnhancedContentErrorBoundary';
import { logCompatibilityInfo } from './utils/BrowserCompatibility';
import Container from '../Container';
import { cn } from '~/utils';
import type { EnhancedMessageContentProps } from './types';
import { 
  globalAccessibilityUtils, 
  getLiveRegionManager,
  getFocusManager 
} from './utils/AccessibilityUtils';

const EnhancedMessageContent: React.FC<EnhancedMessageContentProps> = ({
  message,
  isLatestMessage,
  isCreatedByUser,
  showCursor = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRegionManager = getLiveRegionManager();
  const focusManager = getFocusManager();

  // Log compatibility information in development
  useEffect(() => {
    logCompatibilityInfo();
  }, []);

  // Parse message content into blocks, using cached data if available
  const parsedContent = useMemo(() => {
    // Check if we have cached enhanced content metadata
    if (message.enhancedContent?.hasEnhancedContent && message.enhancedContent.contentBlocks) {
      const cachedBlocks = message.enhancedContent.contentBlocks.map(block => ({
        id: block.id,
        type: block.type as any,
        content: block.content,
        metadata: block.metadata || {},
        position: block.position,
      }));
      
      return {
        blocks: cachedBlocks,
        hasEnhancedContent: true,
      };
    }
    
    // Otherwise parse the content
    return ContentParser.parse(message.text || '');
  }, [message.text, message.enhancedContent]);

  // Announce enhanced content to screen readers when it loads
  useEffect(() => {
    if (parsedContent.hasEnhancedContent && parsedContent.blocks.length > 0) {
      const contentTypes = [...new Set(parsedContent.blocks.map(block => block.type))];
      const announcement = `Enhanced content loaded with ${contentTypes.join(', ')} elements`;
      liveRegionManager.announce(announcement, 'polite');
    }
  }, [parsedContent, liveRegionManager]);

  // Set up focus management for enhanced content
  useEffect(() => {
    if (containerRef.current && parsedContent.hasEnhancedContent) {
      const focusableElements = focusManager.setFocusableElements(containerRef.current);
      if (focusableElements.length > 0) {
        focusManager.manageFocusOrder(focusableElements);
      }
    }
  }, [parsedContent, focusManager]);

  // If no enhanced content found, return null to fall back to standard rendering
  if (!parsedContent.hasEnhancedContent) {
    return null;
  }

  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.error('Enhanced Content Error:', error);
    console.error('Error Info:', errorInfo);
    
    // Announce error to screen readers
    liveRegionManager.announceStatus(
      'An error occurred while rendering enhanced content', 
      'assertive'
    );
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: errorReportingService.captureException(error, { extra: errorInfo });
    }
  };

  return (
    <Container message={message}>
      <EnhancedContentErrorBoundary onError={handleError}>
        <div
          ref={containerRef}
          className={cn(
            'markdown prose message-content dark:prose-invert light w-full break-words',
            isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
            showCursor ? 'result-streaming' : ''
          )}
          role="article"
          aria-label="Enhanced message content"
          tabIndex={0}
        >
          {parsedContent.blocks.map((block, index) => (
            <EnhancedContentErrorBoundary
              key={`boundary-${block.id}`}
              fallback={
                <div 
                  className="text-sm text-gray-500 italic p-2 bg-gray-50 rounded border"
                  role="alert"
                  aria-label={`Error rendering ${block.type} content`}
                >
                  Error rendering {block.type} content. The rest of the message should display normally.
                </div>
              }
            >
              <div
                key={block.id}
                className="enhanced-content-block"
                data-block-type={block.type}
                data-block-position={block.position}
                aria-label={`${block.type} content block ${index + 1} of ${parsedContent.blocks.length}`}
              >
                <ContentBlockRenderer
                  block={block}
                  isLatestMessage={isLatestMessage}
                  showCursor={showCursor && block.position === parsedContent.blocks.length - 1}
                />
              </div>
            </EnhancedContentErrorBoundary>
          ))}
          
          {/* Hidden summary for screen readers */}
          <div className="sr-only" aria-live="polite">
            Enhanced content summary: {parsedContent.blocks.length} content blocks including {
              [...new Set(parsedContent.blocks.map(block => block.type))].join(', ')
            }
          </div>
        </div>
      </EnhancedContentErrorBoundary>
    </Container>
  );
};

export default memo(EnhancedMessageContent);