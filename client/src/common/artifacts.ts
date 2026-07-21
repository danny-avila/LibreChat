export interface CodeBlock {
  id: string;
  language: string;
  content: string;
}

/**
 * Original-file download metadata for artifacts backed by a real
 * code-interpreter file (e.g. an office document whose panel preview is
 * a server-rendered HTML render, not the binary itself). When present,
 * the panel download button fetches this file instead of serializing
 * the rendered preview `content`.
 */
export interface ArtifactDownload {
  filepath?: string;
  file_id?: string;
  source?: string;
  user?: string;
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
  download?: ArtifactDownload;
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
