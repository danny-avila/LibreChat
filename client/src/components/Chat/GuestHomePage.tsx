import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

const DEFAULT_STARTERS = [
  { label: 'Help me write', prompt: 'Help me write: ' },
  { label: 'Learn about', prompt: 'Tell me about: ' },
  { label: 'Analyze Image', prompt: 'Analyze this image: ' },
  { label: 'Summarize text', prompt: 'Summarize this text: ' },
  { label: 'Analyze Data', prompt: 'Analyze this data: ' },
  { label: 'Brainstorm', prompt: 'Brainstorm ideas for: ' },
  { label: 'Improve writing', prompt: 'Improve this writing: ' },
  { label: 'Translate', prompt: 'Translate to English: ' },
  { label: 'Generate Images', prompt: 'Generate an image of: ' },
  { label: 'Generate Ideas', prompt: 'Generate creative ideas for: ' },
] as const;

export default function GuestHomePage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      navigate(`/login?prompt=${encodeURIComponent(text)}`);
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-surface-primary p-4">
      <h1 className="text-3xl font-semibold text-text-primary">How can I help you?</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div className="rounded-2xl border border-border-medium bg-surface-secondary p-4 shadow-sm">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-transparent text-text-primary outline-none placeholder:text-text-secondary"
            autoFocus
          />
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              aria-label="Send"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-text-primary text-surface-primary transition-opacity hover:opacity-80"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      <div className="flex w-full max-w-2xl flex-nowrap gap-2 overflow-x-auto pb-1">
        {DEFAULT_STARTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => navigate(`/login?prompt=${encodeURIComponent(s.prompt)}`)}
            className="whitespace-nowrap rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary"
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate('/login')}
        className="rounded-xl bg-surface-active-alt px-6 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        Sign in
      </button>
    </div>
  );
}
