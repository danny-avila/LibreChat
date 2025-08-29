/**
 * ContentParser - Parses agent message text and identifies enhanced content markup tags
 * 
 * Supports the following markup patterns:
 * - Images/Videos/Audio: Direct URLs to media files
 * - TTS: [tts:language-code]text[/tts]
 * - Charts: [chart:type]data[/chart]
 * - Widgets: [widget:react|html]code[/widget]
 * - Code Execution: [run:language]code[/run]
 */

import type { ContentBlock, ContentBlockMetadata, ContentParserResult } from './types';

export class ContentParser {
  private static readonly MARKUP_PATTERNS = {
    // TTS pattern: [tts:en-US]Hello world[/tts]
    tts: /\[tts:([a-z]{2}-[A-Z]{2})\](.*?)\[\/tts\]/gs,
    
    // Chart pattern: [chart:bar]data[/chart]
    chart: /\[chart:(bar|line|pie|scatter)\](.*?)\[\/chart\]/gs,
    
    // Widget pattern: [widget:react]code[/widget] or [widget:html]code[/widget]
    widget: /\[widget:(react|html)\](.*?)\[\/widget\]/gs,
    
    // Code execution pattern: [run:python]code[/run]
    code: /\[run:(\w+)\](.*?)\[\/run\]/gs,
  };

  private static readonly MEDIA_PATTERNS = {
    // Image URLs - expanded to catch more patterns
    image: /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)(?:\?[^\s]*)?/gi,
    
    // Image URLs without extensions (common in APIs)
    imageGeneric: /https?:\/\/[^\s]*(?:image|img|photo|picture|pic)[^\s]*/gi,
    
    // Common image hosting services
    imageServices: /https?:\/\/(?:i\.imgur\.com|cdn\.discordapp\.com|images\.unsplash\.com|picsum\.photos|via\.placeholder\.com|placehold\.it|dummyimage\.com)[^\s]*/gi,
    
    // Generic HTTP/HTTPS URLs that might be images (fallback)
    genericUrl: /https?:\/\/[^\s]+/gi,
    
