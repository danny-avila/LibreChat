/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { Link } from 'react-router-dom';
import type { SetterOrUpdater } from 'recoil';

/**
 * Splash page that introduces the agents feature to users.
 */
export default function AgentPanelSplash({
  setShowSplashPage,
}: {
  setShowSplashPage: SetterOrUpdater<boolean>;
}) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex min-h-full flex-col">
        {/* Adds top spacing */}
        <div className="flex-1" />

        {/* Splash info */}
        <div className="flex flex-col gap-4 p-1">
          <h1 className="text-xl font-bold">Meet the agent builder</h1>

          <p className="text-md text-text-primary">
            The agent builder lets you create agents designed around specific tasks and workflows.{' '}
            <Link
              to="https://www.youtube.com/watch?v=XmghIAbRx14"
              className="text-md font-semibold text-jersey-button underline hover:decoration-2"
              target="_blank"
              rel="noreferrer"
              aria-label="Watch the tutorial (opens new page to video)"
            >
              Watch the tutorial
            </Link>{' '}
            or read the agent guide before you dive in.
          </p>

          <Link
            to="nj/agent-guide"
            className="text-md font-semibold text-jersey-button underline hover:decoration-2"
          >
            Read the agent guide
          </Link>

          <button
            onClick={() => setShowSplashPage(false)}
            className="text-md w-full rounded bg-jersey-button py-3 font-semibold text-white hover:bg-jersey-button-hover"
          >
            Build your first agent
          </button>
        </div>

        {/* Adds bottom spacing */}
        <div className="flex-[2]" />
      </div>
    </div>
  );
}
