export default function StopButton({ stop, setShowStopButton }) {
  return (
    <div className="absolute bottom-0 right-2 top-0 p-1 md:right-3 md:p-2">
      <div className="flex h-full">
        <div className="flex h-full flex-row items-center justify-center gap-3">
          <button
            type="button"
            className="border-gizmo-gray-950 rounded-full border-2 p-1 dark:border-gray-200"
            aria-label="Stop generating"
            onClick={(e) => {
              setShowStopButton(false);
              stop(e);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="text-gizmo-gray-950 h-2 w-2 dark:text-gray-200"
              height="16"
              width="16"
            >
              <path
                d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2z"
                strokeWidth="0"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
