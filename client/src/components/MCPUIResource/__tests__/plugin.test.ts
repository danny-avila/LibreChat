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
      const tree = createTree([createTextNode(`Here is a resource ${UI_RESOURCE_MARKER}{abc123}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: 'text', value: 'Here is a resource ' });
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties).toMatchObject({
        resourceId: 'abc123',
      });
    });

    it('should handle multiple single resource markers', () => {
      const tree = createTree([
        createTextNode(`First ${UI_RESOURCE_MARKER}{id1} and second ${UI_RESOURCE_MARKER}{id2}`),
      ]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(4);
      expect(children[0]).toEqual({ type: 'text', value: 'First ' });
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties).toMatchObject({ resourceId: 'id1' });
      expect(children[2]).toEqual({ type: 'text', value: ' and second ' });
      expect(children[3].type).toBe('mcp-ui-resource');
      expect(children[3].data.hProperties).toMatchObject({ resourceId: 'id2' });
    });

    it('should handle hex IDs', () => {
      const tree = createTree([createTextNode(`Resource ${UI_RESOURCE_MARKER}{a3f2b8c1d4}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children[1].data.hProperties).toMatchObject({ resourceId: 'a3f2b8c1d4' });
    });
  });

  describe('carousel markers', () => {
    it('should replace carousel marker with mcp-ui-carousel node', () => {
      const tree = createTree([createTextNode(`Carousel ${UI_RESOURCE_MARKER}{id1,id2,id3}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: 'text', value: 'Carousel ' });
      expect(children[1]).toEqual({
        type: 'mcp-ui-carousel',
        data: {
          hName: 'mcp-ui-carousel',
          hProperties: {
            resourceIds: ['id1', 'id2', 'id3'],
          },
        },
      });
    });

    it('should handle multiple IDs in carousel', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}{alpha,beta,gamma}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children[0].data.hProperties.resourceIds).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('id-based markers', () => {
    it('should replace single ID marker with mcp-ui-resource node', () => {
      const tree = createTree([createTextNode(`Check this ${UI_RESOURCE_MARKER}{abc123}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0]).toEqual({ type: 'text', value: 'Check this ' });
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties).toEqual({
        resourceId: 'abc123',
      });
    });

    it('should replace carousel ID marker with mcp-ui-carousel node', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}{one,two,three}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({
        type: 'mcp-ui-carousel',
        data: {
          hName: 'mcp-ui-carousel',
          hProperties: {
            resourceIds: ['one', 'two', 'three'],
          },
        },
      });
    });

    it('should ignore empty IDs', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}{}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0]).toEqual({ type: 'text', value: `${UI_RESOURCE_MARKER}{}` });
    });
  });

  describe('mixed content', () => {
    it('should handle text before and after markers', () => {
      const tree = createTree([
        createTextNode(
          `Before ${UI_RESOURCE_MARKER}{id1} middle ${UI_RESOURCE_MARKER}{id2,id3} after`,
        ),
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
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}{id1} after`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('mcp-ui-resource');
      expect(children[1].value).toBe(' after');
    });

    it('should handle marker at end of text', () => {
      const tree = createTree([createTextNode(`Before ${UI_RESOURCE_MARKER}{id1}`)]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].value).toBe('Before ');
      expect(children[1].type).toBe('mcp-ui-resource');
    });

    it('should handle consecutive markers', () => {
      const tree = createTree([
        createTextNode(`${UI_RESOURCE_MARKER}{id1}${UI_RESOURCE_MARKER}{id2}`),
      ]);
      processTree(tree);

      const children = (tree as any).children;
      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('mcp-ui-resource');
      expect(children[0].data.hProperties).toEqual({ resourceId: 'id1' });
      expect(children[1].type).toBe('mcp-ui-resource');
      expect(children[1].data.hProperties).toEqual({ resourceId: 'id2' });
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
            children: [createTextNode(`Text with ${UI_RESOURCE_MARKER}{id1}`)],
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
    it('should not match marker alone', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}`)]);
      processTree(tree);
      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('text');
    });

    it('should not match marker without braces', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}abc`)]);
      processTree(tree);
      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('text');
    });

    it('should not match marker with leading comma', () => {
      const tree = createTree([createTextNode(`${UI_RESOURCE_MARKER}{,id}`)]);
      processTree(tree);
      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('text');
    });

    it('should not match marker without backslash', () => {
      const tree = createTree([createTextNode('ui{id}')]);
      processTree(tree);
      const children = (tree as any).children;
      expect(children).toHaveLength(1);
      expect(children[0].type).toBe('text');
    });

    it('should handle valid hex ID patterns', () => {
      const validPatterns = [
        { input: `${UI_RESOURCE_MARKER}{abc123}`, id: 'abc123' },
        { input: `${UI_RESOURCE_MARKER}{a3f2b8c1d4}`, id: 'a3f2b8c1d4' },
        { input: `${UI_RESOURCE_MARKER}{1234567890}`, id: '1234567890' },
        { input: `${UI_RESOURCE_MARKER}{abcdef0123}`, id: 'abcdef0123' },
        { input: `${UI_RESOURCE_MARKER}{deadbeef}`, id: 'deadbeef' },
        { input: `${UI_RESOURCE_MARKER}{a1b2c3}`, id: 'a1b2c3' },
      ];

      validPatterns.forEach(({ input, id }) => {
        const tree = createTree([createTextNode(input)]);
        processTree(tree);

        const children = (tree as any).children;
        expect(children).toHaveLength(1);
        expect(children[0].type).toBe('mcp-ui-resource');
        expect(children[0].data.hProperties).toEqual({ resourceId: id });
      });
    });
  });
});
