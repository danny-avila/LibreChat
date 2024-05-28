import React, { useState } from 'react';
import { Textarea } from '../ui';
import { Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { request } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';
import ReportIcon from '../svg/ReportIcon';

export default function RoomReport({ conversationId }: { conversationId: string }) {
  const [reportReason, setReportReason] = useState<string>('');
  const { showToast } = useToastContext();

  const confirmReport = () => {
    if (!conversationId) {
      alert('No conversation id');
      return;
    }

    if (!reportReason) {
      showToast({ message: 'Report reason is required!', status: 'warning' });
      return;
    }

    request
      .post(`/api/rooms/${conversationId}/report`, {
        reason: reportReason,
      })
      .then(() => {
        showToast({ message: 'Report request success', status: 'success' });
        setReportReason('');
      })
      .catch((error) => {
        if (error.response.status === 400) {
          showToast({ message: 'You have already reported this room', status: 'error' });
          return;
        }
        setReportReason('');
        showToast({ message: 'Report request failed', status: 'error' });
      });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className='flex gap-3 w-full cursor-pointer hover:bg-gray-50 py-3 px-3 rounded-md hover:dark:bg-gray-700'>
          <ReportIcon />
          <p>Report Room</p>
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={'Report Chat Room'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Textarea
                  placeholder="Tell us why you want to report"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                />
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler: confirmReport,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: 'report',
        }}
      />
    </Dialog>
  );
}
