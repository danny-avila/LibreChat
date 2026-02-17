import React, { useState } from 'react';
import { X, CheckCircle, Loader2, Mail } from 'lucide-react';
import { useApproveReport } from '~/data-provider/audit-queries';

interface ApprovalModalProps {
  sessionId: string;
  userEmail: string;
  userName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Approval Modal Component
 * Modal for approving audit reports with optional message
 */
export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  sessionId,
  userEmail,
  userName,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [message, setMessage] = useState('');
  const approveMutation = useApproveReport();

  if (!isOpen) return null;

  const handleApprove = async () => {
    try {
      const result = await approveMutation.mutateAsync({
        sessionId,
        data: { message: message.trim() || undefined },
      });

      if (result.success) {
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      // Error is handled by mutation
      console.error('Approval failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Approve Report
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Send report to {userName || userEmail}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={approveMutation.isPending}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {/* Recipient Info */}
          <div className="mb-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <div className="flex items-start space-x-3">
              <Mail className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Email will be sent to:
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">{userEmail}</p>
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  The email will include the approved report as a PDF attachment.
                </p>
              </div>
            </div>
          </div>

          {/* Message Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Optional Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Add a personal message to include in the email (optional)..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              disabled={approveMutation.isPending}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {message.length} / 500 characters
            </p>
          </div>

          {/* Error Display */}
          {approveMutation.isError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                Failed to approve report
              </p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {approveMutation.error?.message || 'An unexpected error occurred'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={approveMutation.isPending}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={approveMutation.isPending || message.length > 500}
            className="flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-600"
          >
            {approveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Approve & Send Email</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApprovalModal;
