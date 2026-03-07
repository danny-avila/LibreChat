import { AlertCircle } from 'lucide-react';

interface ErrorOutputProps {
  text: string;
}

export default function ErrorOutput({ text }: ErrorOutputProps) {
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
        aria-hidden="true"
      />
      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-red-700 dark:text-red-300">
        {text}
      </pre>
    </div>
  );
}
