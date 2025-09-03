import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { cn } from '~/utils';
import moment from 'moment';
import type { RowLog } from './AdminLogs';

interface AdminLogsDialogProps {
  selected: RowLog | null;
  onClose: () => void;
}

export default function AdminLogsDialog({ selected, onClose }: AdminLogsDialogProps) {
  if (!selected) return null;

  return (
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border border-gray-200 shadow-lg dark:border-gray-700">
        <DialogHeader className="border-b border-gray-100 pb-3 pt-2 dark:border-gray-700">
        <DialogTitle className="flex items-start justify-between text-lg">
            <div className="flex items-start gap-2">
                <span
                className={cn(
                    'rounded-full p-1.5',
                    selected.action === 'LOGIN'
                    ? 'bg-[#DEF2ED] text-[#0A4F53] dark:bg-green-900 dark:text-green-300'
                    : selected.action === 'LOGOUT'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    : selected.action === 'MODEL CHANGED'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : selected.action === 'ATTACHED FILE'
                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                )}
                >
                {selected.action === 'LOGIN' && (
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                    </svg>
                )}
                {selected.action === 'LOGOUT' && (
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                )}
                {selected.action === 'MODEL CHANGED' && (
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                    </svg>
                )}
                {selected.action === 'ATTACHED FILE' && (
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                )}
                {selected.action !== 'LOGIN' &&
                    selected.action !== 'LOGOUT' &&
                    selected.action !== 'MODEL CHANGED' &&
                    selected.action !== 'ATTACHED FILE' && (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    )}
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

          {selected.tokenUsage ? (
                <div className="rounded-md border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-blue-500"
                    >
                      <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z" />
                      <path d="M9 9V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
                      <path d="M13 19v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                      Model Usage Statistics
                    </h3>
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-900/30">
                      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Before Change
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.model ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Tokens:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.totalTokens ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Messages:
                          </span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.messageCount ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-900/30">
                      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        After Change
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.model ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Tokens:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.totalTokens ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Messages:
                          </span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.messageCount ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-gray-50 p-2 dark:bg-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Token Difference:
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        (selected.tokenUsage.tokenDifference || 0) > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                      }`}
                    >
                      {selected.tokenUsage.tokenDifference ?? 0}
                    </span>
                  </div>
                </div>
              ) : selected.action === 'ATTACHED FILE' ? (
                <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-600 dark:text-gray-300"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    File Attachment Details
                  </h3>
                </div>
            
                {/* Enhanced file details display */}
                <div className="space-y-3">
                  {/* File name with icon */}
                  {selected.details?.filename && (
                    <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3 dark:bg-gray-800/50">
                      <div className="flex-shrink-0">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-gray-600 dark:text-gray-300"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {selected.details.filename}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Primary file
                        </div>
                      </div>
                    </div>
                  )}
            
                  {/* File properties table */}
                  <div className="overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {selected.details?.type && (
                          <tr className="bg-white dark:bg-gray-900">
                            <td className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                              File Type
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                                {selected.details.type}
                              </span>
                            </td>
                          </tr>
                        )}
                        {selected.details?.size && (
                          <tr className="bg-gray-50/50 dark:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                              File Size
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {(selected.details.size / 1024).toFixed(1)} KB
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({selected.details.size.toLocaleString()} bytes)
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {selected.details?.context && (
                          <tr className="bg-white dark:bg-gray-900">
                            <td className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                              Context
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              <span className="capitalize">
                                {selected.details.context.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        )}
                        {/* Display other properties if they exist */}
                        {Object.entries(selected.details || {})
                          .filter(
                            ([key]) => !['filename', 'type', 'size', 'context'].includes(key),
                          )
                          .map(([key, value], index) => (
                            <tr
                              key={key}
                              className={
                                index % 2 === 0
                                  ? 'bg-gray-50/50 dark:bg-gray-800/50'
                                  : 'bg-white dark:bg-gray-900'
                              }
                            >
                              <td className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                                <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
            
                  {/* Summary card */}
                  <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800/50">
                    <div className="flex items-start gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 flex-shrink-0 text-gray-500 dark:text-gray-400"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      <div className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-medium">File attached</span> to the conversation as a{' '}
                        {selected.details?.context?.replace(/_/g, ' ') || 'message attachment'}.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Event Details
                    </h3>
                  </div>

                  {/* Check if details are empty or null for LOGIN/LOGOUT events */}
                  {(selected.action === 'LOGIN' || selected.action === 'LOGOUT') &&
                  (!selected.details || Object.keys(selected.details).length === 0) ? (
                    <div className="flex items-center justify-center rounded-md bg-gray-50 p-6 dark:bg-gray-700">
                      <div className="text-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mx-auto mb-2 text-gray-400 dark:text-gray-500"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {selected.action === 'LOGIN'
                            ? 'User successfully logged in. No additional details available.'
                            : 'User successfully logged out. No additional details available.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-700">
                      {JSON.stringify(selected.details ?? {}, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          
        </DialogContent>
      </Dialog>
  );
}
