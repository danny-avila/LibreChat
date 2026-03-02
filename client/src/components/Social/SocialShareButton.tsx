import React, { useState } from 'react';
import PostComposer from './PostComposer';

export default function SocialShareButton() {
  const [isOpen, setIsOpen] = useState(false);

  // Check if social media feature is enabled
  const isSocialMediaEnabled = import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true';

  if (!isSocialMediaEnabled) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
        title="Share to Social Media"
        aria-label="Share to Social Media"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </button>

      <PostComposer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
