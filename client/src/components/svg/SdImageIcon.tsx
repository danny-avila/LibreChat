import { useContext } from 'react';
import { ThemeContext } from '~/hooks';
import { cn } from '~/utils';
export default function SdImageIcon({
  size = 25,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const { theme } = useContext(ThemeContext);

  return (
    <img
      src={theme === 'dark' ? '/assets/image-gallery-dark.png' : '/assets/sdimage.png'}
      alt="sdimage"
      width="20"
      height="20"
    />
  );
}
