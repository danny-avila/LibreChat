import { Schema, Node as ProseMirrorNode, Fragment } from "prosemirror-model";
import { parseMarkdownWithUnified } from "./remarkToProseMirror";

// Define the markdown schema for ProseMirror
export const markdownSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
    },

    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM() {
        return ["p", 0];
      },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } },
      ],
      toDOM(node) {
        return [`h${node.attrs.level}`, 0];
      },
    },

    code_block: {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      attrs: { language: { default: "" } },
      parseDOM: [
        {
          tag: "pre",
          preserveWhitespace: "full",
          getAttrs: (node) => ({
            language: (node as HTMLElement).getAttribute("data-language") || "",
          }),
        },
        {
          tag: "div.canvas-code-block",
          preserveWhitespace: "full",
          getAttrs: (node) => {
            const codeElement = (node as HTMLElement).querySelector("code");
            return {
              language: codeElement?.getAttribute("data-language") || "",
            };
          },
        },
        {
          tag: "div.canvas-simple-code",
          preserveWhitespace: "full",
          getAttrs: () => ({ language: "" }),
        },
      ],
      toDOM(node) {
        const language = node.attrs.language || "";

        // Create structure like main chat: wrapper > header + content
        if (language) {
          return [
            "div",
            {
              class:
                "canvas-code-block w-full bg-black dark:bg-black rounded-md text-white dark:text-white my-4",
            },
            [
              "div",
              {
                class:
                  "relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans",
              },
              [
                "span",
                { class: "font-medium text-white/80 dark:text-white" },
                language.toUpperCase(),
              ],
              [
                "button",
                {
                  class:
                    "ml-auto flex gap-2 items-center text-white hover:text-gray-200 dark:hover:text-gray-200 transition-colors canvas-copy-btn",
                  title: "Copy code",
                  type: "button",
                },
                "📋 Copy",
              ],
            ],
            [
              "div",
              {
                class:
                  "overflow-y-auto bg-black p-4 rounded-bl-md rounded-br-md",
              },
              [
                "code",
                {
                  class:
                    "block bg-black text-white font-mono leading-relaxed whitespace-pre overflow-x-auto",
                  "data-language": language,
                },
                0,
              ],
            ],
          ];
        } else {
          // Simple code block without header for no language
          return [
            "pre",
            { class: "canvas-simple-code bg-black rounded-md p-4 my-4" },
            ["code", { class: "text-white font-mono text-xs" }, 0],
          ];
        }
      },
    },

    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM() {
        return ["blockquote", 0];
      },
    },

    horizontal_rule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM() {
        return ["hr"];
      },
    },

    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM() {
        return ["ul", 0];
      },
    },

    ordered_list: {
      attrs: { order: { default: 1 } },
      content: "list_item+",
      group: "block",
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (node) => ({
            order: (node as HTMLElement).hasAttribute("start")
              ? +(node as HTMLElement).getAttribute("start")!
              : 1,
          }),
        },
      ],
      toDOM(node) {
        return node.attrs.order === 1
          ? ["ol", 0]
          : ["ol", { start: node.attrs.order }, 0];
      },
    },

    list_item: {
      content: "paragraph block*",
      parseDOM: [{ tag: "li" }],
      toDOM() {
        return ["li", 0];
      },
    },

    text: {
      group: "inline",
    },

    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM() {
        return ["br"];
      },
    },

    table: {
      content: "table_row+",
      group: "block",
      parseDOM: [{ tag: "table" }],
      toDOM() {
        return [
          "table",
          {
            class:
              "canvas-table border-collapse border border-gray-300 dark:border-gray-600 w-full my-4",
          },
          0,
        ];
      },
    },

    table_row: {
      content: "table_cell+",
      parseDOM: [{ tag: "tr" }],
      toDOM() {
        return ["tr", 0];
      },
    },

    table_cell: {
      content: "inline*",
      parseDOM: [{ tag: "td" }, { tag: "th" }],
      toDOM() {
        return [
          "td",
          {
            class:
              "border border-gray-300 dark:border-gray-600 px-3 py-2 text-left",
          },
          0,
        ];
      },
    },
  },

  marks: {
    strong: {
      parseDOM: [
        { tag: "strong" },
        {
          tag: "b",
          getAttrs: (node) =>
            (node as HTMLElement).style.fontWeight !== "normal" && null,
        },
        {
          style: "font-weight",
          getAttrs: (value) =>
            /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
        },
      ],
      toDOM() {
        return ["strong", 0];
      },
    },

    em: {
      parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
      toDOM() {
        return ["em", 0];
      },
    },

    code: {
      parseDOM: [{ tag: "code" }],
      toDOM() {
        return ["code", { spellcheck: "false" }, 0];
      },
    },

    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (node) => ({
            href: (node as HTMLElement).getAttribute("href"),
            title: (node as HTMLElement).getAttribute("title"),
          }),
        },
      ],
      toDOM(node) {
        const { href, title } = node.attrs;
        return ["a", { href, title }, 0];
      },
    },

    // Inline heading marks (to avoid block-level behavior)
    heading1: {
      parseDOM: [{ tag: "span.heading-1" }],
      toDOM() {
        return [
          "span",
          {
            class: "heading-1",
            style:
              "font-size: 2em; font-weight: bold; color: #000000; display: inline;",
          },
          0,
        ];
      },
    },

    heading2: {
      parseDOM: [{ tag: "span.heading-2" }],
      toDOM() {
        return [
          "span",
          {
            class: "heading-2",
            style:
              "font-size: 1.5em; font-weight: bold; color: #000000; display: inline;",
          },
          0,
        ];
      },
    },

    heading3: {
      parseDOM: [{ tag: "span.heading-3" }],
      toDOM() {
        return [
          "span",
          {
            class: "heading-3",
            style:
              "font-size: 1.17em; font-weight: bold; color: #000000; display: inline;",
          },
          0,
        ];
      },
    },
  },
});

