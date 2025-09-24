import React from "react";
import { ProseMirrorEditorRef } from "./ProseMirrorEditor";

export interface StreamingHandlerOptions {
  editor: ProseMirrorEditorRef | null;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  onError?: (_error: Error) => void;
}

export class StreamingHandler {
  private editor: ProseMirrorEditorRef | null;
  private isStreaming = false;
  private streamBuffer = "";
  private streamPosition = 0;
  private onStreamStart?: () => void;
  private onStreamEnd?: () => void;
  private onError?: (error: Error) => void;

  constructor(options: StreamingHandlerOptions) {
    this.editor = options.editor;
    this.onStreamStart = options.onStreamStart;
    this.onStreamEnd = options.onStreamEnd;
    this.onError = options.onError;
  }

  updateEditor(editor: ProseMirrorEditorRef | null) {
    this.editor = editor;
  }

  startStreaming(position?: number) {
    if (!this.editor) {
      this.onError?.(new Error("Editor not available"));
      return;
    }

    this.isStreaming = true;
    this.streamBuffer = "";

    // Get current document size if no position specified
    const currentContent = this.editor.getContent();
    this.streamPosition = position ?? currentContent.length;

    this.editor.startStreaming(this.streamPosition);
    this.onStreamStart?.();
  }

  appendChunk(chunk: string) {
    if (!this.isStreaming || !this.editor) {
      return;
    }

    try {
      // Add chunk to buffer
      this.streamBuffer += chunk;

      // For better performance, we can batch updates
      this.editor.appendStreamingText(chunk);
    } catch (error) {
      this.onError?.(error as Error);
    }
  }

  stopStreaming() {
    if (!this.isStreaming || !this.editor) {
      return;
    }

    this.isStreaming = false;
    this.editor.stopStreaming();
    this.onStreamEnd?.();

    // Clear buffer
    this.streamBuffer = "";
  }

  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  getStreamBuffer(): string {
    return this.streamBuffer;
  }

  // Handle streaming from your existing useDirectAI hook
  handleDirectAIStream(
    sendDirectRequest: (prompt: string, textToProcess: string) => Promise<void>,
    prompt: string,
    textToProcess: string = "",
  ) {
    if (!this.editor) {
      this.onError?.(new Error("Editor not available"));
      return;
    }

    // Start streaming at the end of the document
    const currentContent = this.editor.getContent();
    const insertPosition = currentContent.length;

    this.startStreaming(insertPosition);

    // This would integrate with your existing streaming logic
    // You'd need to modify your useDirectAI hook to call appendChunk
    return sendDirectRequest(prompt, textToProcess)
      .then(() => {
        this.stopStreaming();
      })
      .catch((error) => {
        this.stopStreaming();
        this.onError?.(error);
      });
  }
}

// Utility function to create a streaming handler
export function createStreamingHandler(
  options: StreamingHandlerOptions,
): StreamingHandler {
  return new StreamingHandler(options);
}

// Hook for managing streaming in React components
export function useStreamingHandler(editor: ProseMirrorEditorRef | null) {
  const handlerRef = React.useRef<StreamingHandler | null>(null);

  React.useEffect(() => {
    if (!handlerRef.current) {
      handlerRef.current = new StreamingHandler({
        editor,
        onStreamStart: () => {
          // Streaming started
        },
        onStreamEnd: () => {
          // Streaming ended
        },
        onError: (_error) => {
          // Streaming error
        },
      });
    } else {
      handlerRef.current.updateEditor(editor);
    }
  }, [editor]);

  return handlerRef.current;
}
