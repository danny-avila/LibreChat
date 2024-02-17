import ProgressCircle from './ProgressCircle';
import { cn } from '~/utils';

type styleProps = {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
};

const ImagePreview = ({
  imageBase64,
  url,
  progress = 1,
  className = '',
}: {
  imageBase64?: string;
  url?: string;
  progress?: number; // between 0 and 1
  className?: string;
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
    <div className={cn('h-14 w-14', className)}>
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
  );
};

export default ImagePreview;
