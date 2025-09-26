import React, { useEffect, useCallback, useRef, useState } from "react";
import throttle from "lodash/throttle";
import { visit } from "unist-util-visit";
import { useSetRecoilState } from "recoil";
import { useLocation } from "react-router-dom";
import type { Pluggable } from "unified";
import type { CanvasData } from "~/store/canvas";
import { useMessageContext } from "~/Providers";
import { canvasState, canvasVisibility } from "~/store/canvas";
import { logger } from "~/utils";
import { useChatContext } from "~/Providers";
import CanvasButton from "~/components/Canvas/CanvasButton";

export const canvasPlugin: Pluggable = () => {
  return (tree) => {
    visit(
      tree,
      ["textDirective", "leafDirective", "containerDirective"],
      (node, index, parent) => {
        if (node.type === "textDirective") {
          const replacementText = `:${node.name}`;
          if (
            parent &&
            Array.isArray(parent.children) &&
            typeof index === "number"
          ) {
            parent.children[index] = {
              type: "text",
              value: replacementText,
            };
          }
        }
        if (node.name !== "canvas") {
          return;
        }
        node.data = {
          hName: node.name,
          hProperties: node.attributes,
          ...node.data,
        };
        return node;
      },
    );
  };
};

const defaultTitle = "untitled";
const _defaultType = "document";

// Convert HTML/React elements back to markdown syntax
const elementToMarkdown = (element: React.ReactElement): string => {
  const tagName = element.type as string;
  const props = element.props as any;
  const children = props.children;

  // Get text content from children
  const getTextContent = (node: React.ReactNode): string => {
    if (typeof node === "string") {
      return node;
    }
    if (React.isValidElement(node)) {
      return elementToMarkdown(node);
    }
    if (Array.isArray(node)) {
      return node.map(getTextContent).join("");
    }
    return "";
  };

  const textContent = getTextContent(children);

  switch (tagName) {
    case "h1":
      return `# ${textContent}\n\n`;
    case "h2":
      return `## ${textContent}\n\n`;
    case "h3":
      return `### ${textContent}\n\n`;
    case "h4":
      return `#### ${textContent}\n\n`;
    case "h5":
      return `##### ${textContent}\n\n`;
    case "h6":
      return `###### ${textContent}\n\n`;
    case "p":
      return `${textContent}\n\n`;
    case "strong":
    case "b":
      return `**${textContent}**`;
    case "em":
    case "i":
      return `*${textContent}*`;
    case "code":
      // Check if it's inline code or code block
      if (props.className && props.className.includes("language-")) {
        const lang = props.className.replace(/.*language-(\w+).*/, "$1");
        return `\`\`\`${lang}\n${textContent}\n\`\`\`\n\n`;
      }
      return `\`${textContent}\``;
    case "pre":
      // Handle code blocks
      if (React.isValidElement(children) && children.type === "code") {
        return elementToMarkdown(children);
      }
      return `\`\`\`\n${textContent}\n\`\`\`\n\n`;
    case "ul":
      if (Array.isArray(children)) {
        return (
          children
            .map((child: React.ReactNode) => {
              if (React.isValidElement(child) && child.type === "li") {
                const liContent = getTextContent(child.props.children);
                return `- ${liContent}`;
              }
              return "";
            })
            .filter(Boolean)
            .join("\n") + "\n\n"
        );
      }
      return "";
    case "ol":
      if (Array.isArray(children)) {
        return (
          children
            .map((child: React.ReactNode, index: number) => {
              if (React.isValidElement(child) && child.type === "li") {
                const liContent = getTextContent(child.props.children);
                return `${index + 1}. ${liContent}`;
              }
              return "";
            })
            .filter(Boolean)
            .join("\n") + "\n\n"
        );
      }
      return "";
    case "li":
      return textContent;
    case "blockquote":
      return `> ${textContent}\n\n`;
    case "a": {
      const href = props.href || "";
      return `[${textContent}](${href})`;
    }
    case "img": {
      const src = props.src || "";
      const alt = props.alt || "";
      return `![${alt}](${src})`;
    }
    case "br":
      return "\n";
    case "hr":
      return "\n---\n\n";
    default:
      // For unknown elements, just return the text content
      return textContent;
  }
};

