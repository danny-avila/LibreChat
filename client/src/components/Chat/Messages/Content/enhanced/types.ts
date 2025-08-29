/**
 * Enhanced Content Rendering Types
 * Defines interfaces and types for the enhanced content rendering system
 */

export type ContentBlockType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'tts' 
  | 'chart' 
  | 'widget' 
  | 'code';

export interface ContentBlockMetadata {
  // TTS specific
  language?: string;
  
  // Chart specific  
  chartType?: 'bar' | 'line' | 'pie' | 'scatter';
  dataSource?: 'url' | 'json' | 'csv';
  
  // Widget specific
  widgetType?: 'react' | 'html';
  
  // Code specific
  codeLanguage?: string;
  
  // Multimedia specific
  mediaType?: string;
  dimensions?: { width?: number; height?: number };
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  content: string;
  metadata: ContentBlockMetadata;
  position: number;
}

export interface EnhancedMessageContentProps {
  message: import('librechat-data-provider').TMessage;
  isLatestMessage: boolean;
  isCreatedByUser: boolean;
  showCursor?: boolean;
}

export interface ContentParserResult {
  blocks: ContentBlock[];
  hasEnhancedContent: boolean;
}

// Chart-specific types
export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartRendererProps {
  type: 'bar' | 'line' | 'pie' | 'scatter';
  data: string; // URL, JSON, or CSV
}