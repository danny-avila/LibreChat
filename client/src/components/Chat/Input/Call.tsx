import React from 'react';
import { useRecoilState } from 'recoil';
import { Phone, PhoneOff } from 'lucide-react';
import { OGDialog, OGDialogContent, Button } from '~/components';
import { useWebSocket, useCall } from '~/hooks';
import store from '~/store';

export const Call: React.FC = () => {
  const { isConnected, sendMessage } = useWebSocket();
  const { isCalling, isProcessing, startCall, hangUp } = useCall();

  const [open, setOpen] = useRecoilState(store.callDialogOpen(0));

  const [eventLog, setEventLog] = React.useState<string[]>([]);

  const logEvent = (message: string) => {
    console.log(message);
    setEventLog((prev) => [...prev, message]);
  };

  React.useEffect(() => {
    if (isConnected) {
      logEvent('Connected to server.');
    } else {
      logEvent('Disconnected from server.');
    }
  }, [isConnected]);

  React.useEffect(() => {
    if (isCalling) {
      logEvent('Call started.');
    } else if (isProcessing) {
      logEvent('Processing audio...');
    } else {
      logEvent('Call ended.');
    }
  }, [isCalling, isProcessing]);

  const handleStartCall = () => {
    logEvent('Attempting to start call...');
    startCall();
  };

  const handleHangUp = () => {
    logEvent('Attempting to hang up call...');
    hangUp();
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent className="w-96 p-8">
        <div className="flex flex-col items-center gap-6">
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

          {isCalling ? (
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
              disabled={!isConnected}
              className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-white hover:bg-green-600 disabled:opacity-50"
            >
              <Phone size={20} />
              <span>Start Call</span>
            </Button>
          )}

          {/* Debugging Information */}
          <div className="mt-4 w-full rounded-md bg-gray-100 p-4 shadow-sm">
            <h3 className="mb-2 text-lg font-medium">Event Log</h3>
            <ul className="h-32 overflow-y-auto text-xs text-gray-600">
              {eventLog.map((log, index) => (
                <li key={index}>{log}</li>
              ))}
            </ul>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};
