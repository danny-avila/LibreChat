import {
  SPAN_REGEX,
  COMPOSITE_REGEX,
  STANDALONE_PATTERN,
  CLEANUP_REGEX,
  INVALID_CITATION_REGEX,
} from '../citations';

describe('Citation Regex Patterns', () => {
  beforeEach(() => {
    // Reset regex lastIndex for global patterns
    SPAN_REGEX.lastIndex = 0;
    COMPOSITE_REGEX.lastIndex = 0;
    STANDALONE_PATTERN.lastIndex = 0;
    CLEANUP_REGEX.lastIndex = 0;
    INVALID_CITATION_REGEX.lastIndex = 0;
  });

  describe('STANDALONE_PATTERN', () => {
    describe('literal text format (\\ue202)', () => {
      it('should match literal text search citation', () => {
        const text = 'Some fact \\ue202turn0search0 here';
        STANDALONE_PATTERN.lastIndex = 0;
        const match = STANDALONE_PATTERN.exec(text);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe('0'); // turn number
        expect(match?.[2]).toBe('search'); // type
        expect(match?.[3]).toBe('0'); // index
      });

      it('should match literal text file citation', () => {
        const text = 'Document says \\ue202turn0file0 (doc.pdf)';
        STANDALONE_PATTERN.lastIndex = 0;
        const match = STANDALONE_PATTERN.exec(text);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe('0');
        expect(match?.[2]).toBe('file');
        expect(match?.[3]).toBe('0');
      });

      it('should match literal text news citation', () => {
        const text = 'Breaking news \\ue202turn0news1';
        STANDALONE_PATTERN.lastIndex = 0;
        const match = STANDALONE_PATTERN.exec(text);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe('0');
        expect(match?.[2]).toBe('news');
        expect(match?.[3]).toBe('1');
      });

      it('should match multiple literal text citations', () => {
        const text = 'Fact one \\ue202turn0search0 and fact two \\ue202turn0file1';
        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        STANDALONE_PATTERN.lastIndex = 0;
        while ((match = STANDALONE_PATTERN.exec(text)) !== null) {
          matches.push(match);
        }
        expect(matches).toHaveLength(2);
        expect(matches[0][2]).toBe('search');
        expect(matches[1][2]).toBe('file');
      });

      it('should match all supported types in literal text format', () => {
        const types = ['search', 'image', 'news', 'video', 'ref', 'file'];
        for (const type of types) {
          const text = `Test \\ue202turn0${type}0`;
          STANDALONE_PATTERN.lastIndex = 0;
          const match = STANDALONE_PATTERN.exec(text);
          expect(match).not.toBeNull();
          expect(match?.[2]).toBe(type);
        }
      });
    });

    describe('actual Unicode character format (U+E202)', () => {
      it('should match actual Unicode search citation', () => {
        const text = 'Some fact \ue202turn0search0 here';
        STANDALONE_PATTERN.lastIndex = 0;
        const match = STANDALONE_PATTERN.exec(text);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe('0');
        expect(match?.[2]).toBe('search');
        expect(match?.[3]).toBe('0');
      });

      it('should match actual Unicode file citation', () => {
        const text = 'Document says \ue202turn0file0 (doc.pdf)';
        STANDALONE_PATTERN.lastIndex = 0;
        const match = STANDALONE_PATTERN.exec(text);
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe('0');
        expect(match?.[2]).toBe('file');
        expect(match?.[3]).toBe('0');
      });

      it('should match all supported types in actual Unicode format', () => {
        const types = ['search', 'image', 'news', 'video', 'ref', 'file'];
        for (const type of types) {
          const text = `Test \ue202turn0${type}0`;
          STANDALONE_PATTERN.lastIndex = 0;
          const match = STANDALONE_PATTERN.exec(text);
          expect(match).not.toBeNull();
          expect(match?.[2]).toBe(type);
        }
      });
    });

    describe('mixed format handling', () => {
      it('should match both formats in the same text', () => {
        const text = 'Literal \\ue202turn0search0 and Unicode \ue202turn0file1';
        const matches: RegExpExecArray[] = [];
        let match: RegExpExecArray | null;
        STANDALONE_PATTERN.lastIndex = 0;
        while ((match = STANDALONE_PATTERN.exec(text)) !== null) {
          matches.push(match);
        }
        expect(matches).toHaveLength(2);
        expect(matches[0][2]).toBe('search');
        expect(matches[1][2]).toBe('file');
      });
    });
  });

  describe('SPAN_REGEX', () => {
    it('should match literal text span markers', () => {
      const text = 'Before \\ue203highlighted text\\ue204 after';
      SPAN_REGEX.lastIndex = 0;
      const match = SPAN_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match?.[0]).toContain('highlighted text');
    });

    it('should match actual Unicode span markers', () => {
      const text = 'Before \ue203highlighted text\ue204 after';
      SPAN_REGEX.lastIndex = 0;
      const match = SPAN_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match?.[0]).toContain('highlighted text');
    });
  });

  describe('COMPOSITE_REGEX', () => {
    it('should match literal text composite markers', () => {
      const text = 'Statement \\ue200\\ue202turn0search0\\ue202turn0news0\\ue201';
      COMPOSITE_REGEX.lastIndex = 0;
      const match = COMPOSITE_REGEX.exec(text);
      expect(match).not.toBeNull();
    });

    it('should match actual Unicode composite markers', () => {
      const text = 'Statement \ue200\ue202turn0search0\ue202turn0news0\ue201';
      COMPOSITE_REGEX.lastIndex = 0;
      const match = COMPOSITE_REGEX.exec(text);
      expect(match).not.toBeNull();
    });
  });

  describe('CLEANUP_REGEX', () => {
    it('should clean up literal text markers', () => {
      const text = '\\ue200\\ue201\\ue202\\ue203\\ue204\\ue206';
      const cleaned = text.replace(CLEANUP_REGEX, '');
      expect(cleaned).toBe('');
    });

    it('should clean up actual Unicode markers', () => {
      const text = '\ue200\ue201\ue202\ue203\ue204\ue206';
      const cleaned = text.replace(CLEANUP_REGEX, '');
      expect(cleaned).toBe('');
    });

    it('should preserve normal text while cleaning markers', () => {
      const text = 'Hello \\ue202turn0search0 world';
      const cleaned = text.replace(CLEANUP_REGEX, '');
      expect(cleaned).toBe('Hello turn0search0 world');
    });
  });

  describe('INVALID_CITATION_REGEX', () => {
    it('should match invalid literal text citations with leading whitespace', () => {
      const text = 'Text  \\ue202turn0search5';
      INVALID_CITATION_REGEX.lastIndex = 0;
      const match = INVALID_CITATION_REGEX.exec(text);
      expect(match).not.toBeNull();
    });

    it('should match invalid actual Unicode citations with leading whitespace', () => {
      const text = 'Text  \ue202turn0search5';
      INVALID_CITATION_REGEX.lastIndex = 0;
      const match = INVALID_CITATION_REGEX.exec(text);
      expect(match).not.toBeNull();
    });
  });

  describe('Integration: Full Citation Processing Flow', () => {
    /**
     * Simulates the citation processing flow used in the markdown plugin and copy-to-clipboard
     */
    const processFullCitationFlow = (text: string) => {
      // Step 1: Extract highlighted spans
      const spans: Array<{ content: string; position: number }> = [];
      let spanMatch;
      const spanRegex = new RegExp(SPAN_REGEX.source, 'g');
      while ((spanMatch = spanRegex.exec(text)) !== null) {
        const content = spanMatch[0].replace(/\\ue203|\\ue204|\ue203|\ue204/g, '');
        spans.push({ content, position: spanMatch.index });
      }

      // Step 2: Extract composite blocks
      const composites: Array<{ citations: string[]; position: number }> = [];
      let compMatch;
      const compRegex = new RegExp(COMPOSITE_REGEX.source, 'g');
      while ((compMatch = compRegex.exec(text)) !== null) {
        const block = compMatch[0];
        const citations: string[] = [];
        let citMatch;
        const citRegex = new RegExp(STANDALONE_PATTERN.source, 'g');
        while ((citMatch = citRegex.exec(block)) !== null) {
          citations.push(`turn${citMatch[1]}${citMatch[2]}${citMatch[3]}`);
        }
        composites.push({ citations, position: compMatch.index });
      }

      // Step 3: Extract standalone citations (not in composites)
      const standalones: Array<{ citation: string; position: number }> = [];
      let standMatch;
      const standRegex = new RegExp(STANDALONE_PATTERN.source, 'g');
      while ((standMatch = standRegex.exec(text)) !== null) {
        // Check if this position is inside a composite
        const isInComposite = composites.some(
          (c) => standMatch && standMatch.index >= c.position && standMatch.index < c.position + 50,
        );
        if (!isInComposite) {
          standalones.push({
            citation: `turn${standMatch[1]}${standMatch[2]}${standMatch[3]}`,
            position: standMatch.index,
          });
        }
      }

      // Step 4: Clean up text
      const cleanedText = text.replace(INVALID_CITATION_REGEX, '').replace(CLEANUP_REGEX, '');

      return { spans, composites, standalones, cleanedText };
    };

    describe('literal text format integration', () => {
      it('should process complex LLM response with multiple citation types', () => {
        const llmResponse = `Here's what I found about the topic.

\\ue203This is an important quote from the source.\\ue204 \\ue202turn0search0

The data shows several key findings \\ue202turn0search1 including:
- First finding \\ue202turn0news0
- Second finding \\ue200\\ue202turn0search2\\ue202turn0file0\\ue201

For more details, see the attached document \\ue202turn0file1.`;

        const result = processFullCitationFlow(llmResponse);

        expect(result.spans).toHaveLength(1);
        expect(result.spans[0].content).toBe('This is an important quote from the source.');

        expect(result.composites).toHaveLength(1);
        expect(result.composites[0].citations).toEqual(['turn0search2', 'turn0file0']);

        expect(result.standalones.length).toBeGreaterThanOrEqual(3);

        expect(result.cleanedText).not.toContain('\\ue202');
        expect(result.cleanedText).not.toContain('\\ue200');
      });

      it('should handle file citations from document search', () => {
        const fileSearchResponse = `Based on the document medical-anthem-blue-cross.pdf:

- **Annual deductible:** $3,300 per person \\ue202turn0file0
- **Out-of-pocket maximum:** $4,000 per person \\ue202turn0file0
- **Network:** Prudent Buyer PPO \\ue202turn0file1

Multiple sources confirm these details. \\ue200\\ue202turn0file0\\ue202turn0file1\\ue202turn0file2\\ue201`;

        const result = processFullCitationFlow(fileSearchResponse);

        expect(result.composites).toHaveLength(1);
        expect(result.composites[0].citations).toHaveLength(3);

        // Should find standalone file citations
        const fileCitations = result.standalones.filter((s) => s.citation.includes('file'));
        expect(fileCitations.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('actual Unicode format integration', () => {
      it('should process response with actual Unicode characters', () => {
        const llmResponse = `Research findings indicate the following:

\ue203Key insight from the study.\ue204 \ue202turn0search0

Additional context \ue202turn0news0 supports this conclusion \ue200\ue202turn0search1\ue202turn0ref0\ue201.`;

        const result = processFullCitationFlow(llmResponse);

        expect(result.spans).toHaveLength(1);
        expect(result.composites).toHaveLength(1);
        expect(result.standalones.length).toBeGreaterThanOrEqual(1);
        expect(result.cleanedText).not.toContain('\ue202');
      });
    });

    describe('mixed format integration', () => {
      it('should handle mixed literal and Unicode formats in same response', () => {
        const mixedResponse = `First citation uses literal \\ue202turn0search0 format.
Second citation uses Unicode \ue202turn0search1 format.
Composite with mixed: \\ue200\\ue202turn0file0\ue202turn0file1\\ue201`;

        const result = processFullCitationFlow(mixedResponse);

        // Should find citations from both formats
        expect(result.standalones.length).toBeGreaterThanOrEqual(2);
        expect(result.composites).toHaveLength(1);
        expect(result.composites[0].citations).toHaveLength(2);
      });
    });
  });

  describe('Performance: Regex Benchmarks', () => {
    /**
     * Generates a realistic citation-heavy text with specified number of citations
     */
    const generateCitationHeavyText = (citationCount: number, format: 'literal' | 'unicode') => {
      const marker = format === 'literal' ? '\\ue202' : '\ue202';
      const spanStart = format === 'literal' ? '\\ue203' : '\ue203';
      const spanEnd = format === 'literal' ? '\\ue204' : '\ue204';
      const compStart = format === 'literal' ? '\\ue200' : '\ue200';
      const compEnd = format === 'literal' ? '\\ue201' : '\ue201';

      const types = ['search', 'news', 'file', 'ref', 'image', 'video'];
      let text = '';

      for (let i = 0; i < citationCount; i++) {
        const type = types[i % types.length];
        const turn = Math.floor(i / 10);
        const index = i % 10;

        if (i % 5 === 0) {
          // Add highlighted text every 5th citation
          text += `${spanStart}Important fact number ${i}.${spanEnd} ${marker}turn${turn}${type}${index} `;
        } else if (i % 7 === 0) {
          // Add composite every 7th citation
          text += `Multiple sources ${compStart}${marker}turn${turn}${type}${index}${marker}turn${turn}${types[(i + 1) % types.length]}${(index + 1) % 10}${compEnd} confirm this. `;
        } else {
          text += `This is fact ${i} ${marker}turn${turn}${type}${index} from the research. `;
        }
      }

      return text;
    };

    it('should process 100 literal citations in reasonable time (<100ms)', () => {
      const text = generateCitationHeavyText(100, 'literal');

      const start = performance.now();

      // Run all regex operations
      const results = { spans: 0, composites: 0, standalones: 0, cleaned: '' };

      SPAN_REGEX.lastIndex = 0;
      while (SPAN_REGEX.exec(text) !== null) {
        results.spans++;
      }

      COMPOSITE_REGEX.lastIndex = 0;
      while (COMPOSITE_REGEX.exec(text) !== null) {
        results.composites++;
      }

      STANDALONE_PATTERN.lastIndex = 0;
      while (STANDALONE_PATTERN.exec(text) !== null) {
        results.standalones++;
      }

      results.cleaned = text.replace(CLEANUP_REGEX, '');

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(results.standalones).toBeGreaterThan(80); // Most should be standalone
      expect(results.spans).toBeGreaterThan(10); // Some highlighted
      expect(results.composites).toBeGreaterThan(5); // Some composites
    });

    it('should process 100 Unicode citations in reasonable time (<100ms)', () => {
      const text = generateCitationHeavyText(100, 'unicode');

      const start = performance.now();

      const results = { spans: 0, composites: 0, standalones: 0, cleaned: '' };

      SPAN_REGEX.lastIndex = 0;
      while (SPAN_REGEX.exec(text) !== null) {
        results.spans++;
      }

      COMPOSITE_REGEX.lastIndex = 0;
      while (COMPOSITE_REGEX.exec(text) !== null) {
        results.composites++;
      }

      STANDALONE_PATTERN.lastIndex = 0;
      while (STANDALONE_PATTERN.exec(text) !== null) {
        results.standalones++;
      }

      results.cleaned = text.replace(CLEANUP_REGEX, '');

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(results.standalones).toBeGreaterThan(80);
    });

    it('should process 500 citations without timeout (<500ms)', () => {
      const text = generateCitationHeavyText(500, 'literal');

      const start = performance.now();

      let count = 0;

      STANDALONE_PATTERN.lastIndex = 0;
      while (STANDALONE_PATTERN.exec(text) !== null) {
        count++;
      }

      const cleaned = text.replace(CLEANUP_REGEX, '');

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
      expect(count).toBeGreaterThan(400);
      expect(cleaned.length).toBeLessThan(text.length);
    });

    it('should handle mixed formats efficiently (<100ms for 100 citations)', () => {
      // Generate text with alternating formats
      const literalText = generateCitationHeavyText(50, 'literal');
      const unicodeText = generateCitationHeavyText(50, 'unicode');
      const mixedText = literalText + '\n\n' + unicodeText;

      const start = performance.now();

      let count = 0;

      STANDALONE_PATTERN.lastIndex = 0;
      while (STANDALONE_PATTERN.exec(mixedText) !== null) {
        count++;
      }

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(count).toBeGreaterThan(80); // Should find citations from both halves
    });

    it('should handle repeated execution during streaming simulation (<1000ms cumulative)', () => {
      /**
       * Simulates the markdown plugin running repeatedly during LLM streaming.
       * Each "token" adds ~10 characters, plugin runs on every update.
       */
      const fullText = generateCitationHeavyText(50, 'literal');
      const tokens: string[] = [];

      // Simulate streaming: break text into ~100 incremental chunks
      const chunkSize = Math.ceil(fullText.length / 100);
      for (let i = 0; i < fullText.length; i += chunkSize) {
        tokens.push(fullText.slice(0, i + chunkSize));
      }

      const start = performance.now();
      let totalMatches = 0;
      let spanCount = 0;
      let compositeCount = 0;

      // Simulate plugin running on each streaming update
      for (const partialText of tokens) {
        // Run all regex operations (simulating unicodeCitation plugin)
        SPAN_REGEX.lastIndex = 0;
        while (SPAN_REGEX.exec(partialText) !== null) {
          spanCount++;
        }

        COMPOSITE_REGEX.lastIndex = 0;
        while (COMPOSITE_REGEX.exec(partialText) !== null) {
          compositeCount++;
        }

        STANDALONE_PATTERN.lastIndex = 0;
        while (STANDALONE_PATTERN.exec(partialText) !== null) {
          totalMatches++;
        }

        // Cleanup would also run
        void partialText.replace(CLEANUP_REGEX, '');
      }

      const duration = performance.now() - start;

      // 100 streaming updates processing up to 50 citations each
      // Should complete in under 1 second cumulative
      expect(duration).toBeLessThan(1000);
      expect(totalMatches).toBeGreaterThan(1000); // Many matches across all iterations
      expect(spanCount).toBeGreaterThan(0);
      expect(compositeCount).toBeGreaterThan(0);
    });

    it('should handle rapid repeated execution (300 renders with 20 citations)', () => {
      /**
       * Realistic streaming scenario: 300 token updates, final text has ~20 citations
       */
      const fullText = generateCitationHeavyText(20, 'literal');
      const renderCount = 300;

      const start = performance.now();
      let totalOps = 0;

      // Simulate 300 renders, each processing progressively more text
      for (let i = 0; i < renderCount; i++) {
        const progress = Math.min(1, (i + 1) / renderCount);
        const partialText = fullText.slice(0, Math.floor(fullText.length * progress));

        SPAN_REGEX.lastIndex = 0;
        while (SPAN_REGEX.exec(partialText) !== null) {
          totalOps++;
        }

        COMPOSITE_REGEX.lastIndex = 0;
        while (COMPOSITE_REGEX.exec(partialText) !== null) {
          totalOps++;
        }

        STANDALONE_PATTERN.lastIndex = 0;
        while (STANDALONE_PATTERN.exec(partialText) !== null) {
          totalOps++;
        }

        void partialText.replace(CLEANUP_REGEX, '');
      }

      const duration = performance.now() - start;
      const avgPerRender = duration / renderCount;

      // Should complete all 300 renders in under 500ms total
      // Average per render should be under 2ms
      expect(duration).toBeLessThan(500);
      expect(avgPerRender).toBeLessThan(2);
      expect(totalOps).toBeGreaterThan(0);
    });
  });
});
