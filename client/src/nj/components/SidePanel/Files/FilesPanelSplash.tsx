/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { Link } from 'react-router-dom';
import type { SetterOrUpdater } from 'recoil';
import FileSplashIcon from '~/nj/components/SidePanel/Files/FileSplashIcon';

/**
 * Splash page that introduces the files library to users.
 */
export default function FilesPanelSplash({
  setShowSplashPage,
}: {
  setShowSplashPage: SetterOrUpdater<boolean>;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col">
        {/* Adds top spacing */}
        <div className="flex-1" />

        {/* Splash info */}
        <div className="flex flex-col gap-4 p-1">
          <FileSplashIcon />

          <h1 className="text-xl font-bold">Your personal file library</h1>

          <p className="text-md text-text-primary">
            Files you&apos;ve uploaded to any conversation will appear here automatically, ready to
            reuse anytime — no need to upload the same document twice. Your files are visible only
            to you and can&apos;t be shared with others.
          </p>

          <Link
            to="nj/release-notes"
            className="text-md font-semibold text-jersey-button underline hover:decoration-2"
          >
            Read the release notes
          </Link>

          <button
            onClick={() => setShowSplashPage(false)}
            className="text-md w-full rounded bg-jersey-button py-3 font-semibold text-white hover:bg-jersey-button-hover"
          >
            Go to your files
          </button>
        </div>

        {/* Adds bottom spacing */}
        <div className="flex-[2]" />
      </div>
    </div>
  );
}
