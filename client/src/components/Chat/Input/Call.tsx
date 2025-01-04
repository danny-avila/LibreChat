import React, { useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import {
  Phone,
  PhoneOff,
  AlertCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Activity,
} from 'lucide-react';
import { OGDialog, OGDialogContent, Button } from '~/components';
import { useWebSocket, useCall } from '~/hooks';
import { CallState } from '~/common';
import store from '~/store';

export const Call: React.FC = () => {
  const { isConnected } = useWebSocket();
  const {
    callState,
    error,
    startCall,
    hangUp,
    isConnecting,
    localStream,
    remoteStream,
    connectionQuality,
    isMuted,
    toggleMute,
  } = useCall();

  const [open, setOpen] = useRecoilState(store.callDialogOpen(0));
  const [eventLog, setEventLog] = React.useState<string[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = React.useState(true);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const logEvent = (message: string) => {
    console.log(message);
    setEventLog((prev) => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;

      remoteAudioRef.current.play().catch((err) => console.error('Error playing audio:', err));
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [localStream, isMuted]);

  useEffect(() => {
    if (isConnected) {
      logEvent('Connected to server.');
    } else {
      logEvent('Disconnected from server.');
    }
  }, [isConnected]);

  useEffect(() => {
    if (error) {
      logEvent(`Error: ${error.message} (${error.code})`);
    }
  }, [error]);

  useEffect(() => {
    logEvent(`Call state changed to: ${callState}`);
  }, [callState]);

  const handleStartCall = () => {
    logEvent('Attempting to start call...');
    startCall();
  };

  const handleHangUp = () => {
    logEvent('Attempting to hang up call...');
    hangUp();
  };

  const handleToggleMute = () => {
    toggleMute();
    logEvent(`Microphone ${isMuted ? 'unmuted' : 'muted'}`);
  };

  const toggleAudio = () => {
    setIsAudioEnabled((prev) => !prev);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isAudioEnabled;
    }
    logEvent(`Speaker ${isAudioEnabled ? 'disabled' : 'enabled'}`);
  };

  const isActive = callState === CallState.ACTIVE;
  const isError = callState === CallState.ERROR;

  // TESTS

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      console.log('Setting up remote audio:', {
        tracks: remoteStream.getTracks().length,
        active: remoteStream.active,
      });

      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1.0;

      const playPromise = remoteAudioRef.current.play();
      if (playPromise) {
        playPromise.catch((err) => {
          console.error('Error playing audio:', err);
          // Retry play on user interaction
          document.addEventListener(
            'click',
            () => {
              remoteAudioRef.current?.play();
            },
            { once: true },
          );
        });
      }
    }
  }, [remoteStream]);

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent className="w-[28rem] p-8">
        <div className="flex flex-col items-center gap-6">
          {/* Connection Status */}
          <div className="flex w-full items-center justify-between">
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 ${
                isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm font-medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {isActive && (
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 ${
                  (connectionQuality === 'good' && 'bg-green-100 text-green-700') ||
                  (connectionQuality === 'poor' && 'bg-yellow-100 text-yellow-700') ||
                  'bg-gray-100 text-gray-700'
                }`}
              >
                <Activity size={16} />
                <span className="text-sm font-medium capitalize">{connectionQuality} Quality</span>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex w-full items-center gap-2 rounded-md bg-red-100 p-3 text-red-700">
              <AlertCircle size={16} />
              <span className="text-sm">{error.message}</span>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center gap-4">
            {isActive && (
              <>
                <Button
                  onClick={handleToggleMute}
                  className={`rounded-full p-3 ${
                    isMuted ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </Button>

                <Button
                  onClick={toggleAudio}
                  className={`rounded-full p-3 ${
                    !isAudioEnabled ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                  }`}
                  title={isAudioEnabled ? 'Disable speaker' : 'Enable speaker'}
                >
                  {isAudioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </Button>
              </>
            )}

            {isActive ? (
              <Button
                onClick={handleHangUp}
                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-white hover:bg-red-600"
              >
                <PhoneOff size={20} />
                <span>End Call</span>
              </Button>
            ) : (
              <Button
                onClick={handleStartCall}
                disabled={!isConnected || isError || isConnecting}
                className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-white hover:bg-green-600 disabled:opacity-50"
              >
                <Phone size={20} />
                <span>{isConnecting ? 'Connecting...' : 'Start Call'}</span>
              </Button>
            )}
          </div>

          {/* Event Log */}
          <h3 className="mb-2 text-lg font-medium">Event Log</h3>
          <div className="h-64 overflow-y-auto rounded-md bg-surface-secondary p-2 shadow-inner">
            <ul className="space-y-1 text-xs text-text-secondary">
              {eventLog.map((log, index) => (
                <li key={index} className="font-mono">
                  {log}
                </li>
              ))}
            </ul>
          </div>

          {/* Hidden Audio Element */}
          <audio ref={remoteAudioRef} autoPlay>
            <track kind="captions" />
          </audio>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};
