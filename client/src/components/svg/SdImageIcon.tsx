/* eslint-disable import/no-cycle */
import { useContext } from 'react';
import { ThemeContext } from '~/hooks';

export default function SdImageIcon() {
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
