import reactStringReplace from 'react-string-replace';

interface RedactReplaceProps {
  content: string;
}

export const formatRedactedString = (content: string) => {
  const redactFilter = content.replaceAll('&lt;REDACTED&gt;', 'REDACTED');
  return redactFilter;
};

export const RedactReplace = ({ content }: RedactReplaceProps) => {
  return (
    <div>
      {reactStringReplace(content, '&lt;REDACTED&gt;', (_, i) => {
        return (
          <span
            className="px-4 py-1 ml-1"
            style={{
              color: '#141826',
              background: '#F5F6FA',
              width: 'max-content',
              borderRadius: 100,
            }}
            key={content + i}
          >
            REDACTED
          </span>
        );
      })}
    </div>
  );
};
