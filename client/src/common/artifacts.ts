export interface CodeBlock {
  id: string;
  language: string;
  content: string;
}

export interface Artifact {
  id: string;
  lastUpdateTime: number;
  index?: number;
  messageId?: string;
  identifier?: string;
  language?: string;
  content?: string;
  title?: string;
  type?: string;
  /** Source file id for file-based artifacts; the live-artifact bridge key. */
  fileId?: string;
  /** Conversation the source file belongs to; recorded with live tool calls. */
  conversationId?: string;
  /** MCP tool keys a live HTML artifact may call (from `file.metadata.mcpTools`). */
  tools?: string[];
}

export type ArtifactFiles =
  | {
      'App.tsx': string;
      'index.tsx': string;
      '/components/ui/MermaidDiagram.tsx': string;
    }
  | Partial<{
      [x: string]: string | undefined;
    }>;
