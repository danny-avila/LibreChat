import React from 'react';
import { useLocalize } from '~/hooks';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';

interface TaskRunsModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskRunsModal({ taskId, isOpen, onClose }: TaskRunsModalProps) {
  const localize = useLocalize();
  const navigate = useNavigate();

  const { data, isLoading } = useConversationsInfiniteQuery({
    taskId,
    includeScheduled: true,
  }, {
    enabled: isOpen && !!taskId,
  });

  const conversations = data?.pages.flatMap((page) => page.conversations) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{localize('com_sidepanel_task_runs')}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto mt-4">
          {isLoading ? (
            <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : conversations.length === 0 ? (
            <div className="text-sm text-text-secondary">{localize('com_sidepanel_no_runs')}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.map((convo) => (
                <div 
                  key={convo.conversationId} 
                  className="flex items-center justify-between p-3 border border-border-light rounded-lg hover:bg-surface-hover cursor-pointer"
                  onClick={() => {
                    navigate(`/c/${convo.conversationId}`);
                    onClose();
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{convo.title || localize('com_ui_new_chat')}</span>
                    <span className="text-xs text-text-secondary">
                      {new Date(convo.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm">
                    {localize('com_sidepanel_view_run')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
