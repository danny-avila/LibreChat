import React, { useState, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import postComposerState from '~/store/postComposer';
import { useSocialAccounts } from '~/hooks/useSocialAccounts';

interface PostComposerProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
}

interface SelectedAccount {
  id: string;
  platform: string;
  username: string;
}

export default function PostComposer({ isOpen, onClose, initialContent = '' }: PostComposerProps) {
  const { accounts, loading, createPost } = useSocialAccounts();
  const [composerState, setComposerState] = useRecoilState(postComposerState);
  const [content, setContent] = useState(initialContent);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Update content when initialContent or composerState changes
  useEffect(() => {
    if (composerState.initialContent) {
      setContent(composerState.initialContent);
    } else if (initialContent) {
      setContent(initialContent);
    }
  }, [initialContent, composerState.initialContent]);

  // Use composerState.isOpen if provided, otherwise use isOpen prop
  const isModalOpen = composerState.isOpen || isOpen;

  const handleClose = () => {
    // Reset composer state
    setComposerState({ isOpen: false, initialContent: '' });
    setContent('');
    setSelectedAccounts([]);
    setError(null);
    setSuccess(false);
    // Call parent onClose if provided
    if (onClose) onClose();
  };

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  };

  const handlePost = async () => {
    if (!content.trim()) {
      setError('Post content cannot be empty');
      return;
    }

    if (selectedAccounts.length === 0) {
      setError('Please select at least one account');
      return;
    }

    setPosting(true);
    setError(null);

    try {
      // Get selected platforms
      const platforms = accounts
        .filter((acc) => selectedAccounts.includes(acc._id))
        .map((acc) => acc.platform);

      await createPost({
        content,
        platforms,
      });

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const getCharacterLimit = (platform: string): number => {
    const limits: Record<string, number> = {
      twitter: 280,
      x: 280,
      linkedin: 3000,
      facebook: 63206,
      instagram: 2200,
    };
    return limits[platform.toLowerCase()] || 5000;
  };

  const getMinCharacterLimit = (): number => {
    if (selectedAccounts.length === 0) return 5000;
    
    const selectedPlatforms = accounts
      .filter((acc) => selectedAccounts.includes(acc._id))
      .map((acc) => acc.platform);

    return Math.min(...selectedPlatforms.map(getCharacterLimit));
  };

  const characterLimit = getMinCharacterLimit();
  const remainingChars = characterLimit - content.length;
  const isOverLimit = remainingChars < 0;

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Share to Social Media
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 rounded-lg bg-green-100 p-4 text-green-800 dark:bg-green-900 dark:text-green-200">
            Post published successfully!
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Content Editor */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Post Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`w-full rounded-lg border p-3 focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-white ${
              isOverLimit
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500 dark:border-gray-600'
            }`}
            rows={6}
            placeholder="What's on your mind?"
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span
              className={`${
                isOverLimit ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {remainingChars} characters remaining
            </span>
            {selectedAccounts.length > 0 && (
              <span className="text-gray-500 dark:text-gray-400">
                Limit: {characterLimit} chars
              </span>
            )}
          </div>
        </div>

        {/* Account Selection */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Select Accounts
          </label>
          {loading ? (
            <div className="text-gray-500 dark:text-gray-400">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg bg-yellow-100 p-4 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              No social accounts connected. Please connect accounts in Settings first.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <label
                  key={account._id}
                  className="flex cursor-pointer items-center rounded-lg border border-gray-300 p-3 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(account._id)}
                    onChange={() => handleAccountToggle(account._id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="ml-3 flex items-center">
                    <span className="font-medium capitalize text-gray-900 dark:text-white">
                      {account.platform}
                    </span>
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      @{account.accountName}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            disabled={posting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handlePost}
            disabled={posting || isOverLimit || accounts.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {posting ? 'Posting...' : 'Post Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
