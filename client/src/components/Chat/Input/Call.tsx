import { useRecoilState } from 'recoil';
import { Mic, Phone, PhoneOff } from 'lucide-react';
import { OGDialog, OGDialogContent, Button } from '~/components';
import { useWebRTC, useWebSocket, useCall } from '~/hooks';
import store from '~/store';

export const Call: React.FC = () => {
  const { isConnected } = useWebSocket();
  const { isCalling, startCall, hangUp } = useCall();

  const [open, setOpen] = useRecoilState(store.callDialogOpen(0));

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

          {!isCalling ? (
            <Button
              onClick={startCall}
              disabled={!isConnected}
              className="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-white hover:bg-green-600 disabled:opacity-50"
            >
              <Phone size={20} />
              <span>Start Call</span>
            </Button>
          ) : (
            <Button
              onClick={hangUp}
              className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-white hover:bg-red-600"
            >
              <PhoneOff size={20} />
              <span>End Call</span>
            </Button>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};