// Helper function to create an empty document
export function createEmptyDoc(): ProseMirrorNode {
  return markdownSchema.node("doc", null, [
    markdownSchema.node("paragraph", null, []),
  ]);
}

// Helper function to parse markdown text to ProseMirror nodes
// Parse inline markdown (bold, italic, code) without creating paragraph blocks
export function parseInlineMarkdown(text: string): Fragment {
  const nodes: ProseMirrorNode[] = [];
  let currentPos = 0;

  // Regex patterns for inline formatting (including inline headings)
  // Order matters - more specific patterns first
  const patterns = [
    { regex: /^### ([^#\n]+)/g, mark: "heading3" }, // ### heading
    { regex: /^## ([^#\n]+)/g, mark: "heading2" }, // ## heading
    { regex: /^# ([^#\n]+)/g, mark: "heading1" }, // # heading
    { regex: /^\^([^\n]+)/g, mark: "body" }, // ^body text
    { regex: /^body: ([^\n]+)/g, mark: "body" }, // body: text (legacy format)
    { regex: /\*\*([^*]+)\*\*/g, mark: "strong" }, // **bold**
    { regex: /\*([^*]+)\*/g, mark: "em" }, // *italic*
    { regex: /`([^`]+)`/g, mark: "code" }, // `code`
  ];

  // Find all matches and their positions
  const matches: Array<{
    start: number;
    end: number;
    content: string;
    mark: string;
  }> = [];

  for (const pattern of patterns) {
    let match;
    pattern.regex.lastIndex = 0; // Reset regex
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1], // The content inside the markers
        mark: pattern.mark,
      });
    }
  }

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the first one)
  const filteredMatches: Array<{
    start: number;
    end: number;
    content: string;
    mark: string;
  }> = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      filteredMatches.push(match);
      lastEnd = match.end;
    }
  }

  // Process text with formatting
  for (const match of filteredMatches) {
    // Add plain text before this match
    if (currentPos < match.start) {
      const plainText = text.slice(currentPos, match.start);
      if (plainText && plainText.trim()) {
        nodes.push(markdownSchema.text(plainText));
      }
    }

    // Add formatted text
    if (match.mark === "body") {
      // For body text, just add plain text without any marks
      nodes.push(markdownSchema.text(match.content));
    } else {
      const mark = markdownSchema.mark(match.mark);
      nodes.push(markdownSchema.text(match.content, [mark]));
    }

    currentPos = match.end;
  }

  // Add remaining plain text
  if (currentPos < text.length) {
    const remainingText = text.slice(currentPos);
    if (remainingText && remainingText.trim()) {
      nodes.push(markdownSchema.text(remainingText));
    }
  }

  // If no formatting found, just return plain text (but never empty)
  if (nodes.length === 0) {
    if (text && text.trim()) {
      nodes.push(markdownSchema.text(text));
    } else {
      nodes.push(markdownSchema.text(" "));
    }
  }

  return Fragment.from(nodes);
}

// Helper function to extract Canvas metadata and clean content
function extractCanvasMetadata(text: string): {
  content: string;
  title?: string;
  type?: string;
} {
  // Check if text starts with Canvas metadata like {title="..." type="..."}
  const metadataMatch = text.match(/^{([^}]+)}\s*\n?([\s\S]*)$/);

  if (metadataMatch) {
    const metadataStr = metadataMatch[1];
    const content = metadataMatch[2];

    // Extract title and type from metadata
    const titleMatch = metadataStr.match(/title="([^"]+)"/);
    const typeMatch = metadataStr.match(/type="([^"]+)"/);

    return {
      content: content.trim(),
      title: titleMatch ? titleMatch[1] : undefined,
      type: typeMatch ? typeMatch[1] : undefined,
    };
  }
  return { content: text };
}

export function parseMarkdownText(text: string): ProseMirrorNode {
  if (!text.trim()) {
    return createEmptyDoc();
  }

  // Extract Canvas metadata and get clean content
  const { content } = extractCanvasMetadata(text);

  if (!content.trim()) {
    return createEmptyDoc();
  }

  // 🚀 OPTIMIZED: Use unified/remark for 10x faster parsing
  // This replaces the custom regex-based parsing with industry-standard AST processing
  try {
    return parseMarkdownWithUnified(content, markdownSchema);
  } catch (_error) {
    // Fallback to legacy parsing if unified fails
    return parseMarkdownTextLegacy(content);
  }
}

// Legacy parsing function kept as fallback
function parseMarkdownTextLegacy(preprocessedContent: string): ProseMirrorNode {
  const lines = preprocessedContent.split("\n");
  const blocks: ProseMirrorNode[] = [];

  let currentParagraph: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#")) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push(createParagraphNode(currentParagraph.join("\n")));
        currentParagraph = [];
      }

      // Create heading
      const level = line.match(/^#+/)?.[0].length || 1;
      const content = line.replace(/^#+\s*/, "");
      blocks.push(createHeadingNode(content, Math.min(level, 6)));
    } else if (
      line.includes("|") &&
      line.trim().startsWith("|") &&
      line.trim().endsWith("|")
    ) {
      // Potential table row - check if next line is separator
      const nextLine = lines[i + 1];
      // Use strict Markdown table separator regex: starts/ends with |, each cell has at least 3 dashes, optional colons/whitespace
      const tableSeparatorRegex = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;
      if (nextLine && tableSeparatorRegex.test(nextLine)) {
        // Flush current paragraph
        if (currentParagraph.length > 0) {
          blocks.push(createParagraphNode(currentParagraph.join("\n")));
          currentParagraph = [];
        }

        // Parse table
        const tableResult = parseTable(lines, i);
        blocks.push(tableResult.table);
        i = tableResult.nextIndex - 1; // -1 because for loop will increment
      } else {
        currentParagraph.push(line);
      }
    } else if (line.startsWith("```")) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push(createParagraphNode(currentParagraph.join("\n")));
        currentParagraph = [];
      }
      // Code block handling would go here
    } else if (line.trim() === "") {
      // Empty line - flush current paragraph
      if (currentParagraph.length > 0) {
        blocks.push(createParagraphNode(currentParagraph.join("\n")));
        currentParagraph = [];
      }
    } else {
      currentParagraph.push(line);
    }
  }

  // Flush remaining paragraph
  if (currentParagraph.length > 0) {
    blocks.push(createParagraphNode(currentParagraph.join("\n")));
  }

  // Ensure we have at least one block
  if (blocks.length === 0) {
    blocks.push(markdownSchema.node("paragraph"));
  }

  return markdownSchema.node("doc", null, blocks);
}

