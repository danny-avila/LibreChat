import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { UIResourceNode } from './types';

export const UI_RESOURCE_MARKER = '\\ui';
// Pattern matches: \ui{id1} or \ui{id1,id2,id3} and captures everything between the braces
export const UI_RESOURCE_PATTERN = /\\ui\{([\w]+(?:,[\w]+)*)\}/g;

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
      const idGroup = match[1];
      const idValues = idGroup
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (matchIndex > currentPosition) {
        const textBeforeMatch = originalValue.substring(currentPosition, matchIndex);
        if (textBeforeMatch) {
          segments.push({ type: 'text', value: textBeforeMatch });
        }
      }

      if (idValues.length === 1) {
        segments.push({
          type: 'mcp-ui-resource',
          data: {
            hName: 'mcp-ui-resource',
            hProperties: {
              resourceId: idValues[0],
            },
          },
        });
      } else if (idValues.length > 1) {
        segments.push({
          type: 'mcp-ui-carousel',
          data: {
            hName: 'mcp-ui-carousel',
            hProperties: {
              resourceIds: idValues,
            },
          },
        });
      } else {
        // Unable to parse marker; keep original text
        segments.push({ type: 'text', value: matchText });
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
