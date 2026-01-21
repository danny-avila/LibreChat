import { useState, useEffect } from 'react';
import ProgressText from '../OpenAIImageGen/ProgressText';

export default function MusicGen({
  initialProgress = 0.1,
  isSubmitting,
  toolName,
  args: _args = '',
  output,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  toolName: string;
  args: string | Record<string, unknown>;
  output?: string | Record<string, any> | null;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    // Simple fake progress when submitting
    if (isSubmitting) {
      setProgress(initialProgress);
      const iv = setInterval(() => {
        setProgress((p) => Math.min(0.9, p + Math.random() * 0.1));
      }, 1000 + Math.floor(Math.random() * 1000));
      return () => clearInterval(iv);
    }
  }, [isSubmitting, initialProgress]);

  useEffect(() => {
    // If tool output includes an audio_url, use it
    if (!output) {
      setAudioUrl(null);
      return;
    }

    if (typeof output === 'string') {
      // if output is a plain URL string
      if (output.startsWith('http')) {
        setAudioUrl(output);
        setProgress(1);
      }
      return;
    }

    if (typeof output === 'object') {
      const url = (output as any).audio_url ?? (output as any).audioUrl ?? null;
      if (typeof url === 'string' && url) {
        setAudioUrl(url);
        setProgress(1);
      }
    }
  }, [output]);

  return (
    <>
      <div className="relative my-2.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText progress={progress} error={!isSubmitting && progress < 1} toolName={toolName} />
      </div>

      {audioUrl ? (
        <div className="mb-2">
          <audio controls src={audioUrl} className="w-full" />
          <div className="mt-2 text-sm">
            <a className="underline" href={audioUrl} target="_blank" rel="noreferrer">
              Open audio in new tab
            </a>{' '}
            •{' '}
            <a className="underline" href={audioUrl} download>
              Download
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
