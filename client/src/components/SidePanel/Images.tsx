export function NoImage() {
  return (
    <div className="border-token-border-medium flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-black">
      <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-4xl"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </div>
  );
}

export const AssistantAvatar = ({
  url,
  progress = 1,
}: {
  url?: string;
  progress: number; // between 0 and 1
}) => {
  const radius = 55; // Radius of the SVG circle
  const circumference = 2 * Math.PI * radius;

  // Calculate the offset based on the loading progress
  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.3s linear',
  };

  return (
    <div>
      <div className="gizmo-shadow-stroke overflow-hidden rounded-full">
        <img
          src={url}
          className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full"
          alt="GPT"
          width="80"
          height="80"
        />
        {progress < 1 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 text-white">
            <svg width="120" height="120" viewBox="0 0 120 120" className="h-6 w-6">
              <circle
                className="origin-[50%_50%] -rotate-90 stroke-gray-400"
                strokeWidth="10"
                fill="transparent"
                r="55"
                cx="60"
                cy="60"
              />
              <circle
                className="origin-[50%_50%] -rotate-90 transition-[stroke-dashoffset]"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={offset}
                fill="transparent"
                r="55"
                cx="60"
                cy="60"
                style={circleCSSProperties}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
