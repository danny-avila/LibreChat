import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { UIResourceNode } from './types';

export const UI_RESOURCE_MARKER = '\\ui';
export const UI_RESOURCE_PATTERN = new RegExp(`\\${UI_RESOURCE_MARKER}(\\d+(?:,\\d+)*)`, 'g');

/**
 * Process text nodes and replace UI resource markers with components
 */
function processTree(tree: Node) {
  visit(tree, 'text', (node, index, parent) => {
    const textNode = node as UIResourceNode;
    const parentNode = parent as UIResourceNode;

    if (typeof textNode.value !== 'string') return;

    const originalValue = textNode.value;
    const segments: Array<UIResourceNode> = [];

    let currentPosition = 0;
    UI_RESOURCE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = UI_RESOURCE_PATTERN.exec(originalValue)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];
      const indicesString = match[1];
      const indices = indicesString.split(',').map(Number);

      if (matchIndex > currentPosition) {
        const textBeforeMatch = originalValue.substring(currentPosition, matchIndex);
        if (textBeforeMatch) {
          segments.push({ type: 'text', value: textBeforeMatch });
        }
      }

      if (indices.length === 1) {
        segments.push({
          type: 'mcp-ui-resource',
          data: {
            hName: 'mcp-ui-resource',
            hProperties: {
              resourceIndex: indices[0],
            },
          },
        });
      } else {
        segments.push({
          type: 'mcp-ui-carousel',
          data: {
            hName: 'mcp-ui-carousel',
            hProperties: {
              resourceIndices: indices,
            },
          },
        });
      }

      currentPosition = matchIndex + matchText.length;
    }

    if (currentPosition < originalValue.length) {
      const remainingText = originalValue.substring(currentPosition);
      if (remainingText) {
        segments.push({ type: 'text', value: remainingText });
      }
    }

    if (segments.length > 0 && index !== undefined) {
      parentNode.children?.splice(index, 1, ...segments);
      return index + segments.length;
    }
  });
}

/**
 * Remark plugin for processing MCP UI resource markers
 */
export function mcpUIResourcePlugin() {
  return (tree: Node) => {
    processTree(tree);
  };
}
