import { useCallback, useState } from "react";
import { useChatContext } from "~/Providers";
import { useAuthContext } from "~/hooks/AuthContext";

export interface UseDirectAIProps {
  onSuccess?: (
    response: string,
    operationType?: "edit" | "explain" | "default",
  ) => void;
  onError?: (error: Error) => void;
}

export function useDirectAI({ onSuccess, onError }: UseDirectAIProps = {}) {
  const { conversation } = useChatContext();
  const { token } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const sendDirectRequest = useCallback(
    async (
      prompt: string,
      selectedText: string,
      fullCanvasContent?: string,
    ) => {
      if (
        !conversation?.conversationId ||
        conversation.conversationId === "new"
      ) {
        const error = new Error(
          "No active conversation found. Please start a conversation first.",
        );
        onError?.(error);
        return;
      }

      if (!token) {
        const error = new Error(
          "No authentication token found. Please log in.",
        );
        onError?.(error);
        return;
      }

      setIsLoading(true);

      try {
        // Analyze the prompt to detect operation type
        const promptLower = prompt.toLowerCase();
        const isEditRequest =
          promptLower.includes("edit") ||
          promptLower.includes("modify") ||
          promptLower.includes("change") ||
          promptLower.includes("fix") ||
          promptLower.includes("correct") ||
          promptLower.includes("improve") ||
          promptLower.includes("rewrite");
        const explainKeywords = [
          "explain",
          "describe",
          "what",
          "how",
          "why",
          "meaning",
          "definition",
        ];
        const isExplainRequest = explainKeywords.some((keyword) =>
          promptLower.includes(keyword),
        );

        // Create a well-formatted prompt for the AI with operation-specific instructions
        let contextualPrompt = "";

        // Build context section with full canvas content if available
        const contextSection =
          fullCanvasContent && fullCanvasContent.trim()
            ? `Full document context:
"""
${fullCanvasContent.trim()}
"""

Selected content (with formatting):
"""
${selectedText}
"""
`
            : `Selected content:
"""
${selectedText}
"""
`;

        if (isEditRequest) {
          contextualPrompt = `You are helping edit content in a document. Here's the context:

${contextSection}


User request: ${prompt}

Please provide only the improved version of the selected content. Make it better while keeping the same format and style. Return just the improved text - no explanations, no prefixes, no extra formatting.`;
        } else if (isExplainRequest) {
          contextualPrompt = `You are helping explain content in a document. Here's the context:

${contextSection}

User request: ${prompt}

Please provide a clear explanation of the selected content. Use simple language and be helpful. Return just your explanation - no prefixes, no extra formatting.`;
        } else {
          // Default format for other requests
          contextualPrompt = `You are helping with content in a document. Here's the context:

${contextSection}

User request: ${prompt}

IMPORTANT: The selected content above is extracted from the same document shown in the full context. Look at how this content appears in the full document to understand its original formatting:

- If the content appears as a numbered list in the document (1. **Title**: description), format your response as a numbered list
- If the content appears as bullet points in the document (• **Title**: description), format your response as bullet points  
- If the content has bold headings (**Title**:), maintain the bold formatting
- Match the exact numbering sequence, indentation, and styling from the original document
- The selected text may have lost its markdown formatting during extraction, but you can see the correct format in the full document context above- Preserve any emphasis such as italics, underlines, or inline code from the original content.
- Maintain paragraph breaks, line spacing, and any nested lists exactly as in the original document.
- Avoid introducing new content, explanations, or interpretations. Only update or improve the selected text.
- Ensure grammar, punctuation, and spelling are correct while keeping the original style and tone.
- DO NOT wrap your response in code blocks (\`\`\`). Return raw markdown text without any backticks or code block formatting
- Aim for clarity, conciseness, and high-quality output while preserving the original style and structure


Return only the updated content using the same formatting structure as shown in the full document context.`;
        }

        // Make direct API request to LibreChat's agents endpoint
        const response = await fetch("/api/agents/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: contextualPrompt,
            conversationId: null, // Don't use main conversation ID - keep Canvas separate
            parentMessageId: null,
            model: conversation.model || "gpt-3.5-turbo",
            endpoint: conversation.endpoint || "openAI",
            key: null,
            chatGptLabel: null,
            promptPrefix: null,
            // Remove temperature for Claude thinking mode compatibility
            // temperature: 0.7,
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            resendFiles: false,
            isContinued: false,
            isEdited: false,
            isTemporary: true, // Mark as temporary so it doesn't save to history
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        let fullResponse = "";
        let finalMessage = "";
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]" || data === "") {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);

                  // Handle different LibreChat SSE event types
                  if (parsed.final != null) {
                    // Final message with complete response

                    // Check for errors first
                    if (
                      parsed.responseMessage?.content &&
                      Array.isArray(parsed.responseMessage.content)
                    ) {
                      const errorContent = parsed.responseMessage.content.find(
                        (item) => item.type === "error",
                      );
                      if (errorContent) {
                        throw new Error(
                          `AI request failed: ${errorContent.error}`,
                        );
                      }
                    }

                    // Try multiple paths to find the response text
                    if (
                      parsed.responseMessage?.text &&
                      parsed.responseMessage.text.trim()
                    ) {
                      finalMessage = parsed.responseMessage.text;
                    } else if (parsed.responseMessage?.content) {
                      // Handle content array format
                      if (Array.isArray(parsed.responseMessage.content)) {
                        const textContent = parsed.responseMessage.content
                          .filter((item) => item.type === "text")
                          .map((item) => item.text)
                          .join("");
                        if (textContent.trim()) {
                          finalMessage = textContent;
                        }
                      } else if (
                        typeof parsed.responseMessage.content === "string"
                      ) {
                        finalMessage = parsed.responseMessage.content;
                      }
                    } else if (parsed.text && parsed.text.trim()) {
                      finalMessage = parsed.text;
                    } else if (
                      parsed.message?.text &&
                      parsed.message.text.trim()
                    ) {
                      finalMessage = parsed.message.text;
                    } else {
                      // Last resort - try to find any text in the response message
                      const responseMsg = parsed.responseMessage;
                      if (responseMsg && typeof responseMsg === "object") {
                        // Look for any field that might contain the response text
                        for (const [key, value] of Object.entries(
                          responseMsg,
                        )) {
                          if (
                            typeof value === "string" &&
                            value.trim().length > 10 &&
                            key !== "messageId"
                          ) {
                            finalMessage = value;
                            break;
                          }
                        }
                      }
                    }

                    if (finalMessage) break;
                  } else if (parsed.text != null) {
                    // Streaming text chunk
                    fullResponse += parsed.text;
                  } else if (parsed.message?.text != null) {
                    // Message with text content
                    fullResponse += parsed.message.text;
                  } else if (parsed.responseMessage?.text != null) {
                    // Response message with text
                    fullResponse += parsed.responseMessage.text;
                  } else if (parsed.type === "content" && parsed.text) {
                    // Content type with text
                    fullResponse += parsed.text;
                  }
                } catch (_e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Use final message if available, otherwise use accumulated response
        const responseText = finalMessage || fullResponse.trim();

        // Determine operation type for the callback
        let operationType = "default";
        if (isEditRequest) {
          operationType = "edit";
        } else if (isExplainRequest) {
          operationType = "explain";
        }

        if (responseText) {
          onSuccess?.(responseText, operationType);
        } else {
          onSuccess?.(
            "AI request completed, but no text response was received.",
            operationType,
          );
        }
      } catch (error) {
        onError?.(error as Error);
      } finally {
        setIsLoading(false);
      }
    },
    [conversation, token, onSuccess, onError],
  );

  return {
    sendDirectRequest,
    isLoading,
    canSendRequest: !!(
      conversation?.conversationId && conversation.conversationId !== "new"
    ),
  };
}
