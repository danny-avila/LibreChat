import React, { useCallback } from 'react';
import { Mic, MicOff, PhoneOff, AudioLines } from 'lucide-react';
import { useVoiceSession } from '~/hooks/Voice';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface VoiceControlProps {
  conversationId?: string | null;
  endpoint?: string;
  agentId?: string;
  model?: string;
  disabled?: boolean;
}

/**
 * Voice is a layer over the chat, not a separate screen: starting a call does not take the
 * composer away, and hanging up only stops the media plane. The conversation itself is an
 * ordinary LibreChat conversation throughout.
 */
export default function VoiceControl({
  conversationId,
  endpoint,
  agentId,
  model,
  disabled = false,
}: VoiceControlProps) {
  const localize = useLocalize();
  const { state, error, micEnabled, connect, disconnect, toggleMic } = useVoiceSession();

  const statusKey = ():
    | 'com_ui_voice_connecting'
    | 'com_ui_voice_listening'
    | 'com_ui_voice_muted' => {
    if (state === 'connecting') {
      return 'com_ui_voice_connecting';
    }
    return micEnabled ? 'com_ui_voice_listening' : 'com_ui_voice_muted';
  };

  const handleStart = useCallback(() => {
    /** Called from a click so the browser lets us start audio playback. */
    void connect({ conversationId: conversationId ?? undefined, endpoint, agentId, model });
  }, [connect, conversationId, endpoint, agentId, model]);

  if (state === 'idle' || state === 'error') {
    return (
      <button
        type="button"
        onClick={handleStart}
        disabled={disabled}
        aria-label={localize('com_ui_voice_start')}
        title={error ?? localize('com_ui_voice_start')}
        className={cn(
          'flex size-9 items-center justify-center rounded-full transition-colors',
          'text-text-primary hover:bg-surface-hover disabled:opacity-50',
          state === 'error' && 'text-red-500',
        )}
      >
        <AudioLines size={18} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={localize('com_ui_voice_listening')}
      className="flex items-center gap-1 rounded-full bg-surface-tertiary px-2 py-1"
    >
      <span className="flex items-center gap-1.5 px-1 text-xs text-text-secondary">
        <AudioLines
          size={14}
          aria-hidden="true"
          className={cn(state === 'connected' && 'animate-pulse text-green-500')}
        />
        {localize(statusKey())}
      </span>

      <button
        type="button"
        onClick={() => void toggleMic()}
        disabled={state !== 'connected'}
        aria-label={micEnabled ? localize('com_ui_voice_mute') : localize('com_ui_voice_unmute')}
        className="flex size-7 items-center justify-center rounded-full text-text-primary hover:bg-surface-hover disabled:opacity-50"
      >
        {micEnabled ? (
          <Mic size={15} aria-hidden="true" />
        ) : (
          <MicOff size={15} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={() => void disconnect()}
        aria-label={localize('com_ui_voice_end')}
        title={localize('com_ui_voice_hangup_hint')}
        className="flex size-7 items-center justify-center rounded-full text-red-500 hover:bg-surface-hover"
      >
        <PhoneOff size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
