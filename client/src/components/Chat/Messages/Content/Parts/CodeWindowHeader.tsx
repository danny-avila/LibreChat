import { useState, useMemo, useCallback } from 'react';
import { FileCode, Copy, Check } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface CodeWindowHeaderProps {
  language: string;
  code: string;
}

const LANG_FILENAMES: Record<string, string> = {
  py: 'script.py',
  python: 'script.py',
  js: 'script.js',
  javascript: 'script.js',
  ts: 'script.ts',
  typescript: 'script.ts',
  rb: 'script.rb',
  ruby: 'script.rb',
  go: 'main.go',
  rust: 'main.rs',
  rs: 'main.rs',
  java: 'Main.java',
  cpp: 'main.cpp',
  c: 'main.c',
  r: 'script.r',
  sql: 'query.sql',
  sh: 'script.sh',
  bash: 'script.sh',
  zsh: 'script.sh',
};

export default function CodeWindowHeader({ language, code }: CodeWindowHeaderProps) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const lang = language.toLowerCase();
  const filename = LANG_FILENAMES[lang] ?? `code.${lang || 'txt'}`;
  const lineCount = useMemo(() => code.split('\n').length, [code]);

  return (
    <div className="flex items-center justify-between bg-surface-secondary px-3 py-1.5">
      <div className="flex items-center gap-2 text-text-secondary">
        <FileCode className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium">{filename}</span>
        <span className="rounded bg-surface-tertiary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
          {localize('com_ui_lines_count', { 0: String(lineCount) })}
        </span>
      </div>
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
