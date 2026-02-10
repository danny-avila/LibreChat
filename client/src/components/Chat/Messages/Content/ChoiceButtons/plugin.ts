import { visit } from 'unist-util-visit';
import type { Pluggable } from 'unified';

interface DirectiveNode {
  type: string;
  name?: string;
  children?: DirectiveNode[];
  value?: string;
  data?: Record<string, unknown>;
}

function extractText(node: DirectiveNode): string {
  if (node.value) {
    return node.value;
  }
  if (node.children) {
    return node.children.map(extractText).join('').trim();
  }
  return '';
}

export const choicesPlugin: Pluggable = () => {
  return (tree) => {
    visit(
      tree,
      ['textDirective', 'leafDirective', 'containerDirective'],
      (node: DirectiveNode) => {
        if (node.name !== 'choices') {
          return;
        }

        // Extract list items from the container directive's children
        // The children are typically: list > listItem > paragraph > text
        const choices: string[] = [];
        if (node.children) {
          for (const child of node.children) {
            if (child.type === 'list' && child.children) {
              for (const listItem of child.children) {
                const text = extractText(listItem);
                if (text) {
                  choices.push(text);
                }
              }
            }
          }
        }

        if (choices.length === 0) {
          return;
        }

        node.data = {
          hName: 'choice-buttons',
          hProperties: { choices: JSON.stringify(choices) },
          ...node.data,
        };
      },
    );
  };
};
