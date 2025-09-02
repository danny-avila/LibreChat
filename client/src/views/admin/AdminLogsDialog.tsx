import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { Button } from '~/components/ui/Button';
import { cn } from '~/utils';
import moment from 'moment';
import { Info } from 'lucide-react';

export type RowLog = {
  _id: string;
  userId: string;
  email?: string;
  name?: string;
  action: string;
  timestamp: string;
  details?: any;
  tokenUsage?: {
    beforeModelChange?: { model: string; totalTokens: number; messageCount: number };
    afterModelChange?: { model: string; totalTokens: number; messageCount: number };
    tokenDifference?: number;
  };
};

interface AdminLogsDialogProps {
  selected: RowLog | null;
  onClose: () => void;
}

export default function AdminLogsDialog({ selected, onClose }: AdminLogsDialogProps) {
  if (!selected) return null;

  return (
    <Dialog open={!!selected} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border border-gray-200 shadow-lg dark:border-gray-700">
        <DialogHeader className="border-b border-gray-100 pb-3 pt-2 dark:border-gray-700">
          <DialogTitle className="flex items-start justify-between text-lg">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'rounded-full p-1.5',
                  selected.action === 'LOGIN'
                    ? 'bg-green-100 text-green-700'
                    : selected.action === 'LOGOUT'
                    ? 'bg-red-100 text-red-700'
                    : selected.action === 'MODEL CHANGED'
                    ? 'bg-blue-100 text-blue-700'
                    : selected.action === 'ATTACHED FILE'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-gray-100 text-gray-700'
                )}
              >
                <Info className="h-4 w-4" />
              </span>
              <span className="font-medium mt-0.5">System Logs</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-1">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4 rounded-md bg-gray-50 p-4 text-sm shadow-sm dark:bg-gray-800">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Time
              </label>
              <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {moment(selected.timestamp).format('Do MMMM YYYY, HH:mm:ss')}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Event
              </span>
              <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    selected.action === 'LOGIN'
                      ? 'bg-green-100 text-green-700'
                      : selected.action === 'LOGOUT'
                      ? 'bg-red-100 text-red-700'
                      : selected.action === 'MODEL CHANGED'
                      ? 'bg-blue-100 text-blue-700'
                      : selected.action === 'ATTACHED FILE'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-gray-100 text-gray-700'
                  )}
                >
                  {selected.action}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Email
              </span>
              <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {selected.email ?? '—'}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Name
              </span>
              <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {selected.name ?? '—'}
              </div>
            </div>
          </div>

          {/* Token Usage / File / Event Details */}
          {selected.tokenUsage ? (
            <div className="rounded-md border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-gray-800">
              {/* Token usage content (same as original) */}
            </div>
          ) : selected.action === 'ATTACHED FILE' ? (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {/* File attachment details content */}
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {/* Generic Event Details */}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
