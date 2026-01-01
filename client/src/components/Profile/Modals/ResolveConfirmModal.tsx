import React from 'react';

interface Props {
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
  isProcessing: boolean;
}

export default function ResolveConfirmModal({
  title,
  message,
  onConfirm,
  onClose,
  isProcessing,
}: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="p-6 text-center">
          {/* Ikon Checkmark Hijau */}
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-500">{message}</p>
        </div>

        <div className="flex border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 border-r px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 bg-green-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700"
          >
            {isProcessing ? 'Processing...' : 'Mark Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}
