import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeWindowHeaderProps {
  language: string;
  code: string;
}

const LANG_LABELS: Record<string, string> = {
  py: 'Python',
  python: 'Python',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  rb: 'Ruby',
  ruby: 'Ruby',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  r: 'R',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
};

export default function CodeWindowHeader({ language, code }: CodeWindowHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const label = LANG_LABELS[language.toLowerCase()] ?? language.toUpperCase();

  return (
    <div className="flex items-center justify-between border-b border-border-light px-3 py-1.5">
      <span className="rounded bg-surface-tertiary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
        {label}
      </span>
      <button
        type="button"
        className="rounded-sm p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary focus:outline focus:outline-2 focus:outline-border-heavy"
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
