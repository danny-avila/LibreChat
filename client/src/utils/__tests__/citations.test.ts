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
        const matches = [];
        let match;
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
        const matches = [];
        let match;
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
});
