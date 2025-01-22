export interface CodeBlock {
  id: string;
  language: string;
  content: string;
}

export interface Artifact {
  id: string;
  lastUpdateTime: number;
  messageId?: string;
  identifier?: string;
  language?: string;
  content?: string;
  title?: string;
  type?: string;
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
