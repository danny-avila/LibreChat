import ReactMarkdown from 'react-markdown';
import LinkRenderer from '~/nj/components/info/LinkRenderer';
import agentGuide from '~/nj/content/agent-guide.md?raw';

export default function NewJerseyAgentGuide() {
  document.title = 'NJ AI Assistant - Guide: How to Build & Use Agents';
  return (
    <div>
      <ReactMarkdown className="markdown-nj" components={{ a: LinkRenderer }}>
        {agentGuide}
      </ReactMarkdown>
    </div>
  );
}