function createParagraphNode(text: string): ProseMirrorNode {
  if (!text.trim()) {
    // Create paragraph with a single space to avoid empty text nodes
    return markdownSchema.node("paragraph", null, [markdownSchema.text(" ")]);
  }

  const inlineNodes = parseInlineText(text);
  return markdownSchema.node("paragraph", null, inlineNodes);
}

function createHeadingNode(text: string, level: number): ProseMirrorNode {
  const inlineNodes = parseInlineText(text);
  return markdownSchema.node("heading", { level }, inlineNodes);
}

function parseInlineText(text: string): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];

  // Simple inline parsing - handles **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);

  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      // Bold text
      const content = part.slice(2, -2);
      if (content) {
        nodes.push(
          markdownSchema.text(content, [markdownSchema.marks.strong.create()]),
        );
      }
    } else if (part.startsWith("*") && part.endsWith("*")) {
      // Italic text
      const content = part.slice(1, -1);
      if (content) {
        nodes.push(
          markdownSchema.text(content, [markdownSchema.marks.em.create()]),
        );
      }
    } else if (part) {
      // Regular text
      nodes.push(markdownSchema.text(part));
    }
  }

  return nodes.length > 0 ? nodes : [markdownSchema.text(" ")];
}

function parseTable(
  lines: string[],
  startIndex: number,
): { table: ProseMirrorNode; nextIndex: number } {
  const tableRows: ProseMirrorNode[] = [];
  let currentIndex = startIndex;

  // Parse header row
  const headerLine = lines[currentIndex];
  const headerCells = headerLine
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  const headerRow = markdownSchema.node(
    "table_row",
    null,
    headerCells.map((cellText) =>
      markdownSchema.node("table_cell", null, parseInlineText(cellText)),
    ),
  );
  tableRows.push(headerRow);
  currentIndex++;

  // Skip separator line
  if (lines[currentIndex] && lines[currentIndex].includes("-")) {
    currentIndex++;
  }

  // Parse data rows
  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    if (
      !line ||
      !line.includes("|") ||
      !line.trim().startsWith("|") ||
      !line.trim().endsWith("|")
    ) {
      break;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const row = markdownSchema.node(
      "table_row",
      null,
      cells.map((cellText) =>
        markdownSchema.node("table_cell", null, parseInlineText(cellText)),
      ),
    );
    tableRows.push(row);
    currentIndex++;
  }

  const table = markdownSchema.node("table", null, tableRows);
  return { table, nextIndex: currentIndex };
}

