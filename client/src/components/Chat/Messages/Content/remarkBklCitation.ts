import { visit, SKIP } from 'unist-util-visit';
import type { Node } from 'unist';

interface TextNode extends Node {
  type: 'text';
  value: string;
}

interface HtmlNode extends Node {
  type: 'html';
  value: string;
}

interface LinkReferenceNode extends Node {
  type: 'linkReference';
  identifier: string;
  label: string;
  referenceType: 'shortcut' | 'full' | 'collapsed';
  children: TextNode[];
}

interface BklCitationNode extends Node {
  type: 'bkl-citation';
  data: {
    hName: string;
    hProperties: { n: number };
  };
  children: [];
}

type ChildNode = TextNode | HtmlNode | LinkReferenceNode | BklCitationNode | Node;

interface ParentNode extends Node {
  children?: ChildNode[];
}

/** Matches the hidden bkl_rid HTML comment */
const BKL_RID_REGEX = /^<!-- bkl_rid:[a-zA-Z0-9_-]+ -->$/;

/** Matches [N] citation patterns in plain text (fallback) */
const CITATION_REGEX = /\[(\d+)\]/g;

function makeCitationNode(n: number): BklCitationNode {
  return {
    type: 'bkl-citation',
    data: { hName: 'bkl-citation', hProperties: { n } },
    children: [],
  };
}

export function remarkBklCitation() {
  return (tree: Node) => {
    // 1. Remove <!-- bkl_rid:xxx --> inline HTML nodes
    visit(tree, 'html', (node, index, parent) => {
      const htmlNode = node as HtmlNode;
      const parentNode = parent as ParentNode;
      if (BKL_RID_REGEX.test(htmlNode.value.trim()) && index !== undefined) {
        parentNode.children?.splice(index, 1);
        return [SKIP, index];
      }
    });

    // 2. Convert [N] linkReference nodes → bkl-citation nodes
    //    remark parses [5] as linkReference (shortcut, identifier="5")
    //    remark parses [4][10] as linkReference (full, identifier="10", children=[text "4"])
    visit(tree, 'linkReference', (node, index, parent) => {
      const ref = node as LinkReferenceNode;
      const parentNode = parent as ParentNode;
      if (index === undefined) return;

      const childText = ref.children?.[0]?.value ?? '';
      const identifier = ref.identifier ?? '';

      const replacements: BklCitationNode[] = [];

      // Child text is the display content, e.g. "5" in [5] or "4" in [4][10]
      if (/^\d+$/.test(childText)) {
        replacements.push(makeCitationNode(Number(childText)));
      }

      // For full references [4][10]: identifier="10" is also a citation
      if (ref.referenceType === 'full' && /^\d+$/.test(identifier)) {
        replacements.push(makeCitationNode(Number(identifier)));
      }

      if (replacements.length > 0) {
        parentNode.children?.splice(index, 1, ...(replacements as unknown as ChildNode[]));
        return [SKIP, index + replacements.length];
      }
    });

    // 3. Fallback: handle [N] in raw text nodes (in case remark doesn't parse as linkReference)
    visit(tree, 'text', (node, index, parent) => {
      const textNode = node as TextNode;
      const parentNode = parent as ParentNode;
      if (typeof textNode.value !== 'string') return;

      CITATION_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      let hasMatch = false;
      const segments: ChildNode[] = [];
      let currentPos = 0;

      while ((match = CITATION_REGEX.exec(textNode.value)) !== null) {
        hasMatch = true;
        const n = Number(match[1]);
        if (match.index > currentPos) {
          segments.push({ type: 'text', value: textNode.value.substring(currentPos, match.index) } as TextNode);
        }
        segments.push(makeCitationNode(n));
        currentPos = match.index + match[0].length;
      }

      if (!hasMatch) return;

      if (currentPos < textNode.value.length) {
        segments.push({ type: 'text', value: textNode.value.substring(currentPos) } as TextNode);
      }

      if (segments.length > 0 && index !== undefined) {
        parentNode.children?.splice(index, 1, ...segments);
        return [SKIP, index + segments.length];
      }
    });
  };
}
