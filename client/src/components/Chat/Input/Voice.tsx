import { Mic, MicOff } from 'lucide-react';
import { useChatContext } from '~/Providers';
import { Loader } from 'lucide-react';

export default function Voice({ disabled = false }: { disabled?: boolean | null }) {
  const { startRecording, stopRecording, togglePauseResume, cancelRecord, recordingSate } =
    useChatContext();

  return (
    <div className="">
      {recordingSate === 'idle' ? (
        <button
          type="button"
          className="btn relative h-full p-0 text-black dark:text-white"
          disabled={!!disabled}
          onClick={startRecording}
          aria-label="Record audio"
          style={{ padding: 0 }}
        >
          <Mic />
        </button>
      ) : recordingSate === 'processing' ? (
        <button
          type="button"
          className="btn relative h-full p-0 text-black dark:text-white"
          disabled={!!disabled}
          onClick={cancelRecord}
          aria-label="Cancel record processing"
          style={{ padding: 0 }}
        >
          <Loader className="animate-spin" />
        </button>
      ) : (
        <button
          className="btn relative h-full p-0 text-red-500"
          onClick={() => {
            stopRecording();
          }}
          aria-label="Stop Recording"
          style={{ padding: 0 }}
        >
          <MicOff />
        </button>
      )}
    </div>
  );
}
