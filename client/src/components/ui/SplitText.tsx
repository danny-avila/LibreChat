import { useSprings, animated, SpringConfig } from '@react-spring/web';
import { useEffect, useRef, useState } from 'react';

interface SplitTextProps {
  text?: string;
  className?: string;
  delay?: number;
  animationFrom?: { opacity: number; transform: string };
  animationTo?: { opacity: number; transform: string };
  easing?: SpringConfig['easing'];
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  onLetterAnimationComplete?: () => void;
  onLineCountChange?: (lineCount: number) => void;
}

const splitGraphemes = (text: string): string[] => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = segmenter.segment(text);
    return Array.from(segments).map((s) => s.segment);
  } else {
    // Fallback for browsers without Intl.Segmenter
    return [...text];
  }
};

const SplitText: React.FC<SplitTextProps> = ({
  text = '',
  className = '',
  delay = 100,
  animationFrom = { opacity: 0, transform: 'translate3d(0,40px,0)' },
  animationTo = { opacity: 1, transform: 'translate3d(0,0,0)' },
  easing = (t: number) => t,
  threshold = 0.1,
  rootMargin = '-100px',
  textAlign = 'center',
  onLetterAnimationComplete,
  onLineCountChange,
}) => {
  const words = text.split(' ').map(splitGraphemes);
  const letters = words.flat();
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const animatedCount = useRef(0);

  const springs = useSprings(
    letters.length,
    letters.map((_, i) => ({
      from: animationFrom,
      to: inView
        ? async (next: (props: any) => Promise<void>) => {
            await next(animationTo);
            animatedCount.current += 1;
            if (animatedCount.current === letters.length && onLetterAnimationComplete) {
              onLetterAnimationComplete();
            }
          }
        : animationFrom,
      delay: i * delay,
      config: { easing },
    })),
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold, rootMargin },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  useEffect(() => {
    if (ref.current && inView) {
      const element = ref.current;
      setTimeout(() => {
        const lineHeight =
          parseInt(getComputedStyle(element).lineHeight) ||
          parseInt(getComputedStyle(element).fontSize) * 1.2;
        const height = element.offsetHeight;
        const lines = Math.round(height / lineHeight);

        if (onLineCountChange) {
          onLineCountChange(lines);
        }
      }, 100);
    }
  }, [inView, text, onLineCountChange]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <p
        ref={ref}
        className={`split-parent inline overflow-hidden ${className}`}
        style={{ textAlign, whiteSpace: 'normal', wordWrap: 'break-word' }}
        aria-hidden="true"
      >
        {words.map((word, wordIndex) => (
          <span key={wordIndex} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {word.map((letter, letterIndex) => {
              const index =
                words.slice(0, wordIndex).reduce((acc, w) => acc + w.length, 0) + letterIndex;

              return (
                <animated.span
                  key={index}
                  style={springs[index] as unknown as React.CSSProperties}
                  className="inline-block transform transition-opacity will-change-transform"
                >
                  {letter}
                </animated.span>
              );
            })}
            {wordIndex < words.length - 1 && (
              <span style={{ display: 'inline-block', width: '0.3em' }}>&nbsp;</span>
            )}
          </span>
        ))}
      </p>
    </>
  );
};

export default SplitText;