// Extract canvas content while preserving markdown formatting
const extractCanvasContent = (
  children: React.ReactNode | { props: { children: React.ReactNode } } | string,
): string => {
  if (typeof children === "string") {
    return children;
  }

  // If it's a React element, convert it back to markdown
  if (React.isValidElement(children)) {
    return elementToMarkdown(children);
  }

  if (Array.isArray(children)) {
    // For arrays, process each element and join them
    return children
      .map((child) => {
        if (React.isValidElement(child)) {
          return elementToMarkdown(child);
        }
        if (typeof child === "string") {
          return child;
        }
        return extractCanvasContent(child);
      })
      .filter(Boolean)
      .join("");
  }

  return "";
};

export function CanvasComponent({
  node: _node,
  ...props
}: CanvasData & {
  children: React.ReactNode | { props: { children: React.ReactNode } };
  node: unknown;
}) {
  const location = useLocation();
  const { messageId } = useMessageContext();
  const { getMessages } = useChatContext();

  const setCanvasData = useSetRecoilState(canvasState);
  const setCanvasVisible = useSetRecoilState(canvasVisibility);
  const [canvas, setCanvas] = useState<CanvasData | null>(null);

  const throttledUpdateRef = useRef(
    throttle((updateFn: () => void) => {
      updateFn();
    }, 25), // Back to 25ms for frequent updates during streaming
  );

  const updateCanvas = useCallback(() => {
    // Get the original message content to preserve markdown formatting
    const messages = getMessages();
    const currentMessage = messages?.find((msg) => msg.messageId === messageId);
    let content = "";
    let extractedTitle = props.title ?? defaultTitle;

    // Get message text from either text field or content array
    let messageText = currentMessage?.text || "";
    if (
      !messageText &&
      currentMessage?.content &&
      Array.isArray(currentMessage.content)
    ) {
      // Check if content is in content array (streaming messages)
      try {
        const textContent = currentMessage.content.find(
          (item: any) => item?.type === "text",
        );
        if (textContent && (textContent as any).text) {
          messageText = (textContent as any).text;
        }
      } catch (_error) {
        // Error accessing content array
      }
    }

    if (messageText) {
      // Extract canvas content from the message text
      // Updated regex to match :::canvas{title="..." type="..."}content with proper closing :::
      const canvasMatch = messageText.match(
        /:::canvas\{[^}]*\}\n?([\s\S]*?)(?=\n?:::|\s*$)/,
      );
      if (canvasMatch && canvasMatch[1]) {
        // Smart trim: remove leading/trailing whitespace but preserve internal structure
        content = canvasMatch[1].replace(/^\s+|\s+$/g, "");

        // Extract title from the canvas directive
        const titleMatch = messageText.match(
          /:::canvas\{[^}]*title="([^"]*)"[^}]*\}/,
        );
        if (titleMatch && titleMatch[1]) {
          extractedTitle = titleMatch[1];
        }
      }
    }

    // Fallback: extract from children if no Canvas directive found or no message text
    if (!content) {
      content = extractCanvasContent(props.children);
    }

    logger.log("canvas", "updateCanvas: content.length", content.length);
    logger.log("canvas", "updateCanvas: extracted title", extractedTitle);

    throttledUpdateRef.current(() => {
      const now = Date.now();

      const currentCanvas: CanvasData = {
        content,
        title: extractedTitle,
        messageId: messageId || `canvas-${now}`,
      };

      if (!location.pathname.includes("/c/")) {
        return setCanvas(currentCanvas);
      }

      // Update Canvas state and make it visible
      setCanvasData(currentCanvas);
      setCanvasVisible(true);
      setCanvas(currentCanvas);
    });
  }, [
    props.title,
    setCanvasData,
    setCanvasVisible,
    props.children,
    messageId,
    location.pathname,
    getMessages,
  ]);

  useEffect(() => {
    updateCanvas();
  }, [updateCanvas]);

  return <CanvasButton canvas={canvas} />;
}
