type styleProps = {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
};

const Image = ({
  imageBase64,
  url,
  onDelete,
  progress = 1,
}: {
  imageBase64?: string;
  url?: string;
  onDelete: () => void;
  progress: number; // between 0 and 1
}) => {
  let style: styleProps = {
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
  if (imageBase64) {
    style = {
      ...style,
      backgroundImage: `url(${imageBase64})`,
    };
  } else if (url) {
    style = {
      ...style,
      backgroundImage: `url(${url})`,
    };
  }

  if (!style.backgroundImage) {
    return null;
  }

  const radius = 55; // Radius of the SVG circle
  const circumference = 2 * Math.PI * radius;

  // Calculate the offset based on the loading progress
  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.3s linear',
  };

  return (
    <div className="group relative inline-block text-sm text-black/70 dark:text-white/90">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600">
        <div className="h-14 w-14">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded="false"
            className="h-full w-full"
            style={style}
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
      <button
        type="button"
        className="absolute right-1 top-1 -translate-y-1/2 translate-x-1/2 rounded-full border border-white bg-gray-500 p-0.5 text-white transition-colors hover:bg-black hover:opacity-100 group-hover:opacity-100 md:opacity-0"
        onClick={onDelete}
      >
        <span>
          <svg
            stroke="currentColor"
            fill="none"
            strokeWidth="2"
            viewBox="0 0 24 24"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="icon-sm"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </span>
      </button>
    </div>
  );
};

export default Image;
