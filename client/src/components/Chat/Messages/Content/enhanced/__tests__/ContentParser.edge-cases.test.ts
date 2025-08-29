/**
 * ContentParser Edge Cases Tests
 * 
 * Additional comprehensive tests for ContentParser edge cases,
 * malformed input, and complex scenarios not covered in basic tests.
 */

import { ContentParser } from '../ContentParser';

describe('ContentParser Edge Cases', () => {
  describe('Malformed Markup', () => {
    it('should handle unclosed TTS tags', () => {
      const text = 'Hello [tts:en-US]world without closing tag';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(false);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('text');
      expect(result.blocks[0].content).toBe(text);
    });

    it('should handle unopened closing tags', () => {
      const text = 'Hello world[/tts] without opening tag';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(false);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('text');
    });

    it('should handle nested tags of same type', () => {
      const text = '[tts:en-US]Hello [tts:pl-PL]nested[/tts] world[/tts]';
      const result = ContentParser.parse(text);
      
      // Should handle gracefully, likely treating as text
      expect(result.blocks).toBeDefined();
    });

    it('should handle empty tag content', () => {
      const text = 'Hello [tts:en-US][/tts] world';
      const result = ContentParser.parse(text);
      
      if (result.hasEnhancedContent) {
        const ttsBlock = result.blocks.find(block => block.type === 'tts');
        expect(ttsBlock?.content).toBe('');
      }
    });

    it('should handle tags with invalid attributes', () => {
      const text = 'Hello [tts:]world[/tts]';
      const result = ContentParser.parse(text);
      
      if (result.hasEnhancedContent) {
        const ttsBlock = result.blocks.find(block => block.type === 'tts');
        expect(ttsBlock?.metadata.language).toBe('');
      }
    });

    it('should handle malformed chart data', () => {
      const text = '[chart:bar]{invalid json}[/chart]';
      const result = ContentParser.parse(text);
      
      if (result.hasEnhancedContent) {
        const chartBlock = result.blocks.find(block => block.type === 'chart');
        expect(chartBlock?.content).toBe('{invalid json}');
        expect(chartBlock?.metadata.dataSource).toBe('json');
      }
    });

    it('should handle widget tags with no type', () => {
      const text = '[widget]console.log("test");[/widget]';
      const result = ContentParser.parse(text);
      
      if (result.hasEnhancedContent) {
        const widgetBlock = result.blocks.find(block => block.type === 'widget');
        expect(widgetBlock?.metadata.widgetType).toBe('react'); // Default fallback
      }
    });

    it('should handle code execution tags with no language', () => {
      const text = '[run]print("hello")[/run]';
      const result = ContentParser.parse(text);
      
      if (result.hasEnhancedContent) {
        const codeBlock = result.blocks.find(block => block.type === 'code');
        expect(codeBlock?.metadata.codeLanguage).toBe(''); // Empty language
      }
    });
  });

  describe('Complex Mixed Content', () => {
    it('should handle multiple different content types', () => {
      const text = `
        Here's some text with [tts:en-US]speech[/tts] and an image:
        https://example.com/image.jpg
        
        And a chart: [chart:bar]{"labels":["A","B"],"datasets":[{"data":[1,2]}]}[/chart]
        
        Plus a widget: [widget:react]<div>Hello</div>[/widget]
        
        And executable code: [run:python]print("test")[/run]
      `;
      
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks.length).toBeGreaterThan(5);
      
      const types = result.blocks.map(block => block.type);
      expect(types).toContain('tts');
      expect(types).toContain('image');
      expect(types).toContain('chart');
      expect(types).toContain('widget');
      expect(types).toContain('code');
    });

    it('should preserve order of mixed content', () => {
      const text = 'First [tts:en-US]TTS[/tts] then https://example.com/image.jpg then [chart:bar]data[/chart]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      // Check that order is preserved
      const nonTextBlocks = result.blocks.filter(block => block.type !== 'text');
      expect(nonTextBlocks[0].type).toBe('tts');
      expect(nonTextBlocks[1].type).toBe('image');
      expect(nonTextBlocks[2].type).toBe('chart');
    });

    it('should handle adjacent tags without text between', () => {
      const text = '[tts:en-US]Hello[/tts][chart:bar]data[/chart]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].type).toBe('tts');
      expect(result.blocks[1].type).toBe('chart');
    });
  });

  describe('URL Detection Edge Cases', () => {
    it('should handle URLs with query parameters', () => {
      const text = 'Image: https://example.com/image.jpg?width=500&height=300';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const imageBlock = result.blocks.find(block => block.type === 'image');
      expect(imageBlock?.content).toBe('https://example.com/image.jpg?width=500&height=300');
    });

    it('should handle URLs with fragments', () => {
      const text = 'Video: https://example.com/video.mp4#t=30';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const videoBlock = result.blocks.find(block => block.type === 'video');
      expect(videoBlock?.content).toBe('https://example.com/video.mp4#t=30');
    });

    it('should handle URLs in parentheses', () => {
      const text = 'Check this image (https://example.com/image.png) for details';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const imageBlock = result.blocks.find(block => block.type === 'image');
      expect(imageBlock?.content).toBe('https://example.com/image.png');
    });

    it('should handle URLs with special characters', () => {
      const text = 'Audio: https://example.com/audio-file_name.mp3';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const audioBlock = result.blocks.find(block => block.type === 'audio');
      expect(audioBlock?.content).toBe('https://example.com/audio-file_name.mp3');
    });

    it('should not detect invalid URLs', () => {
      const text = 'Not a URL: htp://invalid-protocol.com/image.jpg';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(false);
    });

    it('should handle multiple URLs of same type', () => {
      const text = 'Images: https://example.com/1.jpg and https://example.com/2.png';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const imageBlocks = result.blocks.filter(block => block.type === 'image');
      expect(imageBlocks).toHaveLength(2);
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle very long text efficiently', () => {
      const longText = 'A'.repeat(10000) + '[tts:en-US]test[/tts]' + 'B'.repeat(10000);
      
      const startTime = performance.now();
      const result = ContentParser.parse(longText);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should parse in under 100ms
      expect(result.hasEnhancedContent).toBe(true);
    });

    it('should handle many small tags efficiently', () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => `[tts:en-US]word${i}[/tts]`).join(' ');
      
      const startTime = performance.now();
      const result = ContentParser.parse(manyTags);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(200); // Should parse in under 200ms
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks.filter(block => block.type === 'tts')).toHaveLength(100);
    });

    it('should handle deeply nested content structures', () => {
      const text = '[widget:html]<div><p>Text with [tts:en-US]speech[/tts] inside</p></div>[/widget]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const widgetBlock = result.blocks.find(block => block.type === 'widget');
      expect(widgetBlock?.content).toContain('[tts:en-US]speech[/tts]');
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should handle Unicode characters in TTS content', () => {
      const text = '[tts:pl-PL]Cześć świecie! 🌍[/tts]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock?.content).toBe('Cześć świecie! 🌍');
    });

    it('should handle emojis in content', () => {
      const text = 'Hello 👋 [tts:en-US]world 🌍[/tts] 🎉';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock?.content).toBe('world 🌍');
    });

    it('should handle special characters in URLs', () => {
      const text = 'Image: https://example.com/файл.jpg';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const imageBlock = result.blocks.find(block => block.type === 'image');
      expect(imageBlock?.content).toBe('https://example.com/файл.jpg');
    });

    it('should handle HTML entities in content', () => {
      const text = '[tts:en-US]Hello &amp; goodbye[/tts]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock?.content).toBe('Hello &amp; goodbye');
    });
  });

  describe('Whitespace Handling', () => {
    it('should preserve whitespace in content', () => {
      const text = '[tts:en-US]  Hello   world  [/tts]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock?.content).toBe('  Hello   world  ');
    });

    it('should handle newlines in content', () => {
      const text = `[tts:en-US]Hello
      world[/tts]`;
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlock = result.blocks.find(block => block.type === 'tts');
      expect(ttsBlock?.content).toContain('\n');
    });

    it('should handle tabs and other whitespace', () => {
      const text = '[widget:react]\tconsole.log("test");\n\treturn <div>Hello</div>;[/widget]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const widgetBlock = result.blocks.find(block => block.type === 'widget');
      expect(widgetBlock?.content).toContain('\t');
    });
  });

  describe('Error Recovery', () => {
    it('should recover from parsing errors gracefully', () => {
      const text = 'Valid text [invalid:tag]content[/invalid] more valid text';
      const result = ContentParser.parse(text);
      
      // Should not crash and should return some result
      expect(result).toBeDefined();
      expect(result.blocks).toBeDefined();
    });

    it('should handle null or undefined input', () => {
      expect(() => ContentParser.parse(null as any)).not.toThrow();
      expect(() => ContentParser.parse(undefined as any)).not.toThrow();
      
      const nullResult = ContentParser.parse(null as any);
      expect(nullResult.hasEnhancedContent).toBe(false);
      expect(nullResult.blocks).toHaveLength(0);
    });

    it('should handle extremely malformed input', () => {
      const malformedText = '[[[tts:en-US]]]hello[[[/tts]]]';
      const result = ContentParser.parse(malformedText);
      
      // Should not crash
      expect(result).toBeDefined();
    });
  });

  describe('Content Block ID Generation', () => {
    it('should generate unique IDs for content blocks', () => {
      const text = '[tts:en-US]first[/tts] and [tts:en-US]second[/tts]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      const ttsBlocks = result.blocks.filter(block => block.type === 'tts');
      expect(ttsBlocks).toHaveLength(2);
      expect(ttsBlocks[0].id).not.toBe(ttsBlocks[1].id);
    });

    it('should generate consistent IDs for same content', () => {
      const text = '[tts:en-US]hello[/tts]';
      const result1 = ContentParser.parse(text);
      const result2 = ContentParser.parse(text);
      
      // IDs should be deterministic based on content and position
      const block1 = result1.blocks.find(block => block.type === 'tts');
      const block2 = result2.blocks.find(block => block.type === 'tts');
      expect(block1?.id).toBe(block2?.id);
    });
  });

  describe('Position Tracking', () => {
    it('should track correct positions for content blocks', () => {
      const text = 'Start [tts:en-US]middle[/tts] end';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      expect(result.blocks).toHaveLength(3);
      
      expect(result.blocks[0].position).toBe(0);
      expect(result.blocks[1].position).toBe(1);
      expect(result.blocks[2].position).toBe(2);
    });

    it('should maintain position order with mixed content', () => {
      const text = '[tts:en-US]first[/tts] https://example.com/image.jpg [chart:bar]data[/chart]';
      const result = ContentParser.parse(text);
      
      expect(result.hasEnhancedContent).toBe(true);
      
      // Positions should be sequential
      const positions = result.blocks.map(block => block.position);
      const sortedPositions = [...positions].sort((a, b) => a - b);
      expect(positions).toEqual(sortedPositions);
    });
  });
});