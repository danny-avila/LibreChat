import { mcpUIResourcePlugin, UI_RESOURCE_MARKER } from '../plugin';
import type { Node } from 'unist';
import type { UIResourceNode } from '../types';

describe('mcpUIResourcePlugin', () => {
  const createTextNode = (value: string): UIResourceNode => ({
    type: 'text',
    value,
  });

  const createTree = (nodes: UIResourceNode[]): Node =>
    ({
      type: 'root',
      children: nodes,
    }) as Node;

  const processTree = (tree: Node) => {
    const plugin = mcpUIResourcePlugin();
    plugin(tree);
    return tree;
  };

  describe('single resource markers', () => {
    it('should replace single UI resource marker with mcp-ui-resource node', () => {
      const tree = createTree([createTextNode(`Here is a resource ${UI_RESOURCE_MARKER}0`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: 'text', value: 'Here is a resource ' });
      expect(children[1]).toEqual({
        type: 'mcp-ui-resource',
        data: {
          hName: 'mcp-ui-resource',
          hProperties: {
            resourceIndex: 0,
          },
        },
      });
    });

    it('should handle multiple single resource markers', () => {
      const tree = createTree([
        createTextNode(`First ${UI_RESOURCE_MARKER}0 and second ${UI_RESOURCE_MARKER}1`),
      ]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(4);
      expect(children[0]).toEqual({ type: 'text', value: 'First ' });
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties.resourceIndex).toBe(0);
      expect(children[2]).toEqual({ type: 'text', value: ' and second ' });
      expect(children[3].type).toBe('mcp-ui-resource');
      expect(children[3].data.hProperties.resourceIndex).toBe(1);
    });

    it('should handle large index numbers', () => {
      const tree = createTree([createTextNode(`Resource ${UI_RESOURCE_MARKER}42`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children[1].data.hProperties.resourceIndex).toBe(42);
    });
  });

  describe('carousel markers', () => {
    it('should replace carousel marker with mcp-ui-carousel node', () => {
      const tree = createTree([createTextNode(`Carousel ${UI_RESOURCE_MARKER}0,1,2`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: 'text', value: 'Carousel ' });
      expect(children[1]).toEqual({
        type: 'mcp-ui-carousel',
        data: {
          hName: 'mcp-ui-carousel',
          hProperties: {
            resourceIndices: [0, 1, 2],
          },
        },
      });
    });

    it('should handle large index numbers in carousel', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}100,200,300`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children[0].data.hProperties.resourceIndices).toEqual([100, 200, 300]);
    });
  });

  describe('mixed content', () => {
    it('should handle text before and after markers', () => {
      const tree = createTree([
        createTextNode(`Before ${UI_RESOURCE_MARKER}0 middle ${UI_RESOURCE_MARKER}1,2 after`),
      ]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(5);
      expect(children[0].value).toBe('Before ');
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[2].value).toBe(' middle ');
      expect(children[3].type).toBe('mcp-ui-carousel');
      expect(children[4].value).toBe(' after');
    });

    it('should handle marker at start of text', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}0 after`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('mcp-ui-resource');
      expect(children[1].value).toBe(' after');
    });

    it('should handle marker at end of text', () => {
      const tree = createTree([createTextNode(`Before ${UI_RESOURCE_MARKER}0`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].value).toBe('Before ');
      expect(children[1].type).toBe('mcp-ui-resource');
    });

    it('should handle consecutive markers', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}0${UI_RESOURCE_MARKER}1`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('mcp-ui-resource');
      expect(children[0].data.hProperties.resourceIndex).toBe(0);
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties.resourceIndex).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text nodes', () => {
      const tree = createTree([createTextNode('')]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({ type: 'text', value: '' });
    });

    it('should handle text without markers', () => {
      const tree = createTree([createTextNode('No markers here')]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({ type: 'text', value: 'No markers here' });
    });

    it('should handle non-text nodes', () => {
      const tree = createTree([{ type: 'paragraph', children: [] }]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('paragraph');
    });

    it('should handle nested structures', () => {
      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [createTextNode(`Text with ${UI_RESOURCE_MARKER}0`)],
          },
        ],
      } as Node;

      processTree(tree);

      const paragraph = (tree as any).children[0];
      const textNodes = paragraph.children;
      expect(textNodes).toHaveLength(2);
      expect(textNodes[0].value).toBe('Text with ');
      expect(textNodes[1].type).toBe('mcp-ui-resource');
    });

    it('should not process nodes without value property', () => {
      const tree = createTree([
        {
          type: 'text',
          // no value property
        } as UIResourceNode,
      ]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('text');
    });
  });

  describe('pattern validation', () => {
    it('should not match invalid patterns', () => {
      const invalidPatterns = [
        `${UI_RESOURCE_MARKER}`,
        `${UI_RESOURCE_MARKER}abc`,
        `${UI_RESOURCE_MARKER}-1`,
        `${UI_RESOURCE_MARKER},1`,
        `ui0`, // missing marker
      ];

      invalidPatterns.forEach((pattern) => {
        const tree = createTree([createTextNode(pattern)]);
        processTree(tree);

        const children = (tree as any).children;

        expect(children).toHaveLength(1);
        expect(children[0].type).toBe('text');
        expect(children[0].value).toBe(pattern);
      });
    });

    it('should handle partial matches correctly', () => {
      // Test that ui1.2 matches ui1 and leaves .2
      const tree1 = createTree([createTextNode(`${UI_RESOURCE_MARKER}1.2`)]);
      processTree(tree1);
      const children1 = (tree1 as any).children;
      expect(children1).toHaveLength(2);
      expect(children1[0].type).toBe('mcp-ui-resource');
      expect(children1[0].data.hProperties.resourceIndex).toBe(1);
      expect(children1[1].value).toBe('.2');

      // Test that ui1, matches as single resource followed by comma
      const tree2 = createTree([createTextNode(`${UI_RESOURCE_MARKER}1,`)]);
      processTree(tree2);
      const children2 = (tree2 as any).children;
      expect(children2).toHaveLength(2);
      expect(children2[0].type).toBe('mcp-ui-resource');
      expect(children2[0].data.hProperties.resourceIndex).toBe(1);
      expect(children2[1].value).toBe(',');
    });
  });
});
