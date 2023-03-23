import React, { useRef, useEffect, useState } from 'react';

const MessageBar = ({ children, dynamicProps, handleWheel, clickSearchResult }) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(ref.current);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(ref.current);

    return () => {
      observer.unobserve(ref.current);
    };
  }, []);

  return (
    <div
      {...dynamicProps}
      onWheel={handleWheel}
      // onClick={clickSearchResult}

      ref={ref}
    >
      {isVisible ? children : null}
    </div>
  );
};

export default MessageBar;
