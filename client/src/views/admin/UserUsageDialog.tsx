import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { useQuery } from '@tanstack/react-query';
import { request, QueryKeys } from 'librechat-data-provider';
import moment from 'moment';

interface AdminUser {
  _id: string;
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  createdAt?: string;
}

export const UserUsageDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  invalidate: (from?: string, to?: string) => void;
}> = ({ open, onOpenChange, user, invalidate }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl border-2 border-indigo-100 bg-white shadow-lg dark:border-indigo-900 dark:bg-gray-800 rounded-lg p-0 flex flex-col"
        style={{ maxHeight: 'calc(90vh - 40px)' }}
      >
        {/* Header */}
        <DialogHeader className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-700">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 p-1.5 dark:bg-indigo-900">
              <svg
                className="h-5 w-5 text-indigo-600 dark:text-indigo-300"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </span>

            {/* Title & user info */}
            <div className="flex flex-col">
              <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Usage Statistics
              </span>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">
                {user?.email || user?.username}
              </span>
              {user?.createdAt && (
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Joined {moment(user.createdAt).format('MMMM Do YYYY, h:mm:ss a')}
                </span>
              )}
            </div>
          </div>

          {/* Close Button */}
          {/* <DialogClose className="ml-4 mt-1.5">
            <XIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </DialogClose> */}
        </DialogHeader>

        {/* Content */}
        {user ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto p-5 space-y-4">
            {/* Filter Section */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-750 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <svg
                  className="h-4 w-4 text-indigo-600 dark:text-indigo-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Date Range Filter
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">From</label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 rounded-md border border-gray-300 px-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">To</label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 rounded-md border border-gray-300 px-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => invalidate(from, to)}
                  className="mt-auto h-9 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                >
                  Apply Filter
                </Button>
              </div>
            </div>

            {/* Usage Data */}
            <UserUsage userId={user._id} from={from} to={to} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="rounded-full bg-gray-100 p-5 dark:bg-gray-700">
              <svg
                className="h-12 w-12 text-gray-400 dark:text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <span className="text-sm font-medium">No user selected</span>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-indigo-50 px-5 py-2 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};


import { X as XIcon } from 'lucide-react';


// Subcomponent
const UserUsage = ({ userId, from, to }: { userId: string; from?: string; to?: string }) => {
  const { data, isFetching } = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'usage', userId, from, to],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (from) q.set('from', `${from}T00:00:00.000Z`);
      if (to) q.set('to', `${to}T23:59:59.999Z`);
      return await request.get(
        `/api/admin/users/${userId}/usage${q.toString() ? `?${q.toString()}` : ''}`,
      );
    },
  });

  const byModel = (data as any)?.byModel ?? [];
  const totals = (data as any)?.totals ?? { promptTokens: 0, completionTokens: 0, tokenValue: 0 };
  const maxTokens = byModel.reduce((m: number, r: any) => Math.max(m, r.totalTokens || 0), 0);

  const getModelColors = (modelName: string) => {
    const lowerName = modelName.toLowerCase();
    if (lowerName.includes('gemini')) {
      return {
        bg: 'bg-blue-500',
        border: 'border-blue-400',
        light: 'bg-blue-50 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-300',
      };
    } else if (lowerName.includes('gpt-4')) {
      return {
        bg: 'bg-emerald-500',
        border: 'border-emerald-400',
        light: 'bg-emerald-50 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-300',
      };
    } else if (lowerName.includes('gpt-3')) {
      return {
        bg: 'bg-green-500',
        border: 'border-green-400',
        light: 'bg-green-50 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-300',
      };
    } else if (lowerName.includes('claude')) {
      return {
        bg: 'bg-purple-500',
        border: 'border-purple-400',
        light: 'bg-purple-50 dark:bg-purple-900/30',
        text: 'text-purple-700 dark:text-purple-300',
      };
    } else {
      return {
        bg: 'bg-gray-500',
        border: 'border-gray-400',
        light: 'bg-gray-50 dark:bg-gray-700',
        text: 'text-gray-700 dark:text-gray-300',
      };
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {isFetching && (
        <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-6 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-900/10 dark:text-indigo-300">
          <div className="relative h-12 w-12">
            <div className="absolute h-12 w-12 animate-ping rounded-full bg-indigo-400 opacity-20"></div>
            <svg className="relative h-12 w-12 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <div className="mt-2 text-sm font-medium">Loading usage statistics...</div>
          <div className="text-xs text-indigo-500 dark:text-indigo-400">
            This may take a moment for users with extensive history
          </div>
        </div>
      )}

      {!isFetching && byModel.length === 0 && (
        <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-6 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <svg
            className="h-12 w-12 text-gray-300 dark:text-gray-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 12V8a2 2 0 00-2-2h-2.95M20 12v4a2 2 0 01-2 2h-8.5M20 12h-5.5M9.5 18H4a2 2 0 01-2-2V6a2 2 0 012-2h4.5"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 10v4M12 10v4"
            />
          </svg>
          <div className="mt-2 text-sm font-medium">No usage data available</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            Try adjusting the date range to see more results
          </div>
        </div>
      )}

      <div className="space-y-3">
        {byModel.map((row: any) => {
          const colors = getModelColors(row.model);
          const percentage = Math.min(100, (row.totalTokens / maxTokens) * 100);

          return (
            <div
              key={row.model}
              className={`rounded-md border ${colors.border} bg-white p-4 shadow-sm dark:bg-gray-800`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${colors.bg}`}></div>
                  <div className="font-medium">{row.model}</div>
                </div>
                <div
                  className={`rounded-full ${colors.light} px-2 py-0.5 text-sm font-medium ${colors.text}`}
                >
                  {row.totalTokens.toLocaleString()} tokens
                </div>
              </div>

              <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className={`h-3 rounded-full ${colors.bg} transition-all duration-500 ease-in-out`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className={`rounded ${colors.light} p-2`}>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Prompt</div>
                  <div className={`font-medium ${colors.text}`}>
                    {row.promptTokens.toLocaleString()}
                  </div>
                </div>
                <div className={`rounded ${colors.light} p-2`}>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Completion</div>
                  <div className={`font-medium ${colors.text}`}>
                    {row.completionTokens.toLocaleString()}
                  </div>
                </div>
                <div className={`rounded ${colors.light} p-2`}>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                  <div className={`font-medium ${colors.text}`}>
                    {row.totalTokens.toLocaleString()}
                  </div>
                </div>
                <div className={`rounded ${colors.light} p-2`}>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Value</div>
                  <div className={`font-medium ${colors.text}`}>
                    {Math.round(row.tokenValue).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {byModel.length > 0 && (
        <div className="mt-4 rounded-md border border-indigo-100 bg-indigo-50 p-4 text-sm shadow-sm dark:border-indigo-900 dark:bg-indigo-900/30">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <div className="font-medium text-indigo-700 dark:text-indigo-300">
              Total Usage Summary
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-white p-2 shadow-sm dark:bg-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">Prompt Tokens</span>
              <div className="text-lg font-medium text-indigo-700 dark:text-indigo-300">
                {totals.promptTokens.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-white p-2 shadow-sm dark:bg-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">Completion Tokens</span>
              <div className="text-lg font-medium text-indigo-700 dark:text-indigo-300">
                {totals.completionTokens.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md bg-white p-2 shadow-sm dark:bg-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total Value</span>
              <div className="text-lg font-medium text-indigo-700 dark:text-indigo-300">
                ${Math.round(totals.tokenValue).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
