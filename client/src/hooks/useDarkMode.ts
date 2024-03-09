import { useEffect, useState } from 'react';

export const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(checkDarkMode());

  function checkDarkMode() {
    return document.getElementsByTagName('html')[0].classList.contains('dark');
  }

  useEffect(() => {
    setIsDarkMode(checkDarkMode);
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(checkDarkMode());
        }
      });
    });

    mutationObserver.observe(document.getElementsByTagName('html')[0], { attributes: true });

    return () => {
      mutationObserver.disconnect();
    };
  }, []);

  return isDarkMode;
};
