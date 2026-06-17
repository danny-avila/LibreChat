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
  /**
   * For file-backed artifacts (office previews from code execution), the
   * real server file id. When present, downloads must fetch the original
   * binary rather than the rendered HTML preview held in `content`.
   */
  fileId?: string;
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
