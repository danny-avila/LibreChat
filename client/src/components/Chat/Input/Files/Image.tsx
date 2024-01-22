import ProgressCircle from './ProgressCircle';
import RemoveFile from './RemoveFile';

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
            <ProgressCircle
              circumference={circumference}
              offset={offset}
              circleCSSProperties={circleCSSProperties}
            />
          )}
        </div>
      </div>
      <RemoveFile onRemove={onDelete} />
    </div>
  );
};

export default Image;
