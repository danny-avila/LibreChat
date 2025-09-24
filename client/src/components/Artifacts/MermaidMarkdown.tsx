import { CodeMarkdown } from './Code';

export function MermaidMarkdown({
  content,
  isSubmitting,
}: {
  content: string;
  isSubmitting: boolean;
}) {
  return <CodeMarkdown content={`\`\`\`mermaid\n${content}\`\`\``} isSubmitting={isSubmitting} />;
}
