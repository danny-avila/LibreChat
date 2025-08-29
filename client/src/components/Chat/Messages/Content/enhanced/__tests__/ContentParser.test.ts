/**
 * ContentParser Tests
 * 
 * Unit tests for the ContentParser utility class
 */

import { ContentParser } from '../ContentParser';

describe('ContentParser', () => {
  describe('hasEnhancedContent', () => {
    it('should detect TTS markup', () => {
      const text = 'Hello [tts:en-US]world[/tts]!';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect chart markup', () => {
      const text = 'Here is a chart: [chart:bar]data[/chart]';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect widget markup', () => {
      const text = 'Interactive widget: [widget:react]code[/widget]';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect code execution markup', () => {
      const text = 'Run this: [run:python]print("hello")[/run]';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect image URLs', () => {
      const text = 'Check out this image: https://example.com/image.jpg';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect video URLs', () => {
      const text = 'Watch this: https://example.com/video.mp4';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should detect audio URLs', () => {
      const text = 'Listen to this: https://example.com/audio.mp3';
      expect(ContentParser.hasEnhancedContent(text)).toBe(true);
    });

    it('should return false for plain text', () => {
      const text = 'This is just plain text without any enhanced content.';
      expect(ContentParser.hasEnhancedContent(text)).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse TTS markup correctly', () => {
      const text = 'Say [tts:en-US]hello world[/tts] in English';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks).toHaveLength(3);
      
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock).toBeDefined();
      expect(ttsBlock?.content).toBe('hello world');
      expect(ttsBlock?.metadata.language).toBe('en-US');
    });

    it('should parse chart markup correctly', () => {
      const text = 'Here is data: [chart:bar]{"labels":["A","B"],"data":[1,2]}[/chart]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      const chartBlock = result.blocks.find(block => block.type === 'chart');
      expect(chartBlock).toBeDefined();
      expect(chartBlock?.metadata.chartType).toBe('bar');
      expect(chartBlock?.metadata.dataSource).toBe('json');
    });

    it('should parse widget markup correctly', () => {
      const text = 'Interactive: [widget:react]<div>Hello</div>[/widget]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      const widgetBlock = result.blocks.find(block => block.type === 'widget');
      expect(widgetBlock).toBeDefined();
      expect(widgetBlock?.metadata.widgetType).toBe('react');
    });

    it('should parse code execution markup correctly', () => {
      const text = 'Run: [run:python]print("test")[/run]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      const codeBlock = result.blocks.find(block => block.type === 'code');
      expect(codeBlock).toBeDefined();
      expect(codeBlock?.metadata.codeLanguage).toBe('python');
    });

    it('should parse image URLs correctly', () => {
      const text = 'Image: https://example.com/test.jpg';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      const imageBlock = result.blocks.find(block => block.type === 'image');
      expect(imageBlock).toBeDefined();
      expect(imageBlock?.content).toBe('https://example.com/test.jpg');
    });

    it('should handle mixed content correctly', () => {
      const text = 'Text before [tts:en-US]speak this[/tts] and https://example.com/image.png after';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks.length).toBeGreaterThan(2);
      
      const hasText = result.blocks.some(block => block.type === 'text');
      const hasTTS = result.blocks.some(block => block.type === 'tts');
      const hasImage = result.blocks.some(block => block.type === 'image');
      
      expect(hasText).toBe(true);
      expect(hasTTS).toBe(true);
      expect(hasImage).toBe(true);
    });

    it('should return single text block for plain text', () => {
      const text = 'This is just plain text.';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(false);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('text');
      expect(result.blocks[0].content).toBe(text);
    });

    it('should handle empty text', () => {
      const text = '';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(false);
      expect(result.blocks).toHaveLength(0);
    });
  });
});