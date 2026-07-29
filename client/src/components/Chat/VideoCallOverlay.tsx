import React from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  BarVisualizer,
  useVoiceAssistant,
  useChat,
  ControlBar,
} from '@livekit/components-react';
import { PhoneOff } from 'lucide-react';
import '@livekit/components-styles';

interface VideoCallOverlayProps {
  token: string;
  wsUrl: string;
  onDisconnect: () => void;
  onAgentMessage?: (text: string) => void;
}

const ActiveCallUI = ({ onDisconnect, onAgentMessage }: { onDisconnect: () => void; onAgentMessage?: (text: string) => void }) => {
  const { localParticipant } = useLocalParticipant();
  const { state, audioTrack } = useVoiceAssistant();
  const { chatMessages } = useChat();

  const lastMessageCountRef = React.useRef(0);

  React.useEffect(() => {
    if (!chatMessages || !onAgentMessage) return;
    if (chatMessages.length > lastMessageCountRef.current) {
      const newMessages = chatMessages.slice(lastMessageCountRef.current);
      for (const msg of newMessages) {
        // Only trigger callback for messages sent by the agent (from identity not matching local participant)
        if (msg.from?.identity !== localParticipant?.identity) {
          onAgentMessage(msg.message);
        }
      }
      lastMessageCountRef.current = chatMessages.length;
    }
  }, [chatMessages, localParticipant, onAgentMessage]);

  return (
    <div className="flex h-full w-full flex-col bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">LibreChat Live</div>
          <div className="text-xs text-gray-400">
            {state === 'speaking' ? 'Speaking...' : state === 'listening' ? 'Listening...' : 'Connected'}
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="p-2 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          title="End Call"
        >
          <PhoneOff size={18} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center p-4">
        {/* Agent Audio Visualizer */}
        <div className="w-full max-w-sm h-32 flex items-center justify-center">
          <BarVisualizer
            state={state}
            barCount={7}
            trackRef={audioTrack}
            className="w-full h-full"
            options={{ minHeight: 4 }}
          />
        </div>

        {/* Local Camera (PiP) */}
        {localParticipant?.cameraTrack && (
          <div className="absolute top-4 right-4 w-32 h-44 rounded-lg overflow-hidden border-2 border-gray-600 bg-gray-800 shadow-lg z-10">
            <VideoTrack
              trackRef={{
                participant: localParticipant,
                source: 'camera' as any,
                publication: localParticipant.cameraTrack,
              }}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Screen Share (PiP) */}
        {localParticipant?.screenShareTrack && (
          <div className="absolute top-4 left-4 w-48 h-32 rounded-lg overflow-hidden border-2 border-gray-600 bg-gray-800 shadow-lg z-10">
            <VideoTrack
              trackRef={{
                participant: localParticipant,
                source: 'screen_share' as any,
                publication: localParticipant.screenShareTrack,
              }}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <ControlBar controls={{ microphone: true, camera: true, screenShare: true, leave: false, chat: false }} />
        </div>
      </div>
      
      <RoomAudioRenderer />
    </div>
  );
};

export default function VideoCallOverlay({ token, wsUrl, onDisconnect, onAgentMessage }: VideoCallOverlayProps) {
  return (
    <div className="fixed bottom-24 right-8 w-96 h-[32rem] z-50">
      <LiveKitRoom
        token={token}
        serverUrl={wsUrl}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={onDisconnect}
        style={{ height: '100%' }}
      >
        <ActiveCallUI onDisconnect={onDisconnect} onAgentMessage={onAgentMessage} />
      </LiveKitRoom>
    </div>
  );
}