    // Video URLs
    video: /https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^\s]*)?/gi,
    
    // Audio URLs
    audio: /https?:\/\/[^\s]+\.(?:mp3|wav|ogg|m4a|aac|flac)(?:\?[^\s]*)?/gi,
  };

  /**
   * Parse message text and extract enhanced content blocks
   */
  public static parse(text: string): ContentParserResult {
    const blocks: ContentBlock[] = [];
    let processedText = text;
    let position = 0;
    let hasEnhancedContent = false;

    // Track processed ranges to avoid overlapping matches
    const processedRanges: Array<{ start: number; end: number }> = [];

    // Process markup patterns first
    this.processMarkupPatterns(text, blocks, processedRanges);
    
    // Process media URLs in remaining text
    this.processMediaUrls(text, blocks, processedRanges);

    // Process remaining text as plain text blocks
    this.processRemainingText(text, blocks, processedRanges);

    // Sort blocks by position and assign sequential positions
    blocks.sort((a, b) => a.position - b.position);
    blocks.forEach((block, index) => {
      block.position = index;
      if (block.type !== 'text') {
        hasEnhancedContent = true;
      }
    });

    return {
      blocks,
      hasEnhancedContent,
    };
  }

  /**
   * Process markup patterns (TTS, charts, widgets, code)
   */
  private static processMarkupPatterns(
    text: string,
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>
  ): void {
    // Process TTS markup
    this.processPattern(
      text,
      this.MARKUP_PATTERNS.tts,
      'tts',
      blocks,
      processedRanges,
      (match) => ({
        language: match[1] || 'pl-PL', // Default to Polish as specified in requirements
      })
    );

    // Process chart markup
    this.processPattern(
      text,
      this.MARKUP_PATTERNS.chart,
      'chart',
      blocks,
      processedRanges,
      (match) => ({
        chartType: match[1] as 'bar' | 'line' | 'pie' | 'scatter',
        dataSource: this.detectDataSource(match[2]),
      })
    );

    // Process widget markup
    this.processPattern(
      text,
      this.MARKUP_PATTERNS.widget,
      'widget',
      blocks,
      processedRanges,
      (match) => ({
        widgetType: match[1] as 'react' | 'html',
      })
    );

    // Process code execution markup
    this.processPattern(
      text,
      this.MARKUP_PATTERNS.code,
      'code',
      blocks,
      processedRanges,
      (match) => ({
        codeLanguage: match[1],
      })
    );
  }

  /**
   * Process media URLs (images, videos, audio)
   */
  private static processMediaUrls(
    text: string,
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>
  ): void {
    // Process images - specific patterns first
    this.processMediaPattern(text, this.MEDIA_PATTERNS.image, 'image', blocks, processedRanges);
    this.processMediaPattern(text, this.MEDIA_PATTERNS.imageGeneric, 'image', blocks, processedRanges);
    this.processMediaPattern(text, this.MEDIA_PATTERNS.imageServices, 'image', blocks, processedRanges);
    
    // Process videos
    this.processMediaPattern(text, this.MEDIA_PATTERNS.video, 'video', blocks, processedRanges);
    
    // Process audio
    this.processMediaPattern(text, this.MEDIA_PATTERNS.audio, 'audio', blocks, processedRanges);
    
    // Process generic URLs as potential images (fallback)
    this.processGenericUrls(text, blocks, processedRanges);
  }

  /**
   * Process generic URLs and try to determine if they're images
   */
  private static processGenericUrls(
    text: string,
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>
  ): void {
    let match;
    const pattern = this.MEDIA_PATTERNS.genericUrl;
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const url = match[0];
      
      // Skip if already processed
      if (this.isRangeOverlapping(start, end, processedRanges)) {
        continue;
      }
      
      // Try to determine if this URL is likely an image
      if (this.isLikelyImageUrl(url)) {
        blocks.push({
          id: this.generateId(),
          type: 'image',
          content: url,
          metadata: {
            mediaType: 'image',
            isGenericUrl: true,
          },
          position: start,
        });
        
        processedRanges.push({ start, end });
      }
    }
  }

  /**
   * Heuristic to determine if a URL is likely an image
   */
  private static isLikelyImageUrl(url: string): boolean {
    // Check for image-related keywords in URL
    const imageKeywords = ['image', 'img', 'photo', 'picture', 'pic', 'avatar', 'thumbnail', 'thumb'];
    const lowerUrl = url.toLowerCase();
    
    // Check for image keywords
    if (imageKeywords.some(keyword => lowerUrl.includes(keyword))) {
      return true;
    }
    
    // Check for common image hosting domains
    const imageHosts = [
      'imgur.com', 'i.imgur.com',
      'cdn.discordapp.com',
      'images.unsplash.com',
      'picsum.photos',
      'via.placeholder.com',
      'placehold.it',
      'dummyimage.com',
      'gravatar.com',
      'githubusercontent.com'
    ];
    
    if (imageHosts.some(host => lowerUrl.includes(host))) {
      return true;
    }
    
    // For now, let's be aggressive and treat most URLs as potential images
    // This can be refined based on actual usage
    return true;
  }

  /**
   * Process remaining text as plain text blocks
   */
  private static processRemainingText(
    text: string,
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>
  ): void {
    // If no processed ranges, add entire text as single block
    if (processedRanges.length === 0) {
      if (text.trim()) {
        blocks.push({
          id: this.generateId(),
          type: 'text',
          content: text.trim(),
          metadata: {},
          position: 0,
        });
      }
      return;
    }

    // Sort processed ranges by start position
    processedRanges.sort((a, b) => a.start - b.start);

    let lastEnd = 0;
    
    for (const range of processedRanges) {
      // Add text before this range
      if (range.start > lastEnd) {
        const textContent = text.slice(lastEnd, range.start).trim();
        if (textContent) {
          blocks.push({
            id: this.generateId(),
            type: 'text',
            content: textContent,
            metadata: {},
            position: lastEnd,
          });
        }
      }
      lastEnd = Math.max(lastEnd, range.end);
    }

    // Add remaining text after all ranges
    if (lastEnd < text.length) {
      const textContent = text.slice(lastEnd).trim();
      if (textContent) {
        blocks.push({
          id: this.generateId(),
          type: 'text',
          content: textContent,
          metadata: {},
          position: lastEnd,
        });
      }
    }
  }

  /**
   * Generic pattern processor for markup patterns
   */
  private static processPattern(
    text: string,
    pattern: RegExp,
    type: ContentBlock['type'],
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>,
    metadataExtractor: (match: RegExpExecArray) => ContentBlockMetadata
  ): void {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // Check if this range overlaps with already processed ranges
      if (this.isRangeOverlapping(start, end, processedRanges)) {
        continue;
      }

      blocks.push({
        id: this.generateId(),
        type,
        content: match[2] || match[0], // Use captured content or full match
        metadata: metadataExtractor(match),
        position: start,
      });

      processedRanges.push({ start, end });
    }
  }

  /**
   * Process media URL patterns
   */
  private static processMediaPattern(
    text: string,
    pattern: RegExp,
    type: 'image' | 'video' | 'audio',
    blocks: ContentBlock[],
    processedRanges: Array<{ start: number; end: number }>
  ): void {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // Check if this range overlaps with already processed ranges
      if (this.isRangeOverlapping(start, end, processedRanges)) {
        continue;
      }

      blocks.push({
        id: this.generateId(),
        type,
        content: match[0],
        metadata: {
          mediaType: this.extractMediaType(match[0]),
        },
        position: start,
      });

      processedRanges.push({ start, end });
    }
  }

  /**
   * Check if a range overlaps with existing processed ranges
   */
  private static isRangeOverlapping(
    start: number,
    end: number,
    processedRanges: Array<{ start: number; end: number }>
  ): boolean {
    return processedRanges.some(
      (range) => !(end <= range.start || start >= range.end)
    );
  }

  /**
   * Detect data source type for chart data
   */
  private static detectDataSource(data: string): 'url' | 'json' | 'csv' {
    const trimmedData = data.trim();
    
    // Check if it's a URL
    if (trimmedData.match(/^https?:\/\//)) {
      return 'url';
    }
    
    // Check if it's JSON
    if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
      return 'json';
    }
    
    // Default to CSV
    return 'csv';
  }

  /**
   * Extract media type from URL
   */
  private static extractMediaType(url: string): string {
    const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  /**
   * Generate unique ID for content blocks
   */
  private static generateId(): string {
    return `content-block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if text contains any enhanced content patterns
   */
  public static hasEnhancedContent(text: string): boolean {
    // Quick check for markup patterns
    const hasMarkup = Object.values(this.MARKUP_PATTERNS).some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });

    if (hasMarkup) return true;

    // Quick check for media URLs
    const hasMedia = Object.values(this.MEDIA_PATTERNS).some(pattern => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });

    return hasMedia;
  }
}