export interface CodeBlock {
  id: string;
  language: string;
  content: string;
}

export interface Artifact {
  id: string;
  lastUpdateTime: number;
  identifier?: string;
  language?: string;
  content?: string;
  title?: string;
  type?: string;
}
