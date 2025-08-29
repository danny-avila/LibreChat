/**
 * ContentBlockRenderer - Renders individual content blocks based on their type
 * 
 * This component acts as a router, rendering the appropriate component for each
 * content block type (text, multimedia, TTS, charts, widgets, code).
 */

import React, { memo } from 'react';
import type { ContentBlock } from './types';
import { MultimediaRenderer } from './MultimediaRenderer';
import { TTSRenderer } from './TTSRenderer';
import { ChartRenderer } from './ChartRenderer';
import { WidgetRenderer } from './WidgetRenderer';
import CodeExecutionRenderer from './CodeExecutionRenderer';
import { getAriaLabels } from './utils/AccessibilityUtils';

interface ContentBlockRendererProps {
  block: ContentBlock;
  isLatestMessage: boolean;
  showCursor?: boolean;
}

const ContentBlockRenderer: React.FC<ContentBlockRendererProps> = ({
  block,
  isLatestMessage,
  showCursor = false,
}) => {
  const ariaLabels = getAriaLabels();

  switch (block.type) {
    case 'text':
      return (
        <div 
          className="enhanced-text-block"
          role="text"
          aria-label="Text content"
        >
          {block.content}
          {showCursor && (
            <span 
              className="result-streaming-cursor"
              aria-hidden="true"
            >
              |
            </span>
          )}
        </div>
      );

    case 'image':
    case 'video':
    case 'audio':
      return (
        <div 
          className={`enhanced-${block.type}-block my-4`}
          role="region"
          aria-label={`${block.type} content`}
        >
          <MultimediaRenderer block={block} />
        </div>
      );

    case 'tts':
      return (
        <div 
          className="enhanced-tts-block"
          role="region"
          aria-label="Text-to-speech content"
        >
          <TTSRenderer 
            text={block.content}
            language={block.metadata.language || 'pl-PL'}
          />
        </div>
      );

    case 'chart':
      return (
        <div 
          className="enhanced-chart-block"
          role="region"
          aria-label="Chart content"
        >
          <ChartRenderer 
            type={block.metadata.chartType || 'bar'}
            data={block.content}
          />
        </div>
      );

    case 'widget':
      return (
        <div 
          className="enhanced-widget-block my-4"
          role="region"
          aria-label="Interactive widget content"
        >
          <WidgetRenderer block={block} />
        </div>
      );

    case 'code':
      return (
        <div 
          className="enhanced-code-block"
          role="region"
          aria-label="Code execution content"
        >
          <CodeExecutionRenderer 
            code={block.content}
            language={block.metadata.codeLanguage || 'python'}
          />
        </div>
      );

    default:
      return (
        <div 
          className="enhanced-unknown-block text-red-500"
          role="alert"
          aria-label={`Unknown content type: ${block.type}`}
        >
          Unknown content type: {block.type}
        </div>
      );
  }
};



export { ContentBlockRenderer };
export default memo(ContentBlockRenderer);