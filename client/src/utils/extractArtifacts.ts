export type ExtractedArtifact = {
  id: string;
  type: string;
  title: string;
  content: string;
  language?: string;
};

export const mimeToLang: Record<string, string> = {
  'text/html': 'html',
  'application/vnd.code-html': 'html',
  'text/css': 'css',
  'application/javascript': 'javascript',
  'text/javascript': 'javascript',
  'application/json': 'json',
  'text/markdown': 'markdown',
  'text/md': 'markdown',
  'text/typescript': 'typescript',
  'application/typescript': 'typescript',
};

export function extractArtifacts(text: string): ExtractedArtifact[] {
  const artifacts: ExtractedArtifact[] = [];
  // gemini returns artifacts wrapped in :::artifact{...}:::
  const artifactMatches = text.match(/:::artifact\{([^}]+)\}([\s\S]*?):::/g);

  artifactMatches?.forEach((match) => {
    // extract the metadata and content from the artifact i.e.
    // :::artifact{identifier="unique-identifier" type="mime-type" title="Artifact Title"}
    // ```html
    // <html>
    // <body>
    // <h1>Hello, world!</h1>
    // </body>
    // </html>
    // ```
    // :::
    const headerMatch = match.match(/:::artifact\{([^}]+)\}/);
    const contentMatch = match.match(/```[\s\S]*?```/);

    if (headerMatch && contentMatch) {
      const metadata = headerMatch[1];
      const fenceLangMatch = contentMatch[0].match(/```(\w+)/);
      const content = contentMatch[0].replace(/```\w*\n?/, '').replace(/\n?```$/, '');

      const typeMatch = metadata.match(/type="([^"]+)"/);
      const titleMatch = metadata.match(/title="([^"]+)"/);
      const idMatch = metadata.match(/identifier="([^"]+)"/);
      const type = typeMatch?.[1] || 'unknown';
      const title = titleMatch?.[1] || 'Untitled';
      const id = idMatch?.[1] || `artifact-${title}-${type}`;
      let language = mimeToLang[type] || fenceLangMatch?.[1] || 'txt';

      artifacts.push({
        id,
        type,
        title,
        content,
        language,
      });
    }
  });

  return artifacts;
}