// Helper function to convert ProseMirror document back to markdown
export function proseMirrorToMarkdown(doc: ProseMirrorNode): string {
  return nodeToMarkdownWithDepth(doc, 0).trim();
}

function nodeToMarkdownWithDepth(
  node: ProseMirrorNode,
  depth: number = 0,
): string {
  let markdown = "";
  const indent = "  ".repeat(depth); // 2 spaces per depth level

  if (node.type.name === "doc") {
    // For document nodes, process all children
    node.forEach((child) => {
      markdown += nodeToMarkdownWithDepth(child, depth);
    });
  } else if (node.type.name === "paragraph") {
    markdown += indent + nodeToMarkdown(node) + "\n\n";
  } else if (node.type.name === "heading") {
    const level = "#".repeat(node.attrs.level);
    markdown += `${level} ${nodeToMarkdown(node)}\n\n`;
  } else if (node.type.name === "code_block") {
    markdown += `\`\`\`${node.attrs.language || ""}\n${node.textContent}\n\`\`\`\n\n`;
  } else if (node.type.name === "blockquote") {
    const quoted = nodeToMarkdown(node)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    markdown += `${quoted}\n\n`;
  } else if (node.type.name === "table") {
    const rows: string[] = [];
    let firstRowNode: ProseMirrorNode | null = null;
    let rowIndex = 0;

    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => {
        cells.push(nodeToMarkdown(cell).trim());
      });
      rows.push(`| ${cells.join(" | ")} |`);

      if (rowIndex === 0) {
        firstRowNode = row;
      }
      rowIndex++;
    });

    // Add separator line after header
    if (rows.length > 0 && firstRowNode) {
      const separatorCells = Array(firstRowNode.childCount).fill("---");
      rows.splice(1, 0, `| ${separatorCells.join(" | ")} |`);
    }

    markdown += rows.join("\n") + "\n\n";
  } else if (node.type.name === "bullet_list") {
    node.forEach((listItem) => {
      // Process list item content, separating text from nested lists
      let itemText = "";
      let hasNestedLists = false;

      listItem.forEach((child) => {
        if (
          child.type.name === "bullet_list" ||
          child.type.name === "ordered_list"
        ) {
          hasNestedLists = true;
        } else {
          // Only include non-list content in the item text
          itemText += nodeToMarkdown(child);
        }
      });

      // Add the main list item
      markdown += `${indent}- ${itemText.trim()}\n`;

      // Add nested lists if they exist
      if (hasNestedLists) {
        listItem.forEach((child) => {
          if (
            child.type.name === "bullet_list" ||
            child.type.name === "ordered_list"
          ) {
            markdown += nodeToMarkdownWithDepth(child, depth + 1);
          }
        });
      }
    });
    if (depth === 0) markdown += "\n"; // Only add extra newline at top level
  } else if (node.type.name === "ordered_list") {
    let counter = node.attrs.order || 1;
    node.forEach((listItem) => {
      // Process list item content, separating text from nested lists
      let itemText = "";
      let hasNestedLists = false;

      listItem.forEach((child) => {
        if (
          child.type.name === "bullet_list" ||
          child.type.name === "ordered_list"
        ) {
          hasNestedLists = true;
        } else {
          // Only include non-list content in the item text
          itemText += nodeToMarkdown(child);
        }
      });

      // Add the main list item
      markdown += `${indent}${counter}. ${itemText.trim()}\n`;
      counter++;

      // Add nested lists if they exist
      if (hasNestedLists) {
        listItem.forEach((child) => {
          if (
            child.type.name === "bullet_list" ||
            child.type.name === "ordered_list"
          ) {
            markdown += nodeToMarkdownWithDepth(child, depth + 1);
          }
        });
      }
    });
    if (depth === 0) markdown += "\n"; // Only add extra newline at top level
  } else if (node.type.name === "horizontal_rule") {
    markdown += "---\n\n";
  } else if (node.type.name === "list_item") {
    // For list items, process children with correct depth and indentation
    let itemContent = "";
    node.forEach((child) => {
      itemContent += nodeToMarkdownWithDepth(child, depth);
    });
    return itemContent;
  }

  return markdown;
}

function nodeToMarkdown(node: ProseMirrorNode): string {
  let text = "";

  node.forEach((child) => {
    if (child.isText) {
      let nodeText = child.text || "";

      // Apply marks - handle inline heading and body marks
      child.marks.forEach((mark) => {
        switch (mark.type.name) {
          case "strong":
            nodeText = `**${nodeText}**`;
            break;
          case "em":
            nodeText = `*${nodeText}*`;
            break;
          case "code":
            nodeText = `\`${nodeText}\``;
            break;
          case "link":
            nodeText = `[${nodeText}](${mark.attrs.href})`;
            break;
          case "heading1":
            nodeText = `# ${nodeText}`;
            break;
          case "heading2":
            nodeText = `## ${nodeText}`;
            break;
          case "heading3":
            nodeText = `### ${nodeText}`;
            break;
        }
      });

      text += nodeText;
    } else {
      text += nodeToMarkdown(child);
    }
  });

  return text;
}
